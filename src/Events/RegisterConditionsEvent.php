<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Events;

use ContentReactor\Dynex\Models\Condition;
use craft\base\Event;

class RegisterConditionsEvent extends Event
{
	/** @var Condition[] */
	public array $conditions = [];
}
