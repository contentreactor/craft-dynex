<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Events;

use ContentReactor\Dynex\Helpers\TemplateHelper;
use ContentReactor\Dynex\Models\FieldConfig;
use craft\base\Event;

/**
 * @phpstan-import-type FieldGroup from TemplateHelper
 */
class DefineSidebarElements extends Event
{
	/**
	 * The fields shown in the sidebar, in groups with an optional heading (e.g. one per Matrix block type).
	 *
	 * @var array<int, FieldGroup>
	 */
	public array $fieldGroups = [];
	/** @var FieldConfig[] */
	public array $availableComplexFields = [];
}