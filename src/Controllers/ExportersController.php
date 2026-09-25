<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Controllers;

use ContentReactor\Dynex\Helpers\TemplateHelper;
use ContentReactor\Dynex\Models\{
	Exporter,
	FieldConfig,
};
use ContentReactor\Dynex\Plugin;
use ContentReactor\Dynex\Web\Assets\Cp\CpAsset;
use Craft;
use craft\base\ElementInterface;
use craft\elements\User;
use craft\helpers\{
	Json,
	UrlHelper,
};
use craft\web\{
	Controller,
	View,
};
use yii\web\{
	BadRequestHttpException,
	NotFoundHttpException,
	Response,
};

class ExportersController extends Controller
{
	public $defaultAction = 'index';
	protected array|int|bool $allowAnonymous = false;

	public function beforeAction($action): bool
	{
		if (!parent::beforeAction($action)) {
			return false;
		}

		$this->requirePermission('dynex:exporters');

		return true;
	}

	public function actionEditExporter(?int $exporterId = null, ?Exporter $exporter = null): Response
	{
		if ($exporterId !== null) {
			if ($exporter === null) {
				$exporter = Plugin::getInstance()->getExporters()->getUserExporterById($exporterId);

				if (!$exporter) {
					throw new NotFoundHttpException('Exporter not found');
				}
			}

			$title = trim($exporter->name) ?: Craft::t('dynex', 'Edit Exporter');
		} else {
			if ($exporter === null) {
				$exporter = new Exporter();
			}

			$title = Craft::t('dynex', 'Create a new exporter');
		}

		$crumbs = [
			[
				'label' => Plugin::getInstance()->getPluginName(),
				'url' => UrlHelper::url('dynex/exporters'),
			],
			[
				'label' => Craft::t('dynex', 'Exporters'),
				'url' => UrlHelper::url('dynex/exporters'),
			],
		];

		$elementTypes = [
			[
				'value' => '',
				'label' => '',
			],
			...collect(Craft::$app->getElements()->getAllElementTypes())
				->map(fn(string $className): array => [
					'value' => $className,
					'label' => $className::displayName(),
				])
				->sortBy('label')
				->values()
				->all(),
		];

		if ($exporter->elementType) {
			$elementSources = collect(Craft::$app->getElementSources()->getSources($exporter->elementType))
				//$elementSources = collect($exporter->elementType::sources(ElementSources::CONTEXT_FIELD))
				->filter(fn(array $source): bool => array_key_exists('key', $source) && $source['key'] !== '*')
				->map(fn(array $source): array => [
					'value' => $source['key'],
					'label' => $source['label'],
				])
				->sortBy('label')
				->values()
				->all();
		}

		// The editor's own files, after the bundle's
		$view = Craft::$app->getView();
		$bundle = CpAsset::register($view);
		$view->registerCssFile("$bundle->baseUrl/css/exporters.css", ['depends' => CpAsset::class]);
		$view->registerJsFile("$bundle->baseUrl/js/editexporter.js", ['depends' => CpAsset::class]);

		return $this->renderTemplate('@dynex/exporters/edit', [
			'exporterId' => $exporterId,
			'exporter' => $exporter,
			'title' => $title,
			'crumbs' => $crumbs,
			'elementTypes' => $elementTypes,
			'elementSources' => $elementSources ?? [],
		]);
	}

	public function actionSaveExporter(): ?Response
	{
		$this->requirePostRequest();

		$exportersService = Plugin::getInstance()->getExporters();
		$exporterId = (int) $this->request->getBodyParam('exporterId', 0);

		if ($exporterId > 0) {
			$exporter = $exportersService->getUserExporterById($exporterId);
			if (!$exporter) {
				throw new BadRequestHttpException("Invalid exporter ID: $exporterId");
			}
		} else {
			$exporter = new Exporter();
			$exporter->userId = $this->currentUserOrFail()->id;
		}

		$exporter->name = $this->request->getBodyParam('name', $exporter->name);
		$exporter->handle = $this->request->getBodyParam('handle', $exporter->handle);
		$exporter->elementType = $this->request->getBodyParam('elementType', $exporter->elementType);
		$exporter->elementSources = $this->request->getBodyParam('elementSources', $exporter->elementSources);

		// New exporters can have fields mapped too, since the designer renders before the first save
		$fieldLayout = $this->request->getBodyParam('fieldLayout');
		if ($fieldLayout) {
			$exporter->fieldMapping = $this->fieldMappingFromLayout($fieldLayout);
		}

		if (!$exportersService->saveExporter($exporter)) {
			return $this->asModelFailure($exporter, Craft::t('dynex', 'Couldn’t save exporter.'), 'exporter');
		}

		$this->setSuccessFlash(Craft::t('dynex', 'Exporter saved.'));
		return $this->redirectToPostedUrl($exporter);
	}

	/**
	 * Deletes one of the current user's exporters, from the exporters list
	 */
	public function actionDeleteExporter(): Response
	{
		$this->requirePostRequest();

		$exporterId = (int)$this->request->getRequiredBodyParam('id');
		$exporter = Plugin::getInstance()->getExporters()->getUserExporterById($exporterId);
		if (!$exporter) {
			throw new BadRequestHttpException("Invalid exporter ID: $exporterId");
		}

		if (!Plugin::getInstance()->getExporters()->deleteExporter($exporter)) {
			return $this->asFailure(Craft::t('dynex', 'Couldn’t delete the exporter.'));
		}

		return $this->asSuccess(Craft::t('dynex', 'Exporter deleted.'));
	}

	public function actionExporterSources(): Response
	{
		$this->requirePostRequest();
		Craft::$app->getView()->setTemplateMode('cp');
		$elementType = $this->request->getRequiredBodyParam('elementType');
		if (!in_array($elementType, Craft::$app->getElements()->getAllElementTypes(), true)) {
			throw new BadRequestHttpException("Invalid element type: $elementType");
		}
		$exporterId = (int) $this->request->getBodyParam('exporterId', 0);
		$exporter = Plugin::getInstance()->getExporters()->getUserExporterById($exporterId);
		$elementSources = collect(Craft::$app->getElementSources()->getSources($elementType))
			//$elementSources = collect($elementType::sources(ElementSources::CONTEXT_FIELD))
			->filter(fn(array $source): bool => array_key_exists('key', $source) && $source['key'] !== '*')
			->map(fn(array $source): array => [
				'value' => $source['key'],
				'label' => $source['label'],
			])
			->sortBy('label')
			->values()
			->all();

		$selectedSources = '*';
		if ($exporter?->elementType === $elementType) {
			$selectedSources = $exporter->elementSources;
		}

		$html = Craft::$app->getView()->renderTemplate('@dynex/exporters/sources.twig', [
			'elementType' => $elementType,
			'elementPlural' => $elementType::pluralLowerDisplayName(),
			'elementSources' => $elementSources,
			'selectedSources' => $selectedSources,
			'elementSourcesErrors' => [],
		]);

		return $this->asJson([
			'html' => $html,
		]);
	}

	/**
	 * Renders the field layout designer for the element type and sources picked on the edit page,
	 * so fields can be mapped before the exporter is saved. A posted `fieldLayout` keeps its mapping.
	 */
	public function actionLayoutDesigner(): Response
	{
		$this->requirePostRequest();

		$elementType = $this->request->getRequiredBodyParam('elementType');
		if (!in_array($elementType, Craft::$app->getElements()->getAllElementTypes(), true)) {
			throw new BadRequestHttpException("Invalid element type: $elementType");
		}

		$exporter = new Exporter([
			'elementType' => $elementType,
			'elementSources' => $this->request->getBodyParam('elementSources') ?: null,
		]);

		$fieldLayout = $this->request->getBodyParam('fieldLayout');
		if ($fieldLayout) {
			$exporter->fieldMapping = $this->fieldMappingFromLayout($fieldLayout);
		}

		$view = $this->getView();
		$html = $exporter->elementSources
			? $view->renderTemplate('@dynex/exporters/_layout-designer.twig', ['exporter' => $exporter], View::TEMPLATE_MODE_CP)
			: '';

		// The designer initializes itself from JS registered while rendering
		return $this->asJson([
			'html' => $html,
			'headHtml' => $view->getHeadHtml(),
			'bodyHtml' => $view->getBodyHtml(),
		]);
	}

	/**
	 * Sets the current user’s selected exporter. An `exporterId` of 0 clears the selection.
	 */
	public function actionSet(): Response
	{
		$this->requirePostRequest();
		$this->requireAcceptsJson();

		$exportersService = Plugin::getInstance()->getExporters();
		$exporterId = (int) $this->request->getRequiredBodyParam('exporterId');
		$exporter = $exportersService->getUserExporterById($exporterId);

		if ($exporterId && !$exporter) {
			return $this->asFailure(Craft::t('dynex', 'Exporter not found.'));
		}

		$exportersService->setSelectedExporter($this->currentUserOrFail(), $exporter);

		return $this->asSuccess(Craft::t('dynex', 'Selected exporter saved.'));
	}

	public function actionComplexField(): Response
	{
		$this->requirePostRequest();
		$this->view->templateMode = 'cp';
		$currentNesting = (int) $this->request->getRequiredBodyParam('currentNesting');
		$config = Json::decode($this->request->getRequiredBodyParam('config'));
		$config['type'] = FieldConfig::TYPE_NESTED;
		$fieldConfig = new FieldConfig($config);

		// Expand the field at the end of the chain, e.g. `related` in `content.text:related`
		$leaf = $fieldConfig->getLeaf();

		if ($leaf->fieldId === null) {
			// A relational attribute, e.g. an entry’s authors
			$relatedElementType = $leaf->relatedElementType;
			if ($relatedElementType === null || !is_subclass_of($relatedElementType, ElementInterface::class)) {
				throw new BadRequestHttpException("Attribute {$leaf->label} can’t be expanded.");
			}

			$fieldGroups = TemplateHelper::getRelatedElementFieldGroups($relatedElementType);
		} else {
			$field = Craft::$app->getFields()->getFieldById($leaf->fieldId);
			if ($field === null || !Plugin::getInstance()->elements->isComplexField($field)) {
				throw new BadRequestHttpException("Field {$leaf->label} doesn’t exist or can’t be expanded.");
			}

			$fieldGroups = TemplateHelper::getNestedFieldGroups($field);
		}

		$sidebarHtml = TemplateHelper::sidebarHtml(
			$fieldGroups,
			(string) $fieldConfig->label,
			$fieldConfig,
			++$currentNesting,
		);

		return $this->asJson(compact('sidebarHtml'));
	}

	/**
	 * Returns the field mapping from the field layout config a designer posts.
	 *
	 * @return FieldConfig[]
	 */
	private function fieldMappingFromLayout(string $fieldLayout): array
	{
		$fieldElements = Json::decode($fieldLayout)['tabs'][0]['elements'] ?? [];

		return array_map(fn(array $fieldConfig): FieldConfig => new FieldConfig($fieldConfig), $fieldElements);
	}

	private function currentUserOrFail(): User
	{
		/** @var User|null $user */
		$user = Craft::$app->getUser()->getIdentity();
		if ($user === null) {
			throw new BadRequestHttpException('No user is logged in.');
		}

		return $user;
	}
}