<?php
declare(strict_types=1);

namespace ContentReactor\Dynex\Models;

/**
 * A column of an exporter's files: one of its mapped fields, or one of the columns importable exports identify elements by
 */
final class Column
{
	/** The element's ID, on every row of an importable export */
	public const KIND_ID = 'id';
	/** The handle of the element's site, on every row of an importable export on a multi-site install */
	public const KIND_SITE = 'site';
	/** A custom field an importable export holds in the format it's imported back from */
	public const KIND_FIELD = 'field';
	/** An attribute an importable export holds in the format it's imported back from */
	public const KIND_ATTRIBUTE = 'attribute';
	/** A mapped field exported the way people read it, and left alone on import */
	public const KIND_READ_ONLY = 'readOnly';

	public const LABEL_ID = 'ID';
	public const LABEL_SITE = 'Site';

	/**
	 * @param self::KIND_* $kind
	 */
	public function __construct(
		public readonly string $label,
		public readonly string $kind,
		public readonly ?FieldConfig $fieldConfig = null,
	) {}

	/**
	 * Whether importing a file changes the column's value
	 */
	public function isImportable(): bool
	{
		return $this->kind === self::KIND_FIELD || $this->kind === self::KIND_ATTRIBUTE;
	}

	/**
	 * Whether it identifies the element, so every row of the element holds it, keeping the rows together when a file is sorted
	 */
	public function identifiesElement(): bool
	{
		return $this->kind === self::KIND_ID || $this->kind === self::KIND_SITE;
	}
}
