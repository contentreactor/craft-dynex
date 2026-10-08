# Release Notes for Dynamic Exporter

## 1.1.0 - 2026-10-08

> [!IMPORTANT]
> This release adds database migrations. Run `php craft up` after updating.
>
> Dynamic Exporter now comes in Lite and Pro editions, and existing installs update to Lite. Importable exporters, imports, export runs and moving exporters between projects need Pro.

### Added
- Lite and Pro editions. Lite has the exporters, the layout designer, column formats and element index exports. Pro adds importable exporters and imports, export runs, scheduling, delivery and moving exporters between projects.
- Column formats: dates in a date format, related elements by their IDs, UIDs, URLs or slugs, options by their labels, and switches as Yes/No or true/false.
- Exporters can join lists of values into their cell, with a separator, instead of giving them a row each.
- Exporters can be importable (Pro). Their files start with each element’s ID, and its site’s handle on multi-site installs, on every row of the element. Top-level fields and writable attributes hold values in the format they’re imported back from: related elements and authors as IDs, dates in ISO 8601, and other fields’ values the way Craft stores them. Everything else is exported for reading, as before.
- Importable exporters’ files can be imported back as CSV, XLSX or JSON files (Pro). Imports list what they change, and the rows they can’t match, before anything is saved. They save the elements from the queue, leaving alone values that changed since the upload, and need the new “Import files into importable exporters’ elements” permission.
- Export runs (Pro): exporters export in the queue, with their own format, site and filters, keep their files in a run history for as many days as the new plugin setting says, and email them to delivery addresses.
- The `dynex/exports/run`, `dynex/exports/list` and `dynex/exports/prune` console commands (Pro), e.g. to schedule export runs.
- Exporters can be downloaded as JSON and imported into other projects (Pro), matching fields by their UIDs.

### Changed
- Dynamic Exporter is licensed under the Craft License.

### Fixed
- Saved exporters’ pages no longer fail to render when Craft’s dev mode is on.

## 1.0.0 - 2026-09-25
- Initial release

### Upgrading from `contentreactor/dynex`
- Require `contentreactor/craft-dynex` instead. The plugin handle, `dynex`, and its exporters stay the same.
- Field mappings from Craft 4 keep working. Run `php craft up` after updating: the `author` attribute becomes `authors`, as Craft 5 entries can have several authors.
