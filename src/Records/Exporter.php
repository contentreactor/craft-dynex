<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Records;

use craft\db\{
	ActiveRecord,
	SoftDeleteTrait,
};

/**
 * Exporter record
 * @property ?int $id
 * @property int $userId
 * @property string $name
 * @property string $handle
 * @property string $elementType
 * @property string|string[] $elementSources
 * @property array<\ContentReactor\Dynex\Models\FieldConfig|array<string, mixed>> $fieldMapping
 * @property ?int $conditionId
 * @property ?int $sortOrder
 */
class Exporter extends ActiveRecord
{
	use SoftDeleteTrait;

	public const TABLE = '{{%dynex_exporters}}';
	public static function tableName(): string
	{
		return self::TABLE;
	}
}
