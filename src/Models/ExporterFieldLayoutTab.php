<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Models;

use craft\models\FieldLayoutTab;

/**
 * A layout tab holding an exporter’s field mapping. The mapping is kept apart from Craft’s
 * layout elements, since [[FieldConfig]] isn't a [[\craft\base\FieldLayoutElement]].
 */
class ExporterFieldLayoutTab extends FieldLayoutTab
{
	/** @var FieldConfig[] */
	private array $fieldConfigs = [];

	/**
	 * @param FieldConfig[] $fieldConfigs
	 */
	public function setFieldConfigs(array $fieldConfigs): void
	{
		$this->fieldConfigs = $fieldConfigs;
	}

	/**
	 * @return FieldConfig[]
	 */
	public function getFieldConfigs(): array
	{
		return $this->fieldConfigs;
	}

	/**
	 * Returns the field mapping, so [[getConfig()]] carries it instead of Craft’s layout elements.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public function getElementConfigs(): array
	{
		return array_map(fn(FieldConfig $fieldConfig): array => $fieldConfig->toArray(), array_values($this->fieldConfigs));
	}
}