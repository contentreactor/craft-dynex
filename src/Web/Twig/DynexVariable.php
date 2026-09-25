<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Web\Twig;

use ContentReactor\Dynex\Models\{
	Exporter,
	Settings,
};
use ContentReactor\Dynex\Plugin;
use yii\di\ServiceLocator;

class DynexVariable extends ServiceLocator
{
	public function getPluginName(): string
	{
		return Plugin::getInstance()->getPluginName();
	}

	/**
	 * @return Exporter[] The current user’s exporters
	 */
	public function getExporters(): array
	{
		return Plugin::getInstance()->getExporters()->getUserExporters();
	}

	public function getExporterById(int $exporterId): ?Exporter
	{
		return Plugin::getInstance()->getExporters()->getUserExporterById($exporterId);
	}

	public function getSelectedExporter(): ?Exporter
	{
		return Plugin::getInstance()->getExporters()->getSelectedExporter();
	}

	public function getSettings(): Settings
	{
		return Plugin::getInstance()->getSettings();
	}
}