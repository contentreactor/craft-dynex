<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Services;

use benf\neo\elements\Block as NeoBlock;
use Closure;
use ContentReactor\Dynex\Models\FieldConfig;
use Craft;
use craft\base\{
	Component,
	ElementContainerFieldInterface,
	ElementInterface,
	Field,
	FieldInterface,
};
use craft\elements\{
	Address,
	Asset,
	Entry,
};
use craft\events\RegisterComponentTypesEvent;
use craft\fieldlayoutelements\{
	BaseField,
	CustomField,
};
use craft\fields\{
	Addresses as AddressesField,
	ContentBlock as ContentBlockField,
};
use craft\helpers\StringHelper;
use craft\models\FieldLayout;
use Illuminate\Support\Collection;
use InvalidArgumentException;
use MarcusGaius\FieldValueParser\Enums\NodeType;
use MarcusGaius\FieldValueParser\FieldValueParser;
use MarcusGaius\FieldValueParser\Schema\Node;

class Elements extends Component
{
	public const EVENT_DEFINE_BLOCK_FIELD_CRITERIA = 'defineBlockFieldCriteria';
	public const EVENT_DEFINE_COMPLEX_FIELD_CRITERIA = 'defineComplexFieldCriteria';

	/** @var array<string, Node> Fields' nodes by UID */
	private array $nodes = [];

	/**
	 * Callbacks that turn an element into its default export value, keyed by element class.
	 *
	 * @return array<string, Closure>
	 */
	protected function getDefaultElementValues(): array
	{
		return [
			Entry::class => function (Entry $element): string {
				return (string) $element->title;
			},
			Asset::class => function (Asset $element): string {
				return (string) $element->getUrl();
			},
			Address::class => function (Address $element): string {
				return str_ireplace(
					"\n",
					", ",
					Craft::$app->getAddresses()->formatAddress($element, ['html' => false]),
				);
			},
		];
	}

	/**
	 * @template TKey of array-key
	 * @param Collection<TKey, ElementInterface> $elements
	 * @return Collection<TKey, string>
	 */
	public function getDefaultValueForElement(Collection $elements): Collection
	{
		return $elements->map(fn(ElementInterface $element): string => $this->getElementDefaultValue($element));
	}

	public function getElementDefaultValue(ElementInterface $element): string
	{
		$callback = $this->getDefaultElementValues()[$element::class] ?? null;
		if (!$callback) {
			return (string) $element;
		}

		return $callback($element);
	}

	/**
	 * Other field types to treat as block fields, besides the ones Field Value Parser finds nested elements with their own
	 * field layouts in (Matrix, Content Block and Neo fields). Plugins add theirs through [[EVENT_DEFINE_BLOCK_FIELD_CRITERIA]].
	 *
	 * @return class-string<FieldInterface>[]
	 */
	public function getBlockFieldCriteria(): array
	{
		$fields = [];

		if ($this->hasEventHandlers(self::EVENT_DEFINE_BLOCK_FIELD_CRITERIA)) {
			$event = new RegisterComponentTypesEvent([
				'types' => $fields,
			]);
			$this->trigger(self::EVENT_DEFINE_BLOCK_FIELD_CRITERIA, $event);
			$fields = $event->types;
		}

		return $this->filterFieldTypes($fields);
	}

	/**
	 * Block fields hold nested elements with their own field layouts: Matrix, Content Block and Neo fields, as Field Value
	 * Parser finds them, and the types in [[getBlockFieldCriteria()]]. Addresses fields hold nested elements too, but
	 * relate to them like a relation field does.
	 */
	public function isBlockField(FieldInterface $field): bool
	{
		$node = $this->getNode($field);
		if ($node->type === NodeType::NESTED && !$field instanceof AddressesField) {
			return true;
		}

		return $this->matchesAny($field, $this->getBlockFieldCriteria());
	}

	/**
	 * Other field types to treat as complex fields, besides relation fields, fields with nested elements and block fields.
	 * Plugins add theirs through [[EVENT_DEFINE_COMPLEX_FIELD_CRITERIA]].
	 *
	 * @return class-string<FieldInterface>[]
	 */
	public function getComplexFieldCriteria(): array
	{
		$fields = [];

		if ($this->hasEventHandlers(self::EVENT_DEFINE_COMPLEX_FIELD_CRITERIA)) {
			$event = new RegisterComponentTypesEvent([
				'types' => $fields,
			]);
			$this->trigger(self::EVENT_DEFINE_COMPLEX_FIELD_CRITERIA, $event);
			$fields = $event->types;
		}

		return $this->filterFieldTypes($fields);
	}

	/**
	 * Complex fields can be expanded into their nested fields: relation fields, Addresses fields, and block fields.
	 */
	public function isComplexField(FieldInterface $field): bool
	{
		$node = $this->getNode($field);

		return $node->type === NodeType::RELATION
			|| $node->type === NodeType::NESTED
			|| $this->isBlockField($field)
			|| $this->matchesAny($field, $this->getComplexFieldCriteria());
	}

	/**
	 * Returns a block field’s block types, with their field layouts, from the field’s Field Value Parser node: a Matrix
	 * field’s entry types, or a Neo field’s block types. A Content Block field has a single layout and no types,
	 * so its handle is `null`. Other block field types (registered through [[EVENT_DEFINE_BLOCK_FIELD_CRITERIA]]) have none.
	 *
	 * @return array<int, array{handle: string|null, name: string, fieldLayout: FieldLayout}>
	 */
	public function getBlockTypeLayouts(FieldInterface $field): array
	{
		$node = $this->getNode($field);
		if ($node->type !== NodeType::NESTED || !$field instanceof ElementContainerFieldInterface) {
			return [];
		}

		// Nodes only keep plain data, so the names come from the field's providers, which apply its overrides
		$names = [];
		foreach ($field->getFieldLayoutProviders() as $provider) {
			$names[$provider->getHandle()] = property_exists($provider, 'name') ? (string)$provider->name : (string)$provider->getHandle();
		}

		$blockTypes = [];
		foreach ($node->providers as $provider) {
			$fieldLayout = Craft::$app->getFields()->getLayoutById($provider->fieldLayoutId);
			if ($fieldLayout === null) {
				continue;
			}

			$isContentBlock = $field instanceof ContentBlockField;
			$blockTypes[] = [
				'handle' => $isContentBlock ? null : $provider->handle,
				'name' => $isContentBlock ? (string)$field->name : ($names[$provider->handle] ?? (string)$provider->handle),
				'fieldLayout' => $fieldLayout,
			];
		}

		return $blockTypes;
	}

	/**
	 * The field's Field Value Parser node, built once per field and request, as relation fields' nodes query their sources
	 */
	private function getNode(FieldInterface $field): Node
	{
		// Unsaved fields have no UID, and object hashes are reused once objects are gone, so their nodes aren't kept
		if ($field->uid === null) {
			return FieldValueParser::getInstance()->getSchemas()->getFieldNode($field);
		}

		return $this->nodes[$field->uid] ??= FieldValueParser::getInstance()->getSchemas()->getFieldNode($field);
	}

	/**
	 * @param class-string<FieldInterface>[] $types
	 */
	private function matchesAny(FieldInterface $field, array $types): bool
	{
		foreach ($types as $type) {
			if ($field instanceof $type) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Returns the block type handle of a Matrix entry or Neo block, or `null` for other elements.
	 */
	public function getBlockTypeHandle(ElementInterface $element): ?string
	{
		// Entries nested in a Matrix field have a field ID, and their entry type is the block type
		$isBlock = ($element instanceof Entry && $element->fieldId !== null) || (class_exists(NeoBlock::class) && $element instanceof NeoBlock);

		return $isBlock ? FieldValueParser::getInstance()->getValues()->getProviderHandle($element) : null;
	}

	/**
	 * Returns configs for every custom field and native attribute in a field layout.
	 *
	 * @return FieldConfig[]
	 */
	public function getFieldConfigsFromLayout(FieldLayout $fieldLayout): array
	{
		$fieldConfigs = [];
		foreach ($fieldLayout->getTabs() as $tab) {
			foreach ($tab->getElements() as $element) {
				if ($element instanceof BaseField) {
					$fieldConfigs[] = $this->getConfigFromField($element);
				}
			}
		}

		return $fieldConfigs;
	}

	public function getConfigFromField(BaseField $field): FieldConfig
	{
		if ($field instanceof CustomField) {
			// The layout's handle and label overrides are already applied to the field
			$customField = $field->getField();
			if (!$customField instanceof Field) {
				throw new InvalidArgumentException(sprintf('Field %s must extend %s.', $customField::class, Field::class));
			}

			return new FieldConfig([
				'type' => FieldConfig::TYPE_FIELD,
				'className' => $customField::class,
				'label' => $field->label(),
				'defaultLabel' => $customField->name,
				'handle' => $customField->handle,
				'nested' => null,
				'fieldId' => $customField->id,
				// Layouts saved in code can have elements without a UID
				'uid' => $field->uid ?? StringHelper::UUID(),
				'isBlockField' => $this->isBlockField($customField),
				'isComplexField' => $this->isComplexField($customField),
			]);
		}

		return new FieldConfig([
			'type' => FieldConfig::TYPE_ATTRIBUTE,
			'className' => null,
			'label' => $field->label(),
			// BaseField::defaultLabel() is protected; label() falls back to it when no custom label is set
			'defaultLabel' => $field->label() ?? $field->attribute(),
			'handle' => $field->attribute(),
			'nested' => null,
			'fieldId' => null,
			// Layouts saved in code can have elements without a UID
			'uid' => $field->uid ?? StringHelper::UUID(),
			'isBlockField' => false,
			'isComplexField' => false,
		]);
	}

	/**
	 * Drops types that aren't field classes, e.g. ones registered by event handlers.
	 *
	 * @param string[] $types
	 * @return class-string<FieldInterface>[]
	 */
	private function filterFieldTypes(array $types): array
	{
		$fieldTypes = [];
		foreach ($types as $type) {
			if (is_subclass_of($type, FieldInterface::class)) {
				$fieldTypes[] = $type;
			}
		}

		return $fieldTypes;
	}
}
