<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Web\Twig;

use ContentReactor\Dynex\Helpers\TemplateHelper;
use Twig\Extension\AbstractExtension;
use Twig\TwigFunction;

class Extension extends AbstractExtension
{
	public function getFunctions(): array
	{
		return [
			new TwigFunction('fieldLayoutDesigner', TemplateHelper::fieldLayoutDesignerHtml(...)),
		];
	}
}
