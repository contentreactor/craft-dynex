<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\migrations;

use ContentReactor\Dynex\Records\{
	Condition,
	Exporter,
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
		return true;
	}

	/**
	 * @inheritdoc
	 */
	public function safeDown(): bool
	{
		$this->dropTableIfExists(Exporter::TABLE);
		$this->dropTableIfExists(Condition::TABLE);
		return true;
	}
}