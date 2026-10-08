<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Services;

use ContentReactor\Dynex\Jobs\ApplyImport;
use ContentReactor\Dynex\Models\{
	Column,
	Exporter,
	Import as ImportModel,
};
use ContentReactor\Dynex\Plugin;
use ContentReactor\Dynex\Records\Import as ImportRecord;
use Craft;
use craft\base\{
	Component,
	ElementInterface,
};
use craft\elements\User;
use craft\helpers\{
	DateTimeHelper,
	Json,
	Queue,
};
use Illuminate\Support\Collection;
use InvalidArgumentException;
use PhpOffice\PhpSpreadsheet\Reader\Xlsx;
use Throwable;

/**
 * Imports files exported by importable exporters, after they're edited, see [[Columns]].
 *
 * Preparing an import reads the file and works out what it changes, without saving anything. The elements are matched by
 * their IDs, and their sites' handles on multi-site installs. Single values come from an element's first row, and lists,
 * like related elements' IDs, from all of its rows. Applying the import sets the changed values and saves the elements
 * from the queue, leaving alone values that changed since it was prepared, and elements the importing user can't save.
 *
 * @phpstan-import-type ImportedElement from ImportModel
 * @phpstan-import-type ImportError from ImportModel
 */
class Imports extends Component
{
	/** The file types imports read */
	public const EXTENSIONS = ['csv', 'xlsx', 'json'];

	/**
	 * Reads a file's rows, by its columns' labels
	 *
	 * @param string $filename The name the file was uploaded with, whose extension tells its type
	 * @return array<int, array<string, string>> By the file's row numbers, the header being the first row of spreadsheets
	 * @throws InvalidArgumentException if the file can't be read
	 */
	public function readFile(string $path, string $filename): array
	{
		$extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

		return match ($extension) {
			'csv' => $this->readCsv($path),
			'xlsx' => $this->readXlsx($path),
			'json' => $this->readJson($path),
			default => throw new InvalidArgumentException(Craft::t('dynex', 'Only {types} files can be imported.', ['types' => implode(', ', self::EXTENSIONS)])),
		};
	}

	/**
	 * Works out what a file's rows change, without saving anything, and saves that as a pending import
	 *
	 * @param array<int, array<string, string>> $rows By the file's row numbers
	 * @throws InvalidArgumentException if the exporter isn't importable, or the file has no ID column
	 */
	public function prepare(Exporter $exporter, array $rows, User $user, string $filename): ImportModel
	{
		if (!$exporter->importable || !is_subclass_of((string)$exporter->elementType, ElementInterface::class)) {
			throw new InvalidArgumentException(Craft::t('dynex', '{exporter} isn’t importable.', ['exporter' => $exporter->name]));
		}

		$columnsService = Plugin::getInstance()->columns;
		$columns = collect($columnsService->getColumns($exporter))->keyBy(fn(Column $column): string => $column->label);
		$headers = array_keys((array)reset($rows));
		if (!in_array(Column::LABEL_ID, $headers, true)) {
			throw new InvalidArgumentException(Craft::t('dynex', 'The file has no {column} column. Export it again with {exporter}.', [
				'column' => Column::LABEL_ID,
				'exporter' => $exporter->name,
			]));
		}

		$import = new ImportModel([
			'exporterId' => $exporter->id,
			'userId' => $user->id,
			'filename' => $filename,
			'rowCount' => count($rows),
			'ignoredColumns' => array_values(array_filter($headers, fn(string $header): bool => !$columns->has($header))),
		]);

		/** @var Collection<string, Column> $importable */
		$importable = $columns->filter(fn(Column $column): bool => $column->isImportable() && in_array($column->label, $headers, true));

		foreach ($this->groupRows($rows, $import) as $group) {
			$element = $this->findElement($exporter, $group['id'], $group['site'], $user, $group['rows'], $import);
			if ($element === null) {
				continue;
			}

			$changes = [];
			foreach ($importable as $column) {
				$old = $columnsService->getComparableValue($column, $element);
				$new = is_array($old)
					? $columnsService->normalize(array_column($group['values'], $column->label))
					: $columnsService->normalize((string)($group['values'][0][$column->label] ?? ''));
				if ($old !== $new) {
					$changes[] = ['column' => $column->label, 'old' => $old, 'new' => $new];
				}
			}

			if ($changes === []) {
				$import->unchangedCount++;
				continue;
			}

			$import->elements[] = [
				'id' => (int)$element->id,
				'siteId' => (int)$element->siteId,
				'title' => (string)$element,
				'rows' => $group['rows'],
				'changes' => $changes,
			];
		}

		$this->saveImport($import);

		return $import;
	}

	/**
	 * Pushes the job applying a pending import to the queue
	 */
	public function queue(ImportModel $import): void
	{
		if (!$import->isPending()) {
			throw new InvalidArgumentException("Import $import->id was applied already.");
		}

		$import->status = ImportModel::STATUS_QUEUED;
		$this->saveImport($import);
		Queue::push(new ApplyImport(['importId' => $import->id]));
	}

	/**
	 * Sets the changed values and saves the elements, recording the rows it couldn't apply
	 *
	 * @param callable(int, int): void|null $progress Called with how many elements are done, and how many there are
	 */
	public function apply(ImportModel $import, ?callable $progress = null): void
	{
		$import->status = ImportModel::STATUS_RUNNING;
		$this->saveImport($import);

		try {
			$user = Craft::$app->getUsers()->getUserById((int)$import->userId);
			$exporter = $import->getExporter();
			if ($user === null || $exporter === null) {
				throw new InvalidArgumentException('The import’s exporter or user is gone.');
			}

			$columns = collect(Plugin::getInstance()->columns->getColumns($exporter))->keyBy(fn(Column $column): string => $column->label);
			$total = count($import->elements);
			foreach ($import->elements as $index => $importedElement) {
				$this->applyElement($import, $importedElement, $exporter, $columns, $user);
				if ($progress !== null) {
					$progress($index + 1, $total);
				}
			}

			$import->status = ImportModel::STATUS_DONE;
		} catch (Throwable $e) {
			$import->status = ImportModel::STATUS_FAILED;
			$import->errors[] = ['rows' => [], 'message' => $e->getMessage()];
			Craft::error("Import $import->id failed: {$e->getMessage()}", __METHOD__);
		}

		$this->saveImport($import);
	}

	/**
	 * @param int|null $userId Defaults to the current user
	 */
	public function getUserImportById(int $id, ?int $userId = null): ?ImportModel
	{
		$userId ??= Craft::$app->getUser()->getId();
		$record = ImportRecord::findOne(['id' => $id, 'userId' => $userId]);

		return $record instanceof ImportRecord ? $this->createModel($record) : null;
	}

	public function getImportById(int $id): ?ImportModel
	{
		$record = ImportRecord::findOne(['id' => $id]);

		return $record instanceof ImportRecord ? $this->createModel($record) : null;
	}

	/**
	 * An exporter's imports, newest first
	 *
	 * @return ImportModel[]
	 */
	public function getExporterImports(Exporter $exporter): array
	{
		/** @var ImportRecord[] $records */
		$records = ImportRecord::find()
			->where(['exporterId' => $exporter->id])
			->orderBy(['dateCreated' => SORT_DESC, 'id' => SORT_DESC])
			->all();

		return array_map(fn(ImportRecord $record): ImportModel => $this->createModel($record), $records);
	}

	public function deleteImport(ImportModel $import): bool
	{
		return (bool)ImportRecord::deleteAll(['id' => $import->id]);
	}

	public function saveImport(ImportModel $import): void
	{
		$record = ($import->id ? ImportRecord::findOne(['id' => $import->id]) : null) ?? new ImportRecord();
		$record->exporterId = (int)$import->exporterId;
		$record->userId = (int)$import->userId;
		$record->filename = $import->filename;
		$record->status = $import->status;
		$record->rowCount = $import->rowCount;
		$record->unchangedCount = $import->unchangedCount;
		$record->savedCount = $import->savedCount;
		$record->elements = $import->elements;
		$record->errors = $import->errors;
		$record->ignoredColumns = $import->ignoredColumns;
		$record->save(false);

		$import->id = $record->id;
		$import->uid = $record->uid;
		$import->dateCreated = DateTimeHelper::toDateTime($record->dateCreated) ?: null;
	}

	/**
	 * Groups rows by the element they belong to, in the order of their first rows. Rows without an ID are recorded as errors,
	 * unless they're empty.
	 *
	 * @param array<int, array<string, string>> $rows
	 * @return array<string, array{id: string, site: string|null, rows: int[], values: array<int, array<string, string>>}>
	 */
	private function groupRows(array $rows, ImportModel $import): array
	{
		$groups = [];
		foreach ($rows as $rowNumber => $row) {
			$id = trim((string)($row[Column::LABEL_ID] ?? ''));
			if ($id === '') {
				if (implode('', array_map('trim', $row)) !== '') {
					$import->errors[] = ['rows' => [$rowNumber], 'message' => Craft::t('dynex', 'The row has no ID.')];
				}
				continue;
			}

			$site = isset($row[Column::LABEL_SITE]) ? trim((string)$row[Column::LABEL_SITE]) : null;
			$key = "$id|$site";
			$groups[$key] ??= ['id' => $id, 'site' => $site, 'rows' => [], 'values' => []];
			$groups[$key]['rows'][] = $rowNumber;
			$groups[$key]['values'][] = $row;
		}

		return $groups;
	}

	/**
	 * The element a group of rows changes, if it exists and the user can save it
	 *
	 * @param int[] $rows
	 */
	private function findElement(Exporter $exporter, string $id, ?string $siteHandle, User $user, array $rows, ImportModel $import): ?ElementInterface
	{
		$fail = function(string $message) use ($rows, $import): null {
			$import->errors[] = ['rows' => $rows, 'message' => $message];

			return null;
		};

		if (!ctype_digit($id)) {
			return $fail(Craft::t('dynex', '“{id}” isn’t an ID.', ['id' => $id]));
		}

		$sites = Craft::$app->getSites();
		$site = $siteHandle !== null && $siteHandle !== '' ? $sites->getSiteByHandle($siteHandle, false) : $sites->getPrimarySite();
		if ($site === null) {
			return $fail(Craft::t('dynex', 'There’s no “{site}” site.', ['site' => $siteHandle]));
		}

		/** @var class-string<ElementInterface> $elementType */
		$elementType = $exporter->elementType;
		$element = $elementType::find()->id((int)$id)->siteId($site->id)->status(null)->one();
		if ($element === null) {
			return $fail(Craft::t('dynex', 'There’s no {type} with the ID {id} in the {site} site.', [
				'type' => $elementType::lowerDisplayName(),
				'id' => $id,
				'site' => $site->getName(),
			]));
		}

		if (!Craft::$app->getElements()->canSave($element, $user)) {
			return $fail(Craft::t('dynex', 'You can’t save “{title}”.', ['title' => (string)$element]));
		}

		return $element;
	}

	/**
	 * Applies the changes to an element, and saves it
	 *
	 * @param ImportedElement $importedElement
	 * @param Collection<string, Column> $columns
	 */
	private function applyElement(ImportModel $import, array $importedElement, Exporter $exporter, Collection $columns, User $user): void
	{
		$rows = $importedElement['rows'];
		$fail = function(string $message) use ($rows, $import): void {
			$import->errors[] = ['rows' => $rows, 'message' => $message];
		};

		/** @var class-string<ElementInterface> $elementType */
		$elementType = $exporter->elementType;
		$element = $elementType::find()->id($importedElement['id'])->siteId($importedElement['siteId'])->status(null)->one();
		if ($element === null) {
			$fail(Craft::t('dynex', '“{title}” is gone.', ['title' => $importedElement['title']]));
			return;
		}

		if (!Craft::$app->getElements()->canSave($element, $user)) {
			$fail(Craft::t('dynex', 'You can’t save “{title}”.', ['title' => $importedElement['title']]));
			return;
		}

		$columnsService = Plugin::getInstance()->columns;
		$applied = 0;
		foreach ($importedElement['changes'] as $change) {
			$column = $columns->get($change['column']);
			if ($column === null || !$column->isImportable()) {
				$fail(Craft::t('dynex', 'The exporter no longer imports {column}.', ['column' => $change['column']]));
				continue;
			}

			// Someone else's changes since the import was prepared win
			if ($columnsService->getComparableValue($column, $element) !== $change['old']) {
				$fail(Craft::t('dynex', '{column} of “{title}” changed since the file was uploaded, so it was left alone.', [
					'column' => $change['column'],
					'title' => $importedElement['title'],
				]));
				continue;
			}

			try {
				$columnsService->setValue($column, $element, $change['new']);
				$applied++;
			} catch (InvalidArgumentException $e) {
				$fail($e->getMessage());
			}
		}

		if ($applied === 0) {
			return;
		}

		$element->setRevisionNotes(Craft::t('dynex', 'Imported from {filename}', ['filename' => $import->filename]));
		if (property_exists($element, 'revisionCreatorId')) {
			$element->revisionCreatorId = $user->id;
		}

		if (!Craft::$app->getElements()->saveElement($element)) {
			$fail(Craft::t('dynex', '“{title}” couldn’t be saved: {errors}', [
				'title' => $importedElement['title'],
				'errors' => implode(' ', $element->getFirstErrors()),
			]));
			return;
		}

		$import->savedCount++;
	}

	/**
	 * @return array<int, array<string, string>>
	 */
	private function readCsv(string $path): array
	{
		$handle = @fopen($path, 'rb');
		if ($handle === false) {
			throw new InvalidArgumentException(Craft::t('dynex', 'The file couldn’t be read.'));
		}

		try {
			// A byte order mark, as spreadsheet apps write them, would be read as part of the first label
			if (fread($handle, 3) !== "\xEF\xBB\xBF") {
				rewind($handle);
			}
			$start = (int)ftell($handle);
			$firstLine = (string)fgets($handle);
			fseek($handle, $start);
			// Spreadsheet apps in some locales save with semicolons
			$delimiter = substr_count($firstLine, ';') > substr_count($firstLine, ',') ? ';' : ',';

			$table = [];
			while (($line = fgetcsv($handle, null, $delimiter, '"', '')) !== false) {
				$table[] = array_map(fn(?string $cell): string => (string)$cell, $line);
			}
		} finally {
			fclose($handle);
		}

		return $this->rowsFromTable($table);
	}

	/**
	 * @return array<int, array<string, string>>
	 */
	private function readXlsx(string $path): array
	{
		try {
			$reader = new Xlsx();
			$reader->setReadDataOnly(true);
			$sheet = $reader->load($path)->getActiveSheet();
		} catch (Throwable) {
			throw new InvalidArgumentException(Craft::t('dynex', 'The file couldn’t be read.'));
		}

		$table = [];
		foreach ($sheet->toArray(null, true, false, false) as $line) {
			$table[] = array_map(fn(mixed $cell): string => match (true) {
				$cell === null => '',
				// Spreadsheets turn numbers, like IDs, into floats
				is_float($cell) && floor($cell) === $cell && abs($cell) < PHP_INT_MAX => (string)(int)$cell,
				is_bool($cell) => $cell ? '1' : '0',
				default => (string)$cell,
			}, $line);
		}

		return $this->rowsFromTable($table);
	}

	/**
	 * Reads files in the format Craft exports JSON: a list of objects, by the columns' labels
	 *
	 * @return array<int, array<string, string>>
	 */
	private function readJson(string $path): array
	{
		try {
			$data = Json::decode((string)file_get_contents($path));
		} catch (Throwable) {
			$data = null;
		}

		if (!is_array($data) || !array_is_list($data)) {
			throw new InvalidArgumentException(Craft::t('dynex', 'The file couldn’t be read.'));
		}

		$rows = [];
		foreach ($data as $index => $item) {
			if (!is_array($item)) {
				throw new InvalidArgumentException(Craft::t('dynex', 'The file couldn’t be read.'));
			}
			$rows[$index + 1] = array_map(fn(mixed $value): string => is_scalar($value) || $value === null ? (string)$value : Json::encode($value), $item);
		}

		return $rows;
	}

	/**
	 * Turns a spreadsheet's lines into rows by the header's labels, numbered like the spreadsheet's rows
	 *
	 * @param array<int, string[]> $table
	 * @return array<int, array<string, string>>
	 */
	private function rowsFromTable(array $table): array
	{
		$header = array_map('trim', array_shift($table) ?? []);
		if ($header === [] || implode('', $header) === '') {
			throw new InvalidArgumentException(Craft::t('dynex', 'The file has no header row.'));
		}

		$rows = [];
		foreach ($table as $index => $line) {
			$row = [];
			foreach ($header as $position => $label) {
				if ($label !== '') {
					$row[$label] = $line[$position] ?? '';
				}
			}
			$rows[$index + 2] = $row;
		}

		return $rows;
	}

	private function createModel(ImportRecord $record): ImportModel
	{
		return new ImportModel([
			'id' => (int)$record->id,
			'exporterId' => (int)$record->exporterId,
			'userId' => (int)$record->userId,
			'filename' => $record->filename,
			'status' => $record->status,
			'rowCount' => (int)$record->rowCount,
			'unchangedCount' => (int)$record->unchangedCount,
			'savedCount' => (int)$record->savedCount,
			'elements' => $this->decode($record->elements),
			'errors' => $this->decode($record->errors),
			'ignoredColumns' => $this->decode($record->ignoredColumns),
			'dateCreated' => DateTimeHelper::toDateTime($record->dateCreated) ?: null,
			'uid' => $record->uid,
		]);
	}

	/**
	 * @param array<mixed>|string $value
	 * @return array<mixed>
	 */
	private function decode(array|string $value): array
	{
		return is_array($value) ? $value : (array)Json::decode($value);
	}
}
