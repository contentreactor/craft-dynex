<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Helpers;

use ContentReactor\Dynex\Attributes\{
	FromJsonArray,
	FromJsonObject,
};
use ReflectionClass;
use ReflectionProperty;
use yii\base\Model;

/**
 * @phpstan-type PropertyDetails array{
 *     property: ReflectionProperty,
 *     objectClass: class-string<Model>|null,
 *     arrayClass: class-string<Model>|null,
 * }
 * @phpstan-type ClassDetails array{
 *     class: ReflectionClass<Model>,
 *     properties: array<string, PropertyDetails>,
 * }
 */
class ReflectionHelper
{
	/** @var array<class-string<Model>, ClassDetails> */
	private static array $reflectionCache = [];

	/**
	 * @param array<string, mixed>|null $data
	 */
	public static function map(Model $instance, ?array $data): void
	{
		if (!$data) return;

		$className = get_class($instance);
		$reflection = self::getReflection($className);

		foreach ($reflection['properties'] as $prop => $details) {
			if (!array_key_exists($prop, $data)) {
				continue;
			}

			$property = $details['property'];
			$property->setAccessible(true);

			if ($details['objectClass']) {
				if ($data[$prop] === null || $data[$prop] instanceof $details['objectClass']) {
					$property->setValue($instance, $data[$prop]);
					continue;
				}

				$nestedInstance = new $details['objectClass']();
				self::map($nestedInstance, $data[$prop]);
				$property->setValue($instance, $nestedInstance);
				continue;
			}

			if ($details['arrayClass']) {
				$items = [];
				foreach ($data[$prop] as $itemData) {
					if ($itemData instanceof $details['arrayClass']) {
						$items[] = $itemData;
						continue;
					}

					$nested = new $details['arrayClass']();
					self::map($nested, $itemData);
					$items[] = $nested;
				}
				$property->setValue($instance, $items);
				continue;
			}

			$property->setValue($instance, $data[$prop]);
		}
	}

	/**
	 * @param class-string<Model> $className
	 * @return ClassDetails
	 */
	private static function getReflection(string $className): array
	{
		if (isset(self::$reflectionCache[$className])) {
			return self::$reflectionCache[$className];
		}

		$reflectionClass = new ReflectionClass($className);
		$properties = [];

		foreach ($reflectionClass->getProperties() as $property) {
			$objectAttr = $property->getAttributes(FromJsonObject::class)[0] ?? null;
			$arrayAttr = $property->getAttributes(FromJsonArray::class)[0] ?? null;

			$properties[$property->getName()] = [
				'property' => $property,
				'objectClass' => $objectAttr?->newInstance()->className,
				'arrayClass' => $arrayAttr?->newInstance()->className,
			];
		}

		return self::$reflectionCache[$className] = [
			'class' => $reflectionClass,
			'properties' => $properties,
		];
	}
}