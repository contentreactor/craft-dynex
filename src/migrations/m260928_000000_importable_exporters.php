<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\migrations;

use ContentReactor\Dynex\Records\Exporter;
use craft\db\Migration;

/**
 * Lets exporters export files that can be imported back.
 */
class m260928_000000_importable_exporters extends Migration
{
	/**
	 * @inheritdoc
	 */
	public function safeUp(): bool
	{
		if (!$this->db->columnExists(Exporter::TABLE, 'importable')) {
			$this->addColumn(Exporter::TABLE, 'importable', (string) $this->boolean()->notNull()->defaultValue(false)->after('fieldMapping'));
		}

		return true;
	}

	/**
	 * @inheritdoc
	 */
	public function safeDown(): bool
	{
		if ($this->db->columnExists(Exporter::TABLE, 'importable')) {
			$this->dropColumn(Exporter::TABLE, 'importable');
		}

		return true;
	}
}
