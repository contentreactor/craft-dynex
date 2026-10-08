<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\migrations;

use ContentReactor\Dynex\Records\Import;
use craft\db\Migration;

/**
 * Keeps the files imported through importable exporters: what they change, and how applying them went.
 */
class m260928_000001_imports extends Migration
{
	/**
	 * @inheritdoc
	 */
	public function safeUp(): bool
	{
		if (!$this->db->tableExists(Import::TABLE)) {
			Install::createImportsTable($this);
		}

		return true;
	}

	/**
	 * @inheritdoc
	 */
	public function safeDown(): bool
	{
		$this->dropTableIfExists(Import::TABLE);

		return true;
	}
}
