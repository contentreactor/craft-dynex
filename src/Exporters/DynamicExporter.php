<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Exporters;

use Closure;
use ContentReactor\Dynex\Events\MapFieldEvent;
use ContentReactor\Dynex\Models\{
	Exporter,
	FieldConfig,
};
use ContentReactor\Dynex\Plugin;
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
	 * @return array<array<string, string>>
	 */
	protected function mapElementFields(Element $element): array
	{
		$fieldMapping = self::$exporter->fieldMapping;
		$labels = $this->getColumnLabels($fieldMapping);

		$rawData = [];
		$rowCount = 1;
		foreach ($fieldMapping as $index => $fieldConfig) {
			$value = $this->normalizeValue($this->mapElementField($element, $fieldConfig));
			if ($value instanceof Collection) {
				$rowCount = max($rowCount, $value->count());
			}
			$rawData[$labels[$index]] = $value;
		}

		$data = [];
		for ($i = 0; $i < $rowCount; $i++) {
			$dataRow = [];
			foreach ($rawData as $label => $value) {
				if ($value instanceof Collection) {
					$dataRow[$label] = $value->get($i, '');
					continue;
				}

				$dataRow[$label] = $i === 0 ? $value : '';
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
	 * Column labels for the field mapping. Labels shared by several fields get the field’s handle appended,
	 * e.g. `Body (content.text:body)`, so no column overwrites another.
	 *
	 * @param FieldConfig[] $fieldMapping
	 * @return array<array-key, string>
	 */
	private function getColumnLabels(array $fieldMapping): array
	{
		$counts = array_count_values(array_map(fn(FieldConfig $fieldConfig): string => (string) $fieldConfig->label, $fieldMapping));

		$labels = [];
		foreach ($fieldMapping as $index => $fieldConfig) {
			$label = (string) $fieldConfig->label;
			$labels[$index] = $counts[$label] > 1 && is_string($fieldConfig->handle)
				? "$label ($fieldConfig->handle)"
				: $label;
		}

		return $labels;
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

			$elementsService = Plugin::getInstance()->elements;

			return $related->map(fn(ElementInterface $relatedElement): string => $elementsService->getElementDefaultValue($relatedElement));
		}

		if (is_subclass_of($className, BaseOptionsField::class)) {
			return (string) $value;
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
			is_bool($value) => $value ? '1' : '0',
			is_int($value), is_float($value) => (string) $value,
			$value instanceof DateTimeInterface => $value->format(DateTimeInterface::ATOM),
			$value instanceof ElementInterface => Plugin::getInstance()->elements->getElementDefaultValue($value),
			$value instanceof ElementQueryInterface => $this->stringifyValue($value->collect()),
			$value instanceof Collection => $value
				->map(fn(mixed $item): string => $this->stringifyValue($item))
				->reject(fn(string $item): bool => $item === '')
				->join(', '),
			$value instanceof Stringable => (string) $value,
			default => Json::encode($value),
		};
	}
}