<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Events;

use ContentReactor\Dynex\Models\Exporter;
use craft\base\Event;

class ExporterEvent extends Event
{
	public Exporter $exporter;
	public bool $isNew = false;
}
