<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Jobs;

use ContentReactor\Dynex\Plugin;
use Craft;
use craft\queue\BaseJob;

/**
 * Applies a prepared import, saving the elements it changes
 */
class ApplyImport extends BaseJob
{
	public int $importId = 0;

	public function execute($queue): void
	{
		$imports = Plugin::getInstance()->imports;
		$import = $imports->getImportById($this->importId);
		if ($import === null || $import->isFinished()) {
			return;
		}

		$imports->apply($import, function(int $done, int $total) use ($queue): void {
			$this->setProgress($queue, $total ? $done / $total : 1, Craft::t('dynex', '{done} of {total} elements', ['done' => $done, 'total' => $total]));
		});
	}

	public function getTtr(): int
	{
		return 3_600;
	}

	protected function defaultDescription(): ?string
	{
		return Craft::t('dynex', 'Importing a file');
	}
}
