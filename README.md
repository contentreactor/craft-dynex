# Dynamic Exporter

Build your own element exports in the Craft CMS control panel, mapping fields, native attributes and nested fields to columns.

## Requirements

This plugin requires Craft CMS 5.8.0 or later, and PHP 8.2 or later.

Dynex reads fields, attributes and values with [Field Value Parser](https://github.com/marcusgaius/field-value-parser), which Composer installs with it. Its plugin doesn't need to be installed.

For Craft CMS 4, use the 1.x releases.

## Installation

You can install this plugin from the Plugin Store or with Composer.

#### From the Plugin Store

Go to the Plugin Store in your project’s Control Panel and search for “Dynamic Exporter”. Then press “Install”.

#### With Composer

Open your terminal and run the following commands:

```bash
# go to the project directory
cd /path/to/my-project.test
```

```bash
# tell Composer to load the plugin
composer require contentreactor/craft-dynex
```
```bash
# inside DDEV
ddev composer require contentreactor/craft-dynex
```

```bash
# tell Craft to install the plugin
./craft plugin/install dynex
```
```bash
# inside DDEV
ddev craft plugin/install dynex
```

## Editions

Dynamic Exporter comes in two editions, from the Plugin Store:

| | Lite | Pro |
|---|:---:|:---:|
| Exporters and the layout designer, for every element type | ✓ | ✓ |
| Fields inside Matrix, Neo, Content Block and Addresses fields, and related elements' fields | ✓ | ✓ |
| Column formats, and joined or row-per-value layouts | ✓ | ✓ |
| Exports from element indexes, as CSV, JSON, XML or XLSX | ✓ | ✓ |
| Importable exporters, and importing their files back | | ✓ |
| Export runs in the queue, with their history and files | | ✓ |
| Scheduling export runs from the console | | ✓ |
| Emailing export runs' files | | ✓ |
| Moving exporters between projects as JSON | | ✓ |

## Column formats

A mapped field's settings, from its gear icon in the layout designer, can change how its column shows values:

- **Dates:** ISO 8601 by default, or a date format such as `31.12.2026` or a Unix timestamp
- **Related elements:** their default values, e.g. entries' titles, or their IDs, UIDs, URLs or slugs
- **Options fields:** their options' values, or their labels
- **Lightswitch fields:** `1`/`0`, Yes/No, or `true`/`false`

**Multiple Values** decides how lists of values, like related elements or nested entries, are laid out: a row each, lined up across the columns, or joined into their cell with the **Value Separator**. Importable exporters always give them a row each, and export the values they import in their own format.

## Export runs

With Pro, exporters export in the queue too, from their **Export runs** page or the console, with the settings under **Export Runs** on their page: the format, the site, whether only enabled elements are exported, and whether only recently created ones are. The files stay downloadable from the run history for the days the plugin settings keep them, 30 by default.

Runs export the elements of the exporter's sources that its owner can see, whoever starts them, and email their files to the addresses under **Email the File To**.

Schedule them from cron, or any task scheduler, with the exporter's ID or UID, which `dynex/exports/list` lists:

```bash
php craft dynex/exports/run <uid>          # runs right away, writing to storage/dynex/exports
php craft dynex/exports/run <uid> --queue  # hands the run to the queue
php craft dynex/exports/prune              # deletes runs older than the plugin settings keep them for
```

## Moving exporters between projects

With Pro, **Download the exporter as JSON** on an exporter's page downloads its definition, and **Import an Exporter** on the exporters list creates it for you in another project, or the same one. Fields are matched by their UIDs, which the project config keeps the same in every environment. Fields the project doesn't have are listed, and export nothing.

## Importable exporters

Turn on **Importable** in an exporter’s settings to export files that can be edited and imported back. Each row starts with the element’s ID, and its site’s handle on multi-site installs. They’re on every row of the element, so the rows stay together when a file is sorted.

Top-level fields and the attributes that can be written, such as titles, post dates and author IDs, hold their values in the format they’re imported back from:

- Related elements and authors as their IDs, one per row
- Dates in ISO 8601, with their time zone
- Other fields’ values the way Craft stores them, e.g. `1` for a switched-on Lightswitch field, or `["red","blue"]` for Checkboxes

Fields inside other fields, fields holding nested entries, and the other attributes are exported for reading, and are left alone on import. The exporter’s settings list which columns import.

### Importing

Edit an importable export in a spreadsheet app, then import it from the exporter’s **Import** link, as a CSV, XLSX or JSON file. Users need the “Import files into importable exporters’ elements” permission, and only elements they can save are changed.

1. Uploading a file saves nothing yet. The import lists what the file changes, field by field, and the rows it couldn’t match to an element.
2. Rows are matched to elements by their ID, and their site’s handle. A single value comes from the element’s first row, and lists, like related elements’ IDs, from all of its rows. To relate another element, add a row with the element’s ID and the related element’s ID.
3. Applying the import saves the elements from the queue, with a revision noting the file. Values that changed since the file was uploaded are left alone, and so are elements that don’t validate. Both are listed with their rows.

Imports stay listed under their exporter, with how they went, until they’re deleted.

## Upgrading from Craft CMS 4

Update Craft CMS and the plugin together, then run the migrations (`./craft up`).

Exporters keep their field mappings. When Craft turns Matrix block types into entry types, and the fields inside them into global fields, it keeps their handles, so mapped fields like `pageBlocks.text:body` keep working. The plugin renames the `author` attribute to `authors`, since Craft 5 entries can have multiple authors.

## Support

Report issues at https://github.com/contentreactor/craft-dynex/issues, or write to support@contentreactor.com.

## License

The Craft License, see [LICENSE.md](LICENSE.md).
