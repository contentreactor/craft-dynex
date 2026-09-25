<?php
declare(strict_types=1);

namespace ContentReactor\Dynex;

use ContentReactor\Dynex\Exporters\DynamicExporter;
use ContentReactor\Dynex\migrations\Install;
use ContentReactor\Dynex\Models\Settings;
use ContentReactor\Dynex\Services\{
	Attributes as AttributesService,
	Conditions as ConditionsService,
	Elements as ElementsService,
	Exporters as ExportersService,
};
use ContentReactor\Dynex\Web\Twig\{
	DynexVariable,
	Extension,
};
use Craft;
use craft\base\{
	Element,
	ElementInterface,
	Model,
	Plugin as BasePlugin,
};
use craft\db\Migration;
use craft\elements\User;
use craft\enums\CmsEdition;
use craft\events\{
	RegisterElementExportersEvent,
	RegisterTemplateRootsEvent,
	RegisterUrlRulesEvent,
	RegisterUserPermissionsEvent,
};
use craft\services\UserPermissions;
use craft\web\{
	UrlManager,
	View,
};
use craft\web\twig\variables\CraftVariable;
use MarcusGaius\FieldValueParser\FieldValueParser;
use yii\base\Event;

/**
 * Dynex plugin
 *
 * @method static Plugin getInstance()
 * @method Settings getSettings()
 * @property AttributesService $attributes
 * @property ElementsService $elements
 * @property ExportersService $exporters
 * @property ConditionsService $conditions
 * @author MarcusGaius <marko.gajic@developion.com>
 * @copyright MarcusGaius
 * @license MIT
 */
class Plugin extends BasePlugin
{
	public string $schemaVersion = '2.0.0';
	public bool $hasCpSettings = true;
	public bool $hasCpSection = true;
	private string $defaultName;

	/**
	 * @return array<string, mixed>
	 */
	public static function config(): array
	{
		return [
			'components' => [
				'attributes' => AttributesService::class,
				'elements' => ElementsService::class,
				'exporters' => ExportersService::class,
				'conditions' => ConditionsService::class,
			],
		];
	}

	public function init(): void
	{
		if (Craft::$app->request->isConsoleRequest) {
			$this->controllerNamespace = __NAMESPACE__ . '\\Console\\Controllers';
		} else {
			$this->controllerNamespace = __NAMESPACE__ . '\\Controllers';
		}

		parent::init();
		// Values and structures are parsed by Field Value Parser, whether or not its own plugin is installed
		FieldValueParser::boot();
		$this->defaultName = $this->name;
		$this->applyPluginName();
		$this->attachEventHandlers();

		Craft::$app->onInit(function () {
			Craft::setAlias('@dynex', __DIR__);
			$this->registerElementExporter();
		});

		$this->registerVariables();
		Craft::$app->getView()->registerTwigExtension(new Extension());

		//if (Craft::$app->getRequest()->getIsSiteRequest()) {
		//}

		//if (Craft::$app->getRequest()->getIsConsoleRequest()) {
		//}

		if (Craft::$app->getRequest()->getIsCpRequest()) {
			//$this->registerNativeFields();
			//$this->registerAssetBundles();
			$this->registerCpUrlRules();
			//$this->registerUtilities();
			//$this->registerWidgets();
		}

		// Solo has a single admin; Team users get their permissions from the team group
		if (Craft::$app->edition !== CmsEdition::Solo) {
			$this->registerUserPermissions();
		}
	}

	protected function createInstallMigration(): ?Migration
	{
		return new Install();
	}

	/**
	 * @return array<string, mixed>|null
	 */
	public function getCpNavItem(): ?array
	{
		$cpNavItem = parent::getCpNavItem();
		$cpNavItem['subnav'] = [];

		/** @var ?User $currentUser */
		$currentUser = Craft::$app->getUser()->getIdentity();

		if ($currentUser === null) {
			return $cpNavItem;
		}

		$allowAdminChanges = Craft::$app->getConfig()->getGeneral()->allowAdminChanges;

		if ($currentUser->can('dynex:exporters')) {
			$cpNavItem['subnav']['exporters'] = ['label' => Craft::t('dynex', 'Exporters'), 'url' => 'dynex/exporters'];
		}
		// if ($currentUser->can('dynex:conditions')) {
		// 	$cpNavItem['subnav']['conditions'] = ['label' => Craft::t('dynex', 'Conditions'), 'url' => 'dynex/conditions'];
		// }
		if ($allowAdminChanges && $currentUser->can('dynex:settings')) {
			$cpNavItem['subnav']['settings'] = ['label' => Craft::t('dynex', 'Settings'), 'url' => 'settings/plugins/dynex'];
		}

		return $cpNavItem;
	}

	private function registerCpUrlRules(): void
	{
		Event::on(
			UrlManager::class,
			UrlManager::EVENT_REGISTER_CP_URL_RULES,
			function (RegisterUrlRulesEvent $event): void {
				$event->rules = array_merge($event->rules, $this->getCpRoutes());
			}
		);
	}

	protected function createSettingsModel(): ?Model
	{
		return Craft::createObject(Settings::class);
	}

	protected function settingsHtml(): ?string
	{
		return Craft::$app->view->renderTemplate('@dynex/_settings.twig', [
			'plugin' => $this,
			'settings' => $this->getSettings(),
		]);
	}

	private function attachEventHandlers(): void
	{
		Event::on(
			View::class,
			View::EVENT_REGISTER_CP_TEMPLATE_ROOTS,
			static function (RegisterTemplateRootsEvent $event): void {
				$event->roots['@dynex'] = __DIR__ . '/Templates';
			}
		);

		//Event::on(
		//	Fields::class,
		//	Fields::EVENT_REGISTER_FIELD_TYPES,
		//	static function (RegisterComponentTypesEvent $event): void {
		//		$event->types[] = Exporters::class;
		//	}
		//);
	}

	/**
	 * Offers the current user’s selected exporter on its element type’s indexes,
	 * limited to the sources it was configured for.
	 */
	private function registerElementExporter(): void
	{
		if (!Craft::$app->getRequest()->getIsCpRequest()) {
			return;
		}

		$exporter = $this->getExporters()->getSelectedExporter();
		if ($exporter === null || !is_subclass_of((string) $exporter->elementType, ElementInterface::class)) {
			return;
		}

		DynamicExporter::$exporter = $exporter;

		Event::on(
			$exporter->elementType,
			Element::EVENT_REGISTER_EXPORTERS,
			static function (RegisterElementExportersEvent $event) use ($exporter): void {
				if (is_array($exporter->elementSources) && !in_array($event->source, $exporter->elementSources, true)) {
					return;
				}

				$event->exporters[] = DynamicExporter::class;
			}
		);
	}

	public function getExporters(): ExportersService
	{
		return $this->get('exporters');
	}

	public function getConditions(): ConditionsService
	{
		return $this->get('conditions');
	}

	private function registerVariables(): void
	{
		Event::on(
			CraftVariable::class,
			CraftVariable::EVENT_INIT,
			static function (Event $event): void {
				$event->sender->set('dynex', [
					'class' => DynexVariable::class,
				]);
			}
		);
	}

	/**
	 * The plugin’s name, as set in its settings, translated.
	 */
	public function getPluginName(): string
	{
		return Craft::t('dynex', $this->name);
	}

	/**
	 * The name from `composer.json`, used when the name setting is left blank.
	 */
	public function getDefaultName(): string
	{
		return $this->defaultName;
	}

	public function afterSaveSettings(): void
	{
		parent::afterSaveSettings();
		$this->applyPluginName();
	}

	/**
	 * Renames the plugin after its name setting. Craft shows `$this->name` in the control panel’s
	 * main menu, the plugin settings, and the user permissions.
	 */
	private function applyPluginName(): void
	{
		$pluginName = trim($this->getSettings()->pluginName);
		$this->name = $pluginName !== '' ? $pluginName : $this->defaultName;
	}

	/**
	 * @return array<string, string|array<string, string>>
	 */
	private function getCpRoutes(): array
	{
		return require __DIR__ . '/Config/CpRoutes.php';
	}

	private function registerUserPermissions(): void
	{
		Event::on(
			UserPermissions::class,
			UserPermissions::EVENT_REGISTER_PERMISSIONS,
			function (RegisterUserPermissionsEvent $event): void {
				$exporterPermissions = [];
				//foreach ($this->exporters->getAllExporters() as $exporter) {
				//	$exporterPermissions['exporter:exporters:' . $exporter->uid] = [
				//		'label' => $exporter->name,
				//	];
				//}

				$conditionPermissions = [];
				//foreach ($this->conditions->getAllConditions() as $condition) {
				//	$conditionPermissions['exporter:conditions:' . $condition->uid] = [
				//		'label' => $condition->name,
				//	];
				//}

				$permissions = [
					'dynex:exporters' => [
						'label' => Craft::t('dynex', 'Manage exporters'),
						'nested' => $exporterPermissions,
					],
					'dynex:conditions' => [
						'label' => Craft::t('dynex', 'Manage conditions'),
						'nested' => $conditionPermissions,
					],
				];

				$permissions['dynex:settings'] = ['label' => Craft::t('dynex', 'Manage plugin settings')];

				$event->permissions[] = [
					'heading' => $this->name,
					'permissions' => $permissions,
				];
			}
		);
	}
}