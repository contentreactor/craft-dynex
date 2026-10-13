<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Models;

use Closure;
use ContentReactor\Dynex\Attributes\FromJsonObject;
use ContentReactor\Dynex\Helpers\ReflectionHelper;
use Craft;
use craft\base\{
	ElementInterface,
	FieldInterface,
	Model,
};
use craft\fields\{
	BaseOptionsField,
	BaseRelationField,
	Date as DateField,
	Lightswitch as LightswitchField,
};
use craft\helpers\{
	ArrayHelper,
	Cp,
	Html,
};
use DateTime;

class FieldConfig extends Model
{
	public const TYPE_ATTRIBUTE = 'attribute';
	public const TYPE_CALLABLE = 'callable';
	public const TYPE_FIELD = 'field';
	public const TYPE_NESTED = 'nested';

	/** Related elements by their IDs, UIDs, URLs or slugs, instead of their default values, e.g. entries' titles */
	public const FORMAT_ID = 'id';
	public const FORMAT_UID = 'uid';
	public const FORMAT_URL = 'url';
	public const FORMAT_SLUG = 'slug';
	/** Options fields' options by their labels instead of their values */
	public const FORMAT_LABEL = 'label';
	/** Switches as Yes/No, or true/false, instead of 1/0 */
	public const FORMAT_YES_NO = 'yesNo';
	public const FORMAT_TRUE_FALSE = 'trueFalse';
	/** The date formats offered, besides ISO 8601 */
	public const DATE_FORMATS = ['Y-m-d', 'Y-m-d H:i', 'd.m.Y', 'd.m.Y H:i', 'd/m/Y', 'm/d/Y', 'U'];

	/** Attributes holding dates, whose values can't tell their type when they're empty */
	private const DATE_ATTRIBUTES = ['postDate', 'expiryDate', 'dateCreated', 'dateUpdated', 'dateModified', 'lastLoginDate'];
	private const BOOLEAN_ATTRIBUTES = ['enabled', 'admin'];

	/** @var 'field'|'attribute'|'callable'|'nested' */
	public string $type;
	/** @var null|class-string<FieldInterface> */
	public ?string $className = null;
	public ?string $label = null;
	public string $defaultLabel;
	/**
	 * The field handle. On the root of a nesting chain, this is the full path in eager-loading notation,
	 * e.g. `matrixField.blockTypeHandle:relationField.fieldHandle`.
	 */
	public string|Closure $handle;
	public bool $isComplexField = false;
	public bool $isBlockField = false;
	#[FromJsonObject(FieldConfig::class)]
	public ?FieldConfig $nested = null;
	public ?int $fieldId = null;
	/**
	 * The handle of the block type this field belongs to (a Matrix entry type or a Neo block type), when it’s nested
	 * inside a block field. Content Block fields have no block types.
	 */
	public ?string $blockType = null;
	/**
	 * For attributes holding other elements (e.g. an entry’s authors), the element type they expand into.
	 *
	 * @var class-string<ElementInterface>|null
	 */
	public ?string $relatedElementType = null;
	/**
	 * How the column shows the values it exports for reading, e.g. a date format, or related elements' IDs. `null` shows them
	 * the default way. Set on the root of a nesting chain, for the value at its end.
	 */
	public ?string $format = null;
	public string $uid;

	/**
	 * @param array<string, mixed> $config
	 */
	public function __construct(array $config = [])
	{
		// Nested configs can arrive as arrays, which the typed property won't accept, so ReflectionHelper maps them
		$nested = $config['nested'] ?? null;
		unset($config['nested']);

		parent::__construct($config);

		ReflectionHelper::map($this, ['nested' => $nested] + $config);
	}

	/**
	 * @param FieldConfig|array<string, mixed> $nested
	 */
	public function setNested(FieldConfig|array $nested): void
	{
		if (empty($nested)) {
			$this->nested = null;
			return;
		}

		if (is_array($nested)) {
			$nested = new FieldConfig($nested);
		}
		$this->nested = $nested;
	}

	public function setComplexField(bool $value): void
	{
		$this->isComplexField = $value;
	}

	public function setBlockField(bool $value): void
	{
		$this->isBlockField = $value;
	}

	/**
	 * Returns the selector HTML that should be displayed within field layout designers.
	 *
	 * @return string
	 */
	public function selectorHtml(): string
	{
		return Html::tag('div', $this->selectorInnerHtml(), $this->selectorAttributes());
	}

	/**
	 * Returns HTML attributes that should be added to the selector container.
	 *
	 * @return array<string, mixed>
	 */
	protected function selectorAttributes(): array
	{
		$attr = [
			'class' => 'fld-field',
			'data' => [
				'handle' => $this->handle,
			],
		];

		if ($this->fieldId !== null) {
			$attr = ArrayHelper::merge($attr, [
				'data' => [
					'id' => $this->fieldId,
				],
			]);
		}

		return $attr;
	}

	/**
	 * Returns the selector’s inner HTML.
	 *
	 * @return string
	 */
	protected function selectorInnerHtml(): string
	{
		$innerHtml = '';

		$label = Html::encode($this->label);
		$innerHtml .= Html::tag(
			'div',
			Html::tag('h4', $label, ['title' => $label]),
			['class' => 'fld-element-label'],
		);

		$innerHtml .= Html::tag(
			'div',
			Html::tag('div', $this->handle, [
				'class' => ['smalltext', 'light', 'code'],
				'title' => $this->handle,
			]),
			['class' => 'fld-attribute']
		);

		$customIconHtml = '';

		// The field this selector adds is the end of the nesting chain, so that's what decides the controls
		if ($this->getIsComplexField()) {
			$customIcon = Html::svg(
				'<svg width="19" height="16" viewBox="0 0 19 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M3.375 1.5H6.875L9.5 4.125H15.625C16.0891 4.125 16.5342 4.30937 16.8624 4.63756C17.1906 4.96575 17.375 5.41087 17.375 5.875V12.875C17.375 13.3391 17.1906 13.7842 16.8624 14.1124C16.5342 14.4406 16.0891 14.625 15.625 14.625H3.375C2.91087 14.625 2.46575 14.4406 2.13756 14.1124C1.80937 13.7842 1.625 13.3391 1.625 12.875V3.25C1.625 2.78587 1.80937 2.34075 2.13756 2.01256C2.46575 1.68437 2.91087 1.5 3.375 1.5Z" stroke="#A3B2C0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>'
			);

			$customIconHtml = Html::tag('div', $customIcon, [
				'class' => 'icon-holder',
			]);
		}

		return (!$this->getIsBlockField() ? Html::tag('div', '&laquo;', [
				'class' => ['add-element', 'push-element'],
			]) : '') . // left arrows to add without dragging
			Html::tag('div', $innerHtml, [
				'class' => ['field-name'],
			]) .
			Html::tag('div', '&raquo;', [
				'class' => ['remove-element', 'push-element'],
			]) . // right arrows to remove without dragging
			$customIconHtml;
	}

	/**
	 * @return string[]
	 */
	public function keywords(): array
	{
		return array_values(array_filter([
			$this->label,
			$this->defaultLabel,
			is_string($this->handle) ? $this->handle : null,
			$this->getIsComplexField() ? 'complex' : null,
		]));
	}

	/**
	 * The settings shown in the element’s slideout in the exporter layout designer.
	 *
	 * The label becomes the column heading in the exported file, so fields sharing a label (e.g. several
	 * “Title” fields) can be told apart. A blank label falls back to the default label.
	 */
	public function getSettingsHtml(): string
	{
		$html = Cp::textFieldHtml([
			'label' => Craft::t('app', 'Label'),
			'instructions' => Craft::t('dynex', 'The column heading in the exported file. Leave blank to use the default.'),
			'id' => 'label',
			'name' => 'label',
			'value' => $this->label !== $this->defaultLabel ? $this->label : '',
			'placeholder' => $this->defaultLabel,
		]);

		$formats = $this->getFormatOptions();
		if ($formats !== []) {
			$html .= Cp::selectFieldHtml([
				'label' => Craft::t('dynex', 'Format'),
				'instructions' => Craft::t('dynex', 'How the column shows its values. Importable exporters export the values they import in their own format.'),
				'id' => 'format',
				'name' => 'format',
				'options' => $formats,
				'value' => $this->format ?? '',
			]);
		}

		return $html;
	}

	/**
	 * The formats the value at the end of the nesting chain can be shown in, with the default way first
	 *
	 * @return array<int, array{label: string, value: string}>
	 */
	public function getFormatOptions(): array
	{
		$leaf = $this->getLeaf();
		$className = (string)$leaf->className;
		$handle = is_string($leaf->handle) ? $leaf->handle : '';
		$default = ['label' => Craft::t('dynex', 'Default'), 'value' => ''];

		return match (true) {
			is_subclass_of($className, BaseRelationField::class), $leaf->type === self::TYPE_ATTRIBUTE && $leaf->relatedElementType !== null => [
				$default,
				['label' => Craft::t('app', 'ID'), 'value' => self::FORMAT_ID],
				['label' => Craft::t('app', 'UID'), 'value' => self::FORMAT_UID],
				['label' => Craft::t('app', 'URL'), 'value' => self::FORMAT_URL],
				['label' => Craft::t('app', 'Slug'), 'value' => self::FORMAT_SLUG],
			],
			is_a($className, DateField::class, true), $leaf->type === self::TYPE_ATTRIBUTE && in_array($handle, self::DATE_ATTRIBUTES, true) => [
				['label' => Craft::t('dynex', 'ISO 8601 (default)'), 'value' => ''],
				...array_map(fn(string $format): array => [
					'label' => $format === 'U' ? Craft::t('dynex', 'Unix timestamp') : (new DateTime('2026-12-31 18:30'))->format($format),
					'value' => $format,
				], self::DATE_FORMATS),
			],
			is_subclass_of($className, BaseOptionsField::class) => [
				['label' => Craft::t('dynex', 'Values (default)'), 'value' => ''],
				['label' => Craft::t('dynex', 'Labels'), 'value' => self::FORMAT_LABEL],
			],
			is_a($className, LightswitchField::class, true), $leaf->type === self::TYPE_ATTRIBUTE && in_array($handle, self::BOOLEAN_ATTRIBUTES, true) => [
				['label' => '1/0 (' . Craft::t('dynex', 'default') . ')', 'value' => ''],
				['label' => Craft::t('app', 'Yes') . '/' . Craft::t('app', 'No'), 'value' => self::FORMAT_YES_NO],
				['label' => 'true/false', 'value' => self::FORMAT_TRUE_FALSE],
			],
			default => [],
		};
	}

	/**
	 * Whether a column format is one of the date formats offered
	 */
	public static function isDateFormat(?string $format): bool
	{
		return $format !== null && in_array($format, self::DATE_FORMATS, true);
	}

	/**
	 * Appends a child to the end of the nesting chain. Every node that gains a child becomes nested.
	 */
	public function setTraversed(FieldConfig $child): void
	{
		if ($this->nested !== null) {
			$this->nested->setTraversed($child);
			return;
		}

		$this->type = self::TYPE_NESTED;
		$this->nested = $child;
	}

	/**
	 * Clones the whole nesting chain, so changes to a clone never leak into the original.
	 */
	public function __clone()
	{
		if ($this->nested !== null) {
			$this->nested = clone $this->nested;
		}
	}

	/**
	 * Returns the last config in the nesting chain: the field that actually gets exported.
	 */
	public function getLeaf(): FieldConfig
	{
		return $this->nested?->getLeaf() ?? $this;
	}

	public function getIsComplexField(): bool
	{
		return $this->getLeaf()->isComplexField;
	}

	public function getIsBlockField(): bool
	{
		return $this->getLeaf()->isBlockField;
	}

	public function getBaseHandle(): string
	{
		if (!str_contains($this->handle, '.')) return $this->handle;

		return substr($this->handle, 0, stripos($this->handle, '.'));
	}
}