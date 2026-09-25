<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Events;

use ContentReactor\Dynex\Models\FieldConfig;
use craft\base\ElementInterface;
use yii\base\Event;

class MapFieldEvent extends Event
{
	public ?ElementInterface $element = null;
	public FieldConfig $fieldConfig;
	/** @var mixed Setting a non-null value before mapping skips the default mapping */
	public mixed $value = null;
}