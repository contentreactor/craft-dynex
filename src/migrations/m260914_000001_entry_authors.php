<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\migrations;

use ContentReactor\Dynex\Records\Exporter;
use Craft;
use craft\db\{
	Migration,
	Query,
};
use craft\helpers\Json;

/**
 * Upgrades field mappings from dynex 1.x (Craft 4): Craft 5 entries can have several authors, so their `author`
 * attribute is `authors` now.
 *
 * The rest of a mapping keeps working through Craft’s own upgrade. Matrix block types become entry types, and the
 * fields inside them become global fields. Both keep their IDs, and where a handle had to change, the Matrix field and
 * the entry type layout keep the old one as an override.
 */
class m260914_000001_entry_authors extends Migration
{
	private const OLD_HANDLE = 'author';
	private const NEW_HANDLE = 'authors';

	/**
	 * @inheritdoc
	 */
	public function safeUp(): bool
	{
		$exporters = (new Query())
			->select(['id', 'fieldMapping'])
			->from([Exporter::TABLE])
			->all($this->db);

		foreach ($exporters as $exporter) {
			$fieldMapping = is_string($exporter['fieldMapping'])
				? Json::decodeIfJson($exporter['fieldMapping'])
				: $exporter['fieldMapping'];

			if (!is_array($fieldMapping)) {
				continue;
			}

			$changed = false;
			foreach ($fieldMapping as $index => $fieldConfig) {
				if (is_array($fieldConfig)) {
					$fieldMapping[$index] = $this->renameAuthors($fieldConfig, $changed);
				}
			}

			if ($changed) {
				// The JSON column encodes the mapping itself
				$this->update(Exporter::TABLE, [
					'fieldMapping' => $fieldMapping,
				], ['id' => $exporter['id']], updateTimestamp: false);
			}
		}

		return true;
	}

	/**
	 * Renames `author` attributes along a nesting chain. The first config in a chain holds the whole path as its handle,
	 * e.g. `pageBlocks.text:related.author.email`, and the configs nested in it their own handles.
	 *
	 * @param array<string, mixed> $fieldConfig
	 * @return array<string, mixed>
	 */
	private function renameAuthors(array $fieldConfig, bool &$changed): array
	{
		$chain = [];
		for ($node = $fieldConfig; is_array($node); $node = $node['nested'] ?? null) {
			$chain[] = $node;
		}

		$segments = [];
		$chainChanged = false;
		foreach ($chain as $position => $node) {
			$handle = is_string($node['handle'] ?? null) ? $node['handle'] : '';
			// The first config’s own handle is the first segment of its path
			$ownHandle = $position === 0 ? explode('.', $handle)[0] : $handle;

			// Custom fields called `author` have a field ID and class
			if ($ownHandle === self::OLD_HANDLE && ($node['fieldId'] ?? null) === null && ($node['className'] ?? null) === null) {
				$ownHandle = self::NEW_HANDLE;
				$chainChanged = true;

				// The first config of a longer chain carries the labels of the field at its end
				if ($position > 0 || count($chain) === 1) {
					$chain[$position] = $this->renameLabels($node);
				}

				if ($position > 0) {
					$chain[$position]['handle'] = $ownHandle;
				}
			}

			$blockType = $node['blockType'] ?? null;
			$segments[] = $position > 0 && is_string($blockType) ? "$blockType:$ownHandle" : $ownHandle;
		}

		if (!$chainChanged) {
			return $fieldConfig;
		}

		$changed = true;
		$chain[0]['handle'] = implode('.', $segments);

		// Put the chain back together from its end
		for ($position = count($chain) - 2; $position >= 0; $position--) {
			$chain[$position]['nested'] = $chain[$position + 1];
		}

		return $chain[0];
	}

	/**
	 * @param array<string, mixed> $fieldConfig
	 * @return array<string, mixed>
	 */
	private function renameLabels(array $fieldConfig): array
	{
		$oldDefaultLabel = $fieldConfig['defaultLabel'] ?? null;
		$fieldConfig['defaultLabel'] = Craft::t('app', 'Authors');

		// Custom labels are kept
		if (($fieldConfig['label'] ?? null) === $oldDefaultLabel) {
			$fieldConfig['label'] = $fieldConfig['defaultLabel'];
		}

		return $fieldConfig;
	}

	/**
	 * @inheritdoc
	 */
	public function safeDown(): bool
	{
		echo "m260914_000001_entry_authors cannot be reverted.\n";
		return false;
	}
}
