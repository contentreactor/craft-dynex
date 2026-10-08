<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Records;

use craft\db\ActiveRecord;

/**
 * Export run record
 * @property int $id
 * @property int $exporterId
 * @property int|null $userId
 * @property string $trigger
 * @property string $status
 * @property string $format
 * @property string|null $filename
 * @property int $elementCount
 * @property int $rowCount
 * @property string|null $error
 * @property string|null $deliveredTo
 * @property string $dateCreated
 * @property string $uid
 */
class ExportRun extends ActiveRecord
{
	public const TABLE = '{{%dynex_export_runs}}';

	public static function tableName(): string
	{
		return self::TABLE;
	}
}
