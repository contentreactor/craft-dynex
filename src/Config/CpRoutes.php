<?php
declare(strict_types=1);

return [
	'dynex' => ['template' => '@dynex/exporters/index.twig'],
	'dynex/exporters' => ['template' => '@dynex/exporters/index.twig'],
	'dynex/exporters/new' => 'dynex/exporters/edit-exporter',
	'dynex/exporters/<exporterId:\d+>' => 'dynex/exporters/edit-exporter',
];