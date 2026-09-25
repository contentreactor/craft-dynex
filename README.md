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

## Upgrading from Craft CMS 4

Update Craft CMS and the plugin together, then run the migrations (`./craft up`).

Exporters keep their field mappings. When Craft turns Matrix block types into entry types, and the fields inside them into global fields, it keeps their handles, so mapped fields like `pageBlocks.text:body` keep working. The plugin renames the `author` attribute to `authors`, since Craft 5 entries can have multiple authors.

## Support

Report issues at https://github.com/contentreactor/craft-dynex/issues, or write to support@contentreactor.com.
