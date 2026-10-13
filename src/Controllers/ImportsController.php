<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Controllers;

use ContentReactor\Dynex\Models\{
	Exporter,
	Import,
};
use ContentReactor\Dynex\Plugin;
use ContentReactor\Dynex\Services\Imports;
use Craft;
use craft\elements\User;
use craft\helpers\UrlHelper;
use craft\web\{
	Controller,
	UploadedFile,
};
use InvalidArgumentException;
use yii\web\{
	BadRequestHttpException,
	NotFoundHttpException,
	Response,
};

/**
 * Imports files into the elements of the current user's importable exporters: uploading them, reviewing what they change,
 * and applying them
 */
class ImportsController extends Controller
{
	protected array|int|bool $allowAnonymous = false;

	public function beforeAction($action): bool
	{
		if (!parent::beforeAction($action)) {
			return false;
		}

		$this->requirePermission('dynex:import');
		Plugin::getInstance()->requirePro(Craft::t('dynex', 'Importing'));

		return true;
	}

	/**
	 * The upload form for an exporter, with its earlier imports
	 */
	public function actionNew(int $exporterId): Response
	{
		$exporter = $this->getExporter($exporterId);

		return $this->renderTemplate('@dynex/imports/new', [
			'exporter' => $exporter,
			'imports' => Plugin::getInstance()->imports->getExporterImports($exporter),
			'extensions' => Imports::EXTENSIONS,
			'crumbs' => $this->getCrumbs($exporter),
		]);
	}

	/**
	 * Reads an uploaded file and works out what it changes, without saving anything yet
	 */
	public function actionUpload(): ?Response
	{
		$this->requirePostRequest();

		$exporter = $this->getExporter((int)$this->request->getRequiredBodyParam('exporterId'));
		$file = UploadedFile::getInstanceByName('file');
		if ($file === null || $file->getHasError()) {
			return $this->asFailure(Craft::t('dynex', 'Choose a file to import.'));
		}

		$imports = Plugin::getInstance()->imports;
		try {
			$rows = $imports->readFile($file->tempName, $file->name);
			$import = $imports->prepare($exporter, $rows, $this->currentUserOrFail(), $file->name);
		} catch (InvalidArgumentException $e) {
			return $this->asFailure($e->getMessage());
		}

		return $this->redirect(UrlHelper::cpUrl("dynex/imports/$import->id"));
	}

	/**
	 * What an import changes, before it's applied, and how it went afterwards
	 */
	public function actionView(int $importId): Response
	{
		$import = $this->getImport($importId);
		$exporter = $import->getExporter();
		if ($exporter === null) {
			throw new NotFoundHttpException('Exporter not found');
		}

		return $this->renderTemplate('@dynex/imports/view', [
			'import' => $import,
			'exporter' => $exporter,
			'crumbs' => [
				...$this->getCrumbs($exporter),
				['label' => Craft::t('dynex', 'Import'), 'url' => UrlHelper::cpUrl("dynex/exporters/$exporter->id/import")],
			],
		]);
	}

	public function actionApply(): Response
	{
		$this->requirePostRequest();

		$import = $this->getImport((int)$this->request->getRequiredBodyParam('importId'));
		if (!$import->isPending()) {
			throw new BadRequestHttpException('The import was applied already.');
		}

		Plugin::getInstance()->imports->queue($import);
		$this->setSuccessFlash(Craft::t('dynex', 'The import is running in the queue.'));

		return $this->redirect(UrlHelper::cpUrl("dynex/imports/$import->id"));
	}

	/**
	 * Deletes an import, e.g. to discard one that isn't applied
	 */
	public function actionDelete(): Response
	{
		$this->requirePostRequest();

		$import = $this->getImport((int)$this->request->getRequiredBodyParam('importId'));
		if (in_array($import->status, [Import::STATUS_QUEUED, Import::STATUS_RUNNING], true)) {
			throw new BadRequestHttpException('The import is running.');
		}

		Plugin::getInstance()->imports->deleteImport($import);
		$this->setSuccessFlash(Craft::t('dynex', 'Import deleted.'));

		return $this->redirect(UrlHelper::cpUrl("dynex/exporters/$import->exporterId/import"));
	}

	private function getExporter(int $exporterId): Exporter
	{
		$exporter = Plugin::getInstance()->getExporters()->getUserExporterById($exporterId);
		if ($exporter === null || !$exporter->importable) {
			throw new NotFoundHttpException('Importable exporter not found');
		}

		return $exporter;
	}

	private function getImport(int $importId): Import
	{
		$import = Plugin::getInstance()->imports->getUserImportById($importId);
		if ($import === null) {
			throw new NotFoundHttpException('Import not found');
		}

		return $import;
	}

	/**
	 * @return array<int, array{label: string, url: string}>
	 */
	private function getCrumbs(Exporter $exporter): array
	{
		return [
			['label' => Plugin::getInstance()->getPluginName(), 'url' => UrlHelper::cpUrl('dynex/exporters')],
			['label' => Craft::t('dynex', 'Exporters'), 'url' => UrlHelper::cpUrl('dynex/exporters')],
			['label' => (string)$exporter->name, 'url' => UrlHelper::cpUrl("dynex/exporters/$exporter->id")],
		];
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
