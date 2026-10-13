<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Services;

use ContentReactor\Dynex\Events\RegisterConditionsEvent;
use ContentReactor\Dynex\Models\Condition as ConditionModel;
use ContentReactor\Dynex\Records\Condition as ConditionRecord;
use craft\base\MemoizableArray;
use yii\base\Event;

class Conditions
{
	public const EVENT_REGISTER_CONDITIONS = 'eventRegisterConditions';

	/**
	 * @var ?MemoizableArray<ConditionModel> $conditions
	 */
	private ?MemoizableArray $conditions = null;

	/**
	 * @return ConditionModel[]
	 */
	public function getAllConditions(): array
	{
		return $this->conditions()->all();
	}

	/**
	 * @return MemoizableArray<ConditionModel>
	 */
	private function conditions(): MemoizableArray
	{
		if (!isset($this->conditions)) {
			$conditions = [];

			/** @var ConditionRecord[] $conditionRecords */
			$conditionRecords = ConditionRecord::find()
				->orderBy(['name' => SORT_ASC])
				->all();

			foreach ($conditionRecords as $conditionRecord) {
				$condition = new ConditionModel();
				$condition->setAttributes($conditionRecord->getAttributes(), false);
				$conditions[] = $condition;
			}

			$event = new RegisterConditionsEvent([
				'conditions' => $conditions,
			]);
			Event::trigger(self::class, self::EVENT_REGISTER_CONDITIONS, $event);
			$this->conditions = new MemoizableArray($event->conditions);
		}

		return $this->conditions;
	}

	public function getConditionById(int $id): ?ConditionModel
	{
		return $this->conditions()->firstWhere('id', $id);
	}

	public function getConditionByUid(string $uid): ?ConditionModel
	{
		return $this->conditions()->firstWhere('uid', $uid);
	}
}
