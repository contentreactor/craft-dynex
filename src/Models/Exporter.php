<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Models;

use ContentReactor\Dynex\Attributes\FromJsonArray;
use ContentReactor\Dynex\Helpers\ReflectionHelper;
use ContentReactor\Dynex\Plugin;
use ContentReactor\Dynex\Records\Exporter as ExporterRecord;
use Craft;
use craft\base\{
	ElementInterface,
	Model,
};
use craft\validators\{
	HandleValidator,
	UniqueValidator,
};

/**
 * Exporter model
 */
class Exporter extends Model
{
	public ?int $id = null;
	/** The user this exporter belongs to */
	public ?int $userId = null;
	public ?string $name = null;
	public ?string $handle = null;
	/** @var ?class-string<ElementInterface> */
	public ?string $elementType = null;
	/** @var string[] */
	public null|string|array $elementSources = null;

	/** @var FieldConfig[] */
	#[FromJsonArray(FieldConfig::class)]
	public array $fieldMapping = [];
	public ?int $sortOrder = null;
	public ?int $conditionId = null;
	public ?string $uid = null;

	public function __construct(string|array $config = [])
	{
		parent::__construct($config);
		ReflectionHelper::map($this, $config);
	}

	/**
	 * @param array<FieldConfig|array<string, mixed>> $fieldMapping
	 */
	public function setFieldMapping(array $fieldMapping): void
	{

		if (collect($fieldMapping)->every(fn (mixed $member): bool => $member instanceof FieldConfig)) {
			$this->fieldMapping = $fieldMapping;
			return;
		}

		ReflectionHelper::map($this, [
			'fieldMapping' => $fieldMapping,
		]);
	}

	public function init(): void
	{
		//dd(StringHelper::UUID());
	}

	/**
	 * @return array<mixed>
	 */
	protected function defineRules(): array
	{
		$rules = parent::defineRules();
		$rules[] = [['id', 'userId'], 'number', 'integerOnly' => true];
		$rules[] = [['userId', 'name', 'handle', 'elementType', 'elementSources'], 'required'];
		$rules[] = [['name', 'handle', 'elementType'], 'string', 'max' => 255];
		$rules[] = [
			['handle'],
			HandleValidator::class,
			'reservedWords' => ['id', 'dateCreated', 'dateUpdated', 'uid', 'title'],
		];
		$rules[] = [
			['name'],
			UniqueValidator::class,
			'targetClass' => ExporterRecord::class,
			'targetAttribute' => ['name', 'elementType', 'userId'],
			'message' => Craft::t('dynex', '{attribute} "{value}" has already been taken.'),
		];
		$rules[] = [
			['handle'],
			UniqueValidator::class,
			'targetClass' => ExporterRecord::class,
			'targetAttribute' => ['handle', 'elementType', 'userId'],
			'message' => Craft::t('dynex', '{attribute} "{value}" has already been taken.'),
		];

		return $rules;
	}

	/**
	 * The display name of the element type the exporter exports, e.g. “Entry”
	 */
	public function getElementTypeName(): string
	{
		$elementType = $this->elementType;

		return $elementType !== null && is_subclass_of($elementType, ElementInterface::class) ? $elementType::displayName() : (string)$elementType;
	}

	public function getCondition(): Condition
	{
		return Plugin::getInstance()->getConditions()->getConditionById($this->conditionId);
	}
}
