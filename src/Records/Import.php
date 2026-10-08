<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Records;

use craft\db\ActiveRecord;

/**
 * Import record
 * @property int $id
 * @property int $exporterId
 * @property int $userId
 * @property string $filename
 * @property string $status
 * @property int $rowCount
 * @property int $unchangedCount
 * @property int $savedCount
 * @property array<int, array<string, mixed>>|string $elements
 * @property array<int, array<string, mixed>>|string $errors
 * @property string[]|string $ignoredColumns
 * @property string $dateCreated
 * @property string $uid
 */
class Import extends ActiveRecord
{
	public const TABLE = '{{%dynex_imports}}';

	public static function tableName(): string
	{
		return self::TABLE;
	}
}
