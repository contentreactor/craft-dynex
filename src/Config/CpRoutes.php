<?php
declare(strict_types=1);

return [
	'dynex' => ['template' => '@dynex/exporters/index.twig'],
	'dynex/exporters' => ['template' => '@dynex/exporters/index.twig'],
	'dynex/exporters/new' => 'dynex/exporters/edit-exporter',
	'dynex/exporters/<exporterId:\d+>' => 'dynex/exporters/edit-exporter',
	'dynex/exporters/<exporterId:\d+>/import' => 'dynex/imports/new',
	'dynex/exporters/<exporterId:\d+>/runs' => 'dynex/export-runs/index',
	'dynex/exporters/<exporterId:\d+>/definition' => 'dynex/exporters/download-definition',
	'dynex/export-runs/<runId:\d+>/download' => 'dynex/export-runs/download',
	'dynex/imports/<importId:\d+>' => 'dynex/imports/view',
];