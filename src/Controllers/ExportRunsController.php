<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Controllers;

use ContentReactor\Dynex\Models\{
	ExportRun,
	Exporter,
};
use ContentReactor\Dynex\Plugin;
use Craft;
use craft\elements\User;
use craft\helpers\UrlHelper;
use craft\web\Controller;
use yii\web\{
	BadRequestHttpException,
	NotFoundHttpException,
	Response,
};

/**
 * Runs the current user's exporters in the queue, and lists, downloads and deletes their runs
 */
class ExportRunsController extends Controller
{
	protected array|int|bool $allowAnonymous = false;

	public function beforeAction($action): bool
	{
		if (!parent::beforeAction($action)) {
			return false;
		}

		$this->requirePermission('dynex:exporters');
		Plugin::getInstance()->requirePro(Craft::t('dynex', 'Export runs'));

		return true;
	}

	/**
	 * An exporter's runs, newest first
	 */
	public function actionIndex(int $exporterId): Response
	{
		$exporter = $this->getExporter($exporterId);

		return $this->renderTemplate('@dynex/runs/index', [
			'exporter' => $exporter,
			'runs' => Plugin::getInstance()->exportRuns->getExporterRuns($exporter),
			'crumbs' => [
				['label' => Plugin::getInstance()->getPluginName(), 'url' => UrlHelper::cpUrl('dynex/exporters')],
				['label' => Craft::t('dynex', 'Exporters'), 'url' => UrlHelper::cpUrl('dynex/exporters')],
				['label' => (string)$exporter->name, 'url' => UrlHelper::cpUrl("dynex/exporters/$exporter->id")],
			],
		]);
	}

	public function actionRun(): Response
	{
		$this->requirePostRequest();

		$exporter = $this->getExporter((int)$this->request->getRequiredBodyParam('exporterId'));
		/** @var User $user */
		$user = Craft::$app->getUser()->getIdentity();
		Plugin::getInstance()->exportRuns->queue($exporter, $user);
		$this->setSuccessFlash(Craft::t('dynex', 'The export is running in the queue.'));

		return $this->redirect(UrlHelper::cpUrl("dynex/exporters/$exporter->id/runs"));
	}

	public function actionDownload(int $runId): Response
	{
		$run = $this->getRun($runId);
		if (!$run->hasFile()) {
			throw new NotFoundHttpException('The export’s file is gone.');
		}

		return $this->response->sendFile($run->getFilePath(), $run->filename);
	}

	public function actionDelete(): Response
	{
		$this->requirePostRequest();

		$run = $this->getRun((int)$this->request->getRequiredBodyParam('runId'));
		if (in_array($run->status, [ExportRun::STATUS_QUEUED, ExportRun::STATUS_RUNNING], true)) {
			throw new BadRequestHttpException('The export is running.');
		}

		Plugin::getInstance()->exportRuns->deleteRun($run);
		$this->setSuccessFlash(Craft::t('dynex', 'Export run deleted.'));

		return $this->redirect(UrlHelper::cpUrl("dynex/exporters/$run->exporterId/runs"));
	}

	private function getExporter(int $exporterId): Exporter
	{
		return Plugin::getInstance()->getExporters()->getUserExporterById($exporterId)
			?? throw new NotFoundHttpException('Exporter not found');
	}

	private function getRun(int $runId): ExportRun
	{
		return Plugin::getInstance()->exportRuns->getUserRunById($runId)
			?? throw new NotFoundHttpException('Export run not found');
	}
}
