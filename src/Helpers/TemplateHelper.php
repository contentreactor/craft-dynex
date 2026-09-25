<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Helpers;

use ContentReactor\Dynex\Events\DefineSidebarElements;
use ContentReactor\Dynex\Models\{
	Exporter,
	ExporterFieldLayout as FieldLayout,
	ExporterFieldLayoutTab as FieldLayoutTab,
	FieldConfig,
};
use ContentReactor\Dynex\Plugin;
use Craft;
use craft\base\{
	ElementInterface,
	FieldInterface,
};
use craft\elements\Address;
use craft\fields\{
	Addresses as AddressesField,
	BaseRelationField,
};
use craft\helpers\{
	ArrayHelper,
	Cp,
	Html,
	Json,
	StringHelper,
};
use craft\models\FieldLayout as BaseFieldLayout;
use Illuminate\Support\Collection;
use yii\base\Event;

/**
 * @phpstan-type FieldGroup array{heading: string|null, fields: FieldConfig[]}
 */
class TemplateHelper
{
	public const EVENT_DEFINE_SIDEBAR_ELEMENTS = 'defineSidebarElements';

	/**
	 * Renders a field layout designer.
	 *
	 * @param FieldLayout $fieldLayout
	 * @param array<string, mixed> $config
	 * @return string
	 */
	public static function fieldLayoutDesignerHtml(FieldLayout $fieldLayout, array $config = []): string
	{
		$config += [
			'id' => 'fld' . mt_rand(),
			'customizableTabs' => false,
			'customizableUi' => false,
			'exporter' => null,
		];

		if (!$config['exporter'] instanceof Exporter) return '';

		$exporter = $config['exporter'];

		$tab = new FieldLayoutTab([
			'name' => Craft::t('app', 'Field Mapping'),
			'uid' => StringHelper::UUID(),
			'layout' => $fieldLayout,
		]);

		$tab->setFieldConfigs($exporter->fieldMapping);

		if (!isset($tab->uid)) {
			$tab->uid = StringHelper::UUID();
		}

		foreach ($tab->getFieldConfigs() as $fieldConfig) {
			if (!isset($fieldConfig->uid)) {
				$fieldConfig->uid = StringHelper::UUID();
			}
		}

		$view = Craft::$app->getView();
		$namespacedId = $view->namespaceInputId($config['id']);

		$js = <<<JS
new Craft.ExporterLayoutDesigner("#$namespacedId")
JS;
		$view->registerJs($js);

		$label = self::getLabelFromSources($exporter);
		$layouts = self::getLayoutsFromSources($exporter->elementType, $exporter->elementSources);

		$fieldLayoutConfig = [
			'uid' => $fieldLayout->uid,
			'tabs' => [$tab->getConfig()],
		];

		if ($fieldLayout->id) {
			$fieldLayoutConfig['id'] = $fieldLayout->id;
		}

		$newTabSettingsData = self::_fldTabSettingsData(new FieldLayoutTab([
			'uid' => 'TAB_UID',
			'name' => 'TAB_NAME',
			'layout' => $fieldLayout,
		]));

		return
			Html::beginTag('div', [
				'id' => $config['id'],
				'class' => [
					'layoutdesigner',
					'exporter-designer',
				],
				'style' => [
					'--nesting-levels' => 0,
					'--sidebar-width' => 'calc(var(--base-sidebar-width) + var(--nesting-levels) * 14px)',
				],
				'data' => [
					'nesting-levels' => 0,
					'new-tab-settings-namespace' => $newTabSettingsData['settings-namespace'],
					'new-tab-settings-html' => $newTabSettingsData['settings-html'],
					'new-tab-settings-js' => $newTabSettingsData['settings-js'],
				],
			]) .
			Html::hiddenInput('fieldLayout', Json::encode($fieldLayoutConfig), [
				'data' => ['config-input' => true],
			]) .
			Html::beginTag('div', ['class' => 'fld-workspace']) .
			Html::beginTag('div', ['class' => 'fld-tabs']) .
			self::_fldTabHtml($tab) .
			Html::endTag('div') .
			Html::endTag('div') . // .fld-workspace
			self::sidebarHtml(self::getElementFieldGroups($exporter->elementType, $layouts), $label) . // sidebar
			Html::endTag('div'); // .layoutdesigner
	}

	/**
	 * Renders a sidebar.
	 *
	 * @param array<int, FieldGroup> $fieldGroups
	 * @param string $sidebarName
	 * @param FieldConfig|null $nestingParent The field this sidebar expands. Its fields get nested under it.
	 * @param int $sidebarLevel
	 * @return string
	 */
	public static function sidebarHtml(
		array        $fieldGroups,
		string       $sidebarName,
		?FieldConfig $nestingParent = null,
		int          $sidebarLevel = 0,
	): string
	{
		if ($nestingParent !== null) {
			$fieldGroups = array_map(fn(array $group): array => [
				'heading' => $group['heading'],
				'fields' => self::nestFieldConfigs($nestingParent, $group['fields']),
			], $fieldGroups);
		}

		$event = new DefineSidebarElements([
			'fieldGroups' => $fieldGroups,
			'availableComplexFields' => [],
		]);
		Event::trigger(self::class, self::EVENT_DEFINE_SIDEBAR_ELEMENTS, $event);

		$fieldGroups = $event->fieldGroups;
		$availableComplexFields = $event->availableComplexFields;

		$customCount = array_sum(array_map(fn(array $group): int => count($group['fields']), $fieldGroups));
		$complexCount = count($availableComplexFields);

		return Html::beginTag('div', [
				'class' => [
					'fld-sidebar',
					$sidebarLevel > 0 ? 'nested' : '',
				],
				'style' => [
					'--nesting-level' => $sidebarLevel,
					'z-index' => max($sidebarLevel, 0),
				],
				'data' => [
					'parent-path' => $nestingParent?->handle,
					'parent-config' => $nestingParent?->toArray(),
				],
			]) .
			Html::tag('div', Html::tag('p', Html::encode($sidebarName) . (
				// Nested sidebars can be closed with this button, as well as with Escape
				$sidebarLevel > 0 ? Html::button('', [
					'type' => 'button',
					'class' => ['sidebar-close', 'close-btn'],
					'title' => Craft::t('app', 'Close'),
					'aria' => ['label' => Craft::t('app', 'Close')],
				]) : ''
			), [
				'class' => 'sidebar-name',
			]), [
				'class' => 'sidebar-name-wrapper',
				'style' => [
					'z-index' => max($sidebarLevel, 1),
				],
			]) .
			Html::beginTag('section', [
				'class' => ['btngroup', 'btngroup--exclusive', 'small', 'fullwidth'],
				'aria' => ['label' => Craft::t('dynex', 'Layout element types')],
			]) .
			($customCount > 0 ? Html::button(Craft::t('dynex', 'Fields'), [
				'type' => 'button',
				'class' => ['btn', 'small', 'active'],
				'aria' => ['pressed' => 'true'],
				'data' => ['library' => 'field'],
			]) : '') .
			($complexCount > 0 ? Html::button(Craft::t('dynex', 'Complex Fields'), [
				'type' => 'button',
				'class' => ['btn', 'small'],
				'aria' => ['pressed' => 'false'],
				'data' => ['library' => 'complex'],
			]) : '') .
			Html::endTag('section') .
			($customCount > 0 ? self::_fldLibrary('field', $fieldGroups) : '') .
			($complexCount > 0 ? self::_fldLibrary('complex', [['heading' => null, 'fields' => $availableComplexFields]], hidden: true) : '') .
			Html::endTag('div'); // .fld-sidebar
	}

	/**
	 * @param array<int, FieldGroup> $fieldGroups
	 */
	private static function _fldLibrary(string $name, array $fieldGroups, bool $hidden = false): string
	{
		return Html::beginTag('div', [
				'class' => [
					'fld-library',
					"fld-$name-library",
					$hidden ? 'hidden' : null,
				],
				'data' => ['library' => $name],
			]) .
			Html::beginTag('div', ['class' => ['texticon', 'search', 'icon', 'clearable']]) .
			Cp::textHtml([
				'class' => 'fullwidth',
				'inputmode' => 'search',
				'placeholder' => Craft::t('app', 'Search'),
			]) .
			Html::tag('div', '', [
				'class' => ['clear-btn', 'hidden'],
				'title' => Craft::t('app', 'Clear'),
				'aria' => ['label' => Craft::t('app', 'Clear')],
			]) .
			Html::endTag('div') . // .search
			implode('', array_map(
				fn(array $group): string => $group['fields'] ? self::_fldFieldSelectorsHtml($group['fields'], $group['heading']) : '',
				$fieldGroups,
			)) .
			Html::endTag('div');
	}

	/**
	 * @param FieldLayoutTab $tab
	 * @return string
	 */
	private static function _fldTabHtml(FieldLayoutTab $tab): string
	{
		return
			Html::beginTag('div', [
				'class' => 'fld-tab',
				'data' => array_merge([
					'uid' => $tab->uid,
				], self::_fldTabSettingsData($tab)),
			]) .
			Html::beginTag('div', ['class' => 'tabs']) .
			Html::beginTag('div', [
				'class' => [
					'tab',
					'sel',
				],
			]) .
			Html::beginTag('span') .
			Html::encode($tab->name) .
			($tab->hasConditions() ? Html::tag('div', '', [
				'class' => ['fld-indicator'],
				'title' => Craft::t('app', 'This tab is conditional'),
				'aria' => ['label' => Craft::t('app', 'This tab is conditional')],
				'data' => ['icon' => 'condition'],
				'role' => 'img',
			]) : '') .
			Html::endTag('span') .
			Html::endTag('div') . // .tab
			Html::endTag('div') . // .tabs
			Html::beginTag('div', ['class' => 'fld-tabcontent']) .
			implode('', array_map(fn(FieldConfig $fieldConfig) => self::_fldElementSelectorHtml($fieldConfig, false), $tab->getFieldConfigs())) .
			Html::endTag('div') . // .fld-tabcontent
			Html::endTag('div'); // .fld-tab
	}

	/**
	 * @return array{
	 *     settings-namespace: string,
	 *     settings-html: string,
	 *     settings-js: array<mixed>|false|string
	 * }
	 */
	private static function _fldTabSettingsData(FieldLayoutTab $tab): array
	{
		$view = Craft::$app->getView();
		$oldNamespace = $view->getNamespace();
		$namespace = $view->namespaceInputName("tab-$tab->uid");
		$view->setNamespace($namespace);
		$view->startJsBuffer();
		$settingsHtml = $view->namespaceInputs($tab->getSettingsHtml());
		$settingsJs = $view->clearJsBuffer(false);
		$view->setNamespace($oldNamespace);

		return [
			'settings-namespace' => $namespace,
			'settings-html' => $settingsHtml,
			'settings-js' => $settingsJs,
		];
	}

	/**
	 * @param FieldConfig $fieldConfig
	 * @param bool $forLibrary
	 * @param array<string, mixed> $attr
	 * @return string
	 */
	private static function _fldElementSelectorHtml(FieldConfig $fieldConfig, bool $forLibrary, array $attr = []): string
	{
		$attr = ArrayHelper::merge($attr, [
			'data' => [
				'keywords' => $forLibrary ? implode(' ', array_map(mb_strtolower(...), $fieldConfig->keywords())) : false,
			],
		]);

		$view = Craft::$app->getView();
		$oldNamespace = $view->getNamespace();
		$namespace = $view->namespaceInputName('element-' . ($forLibrary ? 'ELEMENT_UID' : $fieldConfig->uid));
		$view->setNamespace($namespace);
		$view->startJsBuffer();
		$settingsHtml = $view->namespaceInputs($fieldConfig->getSettingsHtml());
		$settingsJs = $view->clearJsBuffer(false);
		$view->setNamespace($oldNamespace);

		$attr = ArrayHelper::merge($attr, [
			'class' => array_filter([
				'fld-element',
				$forLibrary ? 'unused' : null,
				$fieldConfig->getIsComplexField() ? 'complex-field' : null,
				$fieldConfig->getIsBlockField() ? 'block-field' : null,
			]),
			'data' => [
				'uid' => !$forLibrary ? $fieldConfig->uid : false,
				'config' => $forLibrary ? $fieldConfig->toArray() : false,
				'settings-namespace' => $namespace,
				'settings-html' => $settingsHtml ?: false,
				'settings-js' => $settingsJs ?: false,
				'complex-field' => $fieldConfig->getIsComplexField(),
				'block-field' => $fieldConfig->getIsBlockField(),
			],
		]);

		return Html::modifyTagAttributes($fieldConfig->selectorHtml(), $attr);
	}

	/**
	 * @param FieldConfig[] $groupFields
	 * @param string|null $heading
	 * @return string
	 */
	private static function _fldFieldSelectorsHtml(array $groupFields, ?string $heading = null): string
	{
		return
			Html::beginTag('div', [
				'class' => 'fld-field-group',
			]) .
			($heading !== null ? Html::tag('h6', Html::encode($heading)) : '') .
			implode('', array_map(function (FieldConfig $fieldConfig): string {
				return self::_fldElementSelectorHtml($fieldConfig, true);
			}, $groupFields)) .
			Html::endTag('div');
	}

	/**
	 * @param string[]|string $elementSources Source keys, or `*` for all sources
	 * @return Collection<int, BaseFieldLayout>
	 */
	public static function getLayoutsFromSources(string $elementType, array|string $elementSources): Collection
	{
		// The `*` source only covers top-level elements, e.g. entries in sections, but not entries only used in
		// Matrix fields, whose fields would otherwise show up as the element type’s own
		return collect(is_string($elementSources) ? ['*'] : $elementSources)
			->filter(fn(string $source): bool => !str_starts_with($source, 'custom:'))
			->flatMap(fn(string $source): array => Craft::$app->getElementSources()->getFieldLayoutsForSource($elementType, $source))
			->unique(fn(BaseFieldLayout $layout): string => $layout->uid ?? spl_object_hash($layout))
			->values();
	}

	/**
	 * Returns the fields across some field layouts, once per handle.
	 *
	 * @param Collection<array-key, BaseFieldLayout> $layouts
	 * @return FieldConfig[]
	 */
	public static function getAvailableFieldsFromLayouts(Collection $layouts): array
	{
		$elementsService = Plugin::getInstance()->elements;

		return $layouts
			->flatMap(fn(BaseFieldLayout $layout): array => $elementsService->getFieldConfigsFromLayout($layout))
			->unique('handle')
			->sortBy('label')
			->values()
			->all();
	}

	/**
	 * Returns the fields a complex field expands into, grouped for its nested sidebar.
	 *
	 * Block fields get a group per block type (Matrix entry types, Neo block types), and their fields remember the
	 * block type. Content Block fields have a single group, without a block type.
	 * Relation fields get the fields of their sources’ layouts, and Addresses fields the fields of addresses.
	 *
	 * @return array<int, FieldGroup>
	 */
	public static function getNestedFieldGroups(FieldInterface $field): array
	{
		$elementsService = Plugin::getInstance()->elements;

		// Addresses all share the one address field layout
		if ($field instanceof AddressesField) {
			return self::getRelatedElementFieldGroups(Address::class);
		}

		if ($elementsService->isBlockField($field)) {
			$groups = [];
			foreach ($elementsService->getBlockTypeLayouts($field) as $blockType) {
				$fields = $elementsService->getFieldConfigsFromLayout($blockType['fieldLayout']);
				foreach ($fields as $fieldConfig) {
					$fieldConfig->blockType = $blockType['handle'];
				}

				$groups[] = [
					'heading' => $blockType['name'],
					'fields' => $fields,
				];
			}

			return $groups;
		}

		if ($field instanceof BaseRelationField) {
			if ($field->allowMultipleSources) {
				$sources = $field->sources ?? '*';
			} else {
				$sources = $field->source !== null ? [$field->source] : [];
			}

			return self::getElementFieldGroups($field::elementType(), self::getLayoutsFromSources($field::elementType(), $sources));
		}

		return [];
	}

	/**
	 * Returns an element type’s fields for a sidebar: its native attributes, then the fields in its layouts.
	 * Layout fields that are also attributes (e.g. an asset’s alt text) are only listed as attributes.
	 *
	 * @param class-string<ElementInterface> $elementType
	 * @param Collection<array-key, BaseFieldLayout> $layouts
	 * @return array<int, FieldGroup>
	 */
	public static function getElementFieldGroups(string $elementType, Collection $layouts): array
	{
		$attributes = Plugin::getInstance()->attributes->getFieldConfigs($elementType);
		$attributeHandles = array_map(fn(FieldConfig $fieldConfig): string => (string) $fieldConfig->handle, $attributes);

		$fields = array_values(array_filter(
			self::getAvailableFieldsFromLayouts($layouts),
			fn(FieldConfig $fieldConfig): bool => !in_array($fieldConfig->handle, $attributeHandles, true),
		));

		return array_values(array_filter([
			['heading' => Craft::t('dynex', 'Attributes'), 'fields' => $attributes],
			['heading' => Craft::t('dynex', 'Fields'), 'fields' => $fields],
		], fn(array $group): bool => $group['fields'] !== []));
	}

	/**
	 * Returns the fields a relational attribute (e.g. an entry’s authors) expands into:
	 * the related element type’s attributes, and the fields in the layouts of all of its sources.
	 *
	 * @param class-string<ElementInterface> $elementType
	 * @return array<int, FieldGroup>
	 */
	public static function getRelatedElementFieldGroups(string $elementType): array
	{
		return self::getElementFieldGroups($elementType, self::getLayoutsFromSources($elementType, '*'));
	}

	/**
	 * Nests fields under the field they were expanded from, extending its handle in eager-loading notation:
	 * `relationField.fieldHandle` for relations, and `blockField.blockTypeHandle:fieldHandle` for Matrix/Neo.
	 *
	 * @param FieldConfig[] $fields
	 * @return FieldConfig[]
	 */
	public static function nestFieldConfigs(FieldConfig $nestingParent, array $fields): array
	{
		return array_map(function (FieldConfig $field) use ($nestingParent): FieldConfig {
			$parent = clone $nestingParent;
			$parent->setTraversed($field);

			$segment = $field->blockType !== null ? "{$field->blockType}:{$field->handle}" : $field->handle;
			$parent->handle = $nestingParent->handle . '.' . $segment;
			$parent->label = $field->label;
			$parent->defaultLabel = $field->defaultLabel;

			return $parent;
		}, $fields);
	}

	private static function getLabelFromSources(Exporter $exporter): string
	{
		if (is_string($exporter->elementSources)) {
			return Craft::t('dynex', 'All {elements}', [
				'elements' => $exporter->elementType::pluralDisplayName(),
			]);
		}

		return Collection::make(Craft::$app->getElementSources()->getSources($exporter->elementType))
			->filter(fn(array $source): bool => array_key_exists('key', $source) && in_array(
				$source['key'],
				$exporter->elementSources,
			))
			->map(fn(array $source): string => $source['label'])
			->join(', ');
	}
}