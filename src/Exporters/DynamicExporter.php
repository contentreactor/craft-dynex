<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Exporters;

use Closure;
use ContentReactor\Dynex\Events\MapFieldEvent;
use ContentReactor\Dynex\Models\{
	Column,
	Exporter,
	FieldConfig,
};
use ContentReactor\Dynex\Plugin;
use ContentReactor\Dynex\Services\Columns;
use Craft;
use craft\base\{
	Element,
	ElementExporter,
	ElementInterface,
	Field,
};
use craft\elements\db\ElementQueryInterface;
use craft\errors\InvalidFieldException;
use craft\fields\{
	BaseOptionsField,
	BaseRelationField,
};
use craft\fields\data\{
	MultiOptionsFieldData,
	OptionData,
	SingleOptionFieldData,
};
use craft\helpers\Json;
use DateTimeInterface;
use Illuminate\Support\Collection;
use MarcusGaius\FieldValueParser\FieldValueParser;
use Stringable;
use yii\base\InvalidConfigException;

class DynamicExporter extends ElementExporter
{
	public const EVENT_BEFORE_MAP_FIELD = 'beforeMapField';
	public const EVENT_AFTER_MAP_FIELD = 'afterMapField';

	public static ?Exporter $exporter = null;

	/** @var Column[]|null The exporter's columns, worked out once per export */
	private ?array $columns = null;

	/** The format of the column being mapped, see [[FieldConfig::$format]] */
	private ?string $format = null;

	public function init(): void
	{
		parent::init();
		self::$exporter ??= Plugin::getInstance()
			->getExporters()
			->getSelectedExporter();
	}

	public static function displayName(): string
	{
		return self::$exporter->name ?? Craft::t('dynex', '{pluginName} - missing exporter', ['pluginName' => Plugin::getInstance()->getPluginName()]);
	}

	public static function isFormattable(): bool
	{
		return self::$exporter !== null;
	}

	public function getFilename(): string
	{
		if (self::$exporter === null) {
			return 'No dynamic exporters configured';
		}

		return parent::getFilename();
	}

	/**
	 * @return array<int, array<string, string>>|string
	 */
	public function export(ElementQueryInterface $query): array|string
	{
		if (!self::$exporter) {
			return 'No dynamic exporters configured';
		}
		$expectedQuery = self::$exporter->elementType::find();
		if (!$query instanceof $expectedQuery) {
			throw new InvalidConfigException(sprintf(
				'Exporter "%s" expects a %s, got %s.',
				self::$exporter->name,
				$expectedQuery::class,
				$query::class,
			));
		}

		return $query->collect()
			->map(fn(ElementInterface $element): array => $element instanceof Element ? $this->mapElementFields($element) : [])
			->flatten(1)
			->all();
	}

	/**
	 * Maps an element into one or more rows. Multi-value fields spread their values
	 * across rows, so the element takes as many rows as its largest value set.
	 *
	 * Importable exporters' columns identifying the element hold it on every row, and their importable columns hold values in
	 * the format they're imported back from, see [[Columns]].
	 *
	 * @return array<array<string, string>>
	 */
	protected function mapElementFields(Element $element): array
	{
		$columnsService = Plugin::getInstance()->columns;

		$rawData = [];
		$repeated = [];
		$rowCount = 1;
		$this->columns ??= $columnsService->getColumns(self::$exporter);
		$joined = self::$exporter->getEffectiveMultiValueLayout() === Exporter::LAYOUT_JOINED;
		foreach ($this->columns as $column) {
			// Formats apply to the values exported for reading. Importable values keep the format they're imported from.
			$this->format = $column->kind === Column::KIND_READ_ONLY ? $column->fieldConfig?->format : null;
			$value = $column->kind === Column::KIND_READ_ONLY && $column->fieldConfig !== null
				? $this->normalizeValue($this->mapElementField($element, $column->fieldConfig))
				: $columnsService->getValue($column, $element);
			if ($joined && $value instanceof Collection) {
				$value = $value->reject(fn(string $item): bool => $item === '')->join($this->separator());
			}
			if ($value instanceof Collection) {
				$rowCount = max($rowCount, $value->count());
			}
			$rawData[$column->label] = $value;
			if ($column->identifiesElement()) {
				$repeated[$column->label] = true;
			}
		}

		$data = [];
		for ($i = 0; $i < $rowCount; $i++) {
			$dataRow = [];
			foreach ($rawData as $label => $value) {
				if ($value instanceof Collection) {
					$dataRow[$label] = $value->get($i, '');
					continue;
				}

				$dataRow[$label] = $i === 0 || isset($repeated[$label]) ? $value : '';
			}
			$data[] = $dataRow;
		}

		return $data;
	}

	protected function mapElementField(Element $element, FieldConfig $fieldConfig): mixed
	{
		$value = null;

		if ($this->hasEventHandlers(self::EVENT_BEFORE_MAP_FIELD)) {
			$event = new MapFieldEvent([
				'element' => $element,
				'fieldConfig' => $fieldConfig,
			]);
			$this->trigger(self::EVENT_BEFORE_MAP_FIELD, $event);
			$fieldConfig = $event->fieldConfig;
			$value = $event->value;
		}

		$value ??= match ($fieldConfig->type) {
			FieldConfig::TYPE_ATTRIBUTE => Plugin::getInstance()->attributes->getValue($element, $fieldConfig->getBaseHandle()),
			FieldConfig::TYPE_CALLABLE => $fieldConfig->handle instanceof Closure ? ($fieldConfig->handle)($element) : '',
			FieldConfig::TYPE_NESTED => $this->mapNestedField($element, $fieldConfig),
			default => $this->getFieldValue($element, $fieldConfig),
		};

		if ($this->hasEventHandlers(self::EVENT_AFTER_MAP_FIELD)) {
			$event = new MapFieldEvent([
				'element' => $element,
				'fieldConfig' => $fieldConfig,
				'value' => $value,
			]);
			$this->trigger(self::EVENT_AFTER_MAP_FIELD, $event);
			$value = $event->value;
		}

		return $value;
	}

	/**
	 * Maps the next field in the chain for each related element or block.
	 *
	 * Blocks of another type than the nested field belongs to keep their row, with an empty value,
	 * so each block’s values line up across the columns.
	 *
	 * @return Collection<int, mixed>
	 */
	private function mapNestedField(Element $element, FieldConfig $fieldConfig): Collection
	{
		$nested = $fieldConfig->nested;
		if ($nested === null) {
			return Collection::make();
		}

		// Attributes (e.g. `authors`) have no field ID
		if ($fieldConfig->fieldId === null) {
			$value = Plugin::getInstance()->attributes->getValue($element, $fieldConfig->getBaseHandle());
		} else {
			try {
				$value = $element->getFieldValue($fieldConfig->getBaseHandle());
			} catch (InvalidFieldException) {
				// The field isn't part of this element's layout
				return Collection::make();
			}
		}

		$nestedElements = $this->collectElements($value);
		if ($nestedElements === null) {
			return Collection::make();
		}

		$elementsService = Plugin::getInstance()->elements;

		return $nestedElements
			->map(function (ElementInterface $nestedElement) use ($nested, $elementsService): mixed {
				if (
					!$nestedElement instanceof Element ||
					($nested->blockType !== null && $elementsService->getBlockTypeHandle($nestedElement) !== $nested->blockType)
				) {
					return '';
				}

				return $this->mapElementField($nestedElement, $nested);
			})
			->values();
	}

	/**
	 * Returns the elements of a relation or block field value, whether it’s a query or was eager-loaded, through Field Value Parser.
	 * Attributes can hold a single element (e.g. a parent) or a list of them (e.g. an entry’s authors).
	 *
	 * @return Collection<int, ElementInterface>|null `null` for values that aren't elements, like lists of other values
	 */
	private function collectElements(mixed $value): ?Collection
	{
		$holdsElements = $value instanceof ElementQueryInterface
			|| $value instanceof Collection
			|| $value instanceof ElementInterface
			|| (is_array($value) && $value !== [] && collect($value)->every(fn(mixed $item): bool => $item instanceof ElementInterface));
		if (!$holdsElements) {
			return null;
		}

		return Collection::make(FieldValueParser::getInstance()->getValues()->getElements($value));
	}

	private function getFieldValue(Element $element, FieldConfig $fieldConfig): mixed
	{
		$className = $fieldConfig->className ?? '';
		if (!is_subclass_of($className, Field::class)) {
			return '';
		}

		try {
			$value = $element->getFieldValue($fieldConfig->handle);
		} catch (InvalidFieldException) {
			// The field isn't part of this element's layout
			return '';
		}

		if (is_subclass_of($className, BaseRelationField::class)) {
			$related = $this->collectElements($value);
			if ($related === null) {
				return '';
			}

			return $related->map(fn(ElementInterface $relatedElement): string => $this->elementValue($relatedElement));
		}

		if (is_subclass_of($className, BaseOptionsField::class)) {
			return $this->optionsValue($value);
		}

		return $value;
	}

	/**
	 * Top-level collections are kept, so their values can be spread across rows.
	 *
	 * @return string|Collection<int, string>
	 */
	private function normalizeValue(mixed $value): string|Collection
	{
		if ($value instanceof ElementQueryInterface) {
			$value = $value->collect();
		}

		// Lists of elements (e.g. a user’s addresses) spread across rows, like relation fields
		if (is_array($value) && ($elements = $this->collectElements($value)) !== null) {
			$value = $elements;
		}

		if ($value instanceof Collection) {
			return $value
				->map(fn(mixed $item): string => $this->stringifyValue($item))
				->values();
		}

		return $this->stringifyValue($value);
	}

	private function stringifyValue(mixed $value): string
	{
		return match (true) {
			$value === null, $value === [] => '',
			is_string($value) => $value,
			is_bool($value) => $this->booleanValue($value),
			is_int($value), is_float($value) => (string) $value,
			$value instanceof DateTimeInterface => $value->format(FieldConfig::isDateFormat($this->format) ? (string)$this->format : DateTimeInterface::ATOM),
			$value instanceof ElementInterface => $this->elementValue($value),
			$value instanceof ElementQueryInterface => $this->stringifyValue($value->collect()),
			$value instanceof Collection => $value
				->map(fn(mixed $item): string => $this->stringifyValue($item))
				->reject(fn(string $item): bool => $item === '')
				->join($this->separator()),
			$value instanceof Stringable => (string) $value,
			default => Json::encode($value),
		};
	}

	/**
	 * An element as its column's format shows it: its ID, UID, URL or slug, or its default value, e.g. an entry's title
	 */
	private function elementValue(ElementInterface $element): string
	{
		return match ($this->format) {
			FieldConfig::FORMAT_ID => (string)$element->id,
			FieldConfig::FORMAT_UID => (string)$element->uid,
			FieldConfig::FORMAT_URL => (string)$element->getUrl(),
			FieldConfig::FORMAT_SLUG => (string)$element->slug,
			default => Plugin::getInstance()->elements->getElementDefaultValue($element),
		};
	}

	/**
	 * The selected options of an options field, by their values, or their labels with the label format
	 */
	private function optionsValue(mixed $value): string
	{
		if ($this->format !== FieldConfig::FORMAT_LABEL) {
			return (string) $value;
		}

		if ($value instanceof SingleOptionFieldData) {
			return (string) $value->label;
		}

		if ($value instanceof MultiOptionsFieldData) {
			return collect($value->getArrayCopy())
				->map(fn(mixed $option): string => $option instanceof OptionData ? (string)$option->label : (string)$option)
				->join($this->separator());
		}

		return (string) $value;
	}

	private function booleanValue(bool $value): string
	{
		return match ($this->format) {
			FieldConfig::FORMAT_YES_NO => $value ? Craft::t('app', 'Yes') : Craft::t('app', 'No'),
			FieldConfig::FORMAT_TRUE_FALSE => $value ? 'true' : 'false',
			default => $value ? '1' : '0',
		};
	}

	/**
	 * What joins lists of values into a cell
	 */
	private function separator(): string
	{
		return self::$exporter->valueSeparator ?? ', ';
	}
}
