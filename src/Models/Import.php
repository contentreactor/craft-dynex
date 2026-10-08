<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Models;

use ContentReactor\Dynex\Plugin;
use craft\base\Model;
use DateTime;

/**
 * A file imported through an importable exporter: the changes it makes to each element, and how applying them went
 *
 * @phpstan-type Change array{column: string, old: string|string[], new: string|string[]}
 * @phpstan-type ImportedElement array{id: int, siteId: int, title: string, rows: int[], changes: Change[]}
 * @phpstan-type ImportError array{rows: int[], message: string}
 */
class Import extends Model
{
	/** Prepared, waiting to be applied or discarded */
	public const STATUS_PENDING = 'pending';
	/** Waiting in the queue */
	public const STATUS_QUEUED = 'queued';
	public const STATUS_RUNNING = 'running';
	/** Applied, with or without errors */
	public const STATUS_DONE = 'done';
	/** Stopped by an error that wasn't about a single element */
	public const STATUS_FAILED = 'failed';

	public ?int $id = null;
	public ?int $exporterId = null;
	/** The user importing the file. Elements they can't save are left alone. */
	public ?int $userId = null;
	public string $filename = '';
	/** @var self::STATUS_* */
	public string $status = self::STATUS_PENDING;
	/** The file's rows, besides its header */
	public int $rowCount = 0;
	/** Matched elements the file changes nothing of */
	public int $unchangedCount = 0;
	/** Elements saved when the import was applied */
	public int $savedCount = 0;
	/** @var ImportedElement[] The elements the file changes */
	public array $elements = [];
	/** @var ImportError[] Rows that couldn't be matched or applied, by the file's row numbers */
	public array $errors = [];
	/** @var string[] The file's columns the exporter doesn't have */
	public array $ignoredColumns = [];
	public ?DateTime $dateCreated = null;
	public ?string $uid = null;

	public function getExporter(): ?Exporter
	{
		return Plugin::getInstance()->getExporters()->getExporterById($this->exporterId);
	}

	/**
	 * How many values the file changes, across its elements
	 */
	public function getChangeCount(): int
	{
		return array_sum(array_map(fn(array $element): int => count($element['changes']), $this->elements));
	}

	public function isPending(): bool
	{
		return $this->status === self::STATUS_PENDING;
	}

	public function isFinished(): bool
	{
		return $this->status === self::STATUS_DONE || $this->status === self::STATUS_FAILED;
	}
}
