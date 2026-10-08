<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Services;

use ContentReactor\Dynex\Events\{
	ExporterEvent,
	RegisterExportersEvent,
};
use ContentReactor\Dynex\Models\{
	Exporter as ExporterModel,
	FieldConfig,
};
use ContentReactor\Dynex\Records\Exporter as ExporterRecord;
use Craft;
use craft\base\MemoizableArray;
use craft\db\Query;
use craft\elements\User;
use craft\helpers\{
	Db,
	Json,
	StringHelper,
};
use InvalidArgumentException;
use Throwable;
use yii\base\{
	Component,
	Event,
};

class Exporters extends Component
{
	/** The version of the definitions [[getDefinition()]] makes */
	public const DEFINITION_VERSION = 1;

	public const EVENT_REGISTER_EXPORTERS = 'eventRegisterExporters';
	public const EVENT_BEFORE_SAVE_EXPORTER = 'beforeSaveExporter';
	public const EVENT_AFTER_SAVE_EXPORTER = 'afterSaveExporter';
	/** User preference holding the ID of the user's selected exporter */
	public const PREFERENCE_SELECTED_EXPORTER = 'dynexExporterId';
	/** @var MemoizableArray<ExporterModel>|null */
	private ?MemoizableArray $exporters = null;

	/**
	 * Returns every user's exporters. Use [[getUserExporters()]] for anything a user sees.
	 *
	 * @return ExporterModel[]
	 */
	public function getAllExporters(): array
	{
		return $this->exporters()->all();
	}

	/**
	 * @param int|null $userId Defaults to the current user
	 * @return ExporterModel[]
	 */
	public function getUserExporters(?int $userId = null): array
	{
		$userId ??= $this->currentUserId();
		if ($userId === null) {
			return [];
		}

		return array_values(array_filter(
			$this->exporters()->all(),
			fn(ExporterModel $exporter): bool => $exporter->userId === $userId,
		));
	}

	/**
	 * @return MemoizableArray<ExporterModel>
	 */
	private function exporters(): MemoizableArray
	{
		if (!isset($this->exporters)) {
			$exporters = [];

			/** @var ExporterRecord[] $exporterRecords */
			$exporterRecords = ExporterRecord::find()
				->orderBy(['sortOrder' => SORT_ASC])
				->all();

			foreach ($exporterRecords as $exporterRecord) {
				$attributes = $exporterRecord->getAttributes(except: [
					'dateCreated',
					'dateUpdated',
					'dateDeleted',
				]);
				// MySQL returns booleans as integers
				$attributes['importable'] = (bool)($attributes['importable'] ?? false);
				$exporter = new ExporterModel($attributes);
				$exporters[] = $exporter;
			}

			$event = new RegisterExportersEvent([
				'exporters' => $exporters,
			]);
			Event::trigger(self::class, self::EVENT_REGISTER_EXPORTERS, $event);
			$this->exporters = new MemoizableArray($event->exporters);
		}

		return $this->exporters;
	}

	/**
	 * Returns an exporter regardless of who owns it. Use [[getUserExporterById()]] for anything a user sees.
	 */
	public function getExporterById(?int $id): ?ExporterModel
	{
		if (!$id) return null;
		return $this->exporters()->firstWhere('id', $id);
	}

	/**
	 * @param int|null $userId Defaults to the current user
	 */
	public function getUserExporterById(?int $id, ?int $userId = null): ?ExporterModel
	{
		$userId ??= $this->currentUserId();
		$exporter = $this->getExporterById($id);

		if ($exporter === null || $userId === null || $exporter->userId !== $userId) {
			return null;
		}

		return $exporter;
	}

	public function getExporterByUid(string $uid): ?ExporterModel
	{
		return $this->exporters()->firstWhere('uid', $uid);
	}

	/**
	 * @param int|null $userId Defaults to the current user
	 */
	public function getSelectedExporter(?int $userId = null): ?ExporterModel
	{
		$userId ??= $this->currentUserId();
		if ($userId === null) {
			return null;
		}

		$exporterId = Craft::$app->getUsers()->getUserPreference($userId, self::PREFERENCE_SELECTED_EXPORTER);

		return $this->getUserExporterById(is_numeric($exporterId) ? (int) $exporterId : null, $userId);
	}

	public function setSelectedExporter(User $user, ?ExporterModel $exporter): void
	{
		if ($exporter !== null && $exporter->userId !== $user->id) {
			throw new InvalidArgumentException("Exporter $exporter->id doesn’t belong to user $user->id.");
		}

		Craft::$app->getUsers()->saveUserPreferences($user, [
			self::PREFERENCE_SELECTED_EXPORTER => $exporter?->id,
		]);
	}

	public function saveExporter(ExporterModel $exporter, bool $runValidation = true): bool
	{
		$isNewExporter = !$exporter->id;

		if ($this->hasEventHandlers(self::EVENT_BEFORE_SAVE_EXPORTER)) {
			$this->trigger(self::EVENT_BEFORE_SAVE_EXPORTER, new ExporterEvent([
				'exporter' => $exporter,
				'isNew' => $isNewExporter,
			]));
		}

		if ($runValidation && !$exporter->validate()) {
			Craft::info('Exporter not saved due to validation error.', __METHOD__);
			return false;
		}

		if ($isNewExporter) {
			$exporter->uid = StringHelper::UUID();

			$maxSortOrder = (new Query())
				->from([ExporterRecord::tableName()])
				->where([
					'userId' => $exporter->userId,
					'dateDeleted' => null,
				])
				->max('[[sortOrder]]');
			$exporter->sortOrder = $maxSortOrder ? $maxSortOrder + 1 : 1;
		}

		try {
			$this->saveExporterRecord($exporter);
		} catch (Throwable) {
			return false;
		}

		if ($isNewExporter) {
			$exporter->id = Db::idByUid(ExporterRecord::tableName(), $exporter->uid);
		}

		return true;
	}

	protected function saveExporterRecord(ExporterModel $exporter): bool
	{
		$exporterRecord = $this->_getExporterRecord($exporter->uid, true);

		$transaction = Craft::$app->getDb()->beginTransaction();

		try {
			$isNewExporter = $exporterRecord->getIsNewRecord();

			$exporterRecord->userId = $exporter->userId;
			$exporterRecord->name = $exporter->name;
			$exporterRecord->handle = $exporter->handle;
			$exporterRecord->elementType = $exporter->elementType;
			$exporterRecord->elementSources = $exporter->elementSources;
			$exporterRecord->fieldMapping = $exporter->fieldMapping;
			$exporterRecord->importable = $exporter->importable;
			$exporterRecord->options = $exporter->getOptions();
			$exporterRecord->conditionId = $exporter->conditionId;
			$exporterRecord->sortOrder = $exporter->sortOrder;
			$exporterRecord->uid = $exporter->uid;

			// Save the entry type
			if ((bool)$exporterRecord->dateDeleted) {
				$exporterRecord->restore();
			} else {
				$exporterRecord->save(false);
			}

			$transaction->commit();
		} catch (Throwable $e) {
			$transaction->rollBack();
			throw $e;
		}

		// Clear caches
		$this->exporters = null;

		$exporter = $this->getExporterById($exporterRecord->id);

		// Fire an 'afterSaveExporter' event
		if ($this->hasEventHandlers(self::EVENT_AFTER_SAVE_EXPORTER)) {
			$this->trigger(self::EVENT_AFTER_SAVE_EXPORTER, new ExporterEvent([
				'exporter' => $exporter,
				'isNew' => $isNewExporter,
			]));
		}

		return true;
	}

	/**
	 * Deletes an exporter, softly. Users who had it selected no longer do.
	 */
	public function deleteExporter(ExporterModel $exporter): bool
	{
		$record = $exporter->uid !== null ? $this->_getExporterRecord($exporter->uid) : null;
		if ($record === null || $record->getIsNewRecord()) {
			return false;
		}

		$record->softDelete();
		$this->exporters = null;

		$user = Craft::$app->getUsers()->getUserById((int)$exporter->userId);
		if ($user !== null && $this->getSelectedExporter((int)$user->id) === null) {
			Craft::$app->getUsers()->saveUserPreferences($user, [self::PREFERENCE_SELECTED_EXPORTER => null]);
		}

		return true;
	}

	/**
	 * An exporter as JSON-ready data, to create it in another project with [[createFromDefinition()]]. Fields are referred to by
	 * their UIDs, which the project config keeps the same in every environment, rather than their IDs.
	 *
	 * @return array<string, mixed>
	 */
	public function getDefinition(ExporterModel $exporter): array
	{
		return [
			'dynexExporter' => self::DEFINITION_VERSION,
			'name' => $exporter->name,
			'handle' => $exporter->handle,
			'elementType' => $exporter->elementType,
			'elementSources' => $exporter->elementSources,
			'importable' => $exporter->importable,
			'options' => $exporter->getOptions(),
			'fieldMapping' => array_values(array_filter(array_map(
				fn(FieldConfig $fieldConfig): ?array => $fieldConfig->type === FieldConfig::TYPE_CALLABLE ? null : $this->withFieldUids(Json::decode(Json::encode($fieldConfig))),
				$exporter->fieldMapping,
			))),
		];
	}

	/**
	 * Creates an exporter for a user from a definition [[getDefinition()]] made, in this project or another. A name or handle the
	 * user has for another exporter of the element type gets a number appended.
	 *
	 * @param array<string, mixed> $definition
	 * @return array{0: ExporterModel, 1: string[]} The exporter, unsaved if it doesn't validate, and the labels of mapped fields
	 * this project doesn't have, which export nothing
	 * @throws InvalidArgumentException if it isn't a definition of an exporter of an element type this project has
	 */
	public function createFromDefinition(array $definition, User $user): array
	{
		$elementType = $definition['elementType'] ?? null;
		if (!isset($definition['dynexExporter']) || !is_string($elementType) || !in_array($elementType, Craft::$app->getElements()->getAllElementTypes(), true)) {
			throw new InvalidArgumentException(Craft::t('dynex', 'The file isn’t an exporter for an element type this project has.'));
		}

		$missing = [];
		$fieldMapping = array_map(function(mixed $config) use (&$missing): FieldConfig {
			return new FieldConfig($this->withFieldIds((array)$config, $missing));
		}, (array)($definition['fieldMapping'] ?? []));

		$exporter = new ExporterModel([
			'userId' => $user->id,
			'name' => $this->uniqueValue('name', (string)($definition['name'] ?? ''), $elementType, (int)$user->id, ' '),
			'handle' => $this->uniqueValue('handle', (string)($definition['handle'] ?? ''), $elementType, (int)$user->id),
			'elementType' => $elementType,
			'elementSources' => $definition['elementSources'] ?? '*',
			'importable' => (bool)($definition['importable'] ?? false),
			'options' => (array)($definition['options'] ?? []),
		]);
		$exporter->fieldMapping = $fieldMapping;

		$this->saveExporter($exporter);

		return [$exporter, array_values(array_unique($missing))];
	}

	/**
	 * @param array<string, mixed> $config
	 * @return array<string, mixed>
	 */
	private function withFieldUids(array $config): array
	{
		if (!empty($config['fieldId'])) {
			$config['fieldUid'] = Craft::$app->getFields()->getFieldById((int)$config['fieldId'])?->uid;
		}
		if (is_array($config['nested'] ?? null)) {
			$config['nested'] = $this->withFieldUids($config['nested']);
		}

		return $config;
	}

	/**
	 * @param array<string, mixed> $config
	 * @param string[] $missing Filled with the labels of fields this project doesn't have
	 * @return array<string, mixed>
	 */
	private function withFieldIds(array $config, array &$missing): array
	{
		if (!empty($config['fieldUid'])) {
			$field = Craft::$app->getFields()->getFieldByUid((string)$config['fieldUid']);
			$config['fieldId'] = $field?->id;
			if ($field === null) {
				$missing[] = (string)($config['label'] ?? $config['handle'] ?? '');
			}
		}
		unset($config['fieldUid']);
		if (is_array($config['nested'] ?? null)) {
			$config['nested'] = $this->withFieldIds($config['nested'], $missing);
		}

		return $config;
	}

	/**
	 * A name or handle no other exporter of the user for the element type has
	 */
	private function uniqueValue(string $attribute, string $value, string $elementType, int $userId, string $glue = ''): string
	{
		$taken = array_map(
			fn(ExporterModel $exporter): string => (string)$exporter->$attribute,
			array_filter($this->getUserExporters($userId), fn(ExporterModel $exporter): bool => $exporter->elementType === $elementType),
		);

		$candidate = $value;
		for ($i = 2; in_array($candidate, $taken, true); $i++) {
			$candidate = $value . $glue . $i;
		}

		return $candidate;
	}

	private function _getExporterRecord(string $uid, bool $withTrashed = false): ExporterRecord
	{
		$query = $withTrashed ? ExporterRecord::findWithTrashed() : ExporterRecord::find();
		$query->andWhere(['uid' => $uid]);
		/** @noinspection PhpIncompatibleReturnTypeInspection */
		/** @var ExporterRecord */
		return $query->one() ?? new ExporterRecord();
	}

	private function currentUserId(): ?int
	{
		if (Craft::$app->getRequest()->getIsConsoleRequest()) {
			return null;
		}

		$userId = Craft::$app->getUser()->getId();

		return $userId !== null ? (int) $userId : null;
	}
}