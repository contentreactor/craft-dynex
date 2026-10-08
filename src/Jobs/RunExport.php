<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Jobs;

use ContentReactor\Dynex\Plugin;
use Craft;
use craft\queue\BaseJob;

/**
 * Runs an exporter's export, see [[\ContentReactor\Dynex\Services\ExportRuns]]
 */
class RunExport extends BaseJob
{
	public int $runId = 0;

	public function execute($queue): void
	{
		$runs = Plugin::getInstance()->exportRuns;
		$run = $runs->getRunById($this->runId);
		if ($run === null || $run->isFinished()) {
			return;
		}

		$runs->run($run);
	}

	public function getTtr(): int
	{
		return 3_600;
	}

	protected function defaultDescription(): ?string
	{
		return Craft::t('dynex', 'Running an export');
	}
}
