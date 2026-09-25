<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Events;

use craft\base\{
	ElementInterface,
	Event,
};
use MarcusGaius\FieldValueParser\Models\ElementAttribute;

/**
 * Lets plugins add, change or remove the native attributes offered for an element type,
 * e.g. for their own element types.
 */
class DefineElementAttributesEvent extends Event
{
	/** @var class-string<ElementInterface> */
	public string $elementType;

	/** @var array<string, ElementAttribute> Keyed by handle */
	public array $attributes = [];
}