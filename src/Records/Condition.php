<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Records;

use craft\db\ActiveRecord;

class Condition extends ActiveRecord
{
	public const TABLE = '{{%dynex_conditions}}';
	public static function tableName(): string
	{
		return self::TABLE;
	}
}
