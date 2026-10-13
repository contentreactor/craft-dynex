<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Events;

use ContentReactor\Dynex\Models\Exporter;
use craft\base\Event;

class RegisterExportersEvent extends Event
{
	/** @var Exporter[] */
	public array $exporters = [];
}
