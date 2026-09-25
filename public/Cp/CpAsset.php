<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Web\Assets\Cp;

use craft\web\AssetBundle;
use craft\web\assets\cp\CpAsset as CraftCp;

class CpAsset extends AssetBundle
{
	public $sourcePath = __DIR__ . '/dist';
	public $depends = [
		CraftCp::class,
	];
	public $js = [
		'js/dynex.js',
	];
}
