<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Console\Controllers;

use ContentReactor\Dynex\Models\{
	ExportRun,
	Exporter,
};
use ContentReactor\Dynex\Plugin;
use craft\console\Controller;
use craft\helpers\Console;
use yii\console\ExitCode;

/**
 * Runs exporters' exports from the console, e.g. on a schedule, and deletes old export runs
 */
class ExportsController extends Controller
{
	/** Pushes the run to the queue instead of running it right away */
	public bool $queue = false;

	/**
	 * @inheritdoc
	 */
	public function options($actionID): array
	{
		$options = parent::options($actionID);
		if ($actionID === 'run') {
			$options[] = 'queue';
		}

		return $options;
	}

	/**
	 * Lists the exporters, with the IDs and UIDs the run command takes
	 */
	public function actionList(): int
	{
		$exporters = Plugin::getInstance()->getExporters()->getAllExporters();
		if ($exporters === []) {
			$this->stdout("No exporters.\n");
			return ExitCode::OK;
		}

		$this->table(['ID', 'UID', 'Handle', 'Name', 'Element Type', 'Owner'], array_map(fn(Exporter $exporter): array => [
			(string)$exporter->id,
			(string)$exporter->uid,
			(string)$exporter->handle,
			(string)$exporter->name,
			$exporter->getElementTypeName(),
			(string)\Craft::$app->getUsers()->getUserById((int)$exporter->userId)?->username,
		], $exporters));

		return ExitCode::OK;
	}

	/**
	 * Runs an exporter's export with its run settings: its format, site, filters and delivery addresses
	 *
	 * @param string $exporter The exporter's ID or UID, or its handle when no other exporter has it
	 */
	public function actionRun(string $exporter): int
	{
		$plugin = Plugin::getInstance();
		if (!$plugin->isPro()) {
			$this->stderr(Plugin::proMessage('Export runs', $plugin->getPluginName()) . "\n", Console::FG_RED);
			return ExitCode::UNAVAILABLE;
		}

		$model = $this->findExporter($exporter);
		if ($model === null) {
			return ExitCode::DATAERR;
		}

		$runs = $plugin->exportRuns;
		if ($this->queue) {
			$run = $runs->queue($model, null, ExportRun::TRIGGER_CONSOLE);
			$this->stdout("Queued export run $run->id of “{$model->name}”.\n", Console::FG_GREEN);
			return ExitCode::OK;
		}

		$run = $runs->create($model, null, ExportRun::TRIGGER_CONSOLE);
		$runs->run($run);

		if ($run->status !== ExportRun::STATUS_DONE) {
			$this->stderr("Export run $run->id failed: $run->error\n", Console::FG_RED);
			return ExitCode::SOFTWARE;
		}

		$this->stdout("Exported $run->elementCount elements of “{$model->name}” into {$run->getFilePath()}\n", Console::FG_GREEN);
		if ($run->deliveredTo !== null) {
			$this->stdout("Emailed to $run->deliveredTo\n");
		}
		if ($run->error !== null) {
			$this->stderr("$run->error\n", Console::FG_YELLOW);
		}

		return ExitCode::OK;
	}

	/**
	 * Deletes export runs, and their files, older than the retention setting keeps them for
	 */
	public function actionPrune(): int
	{
		$count = Plugin::getInstance()->exportRuns->prune();
		$this->stdout("Deleted $count export runs.\n");

		return ExitCode::OK;
	}

	private function findExporter(string $identifier): ?Exporter
	{
		$exporters = Plugin::getInstance()->getExporters();
		$exporter = ctype_digit($identifier) ? $exporters->getExporterById((int)$identifier) : $exporters->getExporterByUid($identifier);
		if ($exporter !== null) {
			return $exporter;
		}

		$matches = array_values(array_filter($exporters->getAllExporters(), fn(Exporter $exporter): bool => $exporter->handle === $identifier));
		if (count($matches) === 1) {
			return $matches[0];
		}

		$this->stderr(count($matches) > 1
			? "Several exporters have the handle “{$identifier}”. Use the ID or UID from `dynex/exports/list`.\n"
			: "There’s no exporter “{$identifier}”.\n", Console::FG_RED);

		return null;
	}
}
