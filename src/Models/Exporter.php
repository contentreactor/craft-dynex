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
use craft\helpers\Json;
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
	/** Whether its exports can be imported back, see [[\ContentReactor\Dynex\Services\Columns]] */
	public bool $importable = false;

	/** Lists of values, like related elements, take a row each */
	public const LAYOUT_ROWS = 'rows';
	/** Lists of values are joined into their cell, one row per element */
	public const LAYOUT_JOINED = 'joined';

	/** Formats export runs write, see [[\ContentReactor\Dynex\Services\ExportRuns]] */
	public const RUN_FORMATS = ['csv', 'xlsx', 'json', 'xml'];

	/** @var self::LAYOUT_* How lists of values are laid out. Importable exporters always give them a row each. */
	public string $multiValueLayout = self::LAYOUT_ROWS;
	/** What joins lists of values into their cell */
	public string $valueSeparator = ', ';
	/** The format export runs write */
	public string $runFormat = 'csv';
	/** The handle of the site export runs export, the primary site's by default */
	public ?string $runSite = null;
	/** Whether export runs only export enabled elements */
	public bool $runEnabledOnly = true;
	/** Export runs only export elements created in the past so many days, all of them when `null` */
	public ?int $runCreatedWithinDays = null;
	/** Email addresses export runs send their files to, separated by commas or new lines */
	public string $deliveryEmails = '';
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

	/**
	 * The options stored with the exporter, besides its field mapping
	 *
	 * @return array<string, mixed>
	 */
	public function getOptions(): array
	{
		return [
			'multiValueLayout' => $this->multiValueLayout,
			'valueSeparator' => $this->valueSeparator,
			'runFormat' => $this->runFormat,
			'runSite' => $this->runSite,
			'runEnabledOnly' => $this->runEnabledOnly,
			'runCreatedWithinDays' => $this->runCreatedWithinDays,
			'deliveryEmails' => $this->deliveryEmails,
		];
	}

	/**
	 * @param array<string, mixed>|string|null $options As stored, JSON on some databases
	 */
	public function setOptions(array|string|null $options): void
	{
		$options = is_string($options) ? (array)Json::decodeIfJson($options) : (array)$options;

		foreach ($this->getOptions() as $name => $default) {
			if (!array_key_exists($name, $options)) {
				continue;
			}

			$value = $options[$name];
			$this->$name = match ($name) {
				'runEnabledOnly' => (bool)$value,
				'runCreatedWithinDays' => $value === null || $value === '' ? null : (int)$value,
				'runSite' => $value === null || $value === '' ? null : (string)$value,
				default => (string)$value,
			};
		}
	}

	/**
	 * How lists of values are laid out in exports. Importable exports need a row per value to import them back.
	 *
	 * @return self::LAYOUT_*
	 */
	public function getEffectiveMultiValueLayout(): string
	{
		return $this->importable ? self::LAYOUT_ROWS : $this->multiValueLayout;
	}

	/**
	 * @return string[] The email addresses export runs send their files to
	 */
	public function getDeliveryEmails(): array
	{
		return array_values(array_filter(array_map('trim', preg_split('/[\s,;]+/', $this->deliveryEmails) ?: [])));
	}

	/**
	 * @return array<mixed>
	 */
	protected function defineRules(): array
	{
		$rules = parent::defineRules();
		$rules[] = [['id', 'userId'], 'number', 'integerOnly' => true];
		$rules[] = [['importable', 'runEnabledOnly'], 'boolean'];
		$rules[] = [['multiValueLayout'], 'in', 'range' => [self::LAYOUT_ROWS, self::LAYOUT_JOINED]];
		$rules[] = [['valueSeparator'], 'string', 'max' => 20];
		$rules[] = [['runFormat'], 'in', 'range' => self::RUN_FORMATS];
		$rules[] = [['runCreatedWithinDays'], 'integer', 'min' => 1];
		$rules[] = [['runSite'], function(string $attribute): void {
			if ($this->runSite !== null && Craft::$app->getSites()->getSiteByHandle($this->runSite, false) === null) {
				$this->addError($attribute, Craft::t('dynex', 'There’s no “{site}” site.', ['site' => $this->runSite]));
			}
		}];
		$rules[] = [['deliveryEmails'], function(string $attribute): void {
			foreach ($this->getDeliveryEmails() as $email) {
				if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
					$this->addError($attribute, Craft::t('dynex', '“{email}” isn’t an email address.', ['email' => $email]));
				}
			}
		}];
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
