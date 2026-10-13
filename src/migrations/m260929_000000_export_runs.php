<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\migrations;

use ContentReactor\Dynex\Records\{
	ExportRun,
	Exporter,
};
use craft\db\Migration;

/**
 * Gives exporters their options, e.g. how they lay out multiple values and how their runs export, and keeps their export runs.
 */
class m260929_000000_export_runs extends Migration
{
	/**
	 * @inheritdoc
	 */
	public function safeUp(): bool
	{
		if (!$this->db->columnExists(Exporter::TABLE, 'options')) {
			$this->addColumn(Exporter::TABLE, 'options', (string) $this->json()->null()->after('importable'));
		}

		if (!$this->db->tableExists(ExportRun::TABLE)) {
			Install::createExportRunsTable($this);
		}

		return true;
	}

	/**
	 * @inheritdoc
	 */
	public function safeDown(): bool
	{
		$this->dropTableIfExists(ExportRun::TABLE);
		if ($this->db->columnExists(Exporter::TABLE, 'options')) {
			$this->dropColumn(Exporter::TABLE, 'options');
		}

		return true;
	}
}
