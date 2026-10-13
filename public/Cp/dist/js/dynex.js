(function () {
	'use strict';

	const DesignerElement = Garnish.Base.extend(
		{
			tab: null,
			$container: null,
			$settingsContainer: null,
			$editBtn: null,

			uid: null,
			isField: false,
			attribute: null,
			hasSettings: false,
			settingsNamespace: null,
			slideout: null,

			/**
			 * Constructor
			 *
			 * @this {typeof DesignerElement}
			 * @param {DesignerTab} tab    Elements that should be draggable right away. (Can be skipped.)
			 * @param {JQuery<HTMLElement>|HTMLElement} $container Any settings that should override the defaults.
			 */
			init: function (tab, $container) {
				this.tab = tab;
				this.$container = $container;
				this.$container.data('fld-element', this);
				this.uid = this.$container.data('uid');

				if (!this.uid) {
					this.uid = Craft.uuid();
					this.config = $.extend(this.$container.data('config'), { uid: this.uid });
				}

				this.isField = this.$container.hasClass('fld-field');

				if (this.isField) {
					this.attribute = this.$container.attr('data-handle');
				}

				this.settingsNamespace = this.$container
					.data('settings-namespace')
					.replace(/\bELEMENT_UID\b/g, this.uid);
				let settingsHtml = (this.$container.data('settings-html') || '').replace(/\bELEMENT_UID\b/g, this.uid);
				this.hasSettings = settingsHtml;

				if (this.hasSettings) {
					// create the setting container
					this.$settingsContainer = $('<div/>', {
						class: 'hidden',
					});

					// create the edit button
					this.$editBtn = $('<a/>', {
						role: 'button', tabindex: 0, class: 'settings icon', title: Craft.t('app', 'Edit'),
					});

					const showSettings = () => {
						if (!this.slideout) {
							this.createSettings(settingsHtml);
						} else {
							this.slideout.open();
						}
					};

					this.$editBtn.on('click', showSettings);
					this.$container.on('dblclick', showSettings);
				}

				this.initUi();

				// cleanup
				this.$container.attr('data-keywords', null);
				this.$container.attr('data-settings-html', null);
			},

			initUi: function () {
				if (this.hasSettings) {
					this.$editBtn.appendTo(this.$container);
				}
			},

			createSettings: function (settingsHtml) {
				const settingsJs = (this.$container.data('settings-js') || '').replace(/\bELEMENT_UID\b/g, this.uid);
				this.slideout = this.tab.designer.createSlideout(settingsHtml, settingsJs);

				this.slideout.$container.on('submit', (ev) => {
					ev.preventDefault();
					this.applySettings();
				});

				this.trigger('createSettings');
			},

			applySettings: function () {
				// The label input is namespaced, e.g. `element-<uid>[label]`
				const label = String(this.slideout.$container.find('input[name$="[label]"], input[name="label"]').val() ?? '').trim();
				// Only fields with formats to choose from have a format select
				const $format = this.slideout.$container.find('select[name$="[format]"], select[name="format"]');

				this.updateConfig((config) => {
					// A blank label falls back to the field's default label
					config.label = label || config.defaultLabel;
					if ($format.length) {
						config.format = String($format.val() ?? '') || null;
					}
					return config
				});

				this.$container
					.find('.fld-element-label h4')
					.text(this.config.label)
					.attr('title', this.config.label);

				this.slideout.close();
			},

			get index() {
				const tabConfig = this.tab.config;
				if (typeof tabConfig === 'undefined') {
					return -1
				}
				return tabConfig.elements.findIndex((c) => c.uid === this.uid)
			},

			get config() {
				if (!this.uid) {
					throw 'Tab is missing its UID'
				}
				let config = this.tab.config.elements.find((c) => c.uid === this.uid);
				if (!config) {
					config = {
						uid: this.uid,
					};
					this.config = config;
				}
				return config
			},

			set config(config) {
				const tabConfig = this.tab.config;
				const index = this.index;
				if (index !== -1) {
					tabConfig.elements[index] = config;
				} else {
					const newIndex = $.inArray(this.$container[0], this.$container.parent().children('.fld-element'));
					tabConfig.elements.splice(newIndex, 0, config);
				}
				this.tab.config = tabConfig;
			},

			updateConfig: function (callback) {
				const config = callback(this.config);
				if (config !== false) {
					this.config = config;
				}
			},

			updatePositionInConfig: function () {
				this.tab.updateConfig((config) => {
					const elementConfig = this.config;
					const oldIndex = this.index;
					const newIndex = $.inArray(this.$container[0], this.$container.parent().children('.fld-element'));
					if (oldIndex !== -1) {
						config.elements.splice(oldIndex, 1);
					}
					config.elements.splice(newIndex, 0, elementConfig);
					return config
				});
			},

			destroy: function () {
				this.tab.updateConfig((config) => {
					const index = this.index;
					if (index === -1) {
						return false
					}
					config.elements.splice(index, 1);
					return config
				});

				this.tab.designer.elementDrag.removeItems(this.$container);
				this.$container.remove();

				if (this.slideout) {
					this.slideout.destroy();
					this.slideout = null;
				}

				if (this.isField) {
					this.tab.designer.removeFieldByHandle(this.attribute);
				}

				this.base();
			},
		},
		{},
	);

	const DesignerTab = Garnish.Base.extend(
		{
			designer: null,
			uid: null,
			$container: null,
			destroyed: false,

			init: function (designer, $container) {
				this.designer = designer;
				this.$container = $container;
				this.$container.data('fld-tab', this);
				this.uid = this.$container.data('uid');

				// New tab?
				if (!this.uid) {
					this.uid = Craft.uuid();
					this.config = {
						uid: this.uid,
						name: this.$container.find('.tabs .tab span').text(),
						elements: [],
					};
					this.$container.data('settings-namespace', this.designer.$container
						.data('new-tab-settings-namespace')
						.replace(/\bTAB_UID\b/g, this.uid));

					this.$container.data('settings-html', this.designer.$container
						.data('new-tab-settings-html')
						.replace(/\bTAB_UID\b/g, this.uid)
						.replace(/\bTAB_NAME\b/g, this.config.name));

					this.$container.data('settings-js', this.designer.$container
						.data('new-tab-settings-js')
						.replace(/\bTAB_UID\b/g, this.uid));
				}

				// initialize the elements
				const $elements = this.$container.children('.fld-tabcontent').children();

				for (let i = 0; i < $elements.length; i++) {
					this.initElement($($elements[i]));
				}
			},

			initElement: function ($element) {
				return new DesignerElement(this, $element)
			},

			get index() {
				return this.designer.config.tabs.findIndex((c) => c.uid === this.uid)
			},

			get config() {
				if (!this.uid) {
					throw 'Tab is missing its UID'
				}
				let config = this.designer.config.tabs.find((c) => c.uid === this.uid);
				if (!config) {
					config = {
						uid: this.uid, elements: [],
					};
					this.config = config;
				}
				return config
			},

			set config(config) {
				if (this.destroyed) {
					return
				}

				// Is the name changing?
				if (config.name && config.name !== this.config.name) {
					this.$container.find('.tabs .tab span').text(config.name);
				}

				const designerConfig = this.designer.config;
				const index = this.index;
				if (index !== -1) {
					designerConfig.tabs[index] = config;
				} else {
					const newIndex = $.inArray(this.$container[0], this.$container.parent().children('.fld-tab'));
					designerConfig.tabs.splice(newIndex, 0, config);
				}
				this.designer.config = designerConfig;
			},

			updateConfig: function (callback) {
				if (this.destroyed) {
					return
				}

				const config = callback(this.config);
				if (config !== false) {
					this.config = config;
				}
			},

			destroy: function () {
				if (this.destroyed) {
					return
				}

				this.destroyed = true;

				this.designer.updateConfig((config) => {
					const index = this.index;
					if (index === -1) {
						return false
					}
					config.tabs.splice(index, 1);
					return config
				});

				// First destroy the tab's elements
				let $elements = this.$container.find('.fld-element');
				for (let i = 0; i < $elements.length; i++) {
					$elements.eq(i).data('fld-element').destroy();
				}

				this.designer.tabGrid.removeItems(this.$container);
				this.designer.tabDrag.removeItems(this.$container);
				this.$container.remove();

				this.base();
			},
		}, {});

	const ComplexFields = Garnish.Base.extend(
		{
			library: null,
			sidebar: null,
			designer: null,

			/**
			 * Constructor
			 * @param {SidebarLibrary} library
			 */
			init: function (library) {
				this.library = library;
				this.sidebar = this.library.sidebar;
				this.designer = this.sidebar.designer;

				// Relation fields and block fields (Matrix, Neo) both expand into a nested sidebar
				this.addListener(this.library.$container.find('.fld-element.complex-field'), 'click', (ev) => {
					if ($(ev.target).closest('.icon-holder').length === 0) return

					this.expand($(ev.currentTarget));
				});
			},

			/**
			 * Opens a nested sidebar with the fields an item expands into.
			 * @param {JQuery} $item
			 */
			expand: function ($item) {
				this.library.$search.blur();

				// Close sidebars opened from this one (or deeper), so the new sidebar replaces them
				this.designer.removeSidebarsAfter(this.sidebar);

				Craft.sendActionRequest('POST', 'dynex/exporters/complex-field', {
					data: {
						currentNesting: this.designer.$container.data('nestingLevels'),
						config: JSON.stringify($item.data('config')),
					},
				})
					.then(({ data }) => this.addNestedSidebar(data.sidebarHtml))
					.catch(({ response }) => Craft.cp.displayError(response?.data?.message));
			},

			/**
			 * @param {string} sidebarHtml
			 */
			addNestedSidebar: function (sidebarHtml) {
				const $sidebar = $(sidebarHtml);

				const levels = this.designer.$container.data('nestingLevels') + 1;
				this.designer.$container.css('--nesting-levels', levels);
				this.designer.$container.data('nestingLevels', levels);

				this.sidebar.$container.after($sidebar);
				this.designer.addSidebar($sidebar);
				this.sidebar.$container.scrollTop(0);

				this.designer.elementDrag.addItems($sidebar.find('.fld-element:not(.block-field)'));
			},
		},
	);

	const CustomFields = Garnish.Base.extend(
		{
			library: null,
			sidebar: null,
			designer: null,

			/**
			 * Constructor
			 * @param {SidebarLibrary} library
			 */
			init: function (library) {
				this.library = library;
				this.sidebar = this.library.sidebar;
				this.designer = this.sidebar.designer;

				this.addListener(this.library.$fields.filter('.unused'), 'click', (e) => this.addElement(e));
				this.hideUsedLibraryElements();
			},

			hideUsedLibraryElements: function () {
				const $libraryElements = this.library.$fields.filter('.unused');

				this.designer.$tabContainer.find('.fld-element.fld-field').each((i, el) => {
					this.designer.hideLibraryElement(
						$libraryElements.filter((i, item) => item.dataset.handle === el.dataset.handle),
					);
				});
			},

			/**
			 * Adds a new element from the sidebar to the currently active workspace tab when the
			 * "add-element" button is clicked. Clones the element, appends it to the tab content,
			 * initializes its layout behavior, and updates the UI accordingly.
			 *
			 * @function
			 * @param {MouseEvent} event - The mouse event triggered by clicking a sidebar element.
			 *
			 * @returns {false|void} Returns false to prevent default click behavior if successful, otherwise void.
			 */
			addElement: function (event) {
				if ($(event.target).closest('.add-element').length === 0) return

				const $item = $(event.currentTarget);
				if ($item.hasClass('hidden') || $item.hasClass('block-field')) return

				const $activePane = this.designer.$tabContainer.find('.fld-tab:visible').first();

				if (!$activePane.length) {
					console.warn('No visible tab pane found to drop the item into.');
					return
				}

				const currentTab = $activePane.data('fld-tab');
				if (!currentTab) {
					console.warn('Could not get tab instance for visible pane.');
					return
				}

				const $clonedItem = $item.clone().removeClass('unused hidden filtered');
				$clonedItem.appendTo($activePane.find('.fld-tabcontent'));
				this.ensureVisible($clonedItem);

				this.designer.hideLibraryElement($item);

				const clonedItem = currentTab.initElement($clonedItem);
				this.designer.elementDrag.addItems($clonedItem);
				clonedItem.updatePositionInConfig();
				this.designer.tabGrid.refreshCols(true);

				return false
			},

			/**
			 * Utility to ensure an element is visibly displayed
			 * @param {jQuery} $el
			 */
			ensureVisible: function ($el) {
				if ($el.css('visibility') === 'hidden') {
					$el.css('visibility', 'visible');
				}
			},
		},
	);

	const SidebarLibrary = Garnish.Base.extend(
		{
			$container: null,
			$search: null,
			$clearSearchBtn: null,
			$fields: null,
			/** @type {DesignerSidebar} */
			sidebar: null,

			/**
			 * Constructor
			 *
			 * @this {typeof SidebarLibrary}
			 * @param {JQuery<HTMLElement>|HTMLElement|string} container CSS selector, HTML Element, or JQuery wrapper of the element
			 * @param {DesignerSidebar} sidebar
			 */
			init: function (container, sidebar) {
				this.$container = $(container);
				this.sidebar = sidebar;
				this.$fields = this.$container.find('.fld-element');
				let $fieldSearchContainer = this.$container.children('.search');
				if ($fieldSearchContainer.length === 0) return

				this.$search = $fieldSearchContainer.children('input');
				this.$clearSearchBtn = $fieldSearchContainer.children('.clear-btn');
				new ComplexFields(this);
				new CustomFields(this);

				this.addListener(this.$search, 'input', () => {
					let val = this.$search.val().toLowerCase().replace(/['"]/g, '');
					if (!val) {
						this.$container.find('.filtered').removeClass('filtered');
						this.$clearSearchBtn.addClass('hidden');
						return
					}

					this.$clearSearchBtn.removeClass('hidden');
					let $matches = this.$fields
						.filter(`[data-keywords*="${val}"]`)
						.add(this.$container.children('.fld-element'))
						.removeClass('filtered');
					this.$fields.not($matches).addClass('filtered');
				});

				this.addListener(this.$search, 'keydown', (ev) => {
					switch (ev.keyCode) {
						case Garnish.ESC_KEY:
							this.$search.val('').trigger('input');
							break
						case Garnish.RETURN_KEY:
							ev.preventDefault();
							break
					}
				});

				this.addListener(this.$clearSearchBtn, 'click', () => {
					this.$search.val('').trigger('input');
				});
			},
		});

	const DesignerSidebar = Garnish.Base.extend({
		/** @type {JQuery} */
		$container: /** @type {any} */ (null),
		$libraryToggle: null,
		/** @type {SidebarLibrary?} */
		selectedLibrary: null,
		/** @type {SidebarLibrary[]} */
		libraries: null,
		$libraryContainers: [],
		designer: null,
		_parentConfig: null,
		_config: null,

		/**
		 * @param {typeof Designer} designer
		 * @param {JQuery<HTMLElement>|HTMLElement|string} container CSS selector, HTML Element, or JQuery wrapper of the element
		 */
		init: function (designer, container) {
			this.$container = $(container);
			this.designer = designer;
			this.libraries = [];
			this.$libraryContainers = $.makeArray(this.$container.children('.fld-library'));
			for (let [index, $libraryContainer] of this.$libraryContainers.entries()) {
				let library = new SidebarLibrary($libraryContainer, this);
				if (index === 0) this.selectedLibrary = library;
				this.libraries.push(library);
			}

			// Nested sidebars have a close button (Escape closes the last one too)
			this.addListener(this.$container.children('.sidebar-name-wrapper').find('.sidebar-close'), 'activate', () => {
				this.designer.closeSidebar(this);
			});

			let $libraryPicker = this.$container.children('.btngroup');
			new Craft.Listbox($libraryPicker, {
				onChange: ($selectedOption) => {
					this.selectedLibrary.$container.addClass('hidden');
					this.selectedLibrary = this.getLibrary($selectedOption.data('library'));
					this.selectedLibrary.$container
						.removeClass('hidden');
				},
			});
		},

		getParentConfig: function () {
			return this.$container.data('parentConfig')
		},

		/**
		 * @param {string} handle
		 * @return {SidebarLibrary}
		 */
		getLibrary: function (handle) {
			return this.libraries.find(library => handle === library.$container.data('library'))
		}
	}, {});

	const ElementDrag = Garnish.Drag.extend({
		draggingLibraryElement: false,
		draggingField: false,
		originalTab: null,
		designer: null,
		$insertion: null,
		showingInsertion: false,
		$caboose: null,

		init: function (designer, settings) {
			this.designer = designer;
			this.base(this.findItems(), settings);
		},

		removeCaboose: function () {
			this.$items = this.$items.not(this.$caboose);
			this.$caboose.remove();
		},

		swapDraggeeWithInsertion: function () {
			this.$insertion.insertBefore(this.$draggee);
			this.$draggee.detach();
			this.$items = $().add(this.$items.not(this.$draggee).add(this.$insertion));
			this.showingInsertion = true;
		},

		swapInsertionWithDraggee: function () {
			this.$insertion.replaceWith(this.$draggee);
			this.$items = $().add(this.$items.not(this.$insertion).add(this.$draggee));
			this.showingInsertion = false;
		},

		setMidpoints: function () {
			for (let i = 0; i < this.$items.length; i++) {
				let $item = $(this.$items[i]);
				let offset = $item.offset();

				// Skip library elements
				if ($item.hasClass('unused')) {
					continue
				}

				$item.data('midpoint', {
					left: offset.left + $item.outerWidth() / 2, top: offset.top + $item.outerHeight() / 2,
				});
			}
		},

		getClosestItem: function () {
			this.getClosestItem._closestItem = null;
			this.getClosestItem._closestItemMouseDiff = null;

			for (this.getClosestItem._i = 0; this.getClosestItem._i < this.$items.length; this.getClosestItem._i++) {
				this.getClosestItem._$item = $(this.$items[this.getClosestItem._i]);

				this.getClosestItem._midpoint = this.getClosestItem._$item.data('midpoint');
				if (!this.getClosestItem._midpoint) {
					continue
				}

				this.getClosestItem._mouseDiff = Garnish.getDist(this.getClosestItem._midpoint.left, this.getClosestItem._midpoint.top, this.mouseX, this.mouseY);

				if (this.getClosestItem._closestItem === null || this.getClosestItem._mouseDiff < this.getClosestItem._closestItemMouseDiff) {
					this.getClosestItem._closestItem = this.getClosestItem._$item[0];
					this.getClosestItem._closestItemMouseDiff = this.getClosestItem._mouseDiff;
				}
			}

			return this.getClosestItem._closestItem
		},

		checkForNewClosestItem: function () {
			// Is there a new closest item?
			this.checkForNewClosestItem._closestItem = this.getClosestItem();

			if (this.checkForNewClosestItem._closestItem === this.$insertion[0]) {
				return
			}

			if (this.showingInsertion && $.inArray(this.$insertion[0], this.$items) < $.inArray(this.checkForNewClosestItem._closestItem, this.$items) && $.inArray(this.checkForNewClosestItem._closestItem, this.$caboose) === -1) {
				this.$insertion.insertAfter(this.checkForNewClosestItem._closestItem);
			} else {
				this.$insertion.insertBefore(this.checkForNewClosestItem._closestItem);
			}

			this.$items = $().add(this.$items.add(this.$insertion));
			this.showingInsertion = true;
			this.designer.tabGrid.refreshCols(true);
			this.setMidpoints();
		},

		findItems: function () {
			// Return all of the used + unused fields
			return this.designer.$tabContainer
				.find('.fld-element')
				.add(this.designer.selectedSidebar.$container.find('.fld-element:not(.block-field)'))
		},

		/**
		 * @param {JQuery<HTMLElement>[]} items Elements that should be draggable.
		 */
		addItems: function (items) {
			items = $.makeArray(items);

			for (const item of items) {
				if ($.data(item, 'drag')) {
					console.warn('Element was added to more than one dragger');
					$.data(item, 'drag').removeItems(item);
				}

				$.data(item, 'drag', this);

				// Store the handler reference on the element
				const handler = (ev) => {
					this._handleMouseDown(ev, item);
				};
				$.data(item, 'mousedownHandler', handler);

				this.addListener(this._getItemHandle(item), 'mousedown', handler);
			}

			this.$items = this.$items.add(items);
		},

		onDragStart: function () {
			this.base();

			this.$insertion = this.createInsertion();

			this.$caboose = this.createCaboose();
			this.$items = $().add(this.$items.add(this.$caboose));

			Garnish.$bod.addClass('dragging');

			this.draggingLibraryElement = this.$draggee.hasClass('unused');
			this.draggingField = this.$draggee.hasClass('fld-field');

			if (!this.draggingLibraryElement) {
				this.originalTab = this.$draggee.closest('.fld-tab').data('fld-tab');
				this.swapDraggeeWithInsertion();
			} else {
				this.originalTab = null;
			}

			this.setMidpoints();
		},

		onDrag: function () {
			if (this.isHoveringOverTab()) {
				this.checkForNewClosestItem();
			} else if (this.showingInsertion) {
				this.$insertion.remove();
				this.$items = $().add(this.$items.not(this.$insertion));
				this.showingInsertion = false;
				this.designer.tabGrid.refreshCols(true);
				this.setMidpoints();
			}

			this.base();
		},

		isHoveringOverTab: function () {
			for (let i = 0; i < this.designer.tabGrid.$items.length; i++) {
				if (Garnish.hitTest(this.mouseX, this.mouseY, this.designer.tabGrid.$items.eq(i))) {
					return true
				}
			}

			return false
		},

		createCaboose: function () {
			let $caboose = $();
			let $fieldContainers = this.designer.$tabContainer.find('> .fld-tab > .fld-tabcontent');

			for (let i = 0; i < $fieldContainers.length; i++) {
				$caboose = $caboose.add($('<div/>').appendTo($fieldContainers[i]));
			}

			return $caboose
		},

		createInsertion: function () {
			return $(`<div class="fld-element fld-insertion" style="height: ${this.$draggee.outerHeight()}px;"/>`)
		},

		onDragStop: function () {
			let showingInsertion = this.showingInsertion;
			if (showingInsertion) {
				if (this.draggingLibraryElement) {
					// Create a new element based on that one
					const $element = this.$draggee.clone().removeClass('unused');

					if (this.draggingField) {
						this.$draggee.css({ visibility: 'inherit' });
						this.designer.hideLibraryElement(this.$draggee);
					}

					// Set this.$draggee to the clone, as if we were dragging that all along
					this.$draggee = $element;

					// Remember it for later
					this.addItems($element);
				}
			} else if (!this.draggingLibraryElement) {
				const $libraryElement = this.designer.findLibraryElement(this.$draggee.attr('data-handle'));

				// Destroy the original element (this also restores the library element)
				this.$draggee.data('fld-element').destroy();

				// Set this.$draggee to the library element, as if we were dragging that all along
				this.$draggee = $libraryElement;
			}

			if (this.showingInsertion) {
				this.swapInsertionWithDraggee();
			}

			this.removeCaboose();

			this.designer.tabGrid.refreshCols(true);

			// return the helpers to the draggees
			let offset = this.$draggee.offset();
			if (!offset || (offset.top === 0 && offset.left === 0)) {
				this.$draggee
					.css({
						display: this.draggeeDisplay, visibility: 'visible', opacity: 0,
					})
					.velocity({ opacity: 1 }, Garnish.FX_DURATION);
				this.helpers[0].velocity({ opacity: 0 }, Garnish.FX_DURATION, () => {
					this._showDraggee();
				});
			} else {
				this.returnHelpersToDraggees();
			}

			this.base();

			Garnish.$bod.removeClass('dragging');

			this.$draggee.css({
				display: this.draggeeDisplay, visibility: this.draggingField || showingInsertion ? 'hidden' : 'visible',
			});

			if (showingInsertion) {
				const tab = this.$draggee.closest('.fld-tab').data('fld-tab');
				let element;

				if (this.draggingLibraryElement) {
					element = tab.initElement(this.$draggee);
				} else {
					element = this.$draggee.data('fld-element');

					// New tab?
					if (tab !== this.originalTab) {
						const config = element.config;

						this.originalTab.updateConfig((config) => {
							const index = element.index;
							if (index === -1) {
								return false
							}
							config.elements.splice(index, 1);
							return config
						});

						this.$draggee.data('fld-element').tab = tab;
						element.config = config;
					}
				}

				element.updatePositionInConfig();
			}
		},
	});

	// Classes built with Garnish.Base.extend() are values, so JSDoc needs InstanceType<> to refer to their instances
	/** @typedef {InstanceType<typeof DesignerSidebar>} DesignerSidebarInstance */
	/** @typedef {InstanceType<typeof DesignerTab>} DesignerTabInstance */
	/** @typedef {InstanceType<typeof ElementDrag>} ElementDragInstance */

	/**
	 * @typedef {object} LayoutTabConfig
	 * @property {string} uid
	 * @property {string} [name]
	 * @property {Array<Record<string, any>>} elements
	 */

	/**
	 * The field layout config, kept in sync with the hidden `fieldLayout` input.
	 * @typedef {object} LayoutConfig
	 * @property {string} [uid]
	 * @property {number} [id]
	 * @property {LayoutTabConfig[]} tabs
	 */

	const Designer = Garnish.Base.extend(
		{
			// Every property is set in init(). Declaring the real type and casting the initial null
			// keeps TypeScript from inferring the type `null`.
			/** @type {JQuery} */
			$container: /** @type {any} */ (null),
			/** @type {JQuery} */
			$workspace: /** @type {any} */ (null),
			/** @type {JQuery} */
			$configInput: /** @type {any} */ (null),
			/** @type {JQuery} */
			$tabContainer: /** @type {any} */ (null),
			/** @type {DesignerSidebarInstance} */
			selectedSidebar: /** @type {any} */ (null),
			/** @type {DesignerSidebarInstance[]} */
			$sidebars: [],

			/** Craft.Grid, which isn’t typed. @type {any} */
			tabGrid: null,
			/** @type {ElementDragInstance} */
			elementDrag: /** @type {any} */ (null),

			/** @type {LayoutConfig} */
			_config: /** @type {any} */ (null),

			/**
			 * @param {string} container CSS selector for the designer container
			 */
			init: function (container) {
				this.$container = $(container);
				// editexporter.js destroys the designer before rendering a new one
				this.$container.data('designer', this);

				this.$configInput = this.$container.children('input[data-config-input]');
				this._config = JSON.parse(String(this.$configInput.val()));
				if (!this._config.tabs) {
					this._config.tabs = [];
				}

				this.$workspace = this.$container.children('.fld-workspace');
				this.$tabContainer = this.$workspace.children('.fld-tabs');
				this.selectedSidebar = new DesignerSidebar(this, this.$container.find('.fld-sidebar'));
				this.$sidebars = [this.selectedSidebar];

				// Set up the layout grids
				this.tabGrid = new Craft.Grid(this.$tabContainer, {
					itemSelector: '.fld-tab',
					minColWidth: 24 * 11,
					fillMode: 'grid',
					snapToGrid: 24,
				});

				// `e` is a JQuery.TriggeredEvent, and `this` is the designer
				this.addListener(window, 'keydown', e => {
					if (this.$container.data('nestingLevels') === 0) return
					if (e.key !== 'Escape') return
					if (e.target.closest('.fld-library .search')) return

					this.removeSidebar();
				});

				// "»" buttons remove elements from the workspace without dragging
				this.addListener(this.$workspace, 'click', e => {
					if ($(e.target).closest('.fld-element .remove-element').length === 0) return

					const element = $(e.target).closest('.fld-element').data('fld-element');
					if (!element) return

					element.destroy();
					this.tabGrid.refreshCols(true);
				});

				this.initTab(this.$tabContainer.children());
				this.elementDrag = new ElementDrag(this);
			},

			/**
			 * @param {JQuery} $sidebar
			 */
			addSidebar: function ($sidebar) {
				const newSidebar = new DesignerSidebar(this, $sidebar);
				this.$sidebars.push(newSidebar);
				this.selectedSidebar = newSidebar;
			},

			removeSidebar: function () {
				// The root sidebar always stays
				if (this.$sidebars.length <= 1) return

				const sidebar = /** @type {DesignerSidebarInstance} */ (this.$sidebars.pop());
				this.elementDrag.removeItems(sidebar.$container.find('.fld-element'));
				sidebar.$container.remove();
				this.selectedSidebar = this.$sidebars[this.$sidebars.length - 1];

				const levels = this.$container.data('nestingLevels') - 1;
				this.$container.css('--nesting-levels', levels);
				this.$container.data('nestingLevels', levels);
			},

			/**
			 * Removes the sidebars nested deeper than the given one.
			 * @param {DesignerSidebarInstance} sidebar
			 */
			removeSidebarsAfter: function (sidebar) {
				const index = this.$sidebars.indexOf(sidebar);
				if (index === -1) return

				while (this.$sidebars.length - 1 > index) {
					this.removeSidebar();
				}
			},

			/**
			 * Removes the designer's listeners, dragging and element settings slideouts, e.g. before it's re-rendered.
			 */
			destroy: function () {
				this.$tabContainer.find('.fld-element').each((i, el) => {
					const slideout = $(el).data('fld-element')?.slideout;
					if (slideout) {
						slideout.destroy();
					}
				});

				this.elementDrag.destroy();
				this.$container.removeData('designer');
				this.base();
			},

			/**
			 * Closes a nested sidebar, along with the sidebars opened from it. The root sidebar stays.
			 * @param {DesignerSidebarInstance} sidebar
			 */
			closeSidebar: function (sidebar) {
				const index = this.$sidebars.indexOf(sidebar);
				if (index < 1) return

				this.removeSidebarsAfter(this.$sidebars[index - 1]);
			},

			/**
			 * @param {JQuery} $tab
			 * @returns {DesignerTabInstance}
			 */
			initTab: function ($tab) {
				return new DesignerTab(this, $tab)
			},

			/**
			 * Finds the library element for a handle across all open sidebars.
			 * @param {string} handle
			 * @returns {JQuery}
			 */
			findLibraryElement: function (handle) {
				return this.$container
					.find('.fld-sidebar .fld-element.unused')
					.filter((i, el) => el.dataset.handle === String(handle))
					.first()
			},

			/**
			 * Hides a library element once it's been placed in the workspace.
			 * Complex fields stay visible, so they can still be expanded into nested sidebars.
			 * @param {JQuery} $libraryElement
			 */
			hideLibraryElement: function ($libraryElement) {
				if (!$libraryElement.length || $libraryElement.hasClass('complex-field')) return

				$libraryElement.addClass('hidden');

				if ($libraryElement.siblings('.fld-element:not(.hidden)').length === 0) {
					$libraryElement.closest('.fld-field-group').addClass('hidden');
				}
			},

			/**
			 * @param {string} handle
			 */
			removeFieldByHandle: function (handle) {
				this.findLibraryElement(handle)
					.removeClass('hidden')
					.closest('.fld-field-group')
					.removeClass('hidden');
			},

			/**
			 * @returns {LayoutConfig}
			 */
			get config() {
				return this._config
			},

			/**
			 * @param {LayoutConfig} config
			 */
			set config(config) {
				this._config = config;
				this.$configInput.val(JSON.stringify(config));
			},

			/**
			 * @param {(config: LayoutConfig) => LayoutConfig | false} callback Return `false` to leave the config unchanged.
			 */
			updateConfig: function (callback) {
				const config = callback(this.config);
				if (config !== false) {
					this.config = config;
				}
			},

			/**
			 * @param {string} contents
			 * @param {string} [js]
			 * @returns {any} A Craft.Slideout
			 */
			createSlideout: function (contents, js) {
				const $body = $('<div/>', { class: 'fld-element-settings-body' });
				$('<div/>', { class: 'fields', html: contents }).appendTo($body);
				const $footer = $('<div/>', { class: 'fld-element-settings-footer' });
				$('<div/>', { class: 'flex-grow' }).appendTo($footer);
				const $cancelBtn = Craft.ui
					.createButton({
						label: Craft.t('app', 'Close'), spinner: true,
					})
					.appendTo($footer);
				Craft.ui
					.createSubmitButton({
						class: 'secondary', label: Craft.t('app', 'Apply'), spinner: true,
					})
					.appendTo($footer);
				const $contents = $body.add($footer);

				const slideout = new Craft.Slideout($contents, {
					containerElement: 'form', containerAttributes: {
						action: '', method: 'post', novalidate: '', class: 'fld-element-settings',
					},
				});
				slideout.on('open', () => {
					// Hold off a sec until it's positioned...
					Garnish.requestAnimationFrame(() => {
						// Focus on the first text input
						slideout.$container.find('.text:first').focus();
					});
				});

				$cancelBtn.on('click', () => {
					slideout.close();
				});

				if (js) {
					eval(js);
				}

				Craft.initUiElements(slideout.$container);

				return slideout
			},
		},
	);

	Craft.ExporterLayoutDesigner = Designer;

})();
//# sourceMappingURL=dynex.js.map

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHluZXguanMiLCJzb3VyY2VzIjpbImFzc2V0cy9DcC9zcmMvanMvRXhwb3J0ZXJMYXlvdXQvRGVzaWduZXJFbGVtZW50LmpzIiwiYXNzZXRzL0NwL3NyYy9qcy9FeHBvcnRlckxheW91dC9EZXNpZ25lclRhYi5qcyIsImFzc2V0cy9DcC9zcmMvanMvRXhwb3J0ZXJMYXlvdXQvQ29tcGxleEZpZWxkcy5qcyIsImFzc2V0cy9DcC9zcmMvanMvRXhwb3J0ZXJMYXlvdXQvQ3VzdG9tRmllbGRzLmpzIiwiYXNzZXRzL0NwL3NyYy9qcy9FeHBvcnRlckxheW91dC9TaWRlYmFyTGlicmFyeS5qcyIsImFzc2V0cy9DcC9zcmMvanMvRXhwb3J0ZXJMYXlvdXQvRGVzaWduZXJTaWRlYmFyLmpzIiwiYXNzZXRzL0NwL3NyYy9qcy9FeHBvcnRlckxheW91dC9FbGVtZW50RHJhZy5qcyIsImFzc2V0cy9DcC9zcmMvanMvRXhwb3J0ZXJMYXlvdXQvRGVzaWduZXIuanMiLCJhc3NldHMvQ3Avc3JjL2pzL2R5bmV4LmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IERlc2lnbmVyRWxlbWVudCA9IEdhcm5pc2guQmFzZS5leHRlbmQoXG5cdHtcblx0XHR0YWI6IG51bGwsXG5cdFx0JGNvbnRhaW5lcjogbnVsbCxcblx0XHQkc2V0dGluZ3NDb250YWluZXI6IG51bGwsXG5cdFx0JGVkaXRCdG46IG51bGwsXG5cblx0XHR1aWQ6IG51bGwsXG5cdFx0aXNGaWVsZDogZmFsc2UsXG5cdFx0YXR0cmlidXRlOiBudWxsLFxuXHRcdGhhc1NldHRpbmdzOiBmYWxzZSxcblx0XHRzZXR0aW5nc05hbWVzcGFjZTogbnVsbCxcblx0XHRzbGlkZW91dDogbnVsbCxcblxuXHRcdC8qKlxuXHRcdCAqIENvbnN0cnVjdG9yXG5cdFx0ICpcblx0XHQgKiBAdGhpcyB7dHlwZW9mIERlc2lnbmVyRWxlbWVudH1cblx0XHQgKiBAcGFyYW0ge0Rlc2lnbmVyVGFifSB0YWIgICAgRWxlbWVudHMgdGhhdCBzaG91bGQgYmUgZHJhZ2dhYmxlIHJpZ2h0IGF3YXkuIChDYW4gYmUgc2tpcHBlZC4pXG5cdFx0ICogQHBhcmFtIHtKUXVlcnk8SFRNTEVsZW1lbnQ+fEhUTUxFbGVtZW50fSAkY29udGFpbmVyIEFueSBzZXR0aW5ncyB0aGF0IHNob3VsZCBvdmVycmlkZSB0aGUgZGVmYXVsdHMuXG5cdFx0ICovXG5cdFx0aW5pdDogZnVuY3Rpb24gKHRhYiwgJGNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy50YWIgPSB0YWJcblx0XHRcdHRoaXMuJGNvbnRhaW5lciA9ICRjb250YWluZXJcblx0XHRcdHRoaXMuJGNvbnRhaW5lci5kYXRhKCdmbGQtZWxlbWVudCcsIHRoaXMpXG5cdFx0XHR0aGlzLnVpZCA9IHRoaXMuJGNvbnRhaW5lci5kYXRhKCd1aWQnKVxuXG5cdFx0XHRpZiAoIXRoaXMudWlkKSB7XG5cdFx0XHRcdHRoaXMudWlkID0gQ3JhZnQudXVpZCgpXG5cdFx0XHRcdHRoaXMuY29uZmlnID0gJC5leHRlbmQodGhpcy4kY29udGFpbmVyLmRhdGEoJ2NvbmZpZycpLCB7IHVpZDogdGhpcy51aWQgfSlcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5pc0ZpZWxkID0gdGhpcy4kY29udGFpbmVyLmhhc0NsYXNzKCdmbGQtZmllbGQnKVxuXG5cdFx0XHRpZiAodGhpcy5pc0ZpZWxkKSB7XG5cdFx0XHRcdHRoaXMuYXR0cmlidXRlID0gdGhpcy4kY29udGFpbmVyLmF0dHIoJ2RhdGEtaGFuZGxlJylcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zZXR0aW5nc05hbWVzcGFjZSA9IHRoaXMuJGNvbnRhaW5lclxuXHRcdFx0XHQuZGF0YSgnc2V0dGluZ3MtbmFtZXNwYWNlJylcblx0XHRcdFx0LnJlcGxhY2UoL1xcYkVMRU1FTlRfVUlEXFxiL2csIHRoaXMudWlkKVxuXHRcdFx0bGV0IHNldHRpbmdzSHRtbCA9ICh0aGlzLiRjb250YWluZXIuZGF0YSgnc2V0dGluZ3MtaHRtbCcpIHx8ICcnKS5yZXBsYWNlKC9cXGJFTEVNRU5UX1VJRFxcYi9nLCB0aGlzLnVpZClcblx0XHRcdHRoaXMuaGFzU2V0dGluZ3MgPSBzZXR0aW5nc0h0bWxcblxuXHRcdFx0aWYgKHRoaXMuaGFzU2V0dGluZ3MpIHtcblx0XHRcdFx0Ly8gY3JlYXRlIHRoZSBzZXR0aW5nIGNvbnRhaW5lclxuXHRcdFx0XHR0aGlzLiRzZXR0aW5nc0NvbnRhaW5lciA9ICQoJzxkaXYvPicsIHtcblx0XHRcdFx0XHRjbGFzczogJ2hpZGRlbicsXG5cdFx0XHRcdH0pXG5cblx0XHRcdFx0Ly8gY3JlYXRlIHRoZSBlZGl0IGJ1dHRvblxuXHRcdFx0XHR0aGlzLiRlZGl0QnRuID0gJCgnPGEvPicsIHtcblx0XHRcdFx0XHRyb2xlOiAnYnV0dG9uJywgdGFiaW5kZXg6IDAsIGNsYXNzOiAnc2V0dGluZ3MgaWNvbicsIHRpdGxlOiBDcmFmdC50KCdhcHAnLCAnRWRpdCcpLFxuXHRcdFx0XHR9KVxuXG5cdFx0XHRcdGNvbnN0IHNob3dTZXR0aW5ncyA9ICgpID0+IHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuc2xpZGVvdXQpIHtcblx0XHRcdFx0XHRcdHRoaXMuY3JlYXRlU2V0dGluZ3Moc2V0dGluZ3NIdG1sKVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNsaWRlb3V0Lm9wZW4oKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuJGVkaXRCdG4ub24oJ2NsaWNrJywgc2hvd1NldHRpbmdzKVxuXHRcdFx0XHR0aGlzLiRjb250YWluZXIub24oJ2RibGNsaWNrJywgc2hvd1NldHRpbmdzKVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmluaXRVaSgpXG5cblx0XHRcdC8vIGNsZWFudXBcblx0XHRcdHRoaXMuJGNvbnRhaW5lci5hdHRyKCdkYXRhLWtleXdvcmRzJywgbnVsbClcblx0XHRcdHRoaXMuJGNvbnRhaW5lci5hdHRyKCdkYXRhLXNldHRpbmdzLWh0bWwnLCBudWxsKVxuXHRcdH0sXG5cblx0XHRpbml0VWk6IGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmICh0aGlzLmhhc1NldHRpbmdzKSB7XG5cdFx0XHRcdHRoaXMuJGVkaXRCdG4uYXBwZW5kVG8odGhpcy4kY29udGFpbmVyKVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRjcmVhdGVTZXR0aW5nczogZnVuY3Rpb24gKHNldHRpbmdzSHRtbCkge1xuXHRcdFx0Y29uc3Qgc2V0dGluZ3NKcyA9ICh0aGlzLiRjb250YWluZXIuZGF0YSgnc2V0dGluZ3MtanMnKSB8fCAnJykucmVwbGFjZSgvXFxiRUxFTUVOVF9VSURcXGIvZywgdGhpcy51aWQpXG5cdFx0XHR0aGlzLnNsaWRlb3V0ID0gdGhpcy50YWIuZGVzaWduZXIuY3JlYXRlU2xpZGVvdXQoc2V0dGluZ3NIdG1sLCBzZXR0aW5nc0pzKVxuXG5cdFx0XHR0aGlzLnNsaWRlb3V0LiRjb250YWluZXIub24oJ3N1Ym1pdCcsIChldikgPT4ge1xuXHRcdFx0XHRldi5wcmV2ZW50RGVmYXVsdCgpXG5cdFx0XHRcdHRoaXMuYXBwbHlTZXR0aW5ncygpXG5cdFx0XHR9KVxuXG5cdFx0XHR0aGlzLnRyaWdnZXIoJ2NyZWF0ZVNldHRpbmdzJylcblx0XHR9LFxuXG5cdFx0YXBwbHlTZXR0aW5nczogZnVuY3Rpb24gKCkge1xuXHRcdFx0Ly8gVGhlIGxhYmVsIGlucHV0IGlzIG5hbWVzcGFjZWQsIGUuZy4gYGVsZW1lbnQtPHVpZD5bbGFiZWxdYFxuXHRcdFx0Y29uc3QgbGFiZWwgPSBTdHJpbmcodGhpcy5zbGlkZW91dC4kY29udGFpbmVyLmZpbmQoJ2lucHV0W25hbWUkPVwiW2xhYmVsXVwiXSwgaW5wdXRbbmFtZT1cImxhYmVsXCJdJykudmFsKCkgPz8gJycpLnRyaW0oKVxuXHRcdFx0Ly8gT25seSBmaWVsZHMgd2l0aCBmb3JtYXRzIHRvIGNob29zZSBmcm9tIGhhdmUgYSBmb3JtYXQgc2VsZWN0XG5cdFx0XHRjb25zdCAkZm9ybWF0ID0gdGhpcy5zbGlkZW91dC4kY29udGFpbmVyLmZpbmQoJ3NlbGVjdFtuYW1lJD1cIltmb3JtYXRdXCJdLCBzZWxlY3RbbmFtZT1cImZvcm1hdFwiXScpXG5cblx0XHRcdHRoaXMudXBkYXRlQ29uZmlnKChjb25maWcpID0+IHtcblx0XHRcdFx0Ly8gQSBibGFuayBsYWJlbCBmYWxscyBiYWNrIHRvIHRoZSBmaWVsZCdzIGRlZmF1bHQgbGFiZWxcblx0XHRcdFx0Y29uZmlnLmxhYmVsID0gbGFiZWwgfHwgY29uZmlnLmRlZmF1bHRMYWJlbFxuXHRcdFx0XHRpZiAoJGZvcm1hdC5sZW5ndGgpIHtcblx0XHRcdFx0XHRjb25maWcuZm9ybWF0ID0gU3RyaW5nKCRmb3JtYXQudmFsKCkgPz8gJycpIHx8IG51bGxcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gY29uZmlnXG5cdFx0XHR9KVxuXG5cdFx0XHR0aGlzLiRjb250YWluZXJcblx0XHRcdFx0LmZpbmQoJy5mbGQtZWxlbWVudC1sYWJlbCBoNCcpXG5cdFx0XHRcdC50ZXh0KHRoaXMuY29uZmlnLmxhYmVsKVxuXHRcdFx0XHQuYXR0cigndGl0bGUnLCB0aGlzLmNvbmZpZy5sYWJlbClcblxuXHRcdFx0dGhpcy5zbGlkZW91dC5jbG9zZSgpXG5cdFx0fSxcblxuXHRcdGdldCBpbmRleCgpIHtcblx0XHRcdGNvbnN0IHRhYkNvbmZpZyA9IHRoaXMudGFiLmNvbmZpZ1xuXHRcdFx0aWYgKHR5cGVvZiB0YWJDb25maWcgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdHJldHVybiAtMVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRhYkNvbmZpZy5lbGVtZW50cy5maW5kSW5kZXgoKGMpID0+IGMudWlkID09PSB0aGlzLnVpZClcblx0XHR9LFxuXG5cdFx0Z2V0IGNvbmZpZygpIHtcblx0XHRcdGlmICghdGhpcy51aWQpIHtcblx0XHRcdFx0dGhyb3cgJ1RhYiBpcyBtaXNzaW5nIGl0cyBVSUQnXG5cdFx0XHR9XG5cdFx0XHRsZXQgY29uZmlnID0gdGhpcy50YWIuY29uZmlnLmVsZW1lbnRzLmZpbmQoKGMpID0+IGMudWlkID09PSB0aGlzLnVpZClcblx0XHRcdGlmICghY29uZmlnKSB7XG5cdFx0XHRcdGNvbmZpZyA9IHtcblx0XHRcdFx0XHR1aWQ6IHRoaXMudWlkLFxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuY29uZmlnID0gY29uZmlnXG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY29uZmlnXG5cdFx0fSxcblxuXHRcdHNldCBjb25maWcoY29uZmlnKSB7XG5cdFx0XHRjb25zdCB0YWJDb25maWcgPSB0aGlzLnRhYi5jb25maWdcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5pbmRleFxuXHRcdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHR0YWJDb25maWcuZWxlbWVudHNbaW5kZXhdID0gY29uZmlnXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBuZXdJbmRleCA9ICQuaW5BcnJheSh0aGlzLiRjb250YWluZXJbMF0sIHRoaXMuJGNvbnRhaW5lci5wYXJlbnQoKS5jaGlsZHJlbignLmZsZC1lbGVtZW50JykpXG5cdFx0XHRcdHRhYkNvbmZpZy5lbGVtZW50cy5zcGxpY2UobmV3SW5kZXgsIDAsIGNvbmZpZylcblx0XHRcdH1cblx0XHRcdHRoaXMudGFiLmNvbmZpZyA9IHRhYkNvbmZpZ1xuXHRcdH0sXG5cblx0XHR1cGRhdGVDb25maWc6IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuXHRcdFx0Y29uc3QgY29uZmlnID0gY2FsbGJhY2sodGhpcy5jb25maWcpXG5cdFx0XHRpZiAoY29uZmlnICE9PSBmYWxzZSkge1xuXHRcdFx0XHR0aGlzLmNvbmZpZyA9IGNvbmZpZ1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHR1cGRhdGVQb3NpdGlvbkluQ29uZmlnOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnRhYi51cGRhdGVDb25maWcoKGNvbmZpZykgPT4ge1xuXHRcdFx0XHRjb25zdCBlbGVtZW50Q29uZmlnID0gdGhpcy5jb25maWdcblx0XHRcdFx0Y29uc3Qgb2xkSW5kZXggPSB0aGlzLmluZGV4XG5cdFx0XHRcdGNvbnN0IG5ld0luZGV4ID0gJC5pbkFycmF5KHRoaXMuJGNvbnRhaW5lclswXSwgdGhpcy4kY29udGFpbmVyLnBhcmVudCgpLmNoaWxkcmVuKCcuZmxkLWVsZW1lbnQnKSlcblx0XHRcdFx0aWYgKG9sZEluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdGNvbmZpZy5lbGVtZW50cy5zcGxpY2Uob2xkSW5kZXgsIDEpXG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uZmlnLmVsZW1lbnRzLnNwbGljZShuZXdJbmRleCwgMCwgZWxlbWVudENvbmZpZylcblx0XHRcdFx0cmV0dXJuIGNvbmZpZ1xuXHRcdFx0fSlcblx0XHR9LFxuXG5cdFx0ZGVzdHJveTogZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50YWIudXBkYXRlQ29uZmlnKChjb25maWcpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLmluZGV4XG5cdFx0XHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2Vcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25maWcuZWxlbWVudHMuc3BsaWNlKGluZGV4LCAxKVxuXHRcdFx0XHRyZXR1cm4gY29uZmlnXG5cdFx0XHR9KVxuXG5cdFx0XHR0aGlzLnRhYi5kZXNpZ25lci5lbGVtZW50RHJhZy5yZW1vdmVJdGVtcyh0aGlzLiRjb250YWluZXIpXG5cdFx0XHR0aGlzLiRjb250YWluZXIucmVtb3ZlKClcblxuXHRcdFx0aWYgKHRoaXMuc2xpZGVvdXQpIHtcblx0XHRcdFx0dGhpcy5zbGlkZW91dC5kZXN0cm95KClcblx0XHRcdFx0dGhpcy5zbGlkZW91dCA9IG51bGxcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuaXNGaWVsZCkge1xuXHRcdFx0XHR0aGlzLnRhYi5kZXNpZ25lci5yZW1vdmVGaWVsZEJ5SGFuZGxlKHRoaXMuYXR0cmlidXRlKVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmJhc2UoKVxuXHRcdH0sXG5cdH0sXG5cdHt9LFxuKVxuXG5leHBvcnQgZGVmYXVsdCBEZXNpZ25lckVsZW1lbnQiLCJpbXBvcnQgRGVzaWduZXJFbGVtZW50IGZyb20gJy4vRGVzaWduZXJFbGVtZW50LmpzJ1xuXG5jb25zdCBEZXNpZ25lclRhYiA9IEdhcm5pc2guQmFzZS5leHRlbmQoXG5cdHtcblx0XHRkZXNpZ25lcjogbnVsbCxcblx0XHR1aWQ6IG51bGwsXG5cdFx0JGNvbnRhaW5lcjogbnVsbCxcblx0XHRkZXN0cm95ZWQ6IGZhbHNlLFxuXG5cdFx0aW5pdDogZnVuY3Rpb24gKGRlc2lnbmVyLCAkY29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmRlc2lnbmVyID0gZGVzaWduZXJcblx0XHRcdHRoaXMuJGNvbnRhaW5lciA9ICRjb250YWluZXJcblx0XHRcdHRoaXMuJGNvbnRhaW5lci5kYXRhKCdmbGQtdGFiJywgdGhpcylcblx0XHRcdHRoaXMudWlkID0gdGhpcy4kY29udGFpbmVyLmRhdGEoJ3VpZCcpXG5cblx0XHRcdC8vIE5ldyB0YWI/XG5cdFx0XHRpZiAoIXRoaXMudWlkKSB7XG5cdFx0XHRcdHRoaXMudWlkID0gQ3JhZnQudXVpZCgpXG5cdFx0XHRcdHRoaXMuY29uZmlnID0ge1xuXHRcdFx0XHRcdHVpZDogdGhpcy51aWQsXG5cdFx0XHRcdFx0bmFtZTogdGhpcy4kY29udGFpbmVyLmZpbmQoJy50YWJzIC50YWIgc3BhbicpLnRleHQoKSxcblx0XHRcdFx0XHRlbGVtZW50czogW10sXG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy4kY29udGFpbmVyLmRhdGEoJ3NldHRpbmdzLW5hbWVzcGFjZScsIHRoaXMuZGVzaWduZXIuJGNvbnRhaW5lclxuXHRcdFx0XHRcdC5kYXRhKCduZXctdGFiLXNldHRpbmdzLW5hbWVzcGFjZScpXG5cdFx0XHRcdFx0LnJlcGxhY2UoL1xcYlRBQl9VSURcXGIvZywgdGhpcy51aWQpKVxuXG5cdFx0XHRcdHRoaXMuJGNvbnRhaW5lci5kYXRhKCdzZXR0aW5ncy1odG1sJywgdGhpcy5kZXNpZ25lci4kY29udGFpbmVyXG5cdFx0XHRcdFx0LmRhdGEoJ25ldy10YWItc2V0dGluZ3MtaHRtbCcpXG5cdFx0XHRcdFx0LnJlcGxhY2UoL1xcYlRBQl9VSURcXGIvZywgdGhpcy51aWQpXG5cdFx0XHRcdFx0LnJlcGxhY2UoL1xcYlRBQl9OQU1FXFxiL2csIHRoaXMuY29uZmlnLm5hbWUpKVxuXG5cdFx0XHRcdHRoaXMuJGNvbnRhaW5lci5kYXRhKCdzZXR0aW5ncy1qcycsIHRoaXMuZGVzaWduZXIuJGNvbnRhaW5lclxuXHRcdFx0XHRcdC5kYXRhKCduZXctdGFiLXNldHRpbmdzLWpzJylcblx0XHRcdFx0XHQucmVwbGFjZSgvXFxiVEFCX1VJRFxcYi9nLCB0aGlzLnVpZCkpXG5cdFx0XHR9XG5cblx0XHRcdC8vIGluaXRpYWxpemUgdGhlIGVsZW1lbnRzXG5cdFx0XHRjb25zdCAkZWxlbWVudHMgPSB0aGlzLiRjb250YWluZXIuY2hpbGRyZW4oJy5mbGQtdGFiY29udGVudCcpLmNoaWxkcmVuKClcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAkZWxlbWVudHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0dGhpcy5pbml0RWxlbWVudCgkKCRlbGVtZW50c1tpXSkpXG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdGluaXRFbGVtZW50OiBmdW5jdGlvbiAoJGVsZW1lbnQpIHtcblx0XHRcdHJldHVybiBuZXcgRGVzaWduZXJFbGVtZW50KHRoaXMsICRlbGVtZW50KVxuXHRcdH0sXG5cblx0XHRnZXQgaW5kZXgoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZXNpZ25lci5jb25maWcudGFicy5maW5kSW5kZXgoKGMpID0+IGMudWlkID09PSB0aGlzLnVpZClcblx0XHR9LFxuXG5cdFx0Z2V0IGNvbmZpZygpIHtcblx0XHRcdGlmICghdGhpcy51aWQpIHtcblx0XHRcdFx0dGhyb3cgJ1RhYiBpcyBtaXNzaW5nIGl0cyBVSUQnXG5cdFx0XHR9XG5cdFx0XHRsZXQgY29uZmlnID0gdGhpcy5kZXNpZ25lci5jb25maWcudGFicy5maW5kKChjKSA9PiBjLnVpZCA9PT0gdGhpcy51aWQpXG5cdFx0XHRpZiAoIWNvbmZpZykge1xuXHRcdFx0XHRjb25maWcgPSB7XG5cdFx0XHRcdFx0dWlkOiB0aGlzLnVpZCwgZWxlbWVudHM6IFtdLFxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuY29uZmlnID0gY29uZmlnXG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY29uZmlnXG5cdFx0fSxcblxuXHRcdHNldCBjb25maWcoY29uZmlnKSB7XG5cdFx0XHRpZiAodGhpcy5kZXN0cm95ZWQpIHtcblx0XHRcdFx0cmV0dXJuXG5cdFx0XHR9XG5cblx0XHRcdC8vIElzIHRoZSBuYW1lIGNoYW5naW5nP1xuXHRcdFx0aWYgKGNvbmZpZy5uYW1lICYmIGNvbmZpZy5uYW1lICE9PSB0aGlzLmNvbmZpZy5uYW1lKSB7XG5cdFx0XHRcdHRoaXMuJGNvbnRhaW5lci5maW5kKCcudGFicyAudGFiIHNwYW4nKS50ZXh0KGNvbmZpZy5uYW1lKVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZXNpZ25lckNvbmZpZyA9IHRoaXMuZGVzaWduZXIuY29uZmlnXG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuaW5kZXhcblx0XHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0ZGVzaWduZXJDb25maWcudGFic1tpbmRleF0gPSBjb25maWdcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG5ld0luZGV4ID0gJC5pbkFycmF5KHRoaXMuJGNvbnRhaW5lclswXSwgdGhpcy4kY29udGFpbmVyLnBhcmVudCgpLmNoaWxkcmVuKCcuZmxkLXRhYicpKVxuXHRcdFx0XHRkZXNpZ25lckNvbmZpZy50YWJzLnNwbGljZShuZXdJbmRleCwgMCwgY29uZmlnKVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5kZXNpZ25lci5jb25maWcgPSBkZXNpZ25lckNvbmZpZ1xuXHRcdH0sXG5cblx0XHR1cGRhdGVDb25maWc6IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuXHRcdFx0aWYgKHRoaXMuZGVzdHJveWVkKSB7XG5cdFx0XHRcdHJldHVyblxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb25maWcgPSBjYWxsYmFjayh0aGlzLmNvbmZpZylcblx0XHRcdGlmIChjb25maWcgIT09IGZhbHNlKSB7XG5cdFx0XHRcdHRoaXMuY29uZmlnID0gY29uZmlnXG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdGRlc3Ryb3k6IGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmICh0aGlzLmRlc3Ryb3llZCkge1xuXHRcdFx0XHRyZXR1cm5cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5kZXN0cm95ZWQgPSB0cnVlXG5cblx0XHRcdHRoaXMuZGVzaWduZXIudXBkYXRlQ29uZmlnKChjb25maWcpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLmluZGV4XG5cdFx0XHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2Vcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25maWcudGFicy5zcGxpY2UoaW5kZXgsIDEpXG5cdFx0XHRcdHJldHVybiBjb25maWdcblx0XHRcdH0pXG5cblx0XHRcdC8vIEZpcnN0IGRlc3Ryb3kgdGhlIHRhYidzIGVsZW1lbnRzXG5cdFx0XHRsZXQgJGVsZW1lbnRzID0gdGhpcy4kY29udGFpbmVyLmZpbmQoJy5mbGQtZWxlbWVudCcpXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8ICRlbGVtZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHQkZWxlbWVudHMuZXEoaSkuZGF0YSgnZmxkLWVsZW1lbnQnKS5kZXN0cm95KClcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5kZXNpZ25lci50YWJHcmlkLnJlbW92ZUl0ZW1zKHRoaXMuJGNvbnRhaW5lcilcblx0XHRcdHRoaXMuZGVzaWduZXIudGFiRHJhZy5yZW1vdmVJdGVtcyh0aGlzLiRjb250YWluZXIpXG5cdFx0XHR0aGlzLiRjb250YWluZXIucmVtb3ZlKClcblxuXHRcdFx0dGhpcy5iYXNlKClcblx0XHR9LFxuXHR9LCB7fSlcblxuZXhwb3J0IGRlZmF1bHQgRGVzaWduZXJUYWJcbiIsImNvbnN0IENvbXBsZXhGaWVsZHMgPSBHYXJuaXNoLkJhc2UuZXh0ZW5kKFxuXHR7XG5cdFx0bGlicmFyeTogbnVsbCxcblx0XHRzaWRlYmFyOiBudWxsLFxuXHRcdGRlc2lnbmVyOiBudWxsLFxuXG5cdFx0LyoqXG5cdFx0ICogQ29uc3RydWN0b3Jcblx0XHQgKiBAcGFyYW0ge1NpZGViYXJMaWJyYXJ5fSBsaWJyYXJ5XG5cdFx0ICovXG5cdFx0aW5pdDogZnVuY3Rpb24gKGxpYnJhcnkpIHtcblx0XHRcdHRoaXMubGlicmFyeSA9IGxpYnJhcnlcblx0XHRcdHRoaXMuc2lkZWJhciA9IHRoaXMubGlicmFyeS5zaWRlYmFyXG5cdFx0XHR0aGlzLmRlc2lnbmVyID0gdGhpcy5zaWRlYmFyLmRlc2lnbmVyXG5cblx0XHRcdC8vIFJlbGF0aW9uIGZpZWxkcyBhbmQgYmxvY2sgZmllbGRzIChNYXRyaXgsIE5lbykgYm90aCBleHBhbmQgaW50byBhIG5lc3RlZCBzaWRlYmFyXG5cdFx0XHR0aGlzLmFkZExpc3RlbmVyKHRoaXMubGlicmFyeS4kY29udGFpbmVyLmZpbmQoJy5mbGQtZWxlbWVudC5jb21wbGV4LWZpZWxkJyksICdjbGljaycsIChldikgPT4ge1xuXHRcdFx0XHRpZiAoJChldi50YXJnZXQpLmNsb3Nlc3QoJy5pY29uLWhvbGRlcicpLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cblx0XHRcdFx0dGhpcy5leHBhbmQoJChldi5jdXJyZW50VGFyZ2V0KSlcblx0XHRcdH0pXG5cdFx0fSxcblxuXHRcdC8qKlxuXHRcdCAqIE9wZW5zIGEgbmVzdGVkIHNpZGViYXIgd2l0aCB0aGUgZmllbGRzIGFuIGl0ZW0gZXhwYW5kcyBpbnRvLlxuXHRcdCAqIEBwYXJhbSB7SlF1ZXJ5fSAkaXRlbVxuXHRcdCAqL1xuXHRcdGV4cGFuZDogZnVuY3Rpb24gKCRpdGVtKSB7XG5cdFx0XHR0aGlzLmxpYnJhcnkuJHNlYXJjaC5ibHVyKClcblxuXHRcdFx0Ly8gQ2xvc2Ugc2lkZWJhcnMgb3BlbmVkIGZyb20gdGhpcyBvbmUgKG9yIGRlZXBlciksIHNvIHRoZSBuZXcgc2lkZWJhciByZXBsYWNlcyB0aGVtXG5cdFx0XHR0aGlzLmRlc2lnbmVyLnJlbW92ZVNpZGViYXJzQWZ0ZXIodGhpcy5zaWRlYmFyKVxuXG5cdFx0XHRDcmFmdC5zZW5kQWN0aW9uUmVxdWVzdCgnUE9TVCcsICdkeW5leC9leHBvcnRlcnMvY29tcGxleC1maWVsZCcsIHtcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdGN1cnJlbnROZXN0aW5nOiB0aGlzLmRlc2lnbmVyLiRjb250YWluZXIuZGF0YSgnbmVzdGluZ0xldmVscycpLFxuXHRcdFx0XHRcdGNvbmZpZzogSlNPTi5zdHJpbmdpZnkoJGl0ZW0uZGF0YSgnY29uZmlnJykpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSlcblx0XHRcdFx0LnRoZW4oKHsgZGF0YSB9KSA9PiB0aGlzLmFkZE5lc3RlZFNpZGViYXIoZGF0YS5zaWRlYmFySHRtbCkpXG5cdFx0XHRcdC5jYXRjaCgoeyByZXNwb25zZSB9KSA9PiBDcmFmdC5jcC5kaXNwbGF5RXJyb3IocmVzcG9uc2U/LmRhdGE/Lm1lc3NhZ2UpKVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBAcGFyYW0ge3N0cmluZ30gc2lkZWJhckh0bWxcblx0XHQgKi9cblx0XHRhZGROZXN0ZWRTaWRlYmFyOiBmdW5jdGlvbiAoc2lkZWJhckh0bWwpIHtcblx0XHRcdGNvbnN0ICRzaWRlYmFyID0gJChzaWRlYmFySHRtbClcblxuXHRcdFx0Y29uc3QgbGV2ZWxzID0gdGhpcy5kZXNpZ25lci4kY29udGFpbmVyLmRhdGEoJ25lc3RpbmdMZXZlbHMnKSArIDFcblx0XHRcdHRoaXMuZGVzaWduZXIuJGNvbnRhaW5lci5jc3MoJy0tbmVzdGluZy1sZXZlbHMnLCBsZXZlbHMpXG5cdFx0XHR0aGlzLmRlc2lnbmVyLiRjb250YWluZXIuZGF0YSgnbmVzdGluZ0xldmVscycsIGxldmVscylcblxuXHRcdFx0dGhpcy5zaWRlYmFyLiRjb250YWluZXIuYWZ0ZXIoJHNpZGViYXIpXG5cdFx0XHR0aGlzLmRlc2lnbmVyLmFkZFNpZGViYXIoJHNpZGViYXIpXG5cdFx0XHR0aGlzLnNpZGViYXIuJGNvbnRhaW5lci5zY3JvbGxUb3AoMClcblxuXHRcdFx0dGhpcy5kZXNpZ25lci5lbGVtZW50RHJhZy5hZGRJdGVtcygkc2lkZWJhci5maW5kKCcuZmxkLWVsZW1lbnQ6bm90KC5ibG9jay1maWVsZCknKSlcblx0XHR9LFxuXHR9LFxuKVxuXG5leHBvcnQgZGVmYXVsdCBDb21wbGV4RmllbGRzIiwiY29uc3QgQ3VzdG9tRmllbGRzID0gR2FybmlzaC5CYXNlLmV4dGVuZChcblx0e1xuXHRcdGxpYnJhcnk6IG51bGwsXG5cdFx0c2lkZWJhcjogbnVsbCxcblx0XHRkZXNpZ25lcjogbnVsbCxcblxuXHRcdC8qKlxuXHRcdCAqIENvbnN0cnVjdG9yXG5cdFx0ICogQHBhcmFtIHtTaWRlYmFyTGlicmFyeX0gbGlicmFyeVxuXHRcdCAqL1xuXHRcdGluaXQ6IGZ1bmN0aW9uIChsaWJyYXJ5KSB7XG5cdFx0XHR0aGlzLmxpYnJhcnkgPSBsaWJyYXJ5XG5cdFx0XHR0aGlzLnNpZGViYXIgPSB0aGlzLmxpYnJhcnkuc2lkZWJhclxuXHRcdFx0dGhpcy5kZXNpZ25lciA9IHRoaXMuc2lkZWJhci5kZXNpZ25lclxuXG5cdFx0XHR0aGlzLmFkZExpc3RlbmVyKHRoaXMubGlicmFyeS4kZmllbGRzLmZpbHRlcignLnVudXNlZCcpLCAnY2xpY2snLCAoZSkgPT4gdGhpcy5hZGRFbGVtZW50KGUpKVxuXHRcdFx0dGhpcy5oaWRlVXNlZExpYnJhcnlFbGVtZW50cygpXG5cdFx0fSxcblxuXHRcdGhpZGVVc2VkTGlicmFyeUVsZW1lbnRzOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCAkbGlicmFyeUVsZW1lbnRzID0gdGhpcy5saWJyYXJ5LiRmaWVsZHMuZmlsdGVyKCcudW51c2VkJylcblxuXHRcdFx0dGhpcy5kZXNpZ25lci4kdGFiQ29udGFpbmVyLmZpbmQoJy5mbGQtZWxlbWVudC5mbGQtZmllbGQnKS5lYWNoKChpLCBlbCkgPT4ge1xuXHRcdFx0XHR0aGlzLmRlc2lnbmVyLmhpZGVMaWJyYXJ5RWxlbWVudChcblx0XHRcdFx0XHQkbGlicmFyeUVsZW1lbnRzLmZpbHRlcigoaSwgaXRlbSkgPT4gaXRlbS5kYXRhc2V0LmhhbmRsZSA9PT0gZWwuZGF0YXNldC5oYW5kbGUpLFxuXHRcdFx0XHQpXG5cdFx0XHR9KVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBBZGRzIGEgbmV3IGVsZW1lbnQgZnJvbSB0aGUgc2lkZWJhciB0byB0aGUgY3VycmVudGx5IGFjdGl2ZSB3b3Jrc3BhY2UgdGFiIHdoZW4gdGhlXG5cdFx0ICogXCJhZGQtZWxlbWVudFwiIGJ1dHRvbiBpcyBjbGlja2VkLiBDbG9uZXMgdGhlIGVsZW1lbnQsIGFwcGVuZHMgaXQgdG8gdGhlIHRhYiBjb250ZW50LFxuXHRcdCAqIGluaXRpYWxpemVzIGl0cyBsYXlvdXQgYmVoYXZpb3IsIGFuZCB1cGRhdGVzIHRoZSBVSSBhY2NvcmRpbmdseS5cblx0XHQgKlxuXHRcdCAqIEBmdW5jdGlvblxuXHRcdCAqIEBwYXJhbSB7TW91c2VFdmVudH0gZXZlbnQgLSBUaGUgbW91c2UgZXZlbnQgdHJpZ2dlcmVkIGJ5IGNsaWNraW5nIGEgc2lkZWJhciBlbGVtZW50LlxuXHRcdCAqXG5cdFx0ICogQHJldHVybnMge2ZhbHNlfHZvaWR9IFJldHVybnMgZmFsc2UgdG8gcHJldmVudCBkZWZhdWx0IGNsaWNrIGJlaGF2aW9yIGlmIHN1Y2Nlc3NmdWwsIG90aGVyd2lzZSB2b2lkLlxuXHRcdCAqL1xuXHRcdGFkZEVsZW1lbnQ6IGZ1bmN0aW9uIChldmVudCkge1xuXHRcdFx0aWYgKCQoZXZlbnQudGFyZ2V0KS5jbG9zZXN0KCcuYWRkLWVsZW1lbnQnKS5sZW5ndGggPT09IDApIHJldHVyblxuXG5cdFx0XHRjb25zdCAkaXRlbSA9ICQoZXZlbnQuY3VycmVudFRhcmdldClcblx0XHRcdGlmICgkaXRlbS5oYXNDbGFzcygnaGlkZGVuJykgfHwgJGl0ZW0uaGFzQ2xhc3MoJ2Jsb2NrLWZpZWxkJykpIHJldHVyblxuXG5cdFx0XHRjb25zdCAkYWN0aXZlUGFuZSA9IHRoaXMuZGVzaWduZXIuJHRhYkNvbnRhaW5lci5maW5kKCcuZmxkLXRhYjp2aXNpYmxlJykuZmlyc3QoKVxuXG5cdFx0XHRpZiAoISRhY3RpdmVQYW5lLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oJ05vIHZpc2libGUgdGFiIHBhbmUgZm91bmQgdG8gZHJvcCB0aGUgaXRlbSBpbnRvLicpXG5cdFx0XHRcdHJldHVyblxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjdXJyZW50VGFiID0gJGFjdGl2ZVBhbmUuZGF0YSgnZmxkLXRhYicpXG5cdFx0XHRpZiAoIWN1cnJlbnRUYWIpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKCdDb3VsZCBub3QgZ2V0IHRhYiBpbnN0YW5jZSBmb3IgdmlzaWJsZSBwYW5lLicpXG5cdFx0XHRcdHJldHVyblxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCAkY2xvbmVkSXRlbSA9ICRpdGVtLmNsb25lKCkucmVtb3ZlQ2xhc3MoJ3VudXNlZCBoaWRkZW4gZmlsdGVyZWQnKVxuXHRcdFx0JGNsb25lZEl0ZW0uYXBwZW5kVG8oJGFjdGl2ZVBhbmUuZmluZCgnLmZsZC10YWJjb250ZW50JykpXG5cdFx0XHR0aGlzLmVuc3VyZVZpc2libGUoJGNsb25lZEl0ZW0pXG5cblx0XHRcdHRoaXMuZGVzaWduZXIuaGlkZUxpYnJhcnlFbGVtZW50KCRpdGVtKVxuXG5cdFx0XHRjb25zdCBjbG9uZWRJdGVtID0gY3VycmVudFRhYi5pbml0RWxlbWVudCgkY2xvbmVkSXRlbSlcblx0XHRcdHRoaXMuZGVzaWduZXIuZWxlbWVudERyYWcuYWRkSXRlbXMoJGNsb25lZEl0ZW0pXG5cdFx0XHRjbG9uZWRJdGVtLnVwZGF0ZVBvc2l0aW9uSW5Db25maWcoKVxuXHRcdFx0dGhpcy5kZXNpZ25lci50YWJHcmlkLnJlZnJlc2hDb2xzKHRydWUpXG5cblx0XHRcdHJldHVybiBmYWxzZVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBVdGlsaXR5IHRvIGVuc3VyZSBhbiBlbGVtZW50IGlzIHZpc2libHkgZGlzcGxheWVkXG5cdFx0ICogQHBhcmFtIHtqUXVlcnl9ICRlbFxuXHRcdCAqL1xuXHRcdGVuc3VyZVZpc2libGU6IGZ1bmN0aW9uICgkZWwpIHtcblx0XHRcdGlmICgkZWwuY3NzKCd2aXNpYmlsaXR5JykgPT09ICdoaWRkZW4nKSB7XG5cdFx0XHRcdCRlbC5jc3MoJ3Zpc2liaWxpdHknLCAndmlzaWJsZScpXG5cdFx0XHR9XG5cdFx0fSxcblx0fSxcbilcblxuZXhwb3J0IGRlZmF1bHQgQ3VzdG9tRmllbGRzIiwiaW1wb3J0IENvbXBsZXhGaWVsZHMgZnJvbSAnLi9Db21wbGV4RmllbGRzLmpzJ1xuaW1wb3J0IEN1c3RvbUZpZWxkcyBmcm9tICcuL0N1c3RvbUZpZWxkcy5qcydcblxuY29uc3QgU2lkZWJhckxpYnJhcnkgPSBHYXJuaXNoLkJhc2UuZXh0ZW5kKFxuXHR7XG5cdFx0JGNvbnRhaW5lcjogbnVsbCxcblx0XHQkc2VhcmNoOiBudWxsLFxuXHRcdCRjbGVhclNlYXJjaEJ0bjogbnVsbCxcblx0XHQkZmllbGRzOiBudWxsLFxuXHRcdC8qKiBAdHlwZSB7RGVzaWduZXJTaWRlYmFyfSAqL1xuXHRcdHNpZGViYXI6IG51bGwsXG5cblx0XHQvKipcblx0XHQgKiBDb25zdHJ1Y3RvclxuXHRcdCAqXG5cdFx0ICogQHRoaXMge3R5cGVvZiBTaWRlYmFyTGlicmFyeX1cblx0XHQgKiBAcGFyYW0ge0pRdWVyeTxIVE1MRWxlbWVudD58SFRNTEVsZW1lbnR8c3RyaW5nfSBjb250YWluZXIgQ1NTIHNlbGVjdG9yLCBIVE1MIEVsZW1lbnQsIG9yIEpRdWVyeSB3cmFwcGVyIG9mIHRoZSBlbGVtZW50XG5cdFx0ICogQHBhcmFtIHtEZXNpZ25lclNpZGViYXJ9IHNpZGViYXJcblx0XHQgKi9cblx0XHRpbml0OiBmdW5jdGlvbiAoY29udGFpbmVyLCBzaWRlYmFyKSB7XG5cdFx0XHR0aGlzLiRjb250YWluZXIgPSAkKGNvbnRhaW5lcilcblx0XHRcdHRoaXMuc2lkZWJhciA9IHNpZGViYXJcblx0XHRcdHRoaXMuJGZpZWxkcyA9IHRoaXMuJGNvbnRhaW5lci5maW5kKCcuZmxkLWVsZW1lbnQnKVxuXHRcdFx0bGV0ICRmaWVsZFNlYXJjaENvbnRhaW5lciA9IHRoaXMuJGNvbnRhaW5lci5jaGlsZHJlbignLnNlYXJjaCcpXG5cdFx0XHRpZiAoJGZpZWxkU2VhcmNoQ29udGFpbmVyLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cblx0XHRcdHRoaXMuJHNlYXJjaCA9ICRmaWVsZFNlYXJjaENvbnRhaW5lci5jaGlsZHJlbignaW5wdXQnKVxuXHRcdFx0dGhpcy4kY2xlYXJTZWFyY2hCdG4gPSAkZmllbGRTZWFyY2hDb250YWluZXIuY2hpbGRyZW4oJy5jbGVhci1idG4nKVxuXHRcdFx0bmV3IENvbXBsZXhGaWVsZHModGhpcylcblx0XHRcdG5ldyBDdXN0b21GaWVsZHModGhpcylcblxuXHRcdFx0dGhpcy5hZGRMaXN0ZW5lcih0aGlzLiRzZWFyY2gsICdpbnB1dCcsICgpID0+IHtcblx0XHRcdFx0bGV0IHZhbCA9IHRoaXMuJHNlYXJjaC52YWwoKS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1snXCJdL2csICcnKVxuXHRcdFx0XHRpZiAoIXZhbCkge1xuXHRcdFx0XHRcdHRoaXMuJGNvbnRhaW5lci5maW5kKCcuZmlsdGVyZWQnKS5yZW1vdmVDbGFzcygnZmlsdGVyZWQnKVxuXHRcdFx0XHRcdHRoaXMuJGNsZWFyU2VhcmNoQnRuLmFkZENsYXNzKCdoaWRkZW4nKVxuXHRcdFx0XHRcdHJldHVyblxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy4kY2xlYXJTZWFyY2hCdG4ucmVtb3ZlQ2xhc3MoJ2hpZGRlbicpXG5cdFx0XHRcdGxldCAkbWF0Y2hlcyA9IHRoaXMuJGZpZWxkc1xuXHRcdFx0XHRcdC5maWx0ZXIoYFtkYXRhLWtleXdvcmRzKj1cIiR7dmFsfVwiXWApXG5cdFx0XHRcdFx0LmFkZCh0aGlzLiRjb250YWluZXIuY2hpbGRyZW4oJy5mbGQtZWxlbWVudCcpKVxuXHRcdFx0XHRcdC5yZW1vdmVDbGFzcygnZmlsdGVyZWQnKVxuXHRcdFx0XHR0aGlzLiRmaWVsZHMubm90KCRtYXRjaGVzKS5hZGRDbGFzcygnZmlsdGVyZWQnKVxuXHRcdFx0fSlcblxuXHRcdFx0dGhpcy5hZGRMaXN0ZW5lcih0aGlzLiRzZWFyY2gsICdrZXlkb3duJywgKGV2KSA9PiB7XG5cdFx0XHRcdHN3aXRjaCAoZXYua2V5Q29kZSkge1xuXHRcdFx0XHRcdGNhc2UgR2FybmlzaC5FU0NfS0VZOlxuXHRcdFx0XHRcdFx0dGhpcy4kc2VhcmNoLnZhbCgnJykudHJpZ2dlcignaW5wdXQnKVxuXHRcdFx0XHRcdFx0YnJlYWtcblx0XHRcdFx0XHRjYXNlIEdhcm5pc2guUkVUVVJOX0tFWTpcblx0XHRcdFx0XHRcdGV2LnByZXZlbnREZWZhdWx0KClcblx0XHRcdFx0XHRcdGJyZWFrXG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cblx0XHRcdHRoaXMuYWRkTGlzdGVuZXIodGhpcy4kY2xlYXJTZWFyY2hCdG4sICdjbGljaycsICgpID0+IHtcblx0XHRcdFx0dGhpcy4kc2VhcmNoLnZhbCgnJykudHJpZ2dlcignaW5wdXQnKVxuXHRcdFx0fSlcblx0XHR9LFxuXHR9KVxuXG5leHBvcnQgZGVmYXVsdCBTaWRlYmFyTGlicmFyeSIsImltcG9ydCBTaWRlYmFyTGlicmFyeSBmcm9tICcuL1NpZGViYXJMaWJyYXJ5LmpzJ1xuXG5jb25zdCBEZXNpZ25lclNpZGViYXIgPSBHYXJuaXNoLkJhc2UuZXh0ZW5kKHtcblx0LyoqIEB0eXBlIHtKUXVlcnl9ICovXG5cdCRjb250YWluZXI6IC8qKiBAdHlwZSB7YW55fSAqLyAobnVsbCksXG5cdCRsaWJyYXJ5VG9nZ2xlOiBudWxsLFxuXHQvKiogQHR5cGUge1NpZGViYXJMaWJyYXJ5P30gKi9cblx0c2VsZWN0ZWRMaWJyYXJ5OiBudWxsLFxuXHQvKiogQHR5cGUge1NpZGViYXJMaWJyYXJ5W119ICovXG5cdGxpYnJhcmllczogbnVsbCxcblx0JGxpYnJhcnlDb250YWluZXJzOiBbXSxcblx0ZGVzaWduZXI6IG51bGwsXG5cdF9wYXJlbnRDb25maWc6IG51bGwsXG5cdF9jb25maWc6IG51bGwsXG5cblx0LyoqXG5cdCAqIEBwYXJhbSB7dHlwZW9mIERlc2lnbmVyfSBkZXNpZ25lclxuXHQgKiBAcGFyYW0ge0pRdWVyeTxIVE1MRWxlbWVudD58SFRNTEVsZW1lbnR8c3RyaW5nfSBjb250YWluZXIgQ1NTIHNlbGVjdG9yLCBIVE1MIEVsZW1lbnQsIG9yIEpRdWVyeSB3cmFwcGVyIG9mIHRoZSBlbGVtZW50XG5cdCAqL1xuXHRpbml0OiBmdW5jdGlvbiAoZGVzaWduZXIsIGNvbnRhaW5lcikge1xuXHRcdHRoaXMuJGNvbnRhaW5lciA9ICQoY29udGFpbmVyKVxuXHRcdHRoaXMuZGVzaWduZXIgPSBkZXNpZ25lclxuXHRcdHRoaXMubGlicmFyaWVzID0gW11cblx0XHR0aGlzLiRsaWJyYXJ5Q29udGFpbmVycyA9ICQubWFrZUFycmF5KHRoaXMuJGNvbnRhaW5lci5jaGlsZHJlbignLmZsZC1saWJyYXJ5JykpXG5cdFx0Zm9yIChsZXQgW2luZGV4LCAkbGlicmFyeUNvbnRhaW5lcl0gb2YgdGhpcy4kbGlicmFyeUNvbnRhaW5lcnMuZW50cmllcygpKSB7XG5cdFx0XHRsZXQgbGlicmFyeSA9IG5ldyBTaWRlYmFyTGlicmFyeSgkbGlicmFyeUNvbnRhaW5lciwgdGhpcylcblx0XHRcdGlmIChpbmRleCA9PT0gMCkgdGhpcy5zZWxlY3RlZExpYnJhcnkgPSBsaWJyYXJ5XG5cdFx0XHR0aGlzLmxpYnJhcmllcy5wdXNoKGxpYnJhcnkpXG5cdFx0fVxuXG5cdFx0Ly8gTmVzdGVkIHNpZGViYXJzIGhhdmUgYSBjbG9zZSBidXR0b24gKEVzY2FwZSBjbG9zZXMgdGhlIGxhc3Qgb25lIHRvbylcblx0XHR0aGlzLmFkZExpc3RlbmVyKHRoaXMuJGNvbnRhaW5lci5jaGlsZHJlbignLnNpZGViYXItbmFtZS13cmFwcGVyJykuZmluZCgnLnNpZGViYXItY2xvc2UnKSwgJ2FjdGl2YXRlJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5kZXNpZ25lci5jbG9zZVNpZGViYXIodGhpcylcblx0XHR9KVxuXG5cdFx0bGV0ICRsaWJyYXJ5UGlja2VyID0gdGhpcy4kY29udGFpbmVyLmNoaWxkcmVuKCcuYnRuZ3JvdXAnKVxuXHRcdG5ldyBDcmFmdC5MaXN0Ym94KCRsaWJyYXJ5UGlja2VyLCB7XG5cdFx0XHRvbkNoYW5nZTogKCRzZWxlY3RlZE9wdGlvbikgPT4ge1xuXHRcdFx0XHR0aGlzLnNlbGVjdGVkTGlicmFyeS4kY29udGFpbmVyLmFkZENsYXNzKCdoaWRkZW4nKVxuXHRcdFx0XHR0aGlzLnNlbGVjdGVkTGlicmFyeSA9IHRoaXMuZ2V0TGlicmFyeSgkc2VsZWN0ZWRPcHRpb24uZGF0YSgnbGlicmFyeScpKVxuXHRcdFx0XHR0aGlzLnNlbGVjdGVkTGlicmFyeS4kY29udGFpbmVyXG5cdFx0XHRcdFx0LnJlbW92ZUNsYXNzKCdoaWRkZW4nKVxuXHRcdFx0fSxcblx0XHR9KVxuXHR9LFxuXG5cdGdldFBhcmVudENvbmZpZzogZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0aGlzLiRjb250YWluZXIuZGF0YSgncGFyZW50Q29uZmlnJylcblx0fSxcblxuXHQvKipcblx0ICogQHBhcmFtIHtzdHJpbmd9IGhhbmRsZVxuXHQgKiBAcmV0dXJuIHtTaWRlYmFyTGlicmFyeX1cblx0ICovXG5cdGdldExpYnJhcnk6IGZ1bmN0aW9uIChoYW5kbGUpIHtcblx0XHRyZXR1cm4gdGhpcy5saWJyYXJpZXMuZmluZChsaWJyYXJ5ID0+IGhhbmRsZSA9PT0gbGlicmFyeS4kY29udGFpbmVyLmRhdGEoJ2xpYnJhcnknKSlcblx0fVxufSwge30pXG5cbmV4cG9ydCBkZWZhdWx0IERlc2lnbmVyU2lkZWJhciIsImNvbnN0IEVsZW1lbnREcmFnID0gR2FybmlzaC5EcmFnLmV4dGVuZCh7XG5cdGRyYWdnaW5nTGlicmFyeUVsZW1lbnQ6IGZhbHNlLFxuXHRkcmFnZ2luZ0ZpZWxkOiBmYWxzZSxcblx0b3JpZ2luYWxUYWI6IG51bGwsXG5cdGRlc2lnbmVyOiBudWxsLFxuXHQkaW5zZXJ0aW9uOiBudWxsLFxuXHRzaG93aW5nSW5zZXJ0aW9uOiBmYWxzZSxcblx0JGNhYm9vc2U6IG51bGwsXG5cblx0aW5pdDogZnVuY3Rpb24gKGRlc2lnbmVyLCBzZXR0aW5ncykge1xuXHRcdHRoaXMuZGVzaWduZXIgPSBkZXNpZ25lclxuXHRcdHRoaXMuYmFzZSh0aGlzLmZpbmRJdGVtcygpLCBzZXR0aW5ncylcblx0fSxcblxuXHRyZW1vdmVDYWJvb3NlOiBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy4kaXRlbXMgPSB0aGlzLiRpdGVtcy5ub3QodGhpcy4kY2Fib29zZSlcblx0XHR0aGlzLiRjYWJvb3NlLnJlbW92ZSgpXG5cdH0sXG5cblx0c3dhcERyYWdnZWVXaXRoSW5zZXJ0aW9uOiBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy4kaW5zZXJ0aW9uLmluc2VydEJlZm9yZSh0aGlzLiRkcmFnZ2VlKVxuXHRcdHRoaXMuJGRyYWdnZWUuZGV0YWNoKClcblx0XHR0aGlzLiRpdGVtcyA9ICQoKS5hZGQodGhpcy4kaXRlbXMubm90KHRoaXMuJGRyYWdnZWUpLmFkZCh0aGlzLiRpbnNlcnRpb24pKVxuXHRcdHRoaXMuc2hvd2luZ0luc2VydGlvbiA9IHRydWVcblx0fSxcblxuXHRzd2FwSW5zZXJ0aW9uV2l0aERyYWdnZWU6IGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLiRpbnNlcnRpb24ucmVwbGFjZVdpdGgodGhpcy4kZHJhZ2dlZSlcblx0XHR0aGlzLiRpdGVtcyA9ICQoKS5hZGQodGhpcy4kaXRlbXMubm90KHRoaXMuJGluc2VydGlvbikuYWRkKHRoaXMuJGRyYWdnZWUpKVxuXHRcdHRoaXMuc2hvd2luZ0luc2VydGlvbiA9IGZhbHNlXG5cdH0sXG5cblx0c2V0TWlkcG9pbnRzOiBmdW5jdGlvbiAoKSB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLiRpdGVtcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0bGV0ICRpdGVtID0gJCh0aGlzLiRpdGVtc1tpXSlcblx0XHRcdGxldCBvZmZzZXQgPSAkaXRlbS5vZmZzZXQoKVxuXG5cdFx0XHQvLyBTa2lwIGxpYnJhcnkgZWxlbWVudHNcblx0XHRcdGlmICgkaXRlbS5oYXNDbGFzcygndW51c2VkJykpIHtcblx0XHRcdFx0Y29udGludWVcblx0XHRcdH1cblxuXHRcdFx0JGl0ZW0uZGF0YSgnbWlkcG9pbnQnLCB7XG5cdFx0XHRcdGxlZnQ6IG9mZnNldC5sZWZ0ICsgJGl0ZW0ub3V0ZXJXaWR0aCgpIC8gMiwgdG9wOiBvZmZzZXQudG9wICsgJGl0ZW0ub3V0ZXJIZWlnaHQoKSAvIDIsXG5cdFx0XHR9KVxuXHRcdH1cblx0fSxcblxuXHRnZXRDbG9zZXN0SXRlbTogZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMuZ2V0Q2xvc2VzdEl0ZW0uX2Nsb3Nlc3RJdGVtID0gbnVsbFxuXHRcdHRoaXMuZ2V0Q2xvc2VzdEl0ZW0uX2Nsb3Nlc3RJdGVtTW91c2VEaWZmID0gbnVsbFxuXG5cdFx0Zm9yICh0aGlzLmdldENsb3Nlc3RJdGVtLl9pID0gMDsgdGhpcy5nZXRDbG9zZXN0SXRlbS5faSA8IHRoaXMuJGl0ZW1zLmxlbmd0aDsgdGhpcy5nZXRDbG9zZXN0SXRlbS5faSsrKSB7XG5cdFx0XHR0aGlzLmdldENsb3Nlc3RJdGVtLl8kaXRlbSA9ICQodGhpcy4kaXRlbXNbdGhpcy5nZXRDbG9zZXN0SXRlbS5faV0pXG5cblx0XHRcdHRoaXMuZ2V0Q2xvc2VzdEl0ZW0uX21pZHBvaW50ID0gdGhpcy5nZXRDbG9zZXN0SXRlbS5fJGl0ZW0uZGF0YSgnbWlkcG9pbnQnKVxuXHRcdFx0aWYgKCF0aGlzLmdldENsb3Nlc3RJdGVtLl9taWRwb2ludCkge1xuXHRcdFx0XHRjb250aW51ZVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmdldENsb3Nlc3RJdGVtLl9tb3VzZURpZmYgPSBHYXJuaXNoLmdldERpc3QodGhpcy5nZXRDbG9zZXN0SXRlbS5fbWlkcG9pbnQubGVmdCwgdGhpcy5nZXRDbG9zZXN0SXRlbS5fbWlkcG9pbnQudG9wLCB0aGlzLm1vdXNlWCwgdGhpcy5tb3VzZVkpXG5cblx0XHRcdGlmICh0aGlzLmdldENsb3Nlc3RJdGVtLl9jbG9zZXN0SXRlbSA9PT0gbnVsbCB8fCB0aGlzLmdldENsb3Nlc3RJdGVtLl9tb3VzZURpZmYgPCB0aGlzLmdldENsb3Nlc3RJdGVtLl9jbG9zZXN0SXRlbU1vdXNlRGlmZikge1xuXHRcdFx0XHR0aGlzLmdldENsb3Nlc3RJdGVtLl9jbG9zZXN0SXRlbSA9IHRoaXMuZ2V0Q2xvc2VzdEl0ZW0uXyRpdGVtWzBdXG5cdFx0XHRcdHRoaXMuZ2V0Q2xvc2VzdEl0ZW0uX2Nsb3Nlc3RJdGVtTW91c2VEaWZmID0gdGhpcy5nZXRDbG9zZXN0SXRlbS5fbW91c2VEaWZmXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZ2V0Q2xvc2VzdEl0ZW0uX2Nsb3Nlc3RJdGVtXG5cdH0sXG5cblx0Y2hlY2tGb3JOZXdDbG9zZXN0SXRlbTogZnVuY3Rpb24gKCkge1xuXHRcdC8vIElzIHRoZXJlIGEgbmV3IGNsb3Nlc3QgaXRlbT9cblx0XHR0aGlzLmNoZWNrRm9yTmV3Q2xvc2VzdEl0ZW0uX2Nsb3Nlc3RJdGVtID0gdGhpcy5nZXRDbG9zZXN0SXRlbSgpXG5cblx0XHRpZiAodGhpcy5jaGVja0Zvck5ld0Nsb3Nlc3RJdGVtLl9jbG9zZXN0SXRlbSA9PT0gdGhpcy4kaW5zZXJ0aW9uWzBdKSB7XG5cdFx0XHRyZXR1cm5cblx0XHR9XG5cblx0XHRpZiAodGhpcy5zaG93aW5nSW5zZXJ0aW9uICYmICQuaW5BcnJheSh0aGlzLiRpbnNlcnRpb25bMF0sIHRoaXMuJGl0ZW1zKSA8ICQuaW5BcnJheSh0aGlzLmNoZWNrRm9yTmV3Q2xvc2VzdEl0ZW0uX2Nsb3Nlc3RJdGVtLCB0aGlzLiRpdGVtcykgJiYgJC5pbkFycmF5KHRoaXMuY2hlY2tGb3JOZXdDbG9zZXN0SXRlbS5fY2xvc2VzdEl0ZW0sIHRoaXMuJGNhYm9vc2UpID09PSAtMSkge1xuXHRcdFx0dGhpcy4kaW5zZXJ0aW9uLmluc2VydEFmdGVyKHRoaXMuY2hlY2tGb3JOZXdDbG9zZXN0SXRlbS5fY2xvc2VzdEl0ZW0pXG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuJGluc2VydGlvbi5pbnNlcnRCZWZvcmUodGhpcy5jaGVja0Zvck5ld0Nsb3Nlc3RJdGVtLl9jbG9zZXN0SXRlbSlcblx0XHR9XG5cblx0XHR0aGlzLiRpdGVtcyA9ICQoKS5hZGQodGhpcy4kaXRlbXMuYWRkKHRoaXMuJGluc2VydGlvbikpXG5cdFx0dGhpcy5zaG93aW5nSW5zZXJ0aW9uID0gdHJ1ZVxuXHRcdHRoaXMuZGVzaWduZXIudGFiR3JpZC5yZWZyZXNoQ29scyh0cnVlKVxuXHRcdHRoaXMuc2V0TWlkcG9pbnRzKClcblx0fSxcblxuXHRmaW5kSXRlbXM6IGZ1bmN0aW9uICgpIHtcblx0XHQvLyBSZXR1cm4gYWxsIG9mIHRoZSB1c2VkICsgdW51c2VkIGZpZWxkc1xuXHRcdHJldHVybiB0aGlzLmRlc2lnbmVyLiR0YWJDb250YWluZXJcblx0XHRcdC5maW5kKCcuZmxkLWVsZW1lbnQnKVxuXHRcdFx0LmFkZCh0aGlzLmRlc2lnbmVyLnNlbGVjdGVkU2lkZWJhci4kY29udGFpbmVyLmZpbmQoJy5mbGQtZWxlbWVudDpub3QoLmJsb2NrLWZpZWxkKScpKVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBAcGFyYW0ge0pRdWVyeTxIVE1MRWxlbWVudD5bXX0gaXRlbXMgRWxlbWVudHMgdGhhdCBzaG91bGQgYmUgZHJhZ2dhYmxlLlxuXHQgKi9cblx0YWRkSXRlbXM6IGZ1bmN0aW9uIChpdGVtcykge1xuXHRcdGl0ZW1zID0gJC5tYWtlQXJyYXkoaXRlbXMpXG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdGlmICgkLmRhdGEoaXRlbSwgJ2RyYWcnKSkge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oJ0VsZW1lbnQgd2FzIGFkZGVkIHRvIG1vcmUgdGhhbiBvbmUgZHJhZ2dlcicpXG5cdFx0XHRcdCQuZGF0YShpdGVtLCAnZHJhZycpLnJlbW92ZUl0ZW1zKGl0ZW0pXG5cdFx0XHR9XG5cblx0XHRcdCQuZGF0YShpdGVtLCAnZHJhZycsIHRoaXMpXG5cblx0XHRcdC8vIFN0b3JlIHRoZSBoYW5kbGVyIHJlZmVyZW5jZSBvbiB0aGUgZWxlbWVudFxuXHRcdFx0Y29uc3QgaGFuZGxlciA9IChldikgPT4ge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVNb3VzZURvd24oZXYsIGl0ZW0pXG5cdFx0XHR9XG5cdFx0XHQkLmRhdGEoaXRlbSwgJ21vdXNlZG93bkhhbmRsZXInLCBoYW5kbGVyKVxuXG5cdFx0XHR0aGlzLmFkZExpc3RlbmVyKHRoaXMuX2dldEl0ZW1IYW5kbGUoaXRlbSksICdtb3VzZWRvd24nLCBoYW5kbGVyKVxuXHRcdH1cblxuXHRcdHRoaXMuJGl0ZW1zID0gdGhpcy4kaXRlbXMuYWRkKGl0ZW1zKVxuXHR9LFxuXG5cdG9uRHJhZ1N0YXJ0OiBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy5iYXNlKClcblxuXHRcdHRoaXMuJGluc2VydGlvbiA9IHRoaXMuY3JlYXRlSW5zZXJ0aW9uKClcblxuXHRcdHRoaXMuJGNhYm9vc2UgPSB0aGlzLmNyZWF0ZUNhYm9vc2UoKVxuXHRcdHRoaXMuJGl0ZW1zID0gJCgpLmFkZCh0aGlzLiRpdGVtcy5hZGQodGhpcy4kY2Fib29zZSkpXG5cblx0XHRHYXJuaXNoLiRib2QuYWRkQ2xhc3MoJ2RyYWdnaW5nJylcblxuXHRcdHRoaXMuZHJhZ2dpbmdMaWJyYXJ5RWxlbWVudCA9IHRoaXMuJGRyYWdnZWUuaGFzQ2xhc3MoJ3VudXNlZCcpXG5cdFx0dGhpcy5kcmFnZ2luZ0ZpZWxkID0gdGhpcy4kZHJhZ2dlZS5oYXNDbGFzcygnZmxkLWZpZWxkJylcblxuXHRcdGlmICghdGhpcy5kcmFnZ2luZ0xpYnJhcnlFbGVtZW50KSB7XG5cdFx0XHR0aGlzLm9yaWdpbmFsVGFiID0gdGhpcy4kZHJhZ2dlZS5jbG9zZXN0KCcuZmxkLXRhYicpLmRhdGEoJ2ZsZC10YWInKVxuXHRcdFx0dGhpcy5zd2FwRHJhZ2dlZVdpdGhJbnNlcnRpb24oKVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm9yaWdpbmFsVGFiID0gbnVsbFxuXHRcdH1cblxuXHRcdHRoaXMuc2V0TWlkcG9pbnRzKClcblx0fSxcblxuXHRvbkRyYWc6IGZ1bmN0aW9uICgpIHtcblx0XHRpZiAodGhpcy5pc0hvdmVyaW5nT3ZlclRhYigpKSB7XG5cdFx0XHR0aGlzLmNoZWNrRm9yTmV3Q2xvc2VzdEl0ZW0oKVxuXHRcdH0gZWxzZSBpZiAodGhpcy5zaG93aW5nSW5zZXJ0aW9uKSB7XG5cdFx0XHR0aGlzLiRpbnNlcnRpb24ucmVtb3ZlKClcblx0XHRcdHRoaXMuJGl0ZW1zID0gJCgpLmFkZCh0aGlzLiRpdGVtcy5ub3QodGhpcy4kaW5zZXJ0aW9uKSlcblx0XHRcdHRoaXMuc2hvd2luZ0luc2VydGlvbiA9IGZhbHNlXG5cdFx0XHR0aGlzLmRlc2lnbmVyLnRhYkdyaWQucmVmcmVzaENvbHModHJ1ZSlcblx0XHRcdHRoaXMuc2V0TWlkcG9pbnRzKClcblx0XHR9XG5cblx0XHR0aGlzLmJhc2UoKVxuXHR9LFxuXG5cdGlzSG92ZXJpbmdPdmVyVGFiOiBmdW5jdGlvbiAoKSB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmRlc2lnbmVyLnRhYkdyaWQuJGl0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoR2FybmlzaC5oaXRUZXN0KHRoaXMubW91c2VYLCB0aGlzLm1vdXNlWSwgdGhpcy5kZXNpZ25lci50YWJHcmlkLiRpdGVtcy5lcShpKSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWVcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2Vcblx0fSxcblxuXHRjcmVhdGVDYWJvb3NlOiBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0ICRjYWJvb3NlID0gJCgpXG5cdFx0bGV0ICRmaWVsZENvbnRhaW5lcnMgPSB0aGlzLmRlc2lnbmVyLiR0YWJDb250YWluZXIuZmluZCgnPiAuZmxkLXRhYiA+IC5mbGQtdGFiY29udGVudCcpXG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8ICRmaWVsZENvbnRhaW5lcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdCRjYWJvb3NlID0gJGNhYm9vc2UuYWRkKCQoJzxkaXYvPicpLmFwcGVuZFRvKCRmaWVsZENvbnRhaW5lcnNbaV0pKVxuXHRcdH1cblxuXHRcdHJldHVybiAkY2Fib29zZVxuXHR9LFxuXG5cdGNyZWF0ZUluc2VydGlvbjogZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiAkKGA8ZGl2IGNsYXNzPVwiZmxkLWVsZW1lbnQgZmxkLWluc2VydGlvblwiIHN0eWxlPVwiaGVpZ2h0OiAke3RoaXMuJGRyYWdnZWUub3V0ZXJIZWlnaHQoKX1weDtcIi8+YClcblx0fSxcblxuXHRvbkRyYWdTdG9wOiBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IHNob3dpbmdJbnNlcnRpb24gPSB0aGlzLnNob3dpbmdJbnNlcnRpb25cblx0XHRpZiAoc2hvd2luZ0luc2VydGlvbikge1xuXHRcdFx0aWYgKHRoaXMuZHJhZ2dpbmdMaWJyYXJ5RWxlbWVudCkge1xuXHRcdFx0XHQvLyBDcmVhdGUgYSBuZXcgZWxlbWVudCBiYXNlZCBvbiB0aGF0IG9uZVxuXHRcdFx0XHRjb25zdCAkZWxlbWVudCA9IHRoaXMuJGRyYWdnZWUuY2xvbmUoKS5yZW1vdmVDbGFzcygndW51c2VkJylcblxuXHRcdFx0XHRpZiAodGhpcy5kcmFnZ2luZ0ZpZWxkKSB7XG5cdFx0XHRcdFx0dGhpcy4kZHJhZ2dlZS5jc3MoeyB2aXNpYmlsaXR5OiAnaW5oZXJpdCcgfSlcblx0XHRcdFx0XHR0aGlzLmRlc2lnbmVyLmhpZGVMaWJyYXJ5RWxlbWVudCh0aGlzLiRkcmFnZ2VlKVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU2V0IHRoaXMuJGRyYWdnZWUgdG8gdGhlIGNsb25lLCBhcyBpZiB3ZSB3ZXJlIGRyYWdnaW5nIHRoYXQgYWxsIGFsb25nXG5cdFx0XHRcdHRoaXMuJGRyYWdnZWUgPSAkZWxlbWVudFxuXG5cdFx0XHRcdC8vIFJlbWVtYmVyIGl0IGZvciBsYXRlclxuXHRcdFx0XHR0aGlzLmFkZEl0ZW1zKCRlbGVtZW50KVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoIXRoaXMuZHJhZ2dpbmdMaWJyYXJ5RWxlbWVudCkge1xuXHRcdFx0Y29uc3QgJGxpYnJhcnlFbGVtZW50ID0gdGhpcy5kZXNpZ25lci5maW5kTGlicmFyeUVsZW1lbnQodGhpcy4kZHJhZ2dlZS5hdHRyKCdkYXRhLWhhbmRsZScpKVxuXG5cdFx0XHQvLyBEZXN0cm95IHRoZSBvcmlnaW5hbCBlbGVtZW50ICh0aGlzIGFsc28gcmVzdG9yZXMgdGhlIGxpYnJhcnkgZWxlbWVudClcblx0XHRcdHRoaXMuJGRyYWdnZWUuZGF0YSgnZmxkLWVsZW1lbnQnKS5kZXN0cm95KClcblxuXHRcdFx0Ly8gU2V0IHRoaXMuJGRyYWdnZWUgdG8gdGhlIGxpYnJhcnkgZWxlbWVudCwgYXMgaWYgd2Ugd2VyZSBkcmFnZ2luZyB0aGF0IGFsbCBhbG9uZ1xuXHRcdFx0dGhpcy4kZHJhZ2dlZSA9ICRsaWJyYXJ5RWxlbWVudFxuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNob3dpbmdJbnNlcnRpb24pIHtcblx0XHRcdHRoaXMuc3dhcEluc2VydGlvbldpdGhEcmFnZ2VlKClcblx0XHR9XG5cblx0XHR0aGlzLnJlbW92ZUNhYm9vc2UoKVxuXG5cdFx0dGhpcy5kZXNpZ25lci50YWJHcmlkLnJlZnJlc2hDb2xzKHRydWUpXG5cblx0XHQvLyByZXR1cm4gdGhlIGhlbHBlcnMgdG8gdGhlIGRyYWdnZWVzXG5cdFx0bGV0IG9mZnNldCA9IHRoaXMuJGRyYWdnZWUub2Zmc2V0KClcblx0XHRpZiAoIW9mZnNldCB8fCAob2Zmc2V0LnRvcCA9PT0gMCAmJiBvZmZzZXQubGVmdCA9PT0gMCkpIHtcblx0XHRcdHRoaXMuJGRyYWdnZWVcblx0XHRcdFx0LmNzcyh7XG5cdFx0XHRcdFx0ZGlzcGxheTogdGhpcy5kcmFnZ2VlRGlzcGxheSwgdmlzaWJpbGl0eTogJ3Zpc2libGUnLCBvcGFjaXR5OiAwLFxuXHRcdFx0XHR9KVxuXHRcdFx0XHQudmVsb2NpdHkoeyBvcGFjaXR5OiAxIH0sIEdhcm5pc2guRlhfRFVSQVRJT04pXG5cdFx0XHR0aGlzLmhlbHBlcnNbMF0udmVsb2NpdHkoeyBvcGFjaXR5OiAwIH0sIEdhcm5pc2guRlhfRFVSQVRJT04sICgpID0+IHtcblx0XHRcdFx0dGhpcy5fc2hvd0RyYWdnZWUoKVxuXHRcdFx0fSlcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZXR1cm5IZWxwZXJzVG9EcmFnZ2VlcygpXG5cdFx0fVxuXG5cdFx0dGhpcy5iYXNlKClcblxuXHRcdEdhcm5pc2guJGJvZC5yZW1vdmVDbGFzcygnZHJhZ2dpbmcnKVxuXG5cdFx0dGhpcy4kZHJhZ2dlZS5jc3Moe1xuXHRcdFx0ZGlzcGxheTogdGhpcy5kcmFnZ2VlRGlzcGxheSwgdmlzaWJpbGl0eTogdGhpcy5kcmFnZ2luZ0ZpZWxkIHx8IHNob3dpbmdJbnNlcnRpb24gPyAnaGlkZGVuJyA6ICd2aXNpYmxlJyxcblx0XHR9KVxuXG5cdFx0aWYgKHNob3dpbmdJbnNlcnRpb24pIHtcblx0XHRcdGNvbnN0IHRhYiA9IHRoaXMuJGRyYWdnZWUuY2xvc2VzdCgnLmZsZC10YWInKS5kYXRhKCdmbGQtdGFiJylcblx0XHRcdGxldCBlbGVtZW50XG5cblx0XHRcdGlmICh0aGlzLmRyYWdnaW5nTGlicmFyeUVsZW1lbnQpIHtcblx0XHRcdFx0ZWxlbWVudCA9IHRhYi5pbml0RWxlbWVudCh0aGlzLiRkcmFnZ2VlKVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZWxlbWVudCA9IHRoaXMuJGRyYWdnZWUuZGF0YSgnZmxkLWVsZW1lbnQnKVxuXG5cdFx0XHRcdC8vIE5ldyB0YWI/XG5cdFx0XHRcdGlmICh0YWIgIT09IHRoaXMub3JpZ2luYWxUYWIpIHtcblx0XHRcdFx0XHRjb25zdCBjb25maWcgPSBlbGVtZW50LmNvbmZpZ1xuXG5cdFx0XHRcdFx0dGhpcy5vcmlnaW5hbFRhYi51cGRhdGVDb25maWcoKGNvbmZpZykgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaW5kZXggPSBlbGVtZW50LmluZGV4XG5cdFx0XHRcdFx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uZmlnLmVsZW1lbnRzLnNwbGljZShpbmRleCwgMSlcblx0XHRcdFx0XHRcdHJldHVybiBjb25maWdcblx0XHRcdFx0XHR9KVxuXG5cdFx0XHRcdFx0dGhpcy4kZHJhZ2dlZS5kYXRhKCdmbGQtZWxlbWVudCcpLnRhYiA9IHRhYlxuXHRcdFx0XHRcdGVsZW1lbnQuY29uZmlnID0gY29uZmlnXG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZWxlbWVudC51cGRhdGVQb3NpdGlvbkluQ29uZmlnKClcblx0XHR9XG5cdH0sXG59KVxuZXhwb3J0IGRlZmF1bHQgRWxlbWVudERyYWciLCJpbXBvcnQgRGVzaWduZXJUYWIgZnJvbSAnLi9EZXNpZ25lclRhYi5qcydcbmltcG9ydCBEZXNpZ25lclNpZGViYXIgZnJvbSAnLi9EZXNpZ25lclNpZGViYXIuanMnXG5pbXBvcnQgRWxlbWVudERyYWcgZnJvbSAnLi9FbGVtZW50RHJhZy5qcydcblxuLy8gQ2xhc3NlcyBidWlsdCB3aXRoIEdhcm5pc2guQmFzZS5leHRlbmQoKSBhcmUgdmFsdWVzLCBzbyBKU0RvYyBuZWVkcyBJbnN0YW5jZVR5cGU8PiB0byByZWZlciB0byB0aGVpciBpbnN0YW5jZXNcbi8qKiBAdHlwZWRlZiB7SW5zdGFuY2VUeXBlPHR5cGVvZiBEZXNpZ25lclNpZGViYXI+fSBEZXNpZ25lclNpZGViYXJJbnN0YW5jZSAqL1xuLyoqIEB0eXBlZGVmIHtJbnN0YW5jZVR5cGU8dHlwZW9mIERlc2lnbmVyVGFiPn0gRGVzaWduZXJUYWJJbnN0YW5jZSAqL1xuLyoqIEB0eXBlZGVmIHtJbnN0YW5jZVR5cGU8dHlwZW9mIEVsZW1lbnREcmFnPn0gRWxlbWVudERyYWdJbnN0YW5jZSAqL1xuXG4vKipcbiAqIEB0eXBlZGVmIHtvYmplY3R9IExheW91dFRhYkNvbmZpZ1xuICogQHByb3BlcnR5IHtzdHJpbmd9IHVpZFxuICogQHByb3BlcnR5IHtzdHJpbmd9IFtuYW1lXVxuICogQHByb3BlcnR5IHtBcnJheTxSZWNvcmQ8c3RyaW5nLCBhbnk+Pn0gZWxlbWVudHNcbiAqL1xuXG4vKipcbiAqIFRoZSBmaWVsZCBsYXlvdXQgY29uZmlnLCBrZXB0IGluIHN5bmMgd2l0aCB0aGUgaGlkZGVuIGBmaWVsZExheW91dGAgaW5wdXQuXG4gKiBAdHlwZWRlZiB7b2JqZWN0fSBMYXlvdXRDb25maWdcbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSBbdWlkXVxuICogQHByb3BlcnR5IHtudW1iZXJ9IFtpZF1cbiAqIEBwcm9wZXJ0eSB7TGF5b3V0VGFiQ29uZmlnW119IHRhYnNcbiAqL1xuXG5jb25zdCBEZXNpZ25lciA9IEdhcm5pc2guQmFzZS5leHRlbmQoXG5cdHtcblx0XHQvLyBFdmVyeSBwcm9wZXJ0eSBpcyBzZXQgaW4gaW5pdCgpLiBEZWNsYXJpbmcgdGhlIHJlYWwgdHlwZSBhbmQgY2FzdGluZyB0aGUgaW5pdGlhbCBudWxsXG5cdFx0Ly8ga2VlcHMgVHlwZVNjcmlwdCBmcm9tIGluZmVycmluZyB0aGUgdHlwZSBgbnVsbGAuXG5cdFx0LyoqIEB0eXBlIHtKUXVlcnl9ICovXG5cdFx0JGNvbnRhaW5lcjogLyoqIEB0eXBlIHthbnl9ICovIChudWxsKSxcblx0XHQvKiogQHR5cGUge0pRdWVyeX0gKi9cblx0XHQkd29ya3NwYWNlOiAvKiogQHR5cGUge2FueX0gKi8gKG51bGwpLFxuXHRcdC8qKiBAdHlwZSB7SlF1ZXJ5fSAqL1xuXHRcdCRjb25maWdJbnB1dDogLyoqIEB0eXBlIHthbnl9ICovIChudWxsKSxcblx0XHQvKiogQHR5cGUge0pRdWVyeX0gKi9cblx0XHQkdGFiQ29udGFpbmVyOiAvKiogQHR5cGUge2FueX0gKi8gKG51bGwpLFxuXHRcdC8qKiBAdHlwZSB7RGVzaWduZXJTaWRlYmFySW5zdGFuY2V9ICovXG5cdFx0c2VsZWN0ZWRTaWRlYmFyOiAvKiogQHR5cGUge2FueX0gKi8gKG51bGwpLFxuXHRcdC8qKiBAdHlwZSB7RGVzaWduZXJTaWRlYmFySW5zdGFuY2VbXX0gKi9cblx0XHQkc2lkZWJhcnM6IFtdLFxuXG5cdFx0LyoqIENyYWZ0LkdyaWQsIHdoaWNoIGlzbuKAmXQgdHlwZWQuIEB0eXBlIHthbnl9ICovXG5cdFx0dGFiR3JpZDogbnVsbCxcblx0XHQvKiogQHR5cGUge0VsZW1lbnREcmFnSW5zdGFuY2V9ICovXG5cdFx0ZWxlbWVudERyYWc6IC8qKiBAdHlwZSB7YW55fSAqLyAobnVsbCksXG5cblx0XHQvKiogQHR5cGUge0xheW91dENvbmZpZ30gKi9cblx0XHRfY29uZmlnOiAvKiogQHR5cGUge2FueX0gKi8gKG51bGwpLFxuXG5cdFx0LyoqXG5cdFx0ICogQHBhcmFtIHtzdHJpbmd9IGNvbnRhaW5lciBDU1Mgc2VsZWN0b3IgZm9yIHRoZSBkZXNpZ25lciBjb250YWluZXJcblx0XHQgKi9cblx0XHRpbml0OiBmdW5jdGlvbiAoY29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLiRjb250YWluZXIgPSAkKGNvbnRhaW5lcilcblx0XHRcdC8vIGVkaXRleHBvcnRlci5qcyBkZXN0cm95cyB0aGUgZGVzaWduZXIgYmVmb3JlIHJlbmRlcmluZyBhIG5ldyBvbmVcblx0XHRcdHRoaXMuJGNvbnRhaW5lci5kYXRhKCdkZXNpZ25lcicsIHRoaXMpXG5cblx0XHRcdHRoaXMuJGNvbmZpZ0lucHV0ID0gdGhpcy4kY29udGFpbmVyLmNoaWxkcmVuKCdpbnB1dFtkYXRhLWNvbmZpZy1pbnB1dF0nKVxuXHRcdFx0dGhpcy5fY29uZmlnID0gSlNPTi5wYXJzZShTdHJpbmcodGhpcy4kY29uZmlnSW5wdXQudmFsKCkpKVxuXHRcdFx0aWYgKCF0aGlzLl9jb25maWcudGFicykge1xuXHRcdFx0XHR0aGlzLl9jb25maWcudGFicyA9IFtdXG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuJHdvcmtzcGFjZSA9IHRoaXMuJGNvbnRhaW5lci5jaGlsZHJlbignLmZsZC13b3Jrc3BhY2UnKVxuXHRcdFx0dGhpcy4kdGFiQ29udGFpbmVyID0gdGhpcy4kd29ya3NwYWNlLmNoaWxkcmVuKCcuZmxkLXRhYnMnKVxuXHRcdFx0dGhpcy5zZWxlY3RlZFNpZGViYXIgPSBuZXcgRGVzaWduZXJTaWRlYmFyKHRoaXMsIHRoaXMuJGNvbnRhaW5lci5maW5kKCcuZmxkLXNpZGViYXInKSlcblx0XHRcdHRoaXMuJHNpZGViYXJzID0gW3RoaXMuc2VsZWN0ZWRTaWRlYmFyXVxuXG5cdFx0XHQvLyBTZXQgdXAgdGhlIGxheW91dCBncmlkc1xuXHRcdFx0dGhpcy50YWJHcmlkID0gbmV3IENyYWZ0LkdyaWQodGhpcy4kdGFiQ29udGFpbmVyLCB7XG5cdFx0XHRcdGl0ZW1TZWxlY3RvcjogJy5mbGQtdGFiJyxcblx0XHRcdFx0bWluQ29sV2lkdGg6IDI0ICogMTEsXG5cdFx0XHRcdGZpbGxNb2RlOiAnZ3JpZCcsXG5cdFx0XHRcdHNuYXBUb0dyaWQ6IDI0LFxuXHRcdFx0fSlcblxuXHRcdFx0Ly8gYGVgIGlzIGEgSlF1ZXJ5LlRyaWdnZXJlZEV2ZW50LCBhbmQgYHRoaXNgIGlzIHRoZSBkZXNpZ25lclxuXHRcdFx0dGhpcy5hZGRMaXN0ZW5lcih3aW5kb3csICdrZXlkb3duJywgZSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLiRjb250YWluZXIuZGF0YSgnbmVzdGluZ0xldmVscycpID09PSAwKSByZXR1cm5cblx0XHRcdFx0aWYgKGUua2V5ICE9PSAnRXNjYXBlJykgcmV0dXJuXG5cdFx0XHRcdGlmIChlLnRhcmdldC5jbG9zZXN0KCcuZmxkLWxpYnJhcnkgLnNlYXJjaCcpKSByZXR1cm5cblxuXHRcdFx0XHR0aGlzLnJlbW92ZVNpZGViYXIoKVxuXHRcdFx0fSlcblxuXHRcdFx0Ly8gXCLCu1wiIGJ1dHRvbnMgcmVtb3ZlIGVsZW1lbnRzIGZyb20gdGhlIHdvcmtzcGFjZSB3aXRob3V0IGRyYWdnaW5nXG5cdFx0XHR0aGlzLmFkZExpc3RlbmVyKHRoaXMuJHdvcmtzcGFjZSwgJ2NsaWNrJywgZSA9PiB7XG5cdFx0XHRcdGlmICgkKGUudGFyZ2V0KS5jbG9zZXN0KCcuZmxkLWVsZW1lbnQgLnJlbW92ZS1lbGVtZW50JykubGVuZ3RoID09PSAwKSByZXR1cm5cblxuXHRcdFx0XHRjb25zdCBlbGVtZW50ID0gJChlLnRhcmdldCkuY2xvc2VzdCgnLmZsZC1lbGVtZW50JykuZGF0YSgnZmxkLWVsZW1lbnQnKVxuXHRcdFx0XHRpZiAoIWVsZW1lbnQpIHJldHVyblxuXG5cdFx0XHRcdGVsZW1lbnQuZGVzdHJveSgpXG5cdFx0XHRcdHRoaXMudGFiR3JpZC5yZWZyZXNoQ29scyh0cnVlKVxuXHRcdFx0fSlcblxuXHRcdFx0dGhpcy5pbml0VGFiKHRoaXMuJHRhYkNvbnRhaW5lci5jaGlsZHJlbigpKVxuXHRcdFx0dGhpcy5lbGVtZW50RHJhZyA9IG5ldyBFbGVtZW50RHJhZyh0aGlzKVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBAcGFyYW0ge0pRdWVyeX0gJHNpZGViYXJcblx0XHQgKi9cblx0XHRhZGRTaWRlYmFyOiBmdW5jdGlvbiAoJHNpZGViYXIpIHtcblx0XHRcdGNvbnN0IG5ld1NpZGViYXIgPSBuZXcgRGVzaWduZXJTaWRlYmFyKHRoaXMsICRzaWRlYmFyKVxuXHRcdFx0dGhpcy4kc2lkZWJhcnMucHVzaChuZXdTaWRlYmFyKVxuXHRcdFx0dGhpcy5zZWxlY3RlZFNpZGViYXIgPSBuZXdTaWRlYmFyXG5cdFx0fSxcblxuXHRcdHJlbW92ZVNpZGViYXI6IGZ1bmN0aW9uICgpIHtcblx0XHRcdC8vIFRoZSByb290IHNpZGViYXIgYWx3YXlzIHN0YXlzXG5cdFx0XHRpZiAodGhpcy4kc2lkZWJhcnMubGVuZ3RoIDw9IDEpIHJldHVyblxuXG5cdFx0XHRjb25zdCBzaWRlYmFyID0gLyoqIEB0eXBlIHtEZXNpZ25lclNpZGViYXJJbnN0YW5jZX0gKi8gKHRoaXMuJHNpZGViYXJzLnBvcCgpKVxuXHRcdFx0dGhpcy5lbGVtZW50RHJhZy5yZW1vdmVJdGVtcyhzaWRlYmFyLiRjb250YWluZXIuZmluZCgnLmZsZC1lbGVtZW50JykpXG5cdFx0XHRzaWRlYmFyLiRjb250YWluZXIucmVtb3ZlKClcblx0XHRcdHRoaXMuc2VsZWN0ZWRTaWRlYmFyID0gdGhpcy4kc2lkZWJhcnNbdGhpcy4kc2lkZWJhcnMubGVuZ3RoIC0gMV1cblxuXHRcdFx0Y29uc3QgbGV2ZWxzID0gdGhpcy4kY29udGFpbmVyLmRhdGEoJ25lc3RpbmdMZXZlbHMnKSAtIDFcblx0XHRcdHRoaXMuJGNvbnRhaW5lci5jc3MoJy0tbmVzdGluZy1sZXZlbHMnLCBsZXZlbHMpXG5cdFx0XHR0aGlzLiRjb250YWluZXIuZGF0YSgnbmVzdGluZ0xldmVscycsIGxldmVscylcblx0XHR9LFxuXG5cdFx0LyoqXG5cdFx0ICogUmVtb3ZlcyB0aGUgc2lkZWJhcnMgbmVzdGVkIGRlZXBlciB0aGFuIHRoZSBnaXZlbiBvbmUuXG5cdFx0ICogQHBhcmFtIHtEZXNpZ25lclNpZGViYXJJbnN0YW5jZX0gc2lkZWJhclxuXHRcdCAqL1xuXHRcdHJlbW92ZVNpZGViYXJzQWZ0ZXI6IGZ1bmN0aW9uIChzaWRlYmFyKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuJHNpZGViYXJzLmluZGV4T2Yoc2lkZWJhcilcblx0XHRcdGlmIChpbmRleCA9PT0gLTEpIHJldHVyblxuXG5cdFx0XHR3aGlsZSAodGhpcy4kc2lkZWJhcnMubGVuZ3RoIC0gMSA+IGluZGV4KSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlU2lkZWJhcigpXG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdC8qKlxuXHRcdCAqIFJlbW92ZXMgdGhlIGRlc2lnbmVyJ3MgbGlzdGVuZXJzLCBkcmFnZ2luZyBhbmQgZWxlbWVudCBzZXR0aW5ncyBzbGlkZW91dHMsIGUuZy4gYmVmb3JlIGl0J3MgcmUtcmVuZGVyZWQuXG5cdFx0ICovXG5cdFx0ZGVzdHJveTogZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy4kdGFiQ29udGFpbmVyLmZpbmQoJy5mbGQtZWxlbWVudCcpLmVhY2goKGksIGVsKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNsaWRlb3V0ID0gJChlbCkuZGF0YSgnZmxkLWVsZW1lbnQnKT8uc2xpZGVvdXRcblx0XHRcdFx0aWYgKHNsaWRlb3V0KSB7XG5cdFx0XHRcdFx0c2xpZGVvdXQuZGVzdHJveSgpXG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cblx0XHRcdHRoaXMuZWxlbWVudERyYWcuZGVzdHJveSgpXG5cdFx0XHR0aGlzLiRjb250YWluZXIucmVtb3ZlRGF0YSgnZGVzaWduZXInKVxuXHRcdFx0dGhpcy5iYXNlKClcblx0XHR9LFxuXG5cdFx0LyoqXG5cdFx0ICogQ2xvc2VzIGEgbmVzdGVkIHNpZGViYXIsIGFsb25nIHdpdGggdGhlIHNpZGViYXJzIG9wZW5lZCBmcm9tIGl0LiBUaGUgcm9vdCBzaWRlYmFyIHN0YXlzLlxuXHRcdCAqIEBwYXJhbSB7RGVzaWduZXJTaWRlYmFySW5zdGFuY2V9IHNpZGViYXJcblx0XHQgKi9cblx0XHRjbG9zZVNpZGViYXI6IGZ1bmN0aW9uIChzaWRlYmFyKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuJHNpZGViYXJzLmluZGV4T2Yoc2lkZWJhcilcblx0XHRcdGlmIChpbmRleCA8IDEpIHJldHVyblxuXG5cdFx0XHR0aGlzLnJlbW92ZVNpZGViYXJzQWZ0ZXIodGhpcy4kc2lkZWJhcnNbaW5kZXggLSAxXSlcblx0XHR9LFxuXG5cdFx0LyoqXG5cdFx0ICogQHBhcmFtIHtKUXVlcnl9ICR0YWJcblx0XHQgKiBAcmV0dXJucyB7RGVzaWduZXJUYWJJbnN0YW5jZX1cblx0XHQgKi9cblx0XHRpbml0VGFiOiBmdW5jdGlvbiAoJHRhYikge1xuXHRcdFx0cmV0dXJuIG5ldyBEZXNpZ25lclRhYih0aGlzLCAkdGFiKVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBGaW5kcyB0aGUgbGlicmFyeSBlbGVtZW50IGZvciBhIGhhbmRsZSBhY3Jvc3MgYWxsIG9wZW4gc2lkZWJhcnMuXG5cdFx0ICogQHBhcmFtIHtzdHJpbmd9IGhhbmRsZVxuXHRcdCAqIEByZXR1cm5zIHtKUXVlcnl9XG5cdFx0ICovXG5cdFx0ZmluZExpYnJhcnlFbGVtZW50OiBmdW5jdGlvbiAoaGFuZGxlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy4kY29udGFpbmVyXG5cdFx0XHRcdC5maW5kKCcuZmxkLXNpZGViYXIgLmZsZC1lbGVtZW50LnVudXNlZCcpXG5cdFx0XHRcdC5maWx0ZXIoKGksIGVsKSA9PiBlbC5kYXRhc2V0LmhhbmRsZSA9PT0gU3RyaW5nKGhhbmRsZSkpXG5cdFx0XHRcdC5maXJzdCgpXG5cdFx0fSxcblxuXHRcdC8qKlxuXHRcdCAqIEhpZGVzIGEgbGlicmFyeSBlbGVtZW50IG9uY2UgaXQncyBiZWVuIHBsYWNlZCBpbiB0aGUgd29ya3NwYWNlLlxuXHRcdCAqIENvbXBsZXggZmllbGRzIHN0YXkgdmlzaWJsZSwgc28gdGhleSBjYW4gc3RpbGwgYmUgZXhwYW5kZWQgaW50byBuZXN0ZWQgc2lkZWJhcnMuXG5cdFx0ICogQHBhcmFtIHtKUXVlcnl9ICRsaWJyYXJ5RWxlbWVudFxuXHRcdCAqL1xuXHRcdGhpZGVMaWJyYXJ5RWxlbWVudDogZnVuY3Rpb24gKCRsaWJyYXJ5RWxlbWVudCkge1xuXHRcdFx0aWYgKCEkbGlicmFyeUVsZW1lbnQubGVuZ3RoIHx8ICRsaWJyYXJ5RWxlbWVudC5oYXNDbGFzcygnY29tcGxleC1maWVsZCcpKSByZXR1cm5cblxuXHRcdFx0JGxpYnJhcnlFbGVtZW50LmFkZENsYXNzKCdoaWRkZW4nKVxuXG5cdFx0XHRpZiAoJGxpYnJhcnlFbGVtZW50LnNpYmxpbmdzKCcuZmxkLWVsZW1lbnQ6bm90KC5oaWRkZW4pJykubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdCRsaWJyYXJ5RWxlbWVudC5jbG9zZXN0KCcuZmxkLWZpZWxkLWdyb3VwJykuYWRkQ2xhc3MoJ2hpZGRlbicpXG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdC8qKlxuXHRcdCAqIEBwYXJhbSB7c3RyaW5nfSBoYW5kbGVcblx0XHQgKi9cblx0XHRyZW1vdmVGaWVsZEJ5SGFuZGxlOiBmdW5jdGlvbiAoaGFuZGxlKSB7XG5cdFx0XHR0aGlzLmZpbmRMaWJyYXJ5RWxlbWVudChoYW5kbGUpXG5cdFx0XHRcdC5yZW1vdmVDbGFzcygnaGlkZGVuJylcblx0XHRcdFx0LmNsb3Nlc3QoJy5mbGQtZmllbGQtZ3JvdXAnKVxuXHRcdFx0XHQucmVtb3ZlQ2xhc3MoJ2hpZGRlbicpXG5cdFx0fSxcblxuXHRcdC8qKlxuXHRcdCAqIEByZXR1cm5zIHtMYXlvdXRDb25maWd9XG5cdFx0ICovXG5cdFx0Z2V0IGNvbmZpZygpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jb25maWdcblx0XHR9LFxuXG5cdFx0LyoqXG5cdFx0ICogQHBhcmFtIHtMYXlvdXRDb25maWd9IGNvbmZpZ1xuXHRcdCAqL1xuXHRcdHNldCBjb25maWcoY29uZmlnKSB7XG5cdFx0XHR0aGlzLl9jb25maWcgPSBjb25maWdcblx0XHRcdHRoaXMuJGNvbmZpZ0lucHV0LnZhbChKU09OLnN0cmluZ2lmeShjb25maWcpKVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBAcGFyYW0geyhjb25maWc6IExheW91dENvbmZpZykgPT4gTGF5b3V0Q29uZmlnIHwgZmFsc2V9IGNhbGxiYWNrIFJldHVybiBgZmFsc2VgIHRvIGxlYXZlIHRoZSBjb25maWcgdW5jaGFuZ2VkLlxuXHRcdCAqL1xuXHRcdHVwZGF0ZUNvbmZpZzogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG5cdFx0XHRjb25zdCBjb25maWcgPSBjYWxsYmFjayh0aGlzLmNvbmZpZylcblx0XHRcdGlmIChjb25maWcgIT09IGZhbHNlKSB7XG5cdFx0XHRcdHRoaXMuY29uZmlnID0gY29uZmlnXG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdC8qKlxuXHRcdCAqIEBwYXJhbSB7c3RyaW5nfSBjb250ZW50c1xuXHRcdCAqIEBwYXJhbSB7c3RyaW5nfSBbanNdXG5cdFx0ICogQHJldHVybnMge2FueX0gQSBDcmFmdC5TbGlkZW91dFxuXHRcdCAqL1xuXHRcdGNyZWF0ZVNsaWRlb3V0OiBmdW5jdGlvbiAoY29udGVudHMsIGpzKSB7XG5cdFx0XHRjb25zdCAkYm9keSA9ICQoJzxkaXYvPicsIHsgY2xhc3M6ICdmbGQtZWxlbWVudC1zZXR0aW5ncy1ib2R5JyB9KVxuXHRcdFx0JCgnPGRpdi8+JywgeyBjbGFzczogJ2ZpZWxkcycsIGh0bWw6IGNvbnRlbnRzIH0pLmFwcGVuZFRvKCRib2R5KVxuXHRcdFx0Y29uc3QgJGZvb3RlciA9ICQoJzxkaXYvPicsIHsgY2xhc3M6ICdmbGQtZWxlbWVudC1zZXR0aW5ncy1mb290ZXInIH0pXG5cdFx0XHQkKCc8ZGl2Lz4nLCB7IGNsYXNzOiAnZmxleC1ncm93JyB9KS5hcHBlbmRUbygkZm9vdGVyKVxuXHRcdFx0Y29uc3QgJGNhbmNlbEJ0biA9IENyYWZ0LnVpXG5cdFx0XHRcdC5jcmVhdGVCdXR0b24oe1xuXHRcdFx0XHRcdGxhYmVsOiBDcmFmdC50KCdhcHAnLCAnQ2xvc2UnKSwgc3Bpbm5lcjogdHJ1ZSxcblx0XHRcdFx0fSlcblx0XHRcdFx0LmFwcGVuZFRvKCRmb290ZXIpXG5cdFx0XHRDcmFmdC51aVxuXHRcdFx0XHQuY3JlYXRlU3VibWl0QnV0dG9uKHtcblx0XHRcdFx0XHRjbGFzczogJ3NlY29uZGFyeScsIGxhYmVsOiBDcmFmdC50KCdhcHAnLCAnQXBwbHknKSwgc3Bpbm5lcjogdHJ1ZSxcblx0XHRcdFx0fSlcblx0XHRcdFx0LmFwcGVuZFRvKCRmb290ZXIpXG5cdFx0XHRjb25zdCAkY29udGVudHMgPSAkYm9keS5hZGQoJGZvb3RlcilcblxuXHRcdFx0Y29uc3Qgc2xpZGVvdXQgPSBuZXcgQ3JhZnQuU2xpZGVvdXQoJGNvbnRlbnRzLCB7XG5cdFx0XHRcdGNvbnRhaW5lckVsZW1lbnQ6ICdmb3JtJywgY29udGFpbmVyQXR0cmlidXRlczoge1xuXHRcdFx0XHRcdGFjdGlvbjogJycsIG1ldGhvZDogJ3Bvc3QnLCBub3ZhbGlkYXRlOiAnJywgY2xhc3M6ICdmbGQtZWxlbWVudC1zZXR0aW5ncycsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KVxuXHRcdFx0c2xpZGVvdXQub24oJ29wZW4nLCAoKSA9PiB7XG5cdFx0XHRcdC8vIEhvbGQgb2ZmIGEgc2VjIHVudGlsIGl0J3MgcG9zaXRpb25lZC4uLlxuXHRcdFx0XHRHYXJuaXNoLnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gRm9jdXMgb24gdGhlIGZpcnN0IHRleHQgaW5wdXRcblx0XHRcdFx0XHRzbGlkZW91dC4kY29udGFpbmVyLmZpbmQoJy50ZXh0OmZpcnN0JykuZm9jdXMoKVxuXHRcdFx0XHR9KVxuXHRcdFx0fSlcblxuXHRcdFx0JGNhbmNlbEJ0bi5vbignY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRcdHNsaWRlb3V0LmNsb3NlKClcblx0XHRcdH0pXG5cblx0XHRcdGlmIChqcykge1xuXHRcdFx0XHRldmFsKGpzKVxuXHRcdFx0fVxuXG5cdFx0XHRDcmFmdC5pbml0VWlFbGVtZW50cyhzbGlkZW91dC4kY29udGFpbmVyKVxuXG5cdFx0XHRyZXR1cm4gc2xpZGVvdXRcblx0XHR9LFxuXHR9LFxuKVxuXG5leHBvcnQgZGVmYXVsdCBEZXNpZ25lciIsImltcG9ydCBEZXNpZ25lciBmcm9tICcuL0V4cG9ydGVyTGF5b3V0L0Rlc2lnbmVyLmpzJ1xuXG5DcmFmdC5FeHBvcnRlckxheW91dERlc2lnbmVyID0gRGVzaWduZXJcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Q0FBQSxNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU07Q0FDM0MsQ0FBQztDQUNELEVBQUUsR0FBRyxFQUFFLElBQUk7Q0FDWCxFQUFFLFVBQVUsRUFBRSxJQUFJO0NBQ2xCLEVBQUUsa0JBQWtCLEVBQUUsSUFBSTtDQUMxQixFQUFFLFFBQVEsRUFBRSxJQUFJOztDQUVoQixFQUFFLEdBQUcsRUFBRSxJQUFJO0NBQ1gsRUFBRSxPQUFPLEVBQUUsS0FBSztDQUNoQixFQUFFLFNBQVMsRUFBRSxJQUFJO0NB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{"version":3,"file":"dynex.js","sources":["assets/Cp/src/js/ExporterLayout/DesignerElement.js","assets/Cp/src/js/ExporterLayout/DesignerTab.js","assets/Cp/src/js/ExporterLayout/ComplexFields.js","assets/Cp/src/js/ExporterLayout/CustomFields.js","assets/Cp/src/js/ExporterLayout/SidebarLibrary.js","assets/Cp/src/js/ExporterLayout/DesignerSidebar.js","assets/Cp/src/js/ExporterLayout/ElementDrag.js","assets/Cp/src/js/ExporterLayout/Designer.js","assets/Cp/src/js/dynex.js"],"sourcesContent":["const DesignerElement = Garnish.Base.extend(\n\t{\n\t\ttab: null,\n\t\t$container: null,\n\t\t$settingsContainer: null,\n\t\t$editBtn: null,\n\n\t\tuid: null,\n\t\tisField: false,\n\t\tattribute: null,\n\t\thasSettings: false,\n\t\tsettingsNamespace: null,\n\t\tslideout: null,\n\n\t\t/**\n\t\t * Constructor\n\t\t *\n\t\t * @this {typeof DesignerElement}\n\t\t * @param {DesignerTab} tab    Elements that should be draggable right away. (Can be skipped.)\n\t\t * @param {JQuery<HTMLElement>|HTMLElement} $container Any settings that should override the defaults.\n\t\t */\n\t\tinit: function (tab, $container) {\n\t\t\tthis.tab = tab\n\t\t\tthis.$container = $container\n\t\t\tthis.$container.data('fld-element', this)\n\t\t\tthis.uid = this.$container.data('uid')\n\n\t\t\tif (!this.uid) {\n\t\t\t\tthis.uid = Craft.uuid()\n\t\t\t\tthis.config = $.extend(this.$container.data('config'), { uid: this.uid })\n\t\t\t}\n\n\t\t\tthis.isField = this.$container.hasClass('fld-field')\n\n\t\t\tif (this.isField) {\n\t\t\t\tthis.attribute = this.$container.attr('data-handle')\n\t\t\t}\n\n\t\t\tthis.settingsNamespace = this.$container\n\t\t\t\t.data('settings-namespace')\n\t\t\t\t.replace(/\\bELEMENT_UID\\b/g, this.uid)\n\t\t\tlet settingsHtml = (this.$container.data('settings-html') || '').replace(/\\bELEMENT_UID\\b/g, this.uid)\n\t\t\tthis.hasSettings = settingsHtml\n\n\t\t\tif (this.hasSettings) {\n\t\t\t\t// create the setting container\n\t\t\t\tthis.$settingsContainer = $('<div/>', {\n\t\t\t\t\tclass: 'hidden',\n\t\t\t\t})\n\n\t\t\t\t// create the edit button\n\t\t\t\tthis.$editBtn = $('<a/>', {\n\t\t\t\t\trole: 'button', tabindex: 0, class: 'settings icon', title: Craft.t('app', 'Edit'),\n\t\t\t\t})\n\n\t\t\t\tconst showSettings = () => {\n\t\t\t\t\tif (!this.slideout) {\n\t\t\t\t\t\tthis.createSettings(settingsHtml)\n\t\t\t\t\t} else {\n\t\t\t\t\t\tthis.slideout.open()\n\t\t\t\t\t}\n\t\t\t\t}\n\n\t\t\t\tthis.$editBtn.on('click', showSettings)\n\t\t\t\tthis.$container.on('dblclick', showSettings)\n\t\t\t}\n\n\t\t\tthis.initUi()\n\n\t\t\t// cleanup\n\t\t\tthis.$container.attr('data-keywords', null)\n\t\t\tthis.$container.attr('data-settings-html', null)\n\t\t},\n\n\t\tinitUi: function () {\n\t\t\tif (this.hasSettings) {\n\t\t\t\tthis.$editBtn.appendTo(this.$container)\n\t\t\t}\n\t\t},\n\n\t\tcreateSettings: function (settingsHtml) {\n\t\t\tconst settingsJs = (this.$container.data('settings-js') || '').replace(/\\bELEMENT_UID\\b/g, this.uid)\n\t\t\tthis.slideout = this.tab.designer.createSlideout(settingsHtml, settingsJs)\n\n\t\t\tthis.slideout.$container.on('submit', (ev) => {\n\t\t\t\tev.preventDefault()\n\t\t\t\tthis.applySettings()\n\t\t\t})\n\n\t\t\tthis.trigger('createSettings')\n\t\t},\n\n\t\tapplySettings: function () {\n\t\t\t// The label input is namespaced, e.g. `element-<uid>[label]`\n\t\t\tconst label = String(this.slideout.$container.find('input[name$=\"[label]\"], input[name=\"label\"]').val() ?? '').trim()\n\t\t\t// Only fields with formats to choose from have a format select\n\t\t\tconst $format = this.slideout.$container.find('select[name$=\"[format]\"], select[name=\"format\"]')\n\n\t\t\tthis.updateConfig((config) => {\n\t\t\t\t// A blank label falls back to the field's default label\n\t\t\t\tconfig.label = label || config.defaultLabel\n\t\t\t\tif ($format.length) {\n\t\t\t\t\tconfig.format = String($format.val() ?? '') || null\n\t\t\t\t}\n\t\t\t\treturn config\n\t\t\t})\n\n\t\t\tthis.$container\n\t\t\t\t.find('.fld-element-label h4')\n\t\t\t\t.text(this.config.label)\n\t\t\t\t.attr('title', this.config.label)\n\n\t\t\tthis.slideout.close()\n\t\t},\n\n\t\tget index() {\n\t\t\tconst tabConfig = this.tab.config\n\t\t\tif (typeof tabConfig === 'undefined') {\n\t\t\t\treturn -1\n\t\t\t}\n\t\t\treturn tabConfig.elements.findIndex((c) => c.uid === this.uid)\n\t\t},\n\n\t\tget config() {\n\t\t\tif (!this.uid) {\n\t\t\t\tthrow 'Tab is missing its UID'\n\t\t\t}\n\t\t\tlet config = this.tab.config.elements.find((c) => c.uid === this.uid)\n\t\t\tif (!config) {\n\t\t\t\tconfig = {\n\t\t\t\t\tuid: this.uid,\n\t\t\t\t}\n\t\t\t\tthis.config = config\n\t\t\t}\n\t\t\treturn config\n\t\t},\n\n\t\tset config(config) {\n\t\t\tconst tabConfig = this.tab.config\n\t\t\tconst index = this.index\n\t\t\tif (index !== -1) {\n\t\t\t\ttabConfig.elements[index] = config\n\t\t\t} else {\n\t\t\t\tconst newIndex = $.inArray(this.$container[0], this.$container.parent().children('.fld-element'))\n\t\t\t\ttabConfig.elements.splice(newIndex, 0, config)\n\t\t\t}\n\t\t\tthis.tab.config = tabConfig\n\t\t},\n\n\t\tupdateConfig: function (callback) {\n\t\t\tconst config = callback(this.config)\n\t\t\tif (config !== false) {\n\t\t\t\tthis.config = config\n\t\t\t}\n\t\t},\n\n\t\tupdatePositionInConfig: function () {\n\t\t\tthis.tab.updateConfig((config) => {\n\t\t\t\tconst elementConfig = this.config\n\t\t\t\tconst oldIndex = this.index\n\t\t\t\tconst newIndex = $.inArray(this.$container[0], this.$container.parent().children('.fld-element'))\n\t\t\t\tif (oldIndex !== -1) {\n\t\t\t\t\tconfig.elements.splice(oldIndex, 1)\n\t\t\t\t}\n\t\t\t\tconfig.elements.splice(newIndex, 0, elementConfig)\n\t\t\t\treturn config\n\t\t\t})\n\t\t},\n\n\t\tdestroy: function () {\n\t\t\tthis.tab.updateConfig((config) => {\n\t\t\t\tconst index = this.index\n\t\t\t\tif (index === -1) {\n\t\t\t\t\treturn false\n\t\t\t\t}\n\t\t\t\tconfig.elements.splice(index, 1)\n\t\t\t\treturn config\n\t\t\t})\n\n\t\t\tthis.tab.designer.elementDrag.removeItems(this.$container)\n\t\t\tthis.$container.remove()\n\n\t\t\tif (this.slideout) {\n\t\t\t\tthis.slideout.destroy()\n\t\t\t\tthis.slideout = null\n\t\t\t}\n\n\t\t\tif (this.isField) {\n\t\t\t\tthis.tab.designer.removeFieldByHandle(this.attribute)\n\t\t\t}\n\n\t\t\tthis.base()\n\t\t},\n\t},\n\t{},\n)\n\nexport default DesignerElement","import DesignerElement from './DesignerElement.js'\n\nconst DesignerTab = Garnish.Base.extend(\n\t{\n\t\tdesigner: null,\n\t\tuid: null,\n\t\t$container: null,\n\t\tdestroyed: false,\n\n\t\tinit: function (designer, $container) {\n\t\t\tthis.designer = designer\n\t\t\tthis.$container = $container\n\t\t\tthis.$container.data('fld-tab', this)\n\t\t\tthis.uid = this.$container.data('uid')\n\n\t\t\t// New tab?\n\t\t\tif (!this.uid) {\n\t\t\t\tthis.uid = Craft.uuid()\n\t\t\t\tthis.config = {\n\t\t\t\t\tuid: this.uid,\n\t\t\t\t\tname: this.$container.find('.tabs .tab span').text(),\n\t\t\t\t\telements: [],\n\t\t\t\t}\n\t\t\t\tthis.$container.data('settings-namespace', this.designer.$container\n\t\t\t\t\t.data('new-tab-settings-namespace')\n\t\t\t\t\t.replace(/\\bTAB_UID\\b/g, this.uid))\n\n\t\t\t\tthis.$container.data('settings-html', this.designer.$container\n\t\t\t\t\t.data('new-tab-settings-html')\n\t\t\t\t\t.replace(/\\bTAB_UID\\b/g, this.uid)\n\t\t\t\t\t.replace(/\\bTAB_NAME\\b/g, this.config.name))\n\n\t\t\t\tthis.$container.data('settings-js', this.designer.$container\n\t\t\t\t\t.data('new-tab-settings-js')\n\t\t\t\t\t.replace(/\\bTAB_UID\\b/g, this.uid))\n\t\t\t}\n\n\t\t\t// initialize the elements\n\t\t\tconst $elements = this.$container.children('.fld-tabcontent').children()\n\n\t\t\tfor (let i = 0; i < $elements.length; i++) {\n\t\t\t\tthis.initElement($($elements[i]))\n\t\t\t}\n\t\t},\n\n\t\tinitElement: function ($element) {\n\t\t\treturn new DesignerElement(this, $element)\n\t\t},\n\n\t\tget index() {\n\t\t\treturn this.designer.config.tabs.findIndex((c) => c.uid === this.uid)\n\t\t},\n\n\t\tget config() {\n\t\t\tif (!this.uid) {\n\t\t\t\tthrow 'Tab is missing its UID'\n\t\t\t}\n\t\t\tlet config = this.designer.config.tabs.find((c) => c.uid === this.uid)\n\t\t\tif (!config) {\n\t\t\t\tconfig = {\n\t\t\t\t\tuid: this.uid, elements: [],\n\t\t\t\t}\n\t\t\t\tthis.config = config\n\t\t\t}\n\t\t\treturn config\n\t\t},\n\n\t\tset config(config) {\n\t\t\tif (this.destroyed) {\n\t\t\t\treturn\n\t\t\t}\n\n\t\t\t// Is the name changing?\n\t\t\tif (config.name && config.name !== this.config.name) {\n\t\t\t\tthis.$container.find('.tabs .tab span').text(config.name)\n\t\t\t}\n\n\t\t\tconst designerConfig = this.designer.config\n\t\t\tconst index = this.index\n\t\t\tif (index !== -1) {\n\t\t\t\tdesignerConfig.tabs[index] = config\n\t\t\t} else {\n\t\t\t\tconst newIndex = $.inArray(this.$container[0], this.$container.parent().children('.fld-tab'))\n\t\t\t\tdesignerConfig.tabs.splice(newIndex, 0, config)\n\t\t\t}\n\t\t\tthis.designer.config = designerConfig\n\t\t},\n\n\t\tupdateConfig: function (callback) {\n\t\t\tif (this.destroyed) {\n\t\t\t\treturn\n\t\t\t}\n\n\t\t\tconst config = callback(this.config)\n\t\t\tif (config !== false) {\n\t\t\t\tthis.config = config\n\t\t\t}\n\t\t},\n\n\t\tdestroy: function () {\n\t\t\tif (this.destroyed) {\n\t\t\t\treturn\n\t\t\t}\n\n\t\t\tthis.destroyed = true\n\n\t\t\tthis.designer.updateConfig((config) => {\n\t\t\t\tconst index = this.index\n\t\t\t\tif (index === -1) {\n\t\t\t\t\treturn false\n\t\t\t\t}\n\t\t\t\tconfig.tabs.splice(index, 1)\n\t\t\t\treturn config\n\t\t\t})\n\n\t\t\t// First destroy the tab's elements\n\t\t\tlet $elements = this.$container.find('.fld-element')\n\t\t\tfor (let i = 0; i < $elements.length; i++) {\n\t\t\t\t$elements.eq(i).data('fld-element').destroy()\n\t\t\t}\n\n\t\t\tthis.designer.tabGrid.removeItems(this.$container)\n\t\t\tthis.designer.tabDrag.removeItems(this.$container)\n\t\t\tthis.$container.remove()\n\n\t\t\tthis.base()\n\t\t},\n\t}, {})\n\nexport default DesignerTab\n","const ComplexFields = Garnish.Base.extend(\n\t{\n\t\tlibrary: null,\n\t\tsidebar: null,\n\t\tdesigner: null,\n\n\t\t/**\n\t\t * Constructor\n\t\t * @param {SidebarLibrary} library\n\t\t */\n\t\tinit: function (library) {\n\t\t\tthis.library = library\n\t\t\tthis.sidebar = this.library.sidebar\n\t\t\tthis.designer = this.sidebar.designer\n\n\t\t\t// Relation fields and block fields (Matrix, Neo) both expand into a nested sidebar\n\t\t\tthis.addListener(this.library.$container.find('.fld-element.complex-field'), 'click', (ev) => {\n\t\t\t\tif ($(ev.target).closest('.icon-holder').length === 0) return\n\n\t\t\t\tthis.expand($(ev.currentTarget))\n\t\t\t})\n\t\t},\n\n\t\t/**\n\t\t * Opens a nested sidebar with the fields an item expands into.\n\t\t * @param {JQuery} $item\n\t\t */\n\t\texpand: function ($item) {\n\t\t\tthis.library.$search.blur()\n\n\t\t\t// Close sidebars opened from this one (or deeper), so the new sidebar replaces them\n\t\t\tthis.designer.removeSidebarsAfter(this.sidebar)\n\n\t\t\tCraft.sendActionRequest('POST', 'dynex/exporters/complex-field', {\n\t\t\t\tdata: {\n\t\t\t\t\tcurrentNesting: this.designer.$container.data('nestingLevels'),\n\t\t\t\t\tconfig: JSON.stringify($item.data('config')),\n\t\t\t\t},\n\t\t\t})\n\t\t\t\t.then(({ data }) => this.addNestedSidebar(data.sidebarHtml))\n\t\t\t\t.catch(({ response }) => Craft.cp.displayError(response?.data?.message))\n\t\t},\n\n\t\t/**\n\t\t * @param {string} sidebarHtml\n\t\t */\n\t\taddNestedSidebar: function (sidebarHtml) {\n\t\t\tconst $sidebar = $(sidebarHtml)\n\n\t\t\tconst levels = this.designer.$container.data('nestingLevels') + 1\n\t\t\tthis.designer.$container.css('--nesting-levels', levels)\n\t\t\tthis.designer.$container.data('nestingLevels', levels)\n\n\t\t\tthis.sidebar.$container.after($sidebar)\n\t\t\tthis.designer.addSidebar($sidebar)\n\t\t\tthis.sidebar.$container.scrollTop(0)\n\n\t\t\tthis.designer.elementDrag.addItems($sidebar.find('.fld-element:not(.block-field)'))\n\t\t},\n\t},\n)\n\nexport default ComplexFields","const CustomFields = Garnish.Base.extend(\n\t{\n\t\tlibrary: null,\n\t\tsidebar: null,\n\t\tdesigner: null,\n\n\t\t/**\n\t\t * Constructor\n\t\t * @param {SidebarLibrary} library\n\t\t */\n\t\tinit: function (library) {\n\t\t\tthis.library = library\n\t\t\tthis.sidebar = this.library.sidebar\n\t\t\tthis.designer = this.sidebar.designer\n\n\t\t\tthis.addListener(this.library.$fields.filter('.unused'), 'click', (e) => this.addElement(e))\n\t\t\tthis.hideUsedLibraryElements()\n\t\t},\n\n\t\thideUsedLibraryElements: function () {\n\t\t\tconst $libraryElements = this.library.$fields.filter('.unused')\n\n\t\t\tthis.designer.$tabContainer.find('.fld-element.fld-field').each((i, el) => {\n\t\t\t\tthis.designer.hideLibraryElement(\n\t\t\t\t\t$libraryElements.filter((i, item) => item.dataset.handle === el.dataset.handle),\n\t\t\t\t)\n\t\t\t})\n\t\t},\n\n\t\t/**\n\t\t * Adds a new element from the sidebar to the currently active workspace tab when the\n\t\t * \"add-element\" button is clicked. Clones the element, appends it to the tab content,\n\t\t * initializes its layout behavior, and updates the UI accordingly.\n\t\t *\n\t\t * @function\n\t\t * @param {MouseEvent} event - The mouse event triggered by clicking a sidebar element.\n\t\t *\n\t\t * @returns {false|void} Returns false to prevent default click behavior if successful, otherwise void.\n\t\t */\n\t\taddElement: function (event) {\n\t\t\tif ($(event.target).closest('.add-element').length === 0) return\n\n\t\t\tconst $item = $(event.currentTarget)\n\t\t\tif ($item.hasClass('hidden') || $item.hasClass('block-field')) return\n\n\t\t\tconst $activePane = this.designer.$tabContainer.find('.fld-tab:visible').first()\n\n\t\t\tif (!$activePane.length) {\n\t\t\t\tconsole.warn('No visible tab pane found to drop the item into.')\n\t\t\t\treturn\n\t\t\t}\n\n\t\t\tconst currentTab = $activePane.data('fld-tab')\n\t\t\tif (!currentTab) {\n\t\t\t\tconsole.warn('Could not get tab instance for visible pane.')\n\t\t\t\treturn\n\t\t\t}\n\n\t\t\tconst $clonedItem = $item.clone().removeClass('unused hidden filtered')\n\t\t\t$clonedItem.appendTo($activePane.find('.fld-tabcontent'))\n\t\t\tthis.ensureVisible($clonedItem)\n\n\t\t\tthis.designer.hideLibraryElement($item)\n\n\t\t\tconst clonedItem = currentTab.initElement($clonedItem)\n\t\t\tthis.designer.elementDrag.addItems($clonedItem)\n\t\t\tclonedItem.updatePositionInConfig()\n\t\t\tthis.designer.tabGrid.refreshCols(true)\n\n\t\t\treturn false\n\t\t},\n\n\t\t/**\n\t\t * Utility to ensure an element is visibly displayed\n\t\t * @param {jQuery} $el\n\t\t */\n\t\tensureVisible: function ($el) {\n\t\t\tif ($el.css('visibility') === 'hidden') {\n\t\t\t\t$el.css('visibility', 'visible')\n\t\t\t}\n\t\t},\n\t},\n)\n\nexport default CustomFields","import ComplexFields from './ComplexFields.js'\nimport CustomFields from './CustomFields.js'\n\nconst SidebarLibrary = Garnish.Base.extend(\n\t{\n\t\t$container: null,\n\t\t$search: null,\n\t\t$clearSearchBtn: null,\n\t\t$fields: null,\n\t\t/** @type {DesignerSidebar} */\n\t\tsidebar: null,\n\n\t\t/**\n\t\t * Constructor\n\t\t *\n\t\t * @this {typeof SidebarLibrary}\n\t\t * @param {JQuery<HTMLElement>|HTMLElement|string} container CSS selector, HTML Element, or JQuery wrapper of the element\n\t\t * @param {DesignerSidebar} sidebar\n\t\t */\n\t\tinit: function (container, sidebar) {\n\t\t\tthis.$container = $(container)\n\t\t\tthis.sidebar = sidebar\n\t\t\tthis.$fields = this.$container.find('.fld-element')\n\t\t\tlet $fieldSearchContainer = this.$container.children('.search')\n\t\t\tif ($fieldSearchContainer.length === 0) return\n\n\t\t\tthis.$search = $fieldSearchContainer.children('input')\n\t\t\tthis.$clearSearchBtn = $fieldSearchContainer.children('.clear-btn')\n\t\t\tnew ComplexFields(this)\n\t\t\tnew CustomFields(this)\n\n\t\t\tthis.addListener(this.$search, 'input', () => {\n\t\t\t\tlet val = this.$search.val().toLowerCase().replace(/['\"]/g, '')\n\t\t\t\tif (!val) {\n\t\t\t\t\tthis.$container.find('.filtered').removeClass('filtered')\n\t\t\t\t\tthis.$clearSearchBtn.addClass('hidden')\n\t\t\t\t\treturn\n\t\t\t\t}\n\n\t\t\t\tthis.$clearSearchBtn.removeClass('hidden')\n\t\t\t\tlet $matches = this.$fields\n\t\t\t\t\t.filter(`[data-keywords*=\"${val}\"]`)\n\t\t\t\t\t.add(this.$container.children('.fld-element'))\n\t\t\t\t\t.removeClass('filtered')\n\t\t\t\tthis.$fields.not($matches).addClass('filtered')\n\t\t\t})\n\n\t\t\tthis.addListener(this.$search, 'keydown', (ev) => {\n\t\t\t\tswitch (ev.keyCode) {\n\t\t\t\t\tcase Garnish.ESC_KEY:\n\t\t\t\t\t\tthis.$search.val('').trigger('input')\n\t\t\t\t\t\tbreak\n\t\t\t\t\tcase Garnish.RETURN_KEY:\n\t\t\t\t\t\tev.preventDefault()\n\t\t\t\t\t\tbreak\n\t\t\t\t}\n\t\t\t})\n\n\t\t\tthis.addListener(this.$clearSearchBtn, 'click', () => {\n\t\t\t\tthis.$search.val('').trigger('input')\n\t\t\t})\n\t\t},\n\t})\n\nexport default SidebarLibrary","import SidebarLibrary from './SidebarLibrary.js'\n\nconst DesignerSidebar = Garnish.Base.extend({\n\t/** @type {JQuery} */\n\t$container: /** @type {any} */ (null),\n\t$libraryToggle: null,\n\t/** @type {SidebarLibrary?} */\n\tselectedLibrary: null,\n\t/** @type {SidebarLibrary[]} */\n\tlibraries: null,\n\t$libraryContainers: [],\n\tdesigner: null,\n\t_parentConfig: null,\n\t_config: null,\n\n\t/**\n\t * @param {typeof Designer} designer\n\t * @param {JQuery<HTMLElement>|HTMLElement|string} container CSS selector, HTML Element, or JQuery wrapper of the element\n\t */\n\tinit: function (designer, container) {\n\t\tthis.$container = $(container)\n\t\tthis.designer = designer\n\t\tthis.libraries = []\n\t\tthis.$libraryContainers = $.makeArray(this.$container.children('.fld-library'))\n\t\tfor (let [index, $libraryContainer] of this.$libraryContainers.entries()) {\n\t\t\tlet library = new SidebarLibrary($libraryContainer, this)\n\t\t\tif (index === 0) this.selectedLibrary = library\n\t\t\tthis.libraries.push(library)\n\t\t}\n\n\t\t// Nested sidebars have a close button (Escape closes the last one too)\n\t\tthis.addListener(this.$container.children('.sidebar-name-wrapper').find('.sidebar-close'), 'activate', () => {\n\t\t\tthis.designer.closeSidebar(this)\n\t\t})\n\n\t\tlet $libraryPicker = this.$container.children('.btngroup')\n\t\tnew Craft.Listbox($libraryPicker, {\n\t\t\tonChange: ($selectedOption) => {\n\t\t\t\tthis.selectedLibrary.$container.addClass('hidden')\n\t\t\t\tthis.selectedLibrary = this.getLibrary($selectedOption.data('library'))\n\t\t\t\tthis.selectedLibrary.$container\n\t\t\t\t\t.removeClass('hidden')\n\t\t\t},\n\t\t})\n\t},\n\n\tgetParentConfig: function () {\n\t\treturn this.$container.data('parentConfig')\n\t},\n\n\t/**\n\t * @param {string} handle\n\t * @return {SidebarLibrary}\n\t */\n\tgetLibrary: function (handle) {\n\t\treturn this.libraries.find(library => handle === library.$container.data('library'))\n\t}\n}, {})\n\nexport default DesignerSidebar","const ElementDrag = Garnish.Drag.extend({\n\tdraggingLibraryElement: false,\n\tdraggingField: false,\n\toriginalTab: null,\n\tdesigner: null,\n\t$insertion: null,\n\tshowingInsertion: false,\n\t$caboose: null,\n\n\tinit: function (designer, settings) {\n\t\tthis.designer = designer\n\t\tthis.base(this.findItems(), settings)\n\t},\n\n\tremoveCaboose: function () {\n\t\tthis.$items = this.$items.not(this.$caboose)\n\t\tthis.$caboose.remove()\n\t},\n\n\tswapDraggeeWithInsertion: function () {\n\t\tthis.$insertion.insertBefore(this.$draggee)\n\t\tthis.$draggee.detach()\n\t\tthis.$items = $().add(this.$items.not(this.$draggee).add(this.$insertion))\n\t\tthis.showingInsertion = true\n\t},\n\n\tswapInsertionWithDraggee: function () {\n\t\tthis.$insertion.replaceWith(this.$draggee)\n\t\tthis.$items = $().add(this.$items.not(this.$insertion).add(this.$draggee))\n\t\tthis.showingInsertion = false\n\t},\n\n\tsetMidpoints: function () {\n\t\tfor (let i = 0; i < this.$items.length; i++) {\n\t\t\tlet $item = $(this.$items[i])\n\t\t\tlet offset = $item.offset()\n\n\t\t\t// Skip library elements\n\t\t\tif ($item.hasClass('unused')) {\n\t\t\t\tcontinue\n\t\t\t}\n\n\t\t\t$item.data('midpoint', {\n\t\t\t\tleft: offset.left + $item.outerWidth() / 2, top: offset.top + $item.outerHeight() / 2,\n\t\t\t})\n\t\t}\n\t},\n\n\tgetClosestItem: function () {\n\t\tthis.getClosestItem._closestItem = null\n\t\tthis.getClosestItem._closestItemMouseDiff = null\n\n\t\tfor (this.getClosestItem._i = 0; this.getClosestItem._i < this.$items.length; this.getClosestItem._i++) {\n\t\t\tthis.getClosestItem._$item = $(this.$items[this.getClosestItem._i])\n\n\t\t\tthis.getClosestItem._midpoint = this.getClosestItem._$item.data('midpoint')\n\t\t\tif (!this.getClosestItem._midpoint) {\n\t\t\t\tcontinue\n\t\t\t}\n\n\t\t\tthis.getClosestItem._mouseDiff = Garnish.getDist(this.getClosestItem._midpoint.left, this.getClosestItem._midpoint.top, this.mouseX, this.mouseY)\n\n\t\t\tif (this.getClosestItem._closestItem === null || this.getClosestItem._mouseDiff < this.getClosestItem._closestItemMouseDiff) {\n\t\t\t\tthis.getClosestItem._closestItem = this.getClosestItem._$item[0]\n\t\t\t\tthis.getClosestItem._closestItemMouseDiff = this.getClosestItem._mouseDiff\n\t\t\t}\n\t\t}\n\n\t\treturn this.getClosestItem._closestItem\n\t},\n\n\tcheckForNewClosestItem: function () {\n\t\t// Is there a new closest item?\n\t\tthis.checkForNewClosestItem._closestItem = this.getClosestItem()\n\n\t\tif (this.checkForNewClosestItem._closestItem === this.$insertion[0]) {\n\t\t\treturn\n\t\t}\n\n\t\tif (this.showingInsertion && $.inArray(this.$insertion[0], this.$items) < $.inArray(this.checkForNewClosestItem._closestItem, this.$items) && $.inArray(this.checkForNewClosestItem._closestItem, this.$caboose) === -1) {\n\t\t\tthis.$insertion.insertAfter(this.checkForNewClosestItem._closestItem)\n\t\t} else {\n\t\t\tthis.$insertion.insertBefore(this.checkForNewClosestItem._closestItem)\n\t\t}\n\n\t\tthis.$items = $().add(this.$items.add(this.$insertion))\n\t\tthis.showingInsertion = true\n\t\tthis.designer.tabGrid.refreshCols(true)\n\t\tthis.setMidpoints()\n\t},\n\n\tfindItems: function () {\n\t\t// Return all of the used + unused fields\n\t\treturn this.designer.$tabContainer\n\t\t\t.find('.fld-element')\n\t\t\t.add(this.designer.selectedSidebar.$container.find('.fld-element:not(.block-field)'))\n\t},\n\n\t/**\n\t * @param {JQuery<HTMLElement>[]} items Elements that should be draggable.\n\t */\n\taddItems: function (items) {\n\t\titems = $.makeArray(items)\n\n\t\tfor (const item of items) {\n\t\t\tif ($.data(item, 'drag')) {\n\t\t\t\tconsole.warn('Element was added to more than one dragger')\n\t\t\t\t$.data(item, 'drag').removeItems(item)\n\t\t\t}\n\n\t\t\t$.data(item, 'drag', this)\n\n\t\t\t// Store the handler reference on the element\n\t\t\tconst handler = (ev) => {\n\t\t\t\tthis._handleMouseDown(ev, item)\n\t\t\t}\n\t\t\t$.data(item, 'mousedownHandler', handler)\n\n\t\t\tthis.addListener(this._getItemHandle(item), 'mousedown', handler)\n\t\t}\n\n\t\tthis.$items = this.$items.add(items)\n\t},\n\n\tonDragStart: function () {\n\t\tthis.base()\n\n\t\tthis.$insertion = this.createInsertion()\n\n\t\tthis.$caboose = this.createCaboose()\n\t\tthis.$items = $().add(this.$items.add(this.$caboose))\n\n\t\tGarnish.$bod.addClass('dragging')\n\n\t\tthis.draggingLibraryElement = this.$draggee.hasClass('unused')\n\t\tthis.draggingField = this.$draggee.hasClass('fld-field')\n\n\t\tif (!this.draggingLibraryElement) {\n\t\t\tthis.originalTab = this.$draggee.closest('.fld-tab').data('fld-tab')\n\t\t\tthis.swapDraggeeWithInsertion()\n\t\t} else {\n\t\t\tthis.originalTab = null\n\t\t}\n\n\t\tthis.setMidpoints()\n\t},\n\n\tonDrag: function () {\n\t\tif (this.isHoveringOverTab()) {\n\t\t\tthis.checkForNewClosestItem()\n\t\t} else if (this.showingInsertion) {\n\t\t\tthis.$insertion.remove()\n\t\t\tthis.$items = $().add(this.$items.not(this.$insertion))\n\t\t\tthis.showingInsertion = false\n\t\t\tthis.designer.tabGrid.refreshCols(true)\n\t\t\tthis.setMidpoints()\n\t\t}\n\n\t\tthis.base()\n\t},\n\n\tisHoveringOverTab: function () {\n\t\tfor (let i = 0; i < this.designer.tabGrid.$items.length; i++) {\n\t\t\tif (Garnish.hitTest(this.mouseX, this.mouseY, this.designer.tabGrid.$items.eq(i))) {\n\t\t\t\treturn true\n\t\t\t}\n\t\t}\n\n\t\treturn false\n\t},\n\n\tcreateCaboose: function () {\n\t\tlet $caboose = $()\n\t\tlet $fieldContainers = this.designer.$tabContainer.find('> .fld-tab > .fld-tabcontent')\n\n\t\tfor (let i = 0; i < $fieldContainers.length; i++) {\n\t\t\t$caboose = $caboose.add($('<div/>').appendTo($fieldContainers[i]))\n\t\t}\n\n\t\treturn $caboose\n\t},\n\n\tcreateInsertion: function () {\n\t\treturn $(`<div class=\"fld-element fld-insertion\" style=\"height: ${this.$draggee.outerHeight()}px;\"/>`)\n\t},\n\n\tonDragStop: function () {\n\t\tlet showingInsertion = this.showingInsertion\n\t\tif (showingInsertion) {\n\t\t\tif (this.draggingLibraryElement) {\n\t\t\t\t// Create a new element based on that one\n\t\t\t\tconst $element = this.$draggee.clone().removeClass('unused')\n\n\t\t\t\tif (this.draggingField) {\n\t\t\t\t\tthis.$draggee.css({ visibility: 'inherit' })\n\t\t\t\t\tthis.designer.hideLibraryElement(this.$draggee)\n\t\t\t\t}\n\n\t\t\t\t// Set this.$draggee to the clone, as if we were dragging that all along\n\t\t\t\tthis.$draggee = $element\n\n\t\t\t\t// Remember it for later\n\t\t\t\tthis.addItems($element)\n\t\t\t}\n\t\t} else if (!this.draggingLibraryElement) {\n\t\t\tconst $libraryElement = this.designer.findLibraryElement(this.$draggee.attr('data-handle'))\n\n\t\t\t// Destroy the original element (this also restores the library element)\n\t\t\tthis.$draggee.data('fld-element').destroy()\n\n\t\t\t// Set this.$draggee to the library element, as if we were dragging that all along\n\t\t\tthis.$draggee = $libraryElement\n\t\t}\n\n\t\tif (this.showingInsertion) {\n\t\t\tthis.swapInsertionWithDraggee()\n\t\t}\n\n\t\tthis.removeCaboose()\n\n\t\tthis.designer.tabGrid.refreshCols(true)\n\n\t\t// return the helpers to the draggees\n\t\tlet offset = this.$draggee.offset()\n\t\tif (!offset || (offset.top === 0 && offset.left === 0)) {\n\t\t\tthis.$draggee\n\t\t\t\t.css({\n\t\t\t\t\tdisplay: this.draggeeDisplay, visibility: 'visible', opacity: 0,\n\t\t\t\t})\n\t\t\t\t.velocity({ opacity: 1 }, Garnish.FX_DURATION)\n\t\t\tthis.helpers[0].velocity({ opacity: 0 }, Garnish.FX_DURATION, () => {\n\t\t\t\tthis._showDraggee()\n\t\t\t})\n\t\t} else {\n\t\t\tthis.returnHelpersToDraggees()\n\t\t}\n\n\t\tthis.base()\n\n\t\tGarnish.$bod.removeClass('dragging')\n\n\t\tthis.$draggee.css({\n\t\t\tdisplay: this.draggeeDisplay, visibility: this.draggingField || showingInsertion ? 'hidden' : 'visible',\n\t\t})\n\n\t\tif (showingInsertion) {\n\t\t\tconst tab = this.$draggee.closest('.fld-tab').data('fld-tab')\n\t\t\tlet element\n\n\t\t\tif (this.draggingLibraryElement) {\n\t\t\t\telement = tab.initElement(this.$draggee)\n\t\t\t} else {\n\t\t\t\telement = this.$draggee.data('fld-element')\n\n\t\t\t\t// New tab?\n\t\t\t\tif (tab !== this.originalTab) {\n\t\t\t\t\tconst config = element.config\n\n\t\t\t\t\tthis.originalTab.updateConfig((config) => {\n\t\t\t\t\t\tconst index = element.index\n\t\t\t\t\t\tif (index === -1) {\n\t\t\t\t\t\t\treturn false\n\t\t\t\t\t\t}\n\t\t\t\t\t\tconfig.elements.splice(index, 1)\n\t\t\t\t\t\treturn config\n\t\t\t\t\t})\n\n\t\t\t\t\tthis.$draggee.data('fld-element').tab = tab\n\t\t\t\t\telement.config = config\n\t\t\t\t}\n\t\t\t}\n\n\t\t\telement.updatePositionInConfig()\n\t\t}\n\t},\n})\nexport default ElementDrag","import DesignerTab from './DesignerTab.js'\nimport DesignerSidebar from './DesignerSidebar.js'\nimport ElementDrag from './ElementDrag.js'\n\n// Classes built with Garnish.Base.extend() are values, so JSDoc needs InstanceType<> to refer to their instances\n/** @typedef {InstanceType<typeof DesignerSidebar>} DesignerSidebarInstance */\n/** @typedef {InstanceType<typeof DesignerTab>} DesignerTabInstance */\n/** @typedef {InstanceType<typeof ElementDrag>} ElementDragInstance */\n\n/**\n * @typedef {object} LayoutTabConfig\n * @property {string} uid\n * @property {string} [name]\n * @property {Array<Record<string, any>>} elements\n */\n\n/**\n * The field layout config, kept in sync with the hidden `fieldLayout` input.\n * @typedef {object} LayoutConfig\n * @property {string} [uid]\n * @property {number} [id]\n * @property {LayoutTabConfig[]} tabs\n */\n\nconst Designer = Garnish.Base.extend(\n\t{\n\t\t// Every property is set in init(). Declaring the real type and casting the initial null\n\t\t// keeps TypeScript from inferring the type `null`.\n\t\t/** @type {JQuery} */\n\t\t$container: /** @type {any} */ (null),\n\t\t/** @type {JQuery} */\n\t\t$workspace: /** @type {any} */ (null),\n\t\t/** @type {JQuery} */\n\t\t$configInput: /** @type {any} */ (null),\n\t\t/** @type {JQuery} */\n\t\t$tabContainer: /** @type {any} */ (null),\n\t\t/** @type {DesignerSidebarInstance} */\n\t\tselectedSidebar: /** @type {any} */ (null),\n\t\t/** @type {DesignerSidebarInstance[]} */\n\t\t$sidebars: [],\n\n\t\t/** Craft.Grid, which isn’t typed. @type {any} */\n\t\ttabGrid: null,\n\t\t/** @type {ElementDragInstance} */\n\t\telementDrag: /** @type {any} */ (null),\n\n\t\t/** @type {LayoutConfig} */\n\t\t_config: /** @type {any} */ (null),\n\n\t\t/**\n\t\t * @param {string} container CSS selector for the designer container\n\t\t */\n\t\tinit: function (container) {\n\t\t\tthis.$container = $(container)\n\t\t\t// editexporter.js destroys the designer before rendering a new one\n\t\t\tthis.$container.data('designer', this)\n\n\t\t\tthis.$configInput = this.$container.children('input[data-config-input]')\n\t\t\tthis._config = JSON.parse(String(this.$configInput.val()))\n\t\t\tif (!this._config.tabs) {\n\t\t\t\tthis._config.tabs = []\n\t\t\t}\n\n\t\t\tthis.$workspace = this.$container.children('.fld-workspace')\n\t\t\tthis.$tabContainer = this.$workspace.children('.fld-tabs')\n\t\t\tthis.selectedSidebar = new DesignerSidebar(this, this.$container.find('.fld-sidebar'))\n\t\t\tthis.$sidebars = [this.selectedSidebar]\n\n\t\t\t// Set up the layout grids\n\t\t\tthis.tabGrid = new Craft.Grid(this.$tabContainer, {\n\t\t\t\titemSelector: '.fld-tab',\n\t\t\t\tminColWidth: 24 * 11,\n\t\t\t\tfillMode: 'grid',\n\t\t\t\tsnapToGrid: 24,\n\t\t\t})\n\n\t\t\t// `e` is a JQuery.TriggeredEvent, and `this` is the designer\n\t\t\tthis.addListener(window, 'keydown', e => {\n\t\t\t\tif (this.$container.data('nestingLevels') === 0) return\n\t\t\t\tif (e.key !== 'Escape') return\n\t\t\t\tif (e.target.closest('.fld-library .search')) return\n\n\t\t\t\tthis.removeSidebar()\n\t\t\t})\n\n\t\t\t// \"»\" buttons remove elements from the workspace without dragging\n\t\t\tthis.addListener(this.$workspace, 'click', e => {\n\t\t\t\tif ($(e.target).closest('.fld-element .remove-element').length === 0) return\n\n\t\t\t\tconst element = $(e.target).closest('.fld-element').data('fld-element')\n\t\t\t\tif (!element) return\n\n\t\t\t\telement.destroy()\n\t\t\t\tthis.tabGrid.refreshCols(true)\n\t\t\t})\n\n\t\t\tthis.initTab(this.$tabContainer.children())\n\t\t\tthis.elementDrag = new ElementDrag(this)\n\t\t},\n\n\t\t/**\n\t\t * @param {JQuery} $sidebar\n\t\t */\n\t\taddSidebar: function ($sidebar) {\n\t\t\tconst newSidebar = new DesignerSidebar(this, $sidebar)\n\t\t\tthis.$sidebars.push(newSidebar)\n\t\t\tthis.selectedSidebar = newSidebar\n\t\t},\n\n\t\tremoveSidebar: function () {\n\t\t\t// The root sidebar always stays\n\t\t\tif (this.$sidebars.length <= 1) return\n\n\t\t\tconst sidebar = /** @type {DesignerSidebarInstance} */ (this.$sidebars.pop())\n\t\t\tthis.elementDrag.removeItems(sidebar.$container.find('.fld-element'))\n\t\t\tsidebar.$container.remove()\n\t\t\tthis.selectedSidebar = this.$sidebars[this.$sidebars.length - 1]\n\n\t\t\tconst levels = this.$container.data('nestingLevels') - 1\n\t\t\tthis.$container.css('--nesting-levels', levels)\n\t\t\tthis.$container.data('nestingLevels', levels)\n\t\t},\n\n\t\t/**\n\t\t * Removes the sidebars nested deeper than the given one.\n\t\t * @param {DesignerSidebarInstance} sidebar\n\t\t */\n\t\tremoveSidebarsAfter: function (sidebar) {\n\t\t\tconst index = this.$sidebars.indexOf(sidebar)\n\t\t\tif (index === -1) return\n\n\t\t\twhile (this.$sidebars.length - 1 > index) {\n\t\t\t\tthis.removeSidebar()\n\t\t\t}\n\t\t},\n\n\t\t/**\n\t\t * Removes the designer's listeners, dragging and element settings slideouts, e.g. before it's re-rendered.\n\t\t */\n\t\tdestroy: function () {\n\t\t\tthis.$tabContainer.find('.fld-element').each((i, el) => {\n\t\t\t\tconst slideout = $(el).data('fld-element')?.slideout\n\t\t\t\tif (slideout) {\n\t\t\t\t\tslideout.destroy()\n\t\t\t\t}\n\t\t\t})\n\n\t\t\tthis.elementDrag.destroy()\n\t\t\tthis.$container.removeData('designer')\n\t\t\tthis.base()\n\t\t},\n\n\t\t/**\n\t\t * Closes a nested sidebar, along with the sidebars opened from it. The root sidebar stays.\n\t\t * @param {DesignerSidebarInstance} sidebar\n\t\t */\n\t\tcloseSidebar: function (sidebar) {\n\t\t\tconst index = this.$sidebars.indexOf(sidebar)\n\t\t\tif (index < 1) return\n\n\t\t\tthis.removeSidebarsAfter(this.$sidebars[index - 1])\n\t\t},\n\n\t\t/**\n\t\t * @param {JQuery} $tab\n\t\t * @returns {DesignerTabInstance}\n\t\t */\n\t\tinitTab: function ($tab) {\n\t\t\treturn new DesignerTab(this, $tab)\n\t\t},\n\n\t\t/**\n\t\t * Finds the library element for a handle across all open sidebars.\n\t\t * @param {string} handle\n\t\t * @returns {JQuery}\n\t\t */\n\t\tfindLibraryElement: function (handle) {\n\t\t\treturn this.$container\n\t\t\t\t.find('.fld-sidebar .fld-element.unused')\n\t\t\t\t.filter((i, el) => el.dataset.handle === String(handle))\n\t\t\t\t.first()\n\t\t},\n\n\t\t/**\n\t\t * Hides a library element once it's been placed in the workspace.\n\t\t * Complex fields stay visible, so they can still be expanded into nested sidebars.\n\t\t * @param {JQuery} $libraryElement\n\t\t */\n\t\thideLibraryElement: function ($libraryElement) {\n\t\t\tif (!$libraryElement.length || $libraryElement.hasClass('complex-field')) return\n\n\t\t\t$libraryElement.addClass('hidden')\n\n\t\t\tif ($libraryElement.siblings('.fld-element:not(.hidden)').length === 0) {\n\t\t\t\t$libraryElement.closest('.fld-field-group').addClass('hidden')\n\t\t\t}\n\t\t},\n\n\t\t/**\n\t\t * @param {string} handle\n\t\t */\n\t\tremoveFieldByHandle: function (handle) {\n\t\t\tthis.findLibraryElement(handle)\n\t\t\t\t.removeClass('hidden')\n\t\t\t\t.closest('.fld-field-group')\n\t\t\t\t.removeClass('hidden')\n\t\t},\n\n\t\t/**\n\t\t * @returns {LayoutConfig}\n\t\t */\n\t\tget config() {\n\t\t\treturn this._config\n\t\t},\n\n\t\t/**\n\t\t * @param {LayoutConfig} config\n\t\t */\n\t\tset config(config) {\n\t\t\tthis._config = config\n\t\t\tthis.$configInput.val(JSON.stringify(config))\n\t\t},\n\n\t\t/**\n\t\t * @param {(config: LayoutConfig) => LayoutConfig | false} callback Return `false` to leave the config unchanged.\n\t\t */\n\t\tupdateConfig: function (callback) {\n\t\t\tconst config = callback(this.config)\n\t\t\tif (config !== false) {\n\t\t\t\tthis.config = config\n\t\t\t}\n\t\t},\n\n\t\t/**\n\t\t * @param {string} contents\n\t\t * @param {string} [js]\n\t\t * @returns {any} A Craft.Slideout\n\t\t */\n\t\tcreateSlideout: function (contents, js) {\n\t\t\tconst $body = $('<div/>', { class: 'fld-element-settings-body' })\n\t\t\t$('<div/>', { class: 'fields', html: contents }).appendTo($body)\n\t\t\tconst $footer = $('<div/>', { class: 'fld-element-settings-footer' })\n\t\t\t$('<div/>', { class: 'flex-grow' }).appendTo($footer)\n\t\t\tconst $cancelBtn = Craft.ui\n\t\t\t\t.createButton({\n\t\t\t\t\tlabel: Craft.t('app', 'Close'), spinner: true,\n\t\t\t\t})\n\t\t\t\t.appendTo($footer)\n\t\t\tCraft.ui\n\t\t\t\t.createSubmitButton({\n\t\t\t\t\tclass: 'secondary', label: Craft.t('app', 'Apply'), spinner: true,\n\t\t\t\t})\n\t\t\t\t.appendTo($footer)\n\t\t\tconst $contents = $body.add($footer)\n\n\t\t\tconst slideout = new Craft.Slideout($contents, {\n\t\t\t\tcontainerElement: 'form', containerAttributes: {\n\t\t\t\t\taction: '', method: 'post', novalidate: '', class: 'fld-element-settings',\n\t\t\t\t},\n\t\t\t})\n\t\t\tslideout.on('open', () => {\n\t\t\t\t// Hold off a sec until it's positioned...\n\t\t\t\tGarnish.requestAnimationFrame(() => {\n\t\t\t\t\t// Focus on the first text input\n\t\t\t\t\tslideout.$container.find('.text:first').focus()\n\t\t\t\t})\n\t\t\t})\n\n\t\t\t$cancelBtn.on('click', () => {\n\t\t\t\tslideout.close()\n\t\t\t})\n\n\t\t\tif (js) {\n\t\t\t\teval(js)\n\t\t\t}\n\n\t\t\tCraft.initUiElements(slideout.$container)\n\n\t\t\treturn slideout\n\t\t},\n\t},\n)\n\nexport default Designer","import Designer from './ExporterLayout/Designer.js'\n\nCraft.ExporterLayoutDesigner = Designer\n"],"names":[],"mappings":"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"}