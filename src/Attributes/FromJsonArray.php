<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Attributes;

use Attribute;
use yii\base\Model;

#[Attribute(Attribute::TARGET_PROPERTY)]
class FromJsonArray
{
	/**
	 * @param class-string<Model> $className
	 */
	public function __construct(public string $className) {}
}