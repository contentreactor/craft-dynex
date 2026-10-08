<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Models;

use craft\base\Model;

class Settings extends Model
{
	/** Shown wherever the control panel names the plugin. Blank falls back to the default name. */
	public string $pluginName = 'Dynamic Exporter';
	public bool $deregisterDefaultExporters = false;
	/** How many days export runs and their files are kept, `0` to keep them until they're deleted */
	public int $exportRetentionDays = 30;

	/**
	 * @return array<mixed>
	 */
	protected function defineRules(): array
	{
		return [
			[['pluginName'], 'trim'],
			[['pluginName'], 'string', 'max' => 255],
			[['exportRetentionDays'], 'integer', 'min' => 0],
		];
	}
}