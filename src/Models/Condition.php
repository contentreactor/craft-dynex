<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Models;

use craft\base\{
	ElementInterface,
	Model,
};
use DateTime;

class Condition extends Model
{
	public ?int $id;
	public string $name;
	/** @var class-string<ElementInterface> */
	public string $elementType;
	/** @var boolean Determines whether it creates a new query or narrows an existing query */
	public bool $fullQuery;
	/** @var array<string, mixed> */
	public array $criteria;
	public DateTime $dateUpdated;
	public string $uid;

	/**
	 * @return array<string, mixed>
	 */
	public function getCriteria(): array
	{
		return $this->criteria;
	}
}
