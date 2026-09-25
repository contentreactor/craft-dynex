<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Models;

use ContentReactor\Dynex\Plugin;
use craft\models\FieldLayout;

class ExporterFieldLayout extends FieldLayout
{
	/**
	 * @return FieldConfig[]
	 */
	public function getUsedCustomFields(): array
	{
		return Plugin::getInstance()->elements->getFieldConfigsFromLayout($this);
	}
}