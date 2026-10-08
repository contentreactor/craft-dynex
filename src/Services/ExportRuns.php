<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Services;

use ContentReactor\Dynex\Exporters\DynamicExporter;
use ContentReactor\Dynex\Jobs\RunExport;
use ContentReactor\Dynex\Models\{
	ExportRun as ExportRunModel,
	Exporter,
};
use ContentReactor\Dynex\Plugin;
use ContentReactor\Dynex\Records\ExportRun as ExportRunRecord;
use Craft;
use craft\base\{
	Component,
	ElementInterface,
};
use craft\elements\db\ElementQueryInterface;
use craft\elements\User;
use craft\helpers\{
	DateTimeHelper,
	ElementHelper,
	FileHelper,
	Queue,
	StringHelper,
};
use craft\web\Response;
use DateTime;
use InvalidArgumentException;
use Throwable;

/**
 * Runs exporters' exports in the queue, writing their files to Craft's storage folder, where they stay downloadable from the
 * exporter's run history until the retention setting deletes them. Runs export the elements of the exporter's sources, in its
 * run site, optionally only enabled ones or ones created recently, in its run format, and email the file to its delivery
 * addresses. The console command runs them too, e.g. on a schedule.
 */
class ExportRuns extends Component
{
	/**
	 * Saves a queued run of an exporter and pushes its job to the queue
	 *
	 * @param ExportRunModel::TRIGGER_* $trigger
	 */
	public function queue(Exporter $exporter, ?User $user, string $trigger = ExportRunModel::TRIGGER_CP): ExportRunModel
	{
		$run = $this->create($exporter, $user, $trigger);
		Queue::push(new RunExport(['runId' => $run->id]));

		return $run;
	}

	/**
	 * Saves a run of an exporter that's yet to start
	 *
	 * @param ExportRunModel::TRIGGER_* $trigger
	 */
	public function create(Exporter $exporter, ?User $user, string $trigger = ExportRunModel::TRIGGER_CP): ExportRunModel
	{
		if (!$exporter->id || !is_subclass_of((string)$exporter->elementType, ElementInterface::class)) {
			throw new InvalidArgumentException('Only saved exporters can run.');
		}

		$run = new ExportRunModel([
			'exporterId' => $exporter->id,
			'userId' => $user?->id,
			'trigger' => $trigger,
			'format' => $exporter->runFormat,
		]);
		$this->saveRun($run);

		return $run;
	}

	/**
	 * Exports the run's elements into its file, and sends the file to the exporter's delivery addresses
	 */
	public function run(ExportRunModel $run): void
	{
		$run->status = ExportRunModel::STATUS_RUNNING;
		$this->saveRun($run);

		$previousExporter = DynamicExporter::$exporter;
		try {
			$exporter = $run->getExporter() ?? throw new InvalidArgumentException('The exporter is gone.');
			$query = $this->buildQuery($exporter);

			DynamicExporter::$exporter = $exporter;
			$rows = (new DynamicExporter())->export($query);
			if (!is_array($rows)) {
				throw new InvalidArgumentException((string)$rows);
			}

			$run->elementCount = (int)$query->count();
			$run->rowCount = count($rows);
			$run->filename = sprintf('%s-%s.%s', $exporter->handle, (new DateTime())->format('Y-m-d-His'), $run->format);
			$this->writeFile($run, $exporter, $rows);
			$run->status = ExportRunModel::STATUS_DONE;
		} catch (Throwable $e) {
			$run->status = ExportRunModel::STATUS_FAILED;
			$run->error = $e->getMessage();
			Craft::error("Export run $run->id failed: {$e->getMessage()}", __METHOD__);
		} finally {
			DynamicExporter::$exporter = $previousExporter;
		}

		if ($run->status === ExportRunModel::STATUS_DONE && isset($exporter)) {
			$this->deliver($run, $exporter);
		}

		$this->saveRun($run);
		$this->prune();
	}

	/**
	 * The elements an exporter's runs export: its sources' elements in its run site, enabled ones only or all of them, and
	 * only the ones created recently if it says so
	 */
	public function buildQuery(Exporter $exporter): ElementQueryInterface
	{
		/** @var class-string<ElementInterface> $elementType */
		$elementType = (string)$exporter->elementType;
		$query = $elementType::find();

		if ($elementType::isLocalized()) {
			$sites = Craft::$app->getSites();
			$site = $exporter->runSite !== null ? $sites->getSiteByHandle($exporter->runSite, false) : $sites->getPrimarySite();
			if ($site === null) {
				throw new InvalidArgumentException(Craft::t('dynex', 'There’s no “{site}” site.', ['site' => $exporter->runSite]));
			}
			$query->siteId($site->id);
		}

		if (!$exporter->runEnabledOnly) {
			$query->status(null);
		}

		if ($exporter->runCreatedWithinDays !== null) {
			$query->dateCreated('>= ' . (new DateTime("-$exporter->runCreatedWithinDays days"))->format(DateTime::ATOM));
		}

		// Elements of any of the sources, with each source's own criteria. Sources are the ones the exporter's owner can see,
		// whoever or whatever runs the export, e.g. the queue or a scheduled task.
		if (is_array($exporter->elementSources)) {
			$ids = $this->asOwner($exporter, function() use ($exporter, $elementType, $query): array {
				$ids = [];
				foreach ((array)$exporter->elementSources as $sourceKey) {
					$source = ElementHelper::findSource($elementType, (string)$sourceKey);
					if ($source === null) {
						continue;
					}
					$sourceQuery = clone $query;
					Craft::configure($sourceQuery, $source['criteria'] ?? []);
					array_push($ids, ...$sourceQuery->ids());
				}

				return $ids;
			});
			$query->id($ids === [] ? [0] : array_values(array_unique($ids)));
		}

		return $query;
	}

	/**
	 * Runs a callback as the exporter's owner, as Craft lists the element sources a user can see
	 *
	 * @template T
	 * @param callable(): T $callback
	 * @return T
	 */
	private function asOwner(Exporter $exporter, callable $callback): mixed
	{
		$owner = Craft::$app->getUsers()->getUserById((int)$exporter->userId)
			?? throw new InvalidArgumentException('The exporter’s owner is gone.');
		$userComponent = Craft::$app->getUser();
		$previous = $userComponent->getIdentity(false);

		$userComponent->setIdentity($owner);
		try {
			return $callback();
		} finally {
			$userComponent->setIdentity($previous);
		}
	}

	/**
	 * @return ExportRunModel[] An exporter's runs, newest first
	 */
	public function getExporterRuns(Exporter $exporter, int $limit = 50): array
	{
		/** @var ExportRunRecord[] $records */
		$records = ExportRunRecord::find()
			->where(['exporterId' => $exporter->id])
			->orderBy(['dateCreated' => SORT_DESC, 'id' => SORT_DESC])
			->limit($limit)
			->all();

		return array_map(fn(ExportRunRecord $record): ExportRunModel => $this->createModel($record), $records);
	}

	public function getRunById(int $id): ?ExportRunModel
	{
		$record = ExportRunRecord::findOne(['id' => $id]);

		return $record instanceof ExportRunRecord ? $this->createModel($record) : null;
	}

	/**
	 * A run of one of the user's exporters, whoever started it
	 *
	 * @param int|null $userId Defaults to the current user
	 */
	public function getUserRunById(int $id, ?int $userId = null): ?ExportRunModel
	{
		$run = $this->getRunById($id);
		if ($run === null) {
			return null;
		}

		return Plugin::getInstance()->getExporters()->getUserExporterById($run->exporterId, $userId) !== null ? $run : null;
	}

	/**
	 * Deletes a run and its file
	 */
	public function deleteRun(ExportRunModel $run): void
	{
		if ($run->uid !== null && is_file($run->getFilePath())) {
			FileHelper::unlink($run->getFilePath());
		}

		ExportRunRecord::deleteAll(['id' => $run->id]);
	}

	/**
	 * Deletes the runs, and their files, older than the retention setting keeps them for
	 *
	 * @return int How many runs were deleted
	 */
	public function prune(): int
	{
		$days = Plugin::getInstance()->getSettings()->exportRetentionDays;
		if ($days <= 0) {
			return 0;
		}

		/** @var ExportRunRecord[] $records */
		$records = ExportRunRecord::find()
			->where(['<', 'dateCreated', (new DateTime("-$days days"))->format('Y-m-d H:i:s')])
			->all();

		foreach ($records as $record) {
			$this->deleteRun($this->createModel($record));
		}

		return count($records);
	}

	public function saveRun(ExportRunModel $run): void
	{
		$record = ($run->id ? ExportRunRecord::findOne(['id' => $run->id]) : null) ?? new ExportRunRecord();
		$record->exporterId = (int)$run->exporterId;
		$record->userId = $run->userId;
		$record->trigger = $run->trigger;
		$record->status = $run->status;
		$record->format = $run->format;
		$record->filename = $run->filename;
		$record->elementCount = $run->elementCount;
		$record->rowCount = $run->rowCount;
		$record->error = $run->error;
		$record->deliveredTo = $run->deliveredTo;
		$record->save(false);

		$run->id = $record->id;
		$run->uid = $record->uid;
		$run->dateCreated = DateTimeHelper::toDateTime($record->dateCreated) ?: null;
	}

	/**
	 * Writes the rows the way the element index exports them, through Craft's own formatters
	 *
	 * @param array<int, array<string, string>> $rows
	 */
	private function writeFile(ExportRunModel $run, Exporter $exporter, array $rows): void
	{
		$response = new Response();
		$response->format = $run->format;
		$response->data = $rows;

		if ($run->format === Response::FORMAT_JSON) {
			$response->formatters[Response::FORMAT_JSON]['prettyPrint'] = true;
		}
		if ($run->format === Response::FORMAT_XML) {
			/** @var class-string<ElementInterface> $elementType */
			$elementType = (string)$exporter->elementType;
			$response->formatters[Response::FORMAT_XML]['rootTag'] = StringHelper::toCamelCase($elementType::pluralLowerDisplayName());
		}

		$formatter = Craft::createObject($response->formatters[$run->format]);
		$formatter->format($response);

		FileHelper::createDirectory(ExportRunModel::getStoragePath());
		FileHelper::writeToFile($run->getFilePath(), (string)$response->content);
	}

	/**
	 * Emails the file to the exporter's delivery addresses, recording who got it, or why it wasn't sent
	 */
	private function deliver(ExportRunModel $run, Exporter $exporter): void
	{
		$emails = $exporter->getDeliveryEmails();
		if ($emails === []) {
			return;
		}

		try {
			$sent = Craft::$app->getMailer()->compose()
				->setTo($emails)
				->setSubject(Craft::t('dynex', 'Export: {exporter}', ['exporter' => $exporter->name]))
				->setTextBody(Craft::t('dynex', '{exporter} exported {count} elements. The file is attached.', [
					'exporter' => $exporter->name,
					'count' => $run->elementCount,
				]))
				->attach($run->getFilePath(), ['fileName' => $run->filename])
				->send();
		} catch (Throwable $e) {
			Craft::error("Export run $run->id couldn’t be delivered: {$e->getMessage()}", __METHOD__);
			$sent = false;
		}

		if ($sent) {
			$run->deliveredTo = implode(', ', $emails);
		} else {
			$run->error = Craft::t('dynex', 'The file couldn’t be emailed to {emails}.', ['emails' => implode(', ', $emails)]);
		}
	}

	private function createModel(ExportRunRecord $record): ExportRunModel
	{
		return new ExportRunModel([
			'id' => (int)$record->id,
			'exporterId' => (int)$record->exporterId,
			'userId' => $record->userId !== null ? (int)$record->userId : null,
			'trigger' => $record->trigger,
			'status' => $record->status,
			'format' => $record->format,
			'filename' => $record->filename,
			'elementCount' => (int)$record->elementCount,
			'rowCount' => (int)$record->rowCount,
			'error' => $record->error,
			'deliveredTo' => $record->deliveredTo,
			'dateCreated' => DateTimeHelper::toDateTime($record->dateCreated) ?: null,
			'uid' => $record->uid,
		]);
	}
}
