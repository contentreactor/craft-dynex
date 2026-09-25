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

				this.updateConfig((config) => {
					// A blank label falls back to the field's default label
					config.label = label || config.defaultLabel;
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

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHluZXguanMiLCJzb3VyY2VzIjpbImFzc2V0cy9DcC9zcmMvanMvRXhwb3J0ZXJMYXlvdXQvRGVzaWduZXJFbGVtZW50LmpzIiwiYXNzZXRzL0NwL3NyYy9qcy9FeHBvcnRlckxheW91dC9EZXNpZ25lclRhYi5qcyIsImFzc2V0cy9DcC9zcmMvanMvRXhwb3J0ZXJMYXlvdXQvQ29tcGxleEZpZWxkcy5qcyIsImFzc2V0cy9DcC9zcmMvanMvRXhwb3J0ZXJMYXlvdXQvQ3VzdG9tRmllbGRzLmpzIiwiYXNzZXRzL0NwL3NyYy9qcy9FeHBvcnRlckxheW91dC9TaWRlYmFyTGlicmFyeS5qcyIsImFzc2V0cy9DcC9zcmMvanMvRXhwb3J0ZXJMYXlvdXQvRGVzaWduZXJTaWRlYmFyLmpzIiwiYXNzZXRzL0NwL3NyYy9qcy9FeHBvcnRlckxheW91dC9FbGVtZW50RHJhZy5qcyIsImFzc2V0cy9DcC9zcmMvanMvRXhwb3J0ZXJMYXlvdXQvRGVzaWduZXIuanMiLCJhc3NldHMvQ3Avc3JjL2pzL2R5bmV4LmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IERlc2lnbmVyRWxlbWVudCA9IEdhcm5pc2guQmFzZS5leHRlbmQoXG5cdHtcblx0XHR0YWI6IG51bGwsXG5cdFx0JGNvbnRhaW5lcjogbnVsbCxcblx0XHQkc2V0dGluZ3NDb250YWluZXI6IG51bGwsXG5cdFx0JGVkaXRCdG46IG51bGwsXG5cblx0XHR1aWQ6IG51bGwsXG5cdFx0aXNGaWVsZDogZmFsc2UsXG5cdFx0YXR0cmlidXRlOiBudWxsLFxuXHRcdGhhc1NldHRpbmdzOiBmYWxzZSxcblx0XHRzZXR0aW5nc05hbWVzcGFjZTogbnVsbCxcblx0XHRzbGlkZW91dDogbnVsbCxcblxuXHRcdC8qKlxuXHRcdCAqIENvbnN0cnVjdG9yXG5cdFx0ICpcblx0XHQgKiBAdGhpcyB7dHlwZW9mIERlc2lnbmVyRWxlbWVudH1cblx0XHQgKiBAcGFyYW0ge0Rlc2lnbmVyVGFifSB0YWIgICAgRWxlbWVudHMgdGhhdCBzaG91bGQgYmUgZHJhZ2dhYmxlIHJpZ2h0IGF3YXkuIChDYW4gYmUgc2tpcHBlZC4pXG5cdFx0ICogQHBhcmFtIHtKUXVlcnk8SFRNTEVsZW1lbnQ+fEhUTUxFbGVtZW50fSAkY29udGFpbmVyIEFueSBzZXR0aW5ncyB0aGF0IHNob3VsZCBvdmVycmlkZSB0aGUgZGVmYXVsdHMuXG5cdFx0ICovXG5cdFx0aW5pdDogZnVuY3Rpb24gKHRhYiwgJGNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy50YWIgPSB0YWJcblx0XHRcdHRoaXMuJGNvbnRhaW5lciA9ICRjb250YWluZXJcblx0XHRcdHRoaXMuJGNvbnRhaW5lci5kYXRhKCdmbGQtZWxlbWVudCcsIHRoaXMpXG5cdFx0XHR0aGlzLnVpZCA9IHRoaXMuJGNvbnRhaW5lci5kYXRhKCd1aWQnKVxuXG5cdFx0XHRpZiAoIXRoaXMudWlkKSB7XG5cdFx0XHRcdHRoaXMudWlkID0gQ3JhZnQudXVpZCgpXG5cdFx0XHRcdHRoaXMuY29uZmlnID0gJC5leHRlbmQodGhpcy4kY29udGFpbmVyLmRhdGEoJ2NvbmZpZycpLCB7IHVpZDogdGhpcy51aWQgfSlcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5pc0ZpZWxkID0gdGhpcy4kY29udGFpbmVyLmhhc0NsYXNzKCdmbGQtZmllbGQnKVxuXG5cdFx0XHRpZiAodGhpcy5pc0ZpZWxkKSB7XG5cdFx0XHRcdHRoaXMuYXR0cmlidXRlID0gdGhpcy4kY29udGFpbmVyLmF0dHIoJ2RhdGEtaGFuZGxlJylcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zZXR0aW5nc05hbWVzcGFjZSA9IHRoaXMuJGNvbnRhaW5lclxuXHRcdFx0XHQuZGF0YSgnc2V0dGluZ3MtbmFtZXNwYWNlJylcblx0XHRcdFx0LnJlcGxhY2UoL1xcYkVMRU1FTlRfVUlEXFxiL2csIHRoaXMudWlkKVxuXHRcdFx0bGV0IHNldHRpbmdzSHRtbCA9ICh0aGlzLiRjb250YWluZXIuZGF0YSgnc2V0dGluZ3MtaHRtbCcpIHx8ICcnKS5yZXBsYWNlKC9cXGJFTEVNRU5UX1VJRFxcYi9nLCB0aGlzLnVpZClcblx0XHRcdHRoaXMuaGFzU2V0dGluZ3MgPSBzZXR0aW5nc0h0bWxcblxuXHRcdFx0aWYgKHRoaXMuaGFzU2V0dGluZ3MpIHtcblx0XHRcdFx0Ly8gY3JlYXRlIHRoZSBzZXR0aW5nIGNvbnRhaW5lclxuXHRcdFx0XHR0aGlzLiRzZXR0aW5nc0NvbnRhaW5lciA9ICQoJzxkaXYvPicsIHtcblx0XHRcdFx0XHRjbGFzczogJ2hpZGRlbicsXG5cdFx0XHRcdH0pXG5cblx0XHRcdFx0Ly8gY3JlYXRlIHRoZSBlZGl0IGJ1dHRvblxuXHRcdFx0XHR0aGlzLiRlZGl0QnRuID0gJCgnPGEvPicsIHtcblx0XHRcdFx0XHRyb2xlOiAnYnV0dG9uJywgdGFiaW5kZXg6IDAsIGNsYXNzOiAnc2V0dGluZ3MgaWNvbicsIHRpdGxlOiBDcmFmdC50KCdhcHAnLCAnRWRpdCcpLFxuXHRcdFx0XHR9KVxuXG5cdFx0XHRcdGNvbnN0IHNob3dTZXR0aW5ncyA9ICgpID0+IHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuc2xpZGVvdXQpIHtcblx0XHRcdFx0XHRcdHRoaXMuY3JlYXRlU2V0dGluZ3Moc2V0dGluZ3NIdG1sKVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNsaWRlb3V0Lm9wZW4oKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuJGVkaXRCdG4ub24oJ2NsaWNrJywgc2hvd1NldHRpbmdzKVxuXHRcdFx0XHR0aGlzLiRjb250YWluZXIub24oJ2RibGNsaWNrJywgc2hvd1NldHRpbmdzKVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmluaXRVaSgpXG5cblx0XHRcdC8vIGNsZWFudXBcblx0XHRcdHRoaXMuJGNvbnRhaW5lci5hdHRyKCdkYXRhLWtleXdvcmRzJywgbnVsbClcblx0XHRcdHRoaXMuJGNvbnRhaW5lci5hdHRyKCdkYXRhLXNldHRpbmdzLWh0bWwnLCBudWxsKVxuXHRcdH0sXG5cblx0XHRpbml0VWk6IGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmICh0aGlzLmhhc1NldHRpbmdzKSB7XG5cdFx0XHRcdHRoaXMuJGVkaXRCdG4uYXBwZW5kVG8odGhpcy4kY29udGFpbmVyKVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRjcmVhdGVTZXR0aW5nczogZnVuY3Rpb24gKHNldHRpbmdzSHRtbCkge1xuXHRcdFx0Y29uc3Qgc2V0dGluZ3NKcyA9ICh0aGlzLiRjb250YWluZXIuZGF0YSgnc2V0dGluZ3MtanMnKSB8fCAnJykucmVwbGFjZSgvXFxiRUxFTUVOVF9VSURcXGIvZywgdGhpcy51aWQpXG5cdFx0XHR0aGlzLnNsaWRlb3V0ID0gdGhpcy50YWIuZGVzaWduZXIuY3JlYXRlU2xpZGVvdXQoc2V0dGluZ3NIdG1sLCBzZXR0aW5nc0pzKVxuXG5cdFx0XHR0aGlzLnNsaWRlb3V0LiRjb250YWluZXIub24oJ3N1Ym1pdCcsIChldikgPT4ge1xuXHRcdFx0XHRldi5wcmV2ZW50RGVmYXVsdCgpXG5cdFx0XHRcdHRoaXMuYXBwbHlTZXR0aW5ncygpXG5cdFx0XHR9KVxuXG5cdFx0XHR0aGlzLnRyaWdnZXIoJ2NyZWF0ZVNldHRpbmdzJylcblx0XHR9LFxuXG5cdFx0YXBwbHlTZXR0aW5nczogZnVuY3Rpb24gKCkge1xuXHRcdFx0Ly8gVGhlIGxhYmVsIGlucHV0IGlzIG5hbWVzcGFjZWQsIGUuZy4gYGVsZW1lbnQtPHVpZD5bbGFiZWxdYFxuXHRcdFx0Y29uc3QgbGFiZWwgPSBTdHJpbmcodGhpcy5zbGlkZW91dC4kY29udGFpbmVyLmZpbmQoJ2lucHV0W25hbWUkPVwiW2xhYmVsXVwiXSwgaW5wdXRbbmFtZT1cImxhYmVsXCJdJykudmFsKCkgPz8gJycpLnRyaW0oKVxuXG5cdFx0XHR0aGlzLnVwZGF0ZUNvbmZpZygoY29uZmlnKSA9PiB7XG5cdFx0XHRcdC8vIEEgYmxhbmsgbGFiZWwgZmFsbHMgYmFjayB0byB0aGUgZmllbGQncyBkZWZhdWx0IGxhYmVsXG5cdFx0XHRcdGNvbmZpZy5sYWJlbCA9IGxhYmVsIHx8IGNvbmZpZy5kZWZhdWx0TGFiZWxcblx0XHRcdFx0cmV0dXJuIGNvbmZpZ1xuXHRcdFx0fSlcblxuXHRcdFx0dGhpcy4kY29udGFpbmVyXG5cdFx0XHRcdC5maW5kKCcuZmxkLWVsZW1lbnQtbGFiZWwgaDQnKVxuXHRcdFx0XHQudGV4dCh0aGlzLmNvbmZpZy5sYWJlbClcblx0XHRcdFx0LmF0dHIoJ3RpdGxlJywgdGhpcy5jb25maWcubGFiZWwpXG5cblx0XHRcdHRoaXMuc2xpZGVvdXQuY2xvc2UoKVxuXHRcdH0sXG5cblx0XHRnZXQgaW5kZXgoKSB7XG5cdFx0XHRjb25zdCB0YWJDb25maWcgPSB0aGlzLnRhYi5jb25maWdcblx0XHRcdGlmICh0eXBlb2YgdGFiQ29uZmlnID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRyZXR1cm4gLTFcblx0XHRcdH1cblx0XHRcdHJldHVybiB0YWJDb25maWcuZWxlbWVudHMuZmluZEluZGV4KChjKSA9PiBjLnVpZCA9PT0gdGhpcy51aWQpXG5cdFx0fSxcblxuXHRcdGdldCBjb25maWcoKSB7XG5cdFx0XHRpZiAoIXRoaXMudWlkKSB7XG5cdFx0XHRcdHRocm93ICdUYWIgaXMgbWlzc2luZyBpdHMgVUlEJ1xuXHRcdFx0fVxuXHRcdFx0bGV0IGNvbmZpZyA9IHRoaXMudGFiLmNvbmZpZy5lbGVtZW50cy5maW5kKChjKSA9PiBjLnVpZCA9PT0gdGhpcy51aWQpXG5cdFx0XHRpZiAoIWNvbmZpZykge1xuXHRcdFx0XHRjb25maWcgPSB7XG5cdFx0XHRcdFx0dWlkOiB0aGlzLnVpZCxcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmNvbmZpZyA9IGNvbmZpZ1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNvbmZpZ1xuXHRcdH0sXG5cblx0XHRzZXQgY29uZmlnKGNvbmZpZykge1xuXHRcdFx0Y29uc3QgdGFiQ29uZmlnID0gdGhpcy50YWIuY29uZmlnXG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuaW5kZXhcblx0XHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0dGFiQ29uZmlnLmVsZW1lbnRzW2luZGV4XSA9IGNvbmZpZ1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbmV3SW5kZXggPSAkLmluQXJyYXkodGhpcy4kY29udGFpbmVyWzBdLCB0aGlzLiRjb250YWluZXIucGFyZW50KCkuY2hpbGRyZW4oJy5mbGQtZWxlbWVudCcpKVxuXHRcdFx0XHR0YWJDb25maWcuZWxlbWVudHMuc3BsaWNlKG5ld0luZGV4LCAwLCBjb25maWcpXG5cdFx0XHR9XG5cdFx0XHR0aGlzLnRhYi5jb25maWcgPSB0YWJDb25maWdcblx0XHR9LFxuXG5cdFx0dXBkYXRlQ29uZmlnOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IGNhbGxiYWNrKHRoaXMuY29uZmlnKVxuXHRcdFx0aWYgKGNvbmZpZyAhPT0gZmFsc2UpIHtcblx0XHRcdFx0dGhpcy5jb25maWcgPSBjb25maWdcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0dXBkYXRlUG9zaXRpb25JbkNvbmZpZzogZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50YWIudXBkYXRlQ29uZmlnKChjb25maWcpID0+IHtcblx0XHRcdFx0Y29uc3QgZWxlbWVudENvbmZpZyA9IHRoaXMuY29uZmlnXG5cdFx0XHRcdGNvbnN0IG9sZEluZGV4ID0gdGhpcy5pbmRleFxuXHRcdFx0XHRjb25zdCBuZXdJbmRleCA9ICQuaW5BcnJheSh0aGlzLiRjb250YWluZXJbMF0sIHRoaXMuJGNvbnRhaW5lci5wYXJlbnQoKS5jaGlsZHJlbignLmZsZC1lbGVtZW50JykpXG5cdFx0XHRcdGlmIChvbGRJbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHRjb25maWcuZWxlbWVudHMuc3BsaWNlKG9sZEluZGV4LCAxKVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbmZpZy5lbGVtZW50cy5zcGxpY2UobmV3SW5kZXgsIDAsIGVsZW1lbnRDb25maWcpXG5cdFx0XHRcdHJldHVybiBjb25maWdcblx0XHRcdH0pXG5cdFx0fSxcblxuXHRcdGRlc3Ryb3k6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGFiLnVwZGF0ZUNvbmZpZygoY29uZmlnKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5pbmRleFxuXHRcdFx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlXG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uZmlnLmVsZW1lbnRzLnNwbGljZShpbmRleCwgMSlcblx0XHRcdFx0cmV0dXJuIGNvbmZpZ1xuXHRcdFx0fSlcblxuXHRcdFx0dGhpcy50YWIuZGVzaWduZXIuZWxlbWVudERyYWcucmVtb3ZlSXRlbXModGhpcy4kY29udGFpbmVyKVxuXHRcdFx0dGhpcy4kY29udGFpbmVyLnJlbW92ZSgpXG5cblx0XHRcdGlmICh0aGlzLnNsaWRlb3V0KSB7XG5cdFx0XHRcdHRoaXMuc2xpZGVvdXQuZGVzdHJveSgpXG5cdFx0XHRcdHRoaXMuc2xpZGVvdXQgPSBudWxsXG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmlzRmllbGQpIHtcblx0XHRcdFx0dGhpcy50YWIuZGVzaWduZXIucmVtb3ZlRmllbGRCeUhhbmRsZSh0aGlzLmF0dHJpYnV0ZSlcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5iYXNlKClcblx0XHR9LFxuXHR9LFxuXHR7fSxcbilcblxuZXhwb3J0IGRlZmF1bHQgRGVzaWduZXJFbGVtZW50IiwiaW1wb3J0IERlc2lnbmVyRWxlbWVudCBmcm9tICcuL0Rlc2lnbmVyRWxlbWVudC5qcydcblxuY29uc3QgRGVzaWduZXJUYWIgPSBHYXJuaXNoLkJhc2UuZXh0ZW5kKFxuXHR7XG5cdFx0ZGVzaWduZXI6IG51bGwsXG5cdFx0dWlkOiBudWxsLFxuXHRcdCRjb250YWluZXI6IG51bGwsXG5cdFx0ZGVzdHJveWVkOiBmYWxzZSxcblxuXHRcdGluaXQ6IGZ1bmN0aW9uIChkZXNpZ25lciwgJGNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5kZXNpZ25lciA9IGRlc2lnbmVyXG5cdFx0XHR0aGlzLiRjb250YWluZXIgPSAkY29udGFpbmVyXG5cdFx0XHR0aGlzLiRjb250YWluZXIuZGF0YSgnZmxkLXRhYicsIHRoaXMpXG5cdFx0XHR0aGlzLnVpZCA9IHRoaXMuJGNvbnRhaW5lci5kYXRhKCd1aWQnKVxuXG5cdFx0XHQvLyBOZXcgdGFiP1xuXHRcdFx0aWYgKCF0aGlzLnVpZCkge1xuXHRcdFx0XHR0aGlzLnVpZCA9IENyYWZ0LnV1aWQoKVxuXHRcdFx0XHR0aGlzLmNvbmZpZyA9IHtcblx0XHRcdFx0XHR1aWQ6IHRoaXMudWlkLFxuXHRcdFx0XHRcdG5hbWU6IHRoaXMuJGNvbnRhaW5lci5maW5kKCcudGFicyAudGFiIHNwYW4nKS50ZXh0KCksXG5cdFx0XHRcdFx0ZWxlbWVudHM6IFtdLFxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuJGNvbnRhaW5lci5kYXRhKCdzZXR0aW5ncy1uYW1lc3BhY2UnLCB0aGlzLmRlc2lnbmVyLiRjb250YWluZXJcblx0XHRcdFx0XHQuZGF0YSgnbmV3LXRhYi1zZXR0aW5ncy1uYW1lc3BhY2UnKVxuXHRcdFx0XHRcdC5yZXBsYWNlKC9cXGJUQUJfVUlEXFxiL2csIHRoaXMudWlkKSlcblxuXHRcdFx0XHR0aGlzLiRjb250YWluZXIuZGF0YSgnc2V0dGluZ3MtaHRtbCcsIHRoaXMuZGVzaWduZXIuJGNvbnRhaW5lclxuXHRcdFx0XHRcdC5kYXRhKCduZXctdGFiLXNldHRpbmdzLWh0bWwnKVxuXHRcdFx0XHRcdC5yZXBsYWNlKC9cXGJUQUJfVUlEXFxiL2csIHRoaXMudWlkKVxuXHRcdFx0XHRcdC5yZXBsYWNlKC9cXGJUQUJfTkFNRVxcYi9nLCB0aGlzLmNvbmZpZy5uYW1lKSlcblxuXHRcdFx0XHR0aGlzLiRjb250YWluZXIuZGF0YSgnc2V0dGluZ3MtanMnLCB0aGlzLmRlc2lnbmVyLiRjb250YWluZXJcblx0XHRcdFx0XHQuZGF0YSgnbmV3LXRhYi1zZXR0aW5ncy1qcycpXG5cdFx0XHRcdFx0LnJlcGxhY2UoL1xcYlRBQl9VSURcXGIvZywgdGhpcy51aWQpKVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBpbml0aWFsaXplIHRoZSBlbGVtZW50c1xuXHRcdFx0Y29uc3QgJGVsZW1lbnRzID0gdGhpcy4kY29udGFpbmVyLmNoaWxkcmVuKCcuZmxkLXRhYmNvbnRlbnQnKS5jaGlsZHJlbigpXG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgJGVsZW1lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHRoaXMuaW5pdEVsZW1lbnQoJCgkZWxlbWVudHNbaV0pKVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRpbml0RWxlbWVudDogZnVuY3Rpb24gKCRlbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gbmV3IERlc2lnbmVyRWxlbWVudCh0aGlzLCAkZWxlbWVudClcblx0XHR9LFxuXG5cdFx0Z2V0IGluZGV4KCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVzaWduZXIuY29uZmlnLnRhYnMuZmluZEluZGV4KChjKSA9PiBjLnVpZCA9PT0gdGhpcy51aWQpXG5cdFx0fSxcblxuXHRcdGdldCBjb25maWcoKSB7XG5cdFx0XHRpZiAoIXRoaXMudWlkKSB7XG5cdFx0XHRcdHRocm93ICdUYWIgaXMgbWlzc2luZyBpdHMgVUlEJ1xuXHRcdFx0fVxuXHRcdFx0bGV0IGNvbmZpZyA9IHRoaXMuZGVzaWduZXIuY29uZmlnLnRhYnMuZmluZCgoYykgPT4gYy51aWQgPT09IHRoaXMudWlkKVxuXHRcdFx0aWYgKCFjb25maWcpIHtcblx0XHRcdFx0Y29uZmlnID0ge1xuXHRcdFx0XHRcdHVpZDogdGhpcy51aWQsIGVsZW1lbnRzOiBbXSxcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmNvbmZpZyA9IGNvbmZpZ1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNvbmZpZ1xuXHRcdH0sXG5cblx0XHRzZXQgY29uZmlnKGNvbmZpZykge1xuXHRcdFx0aWYgKHRoaXMuZGVzdHJveWVkKSB7XG5cdFx0XHRcdHJldHVyblxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJcyB0aGUgbmFtZSBjaGFuZ2luZz9cblx0XHRcdGlmIChjb25maWcubmFtZSAmJiBjb25maWcubmFtZSAhPT0gdGhpcy5jb25maWcubmFtZSkge1xuXHRcdFx0XHR0aGlzLiRjb250YWluZXIuZmluZCgnLnRhYnMgLnRhYiBzcGFuJykudGV4dChjb25maWcubmFtZSlcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGVzaWduZXJDb25maWcgPSB0aGlzLmRlc2lnbmVyLmNvbmZpZ1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLmluZGV4XG5cdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdGRlc2lnbmVyQ29uZmlnLnRhYnNbaW5kZXhdID0gY29uZmlnXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBuZXdJbmRleCA9ICQuaW5BcnJheSh0aGlzLiRjb250YWluZXJbMF0sIHRoaXMuJGNvbnRhaW5lci5wYXJlbnQoKS5jaGlsZHJlbignLmZsZC10YWInKSlcblx0XHRcdFx0ZGVzaWduZXJDb25maWcudGFicy5zcGxpY2UobmV3SW5kZXgsIDAsIGNvbmZpZylcblx0XHRcdH1cblx0XHRcdHRoaXMuZGVzaWduZXIuY29uZmlnID0gZGVzaWduZXJDb25maWdcblx0XHR9LFxuXG5cdFx0dXBkYXRlQ29uZmlnOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcblx0XHRcdGlmICh0aGlzLmRlc3Ryb3llZCkge1xuXHRcdFx0XHRyZXR1cm5cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29uZmlnID0gY2FsbGJhY2sodGhpcy5jb25maWcpXG5cdFx0XHRpZiAoY29uZmlnICE9PSBmYWxzZSkge1xuXHRcdFx0XHR0aGlzLmNvbmZpZyA9IGNvbmZpZ1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRkZXN0cm95OiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRpZiAodGhpcy5kZXN0cm95ZWQpIHtcblx0XHRcdFx0cmV0dXJuXG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZGVzdHJveWVkID0gdHJ1ZVxuXG5cdFx0XHR0aGlzLmRlc2lnbmVyLnVwZGF0ZUNvbmZpZygoY29uZmlnKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5pbmRleFxuXHRcdFx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlXG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uZmlnLnRhYnMuc3BsaWNlKGluZGV4LCAxKVxuXHRcdFx0XHRyZXR1cm4gY29uZmlnXG5cdFx0XHR9KVxuXG5cdFx0XHQvLyBGaXJzdCBkZXN0cm95IHRoZSB0YWIncyBlbGVtZW50c1xuXHRcdFx0bGV0ICRlbGVtZW50cyA9IHRoaXMuJGNvbnRhaW5lci5maW5kKCcuZmxkLWVsZW1lbnQnKVxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAkZWxlbWVudHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0JGVsZW1lbnRzLmVxKGkpLmRhdGEoJ2ZsZC1lbGVtZW50JykuZGVzdHJveSgpXG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZGVzaWduZXIudGFiR3JpZC5yZW1vdmVJdGVtcyh0aGlzLiRjb250YWluZXIpXG5cdFx0XHR0aGlzLmRlc2lnbmVyLnRhYkRyYWcucmVtb3ZlSXRlbXModGhpcy4kY29udGFpbmVyKVxuXHRcdFx0dGhpcy4kY29udGFpbmVyLnJlbW92ZSgpXG5cblx0XHRcdHRoaXMuYmFzZSgpXG5cdFx0fSxcblx0fSwge30pXG5cbmV4cG9ydCBkZWZhdWx0IERlc2lnbmVyVGFiXG4iLCJjb25zdCBDb21wbGV4RmllbGRzID0gR2FybmlzaC5CYXNlLmV4dGVuZChcblx0e1xuXHRcdGxpYnJhcnk6IG51bGwsXG5cdFx0c2lkZWJhcjogbnVsbCxcblx0XHRkZXNpZ25lcjogbnVsbCxcblxuXHRcdC8qKlxuXHRcdCAqIENvbnN0cnVjdG9yXG5cdFx0ICogQHBhcmFtIHtTaWRlYmFyTGlicmFyeX0gbGlicmFyeVxuXHRcdCAqL1xuXHRcdGluaXQ6IGZ1bmN0aW9uIChsaWJyYXJ5KSB7XG5cdFx0XHR0aGlzLmxpYnJhcnkgPSBsaWJyYXJ5XG5cdFx0XHR0aGlzLnNpZGViYXIgPSB0aGlzLmxpYnJhcnkuc2lkZWJhclxuXHRcdFx0dGhpcy5kZXNpZ25lciA9IHRoaXMuc2lkZWJhci5kZXNpZ25lclxuXG5cdFx0XHQvLyBSZWxhdGlvbiBmaWVsZHMgYW5kIGJsb2NrIGZpZWxkcyAoTWF0cml4LCBOZW8pIGJvdGggZXhwYW5kIGludG8gYSBuZXN0ZWQgc2lkZWJhclxuXHRcdFx0dGhpcy5hZGRMaXN0ZW5lcih0aGlzLmxpYnJhcnkuJGNvbnRhaW5lci5maW5kKCcuZmxkLWVsZW1lbnQuY29tcGxleC1maWVsZCcpLCAnY2xpY2snLCAoZXYpID0+IHtcblx0XHRcdFx0aWYgKCQoZXYudGFyZ2V0KS5jbG9zZXN0KCcuaWNvbi1ob2xkZXInKS5sZW5ndGggPT09IDApIHJldHVyblxuXG5cdFx0XHRcdHRoaXMuZXhwYW5kKCQoZXYuY3VycmVudFRhcmdldCkpXG5cdFx0XHR9KVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBPcGVucyBhIG5lc3RlZCBzaWRlYmFyIHdpdGggdGhlIGZpZWxkcyBhbiBpdGVtIGV4cGFuZHMgaW50by5cblx0XHQgKiBAcGFyYW0ge0pRdWVyeX0gJGl0ZW1cblx0XHQgKi9cblx0XHRleHBhbmQ6IGZ1bmN0aW9uICgkaXRlbSkge1xuXHRcdFx0dGhpcy5saWJyYXJ5LiRzZWFyY2guYmx1cigpXG5cblx0XHRcdC8vIENsb3NlIHNpZGViYXJzIG9wZW5lZCBmcm9tIHRoaXMgb25lIChvciBkZWVwZXIpLCBzbyB0aGUgbmV3IHNpZGViYXIgcmVwbGFjZXMgdGhlbVxuXHRcdFx0dGhpcy5kZXNpZ25lci5yZW1vdmVTaWRlYmFyc0FmdGVyKHRoaXMuc2lkZWJhcilcblxuXHRcdFx0Q3JhZnQuc2VuZEFjdGlvblJlcXVlc3QoJ1BPU1QnLCAnZHluZXgvZXhwb3J0ZXJzL2NvbXBsZXgtZmllbGQnLCB7XG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRjdXJyZW50TmVzdGluZzogdGhpcy5kZXNpZ25lci4kY29udGFpbmVyLmRhdGEoJ25lc3RpbmdMZXZlbHMnKSxcblx0XHRcdFx0XHRjb25maWc6IEpTT04uc3RyaW5naWZ5KCRpdGVtLmRhdGEoJ2NvbmZpZycpKSxcblx0XHRcdFx0fSxcblx0XHRcdH0pXG5cdFx0XHRcdC50aGVuKCh7IGRhdGEgfSkgPT4gdGhpcy5hZGROZXN0ZWRTaWRlYmFyKGRhdGEuc2lkZWJhckh0bWwpKVxuXHRcdFx0XHQuY2F0Y2goKHsgcmVzcG9uc2UgfSkgPT4gQ3JhZnQuY3AuZGlzcGxheUVycm9yKHJlc3BvbnNlPy5kYXRhPy5tZXNzYWdlKSlcblx0XHR9LFxuXG5cdFx0LyoqXG5cdFx0ICogQHBhcmFtIHtzdHJpbmd9IHNpZGViYXJIdG1sXG5cdFx0ICovXG5cdFx0YWRkTmVzdGVkU2lkZWJhcjogZnVuY3Rpb24gKHNpZGViYXJIdG1sKSB7XG5cdFx0XHRjb25zdCAkc2lkZWJhciA9ICQoc2lkZWJhckh0bWwpXG5cblx0XHRcdGNvbnN0IGxldmVscyA9IHRoaXMuZGVzaWduZXIuJGNvbnRhaW5lci5kYXRhKCduZXN0aW5nTGV2ZWxzJykgKyAxXG5cdFx0XHR0aGlzLmRlc2lnbmVyLiRjb250YWluZXIuY3NzKCctLW5lc3RpbmctbGV2ZWxzJywgbGV2ZWxzKVxuXHRcdFx0dGhpcy5kZXNpZ25lci4kY29udGFpbmVyLmRhdGEoJ25lc3RpbmdMZXZlbHMnLCBsZXZlbHMpXG5cblx0XHRcdHRoaXMuc2lkZWJhci4kY29udGFpbmVyLmFmdGVyKCRzaWRlYmFyKVxuXHRcdFx0dGhpcy5kZXNpZ25lci5hZGRTaWRlYmFyKCRzaWRlYmFyKVxuXHRcdFx0dGhpcy5zaWRlYmFyLiRjb250YWluZXIuc2Nyb2xsVG9wKDApXG5cblx0XHRcdHRoaXMuZGVzaWduZXIuZWxlbWVudERyYWcuYWRkSXRlbXMoJHNpZGViYXIuZmluZCgnLmZsZC1lbGVtZW50Om5vdCguYmxvY2stZmllbGQpJykpXG5cdFx0fSxcblx0fSxcbilcblxuZXhwb3J0IGRlZmF1bHQgQ29tcGxleEZpZWxkcyIsImNvbnN0IEN1c3RvbUZpZWxkcyA9IEdhcm5pc2guQmFzZS5leHRlbmQoXG5cdHtcblx0XHRsaWJyYXJ5OiBudWxsLFxuXHRcdHNpZGViYXI6IG51bGwsXG5cdFx0ZGVzaWduZXI6IG51bGwsXG5cblx0XHQvKipcblx0XHQgKiBDb25zdHJ1Y3RvclxuXHRcdCAqIEBwYXJhbSB7U2lkZWJhckxpYnJhcnl9IGxpYnJhcnlcblx0XHQgKi9cblx0XHRpbml0OiBmdW5jdGlvbiAobGlicmFyeSkge1xuXHRcdFx0dGhpcy5saWJyYXJ5ID0gbGlicmFyeVxuXHRcdFx0dGhpcy5zaWRlYmFyID0gdGhpcy5saWJyYXJ5LnNpZGViYXJcblx0XHRcdHRoaXMuZGVzaWduZXIgPSB0aGlzLnNpZGViYXIuZGVzaWduZXJcblxuXHRcdFx0dGhpcy5hZGRMaXN0ZW5lcih0aGlzLmxpYnJhcnkuJGZpZWxkcy5maWx0ZXIoJy51bnVzZWQnKSwgJ2NsaWNrJywgKGUpID0+IHRoaXMuYWRkRWxlbWVudChlKSlcblx0XHRcdHRoaXMuaGlkZVVzZWRMaWJyYXJ5RWxlbWVudHMoKVxuXHRcdH0sXG5cblx0XHRoaWRlVXNlZExpYnJhcnlFbGVtZW50czogZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgJGxpYnJhcnlFbGVtZW50cyA9IHRoaXMubGlicmFyeS4kZmllbGRzLmZpbHRlcignLnVudXNlZCcpXG5cblx0XHRcdHRoaXMuZGVzaWduZXIuJHRhYkNvbnRhaW5lci5maW5kKCcuZmxkLWVsZW1lbnQuZmxkLWZpZWxkJykuZWFjaCgoaSwgZWwpID0+IHtcblx0XHRcdFx0dGhpcy5kZXNpZ25lci5oaWRlTGlicmFyeUVsZW1lbnQoXG5cdFx0XHRcdFx0JGxpYnJhcnlFbGVtZW50cy5maWx0ZXIoKGksIGl0ZW0pID0+IGl0ZW0uZGF0YXNldC5oYW5kbGUgPT09IGVsLmRhdGFzZXQuaGFuZGxlKSxcblx0XHRcdFx0KVxuXHRcdFx0fSlcblx0XHR9LFxuXG5cdFx0LyoqXG5cdFx0ICogQWRkcyBhIG5ldyBlbGVtZW50IGZyb20gdGhlIHNpZGViYXIgdG8gdGhlIGN1cnJlbnRseSBhY3RpdmUgd29ya3NwYWNlIHRhYiB3aGVuIHRoZVxuXHRcdCAqIFwiYWRkLWVsZW1lbnRcIiBidXR0b24gaXMgY2xpY2tlZC4gQ2xvbmVzIHRoZSBlbGVtZW50LCBhcHBlbmRzIGl0IHRvIHRoZSB0YWIgY29udGVudCxcblx0XHQgKiBpbml0aWFsaXplcyBpdHMgbGF5b3V0IGJlaGF2aW9yLCBhbmQgdXBkYXRlcyB0aGUgVUkgYWNjb3JkaW5nbHkuXG5cdFx0ICpcblx0XHQgKiBAZnVuY3Rpb25cblx0XHQgKiBAcGFyYW0ge01vdXNlRXZlbnR9IGV2ZW50IC0gVGhlIG1vdXNlIGV2ZW50IHRyaWdnZXJlZCBieSBjbGlja2luZyBhIHNpZGViYXIgZWxlbWVudC5cblx0XHQgKlxuXHRcdCAqIEByZXR1cm5zIHtmYWxzZXx2b2lkfSBSZXR1cm5zIGZhbHNlIHRvIHByZXZlbnQgZGVmYXVsdCBjbGljayBiZWhhdmlvciBpZiBzdWNjZXNzZnVsLCBvdGhlcndpc2Ugdm9pZC5cblx0XHQgKi9cblx0XHRhZGRFbGVtZW50OiBmdW5jdGlvbiAoZXZlbnQpIHtcblx0XHRcdGlmICgkKGV2ZW50LnRhcmdldCkuY2xvc2VzdCgnLmFkZC1lbGVtZW50JykubGVuZ3RoID09PSAwKSByZXR1cm5cblxuXHRcdFx0Y29uc3QgJGl0ZW0gPSAkKGV2ZW50LmN1cnJlbnRUYXJnZXQpXG5cdFx0XHRpZiAoJGl0ZW0uaGFzQ2xhc3MoJ2hpZGRlbicpIHx8ICRpdGVtLmhhc0NsYXNzKCdibG9jay1maWVsZCcpKSByZXR1cm5cblxuXHRcdFx0Y29uc3QgJGFjdGl2ZVBhbmUgPSB0aGlzLmRlc2lnbmVyLiR0YWJDb250YWluZXIuZmluZCgnLmZsZC10YWI6dmlzaWJsZScpLmZpcnN0KClcblxuXHRcdFx0aWYgKCEkYWN0aXZlUGFuZS5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKCdObyB2aXNpYmxlIHRhYiBwYW5lIGZvdW5kIHRvIGRyb3AgdGhlIGl0ZW0gaW50by4nKVxuXHRcdFx0XHRyZXR1cm5cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY3VycmVudFRhYiA9ICRhY3RpdmVQYW5lLmRhdGEoJ2ZsZC10YWInKVxuXHRcdFx0aWYgKCFjdXJyZW50VGFiKSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybignQ291bGQgbm90IGdldCB0YWIgaW5zdGFuY2UgZm9yIHZpc2libGUgcGFuZS4nKVxuXHRcdFx0XHRyZXR1cm5cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgJGNsb25lZEl0ZW0gPSAkaXRlbS5jbG9uZSgpLnJlbW92ZUNsYXNzKCd1bnVzZWQgaGlkZGVuIGZpbHRlcmVkJylcblx0XHRcdCRjbG9uZWRJdGVtLmFwcGVuZFRvKCRhY3RpdmVQYW5lLmZpbmQoJy5mbGQtdGFiY29udGVudCcpKVxuXHRcdFx0dGhpcy5lbnN1cmVWaXNpYmxlKCRjbG9uZWRJdGVtKVxuXG5cdFx0XHR0aGlzLmRlc2lnbmVyLmhpZGVMaWJyYXJ5RWxlbWVudCgkaXRlbSlcblxuXHRcdFx0Y29uc3QgY2xvbmVkSXRlbSA9IGN1cnJlbnRUYWIuaW5pdEVsZW1lbnQoJGNsb25lZEl0ZW0pXG5cdFx0XHR0aGlzLmRlc2lnbmVyLmVsZW1lbnREcmFnLmFkZEl0ZW1zKCRjbG9uZWRJdGVtKVxuXHRcdFx0Y2xvbmVkSXRlbS51cGRhdGVQb3NpdGlvbkluQ29uZmlnKClcblx0XHRcdHRoaXMuZGVzaWduZXIudGFiR3JpZC5yZWZyZXNoQ29scyh0cnVlKVxuXG5cdFx0XHRyZXR1cm4gZmFsc2Vcblx0XHR9LFxuXG5cdFx0LyoqXG5cdFx0ICogVXRpbGl0eSB0byBlbnN1cmUgYW4gZWxlbWVudCBpcyB2aXNpYmx5IGRpc3BsYXllZFxuXHRcdCAqIEBwYXJhbSB7alF1ZXJ5fSAkZWxcblx0XHQgKi9cblx0XHRlbnN1cmVWaXNpYmxlOiBmdW5jdGlvbiAoJGVsKSB7XG5cdFx0XHRpZiAoJGVsLmNzcygndmlzaWJpbGl0eScpID09PSAnaGlkZGVuJykge1xuXHRcdFx0XHQkZWwuY3NzKCd2aXNpYmlsaXR5JywgJ3Zpc2libGUnKVxuXHRcdFx0fVxuXHRcdH0sXG5cdH0sXG4pXG5cbmV4cG9ydCBkZWZhdWx0IEN1c3RvbUZpZWxkcyIsImltcG9ydCBDb21wbGV4RmllbGRzIGZyb20gJy4vQ29tcGxleEZpZWxkcy5qcydcbmltcG9ydCBDdXN0b21GaWVsZHMgZnJvbSAnLi9DdXN0b21GaWVsZHMuanMnXG5cbmNvbnN0IFNpZGViYXJMaWJyYXJ5ID0gR2FybmlzaC5CYXNlLmV4dGVuZChcblx0e1xuXHRcdCRjb250YWluZXI6IG51bGwsXG5cdFx0JHNlYXJjaDogbnVsbCxcblx0XHQkY2xlYXJTZWFyY2hCdG46IG51bGwsXG5cdFx0JGZpZWxkczogbnVsbCxcblx0XHQvKiogQHR5cGUge0Rlc2lnbmVyU2lkZWJhcn0gKi9cblx0XHRzaWRlYmFyOiBudWxsLFxuXG5cdFx0LyoqXG5cdFx0ICogQ29uc3RydWN0b3Jcblx0XHQgKlxuXHRcdCAqIEB0aGlzIHt0eXBlb2YgU2lkZWJhckxpYnJhcnl9XG5cdFx0ICogQHBhcmFtIHtKUXVlcnk8SFRNTEVsZW1lbnQ+fEhUTUxFbGVtZW50fHN0cmluZ30gY29udGFpbmVyIENTUyBzZWxlY3RvciwgSFRNTCBFbGVtZW50LCBvciBKUXVlcnkgd3JhcHBlciBvZiB0aGUgZWxlbWVudFxuXHRcdCAqIEBwYXJhbSB7RGVzaWduZXJTaWRlYmFyfSBzaWRlYmFyXG5cdFx0ICovXG5cdFx0aW5pdDogZnVuY3Rpb24gKGNvbnRhaW5lciwgc2lkZWJhcikge1xuXHRcdFx0dGhpcy4kY29udGFpbmVyID0gJChjb250YWluZXIpXG5cdFx0XHR0aGlzLnNpZGViYXIgPSBzaWRlYmFyXG5cdFx0XHR0aGlzLiRmaWVsZHMgPSB0aGlzLiRjb250YWluZXIuZmluZCgnLmZsZC1lbGVtZW50Jylcblx0XHRcdGxldCAkZmllbGRTZWFyY2hDb250YWluZXIgPSB0aGlzLiRjb250YWluZXIuY2hpbGRyZW4oJy5zZWFyY2gnKVxuXHRcdFx0aWYgKCRmaWVsZFNlYXJjaENvbnRhaW5lci5sZW5ndGggPT09IDApIHJldHVyblxuXG5cdFx0XHR0aGlzLiRzZWFyY2ggPSAkZmllbGRTZWFyY2hDb250YWluZXIuY2hpbGRyZW4oJ2lucHV0Jylcblx0XHRcdHRoaXMuJGNsZWFyU2VhcmNoQnRuID0gJGZpZWxkU2VhcmNoQ29udGFpbmVyLmNoaWxkcmVuKCcuY2xlYXItYnRuJylcblx0XHRcdG5ldyBDb21wbGV4RmllbGRzKHRoaXMpXG5cdFx0XHRuZXcgQ3VzdG9tRmllbGRzKHRoaXMpXG5cblx0XHRcdHRoaXMuYWRkTGlzdGVuZXIodGhpcy4kc2VhcmNoLCAnaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRcdGxldCB2YWwgPSB0aGlzLiRzZWFyY2gudmFsKCkudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bJ1wiXS9nLCAnJylcblx0XHRcdFx0aWYgKCF2YWwpIHtcblx0XHRcdFx0XHR0aGlzLiRjb250YWluZXIuZmluZCgnLmZpbHRlcmVkJykucmVtb3ZlQ2xhc3MoJ2ZpbHRlcmVkJylcblx0XHRcdFx0XHR0aGlzLiRjbGVhclNlYXJjaEJ0bi5hZGRDbGFzcygnaGlkZGVuJylcblx0XHRcdFx0XHRyZXR1cm5cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuJGNsZWFyU2VhcmNoQnRuLnJlbW92ZUNsYXNzKCdoaWRkZW4nKVxuXHRcdFx0XHRsZXQgJG1hdGNoZXMgPSB0aGlzLiRmaWVsZHNcblx0XHRcdFx0XHQuZmlsdGVyKGBbZGF0YS1rZXl3b3Jkcyo9XCIke3ZhbH1cIl1gKVxuXHRcdFx0XHRcdC5hZGQodGhpcy4kY29udGFpbmVyLmNoaWxkcmVuKCcuZmxkLWVsZW1lbnQnKSlcblx0XHRcdFx0XHQucmVtb3ZlQ2xhc3MoJ2ZpbHRlcmVkJylcblx0XHRcdFx0dGhpcy4kZmllbGRzLm5vdCgkbWF0Y2hlcykuYWRkQ2xhc3MoJ2ZpbHRlcmVkJylcblx0XHRcdH0pXG5cblx0XHRcdHRoaXMuYWRkTGlzdGVuZXIodGhpcy4kc2VhcmNoLCAna2V5ZG93bicsIChldikgPT4ge1xuXHRcdFx0XHRzd2l0Y2ggKGV2LmtleUNvZGUpIHtcblx0XHRcdFx0XHRjYXNlIEdhcm5pc2guRVNDX0tFWTpcblx0XHRcdFx0XHRcdHRoaXMuJHNlYXJjaC52YWwoJycpLnRyaWdnZXIoJ2lucHV0Jylcblx0XHRcdFx0XHRcdGJyZWFrXG5cdFx0XHRcdFx0Y2FzZSBHYXJuaXNoLlJFVFVSTl9LRVk6XG5cdFx0XHRcdFx0XHRldi5wcmV2ZW50RGVmYXVsdCgpXG5cdFx0XHRcdFx0XHRicmVha1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXG5cdFx0XHR0aGlzLmFkZExpc3RlbmVyKHRoaXMuJGNsZWFyU2VhcmNoQnRuLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuJHNlYXJjaC52YWwoJycpLnRyaWdnZXIoJ2lucHV0Jylcblx0XHRcdH0pXG5cdFx0fSxcblx0fSlcblxuZXhwb3J0IGRlZmF1bHQgU2lkZWJhckxpYnJhcnkiLCJpbXBvcnQgU2lkZWJhckxpYnJhcnkgZnJvbSAnLi9TaWRlYmFyTGlicmFyeS5qcydcblxuY29uc3QgRGVzaWduZXJTaWRlYmFyID0gR2FybmlzaC5CYXNlLmV4dGVuZCh7XG5cdC8qKiBAdHlwZSB7SlF1ZXJ5fSAqL1xuXHQkY29udGFpbmVyOiAvKiogQHR5cGUge2FueX0gKi8gKG51bGwpLFxuXHQkbGlicmFyeVRvZ2dsZTogbnVsbCxcblx0LyoqIEB0eXBlIHtTaWRlYmFyTGlicmFyeT99ICovXG5cdHNlbGVjdGVkTGlicmFyeTogbnVsbCxcblx0LyoqIEB0eXBlIHtTaWRlYmFyTGlicmFyeVtdfSAqL1xuXHRsaWJyYXJpZXM6IG51bGwsXG5cdCRsaWJyYXJ5Q29udGFpbmVyczogW10sXG5cdGRlc2lnbmVyOiBudWxsLFxuXHRfcGFyZW50Q29uZmlnOiBudWxsLFxuXHRfY29uZmlnOiBudWxsLFxuXG5cdC8qKlxuXHQgKiBAcGFyYW0ge3R5cGVvZiBEZXNpZ25lcn0gZGVzaWduZXJcblx0ICogQHBhcmFtIHtKUXVlcnk8SFRNTEVsZW1lbnQ+fEhUTUxFbGVtZW50fHN0cmluZ30gY29udGFpbmVyIENTUyBzZWxlY3RvciwgSFRNTCBFbGVtZW50LCBvciBKUXVlcnkgd3JhcHBlciBvZiB0aGUgZWxlbWVudFxuXHQgKi9cblx0aW5pdDogZnVuY3Rpb24gKGRlc2lnbmVyLCBjb250YWluZXIpIHtcblx0XHR0aGlzLiRjb250YWluZXIgPSAkKGNvbnRhaW5lcilcblx0XHR0aGlzLmRlc2lnbmVyID0gZGVzaWduZXJcblx0XHR0aGlzLmxpYnJhcmllcyA9IFtdXG5cdFx0dGhpcy4kbGlicmFyeUNvbnRhaW5lcnMgPSAkLm1ha2VBcnJheSh0aGlzLiRjb250YWluZXIuY2hpbGRyZW4oJy5mbGQtbGlicmFyeScpKVxuXHRcdGZvciAobGV0IFtpbmRleCwgJGxpYnJhcnlDb250YWluZXJdIG9mIHRoaXMuJGxpYnJhcnlDb250YWluZXJzLmVudHJpZXMoKSkge1xuXHRcdFx0bGV0IGxpYnJhcnkgPSBuZXcgU2lkZWJhckxpYnJhcnkoJGxpYnJhcnlDb250YWluZXIsIHRoaXMpXG5cdFx0XHRpZiAoaW5kZXggPT09IDApIHRoaXMuc2VsZWN0ZWRMaWJyYXJ5ID0gbGlicmFyeVxuXHRcdFx0dGhpcy5saWJyYXJpZXMucHVzaChsaWJyYXJ5KVxuXHRcdH1cblxuXHRcdC8vIE5lc3RlZCBzaWRlYmFycyBoYXZlIGEgY2xvc2UgYnV0dG9uIChFc2NhcGUgY2xvc2VzIHRoZSBsYXN0IG9uZSB0b28pXG5cdFx0dGhpcy5hZGRMaXN0ZW5lcih0aGlzLiRjb250YWluZXIuY2hpbGRyZW4oJy5zaWRlYmFyLW5hbWUtd3JhcHBlcicpLmZpbmQoJy5zaWRlYmFyLWNsb3NlJyksICdhY3RpdmF0ZScsICgpID0+IHtcblx0XHRcdHRoaXMuZGVzaWduZXIuY2xvc2VTaWRlYmFyKHRoaXMpXG5cdFx0fSlcblxuXHRcdGxldCAkbGlicmFyeVBpY2tlciA9IHRoaXMuJGNvbnRhaW5lci5jaGlsZHJlbignLmJ0bmdyb3VwJylcblx0XHRuZXcgQ3JhZnQuTGlzdGJveCgkbGlicmFyeVBpY2tlciwge1xuXHRcdFx0b25DaGFuZ2U6ICgkc2VsZWN0ZWRPcHRpb24pID0+IHtcblx0XHRcdFx0dGhpcy5zZWxlY3RlZExpYnJhcnkuJGNvbnRhaW5lci5hZGRDbGFzcygnaGlkZGVuJylcblx0XHRcdFx0dGhpcy5zZWxlY3RlZExpYnJhcnkgPSB0aGlzLmdldExpYnJhcnkoJHNlbGVjdGVkT3B0aW9uLmRhdGEoJ2xpYnJhcnknKSlcblx0XHRcdFx0dGhpcy5zZWxlY3RlZExpYnJhcnkuJGNvbnRhaW5lclxuXHRcdFx0XHRcdC5yZW1vdmVDbGFzcygnaGlkZGVuJylcblx0XHRcdH0sXG5cdFx0fSlcblx0fSxcblxuXHRnZXRQYXJlbnRDb25maWc6IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gdGhpcy4kY29udGFpbmVyLmRhdGEoJ3BhcmVudENvbmZpZycpXG5cdH0sXG5cblx0LyoqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBoYW5kbGVcblx0ICogQHJldHVybiB7U2lkZWJhckxpYnJhcnl9XG5cdCAqL1xuXHRnZXRMaWJyYXJ5OiBmdW5jdGlvbiAoaGFuZGxlKSB7XG5cdFx0cmV0dXJuIHRoaXMubGlicmFyaWVzLmZpbmQobGlicmFyeSA9PiBoYW5kbGUgPT09IGxpYnJhcnkuJGNvbnRhaW5lci5kYXRhKCdsaWJyYXJ5JykpXG5cdH1cbn0sIHt9KVxuXG5leHBvcnQgZGVmYXVsdCBEZXNpZ25lclNpZGViYXIiLCJjb25zdCBFbGVtZW50RHJhZyA9IEdhcm5pc2guRHJhZy5leHRlbmQoe1xuXHRkcmFnZ2luZ0xpYnJhcnlFbGVtZW50OiBmYWxzZSxcblx0ZHJhZ2dpbmdGaWVsZDogZmFsc2UsXG5cdG9yaWdpbmFsVGFiOiBudWxsLFxuXHRkZXNpZ25lcjogbnVsbCxcblx0JGluc2VydGlvbjogbnVsbCxcblx0c2hvd2luZ0luc2VydGlvbjogZmFsc2UsXG5cdCRjYWJvb3NlOiBudWxsLFxuXG5cdGluaXQ6IGZ1bmN0aW9uIChkZXNpZ25lciwgc2V0dGluZ3MpIHtcblx0XHR0aGlzLmRlc2lnbmVyID0gZGVzaWduZXJcblx0XHR0aGlzLmJhc2UodGhpcy5maW5kSXRlbXMoKSwgc2V0dGluZ3MpXG5cdH0sXG5cblx0cmVtb3ZlQ2Fib29zZTogZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMuJGl0ZW1zID0gdGhpcy4kaXRlbXMubm90KHRoaXMuJGNhYm9vc2UpXG5cdFx0dGhpcy4kY2Fib29zZS5yZW1vdmUoKVxuXHR9LFxuXG5cdHN3YXBEcmFnZ2VlV2l0aEluc2VydGlvbjogZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMuJGluc2VydGlvbi5pbnNlcnRCZWZvcmUodGhpcy4kZHJhZ2dlZSlcblx0XHR0aGlzLiRkcmFnZ2VlLmRldGFjaCgpXG5cdFx0dGhpcy4kaXRlbXMgPSAkKCkuYWRkKHRoaXMuJGl0ZW1zLm5vdCh0aGlzLiRkcmFnZ2VlKS5hZGQodGhpcy4kaW5zZXJ0aW9uKSlcblx0XHR0aGlzLnNob3dpbmdJbnNlcnRpb24gPSB0cnVlXG5cdH0sXG5cblx0c3dhcEluc2VydGlvbldpdGhEcmFnZ2VlOiBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy4kaW5zZXJ0aW9uLnJlcGxhY2VXaXRoKHRoaXMuJGRyYWdnZWUpXG5cdFx0dGhpcy4kaXRlbXMgPSAkKCkuYWRkKHRoaXMuJGl0ZW1zLm5vdCh0aGlzLiRpbnNlcnRpb24pLmFkZCh0aGlzLiRkcmFnZ2VlKSlcblx0XHR0aGlzLnNob3dpbmdJbnNlcnRpb24gPSBmYWxzZVxuXHR9LFxuXG5cdHNldE1pZHBvaW50czogZnVuY3Rpb24gKCkge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy4kaXRlbXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGxldCAkaXRlbSA9ICQodGhpcy4kaXRlbXNbaV0pXG5cdFx0XHRsZXQgb2Zmc2V0ID0gJGl0ZW0ub2Zmc2V0KClcblxuXHRcdFx0Ly8gU2tpcCBsaWJyYXJ5IGVsZW1lbnRzXG5cdFx0XHRpZiAoJGl0ZW0uaGFzQ2xhc3MoJ3VudXNlZCcpKSB7XG5cdFx0XHRcdGNvbnRpbnVlXG5cdFx0XHR9XG5cblx0XHRcdCRpdGVtLmRhdGEoJ21pZHBvaW50Jywge1xuXHRcdFx0XHRsZWZ0OiBvZmZzZXQubGVmdCArICRpdGVtLm91dGVyV2lkdGgoKSAvIDIsIHRvcDogb2Zmc2V0LnRvcCArICRpdGVtLm91dGVySGVpZ2h0KCkgLyAyLFxuXHRcdFx0fSlcblx0XHR9XG5cdH0sXG5cblx0Z2V0Q2xvc2VzdEl0ZW06IGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLmdldENsb3Nlc3RJdGVtLl9jbG9zZXN0SXRlbSA9IG51bGxcblx0XHR0aGlzLmdldENsb3Nlc3RJdGVtLl9jbG9zZXN0SXRlbU1vdXNlRGlmZiA9IG51bGxcblxuXHRcdGZvciAodGhpcy5nZXRDbG9zZXN0SXRlbS5faSA9IDA7IHRoaXMuZ2V0Q2xvc2VzdEl0ZW0uX2kgPCB0aGlzLiRpdGVtcy5sZW5ndGg7IHRoaXMuZ2V0Q2xvc2VzdEl0ZW0uX2krKykge1xuXHRcdFx0dGhpcy5nZXRDbG9zZXN0SXRlbS5fJGl0ZW0gPSAkKHRoaXMuJGl0ZW1zW3RoaXMuZ2V0Q2xvc2VzdEl0ZW0uX2ldKVxuXG5cdFx0XHR0aGlzLmdldENsb3Nlc3RJdGVtLl9taWRwb2ludCA9IHRoaXMuZ2V0Q2xvc2VzdEl0ZW0uXyRpdGVtLmRhdGEoJ21pZHBvaW50Jylcblx0XHRcdGlmICghdGhpcy5nZXRDbG9zZXN0SXRlbS5fbWlkcG9pbnQpIHtcblx0XHRcdFx0Y29udGludWVcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5nZXRDbG9zZXN0SXRlbS5fbW91c2VEaWZmID0gR2FybmlzaC5nZXREaXN0KHRoaXMuZ2V0Q2xvc2VzdEl0ZW0uX21pZHBvaW50LmxlZnQsIHRoaXMuZ2V0Q2xvc2VzdEl0ZW0uX21pZHBvaW50LnRvcCwgdGhpcy5tb3VzZVgsIHRoaXMubW91c2VZKVxuXG5cdFx0XHRpZiAodGhpcy5nZXRDbG9zZXN0SXRlbS5fY2xvc2VzdEl0ZW0gPT09IG51bGwgfHwgdGhpcy5nZXRDbG9zZXN0SXRlbS5fbW91c2VEaWZmIDwgdGhpcy5nZXRDbG9zZXN0SXRlbS5fY2xvc2VzdEl0ZW1Nb3VzZURpZmYpIHtcblx0XHRcdFx0dGhpcy5nZXRDbG9zZXN0SXRlbS5fY2xvc2VzdEl0ZW0gPSB0aGlzLmdldENsb3Nlc3RJdGVtLl8kaXRlbVswXVxuXHRcdFx0XHR0aGlzLmdldENsb3Nlc3RJdGVtLl9jbG9zZXN0SXRlbU1vdXNlRGlmZiA9IHRoaXMuZ2V0Q2xvc2VzdEl0ZW0uX21vdXNlRGlmZlxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmdldENsb3Nlc3RJdGVtLl9jbG9zZXN0SXRlbVxuXHR9LFxuXG5cdGNoZWNrRm9yTmV3Q2xvc2VzdEl0ZW06IGZ1bmN0aW9uICgpIHtcblx0XHQvLyBJcyB0aGVyZSBhIG5ldyBjbG9zZXN0IGl0ZW0/XG5cdFx0dGhpcy5jaGVja0Zvck5ld0Nsb3Nlc3RJdGVtLl9jbG9zZXN0SXRlbSA9IHRoaXMuZ2V0Q2xvc2VzdEl0ZW0oKVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tGb3JOZXdDbG9zZXN0SXRlbS5fY2xvc2VzdEl0ZW0gPT09IHRoaXMuJGluc2VydGlvblswXSkge1xuXHRcdFx0cmV0dXJuXG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc2hvd2luZ0luc2VydGlvbiAmJiAkLmluQXJyYXkodGhpcy4kaW5zZXJ0aW9uWzBdLCB0aGlzLiRpdGVtcykgPCAkLmluQXJyYXkodGhpcy5jaGVja0Zvck5ld0Nsb3Nlc3RJdGVtLl9jbG9zZXN0SXRlbSwgdGhpcy4kaXRlbXMpICYmICQuaW5BcnJheSh0aGlzLmNoZWNrRm9yTmV3Q2xvc2VzdEl0ZW0uX2Nsb3Nlc3RJdGVtLCB0aGlzLiRjYWJvb3NlKSA9PT0gLTEpIHtcblx0XHRcdHRoaXMuJGluc2VydGlvbi5pbnNlcnRBZnRlcih0aGlzLmNoZWNrRm9yTmV3Q2xvc2VzdEl0ZW0uX2Nsb3Nlc3RJdGVtKVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLiRpbnNlcnRpb24uaW5zZXJ0QmVmb3JlKHRoaXMuY2hlY2tGb3JOZXdDbG9zZXN0SXRlbS5fY2xvc2VzdEl0ZW0pXG5cdFx0fVxuXG5cdFx0dGhpcy4kaXRlbXMgPSAkKCkuYWRkKHRoaXMuJGl0ZW1zLmFkZCh0aGlzLiRpbnNlcnRpb24pKVxuXHRcdHRoaXMuc2hvd2luZ0luc2VydGlvbiA9IHRydWVcblx0XHR0aGlzLmRlc2lnbmVyLnRhYkdyaWQucmVmcmVzaENvbHModHJ1ZSlcblx0XHR0aGlzLnNldE1pZHBvaW50cygpXG5cdH0sXG5cblx0ZmluZEl0ZW1zOiBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gUmV0dXJuIGFsbCBvZiB0aGUgdXNlZCArIHVudXNlZCBmaWVsZHNcblx0XHRyZXR1cm4gdGhpcy5kZXNpZ25lci4kdGFiQ29udGFpbmVyXG5cdFx0XHQuZmluZCgnLmZsZC1lbGVtZW50Jylcblx0XHRcdC5hZGQodGhpcy5kZXNpZ25lci5zZWxlY3RlZFNpZGViYXIuJGNvbnRhaW5lci5maW5kKCcuZmxkLWVsZW1lbnQ6bm90KC5ibG9jay1maWVsZCknKSlcblx0fSxcblxuXHQvKipcblx0ICogQHBhcmFtIHtKUXVlcnk8SFRNTEVsZW1lbnQ+W119IGl0ZW1zIEVsZW1lbnRzIHRoYXQgc2hvdWxkIGJlIGRyYWdnYWJsZS5cblx0ICovXG5cdGFkZEl0ZW1zOiBmdW5jdGlvbiAoaXRlbXMpIHtcblx0XHRpdGVtcyA9ICQubWFrZUFycmF5KGl0ZW1zKVxuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRpZiAoJC5kYXRhKGl0ZW0sICdkcmFnJykpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKCdFbGVtZW50IHdhcyBhZGRlZCB0byBtb3JlIHRoYW4gb25lIGRyYWdnZXInKVxuXHRcdFx0XHQkLmRhdGEoaXRlbSwgJ2RyYWcnKS5yZW1vdmVJdGVtcyhpdGVtKVxuXHRcdFx0fVxuXG5cdFx0XHQkLmRhdGEoaXRlbSwgJ2RyYWcnLCB0aGlzKVxuXG5cdFx0XHQvLyBTdG9yZSB0aGUgaGFuZGxlciByZWZlcmVuY2Ugb24gdGhlIGVsZW1lbnRcblx0XHRcdGNvbnN0IGhhbmRsZXIgPSAoZXYpID0+IHtcblx0XHRcdFx0dGhpcy5faGFuZGxlTW91c2VEb3duKGV2LCBpdGVtKVxuXHRcdFx0fVxuXHRcdFx0JC5kYXRhKGl0ZW0sICdtb3VzZWRvd25IYW5kbGVyJywgaGFuZGxlcilcblxuXHRcdFx0dGhpcy5hZGRMaXN0ZW5lcih0aGlzLl9nZXRJdGVtSGFuZGxlKGl0ZW0pLCAnbW91c2Vkb3duJywgaGFuZGxlcilcblx0XHR9XG5cblx0XHR0aGlzLiRpdGVtcyA9IHRoaXMuJGl0ZW1zLmFkZChpdGVtcylcblx0fSxcblxuXHRvbkRyYWdTdGFydDogZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMuYmFzZSgpXG5cblx0XHR0aGlzLiRpbnNlcnRpb24gPSB0aGlzLmNyZWF0ZUluc2VydGlvbigpXG5cblx0XHR0aGlzLiRjYWJvb3NlID0gdGhpcy5jcmVhdGVDYWJvb3NlKClcblx0XHR0aGlzLiRpdGVtcyA9ICQoKS5hZGQodGhpcy4kaXRlbXMuYWRkKHRoaXMuJGNhYm9vc2UpKVxuXG5cdFx0R2FybmlzaC4kYm9kLmFkZENsYXNzKCdkcmFnZ2luZycpXG5cblx0XHR0aGlzLmRyYWdnaW5nTGlicmFyeUVsZW1lbnQgPSB0aGlzLiRkcmFnZ2VlLmhhc0NsYXNzKCd1bnVzZWQnKVxuXHRcdHRoaXMuZHJhZ2dpbmdGaWVsZCA9IHRoaXMuJGRyYWdnZWUuaGFzQ2xhc3MoJ2ZsZC1maWVsZCcpXG5cblx0XHRpZiAoIXRoaXMuZHJhZ2dpbmdMaWJyYXJ5RWxlbWVudCkge1xuXHRcdFx0dGhpcy5vcmlnaW5hbFRhYiA9IHRoaXMuJGRyYWdnZWUuY2xvc2VzdCgnLmZsZC10YWInKS5kYXRhKCdmbGQtdGFiJylcblx0XHRcdHRoaXMuc3dhcERyYWdnZWVXaXRoSW5zZXJ0aW9uKClcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5vcmlnaW5hbFRhYiA9IG51bGxcblx0XHR9XG5cblx0XHR0aGlzLnNldE1pZHBvaW50cygpXG5cdH0sXG5cblx0b25EcmFnOiBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKHRoaXMuaXNIb3ZlcmluZ092ZXJUYWIoKSkge1xuXHRcdFx0dGhpcy5jaGVja0Zvck5ld0Nsb3Nlc3RJdGVtKClcblx0XHR9IGVsc2UgaWYgKHRoaXMuc2hvd2luZ0luc2VydGlvbikge1xuXHRcdFx0dGhpcy4kaW5zZXJ0aW9uLnJlbW92ZSgpXG5cdFx0XHR0aGlzLiRpdGVtcyA9ICQoKS5hZGQodGhpcy4kaXRlbXMubm90KHRoaXMuJGluc2VydGlvbikpXG5cdFx0XHR0aGlzLnNob3dpbmdJbnNlcnRpb24gPSBmYWxzZVxuXHRcdFx0dGhpcy5kZXNpZ25lci50YWJHcmlkLnJlZnJlc2hDb2xzKHRydWUpXG5cdFx0XHR0aGlzLnNldE1pZHBvaW50cygpXG5cdFx0fVxuXG5cdFx0dGhpcy5iYXNlKClcblx0fSxcblxuXHRpc0hvdmVyaW5nT3ZlclRhYjogZnVuY3Rpb24gKCkge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5kZXNpZ25lci50YWJHcmlkLiRpdGVtcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKEdhcm5pc2guaGl0VGVzdCh0aGlzLm1vdXNlWCwgdGhpcy5tb3VzZVksIHRoaXMuZGVzaWduZXIudGFiR3JpZC4kaXRlbXMuZXEoaSkpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlXG5cdH0sXG5cblx0Y3JlYXRlQ2Fib29zZTogZnVuY3Rpb24gKCkge1xuXHRcdGxldCAkY2Fib29zZSA9ICQoKVxuXHRcdGxldCAkZmllbGRDb250YWluZXJzID0gdGhpcy5kZXNpZ25lci4kdGFiQ29udGFpbmVyLmZpbmQoJz4gLmZsZC10YWIgPiAuZmxkLXRhYmNvbnRlbnQnKVxuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAkZmllbGRDb250YWluZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHQkY2Fib29zZSA9ICRjYWJvb3NlLmFkZCgkKCc8ZGl2Lz4nKS5hcHBlbmRUbygkZmllbGRDb250YWluZXJzW2ldKSlcblx0XHR9XG5cblx0XHRyZXR1cm4gJGNhYm9vc2Vcblx0fSxcblxuXHRjcmVhdGVJbnNlcnRpb246IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gJChgPGRpdiBjbGFzcz1cImZsZC1lbGVtZW50IGZsZC1pbnNlcnRpb25cIiBzdHlsZT1cImhlaWdodDogJHt0aGlzLiRkcmFnZ2VlLm91dGVySGVpZ2h0KCl9cHg7XCIvPmApXG5cdH0sXG5cblx0b25EcmFnU3RvcDogZnVuY3Rpb24gKCkge1xuXHRcdGxldCBzaG93aW5nSW5zZXJ0aW9uID0gdGhpcy5zaG93aW5nSW5zZXJ0aW9uXG5cdFx0aWYgKHNob3dpbmdJbnNlcnRpb24pIHtcblx0XHRcdGlmICh0aGlzLmRyYWdnaW5nTGlicmFyeUVsZW1lbnQpIHtcblx0XHRcdFx0Ly8gQ3JlYXRlIGEgbmV3IGVsZW1lbnQgYmFzZWQgb24gdGhhdCBvbmVcblx0XHRcdFx0Y29uc3QgJGVsZW1lbnQgPSB0aGlzLiRkcmFnZ2VlLmNsb25lKCkucmVtb3ZlQ2xhc3MoJ3VudXNlZCcpXG5cblx0XHRcdFx0aWYgKHRoaXMuZHJhZ2dpbmdGaWVsZCkge1xuXHRcdFx0XHRcdHRoaXMuJGRyYWdnZWUuY3NzKHsgdmlzaWJpbGl0eTogJ2luaGVyaXQnIH0pXG5cdFx0XHRcdFx0dGhpcy5kZXNpZ25lci5oaWRlTGlicmFyeUVsZW1lbnQodGhpcy4kZHJhZ2dlZSlcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNldCB0aGlzLiRkcmFnZ2VlIHRvIHRoZSBjbG9uZSwgYXMgaWYgd2Ugd2VyZSBkcmFnZ2luZyB0aGF0IGFsbCBhbG9uZ1xuXHRcdFx0XHR0aGlzLiRkcmFnZ2VlID0gJGVsZW1lbnRcblxuXHRcdFx0XHQvLyBSZW1lbWJlciBpdCBmb3IgbGF0ZXJcblx0XHRcdFx0dGhpcy5hZGRJdGVtcygkZWxlbWVudClcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKCF0aGlzLmRyYWdnaW5nTGlicmFyeUVsZW1lbnQpIHtcblx0XHRcdGNvbnN0ICRsaWJyYXJ5RWxlbWVudCA9IHRoaXMuZGVzaWduZXIuZmluZExpYnJhcnlFbGVtZW50KHRoaXMuJGRyYWdnZWUuYXR0cignZGF0YS1oYW5kbGUnKSlcblxuXHRcdFx0Ly8gRGVzdHJveSB0aGUgb3JpZ2luYWwgZWxlbWVudCAodGhpcyBhbHNvIHJlc3RvcmVzIHRoZSBsaWJyYXJ5IGVsZW1lbnQpXG5cdFx0XHR0aGlzLiRkcmFnZ2VlLmRhdGEoJ2ZsZC1lbGVtZW50JykuZGVzdHJveSgpXG5cblx0XHRcdC8vIFNldCB0aGlzLiRkcmFnZ2VlIHRvIHRoZSBsaWJyYXJ5IGVsZW1lbnQsIGFzIGlmIHdlIHdlcmUgZHJhZ2dpbmcgdGhhdCBhbGwgYWxvbmdcblx0XHRcdHRoaXMuJGRyYWdnZWUgPSAkbGlicmFyeUVsZW1lbnRcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zaG93aW5nSW5zZXJ0aW9uKSB7XG5cdFx0XHR0aGlzLnN3YXBJbnNlcnRpb25XaXRoRHJhZ2dlZSgpXG5cdFx0fVxuXG5cdFx0dGhpcy5yZW1vdmVDYWJvb3NlKClcblxuXHRcdHRoaXMuZGVzaWduZXIudGFiR3JpZC5yZWZyZXNoQ29scyh0cnVlKVxuXG5cdFx0Ly8gcmV0dXJuIHRoZSBoZWxwZXJzIHRvIHRoZSBkcmFnZ2Vlc1xuXHRcdGxldCBvZmZzZXQgPSB0aGlzLiRkcmFnZ2VlLm9mZnNldCgpXG5cdFx0aWYgKCFvZmZzZXQgfHwgKG9mZnNldC50b3AgPT09IDAgJiYgb2Zmc2V0LmxlZnQgPT09IDApKSB7XG5cdFx0XHR0aGlzLiRkcmFnZ2VlXG5cdFx0XHRcdC5jc3Moe1xuXHRcdFx0XHRcdGRpc3BsYXk6IHRoaXMuZHJhZ2dlZURpc3BsYXksIHZpc2liaWxpdHk6ICd2aXNpYmxlJywgb3BhY2l0eTogMCxcblx0XHRcdFx0fSlcblx0XHRcdFx0LnZlbG9jaXR5KHsgb3BhY2l0eTogMSB9LCBHYXJuaXNoLkZYX0RVUkFUSU9OKVxuXHRcdFx0dGhpcy5oZWxwZXJzWzBdLnZlbG9jaXR5KHsgb3BhY2l0eTogMCB9LCBHYXJuaXNoLkZYX0RVUkFUSU9OLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Nob3dEcmFnZ2VlKClcblx0XHRcdH0pXG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmV0dXJuSGVscGVyc1RvRHJhZ2dlZXMoKVxuXHRcdH1cblxuXHRcdHRoaXMuYmFzZSgpXG5cblx0XHRHYXJuaXNoLiRib2QucmVtb3ZlQ2xhc3MoJ2RyYWdnaW5nJylcblxuXHRcdHRoaXMuJGRyYWdnZWUuY3NzKHtcblx0XHRcdGRpc3BsYXk6IHRoaXMuZHJhZ2dlZURpc3BsYXksIHZpc2liaWxpdHk6IHRoaXMuZHJhZ2dpbmdGaWVsZCB8fCBzaG93aW5nSW5zZXJ0aW9uID8gJ2hpZGRlbicgOiAndmlzaWJsZScsXG5cdFx0fSlcblxuXHRcdGlmIChzaG93aW5nSW5zZXJ0aW9uKSB7XG5cdFx0XHRjb25zdCB0YWIgPSB0aGlzLiRkcmFnZ2VlLmNsb3Nlc3QoJy5mbGQtdGFiJykuZGF0YSgnZmxkLXRhYicpXG5cdFx0XHRsZXQgZWxlbWVudFxuXG5cdFx0XHRpZiAodGhpcy5kcmFnZ2luZ0xpYnJhcnlFbGVtZW50KSB7XG5cdFx0XHRcdGVsZW1lbnQgPSB0YWIuaW5pdEVsZW1lbnQodGhpcy4kZHJhZ2dlZSlcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVsZW1lbnQgPSB0aGlzLiRkcmFnZ2VlLmRhdGEoJ2ZsZC1lbGVtZW50JylcblxuXHRcdFx0XHQvLyBOZXcgdGFiP1xuXHRcdFx0XHRpZiAodGFiICE9PSB0aGlzLm9yaWdpbmFsVGFiKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29uZmlnID0gZWxlbWVudC5jb25maWdcblxuXHRcdFx0XHRcdHRoaXMub3JpZ2luYWxUYWIudXBkYXRlQ29uZmlnKChjb25maWcpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gZWxlbWVudC5pbmRleFxuXHRcdFx0XHRcdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2Vcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbmZpZy5lbGVtZW50cy5zcGxpY2UoaW5kZXgsIDEpXG5cdFx0XHRcdFx0XHRyZXR1cm4gY29uZmlnXG5cdFx0XHRcdFx0fSlcblxuXHRcdFx0XHRcdHRoaXMuJGRyYWdnZWUuZGF0YSgnZmxkLWVsZW1lbnQnKS50YWIgPSB0YWJcblx0XHRcdFx0XHRlbGVtZW50LmNvbmZpZyA9IGNvbmZpZ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGVsZW1lbnQudXBkYXRlUG9zaXRpb25JbkNvbmZpZygpXG5cdFx0fVxuXHR9LFxufSlcbmV4cG9ydCBkZWZhdWx0IEVsZW1lbnREcmFnIiwiaW1wb3J0IERlc2lnbmVyVGFiIGZyb20gJy4vRGVzaWduZXJUYWIuanMnXG5pbXBvcnQgRGVzaWduZXJTaWRlYmFyIGZyb20gJy4vRGVzaWduZXJTaWRlYmFyLmpzJ1xuaW1wb3J0IEVsZW1lbnREcmFnIGZyb20gJy4vRWxlbWVudERyYWcuanMnXG5cbi8vIENsYXNzZXMgYnVpbHQgd2l0aCBHYXJuaXNoLkJhc2UuZXh0ZW5kKCkgYXJlIHZhbHVlcywgc28gSlNEb2MgbmVlZHMgSW5zdGFuY2VUeXBlPD4gdG8gcmVmZXIgdG8gdGhlaXIgaW5zdGFuY2VzXG4vKiogQHR5cGVkZWYge0luc3RhbmNlVHlwZTx0eXBlb2YgRGVzaWduZXJTaWRlYmFyPn0gRGVzaWduZXJTaWRlYmFySW5zdGFuY2UgKi9cbi8qKiBAdHlwZWRlZiB7SW5zdGFuY2VUeXBlPHR5cGVvZiBEZXNpZ25lclRhYj59IERlc2lnbmVyVGFiSW5zdGFuY2UgKi9cbi8qKiBAdHlwZWRlZiB7SW5zdGFuY2VUeXBlPHR5cGVvZiBFbGVtZW50RHJhZz59IEVsZW1lbnREcmFnSW5zdGFuY2UgKi9cblxuLyoqXG4gKiBAdHlwZWRlZiB7b2JqZWN0fSBMYXlvdXRUYWJDb25maWdcbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSB1aWRcbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSBbbmFtZV1cbiAqIEBwcm9wZXJ0eSB7QXJyYXk8UmVjb3JkPHN0cmluZywgYW55Pj59IGVsZW1lbnRzXG4gKi9cblxuLyoqXG4gKiBUaGUgZmllbGQgbGF5b3V0IGNvbmZpZywga2VwdCBpbiBzeW5jIHdpdGggdGhlIGhpZGRlbiBgZmllbGRMYXlvdXRgIGlucHV0LlxuICogQHR5cGVkZWYge29iamVjdH0gTGF5b3V0Q29uZmlnXG4gKiBAcHJvcGVydHkge3N0cmluZ30gW3VpZF1cbiAqIEBwcm9wZXJ0eSB7bnVtYmVyfSBbaWRdXG4gKiBAcHJvcGVydHkge0xheW91dFRhYkNvbmZpZ1tdfSB0YWJzXG4gKi9cblxuY29uc3QgRGVzaWduZXIgPSBHYXJuaXNoLkJhc2UuZXh0ZW5kKFxuXHR7XG5cdFx0Ly8gRXZlcnkgcHJvcGVydHkgaXMgc2V0IGluIGluaXQoKS4gRGVjbGFyaW5nIHRoZSByZWFsIHR5cGUgYW5kIGNhc3RpbmcgdGhlIGluaXRpYWwgbnVsbFxuXHRcdC8vIGtlZXBzIFR5cGVTY3JpcHQgZnJvbSBpbmZlcnJpbmcgdGhlIHR5cGUgYG51bGxgLlxuXHRcdC8qKiBAdHlwZSB7SlF1ZXJ5fSAqL1xuXHRcdCRjb250YWluZXI6IC8qKiBAdHlwZSB7YW55fSAqLyAobnVsbCksXG5cdFx0LyoqIEB0eXBlIHtKUXVlcnl9ICovXG5cdFx0JHdvcmtzcGFjZTogLyoqIEB0eXBlIHthbnl9ICovIChudWxsKSxcblx0XHQvKiogQHR5cGUge0pRdWVyeX0gKi9cblx0XHQkY29uZmlnSW5wdXQ6IC8qKiBAdHlwZSB7YW55fSAqLyAobnVsbCksXG5cdFx0LyoqIEB0eXBlIHtKUXVlcnl9ICovXG5cdFx0JHRhYkNvbnRhaW5lcjogLyoqIEB0eXBlIHthbnl9ICovIChudWxsKSxcblx0XHQvKiogQHR5cGUge0Rlc2lnbmVyU2lkZWJhckluc3RhbmNlfSAqL1xuXHRcdHNlbGVjdGVkU2lkZWJhcjogLyoqIEB0eXBlIHthbnl9ICovIChudWxsKSxcblx0XHQvKiogQHR5cGUge0Rlc2lnbmVyU2lkZWJhckluc3RhbmNlW119ICovXG5cdFx0JHNpZGViYXJzOiBbXSxcblxuXHRcdC8qKiBDcmFmdC5HcmlkLCB3aGljaCBpc27igJl0IHR5cGVkLiBAdHlwZSB7YW55fSAqL1xuXHRcdHRhYkdyaWQ6IG51bGwsXG5cdFx0LyoqIEB0eXBlIHtFbGVtZW50RHJhZ0luc3RhbmNlfSAqL1xuXHRcdGVsZW1lbnREcmFnOiAvKiogQHR5cGUge2FueX0gKi8gKG51bGwpLFxuXG5cdFx0LyoqIEB0eXBlIHtMYXlvdXRDb25maWd9ICovXG5cdFx0X2NvbmZpZzogLyoqIEB0eXBlIHthbnl9ICovIChudWxsKSxcblxuXHRcdC8qKlxuXHRcdCAqIEBwYXJhbSB7c3RyaW5nfSBjb250YWluZXIgQ1NTIHNlbGVjdG9yIGZvciB0aGUgZGVzaWduZXIgY29udGFpbmVyXG5cdFx0ICovXG5cdFx0aW5pdDogZnVuY3Rpb24gKGNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy4kY29udGFpbmVyID0gJChjb250YWluZXIpXG5cdFx0XHQvLyBlZGl0ZXhwb3J0ZXIuanMgZGVzdHJveXMgdGhlIGRlc2lnbmVyIGJlZm9yZSByZW5kZXJpbmcgYSBuZXcgb25lXG5cdFx0XHR0aGlzLiRjb250YWluZXIuZGF0YSgnZGVzaWduZXInLCB0aGlzKVxuXG5cdFx0XHR0aGlzLiRjb25maWdJbnB1dCA9IHRoaXMuJGNvbnRhaW5lci5jaGlsZHJlbignaW5wdXRbZGF0YS1jb25maWctaW5wdXRdJylcblx0XHRcdHRoaXMuX2NvbmZpZyA9IEpTT04ucGFyc2UoU3RyaW5nKHRoaXMuJGNvbmZpZ0lucHV0LnZhbCgpKSlcblx0XHRcdGlmICghdGhpcy5fY29uZmlnLnRhYnMpIHtcblx0XHRcdFx0dGhpcy5fY29uZmlnLnRhYnMgPSBbXVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLiR3b3Jrc3BhY2UgPSB0aGlzLiRjb250YWluZXIuY2hpbGRyZW4oJy5mbGQtd29ya3NwYWNlJylcblx0XHRcdHRoaXMuJHRhYkNvbnRhaW5lciA9IHRoaXMuJHdvcmtzcGFjZS5jaGlsZHJlbignLmZsZC10YWJzJylcblx0XHRcdHRoaXMuc2VsZWN0ZWRTaWRlYmFyID0gbmV3IERlc2lnbmVyU2lkZWJhcih0aGlzLCB0aGlzLiRjb250YWluZXIuZmluZCgnLmZsZC1zaWRlYmFyJykpXG5cdFx0XHR0aGlzLiRzaWRlYmFycyA9IFt0aGlzLnNlbGVjdGVkU2lkZWJhcl1cblxuXHRcdFx0Ly8gU2V0IHVwIHRoZSBsYXlvdXQgZ3JpZHNcblx0XHRcdHRoaXMudGFiR3JpZCA9IG5ldyBDcmFmdC5HcmlkKHRoaXMuJHRhYkNvbnRhaW5lciwge1xuXHRcdFx0XHRpdGVtU2VsZWN0b3I6ICcuZmxkLXRhYicsXG5cdFx0XHRcdG1pbkNvbFdpZHRoOiAyNCAqIDExLFxuXHRcdFx0XHRmaWxsTW9kZTogJ2dyaWQnLFxuXHRcdFx0XHRzbmFwVG9HcmlkOiAyNCxcblx0XHRcdH0pXG5cblx0XHRcdC8vIGBlYCBpcyBhIEpRdWVyeS5UcmlnZ2VyZWRFdmVudCwgYW5kIGB0aGlzYCBpcyB0aGUgZGVzaWduZXJcblx0XHRcdHRoaXMuYWRkTGlzdGVuZXIod2luZG93LCAna2V5ZG93bicsIGUgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy4kY29udGFpbmVyLmRhdGEoJ25lc3RpbmdMZXZlbHMnKSA9PT0gMCkgcmV0dXJuXG5cdFx0XHRcdGlmIChlLmtleSAhPT0gJ0VzY2FwZScpIHJldHVyblxuXHRcdFx0XHRpZiAoZS50YXJnZXQuY2xvc2VzdCgnLmZsZC1saWJyYXJ5IC5zZWFyY2gnKSkgcmV0dXJuXG5cblx0XHRcdFx0dGhpcy5yZW1vdmVTaWRlYmFyKClcblx0XHRcdH0pXG5cblx0XHRcdC8vIFwiwrtcIiBidXR0b25zIHJlbW92ZSBlbGVtZW50cyBmcm9tIHRoZSB3b3Jrc3BhY2Ugd2l0aG91dCBkcmFnZ2luZ1xuXHRcdFx0dGhpcy5hZGRMaXN0ZW5lcih0aGlzLiR3b3Jrc3BhY2UsICdjbGljaycsIGUgPT4ge1xuXHRcdFx0XHRpZiAoJChlLnRhcmdldCkuY2xvc2VzdCgnLmZsZC1lbGVtZW50IC5yZW1vdmUtZWxlbWVudCcpLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cblx0XHRcdFx0Y29uc3QgZWxlbWVudCA9ICQoZS50YXJnZXQpLmNsb3Nlc3QoJy5mbGQtZWxlbWVudCcpLmRhdGEoJ2ZsZC1lbGVtZW50Jylcblx0XHRcdFx0aWYgKCFlbGVtZW50KSByZXR1cm5cblxuXHRcdFx0XHRlbGVtZW50LmRlc3Ryb3koKVxuXHRcdFx0XHR0aGlzLnRhYkdyaWQucmVmcmVzaENvbHModHJ1ZSlcblx0XHRcdH0pXG5cblx0XHRcdHRoaXMuaW5pdFRhYih0aGlzLiR0YWJDb250YWluZXIuY2hpbGRyZW4oKSlcblx0XHRcdHRoaXMuZWxlbWVudERyYWcgPSBuZXcgRWxlbWVudERyYWcodGhpcylcblx0XHR9LFxuXG5cdFx0LyoqXG5cdFx0ICogQHBhcmFtIHtKUXVlcnl9ICRzaWRlYmFyXG5cdFx0ICovXG5cdFx0YWRkU2lkZWJhcjogZnVuY3Rpb24gKCRzaWRlYmFyKSB7XG5cdFx0XHRjb25zdCBuZXdTaWRlYmFyID0gbmV3IERlc2lnbmVyU2lkZWJhcih0aGlzLCAkc2lkZWJhcilcblx0XHRcdHRoaXMuJHNpZGViYXJzLnB1c2gobmV3U2lkZWJhcilcblx0XHRcdHRoaXMuc2VsZWN0ZWRTaWRlYmFyID0gbmV3U2lkZWJhclxuXHRcdH0sXG5cblx0XHRyZW1vdmVTaWRlYmFyOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHQvLyBUaGUgcm9vdCBzaWRlYmFyIGFsd2F5cyBzdGF5c1xuXHRcdFx0aWYgKHRoaXMuJHNpZGViYXJzLmxlbmd0aCA8PSAxKSByZXR1cm5cblxuXHRcdFx0Y29uc3Qgc2lkZWJhciA9IC8qKiBAdHlwZSB7RGVzaWduZXJTaWRlYmFySW5zdGFuY2V9ICovICh0aGlzLiRzaWRlYmFycy5wb3AoKSlcblx0XHRcdHRoaXMuZWxlbWVudERyYWcucmVtb3ZlSXRlbXMoc2lkZWJhci4kY29udGFpbmVyLmZpbmQoJy5mbGQtZWxlbWVudCcpKVxuXHRcdFx0c2lkZWJhci4kY29udGFpbmVyLnJlbW92ZSgpXG5cdFx0XHR0aGlzLnNlbGVjdGVkU2lkZWJhciA9IHRoaXMuJHNpZGViYXJzW3RoaXMuJHNpZGViYXJzLmxlbmd0aCAtIDFdXG5cblx0XHRcdGNvbnN0IGxldmVscyA9IHRoaXMuJGNvbnRhaW5lci5kYXRhKCduZXN0aW5nTGV2ZWxzJykgLSAxXG5cdFx0XHR0aGlzLiRjb250YWluZXIuY3NzKCctLW5lc3RpbmctbGV2ZWxzJywgbGV2ZWxzKVxuXHRcdFx0dGhpcy4kY29udGFpbmVyLmRhdGEoJ25lc3RpbmdMZXZlbHMnLCBsZXZlbHMpXG5cdFx0fSxcblxuXHRcdC8qKlxuXHRcdCAqIFJlbW92ZXMgdGhlIHNpZGViYXJzIG5lc3RlZCBkZWVwZXIgdGhhbiB0aGUgZ2l2ZW4gb25lLlxuXHRcdCAqIEBwYXJhbSB7RGVzaWduZXJTaWRlYmFySW5zdGFuY2V9IHNpZGViYXJcblx0XHQgKi9cblx0XHRyZW1vdmVTaWRlYmFyc0FmdGVyOiBmdW5jdGlvbiAoc2lkZWJhcikge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLiRzaWRlYmFycy5pbmRleE9mKHNpZGViYXIpXG5cdFx0XHRpZiAoaW5kZXggPT09IC0xKSByZXR1cm5cblxuXHRcdFx0d2hpbGUgKHRoaXMuJHNpZGViYXJzLmxlbmd0aCAtIDEgPiBpbmRleCkge1xuXHRcdFx0XHR0aGlzLnJlbW92ZVNpZGViYXIoKVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBSZW1vdmVzIHRoZSBkZXNpZ25lcidzIGxpc3RlbmVycywgZHJhZ2dpbmcgYW5kIGVsZW1lbnQgc2V0dGluZ3Mgc2xpZGVvdXRzLCBlLmcuIGJlZm9yZSBpdCdzIHJlLXJlbmRlcmVkLlxuXHRcdCAqL1xuXHRcdGRlc3Ryb3k6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMuJHRhYkNvbnRhaW5lci5maW5kKCcuZmxkLWVsZW1lbnQnKS5lYWNoKChpLCBlbCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzbGlkZW91dCA9ICQoZWwpLmRhdGEoJ2ZsZC1lbGVtZW50Jyk/LnNsaWRlb3V0XG5cdFx0XHRcdGlmIChzbGlkZW91dCkge1xuXHRcdFx0XHRcdHNsaWRlb3V0LmRlc3Ryb3koKVxuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXG5cdFx0XHR0aGlzLmVsZW1lbnREcmFnLmRlc3Ryb3koKVxuXHRcdFx0dGhpcy4kY29udGFpbmVyLnJlbW92ZURhdGEoJ2Rlc2lnbmVyJylcblx0XHRcdHRoaXMuYmFzZSgpXG5cdFx0fSxcblxuXHRcdC8qKlxuXHRcdCAqIENsb3NlcyBhIG5lc3RlZCBzaWRlYmFyLCBhbG9uZyB3aXRoIHRoZSBzaWRlYmFycyBvcGVuZWQgZnJvbSBpdC4gVGhlIHJvb3Qgc2lkZWJhciBzdGF5cy5cblx0XHQgKiBAcGFyYW0ge0Rlc2lnbmVyU2lkZWJhckluc3RhbmNlfSBzaWRlYmFyXG5cdFx0ICovXG5cdFx0Y2xvc2VTaWRlYmFyOiBmdW5jdGlvbiAoc2lkZWJhcikge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLiRzaWRlYmFycy5pbmRleE9mKHNpZGViYXIpXG5cdFx0XHRpZiAoaW5kZXggPCAxKSByZXR1cm5cblxuXHRcdFx0dGhpcy5yZW1vdmVTaWRlYmFyc0FmdGVyKHRoaXMuJHNpZGViYXJzW2luZGV4IC0gMV0pXG5cdFx0fSxcblxuXHRcdC8qKlxuXHRcdCAqIEBwYXJhbSB7SlF1ZXJ5fSAkdGFiXG5cdFx0ICogQHJldHVybnMge0Rlc2lnbmVyVGFiSW5zdGFuY2V9XG5cdFx0ICovXG5cdFx0aW5pdFRhYjogZnVuY3Rpb24gKCR0YWIpIHtcblx0XHRcdHJldHVybiBuZXcgRGVzaWduZXJUYWIodGhpcywgJHRhYilcblx0XHR9LFxuXG5cdFx0LyoqXG5cdFx0ICogRmluZHMgdGhlIGxpYnJhcnkgZWxlbWVudCBmb3IgYSBoYW5kbGUgYWNyb3NzIGFsbCBvcGVuIHNpZGViYXJzLlxuXHRcdCAqIEBwYXJhbSB7c3RyaW5nfSBoYW5kbGVcblx0XHQgKiBAcmV0dXJucyB7SlF1ZXJ5fVxuXHRcdCAqL1xuXHRcdGZpbmRMaWJyYXJ5RWxlbWVudDogZnVuY3Rpb24gKGhhbmRsZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuJGNvbnRhaW5lclxuXHRcdFx0XHQuZmluZCgnLmZsZC1zaWRlYmFyIC5mbGQtZWxlbWVudC51bnVzZWQnKVxuXHRcdFx0XHQuZmlsdGVyKChpLCBlbCkgPT4gZWwuZGF0YXNldC5oYW5kbGUgPT09IFN0cmluZyhoYW5kbGUpKVxuXHRcdFx0XHQuZmlyc3QoKVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBIaWRlcyBhIGxpYnJhcnkgZWxlbWVudCBvbmNlIGl0J3MgYmVlbiBwbGFjZWQgaW4gdGhlIHdvcmtzcGFjZS5cblx0XHQgKiBDb21wbGV4IGZpZWxkcyBzdGF5IHZpc2libGUsIHNvIHRoZXkgY2FuIHN0aWxsIGJlIGV4cGFuZGVkIGludG8gbmVzdGVkIHNpZGViYXJzLlxuXHRcdCAqIEBwYXJhbSB7SlF1ZXJ5fSAkbGlicmFyeUVsZW1lbnRcblx0XHQgKi9cblx0XHRoaWRlTGlicmFyeUVsZW1lbnQ6IGZ1bmN0aW9uICgkbGlicmFyeUVsZW1lbnQpIHtcblx0XHRcdGlmICghJGxpYnJhcnlFbGVtZW50Lmxlbmd0aCB8fCAkbGlicmFyeUVsZW1lbnQuaGFzQ2xhc3MoJ2NvbXBsZXgtZmllbGQnKSkgcmV0dXJuXG5cblx0XHRcdCRsaWJyYXJ5RWxlbWVudC5hZGRDbGFzcygnaGlkZGVuJylcblxuXHRcdFx0aWYgKCRsaWJyYXJ5RWxlbWVudC5zaWJsaW5ncygnLmZsZC1lbGVtZW50Om5vdCguaGlkZGVuKScpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHQkbGlicmFyeUVsZW1lbnQuY2xvc2VzdCgnLmZsZC1maWVsZC1ncm91cCcpLmFkZENsYXNzKCdoaWRkZW4nKVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBAcGFyYW0ge3N0cmluZ30gaGFuZGxlXG5cdFx0ICovXG5cdFx0cmVtb3ZlRmllbGRCeUhhbmRsZTogZnVuY3Rpb24gKGhhbmRsZSkge1xuXHRcdFx0dGhpcy5maW5kTGlicmFyeUVsZW1lbnQoaGFuZGxlKVxuXHRcdFx0XHQucmVtb3ZlQ2xhc3MoJ2hpZGRlbicpXG5cdFx0XHRcdC5jbG9zZXN0KCcuZmxkLWZpZWxkLWdyb3VwJylcblx0XHRcdFx0LnJlbW92ZUNsYXNzKCdoaWRkZW4nKVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBAcmV0dXJucyB7TGF5b3V0Q29uZmlnfVxuXHRcdCAqL1xuXHRcdGdldCBjb25maWcoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY29uZmlnXG5cdFx0fSxcblxuXHRcdC8qKlxuXHRcdCAqIEBwYXJhbSB7TGF5b3V0Q29uZmlnfSBjb25maWdcblx0XHQgKi9cblx0XHRzZXQgY29uZmlnKGNvbmZpZykge1xuXHRcdFx0dGhpcy5fY29uZmlnID0gY29uZmlnXG5cdFx0XHR0aGlzLiRjb25maWdJbnB1dC52YWwoSlNPTi5zdHJpbmdpZnkoY29uZmlnKSlcblx0XHR9LFxuXG5cdFx0LyoqXG5cdFx0ICogQHBhcmFtIHsoY29uZmlnOiBMYXlvdXRDb25maWcpID0+IExheW91dENvbmZpZyB8IGZhbHNlfSBjYWxsYmFjayBSZXR1cm4gYGZhbHNlYCB0byBsZWF2ZSB0aGUgY29uZmlnIHVuY2hhbmdlZC5cblx0XHQgKi9cblx0XHR1cGRhdGVDb25maWc6IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuXHRcdFx0Y29uc3QgY29uZmlnID0gY2FsbGJhY2sodGhpcy5jb25maWcpXG5cdFx0XHRpZiAoY29uZmlnICE9PSBmYWxzZSkge1xuXHRcdFx0XHR0aGlzLmNvbmZpZyA9IGNvbmZpZ1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBAcGFyYW0ge3N0cmluZ30gY29udGVudHNcblx0XHQgKiBAcGFyYW0ge3N0cmluZ30gW2pzXVxuXHRcdCAqIEByZXR1cm5zIHthbnl9IEEgQ3JhZnQuU2xpZGVvdXRcblx0XHQgKi9cblx0XHRjcmVhdGVTbGlkZW91dDogZnVuY3Rpb24gKGNvbnRlbnRzLCBqcykge1xuXHRcdFx0Y29uc3QgJGJvZHkgPSAkKCc8ZGl2Lz4nLCB7IGNsYXNzOiAnZmxkLWVsZW1lbnQtc2V0dGluZ3MtYm9keScgfSlcblx0XHRcdCQoJzxkaXYvPicsIHsgY2xhc3M6ICdmaWVsZHMnLCBodG1sOiBjb250ZW50cyB9KS5hcHBlbmRUbygkYm9keSlcblx0XHRcdGNvbnN0ICRmb290ZXIgPSAkKCc8ZGl2Lz4nLCB7IGNsYXNzOiAnZmxkLWVsZW1lbnQtc2V0dGluZ3MtZm9vdGVyJyB9KVxuXHRcdFx0JCgnPGRpdi8+JywgeyBjbGFzczogJ2ZsZXgtZ3JvdycgfSkuYXBwZW5kVG8oJGZvb3Rlcilcblx0XHRcdGNvbnN0ICRjYW5jZWxCdG4gPSBDcmFmdC51aVxuXHRcdFx0XHQuY3JlYXRlQnV0dG9uKHtcblx0XHRcdFx0XHRsYWJlbDogQ3JhZnQudCgnYXBwJywgJ0Nsb3NlJyksIHNwaW5uZXI6IHRydWUsXG5cdFx0XHRcdH0pXG5cdFx0XHRcdC5hcHBlbmRUbygkZm9vdGVyKVxuXHRcdFx0Q3JhZnQudWlcblx0XHRcdFx0LmNyZWF0ZVN1Ym1pdEJ1dHRvbih7XG5cdFx0XHRcdFx0Y2xhc3M6ICdzZWNvbmRhcnknLCBsYWJlbDogQ3JhZnQudCgnYXBwJywgJ0FwcGx5JyksIHNwaW5uZXI6IHRydWUsXG5cdFx0XHRcdH0pXG5cdFx0XHRcdC5hcHBlbmRUbygkZm9vdGVyKVxuXHRcdFx0Y29uc3QgJGNvbnRlbnRzID0gJGJvZHkuYWRkKCRmb290ZXIpXG5cblx0XHRcdGNvbnN0IHNsaWRlb3V0ID0gbmV3IENyYWZ0LlNsaWRlb3V0KCRjb250ZW50cywge1xuXHRcdFx0XHRjb250YWluZXJFbGVtZW50OiAnZm9ybScsIGNvbnRhaW5lckF0dHJpYnV0ZXM6IHtcblx0XHRcdFx0XHRhY3Rpb246ICcnLCBtZXRob2Q6ICdwb3N0Jywgbm92YWxpZGF0ZTogJycsIGNsYXNzOiAnZmxkLWVsZW1lbnQtc2V0dGluZ3MnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSlcblx0XHRcdHNsaWRlb3V0Lm9uKCdvcGVuJywgKCkgPT4ge1xuXHRcdFx0XHQvLyBIb2xkIG9mZiBhIHNlYyB1bnRpbCBpdCdzIHBvc2l0aW9uZWQuLi5cblx0XHRcdFx0R2FybmlzaC5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuXHRcdFx0XHRcdC8vIEZvY3VzIG9uIHRoZSBmaXJzdCB0ZXh0IGlucHV0XG5cdFx0XHRcdFx0c2xpZGVvdXQuJGNvbnRhaW5lci5maW5kKCcudGV4dDpmaXJzdCcpLmZvY3VzKClcblx0XHRcdFx0fSlcblx0XHRcdH0pXG5cblx0XHRcdCRjYW5jZWxCdG4ub24oJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0XHRzbGlkZW91dC5jbG9zZSgpXG5cdFx0XHR9KVxuXG5cdFx0XHRpZiAoanMpIHtcblx0XHRcdFx0ZXZhbChqcylcblx0XHRcdH1cblxuXHRcdFx0Q3JhZnQuaW5pdFVpRWxlbWVudHMoc2xpZGVvdXQuJGNvbnRhaW5lcilcblxuXHRcdFx0cmV0dXJuIHNsaWRlb3V0XG5cdFx0fSxcblx0fSxcbilcblxuZXhwb3J0IGRlZmF1bHQgRGVzaWduZXIiLCJpbXBvcnQgRGVzaWduZXIgZnJvbSAnLi9FeHBvcnRlckxheW91dC9EZXNpZ25lci5qcydcblxuQ3JhZnQuRXhwb3J0ZXJMYXlvdXREZXNpZ25lciA9IERlc2lnbmVyXG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0NBQUEsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNO0NBQzNDLENBQUM7Q0FDRCxFQUFFLEdBQUcsRUFBRSxJQUFJO0NBQ1gsRUFBRSxVQUFVLEVBQUUsSUFBSTtDQUNsQixFQUFFLGtCQUFrQixFQUFFLElBQUk7Q0FDMUIsRUFBRSxRQUFRLEVBQUUsSUFBSTs7Q0FFaEIsRUFBRSxHQUFHLEVBQUUsSUFBSTtDQUNYLEVBQUUsT0FBTyxFQUFFLEtBQUs7Q0FDaEIsRUFBRSxTQUFTLEVBQUUsSUFBSTtDQUNqQixFQUFFLFdBQVcsRUFBRSxLQUFLO0NBQ3BCLEVBQUUsaUJBQWlCLEVBQUUsSUFBSTtDQUN6QixFQUFFLFFBQVEsRUFBRSxJQUFJOztDQUVoQjtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBLEVBQUUsSUFBSSxFQUFFLFVBQVUsR0FBRyxFQUFFLFVBQVUsRUFBRTtDQUNuQyxHQUFHLElBQUksQ0FBQyxHQUFHLEdBQUc7Q0FDZCxHQUFHLElBQUksQ0FBQyxVQUFVLEdBQUc7Q0FDckIsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsSUFBSTtDQUMzQyxH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{"version":3,"file":"dynex.js","sources":["assets/Cp/src/js/ExporterLayout/DesignerElement.js","assets/Cp/src/js/ExporterLayout/DesignerTab.js","assets/Cp/src/js/ExporterLayout/ComplexFields.js","assets/Cp/src/js/ExporterLayout/CustomFields.js","assets/Cp/src/js/ExporterLayout/SidebarLibrary.js","assets/Cp/src/js/ExporterLayout/DesignerSidebar.js","assets/Cp/src/js/ExporterLayout/ElementDrag.js","assets/Cp/src/js/ExporterLayout/Designer.js","assets/Cp/src/js/dynex.js"],"sourcesContent":["const DesignerElement = Garnish.Base.extend(\n\t{\n\t\ttab: null,\n\t\t$container: null,\n\t\t$settingsContainer: null,\n\t\t$editBtn: null,\n\n\t\tuid: null,\n\t\tisField: false,\n\t\tattribute: null,\n\t\thasSettings: false,\n\t\tsettingsNamespace: null,\n\t\tslideout: null,\n\n\t\t/**\n\t\t * Constructor\n\t\t *\n\t\t * @this {typeof DesignerElement}\n\t\t * @param {DesignerTab} tab    Elements that should be draggable right away. (Can be skipped.)\n\t\t * @param {JQuery<HTMLElement>|HTMLElement} $container Any settings that should override the defaults.\n\t\t */\n\t\tinit: function (tab, $container) {\n\t\t\tthis.tab = tab\n\t\t\tthis.$container = $container\n\t\t\tthis.$container.data('fld-element', this)\n\t\t\tthis.uid = this.$container.data('uid')\n\n\t\t\tif (!this.uid) {\n\t\t\t\tthis.uid = Craft.uuid()\n\t\t\t\tthis.config = $.extend(this.$container.data('config'), { uid: this.uid })\n\t\t\t}\n\n\t\t\tthis.isField = this.$container.hasClass('fld-field')\n\n\t\t\tif (this.isField) {\n\t\t\t\tthis.attribute = this.$container.attr('data-handle')\n\t\t\t}\n\n\t\t\tthis.settingsNamespace = this.$container\n\t\t\t\t.data('settings-namespace')\n\t\t\t\t.replace(/\\bELEMENT_UID\\b/g, this.uid)\n\t\t\tlet settingsHtml = (this.$container.data('settings-html') || '').replace(/\\bELEMENT_UID\\b/g, this.uid)\n\t\t\tthis.hasSettings = settingsHtml\n\n\t\t\tif (this.hasSettings) {\n\t\t\t\t// create the setting container\n\t\t\t\tthis.$settingsContainer = $('<div/>', {\n\t\t\t\t\tclass: 'hidden',\n\t\t\t\t})\n\n\t\t\t\t// create the edit button\n\t\t\t\tthis.$editBtn = $('<a/>', {\n\t\t\t\t\trole: 'button', tabindex: 0, class: 'settings icon', title: Craft.t('app', 'Edit'),\n\t\t\t\t})\n\n\t\t\t\tconst showSettings = () => {\n\t\t\t\t\tif (!this.slideout) {\n\t\t\t\t\t\tthis.createSettings(settingsHtml)\n\t\t\t\t\t} else {\n\t\t\t\t\t\tthis.slideout.open()\n\t\t\t\t\t}\n\t\t\t\t}\n\n\t\t\t\tthis.$editBtn.on('click', showSettings)\n\t\t\t\tthis.$container.on('dblclick', showSettings)\n\t\t\t}\n\n\t\t\tthis.initUi()\n\n\t\t\t// cleanup\n\t\t\tthis.$container.attr('data-keywords', null)\n\t\t\tthis.$container.attr('data-settings-html', null)\n\t\t},\n\n\t\tinitUi: function () {\n\t\t\tif (this.hasSettings) {\n\t\t\t\tthis.$editBtn.appendTo(this.$container)\n\t\t\t}\n\t\t},\n\n\t\tcreateSettings: function (settingsHtml) {\n\t\t\tconst settingsJs = (this.$container.data('settings-js') || '').replace(/\\bELEMENT_UID\\b/g, this.uid)\n\t\t\tthis.slideout = this.tab.designer.createSlideout(settingsHtml, settingsJs)\n\n\t\t\tthis.slideout.$container.on('submit', (ev) => {\n\t\t\t\tev.preventDefault()\n\t\t\t\tthis.applySettings()\n\t\t\t})\n\n\t\t\tthis.trigger('createSettings')\n\t\t},\n\n\t\tapplySettings: function () {\n\t\t\t// The label input is namespaced, e.g. `element-<uid>[label]`\n\t\t\tconst label = String(this.slideout.$container.find('input[name$=\"[label]\"], input[name=\"label\"]').val() ?? '').trim()\n\n\t\t\tthis.updateConfig((config) => {\n\t\t\t\t// A blank label falls back to the field's default label\n\t\t\t\tconfig.label = label || config.defaultLabel\n\t\t\t\treturn config\n\t\t\t})\n\n\t\t\tthis.$container\n\t\t\t\t.find('.fld-element-label h4')\n\t\t\t\t.text(this.config.label)\n\t\t\t\t.attr('title', this.config.label)\n\n\t\t\tthis.slideout.close()\n\t\t},\n\n\t\tget index() {\n\t\t\tconst tabConfig = this.tab.config\n\t\t\tif (typeof tabConfig === 'undefined') {\n\t\t\t\treturn -1\n\t\t\t}\n\t\t\treturn tabConfig.elements.findIndex((c) => c.uid === this.uid)\n\t\t},\n\n\t\tget config() {\n\t\t\tif (!this.uid) {\n\t\t\t\tthrow 'Tab is missing its UID'\n\t\t\t}\n\t\t\tlet config = this.tab.config.elements.find((c) => c.uid === this.uid)\n\t\t\tif (!config) {\n\t\t\t\tconfig = {\n\t\t\t\t\tuid: this.uid,\n\t\t\t\t}\n\t\t\t\tthis.config = config\n\t\t\t}\n\t\t\treturn config\n\t\t},\n\n\t\tset config(config) {\n\t\t\tconst tabConfig = this.tab.config\n\t\t\tconst index = this.index\n\t\t\tif (index !== -1) {\n\t\t\t\ttabConfig.elements[index] = config\n\t\t\t} else {\n\t\t\t\tconst newIndex = $.inArray(this.$container[0], this.$container.parent().children('.fld-element'))\n\t\t\t\ttabConfig.elements.splice(newIndex, 0, config)\n\t\t\t}\n\t\t\tthis.tab.config = tabConfig\n\t\t},\n\n\t\tupdateConfig: function (callback) {\n\t\t\tconst config = callback(this.config)\n\t\t\tif (config !== false) {\n\t\t\t\tthis.config = config\n\t\t\t}\n\t\t},\n\n\t\tupdatePositionInConfig: function () {\n\t\t\tthis.tab.updateConfig((config) => {\n\t\t\t\tconst elementConfig = this.config\n\t\t\t\tconst oldIndex = this.index\n\t\t\t\tconst newIndex = $.inArray(this.$container[0], this.$container.parent().children('.fld-element'))\n\t\t\t\tif (oldIndex !== -1) {\n\t\t\t\t\tconfig.elements.splice(oldIndex, 1)\n\t\t\t\t}\n\t\t\t\tconfig.elements.splice(newIndex, 0, elementConfig)\n\t\t\t\treturn config\n\t\t\t})\n\t\t},\n\n\t\tdestroy: function () {\n\t\t\tthis.tab.updateConfig((config) => {\n\t\t\t\tconst index = this.index\n\t\t\t\tif (index === -1) {\n\t\t\t\t\treturn false\n\t\t\t\t}\n\t\t\t\tconfig.elements.splice(index, 1)\n\t\t\t\treturn config\n\t\t\t})\n\n\t\t\tthis.tab.designer.elementDrag.removeItems(this.$container)\n\t\t\tthis.$container.remove()\n\n\t\t\tif (this.slideout) {\n\t\t\t\tthis.slideout.destroy()\n\t\t\t\tthis.slideout = null\n\t\t\t}\n\n\t\t\tif (this.isField) {\n\t\t\t\tthis.tab.designer.removeFieldByHandle(this.attribute)\n\t\t\t}\n\n\t\t\tthis.base()\n\t\t},\n\t},\n\t{},\n)\n\nexport default DesignerElement","import DesignerElement from './DesignerElement.js'\n\nconst DesignerTab = Garnish.Base.extend(\n\t{\n\t\tdesigner: null,\n\t\tuid: null,\n\t\t$container: null,\n\t\tdestroyed: false,\n\n\t\tinit: function (designer, $container) {\n\t\t\tthis.designer = designer\n\t\t\tthis.$container = $container\n\t\t\tthis.$container.data('fld-tab', this)\n\t\t\tthis.uid = this.$container.data('uid')\n\n\t\t\t// New tab?\n\t\t\tif (!this.uid) {\n\t\t\t\tthis.uid = Craft.uuid()\n\t\t\t\tthis.config = {\n\t\t\t\t\tuid: this.uid,\n\t\t\t\t\tname: this.$container.find('.tabs .tab span').text(),\n\t\t\t\t\telements: [],\n\t\t\t\t}\n\t\t\t\tthis.$container.data('settings-namespace', this.designer.$container\n\t\t\t\t\t.data('new-tab-settings-namespace')\n\t\t\t\t\t.replace(/\\bTAB_UID\\b/g, this.uid))\n\n\t\t\t\tthis.$container.data('settings-html', this.designer.$container\n\t\t\t\t\t.data('new-tab-settings-html')\n\t\t\t\t\t.replace(/\\bTAB_UID\\b/g, this.uid)\n\t\t\t\t\t.replace(/\\bTAB_NAME\\b/g, this.config.name))\n\n\t\t\t\tthis.$container.data('settings-js', this.designer.$container\n\t\t\t\t\t.data('new-tab-settings-js')\n\t\t\t\t\t.replace(/\\bTAB_UID\\b/g, this.uid))\n\t\t\t}\n\n\t\t\t// initialize the elements\n\t\t\tconst $elements = this.$container.children('.fld-tabcontent').children()\n\n\t\t\tfor (let i = 0; i < $elements.length; i++) {\n\t\t\t\tthis.initElement($($elements[i]))\n\t\t\t}\n\t\t},\n\n\t\tinitElement: function ($element) {\n\t\t\treturn new DesignerElement(this, $element)\n\t\t},\n\n\t\tget index() {\n\t\t\treturn this.designer.config.tabs.findIndex((c) => c.uid === this.uid)\n\t\t},\n\n\t\tget config() {\n\t\t\tif (!this.uid) {\n\t\t\t\tthrow 'Tab is missing its UID'\n\t\t\t}\n\t\t\tlet config = this.designer.config.tabs.find((c) => c.uid === this.uid)\n\t\t\tif (!config) {\n\t\t\t\tconfig = {\n\t\t\t\t\tuid: this.uid, elements: [],\n\t\t\t\t}\n\t\t\t\tthis.config = config\n\t\t\t}\n\t\t\treturn config\n\t\t},\n\n\t\tset config(config) {\n\t\t\tif (this.destroyed) {\n\t\t\t\treturn\n\t\t\t}\n\n\t\t\t// Is the name changing?\n\t\t\tif (config.name && config.name !== this.config.name) {\n\t\t\t\tthis.$container.find('.tabs .tab span').text(config.name)\n\t\t\t}\n\n\t\t\tconst designerConfig = this.designer.config\n\t\t\tconst index = this.index\n\t\t\tif (index !== -1) {\n\t\t\t\tdesignerConfig.tabs[index] = config\n\t\t\t} else {\n\t\t\t\tconst newIndex = $.inArray(this.$container[0], this.$container.parent().children('.fld-tab'))\n\t\t\t\tdesignerConfig.tabs.splice(newIndex, 0, config)\n\t\t\t}\n\t\t\tthis.designer.config = designerConfig\n\t\t},\n\n\t\tupdateConfig: function (callback) {\n\t\t\tif (this.destroyed) {\n\t\t\t\treturn\n\t\t\t}\n\n\t\t\tconst config = callback(this.config)\n\t\t\tif (config !== false) {\n\t\t\t\tthis.config = config\n\t\t\t}\n\t\t},\n\n\t\tdestroy: function () {\n\t\t\tif (this.destroyed) {\n\t\t\t\treturn\n\t\t\t}\n\n\t\t\tthis.destroyed = true\n\n\t\t\tthis.designer.updateConfig((config) => {\n\t\t\t\tconst index = this.index\n\t\t\t\tif (index === -1) {\n\t\t\t\t\treturn false\n\t\t\t\t}\n\t\t\t\tconfig.tabs.splice(index, 1)\n\t\t\t\treturn config\n\t\t\t})\n\n\t\t\t// First destroy the tab's elements\n\t\t\tlet $elements = this.$container.find('.fld-element')\n\t\t\tfor (let i = 0; i < $elements.length; i++) {\n\t\t\t\t$elements.eq(i).data('fld-element').destroy()\n\t\t\t}\n\n\t\t\tthis.designer.tabGrid.removeItems(this.$container)\n\t\t\tthis.designer.tabDrag.removeItems(this.$container)\n\t\t\tthis.$container.remove()\n\n\t\t\tthis.base()\n\t\t},\n\t}, {})\n\nexport default DesignerTab\n","const ComplexFields = Garnish.Base.extend(\n\t{\n\t\tlibrary: null,\n\t\tsidebar: null,\n\t\tdesigner: null,\n\n\t\t/**\n\t\t * Constructor\n\t\t * @param {SidebarLibrary} library\n\t\t */\n\t\tinit: function (library) {\n\t\t\tthis.library = library\n\t\t\tthis.sidebar = this.library.sidebar\n\t\t\tthis.designer = this.sidebar.designer\n\n\t\t\t// Relation fields and block fields (Matrix, Neo) both expand into a nested sidebar\n\t\t\tthis.addListener(this.library.$container.find('.fld-element.complex-field'), 'click', (ev) => {\n\t\t\t\tif ($(ev.target).closest('.icon-holder').length === 0) return\n\n\t\t\t\tthis.expand($(ev.currentTarget))\n\t\t\t})\n\t\t},\n\n\t\t/**\n\t\t * Opens a nested sidebar with the fields an item expands into.\n\t\t * @param {JQuery} $item\n\t\t */\n\t\texpand: function ($item) {\n\t\t\tthis.library.$search.blur()\n\n\t\t\t// Close sidebars opened from this one (or deeper), so the new sidebar replaces them\n\t\t\tthis.designer.removeSidebarsAfter(this.sidebar)\n\n\t\t\tCraft.sendActionRequest('POST', 'dynex/exporters/complex-field', {\n\t\t\t\tdata: {\n\t\t\t\t\tcurrentNesting: this.designer.$container.data('nestingLevels'),\n\t\t\t\t\tconfig: JSON.stringify($item.data('config')),\n\t\t\t\t},\n\t\t\t})\n\t\t\t\t.then(({ data }) => this.addNestedSidebar(data.sidebarHtml))\n\t\t\t\t.catch(({ response }) => Craft.cp.displayError(response?.data?.message))\n\t\t},\n\n\t\t/**\n\t\t * @param {string} sidebarHtml\n\t\t */\n\t\taddNestedSidebar: function (sidebarHtml) {\n\t\t\tconst $sidebar = $(sidebarHtml)\n\n\t\t\tconst levels = this.designer.$container.data('nestingLevels') + 1\n\t\t\tthis.designer.$container.css('--nesting-levels', levels)\n\t\t\tthis.designer.$container.data('nestingLevels', levels)\n\n\t\t\tthis.sidebar.$container.after($sidebar)\n\t\t\tthis.designer.addSidebar($sidebar)\n\t\t\tthis.sidebar.$container.scrollTop(0)\n\n\t\t\tthis.designer.elementDrag.addItems($sidebar.find('.fld-element:not(.block-field)'))\n\t\t},\n\t},\n)\n\nexport default ComplexFields","const CustomFields = Garnish.Base.extend(\n\t{\n\t\tlibrary: null,\n\t\tsidebar: null,\n\t\tdesigner: null,\n\n\t\t/**\n\t\t * Constructor\n\t\t * @param {SidebarLibrary} library\n\t\t */\n\t\tinit: function (library) {\n\t\t\tthis.library = library\n\t\t\tthis.sidebar = this.library.sidebar\n\t\t\tthis.designer = this.sidebar.designer\n\n\t\t\tthis.addListener(this.library.$fields.filter('.unused'), 'click', (e) => this.addElement(e))\n\t\t\tthis.hideUsedLibraryElements()\n\t\t},\n\n\t\thideUsedLibraryElements: function () {\n\t\t\tconst $libraryElements = this.library.$fields.filter('.unused')\n\n\t\t\tthis.designer.$tabContainer.find('.fld-element.fld-field').each((i, el) => {\n\t\t\t\tthis.designer.hideLibraryElement(\n\t\t\t\t\t$libraryElements.filter((i, item) => item.dataset.handle === el.dataset.handle),\n\t\t\t\t)\n\t\t\t})\n\t\t},\n\n\t\t/**\n\t\t * Adds a new element from the sidebar to the currently active workspace tab when the\n\t\t * \"add-element\" button is clicked. Clones the element, appends it to the tab content,\n\t\t * initializes its layout behavior, and updates the UI accordingly.\n\t\t *\n\t\t * @function\n\t\t * @param {MouseEvent} event - The mouse event triggered by clicking a sidebar element.\n\t\t *\n\t\t * @returns {false|void} Returns false to prevent default click behavior if successful, otherwise void.\n\t\t */\n\t\taddElement: function (event) {\n\t\t\tif ($(event.target).closest('.add-element').length === 0) return\n\n\t\t\tconst $item = $(event.currentTarget)\n\t\t\tif ($item.hasClass('hidden') || $item.hasClass('block-field')) return\n\n\t\t\tconst $activePane = this.designer.$tabContainer.find('.fld-tab:visible').first()\n\n\t\t\tif (!$activePane.length) {\n\t\t\t\tconsole.warn('No visible tab pane found to drop the item into.')\n\t\t\t\treturn\n\t\t\t}\n\n\t\t\tconst currentTab = $activePane.data('fld-tab')\n\t\t\tif (!currentTab) {\n\t\t\t\tconsole.warn('Could not get tab instance for visible pane.')\n\t\t\t\treturn\n\t\t\t}\n\n\t\t\tconst $clonedItem = $item.clone().removeClass('unused hidden filtered')\n\t\t\t$clonedItem.appendTo($activePane.find('.fld-tabcontent'))\n\t\t\tthis.ensureVisible($clonedItem)\n\n\t\t\tthis.designer.hideLibraryElement($item)\n\n\t\t\tconst clonedItem = currentTab.initElement($clonedItem)\n\t\t\tthis.designer.elementDrag.addItems($clonedItem)\n\t\t\tclonedItem.updatePositionInConfig()\n\t\t\tthis.designer.tabGrid.refreshCols(true)\n\n\t\t\treturn false\n\t\t},\n\n\t\t/**\n\t\t * Utility to ensure an element is visibly displayed\n\t\t * @param {jQuery} $el\n\t\t */\n\t\tensureVisible: function ($el) {\n\t\t\tif ($el.css('visibility') === 'hidden') {\n\t\t\t\t$el.css('visibility', 'visible')\n\t\t\t}\n\t\t},\n\t},\n)\n\nexport default CustomFields","import ComplexFields from './ComplexFields.js'\nimport CustomFields from './CustomFields.js'\n\nconst SidebarLibrary = Garnish.Base.extend(\n\t{\n\t\t$container: null,\n\t\t$search: null,\n\t\t$clearSearchBtn: null,\n\t\t$fields: null,\n\t\t/** @type {DesignerSidebar} */\n\t\tsidebar: null,\n\n\t\t/**\n\t\t * Constructor\n\t\t *\n\t\t * @this {typeof SidebarLibrary}\n\t\t * @param {JQuery<HTMLElement>|HTMLElement|string} container CSS selector, HTML Element, or JQuery wrapper of the element\n\t\t * @param {DesignerSidebar} sidebar\n\t\t */\n\t\tinit: function (container, sidebar) {\n\t\t\tthis.$container = $(container)\n\t\t\tthis.sidebar = sidebar\n\t\t\tthis.$fields = this.$container.find('.fld-element')\n\t\t\tlet $fieldSearchContainer = this.$container.children('.search')\n\t\t\tif ($fieldSearchContainer.length === 0) return\n\n\t\t\tthis.$search = $fieldSearchContainer.children('input')\n\t\t\tthis.$clearSearchBtn = $fieldSearchContainer.children('.clear-btn')\n\t\t\tnew ComplexFields(this)\n\t\t\tnew CustomFields(this)\n\n\t\t\tthis.addListener(this.$search, 'input', () => {\n\t\t\t\tlet val = this.$search.val().toLowerCase().replace(/['\"]/g, '')\n\t\t\t\tif (!val) {\n\t\t\t\t\tthis.$container.find('.filtered').removeClass('filtered')\n\t\t\t\t\tthis.$clearSearchBtn.addClass('hidden')\n\t\t\t\t\treturn\n\t\t\t\t}\n\n\t\t\t\tthis.$clearSearchBtn.removeClass('hidden')\n\t\t\t\tlet $matches = this.$fields\n\t\t\t\t\t.filter(`[data-keywords*=\"${val}\"]`)\n\t\t\t\t\t.add(this.$container.children('.fld-element'))\n\t\t\t\t\t.removeClass('filtered')\n\t\t\t\tthis.$fields.not($matches).addClass('filtered')\n\t\t\t})\n\n\t\t\tthis.addListener(this.$search, 'keydown', (ev) => {\n\t\t\t\tswitch (ev.keyCode) {\n\t\t\t\t\tcase Garnish.ESC_KEY:\n\t\t\t\t\t\tthis.$search.val('').trigger('input')\n\t\t\t\t\t\tbreak\n\t\t\t\t\tcase Garnish.RETURN_KEY:\n\t\t\t\t\t\tev.preventDefault()\n\t\t\t\t\t\tbreak\n\t\t\t\t}\n\t\t\t})\n\n\t\t\tthis.addListener(this.$clearSearchBtn, 'click', () => {\n\t\t\t\tthis.$search.val('').trigger('input')\n\t\t\t})\n\t\t},\n\t})\n\nexport default SidebarLibrary","import SidebarLibrary from './SidebarLibrary.js'\n\nconst DesignerSidebar = Garnish.Base.extend({\n\t/** @type {JQuery} */\n\t$container: /** @type {any} */ (null),\n\t$libraryToggle: null,\n\t/** @type {SidebarLibrary?} */\n\tselectedLibrary: null,\n\t/** @type {SidebarLibrary[]} */\n\tlibraries: null,\n\t$libraryContainers: [],\n\tdesigner: null,\n\t_parentConfig: null,\n\t_config: null,\n\n\t/**\n\t * @param {typeof Designer} designer\n\t * @param {JQuery<HTMLElement>|HTMLElement|string} container CSS selector, HTML Element, or JQuery wrapper of the element\n\t */\n\tinit: function (designer, container) {\n\t\tthis.$container = $(container)\n\t\tthis.designer = designer\n\t\tthis.libraries = []\n\t\tthis.$libraryContainers = $.makeArray(this.$container.children('.fld-library'))\n\t\tfor (let [index, $libraryContainer] of this.$libraryContainers.entries()) {\n\t\t\tlet library = new SidebarLibrary($libraryContainer, this)\n\t\t\tif (index === 0) this.selectedLibrary = library\n\t\t\tthis.libraries.push(library)\n\t\t}\n\n\t\t// Nested sidebars have a close button (Escape closes the last one too)\n\t\tthis.addListener(this.$container.children('.sidebar-name-wrapper').find('.sidebar-close'), 'activate', () => {\n\t\t\tthis.designer.closeSidebar(this)\n\t\t})\n\n\t\tlet $libraryPicker = this.$container.children('.btngroup')\n\t\tnew Craft.Listbox($libraryPicker, {\n\t\t\tonChange: ($selectedOption) => {\n\t\t\t\tthis.selectedLibrary.$container.addClass('hidden')\n\t\t\t\tthis.selectedLibrary = this.getLibrary($selectedOption.data('library'))\n\t\t\t\tthis.selectedLibrary.$container\n\t\t\t\t\t.removeClass('hidden')\n\t\t\t},\n\t\t})\n\t},\n\n\tgetParentConfig: function () {\n\t\treturn this.$container.data('parentConfig')\n\t},\n\n\t/**\n\t * @param {string} handle\n\t * @return {SidebarLibrary}\n\t */\n\tgetLibrary: function (handle) {\n\t\treturn this.libraries.find(library => handle === library.$container.data('library'))\n\t}\n}, {})\n\nexport default DesignerSidebar","const ElementDrag = Garnish.Drag.extend({\n\tdraggingLibraryElement: false,\n\tdraggingField: false,\n\toriginalTab: null,\n\tdesigner: null,\n\t$insertion: null,\n\tshowingInsertion: false,\n\t$caboose: null,\n\n\tinit: function (designer, settings) {\n\t\tthis.designer = designer\n\t\tthis.base(this.findItems(), settings)\n\t},\n\n\tremoveCaboose: function () {\n\t\tthis.$items = this.$items.not(this.$caboose)\n\t\tthis.$caboose.remove()\n\t},\n\n\tswapDraggeeWithInsertion: function () {\n\t\tthis.$insertion.insertBefore(this.$draggee)\n\t\tthis.$draggee.detach()\n\t\tthis.$items = $().add(this.$items.not(this.$draggee).add(this.$insertion))\n\t\tthis.showingInsertion = true\n\t},\n\n\tswapInsertionWithDraggee: function () {\n\t\tthis.$insertion.replaceWith(this.$draggee)\n\t\tthis.$items = $().add(this.$items.not(this.$insertion).add(this.$draggee))\n\t\tthis.showingInsertion = false\n\t},\n\n\tsetMidpoints: function () {\n\t\tfor (let i = 0; i < this.$items.length; i++) {\n\t\t\tlet $item = $(this.$items[i])\n\t\t\tlet offset = $item.offset()\n\n\t\t\t// Skip library elements\n\t\t\tif ($item.hasClass('unused')) {\n\t\t\t\tcontinue\n\t\t\t}\n\n\t\t\t$item.data('midpoint', {\n\t\t\t\tleft: offset.left + $item.outerWidth() / 2, top: offset.top + $item.outerHeight() / 2,\n\t\t\t})\n\t\t}\n\t},\n\n\tgetClosestItem: function () {\n\t\tthis.getClosestItem._closestItem = null\n\t\tthis.getClosestItem._closestItemMouseDiff = null\n\n\t\tfor (this.getClosestItem._i = 0; this.getClosestItem._i < this.$items.length; this.getClosestItem._i++) {\n\t\t\tthis.getClosestItem._$item = $(this.$items[this.getClosestItem._i])\n\n\t\t\tthis.getClosestItem._midpoint = this.getClosestItem._$item.data('midpoint')\n\t\t\tif (!this.getClosestItem._midpoint) {\n\t\t\t\tcontinue\n\t\t\t}\n\n\t\t\tthis.getClosestItem._mouseDiff = Garnish.getDist(this.getClosestItem._midpoint.left, this.getClosestItem._midpoint.top, this.mouseX, this.mouseY)\n\n\t\t\tif (this.getClosestItem._closestItem === null || this.getClosestItem._mouseDiff < this.getClosestItem._closestItemMouseDiff) {\n\t\t\t\tthis.getClosestItem._closestItem = this.getClosestItem._$item[0]\n\t\t\t\tthis.getClosestItem._closestItemMouseDiff = this.getClosestItem._mouseDiff\n\t\t\t}\n\t\t}\n\n\t\treturn this.getClosestItem._closestItem\n\t},\n\n\tcheckForNewClosestItem: function () {\n\t\t// Is there a new closest item?\n\t\tthis.checkForNewClosestItem._closestItem = this.getClosestItem()\n\n\t\tif (this.checkForNewClosestItem._closestItem === this.$insertion[0]) {\n\t\t\treturn\n\t\t}\n\n\t\tif (this.showingInsertion && $.inArray(this.$insertion[0], this.$items) < $.inArray(this.checkForNewClosestItem._closestItem, this.$items) && $.inArray(this.checkForNewClosestItem._closestItem, this.$caboose) === -1) {\n\t\t\tthis.$insertion.insertAfter(this.checkForNewClosestItem._closestItem)\n\t\t} else {\n\t\t\tthis.$insertion.insertBefore(this.checkForNewClosestItem._closestItem)\n\t\t}\n\n\t\tthis.$items = $().add(this.$items.add(this.$insertion))\n\t\tthis.showingInsertion = true\n\t\tthis.designer.tabGrid.refreshCols(true)\n\t\tthis.setMidpoints()\n\t},\n\n\tfindItems: function () {\n\t\t// Return all of the used + unused fields\n\t\treturn this.designer.$tabContainer\n\t\t\t.find('.fld-element')\n\t\t\t.add(this.designer.selectedSidebar.$container.find('.fld-element:not(.block-field)'))\n\t},\n\n\t/**\n\t * @param {JQuery<HTMLElement>[]} items Elements that should be draggable.\n\t */\n\taddItems: function (items) {\n\t\titems = $.makeArray(items)\n\n\t\tfor (const item of items) {\n\t\t\tif ($.data(item, 'drag')) {\n\t\t\t\tconsole.warn('Element was added to more than one dragger')\n\t\t\t\t$.data(item, 'drag').removeItems(item)\n\t\t\t}\n\n\t\t\t$.data(item, 'drag', this)\n\n\t\t\t// Store the handler reference on the element\n\t\t\tconst handler = (ev) => {\n\t\t\t\tthis._handleMouseDown(ev, item)\n\t\t\t}\n\t\t\t$.data(item, 'mousedownHandler', handler)\n\n\t\t\tthis.addListener(this._getItemHandle(item), 'mousedown', handler)\n\t\t}\n\n\t\tthis.$items = this.$items.add(items)\n\t},\n\n\tonDragStart: function () {\n\t\tthis.base()\n\n\t\tthis.$insertion = this.createInsertion()\n\n\t\tthis.$caboose = this.createCaboose()\n\t\tthis.$items = $().add(this.$items.add(this.$caboose))\n\n\t\tGarnish.$bod.addClass('dragging')\n\n\t\tthis.draggingLibraryElement = this.$draggee.hasClass('unused')\n\t\tthis.draggingField = this.$draggee.hasClass('fld-field')\n\n\t\tif (!this.draggingLibraryElement) {\n\t\t\tthis.originalTab = this.$draggee.closest('.fld-tab').data('fld-tab')\n\t\t\tthis.swapDraggeeWithInsertion()\n\t\t} else {\n\t\t\tthis.originalTab = null\n\t\t}\n\n\t\tthis.setMidpoints()\n\t},\n\n\tonDrag: function () {\n\t\tif (this.isHoveringOverTab()) {\n\t\t\tthis.checkForNewClosestItem()\n\t\t} else if (this.showingInsertion) {\n\t\t\tthis.$insertion.remove()\n\t\t\tthis.$items = $().add(this.$items.not(this.$insertion))\n\t\t\tthis.showingInsertion = false\n\t\t\tthis.designer.tabGrid.refreshCols(true)\n\t\t\tthis.setMidpoints()\n\t\t}\n\n\t\tthis.base()\n\t},\n\n\tisHoveringOverTab: function () {\n\t\tfor (let i = 0; i < this.designer.tabGrid.$items.length; i++) {\n\t\t\tif (Garnish.hitTest(this.mouseX, this.mouseY, this.designer.tabGrid.$items.eq(i))) {\n\t\t\t\treturn true\n\t\t\t}\n\t\t}\n\n\t\treturn false\n\t},\n\n\tcreateCaboose: function () {\n\t\tlet $caboose = $()\n\t\tlet $fieldContainers = this.designer.$tabContainer.find('> .fld-tab > .fld-tabcontent')\n\n\t\tfor (let i = 0; i < $fieldContainers.length; i++) {\n\t\t\t$caboose = $caboose.add($('<div/>').appendTo($fieldContainers[i]))\n\t\t}\n\n\t\treturn $caboose\n\t},\n\n\tcreateInsertion: function () {\n\t\treturn $(`<div class=\"fld-element fld-insertion\" style=\"height: ${this.$draggee.outerHeight()}px;\"/>`)\n\t},\n\n\tonDragStop: function () {\n\t\tlet showingInsertion = this.showingInsertion\n\t\tif (showingInsertion) {\n\t\t\tif (this.draggingLibraryElement) {\n\t\t\t\t// Create a new element based on that one\n\t\t\t\tconst $element = this.$draggee.clone().removeClass('unused')\n\n\t\t\t\tif (this.draggingField) {\n\t\t\t\t\tthis.$draggee.css({ visibility: 'inherit' })\n\t\t\t\t\tthis.designer.hideLibraryElement(this.$draggee)\n\t\t\t\t}\n\n\t\t\t\t// Set this.$draggee to the clone, as if we were dragging that all along\n\t\t\t\tthis.$draggee = $element\n\n\t\t\t\t// Remember it for later\n\t\t\t\tthis.addItems($element)\n\t\t\t}\n\t\t} else if (!this.draggingLibraryElement) {\n\t\t\tconst $libraryElement = this.designer.findLibraryElement(this.$draggee.attr('data-handle'))\n\n\t\t\t// Destroy the original element (this also restores the library element)\n\t\t\tthis.$draggee.data('fld-element').destroy()\n\n\t\t\t// Set this.$draggee to the library element, as if we were dragging that all along\n\t\t\tthis.$draggee = $libraryElement\n\t\t}\n\n\t\tif (this.showingInsertion) {\n\t\t\tthis.swapInsertionWithDraggee()\n\t\t}\n\n\t\tthis.removeCaboose()\n\n\t\tthis.designer.tabGrid.refreshCols(true)\n\n\t\t// return the helpers to the draggees\n\t\tlet offset = this.$draggee.offset()\n\t\tif (!offset || (offset.top === 0 && offset.left === 0)) {\n\t\t\tthis.$draggee\n\t\t\t\t.css({\n\t\t\t\t\tdisplay: this.draggeeDisplay, visibility: 'visible', opacity: 0,\n\t\t\t\t})\n\t\t\t\t.velocity({ opacity: 1 }, Garnish.FX_DURATION)\n\t\t\tthis.helpers[0].velocity({ opacity: 0 }, Garnish.FX_DURATION, () => {\n\t\t\t\tthis._showDraggee()\n\t\t\t})\n\t\t} else {\n\t\t\tthis.returnHelpersToDraggees()\n\t\t}\n\n\t\tthis.base()\n\n\t\tGarnish.$bod.removeClass('dragging')\n\n\t\tthis.$draggee.css({\n\t\t\tdisplay: this.draggeeDisplay, visibility: this.draggingField || showingInsertion ? 'hidden' : 'visible',\n\t\t})\n\n\t\tif (showingInsertion) {\n\t\t\tconst tab = this.$draggee.closest('.fld-tab').data('fld-tab')\n\t\t\tlet element\n\n\t\t\tif (this.draggingLibraryElement) {\n\t\t\t\telement = tab.initElement(this.$draggee)\n\t\t\t} else {\n\t\t\t\telement = this.$draggee.data('fld-element')\n\n\t\t\t\t// New tab?\n\t\t\t\tif (tab !== this.originalTab) {\n\t\t\t\t\tconst config = element.config\n\n\t\t\t\t\tthis.originalTab.updateConfig((config) => {\n\t\t\t\t\t\tconst index = element.index\n\t\t\t\t\t\tif (index === -1) {\n\t\t\t\t\t\t\treturn false\n\t\t\t\t\t\t}\n\t\t\t\t\t\tconfig.elements.splice(index, 1)\n\t\t\t\t\t\treturn config\n\t\t\t\t\t})\n\n\t\t\t\t\tthis.$draggee.data('fld-element').tab = tab\n\t\t\t\t\telement.config = config\n\t\t\t\t}\n\t\t\t}\n\n\t\t\telement.updatePositionInConfig()\n\t\t}\n\t},\n})\nexport default ElementDrag","import DesignerTab from './DesignerTab.js'\nimport DesignerSidebar from './DesignerSidebar.js'\nimport ElementDrag from './ElementDrag.js'\n\n// Classes built with Garnish.Base.extend() are values, so JSDoc needs InstanceType<> to refer to their instances\n/** @typedef {InstanceType<typeof DesignerSidebar>} DesignerSidebarInstance */\n/** @typedef {InstanceType<typeof DesignerTab>} DesignerTabInstance */\n/** @typedef {InstanceType<typeof ElementDrag>} ElementDragInstance */\n\n/**\n * @typedef {object} LayoutTabConfig\n * @property {string} uid\n * @property {string} [name]\n * @property {Array<Record<string, any>>} elements\n */\n\n/**\n * The field layout config, kept in sync with the hidden `fieldLayout` input.\n * @typedef {object} LayoutConfig\n * @property {string} [uid]\n * @property {number} [id]\n * @property {LayoutTabConfig[]} tabs\n */\n\nconst Designer = Garnish.Base.extend(\n\t{\n\t\t// Every property is set in init(). Declaring the real type and casting the initial null\n\t\t// keeps TypeScript from inferring the type `null`.\n\t\t/** @type {JQuery} */\n\t\t$container: /** @type {any} */ (null),\n\t\t/** @type {JQuery} */\n\t\t$workspace: /** @type {any} */ (null),\n\t\t/** @type {JQuery} */\n\t\t$configInput: /** @type {any} */ (null),\n\t\t/** @type {JQuery} */\n\t\t$tabContainer: /** @type {any} */ (null),\n\t\t/** @type {DesignerSidebarInstance} */\n\t\tselectedSidebar: /** @type {any} */ (null),\n\t\t/** @type {DesignerSidebarInstance[]} */\n\t\t$sidebars: [],\n\n\t\t/** Craft.Grid, which isn’t typed. @type {any} */\n\t\ttabGrid: null,\n\t\t/** @type {ElementDragInstance} */\n\t\telementDrag: /** @type {any} */ (null),\n\n\t\t/** @type {LayoutConfig} */\n\t\t_config: /** @type {any} */ (null),\n\n\t\t/**\n\t\t * @param {string} container CSS selector for the designer container\n\t\t */\n\t\tinit: function (container) {\n\t\t\tthis.$container = $(container)\n\t\t\t// editexporter.js destroys the designer before rendering a new one\n\t\t\tthis.$container.data('designer', this)\n\n\t\t\tthis.$configInput = this.$container.children('input[data-config-input]')\n\t\t\tthis._config = JSON.parse(String(this.$configInput.val()))\n\t\t\tif (!this._config.tabs) {\n\t\t\t\tthis._config.tabs = []\n\t\t\t}\n\n\t\t\tthis.$workspace = this.$container.children('.fld-workspace')\n\t\t\tthis.$tabContainer = this.$workspace.children('.fld-tabs')\n\t\t\tthis.selectedSidebar = new DesignerSidebar(this, this.$container.find('.fld-sidebar'))\n\t\t\tthis.$sidebars = [this.selectedSidebar]\n\n\t\t\t// Set up the layout grids\n\t\t\tthis.tabGrid = new Craft.Grid(this.$tabContainer, {\n\t\t\t\titemSelector: '.fld-tab',\n\t\t\t\tminColWidth: 24 * 11,\n\t\t\t\tfillMode: 'grid',\n\t\t\t\tsnapToGrid: 24,\n\t\t\t})\n\n\t\t\t// `e` is a JQuery.TriggeredEvent, and `this` is the designer\n\t\t\tthis.addListener(window, 'keydown', e => {\n\t\t\t\tif (this.$container.data('nestingLevels') === 0) return\n\t\t\t\tif (e.key !== 'Escape') return\n\t\t\t\tif (e.target.closest('.fld-library .search')) return\n\n\t\t\t\tthis.removeSidebar()\n\t\t\t})\n\n\t\t\t// \"»\" buttons remove elements from the workspace without dragging\n\t\t\tthis.addListener(this.$workspace, 'click', e => {\n\t\t\t\tif ($(e.target).closest('.fld-element .remove-element').length === 0) return\n\n\t\t\t\tconst element = $(e.target).closest('.fld-element').data('fld-element')\n\t\t\t\tif (!element) return\n\n\t\t\t\telement.destroy()\n\t\t\t\tthis.tabGrid.refreshCols(true)\n\t\t\t})\n\n\t\t\tthis.initTab(this.$tabContainer.children())\n\t\t\tthis.elementDrag = new ElementDrag(this)\n\t\t},\n\n\t\t/**\n\t\t * @param {JQuery} $sidebar\n\t\t */\n\t\taddSidebar: function ($sidebar) {\n\t\t\tconst newSidebar = new DesignerSidebar(this, $sidebar)\n\t\t\tthis.$sidebars.push(newSidebar)\n\t\t\tthis.selectedSidebar = newSidebar\n\t\t},\n\n\t\tremoveSidebar: function () {\n\t\t\t// The root sidebar always stays\n\t\t\tif (this.$sidebars.length <= 1) return\n\n\t\t\tconst sidebar = /** @type {DesignerSidebarInstance} */ (this.$sidebars.pop())\n\t\t\tthis.elementDrag.removeItems(sidebar.$container.find('.fld-element'))\n\t\t\tsidebar.$container.remove()\n\t\t\tthis.selectedSidebar = this.$sidebars[this.$sidebars.length - 1]\n\n\t\t\tconst levels = this.$container.data('nestingLevels') - 1\n\t\t\tthis.$container.css('--nesting-levels', levels)\n\t\t\tthis.$container.data('nestingLevels', levels)\n\t\t},\n\n\t\t/**\n\t\t * Removes the sidebars nested deeper than the given one.\n\t\t * @param {DesignerSidebarInstance} sidebar\n\t\t */\n\t\tremoveSidebarsAfter: function (sidebar) {\n\t\t\tconst index = this.$sidebars.indexOf(sidebar)\n\t\t\tif (index === -1) return\n\n\t\t\twhile (this.$sidebars.length - 1 > index) {\n\t\t\t\tthis.removeSidebar()\n\t\t\t}\n\t\t},\n\n\t\t/**\n\t\t * Removes the designer's listeners, dragging and element settings slideouts, e.g. before it's re-rendered.\n\t\t */\n\t\tdestroy: function () {\n\t\t\tthis.$tabContainer.find('.fld-element').each((i, el) => {\n\t\t\t\tconst slideout = $(el).data('fld-element')?.slideout\n\t\t\t\tif (slideout) {\n\t\t\t\t\tslideout.destroy()\n\t\t\t\t}\n\t\t\t})\n\n\t\t\tthis.elementDrag.destroy()\n\t\t\tthis.$container.removeData('designer')\n\t\t\tthis.base()\n\t\t},\n\n\t\t/**\n\t\t * Closes a nested sidebar, along with the sidebars opened from it. The root sidebar stays.\n\t\t * @param {DesignerSidebarInstance} sidebar\n\t\t */\n\t\tcloseSidebar: function (sidebar) {\n\t\t\tconst index = this.$sidebars.indexOf(sidebar)\n\t\t\tif (index < 1) return\n\n\t\t\tthis.removeSidebarsAfter(this.$sidebars[index - 1])\n\t\t},\n\n\t\t/**\n\t\t * @param {JQuery} $tab\n\t\t * @returns {DesignerTabInstance}\n\t\t */\n\t\tinitTab: function ($tab) {\n\t\t\treturn new DesignerTab(this, $tab)\n\t\t},\n\n\t\t/**\n\t\t * Finds the library element for a handle across all open sidebars.\n\t\t * @param {string} handle\n\t\t * @returns {JQuery}\n\t\t */\n\t\tfindLibraryElement: function (handle) {\n\t\t\treturn this.$container\n\t\t\t\t.find('.fld-sidebar .fld-element.unused')\n\t\t\t\t.filter((i, el) => el.dataset.handle === String(handle))\n\t\t\t\t.first()\n\t\t},\n\n\t\t/**\n\t\t * Hides a library element once it's been placed in the workspace.\n\t\t * Complex fields stay visible, so they can still be expanded into nested sidebars.\n\t\t * @param {JQuery} $libraryElement\n\t\t */\n\t\thideLibraryElement: function ($libraryElement) {\n\t\t\tif (!$libraryElement.length || $libraryElement.hasClass('complex-field')) return\n\n\t\t\t$libraryElement.addClass('hidden')\n\n\t\t\tif ($libraryElement.siblings('.fld-element:not(.hidden)').length === 0) {\n\t\t\t\t$libraryElement.closest('.fld-field-group').addClass('hidden')\n\t\t\t}\n\t\t},\n\n\t\t/**\n\t\t * @param {string} handle\n\t\t */\n\t\tremoveFieldByHandle: function (handle) {\n\t\t\tthis.findLibraryElement(handle)\n\t\t\t\t.removeClass('hidden')\n\t\t\t\t.closest('.fld-field-group')\n\t\t\t\t.removeClass('hidden')\n\t\t},\n\n\t\t/**\n\t\t * @returns {LayoutConfig}\n\t\t */\n\t\tget config() {\n\t\t\treturn this._config\n\t\t},\n\n\t\t/**\n\t\t * @param {LayoutConfig} config\n\t\t */\n\t\tset config(config) {\n\t\t\tthis._config = config\n\t\t\tthis.$configInput.val(JSON.stringify(config))\n\t\t},\n\n\t\t/**\n\t\t * @param {(config: LayoutConfig) => LayoutConfig | false} callback Return `false` to leave the config unchanged.\n\t\t */\n\t\tupdateConfig: function (callback) {\n\t\t\tconst config = callback(this.config)\n\t\t\tif (config !== false) {\n\t\t\t\tthis.config = config\n\t\t\t}\n\t\t},\n\n\t\t/**\n\t\t * @param {string} contents\n\t\t * @param {string} [js]\n\t\t * @returns {any} A Craft.Slideout\n\t\t */\n\t\tcreateSlideout: function (contents, js) {\n\t\t\tconst $body = $('<div/>', { class: 'fld-element-settings-body' })\n\t\t\t$('<div/>', { class: 'fields', html: contents }).appendTo($body)\n\t\t\tconst $footer = $('<div/>', { class: 'fld-element-settings-footer' })\n\t\t\t$('<div/>', { class: 'flex-grow' }).appendTo($footer)\n\t\t\tconst $cancelBtn = Craft.ui\n\t\t\t\t.createButton({\n\t\t\t\t\tlabel: Craft.t('app', 'Close'), spinner: true,\n\t\t\t\t})\n\t\t\t\t.appendTo($footer)\n\t\t\tCraft.ui\n\t\t\t\t.createSubmitButton({\n\t\t\t\t\tclass: 'secondary', label: Craft.t('app', 'Apply'), spinner: true,\n\t\t\t\t})\n\t\t\t\t.appendTo($footer)\n\t\t\tconst $contents = $body.add($footer)\n\n\t\t\tconst slideout = new Craft.Slideout($contents, {\n\t\t\t\tcontainerElement: 'form', containerAttributes: {\n\t\t\t\t\taction: '', method: 'post', novalidate: '', class: 'fld-element-settings',\n\t\t\t\t},\n\t\t\t})\n\t\t\tslideout.on('open', () => {\n\t\t\t\t// Hold off a sec until it's positioned...\n\t\t\t\tGarnish.requestAnimationFrame(() => {\n\t\t\t\t\t// Focus on the first text input\n\t\t\t\t\tslideout.$container.find('.text:first').focus()\n\t\t\t\t})\n\t\t\t})\n\n\t\t\t$cancelBtn.on('click', () => {\n\t\t\t\tslideout.close()\n\t\t\t})\n\n\t\t\tif (js) {\n\t\t\t\teval(js)\n\t\t\t}\n\n\t\t\tCraft.initUiElements(slideout.$container)\n\n\t\t\treturn slideout\n\t\t},\n\t},\n)\n\nexport default Designer","import Designer from './ExporterLayout/Designer.js'\n\nCraft.ExporterLayoutDesigner = Designer\n"],"names":[],"mappings":"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"}