<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Services;

use ContentReactor\Dynex\Events\DefineElementAttributesEvent;
use ContentReactor\Dynex\Models\FieldConfig;
use Craft;
use craft\base\{
	Component,
	ElementInterface,
};
use craft\elements\{
	Asset,
	Category,
	Entry,
	Tag,
	User,
};
use craft\enums\CmsEdition;
use craft\helpers\StringHelper;
use MarcusGaius\FieldValueParser\FieldValueParser;
use MarcusGaius\FieldValueParser\Models\ElementAttribute;

/**
 * The native element attributes the exporter offers alongside fields: the values Craft shows in element index
 * columns and edit page sidebars, such as an entry’s authors and post date, or an asset’s URL and alt text.
 *
 * They're Field Value Parser's attributes, as the exporter shows them: only the ones the Craft edition and sites
 * have a use for, and the names of sections, groups and the like rather than their handles.
 */
class Attributes extends Component
{
	public const EVENT_DEFINE_ATTRIBUTES = 'defineAttributes';

	/**
	 * Attributes only offered where Craft has more than one user (Team and up), or user groups (Pro and up)
	 */
	private const TEAM_ATTRIBUTES = ['authors', 'authorIds', 'uploader'];
	private const PRO_ATTRIBUTES = ['groups'];

	/**
	 * Attribute definitions per element type.
	 * (Not `$attributes`/`getAttributes()`: craft\base\Component extends yii\base\Model, which has those.)
	 *
	 * @var array<string, array<string, ElementAttribute>>
	 */
	private array $definitions = [];

	/**
	 * @param class-string<ElementInterface> $elementType
	 * @return array<string, ElementAttribute> Keyed by handle
	 */
	public function getDefinitions(string $elementType): array
	{
		if (!isset($this->definitions[$elementType])) {
			$attributes = array_filter(
				FieldValueParser::getInstance()->getAttributes()->getDefinitions($elementType),
				fn(ElementAttribute $attribute): bool => $this->isOffered($attribute->handle),
			);

			if ($this->hasEventHandlers(self::EVENT_DEFINE_ATTRIBUTES)) {
				$event = new DefineElementAttributesEvent([
					'elementType' => $elementType,
					'attributes' => $attributes,
				]);
				$this->trigger(self::EVENT_DEFINE_ATTRIBUTES, $event);
				$attributes = $event->attributes;
			}

			$this->definitions[$elementType] = $attributes;
		}

		return $this->definitions[$elementType];
	}

	/**
	 * Returns an element type’s attributes as field configs for the exporter layout designer.
	 *
	 * @param class-string<ElementInterface> $elementType
	 * @return FieldConfig[]
	 */
	public function getFieldConfigs(string $elementType): array
	{
		return array_values(array_map(fn(ElementAttribute $attribute): FieldConfig => new FieldConfig([
			'type' => FieldConfig::TYPE_ATTRIBUTE,
			'className' => null,
			'label' => $attribute->label,
			'defaultLabel' => $attribute->label,
			'handle' => $attribute->handle,
			'nested' => null,
			'fieldId' => null,
			'uid' => StringHelper::UUID(),
			'isComplexField' => $attribute->relatedElementType !== null,
			'isBlockField' => false,
			'relatedElementType' => $attribute->relatedElementType,
		]), $this->getDefinitions($elementType)));
	}

	/**
	 * Returns an attribute’s value for an element, the way an export shows it.
	 *
	 * Attributes naming a section, group, volume or site are exported with its name. Anything else is read through
	 * Field Value Parser, and anything the element doesn’t have returns an empty string.
	 */
	public function getValue(ElementInterface $element, string $handle): mixed
	{
		// Attributes added or replaced through the event read their own values
		$attribute = $this->getDefinitions($element::class)[$handle] ?? null;
		$parserAttribute = FieldValueParser::getInstance()->getAttributes()->getDefinition($element::class, $handle);
		if ($attribute !== null && $attribute !== $parserAttribute && $attribute->value !== null) {
			return ($attribute->value)($element);
		}

		$name = $this->getName($element, $handle);
		if ($name !== null) return $name;

		return FieldValueParser::getInstance()->getAttributes()->getValue($element, $handle) ?? '';
	}

	private function isOffered(string $handle): bool
	{
		$edition = Craft::$app->getEdition();

		return match (true) {
			in_array($handle, self::TEAM_ATTRIBUTES, true) => $edition >= CmsEdition::Team->value,
			in_array($handle, self::PRO_ATTRIBUTES, true) => $edition >= CmsEdition::Pro->value,
			// Single site installs have nothing to tell apart
			$handle === 'site' => Craft::$app->getIsMultiSite(),
			default => true,
		};
	}

	/**
	 * The name of what an attribute refers to, for the attributes Field Value Parser reads as handles
	 */
	private function getName(ElementInterface $element, string $handle): ?string
	{
		return match (true) {
			// Entries nested in a Matrix field have no section
			$element instanceof Entry && $handle === 'section' => (string)$element->getSection()?->name,
			$element instanceof Entry && $handle === 'type' => (string)$element->getType()->name,
			($element instanceof Category || $element instanceof Tag) && $handle === 'group' => (string)$element->getGroup()->name,
			$element instanceof Asset && $handle === 'volume' => (string)$element->getVolume()->name,
			$element instanceof User && $handle === 'groups' => implode(', ', array_map(fn($group): string => (string)$group->name, $element->getGroups())),
			$handle === 'site' => $element->getSite()->getName(),
			default => null,
		};
	}
}
