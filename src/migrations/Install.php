<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\migrations;

use ContentReactor\Dynex\Records\{
	Condition,
	ExportRun,
	Exporter,
	Import,
};
use craft\db\{
	Migration,
	Table,
};

/**
 * Install migration.
 */
class Install extends Migration
{
	/**
	 * @inheritdoc
	 */
	public function safeUp(): bool
	{
		$this->dropTableIfExists(ExportRun::TABLE);
		$this->dropTableIfExists(Import::TABLE);
		$this->dropTableIfExists(Exporter::TABLE);
		$this->dropTableIfExists(Condition::TABLE);
		$this->createTable(Exporter::TABLE, [
			'id' => $this->primaryKey(),
			'userId' => $this->integer()->notNull(),
			'name' => $this->string(255)->notNull(),
			'handle' => $this->string(255)->notNull(),
			'elementType' => $this->string(255)->notNull(),
			'elementSources' => $this->json()->notNull(),
			'fieldMapping' => $this->json()->notNull(),
			'importable' => $this->boolean()->notNull()->defaultValue(false),
			'options' => $this->json()->null(),
			'conditionId' => $this->bigInteger(),
			'sortOrder' => $this->smallInteger()->unsigned(),
			'dateCreated' => $this->dateTime()->notNull(),
			'dateUpdated' => $this->dateTime()->notNull(),
			'dateDeleted' => $this->dateTime()->null(),
			'uid' => $this->uid(),
		]);
		$this->createIndex(null, Exporter::TABLE, ['userId']);
		$this->addForeignKey(null, Exporter::TABLE, ['userId'], Table::USERS, ['id'], 'CASCADE');

		$this->createTable(Condition::TABLE, [
			'id' => $this->primaryKey(),
			'name' => $this->string(255)->notNull(),
			'elementType' => $this->string(255)->notNull(),
			'criteria' => $this->json()->notNull(),
			'sortOrder' => $this->smallInteger()->unsigned(),
			'dateCreated' => $this->dateTime()->notNull(),
			'dateUpdated' => $this->dateTime()->notNull(),
			'dateDeleted' => $this->dateTime()->null(),
			'uid' => $this->uid(),
		]);

		self::createImportsTable($this);
		self::createExportRunsTable($this);

		return true;
	}

	/**
	 * The imports table, which importable exporters' files are imported through
	 */
	public static function createImportsTable(Migration $migration): void
	{
		$migration->createTable(Import::TABLE, [
			'id' => $migration->primaryKey(),
			'exporterId' => $migration->integer()->notNull(),
			'userId' => $migration->integer()->notNull(),
			'filename' => $migration->string(255)->notNull(),
			'status' => $migration->string(20)->notNull(),
			'rowCount' => $migration->integer()->notNull()->defaultValue(0),
			'unchangedCount' => $migration->integer()->notNull()->defaultValue(0),
			'savedCount' => $migration->integer()->notNull()->defaultValue(0),
			'elements' => $migration->json()->notNull(),
			'errors' => $migration->json()->notNull(),
			'ignoredColumns' => $migration->json()->notNull(),
			'dateCreated' => $migration->dateTime()->notNull(),
			'dateUpdated' => $migration->dateTime()->notNull(),
			'uid' => $migration->uid(),
		]);
		$migration->createIndex(null, Import::TABLE, ['exporterId']);
		$migration->createIndex(null, Import::TABLE, ['userId']);
		$migration->addForeignKey(null, Import::TABLE, ['exporterId'], Exporter::TABLE, ['id'], 'CASCADE');
		$migration->addForeignKey(null, Import::TABLE, ['userId'], Table::USERS, ['id'], 'CASCADE');
	}

	/**
	 * @inheritdoc
	 */
	public function safeDown(): bool
	{
		$this->dropTableIfExists(ExportRun::TABLE);
		$this->dropTableIfExists(Import::TABLE);
		$this->dropTableIfExists(Exporter::TABLE);
		$this->dropTableIfExists(Condition::TABLE);
		return true;
	}

	/**
	 * The export runs table: exporters' exports run in the queue, and the files they wrote
	 */
	public static function createExportRunsTable(Migration $migration): void
	{
		$migration->createTable(ExportRun::TABLE, [
			'id' => $migration->primaryKey(),
			'exporterId' => $migration->integer()->notNull(),
			'userId' => $migration->integer()->null(),
			'trigger' => $migration->string(20)->notNull(),
			'status' => $migration->string(20)->notNull(),
			'format' => $migration->string(10)->notNull(),
			'filename' => $migration->string(255)->null(),
			'elementCount' => $migration->integer()->notNull()->defaultValue(0),
			'rowCount' => $migration->integer()->notNull()->defaultValue(0),
			'error' => $migration->text()->null(),
			'deliveredTo' => $migration->text()->null(),
			'dateCreated' => $migration->dateTime()->notNull(),
			'dateUpdated' => $migration->dateTime()->notNull(),
			'uid' => $migration->uid(),
		]);
		$migration->createIndex(null, ExportRun::TABLE, ['exporterId', 'dateCreated']);
		$migration->addForeignKey(null, ExportRun::TABLE, ['exporterId'], Exporter::TABLE, ['id'], 'CASCADE');
		$migration->addForeignKey(null, ExportRun::TABLE, ['userId'], Table::USERS, ['id'], 'SET NULL');
	}
}
