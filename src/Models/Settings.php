<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Models;

use craft\base\Model;

class Settings extends Model
{
	/** Shown wherever the control panel names the plugin. Blank falls back to the default name. */
	public string $pluginName = 'Dynamic Exporter';
	public bool $deregisterDefaultExporters = false;

	/**
	 * @return array<mixed>
	 */
	protected function defineRules(): array
	{
		return [
			[['pluginName'], 'trim'],
			[['pluginName'], 'string', 'max' => 255],
		];
	}
}