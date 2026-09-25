(function () {
	'use strict';

	// Counts layout designer requests, so only the latest one replaces the designer
	let designerRequest = 0;

	document.addEventListener('change', e => {
		const select = e.target.closest('#element-type');
		if (!select) return

		const elementType = select.value;
		const wrapper = document.getElementById('element-sources-wrapper');
		const toggle = document.getElementById('element-sources-wrapper-toggle');

		if (elementType === '') {
			wrapper.classList.add('hidden');
			toggle.classList.add('hidden');
			replaceLayoutDesigner({ html: '', headHtml: '', bodyHtml: '' });
			return
		}
		if (elementType === select.dataset.elementType && select.dataset.fresh > 0) return

		wrapper.classList.add('hidden');

		const data = { elementType };
		if (select.dataset.exporterId) {
			data.exporterId = select.dataset.exporterId;
		}

		Craft.sendActionRequest('POST', 'dynex/exporters/exporter-sources', { data })
			.then(({ data }) => {
				if (!data.html?.length) return

				select.dataset.fresh = '-1';
				wrapper.innerHTML = data.html;
				wrapper.classList.remove('hidden');
				toggle.classList.remove('hidden');
				setToggleState(toggle, wrapper, true);
				new Garnish.CheckboxSelect(wrapper.querySelector('.checkbox-select'));

				// Another element type has other fields, so the mapping starts over
				refreshLayoutDesigner(false);
			})
			.catch(error => {
				Craft.cp.displayError();
				console.error(error);
			});
	});

	document.addEventListener('change', e => {
		if (!e.target.closest('#element-sources-wrapper')) return

		// Other sources can have other fields, but the fields mapped so far are kept
		refreshLayoutDesigner(true);
	});

	document.addEventListener('click', e => {
		const toggle = e.target.closest('#element-sources-wrapper-toggle');
		if (!toggle) return

		const wrapper = document.getElementById('element-sources-wrapper');
		setToggleState(toggle, wrapper, wrapper.classList.contains('hidden'));
	});

	/**
	 * Re-renders the field layout designer for the picked element type and sources.
	 *
	 * @param {boolean} keepMapping Whether to keep the fields mapped so far
	 */
	function refreshLayoutDesigner(keepMapping) {
		const container = document.getElementById('exporter-layout-designer');
		const select = document.getElementById('element-type');
		if (!container || !select || select.value === '') return

		const data = new URLSearchParams();
		data.append('elementType', select.value);

		// Checked sources: `elementSources` for "All", `elementSources[]` for the others (disabled while "All" is checked)
		document.querySelectorAll('#element-sources-wrapper input[type="checkbox"]').forEach(input => {
			if (input.checked && !input.disabled && input.name) {
				data.append(input.name, input.value);
			}
		});

		const layoutInput = container.querySelector('input[name="fieldLayout"]');
		if (keepMapping && layoutInput) {
			data.append('fieldLayout', layoutInput.value);
		}

		const request = ++designerRequest;

		Craft.sendActionRequest('POST', 'dynex/exporters/layout-designer', { data })
			.then(({ data }) => {
				if (request !== designerRequest) return

				return replaceLayoutDesigner(data)
			})
			.catch(error => {
				Craft.cp.displayError();
				console.error(error);
			});
	}

	/**
	 * Swaps the designer for newly rendered HTML, and runs the JS that initializes it.
	 *
	 * @param {{html: string, headHtml: string, bodyHtml: string}} data
	 * @returns {Promise<void>}
	 */
	async function replaceLayoutDesigner(data) {
		const container = document.getElementById('exporter-layout-designer');
		if (!container) return

		const designer = $(container).find('.exporter-designer').data('designer');
		if (designer) {
			designer.destroy();
		}

		container.innerHTML = data.html;
		await Craft.appendHeadHtml(data.headHtml);
		await Craft.appendBodyHtml(data.bodyHtml);
	}

	/**
	 * @param {HTMLElement} toggle
	 * @param {HTMLElement} wrapper
	 * @param {boolean} expanded
	 */
	function setToggleState(toggle, wrapper, expanded) {
		wrapper.classList.toggle('hidden', !expanded);
		toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
		toggle.textContent = expanded
			? Craft.t('dynex', 'Collapse the Sources list')
			: Craft.t('dynex', 'Expand the Sources list');
	}

})();
//# sourceMappingURL=editexporter.js.map

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdGV4cG9ydGVyLmpzIiwic291cmNlcyI6WyJhc3NldHMvQ3Avc3JjL2pzL2VkaXRleHBvcnRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3VudHMgbGF5b3V0IGRlc2lnbmVyIHJlcXVlc3RzLCBzbyBvbmx5IHRoZSBsYXRlc3Qgb25lIHJlcGxhY2VzIHRoZSBkZXNpZ25lclxubGV0IGRlc2lnbmVyUmVxdWVzdCA9IDBcblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiB7XG5cdGNvbnN0IHNlbGVjdCA9IGUudGFyZ2V0LmNsb3Nlc3QoJyNlbGVtZW50LXR5cGUnKVxuXHRpZiAoIXNlbGVjdCkgcmV0dXJuXG5cblx0Y29uc3QgZWxlbWVudFR5cGUgPSBzZWxlY3QudmFsdWVcblx0Y29uc3Qgd3JhcHBlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdlbGVtZW50LXNvdXJjZXMtd3JhcHBlcicpXG5cdGNvbnN0IHRvZ2dsZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdlbGVtZW50LXNvdXJjZXMtd3JhcHBlci10b2dnbGUnKVxuXG5cdGlmIChlbGVtZW50VHlwZSA9PT0gJycpIHtcblx0XHR3cmFwcGVyLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpXG5cdFx0dG9nZ2xlLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpXG5cdFx0cmVwbGFjZUxheW91dERlc2lnbmVyKHsgaHRtbDogJycsIGhlYWRIdG1sOiAnJywgYm9keUh0bWw6ICcnIH0pXG5cdFx0cmV0dXJuXG5cdH1cblx0aWYgKGVsZW1lbnRUeXBlID09PSBzZWxlY3QuZGF0YXNldC5lbGVtZW50VHlwZSAmJiBzZWxlY3QuZGF0YXNldC5mcmVzaCA+IDApIHJldHVyblxuXG5cdHdyYXBwZXIuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJylcblxuXHRjb25zdCBkYXRhID0geyBlbGVtZW50VHlwZSB9XG5cdGlmIChzZWxlY3QuZGF0YXNldC5leHBvcnRlcklkKSB7XG5cdFx0ZGF0YS5leHBvcnRlcklkID0gc2VsZWN0LmRhdGFzZXQuZXhwb3J0ZXJJZFxuXHR9XG5cblx0Q3JhZnQuc2VuZEFjdGlvblJlcXVlc3QoJ1BPU1QnLCAnZHluZXgvZXhwb3J0ZXJzL2V4cG9ydGVyLXNvdXJjZXMnLCB7IGRhdGEgfSlcblx0XHQudGhlbigoeyBkYXRhIH0pID0+IHtcblx0XHRcdGlmICghZGF0YS5odG1sPy5sZW5ndGgpIHJldHVyblxuXG5cdFx0XHRzZWxlY3QuZGF0YXNldC5mcmVzaCA9ICctMSdcblx0XHRcdHdyYXBwZXIuaW5uZXJIVE1MID0gZGF0YS5odG1sXG5cdFx0XHR3cmFwcGVyLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpXG5cdFx0XHR0b2dnbGUuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJylcblx0XHRcdHNldFRvZ2dsZVN0YXRlKHRvZ2dsZSwgd3JhcHBlciwgdHJ1ZSlcblx0XHRcdG5ldyBHYXJuaXNoLkNoZWNrYm94U2VsZWN0KHdyYXBwZXIucXVlcnlTZWxlY3RvcignLmNoZWNrYm94LXNlbGVjdCcpKVxuXG5cdFx0XHQvLyBBbm90aGVyIGVsZW1lbnQgdHlwZSBoYXMgb3RoZXIgZmllbGRzLCBzbyB0aGUgbWFwcGluZyBzdGFydHMgb3ZlclxuXHRcdFx0cmVmcmVzaExheW91dERlc2lnbmVyKGZhbHNlKVxuXHRcdH0pXG5cdFx0LmNhdGNoKGVycm9yID0+IHtcblx0XHRcdENyYWZ0LmNwLmRpc3BsYXlFcnJvcigpXG5cdFx0XHRjb25zb2xlLmVycm9yKGVycm9yKVxuXHRcdH0pXG59KVxuXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHtcblx0aWYgKCFlLnRhcmdldC5jbG9zZXN0KCcjZWxlbWVudC1zb3VyY2VzLXdyYXBwZXInKSkgcmV0dXJuXG5cblx0Ly8gT3RoZXIgc291cmNlcyBjYW4gaGF2ZSBvdGhlciBmaWVsZHMsIGJ1dCB0aGUgZmllbGRzIG1hcHBlZCBzbyBmYXIgYXJlIGtlcHRcblx0cmVmcmVzaExheW91dERlc2lnbmVyKHRydWUpXG59KVxuXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGUgPT4ge1xuXHRjb25zdCB0b2dnbGUgPSBlLnRhcmdldC5jbG9zZXN0KCcjZWxlbWVudC1zb3VyY2VzLXdyYXBwZXItdG9nZ2xlJylcblx0aWYgKCF0b2dnbGUpIHJldHVyblxuXG5cdGNvbnN0IHdyYXBwZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZWxlbWVudC1zb3VyY2VzLXdyYXBwZXInKVxuXHRzZXRUb2dnbGVTdGF0ZSh0b2dnbGUsIHdyYXBwZXIsIHdyYXBwZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdoaWRkZW4nKSlcbn0pXG5cbi8qKlxuICogUmUtcmVuZGVycyB0aGUgZmllbGQgbGF5b3V0IGRlc2lnbmVyIGZvciB0aGUgcGlja2VkIGVsZW1lbnQgdHlwZSBhbmQgc291cmNlcy5cbiAqXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGtlZXBNYXBwaW5nIFdoZXRoZXIgdG8ga2VlcCB0aGUgZmllbGRzIG1hcHBlZCBzbyBmYXJcbiAqL1xuZnVuY3Rpb24gcmVmcmVzaExheW91dERlc2lnbmVyKGtlZXBNYXBwaW5nKSB7XG5cdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdleHBvcnRlci1sYXlvdXQtZGVzaWduZXInKVxuXHRjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZWxlbWVudC10eXBlJylcblx0aWYgKCFjb250YWluZXIgfHwgIXNlbGVjdCB8fCBzZWxlY3QudmFsdWUgPT09ICcnKSByZXR1cm5cblxuXHRjb25zdCBkYXRhID0gbmV3IFVSTFNlYXJjaFBhcmFtcygpXG5cdGRhdGEuYXBwZW5kKCdlbGVtZW50VHlwZScsIHNlbGVjdC52YWx1ZSlcblxuXHQvLyBDaGVja2VkIHNvdXJjZXM6IGBlbGVtZW50U291cmNlc2AgZm9yIFwiQWxsXCIsIGBlbGVtZW50U291cmNlc1tdYCBmb3IgdGhlIG90aGVycyAoZGlzYWJsZWQgd2hpbGUgXCJBbGxcIiBpcyBjaGVja2VkKVxuXHRkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcjZWxlbWVudC1zb3VyY2VzLXdyYXBwZXIgaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykuZm9yRWFjaChpbnB1dCA9PiB7XG5cdFx0aWYgKGlucHV0LmNoZWNrZWQgJiYgIWlucHV0LmRpc2FibGVkICYmIGlucHV0Lm5hbWUpIHtcblx0XHRcdGRhdGEuYXBwZW5kKGlucHV0Lm5hbWUsIGlucHV0LnZhbHVlKVxuXHRcdH1cblx0fSlcblxuXHRjb25zdCBsYXlvdXRJbnB1dCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dFtuYW1lPVwiZmllbGRMYXlvdXRcIl0nKVxuXHRpZiAoa2VlcE1hcHBpbmcgJiYgbGF5b3V0SW5wdXQpIHtcblx0XHRkYXRhLmFwcGVuZCgnZmllbGRMYXlvdXQnLCBsYXlvdXRJbnB1dC52YWx1ZSlcblx0fVxuXG5cdGNvbnN0IHJlcXVlc3QgPSArK2Rlc2lnbmVyUmVxdWVzdFxuXG5cdENyYWZ0LnNlbmRBY3Rpb25SZXF1ZXN0KCdQT1NUJywgJ2R5bmV4L2V4cG9ydGVycy9sYXlvdXQtZGVzaWduZXInLCB7IGRhdGEgfSlcblx0XHQudGhlbigoeyBkYXRhIH0pID0+IHtcblx0XHRcdGlmIChyZXF1ZXN0ICE9PSBkZXNpZ25lclJlcXVlc3QpIHJldHVyblxuXG5cdFx0XHRyZXR1cm4gcmVwbGFjZUxheW91dERlc2lnbmVyKGRhdGEpXG5cdFx0fSlcblx0XHQuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0Q3JhZnQuY3AuZGlzcGxheUVycm9yKClcblx0XHRcdGNvbnNvbGUuZXJyb3IoZXJyb3IpXG5cdFx0fSlcbn1cblxuLyoqXG4gKiBTd2FwcyB0aGUgZGVzaWduZXIgZm9yIG5ld2x5IHJlbmRlcmVkIEhUTUwsIGFuZCBydW5zIHRoZSBKUyB0aGF0IGluaXRpYWxpemVzIGl0LlxuICpcbiAqIEBwYXJhbSB7e2h0bWw6IHN0cmluZywgaGVhZEh0bWw6IHN0cmluZywgYm9keUh0bWw6IHN0cmluZ319IGRhdGFcbiAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fVxuICovXG5hc3luYyBmdW5jdGlvbiByZXBsYWNlTGF5b3V0RGVzaWduZXIoZGF0YSkge1xuXHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZXhwb3J0ZXItbGF5b3V0LWRlc2lnbmVyJylcblx0aWYgKCFjb250YWluZXIpIHJldHVyblxuXG5cdGNvbnN0IGRlc2lnbmVyID0gJChjb250YWluZXIpLmZpbmQoJy5leHBvcnRlci1kZXNpZ25lcicpLmRhdGEoJ2Rlc2lnbmVyJylcblx0aWYgKGRlc2lnbmVyKSB7XG5cdFx0ZGVzaWduZXIuZGVzdHJveSgpXG5cdH1cblxuXHRjb250YWluZXIuaW5uZXJIVE1MID0gZGF0YS5odG1sXG5cdGF3YWl0IENyYWZ0LmFwcGVuZEhlYWRIdG1sKGRhdGEuaGVhZEh0bWwpXG5cdGF3YWl0IENyYWZ0LmFwcGVuZEJvZHlIdG1sKGRhdGEuYm9keUh0bWwpXG59XG5cbi8qKlxuICogQHBhcmFtIHtIVE1MRWxlbWVudH0gdG9nZ2xlXG4gKiBAcGFyYW0ge0hUTUxFbGVtZW50fSB3cmFwcGVyXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGV4cGFuZGVkXG4gKi9cbmZ1bmN0aW9uIHNldFRvZ2dsZVN0YXRlKHRvZ2dsZSwgd3JhcHBlciwgZXhwYW5kZWQpIHtcblx0d3JhcHBlci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhZXhwYW5kZWQpXG5cdHRvZ2dsZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBleHBhbmRlZCA/ICd0cnVlJyA6ICdmYWxzZScpXG5cdHRvZ2dsZS50ZXh0Q29udGVudCA9IGV4cGFuZGVkXG5cdFx0PyBDcmFmdC50KCdkeW5leCcsICdDb2xsYXBzZSB0aGUgU291cmNlcyBsaXN0Jylcblx0XHQ6IENyYWZ0LnQoJ2R5bmV4JywgJ0V4cGFuZCB0aGUgU291cmNlcyBsaXN0Jylcbn0iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6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{"version":3,"file":"editexporter.js","sources":["assets/Cp/src/js/editexporter.js"],"sourcesContent":["// Counts layout designer requests, so only the latest one replaces the designer\nlet designerRequest = 0\n\ndocument.addEventListener('change', e => {\n\tconst select = e.target.closest('#element-type')\n\tif (!select) return\n\n\tconst elementType = select.value\n\tconst wrapper = document.getElementById('element-sources-wrapper')\n\tconst toggle = document.getElementById('element-sources-wrapper-toggle')\n\n\tif (elementType === '') {\n\t\twrapper.classList.add('hidden')\n\t\ttoggle.classList.add('hidden')\n\t\treplaceLayoutDesigner({ html: '', headHtml: '', bodyHtml: '' })\n\t\treturn\n\t}\n\tif (elementType === select.dataset.elementType && select.dataset.fresh > 0) return\n\n\twrapper.classList.add('hidden')\n\n\tconst data = { elementType }\n\tif (select.dataset.exporterId) {\n\t\tdata.exporterId = select.dataset.exporterId\n\t}\n\n\tCraft.sendActionRequest('POST', 'dynex/exporters/exporter-sources', { data })\n\t\t.then(({ data }) => {\n\t\t\tif (!data.html?.length) return\n\n\t\t\tselect.dataset.fresh = '-1'\n\t\t\twrapper.innerHTML = data.html\n\t\t\twrapper.classList.remove('hidden')\n\t\t\ttoggle.classList.remove('hidden')\n\t\t\tsetToggleState(toggle, wrapper, true)\n\t\t\tnew Garnish.CheckboxSelect(wrapper.querySelector('.checkbox-select'))\n\n\t\t\t// Another element type has other fields, so the mapping starts over\n\t\t\trefreshLayoutDesigner(false)\n\t\t})\n\t\t.catch(error => {\n\t\t\tCraft.cp.displayError()\n\t\t\tconsole.error(error)\n\t\t})\n})\n\ndocument.addEventListener('change', e => {\n\tif (!e.target.closest('#element-sources-wrapper')) return\n\n\t// Other sources can have other fields, but the fields mapped so far are kept\n\trefreshLayoutDesigner(true)\n})\n\ndocument.addEventListener('click', e => {\n\tconst toggle = e.target.closest('#element-sources-wrapper-toggle')\n\tif (!toggle) return\n\n\tconst wrapper = document.getElementById('element-sources-wrapper')\n\tsetToggleState(toggle, wrapper, wrapper.classList.contains('hidden'))\n})\n\n/**\n * Re-renders the field layout designer for the picked element type and sources.\n *\n * @param {boolean} keepMapping Whether to keep the fields mapped so far\n */\nfunction refreshLayoutDesigner(keepMapping) {\n\tconst container = document.getElementById('exporter-layout-designer')\n\tconst select = document.getElementById('element-type')\n\tif (!container || !select || select.value === '') return\n\n\tconst data = new URLSearchParams()\n\tdata.append('elementType', select.value)\n\n\t// Checked sources: `elementSources` for \"All\", `elementSources[]` for the others (disabled while \"All\" is checked)\n\tdocument.querySelectorAll('#element-sources-wrapper input[type=\"checkbox\"]').forEach(input => {\n\t\tif (input.checked && !input.disabled && input.name) {\n\t\t\tdata.append(input.name, input.value)\n\t\t}\n\t})\n\n\tconst layoutInput = container.querySelector('input[name=\"fieldLayout\"]')\n\tif (keepMapping && layoutInput) {\n\t\tdata.append('fieldLayout', layoutInput.value)\n\t}\n\n\tconst request = ++designerRequest\n\n\tCraft.sendActionRequest('POST', 'dynex/exporters/layout-designer', { data })\n\t\t.then(({ data }) => {\n\t\t\tif (request !== designerRequest) return\n\n\t\t\treturn replaceLayoutDesigner(data)\n\t\t})\n\t\t.catch(error => {\n\t\t\tCraft.cp.displayError()\n\t\t\tconsole.error(error)\n\t\t})\n}\n\n/**\n * Swaps the designer for newly rendered HTML, and runs the JS that initializes it.\n *\n * @param {{html: string, headHtml: string, bodyHtml: string}} data\n * @returns {Promise<void>}\n */\nasync function replaceLayoutDesigner(data) {\n\tconst container = document.getElementById('exporter-layout-designer')\n\tif (!container) return\n\n\tconst designer = $(container).find('.exporter-designer').data('designer')\n\tif (designer) {\n\t\tdesigner.destroy()\n\t}\n\n\tcontainer.innerHTML = data.html\n\tawait Craft.appendHeadHtml(data.headHtml)\n\tawait Craft.appendBodyHtml(data.bodyHtml)\n}\n\n/**\n * @param {HTMLElement} toggle\n * @param {HTMLElement} wrapper\n * @param {boolean} expanded\n */\nfunction setToggleState(toggle, wrapper, expanded) {\n\twrapper.classList.toggle('hidden', !expanded)\n\ttoggle.setAttribute('aria-expanded', expanded ? 'true' : 'false')\n\ttoggle.textContent = expanded\n\t\t? Craft.t('dynex', 'Collapse the Sources list')\n\t\t: Craft.t('dynex', 'Expand the Sources list')\n}"],"names":[],"mappings":"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"}