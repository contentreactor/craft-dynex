<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Services;

use ContentReactor\Dynex\Models\{
	Column,
	Exporter,
	FieldConfig,
};
use ContentReactor\Dynex\Plugin;
use Craft;
use craft\base\{
	Component,
	ElementInterface,
	Field,
	FieldInterface,
};
use craft\fields\{
	BaseRelationField,
	Date as DateField,
};
use craft\helpers\{
	DateTimeHelper,
	Json,
};
use DateTimeInterface;
use Illuminate\Support\Collection;
use InvalidArgumentException;
use MarcusGaius\FieldValueParser\Enums\NodeType;
use MarcusGaius\FieldValueParser\FieldValueParser;
use MarcusGaius\FieldValueParser\Helpers\FieldHandlers;
use ReflectionNamedType;
use ReflectionProperty;
use Stringable;

/**
 * The columns of an exporter's files, and the values importable exports hold in them.
 *
 * Importable exports start with the element's ID, and its site's handle on multi-site installs, on every row of the element.
 * Top-level custom fields and the attributes Field Value Parser can write hold their values in the format they're imported
 * back from: related elements' IDs, dates in ISO 8601, and other fields' values the way Craft stores them. Fields with nested
 * elements, fields mapped through other fields, and the other attributes are exported the way people read them, and are left
 * alone on import.
 */
class Columns extends Component
{
	/**
	 * @return Column[] In the order of the file's columns
	 */
	public function getColumns(Exporter $exporter): array
	{
		$labels = $this->getLabels($exporter);

		$columns = [];
		if ($exporter->importable) {
			$columns[] = new Column(Column::LABEL_ID, Column::KIND_ID);
			if (Craft::$app->getIsMultiSite()) {
				$columns[] = new Column(Column::LABEL_SITE, Column::KIND_SITE);
			}
		}

		foreach ($exporter->fieldMapping as $index => $fieldConfig) {
			$kind = $exporter->importable ? $this->getImportableKind($fieldConfig, (string)$exporter->elementType) : null;
			$columns[] = new Column($labels[$index], $kind ?? Column::KIND_READ_ONLY, $fieldConfig);
		}

		return $columns;
	}

	/**
	 * The column labels of the field mapping. Labels shared by several fields, or with the columns importable exports start
	 * with, get the field's handle appended, e.g. `Body (content.text:body)`, so no column overwrites another.
	 *
	 * @return array<array-key, string> By the field mapping's indexes
	 */
	public function getLabels(Exporter $exporter): array
	{
		$labels = array_map(fn(FieldConfig $fieldConfig): string => (string)$fieldConfig->label, $exporter->fieldMapping);
		$counts = array_count_values($labels);
		if ($exporter->importable) {
			foreach ([Column::LABEL_ID, Column::LABEL_SITE] as $reserved) {
				$counts[$reserved] = ($counts[$reserved] ?? 0) + 1;
			}
		}

		foreach ($exporter->fieldMapping as $index => $fieldConfig) {
			$label = $labels[$index];
			if ($counts[$label] > 1 && is_string($fieldConfig->handle)) {
				$labels[$index] = "$label ($fieldConfig->handle)";
			}
		}

		return $labels;
	}

	/**
	 * The value an importable export holds in a column for an element. Lists of values, like related elements' IDs, are
	 * collections, which spread across the element's rows.
	 *
	 * @return string|Collection<int, string>
	 */
	public function getValue(Column $column, ElementInterface $element): string|Collection
	{
		$handle = $column->fieldConfig?->getBaseHandle();

		return match ($column->kind) {
			Column::KIND_ID => (string)$element->id,
			Column::KIND_SITE => (string)$element->getSite()->handle,
			Column::KIND_ATTRIBUTE => $this->formatList(FieldValueParser::getInstance()->getAttributes()->getValue($element, (string)$handle)),
			Column::KIND_FIELD => $this->getFieldValue($element, (string)$handle),
			default => '',
		};
	}

	/**
	 * The value an importable export holds in a column for an element, as it's compared with a file's: lists as arrays
	 *
	 * @return string|string[]
	 */
	public function getComparableValue(Column $column, ElementInterface $element): string|array
	{
		return $this->normalize($this->getValue($column, $element));
	}

	/**
	 * Normalizes a value for comparisons: lists become arrays without empty values, and line breaks are the same everywhere
	 *
	 * @param string|string[]|Collection<int, string> $value
	 * @return string|string[]
	 */
	public function normalize(string|array|Collection $value): string|array
	{
		if (is_string($value)) {
			return str_replace("\r\n", "\n", $value);
		}

		return Collection::make($value)
			->map(fn(mixed $item): string => trim((string)$item))
			->reject(fn(string $item): bool => $item === '')
			->values()
			->all();
	}

	/**
	 * Sets a column's value from an imported file on an element, without saving it. Lists come as arrays, e.g. related
	 * elements' IDs.
	 *
	 * @param string|string[] $value
	 * @throws InvalidArgumentException if the value can't be set
	 */
	public function setValue(Column $column, ElementInterface $element, string|array $value): void
	{
		$handle = (string)$column->fieldConfig?->getBaseHandle();

		if ($column->kind === Column::KIND_FIELD) {
			$field = $this->getField($element, $handle);
			if ($field === null) {
				throw new InvalidArgumentException("The element has no $handle field.");
			}

			$element->setFieldValue($handle, match (true) {
				$field instanceof BaseRelationField => $this->toIds($column, (array)$value),
				$field instanceof DateField => $this->toDate($column, $this->toString($column, $value)),
				default => $this->toString($column, $value),
			});

			return;
		}

		if ($column->kind !== Column::KIND_ATTRIBUTE || !$element instanceof Component || !$element->canSetProperty($handle)) {
			throw new InvalidArgumentException("$column->label can’t be imported.");
		}

		$current = FieldValueParser::getInstance()->getAttributes()->getValue($element, $handle);
		$type = $this->getPropertyType($element, $handle);

		$element->$handle = match (true) {
			is_array($current) || $type === 'array' => $this->toIds($column, (array)$value),
			$current instanceof DateTimeInterface || ($type !== null && is_a($type, DateTimeInterface::class, true)) => $this->toDate($column, $this->toString($column, $value)),
			is_bool($current) || $type === 'bool' => $this->toString($column, $value) === '1',
			is_int($current) || $type === 'int' => $this->toString($column, $value) === '' ? null : (int)$this->toString($column, $value),
			default => $this->toString($column, $value),
		};
	}

	/**
	 * The field the column's value comes from in an element's field layout, if the element has it
	 */
	public function getField(ElementInterface $element, string $handle): ?FieldInterface
	{
		return $element->getFieldLayout()?->getFieldByHandle($handle);
	}

	/**
	 * Formats a value the way importable exports hold it, spreading lists of plain values, like author IDs, across rows
	 *
	 * @return string|Collection<int, string>
	 */
	public function formatList(mixed $value): string|Collection
	{
		if (is_array($value) && array_is_list($value) && collect($value)->every(fn(mixed $item): bool => is_scalar($item))) {
			return Collection::make($value)->map(fn(mixed $item): string => $this->format($item));
		}

		return $this->format($value);
	}

	/**
	 * Formats a single value the way importable exports hold it
	 */
	public function format(mixed $value): string
	{
		return match (true) {
			$value === null => '',
			is_string($value) => $value,
			is_bool($value) => $value ? '1' : '0',
			is_int($value), is_float($value) => (string)$value,
			$value instanceof DateTimeInterface => $value->format(DateTimeInterface::ATOM),
			$value instanceof Stringable => (string)$value,
			default => Json::encode($value),
		};
	}

	/**
	 * @param string|string[] $value
	 */
	private function toString(Column $column, string|array $value): string
	{
		if (is_array($value)) {
			throw new InvalidArgumentException("$column->label holds a single value.");
		}

		return $value;
	}

	/**
	 * @param string[] $values
	 * @return int[]
	 */
	private function toIds(Column $column, array $values): array
	{
		return array_map(function(string $value) use ($column): int {
			if (!ctype_digit($value)) {
				throw new InvalidArgumentException("$column->label holds IDs, not “{$value}”.");
			}

			return (int)$value;
		}, $this->normalize($values));
	}

	/**
	 * Dates without a time zone are in the system's
	 */
	private function toDate(Column $column, string $value): ?DateTimeInterface
	{
		if (trim($value) === '') {
			return null;
		}

		$date = DateTimeHelper::toDateTime($value, true);
		if ($date === false) {
			throw new InvalidArgumentException("$column->label holds dates, not “{$value}”.");
		}

		return $date;
	}

	/**
	 * The declared type of an element property, e.g. `DateTime` for an entry's `expiryDate`, which values of it can't tell when they're empty
	 */
	private function getPropertyType(ElementInterface $element, string $handle): ?string
	{
		if (!property_exists($element, $handle)) {
			return null;
		}

		$type = (new ReflectionProperty($element, $handle))->getType();

		return $type instanceof ReflectionNamedType ? $type->getName() : null;
	}

	/**
	 * @return string|Collection<int, string>
	 */
	private function getFieldValue(ElementInterface $element, string $handle): string|Collection
	{
		$field = $this->getField($element, $handle);
		if ($field === null) {
			return '';
		}

		$value = $element->getFieldValue($handle);
		if ($field instanceof BaseRelationField) {
			return Collection::make(FieldHandlers::relatedIds($field, $value))->map(fn(int $id): string => (string)$id);
		}

		// Dates keep their time zone, which the way Craft stores them (in UTC, without a zone) doesn't show
		if ($value instanceof DateTimeInterface) {
			return $this->format($value);
		}

		return $this->format($field->serializeValue($value, $element));
	}

	/**
	 * Top-level custom fields holding their own values or relations import back, and so do the attributes Field Value
	 * Parser can write, unless an event replaced how they're read
	 *
	 * @param class-string<ElementInterface>|string $elementType
	 * @return Column::KIND_FIELD|Column::KIND_ATTRIBUTE|null
	 */
	private function getImportableKind(FieldConfig $fieldConfig, string $elementType): ?string
	{
		if (!is_subclass_of($elementType, ElementInterface::class) || !is_string($fieldConfig->handle)) {
			return null;
		}

		if ($fieldConfig->type === FieldConfig::TYPE_ATTRIBUTE) {
			$attribute = FieldValueParser::getInstance()->getAttributes()->getDefinition($elementType, $fieldConfig->handle);
			$shown = Plugin::getInstance()->attributes->getDefinitions($elementType)[$fieldConfig->handle] ?? null;
			$replaced = $shown !== null && $shown !== $attribute && $shown->value !== null;

			return $attribute?->writable && !$replaced ? Column::KIND_ATTRIBUTE : null;
		}

		if ($fieldConfig->type !== FieldConfig::TYPE_FIELD || $fieldConfig->fieldId === null || str_contains($fieldConfig->handle, '.')) {
			return null;
		}

		$field = Craft::$app->getFields()->getFieldById($fieldConfig->fieldId);
		if (!$field instanceof Field || Plugin::getInstance()->elements->isBlockField($field)) {
			return null;
		}

		$node = FieldValueParser::getInstance()->getSchemas()->getFieldNode($field);

		return in_array($node->type, [NodeType::FIELD, NodeType::RELATION], true) ? Column::KIND_FIELD : null;
	}
}
