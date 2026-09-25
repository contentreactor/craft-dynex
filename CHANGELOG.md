# Release Notes for Dynamic Exporter

## Unreleased

### Changed
- Fields, attributes, block types and values are read with Field Value Parser. Exporters and their field mappings stay as they are.
- Entries have Author IDs and Enabled attributes, and addresses an Address Line 3 attribute, from Field Value Parser.
- Dynex no longer requires developion/toolbox.

### Fixed
- Exporters can be deleted from the exporters list.

## 2.0.0

### Added
- Added Craft CMS 5 support. Requires Craft CMS 5.8.0 or later, and developion/toolbox 2.0.
- Content Block fields can be expanded into their fields, like Matrix and Neo fields.
- Addresses fields can be expanded into the attributes and fields of their addresses, like relation fields.
- Entries have an Authors attribute. Multiple authors spread across rows, like relation fields.

### Changed
- Matrix fields expand into their entry types, with the names and handles the Matrix field gives them.
- Fields use the handles and labels their field layouts give them.
- Authors and uploaders are offered from Craft Team up, and user groups from Craft Pro up. The plugin’s permissions are registered on every edition but Solo.
- The field layout designer brings its own frame, workspace and sidebar styles for the Craft 5 control panel.
- All sources of an element type only offer the fields of top-level elements, not those of entry types only used in Matrix fields.

### Fixed
- New exporters start with all sources selected, so the field layout designer shows up before the first save.

### Upgrading
- Field mappings from 1.x are migrated: the `author` attribute becomes `authors`.

## 1.0.0
- Initial release
