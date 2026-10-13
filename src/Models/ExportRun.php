<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Models;

use ContentReactor\Dynex\Plugin;
use Craft;
use craft\base\Model;
use DateTime;

/**
 * An exporter's export, run in the queue from the control panel or the console, and the file it wrote
 */
class ExportRun extends Model
{
	public const STATUS_QUEUED = 'queued';
	public const STATUS_RUNNING = 'running';
	public const STATUS_DONE = 'done';
	public const STATUS_FAILED = 'failed';

	/** Started from the control panel */
	public const TRIGGER_CP = 'cp';
	/** Started from the console, e.g. by a scheduled task */
	public const TRIGGER_CONSOLE = 'console';

	public ?int $id = null;
	public ?int $exporterId = null;
	/** Who started it from the control panel. Console runs have no user. */
	public ?int $userId = null;
	/** @var self::TRIGGER_* */
	public string $trigger = self::TRIGGER_CP;
	/** @var self::STATUS_* */
	public string $status = self::STATUS_QUEUED;
	public string $format = 'csv';
	/** The name the file downloads as */
	public ?string $filename = null;
	public int $elementCount = 0;
	public int $rowCount = 0;
	public ?string $error = null;
	/** The email addresses the file was sent to */
	public ?string $deliveredTo = null;
	public ?DateTime $dateCreated = null;
	public ?string $uid = null;

	public function getExporter(): ?Exporter
	{
		return Plugin::getInstance()->getExporters()->getExporterById($this->exporterId);
	}

	/**
	 * Where the file is kept, under Craft's storage folder
	 */
	public function getFilePath(): string
	{
		return self::getStoragePath() . DIRECTORY_SEPARATOR . "$this->uid.$this->format";
	}

	public function hasFile(): bool
	{
		return $this->status === self::STATUS_DONE && $this->uid !== null && is_file($this->getFilePath());
	}

	public function isFinished(): bool
	{
		return $this->status === self::STATUS_DONE || $this->status === self::STATUS_FAILED;
	}

	/**
	 * The folder export runs keep their files in
	 */
	public static function getStoragePath(): string
	{
		return Craft::$app->getPath()->getStoragePath() . DIRECTORY_SEPARATOR . 'dynex' . DIRECTORY_SEPARATOR . 'exports';
	}
}
