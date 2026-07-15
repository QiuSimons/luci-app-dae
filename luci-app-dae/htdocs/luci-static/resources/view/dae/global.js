// SPDX-License-Identifier: Apache-2.0

'use strict';
'require dom';
'require form';
'require fs';
'require poll';
'require rpc';
'require uci';
'require ui';
'require view';

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('dae'), {}).then(function(res) {
		let isRunning = false;
		try {
			isRunning = res['dae']['instances']['dae']['running'];
		} catch (e) { }
		return isRunning;
	});
}

function renderStatus(isRunning) {
	let spanTemp = '<span style="color:%s"><strong>%s %s</strong></span>';
	let renderHTML;
	if (isRunning)
		renderHTML = spanTemp.format('green', _('dae'), _('RUNNING'));
	else
		renderHTML = spanTemp.format('red', _('dae'), _('NOT RUNNING'));

	return renderHTML;
}

function loadScript(src) {
	return new Promise(function(resolve, reject) {
		let script = E('script', { src: L.resource(src) });
		script.onload = resolve;
		script.onerror = reject;
		document.head.appendChild(script);
	});
}

function loadCodeMirror() {
	if (window.CodeMirror) {
		return Promise.resolve();
	}
	
	let cssFiles = [
		'dae/lib/codemirror.css',
		'dae/theme/dracula.css',
		'dae/addon/fold/foldgutter.css'
	];
	cssFiles.forEach(function(file) {
		if (!document.querySelector('link[href*="' + file + '"]')) {
			document.head.appendChild(E('link', { rel: 'stylesheet', href: L.resource(file) }));
		}
	});
	
	return loadScript('dae/lib/codemirror.js')
		.then(() => loadScript('dae/addon/edit/matchbrackets.js'))
		.then(() => loadScript('dae/addon/fold/foldcode.js'))
		.then(() => loadScript('dae/addon/fold/foldgutter.js'))
		.then(() => loadScript('dae/addon/fold/indent-fold.js'))
		.then(() => loadScript('dae/mode/dae/dae.js'));
}

function initEditor(textarea) {
	loadCodeMirror().then(function() {
		var editor = CodeMirror.fromTextArea(textarea, {
			mode: "dae",
			indentUnit: 4,
			tabSize: 4,
			styleActiveLine: true,
			lineNumbers: true,
			theme: "dracula",
			lineWrapping: true,
			matchBrackets: true,
			autoCloseBrackets: true,
			foldGutter: true,
			gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]
		});

		editor.on("change", function() {
			editor.save();
		});

		var formatBtn = E('button', {
			type: 'button',
			class: 'cbi-button cbi-button-apply cm-format-btn',
			style: 'margin-bottom: 5px; display: inline-block;',
			click: function() {
				editor.operation(function() {
					var cursor = editor.getCursor();
					var content = editor.getValue();
					var lines = content.split('\n');
					var formattedLines = lines.map(function(line) {
						if (line.trim().startsWith('#') || line.trim().startsWith('//')) return line;
						line = line.replace(/\s*->\s*/g, ' -> ');
						line = line.replace(/\s*&&\s*/g, ' && ');
						line = line.replace(/(['"])([a-zA-Z0-9_-]+)\1/g, function(match, quote, word) {
							return word;
						});
						return line.trimEnd();
					});
					editor.setValue(formattedLines.join('\n'));
					for (var i = 0; i < editor.lineCount(); i++) {
						editor.indentLine(i, "smart");
					}
					editor.setCursor(cursor);
				});
			}
		}, _('Format Code'));

		textarea.parentNode.insertBefore(formatBtn, textarea.nextSibling);
	});
}

return view.extend({
	load() {
		return Promise.all([
			uci.load('dae')
		]);
	},

	render(data) {
		let m, s, o;

		m = new form.Map('dae', _('Global Settings'),
			_('Configure global settings for DAE.'));

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function() {
			poll.add(function() {
				return L.resolveDefault(getServiceStatus()).then(function(res) {
					let view = document.getElementById('service_status');
					view.innerHTML = renderStatus(res);
				});
			});

			let reloadBtn = E('button', {
				'class': 'cbi-button cbi-button-reload',
				'style': 'margin-left: 15px;',
				'click': function(ev) {
					ev.preventDefault();
					return fs.exec_direct('/etc/init.d/dae', ['hot_reload'])
					.then(function() {
						ui.addNotification(null, E('p', _('Service reloaded successfully')), 'info');
					}).catch(function(e) {
						ui.addNotification(null, E('p', _('Reload failed: %s').format(e.message || e.toString())), 'danger');
					});
				}
			}, _('Reload Service'));

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
				E('p', { id: 'service_status', style: 'display: inline-block; margin: 0;' }, _('Collecting data...')),
				reloadBtn
			]);
		}

		s = m.section(form.NamedSection, 'config', 'dae');

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.rmempty = false;

		o = s.option(form.Flag, 'subscribe_auto_update', _('Enable Auto Subscribe Update'));
		o.rmempty = false;

		o = s.option(form.ListValue, 'subscribe_update_week_time', _('Update Cycle'));
		o.value('*', _('Every Day'));
		o.value('1', _('Every Monday'));
		o.value('2', _('Every Tuesday'));
		o.value('3', _('Every Wednesday'));
		o.value('4', _('Every Thursday'));
		o.value('5', _('Every Friday'));
		o.value('6', _('Every Saturday'));
		o.value('0', _('Every Sunday'));
		o.default = '*';
		o.depends('subscribe_auto_update', '1');

		o = s.option(form.ListValue, 'subscribe_update_day_time', _('Update Time (Every Day)'));
		for (let t = 0; t <= 23; t++) {
			o.value(t.toString(), t + ':00');
		}
		o.default = '0';
		o.depends('subscribe_auto_update', '1');

		o = s.option(form.TextValue, '_configuration', _('Global Configuration'),
			_('Correctly configure the include field for separate-config to work, or enter complete configuration here.'));
		o.rows = 25;
		o.monospace = true;
		o.load = function(section_id) {
			return fs.read_direct('/etc/dae/config.dae', 'text')
			.then(function(content) {
				return content ?? '';
			}).catch(function(e) {
				if (e.toString().includes('NotFoundError')) {
					return fs.read_direct('/etc/dae/example.dae', 'text')
					.then(function(content) {
						return content ?? '';
					}).catch(function() {
						return '';
					});
				}
				ui.addNotification(null, E('p', e.message));
				return '';
			});
		};
		o.write = function(section_id, value) {
			value = value.replace(/\r\n?/g, '\n');
			return fs.write('/etc/dae/config.dae', value, 384 /* 0600 */)
			.catch(function(e) {
				ui.addNotification(null, E('p', e.message));
			});
		};

		return m.render().then(function(node) {
			let textarea = node.querySelector('textarea[name="cbid.dae.config._configuration"]');
			if (textarea) {
				initEditor(textarea);
			}
			return node;
		});
	},

	handleSaveApply(ev, mode) {
		return this.handleSave(ev).then(function() {
			return uci.commit('dae');
		}).then(function() {
			return L.resolveDefault(fs.exec_direct('/etc/init.d/dae', ['hot_reload']), null);
		});
	}
});
