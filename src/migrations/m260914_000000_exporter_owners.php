<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\migrations;

use ContentReactor\Dynex\Records\Exporter;
use craft\db\{
	Migration,
	Query,
	Table,
};

/**
 * Makes exporters belong to individual users.
 */
class m260914_000000_exporter_owners extends Migration
{
	/**
	 * @inheritdoc
	 */
	public function safeUp(): bool
	{
		if (!$this->db->columnExists(Exporter::TABLE, 'userId')) {
			$this->addColumn(Exporter::TABLE, 'userId', (string) $this->integer()->after('id'));
		}

		// There's no record of who created existing exporters, so they go to the first admin
		$adminId = (new Query())
			->select(['id'])
			->from([Table::USERS])
			->where(['admin' => true])
			->orderBy(['id' => SORT_ASC])
			->scalar();

		if ($adminId) {
			$this->update(Exporter::TABLE, ['userId' => $adminId], ['userId' => null], updateTimestamp: false);
		}

		$hasOrphans = (new Query())
			->from([Exporter::TABLE])
			->where(['userId' => null])
			->exists();

		if (!$hasOrphans) {
			$this->alterColumn(Exporter::TABLE, 'userId', (string) $this->integer()->notNull());
		}

		$this->createIndex(null, Exporter::TABLE, ['userId']);
		$this->addForeignKey(null, Exporter::TABLE, ['userId'], Table::USERS, ['id'], 'CASCADE');

		return true;
	}

	/**
	 * @inheritdoc
	 */
	public function safeDown(): bool
	{
		echo "m260914_000000_exporter_owners cannot be reverted.\n";
		return false;
	}
}