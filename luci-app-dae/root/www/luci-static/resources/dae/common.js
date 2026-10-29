'use strict';
'require baseclass';
'require rpc';
'require uci';
'require fs';
'require ui';
'require poll';
'require dom';
'require view';
'require form';

function showNotification(title, children, type, timeout) {
	timeout = (timeout != null) ? timeout : 3000;
	if (ui && ui.addTimeLimitedNotification) {
		return ui.addTimeLimitedNotification(title, children, timeout, type);
	}
	if (!ui || !ui.addNotification) return null;
	var node = ui.addNotification(title, children, type);
	if (node && timeout > 0) {
		setTimeout(function() {
			if (node && node.parentNode) {
				node.classList.add('fade-out');
				node.classList.remove('fade-in');
				setTimeout(function() {
					if (node && node.parentNode) {
						node.parentNode.removeChild(node);
					}
				}, 800);
			}
		}, timeout);
	}
	return node;
}

var callDaeStatus = rpc.declare({
	object: 'luci.dae',
	method: 'status',
	expect: { }
});

var callDaeReload = rpc.declare({
	object: 'luci.dae',
	method: 'reload',
	expect: { success: true }
});

var callDaeRestart = rpc.declare({
	object: 'luci.dae',
	method: 'restart',
	expect: { success: true }
});

var callDaeGetLog = rpc.declare({
	object: 'luci.dae',
	method: 'get_log',
	expect: { }
});

var callDaeClearLog = rpc.declare({
	object: 'luci.dae',
	method: 'clear_log',
	expect: { success: true }
});

function isServiceEnabled() {
	var sections = uci.sections('dae', 'dae') || [];
	return ((sections[0] || {}).enabled === '1');
}

function updateStatus(data, targetEl) {
	var el = targetEl || document.getElementById('dae_status');
	if (!el) return;
	if (data && data.running) {
		var mem = data.memory ? ' (' + _('Memory Usage') + ': ' + data.memory + ')' : '';
		dom.content(el, [
			E('span', { 'style': 'color: var(--success, #22c55e); font-weight: bold;' }, _('DAE') + ' ' + _('RUNNING')),
			' ',
			E('span', { 'style': 'color: var(--text-muted, #888); font-size: 0.9em;' }, mem)
		]);
	} else {
		dom.content(el, [
			E('span', { 'style': 'color: var(--danger, #ef4444); font-weight: bold;' }, _('DAE') + ' ' + _('NOT RUNNING'))
		]);
	}
}

function addElementPoll(fn, el, interval, onDetach) {
	var missing = 0;

	var pollFn = function() {
		if (document.body.contains(el)) {
			missing = 0;
		} else if (++missing > 1) {
			poll.remove(pollFn);
			if (typeof onDetach === 'function')
				onDetach();
			return Promise.resolve();
		}

		return fn();
	};

	poll.add(pollFn, interval);

	return pollFn;
}

function readFile(path) {
	if (fs.read_direct) {
		return fs.read_direct(path).catch(function() {
			return L.resolveDefault(fs.read(path), '');
		});
	}
	return L.resolveDefault(fs.read(path), '');
}

function writeFile(path, content) {
	var clean = (content || '').replace(/\r\n/g, '\n');
	return fs.write(path, clean);
}

function loadStyle(href) {
	if (!document.querySelector('link[href="' + href + '"]')) {
		var link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = href;
		document.head.appendChild(link);
	}
}

function loadScript(src) {
	return new Promise(function(resolve, reject) {
		var existing = document.querySelector('script[src="' + src + '"]');
		if (existing) {
			resolve();
			return;
		}
		var s = document.createElement('script');
		s.src = src;
		s.async = false;
		s.onload = function() { resolve(); };
		s.onerror = function() { reject(new Error('Failed to load ' + src)); };
		document.head.appendChild(s);
	});
}

function ensureEditorStyles() {
	if (document.getElementById('dae-editor-custom-style')) return;

	var style = document.createElement('style');
	style.id = 'dae-editor-custom-style';
	style.textContent = [
		'.dae-status-field { display: inline-flex !important; align-items: center !important; justify-content: flex-start !important; gap: 16px !important; flex-wrap: wrap !important; min-height: 32px !important; }',
		'.dae-editor-toolbar { margin-bottom: 6px !important; margin-top: 0 !important; display: flex !important; align-items: center !important; justify-content: flex-start !important; }',
		'.cm-format-btn { margin: 0 !important; cursor: pointer !important; }',
		'.cbi-value:has(.CodeMirror) { align-items: flex-start !important; }',
		'.cbi-value:has(.CodeMirror) > .cbi-value-title { padding-top: 5px !important; flex-grow: 0 !important; }',
		// 26rem basis: when the row is narrower, the editor wraps under its title instead of being squeezed beside it
		'.cbi-value:has(.CodeMirror) .cbi-value-field { flex: 1 1 26rem !important; min-width: 0 !important; width: auto !important; }',
		'.CodeMirror {',
		'	border: 1px solid var(--border, var(--hairline, var(--border-color-medium, #ccc))) !important;',
		'	border-radius: var(--radius-base, 4px);',
		'	height: auto;',
		'	min-height: 480px;',
		'	font-family: var(--font-mono, monospace);',
		'	font-size: 13px;',
		'	background: var(--background, var(--control-bg, var(--background-color-high, #ffffff))) !important;',
		'	color: var(--foreground, var(--text, var(--text-color-highest, inherit))) !important;',
		'	box-shadow: none;',
		'}',
		'.CodeMirror-gutters {',
		'	border-right: 1px solid var(--border, var(--hairline, var(--border-color-medium, #ccc))) !important;',
		'	background: var(--surface-raised, var(--surface-sunken, var(--background-color-low, #f7f7f7))) !important;',
		'}',
		'.CodeMirror-linenumber { color: var(--muted-foreground, var(--text-muted, var(--text-color-low, #888888))) !important; }',
		'.CodeMirror-cursor { border-left: 1px solid var(--foreground, var(--text, currentColor)) !important; }'
	].join('\n');
	document.head.appendChild(style);
}

var _cmPromise = null;

function ensureCodeMirror() {
	if (_cmPromise)
		return _cmPromise;

	loadStyle(L.resource('dae/lib/codemirror.css'));
	loadStyle(L.resource('dae/addon/fold/foldgutter.css'));
	ensureEditorStyles();

	if (window.CodeMirror && window.CodeMirror.modes && window.CodeMirror.modes.dae) {
		_cmPromise = Promise.resolve(window.CodeMirror);
		return _cmPromise;
	}

	_cmPromise = loadScript(L.resource('dae/lib/codemirror.js'))
		.then(function() {
			return Promise.all([
				loadScript(L.resource('dae/addon/edit/matchbrackets.js')),
				loadScript(L.resource('dae/addon/edit/closebrackets.js')),
				loadScript(L.resource('dae/addon/fold/foldcode.js')),
				loadScript(L.resource('dae/addon/fold/foldgutter.js')),
				loadScript(L.resource('dae/addon/fold/indent-fold.js')),
				loadScript(L.resource('dae/mode/dae/dae.js'))
			]);
		})
		.then(function() {
			return window.CodeMirror;
		}).catch(function(err) {
			_cmPromise = null;
			throw err;
		});

	return _cmPromise;
}

function preloadCodeMirror() {
	if (window.requestIdleCallback) {
		requestIdleCallback(function() {
			ensureCodeMirror().catch(function() {});
		}, { timeout: 2000 });
	} else {
		setTimeout(function() {
			ensureCodeMirror().catch(function() {});
		}, 300);
	}
}

function formatEditor(ed) {
	ed.operation(function() {
		var cursor = ed.getCursor();
		var content = ed.getValue();

		var exprPrefixes = [
			'geosite', 'geoip', 'keyword', 'full', 'suffix', 'regex', 'domain',
			'pname', 'subtag', 'name', 'mac', 'dip', 'sip', 'dport', 'sport',
			'l4proto', 'ipversion_prefer', 'fallback', 'qtype', 'qname',
			'upstream', 'ip', 'tag', 'inlist'
		];
		var exprRegex = new RegExp('\\b(' + exprPrefixes.join('|') + ')\\s*:\\s*', 'g');

		var formatCodeSegment = function(str) {
			str = str.replace(/\s*->\s*/g, ' -> ');
			str = str.replace(/\s*&&\s*/g, ' && ');
			str = str.replace(/([^\s])\s*\{/g, '$1 {');
			str = str.replace(/\s*,\s*/g, ', ');
			str = str.replace(exprRegex, '$1: ');
			return str;
		};

		var formatLineCode = function(lineStr) {
			lineStr = lineStr.replace(/^(\s*[a-zA-Z0-9_-]+)\s*:\s*(\S.*)$/, '$1: $2');
			lineStr = lineStr.replace(/^(\s*[a-zA-Z0-9_-]+)\s*:\s*$/, '$1:');

			var quoteParts = lineStr.split(/(['"])/);
			var inQuote = false;
			var currentQuote = '';
			for (var j = 0; j < quoteParts.length; j++) {
				var part = quoteParts[j];
				if (part === "'" || part === '"') {
					if (!inQuote) {
						inQuote = true;
						currentQuote = part;
					} else if (part === currentQuote) {
						inQuote = false;
						currentQuote = '';
					}
				} else if (!inQuote) {
					var hashIdx = part.indexOf('#');
					if (hashIdx !== -1) {
						var codeSub = part.slice(0, hashIdx);
						var commentSub = part.slice(hashIdx);
						codeSub = formatCodeSegment(codeSub);
						if (codeSub.length > 0 && !/\s$/.test(codeSub)) {
							codeSub += ' ';
						}
						quoteParts[j] = codeSub + commentSub.trimEnd();
						quoteParts.splice(j + 1);
						break;
					} else {
						quoteParts[j] = formatCodeSegment(part);
					}
				}
			}
			return quoteParts.join('').trimEnd();
		};

		var lines = content.split('\n');
		var formattedLines = lines.map(function(line) {
			var trimmed = line.trim();
			if (!trimmed) {
				return '';
			}

			if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
				var prefix = trimmed.startsWith('//') ? '//' : '#';
				var afterComment = trimmed.slice(prefix.length);

				var kvMatch = afterComment.match(/^(\s*)([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
				if (kvMatch) {
					var space = kvMatch[1];
					var key = kvMatch[2];
					var val = kvMatch[3].trim();
					return (line.match(/^\s*/)[0] + prefix + space + key + ': ' + val).trimEnd();
				}

				if (afterComment.indexOf('->') !== -1 || afterComment.indexOf('&&') !== -1) {
					var leadingWs = line.match(/^\s*/)[0];
					var formattedCommentCode = formatLineCode(afterComment);
					return (leadingWs + prefix + (afterComment.startsWith(' ') ? ' ' : '') + formattedCommentCode.trim()).trimEnd();
				}

				return line.trimEnd();
			}

			return formatLineCode(line);
		});

		ed.setValue(formattedLines.join('\n'));

		for (var i = 0; i < ed.lineCount(); i++) {
			ed.indentLine(i, 'smart');
		}
		ed.setCursor(cursor);
	});
}

function bindCodeMirrorToMap(m, onSaveCallback) {
	if (!m || m._cmHooked) return;
	m._cmHooked = true;
	ensureEditorStyles();

	var origRenderContents = m.renderContents;
	m.renderContents = function() {
		return origRenderContents.apply(this, arguments).then(function(mapNode) {
			var target = mapNode || m.root || document.getElementById('cbi-' + m.config) || document;
			target.querySelectorAll('textarea').forEach(function(ta) {
				if (ta.dataset.cmInitialized === 'true' || ta._editor) return;

				if (ta.offsetParent !== null) {
					initCodeMirror(ta, onSaveCallback);
				} else if (window.IntersectionObserver) {
					var row = ta.closest('.cbi-value') || ta;
					var io = new IntersectionObserver(function(entries) {
						if (entries[0] && entries[0].isIntersecting) {
							io.disconnect();
							initCodeMirror(ta, onSaveCallback).then(function(editor) {
								if (editor) {
									requestAnimationFrame(function() {
										editor.refresh();
									});
								}
							});
						}
					});
					io.observe(row);
				} else {
					initCodeMirror(ta, onSaveCallback);
				}
			});
			return mapNode;
		});
	};
}

function initCodeMirror(textarea, onSaveCallback) {
	if (textarea.dataset.cmInitialized === 'true' || textarea._editor) {
		return Promise.resolve(textarea._editor);
	}
	textarea.dataset.cmInitialized = 'true';

	return ensureCodeMirror().then(function(CodeMirror) {
		var editor = CodeMirror.fromTextArea(textarea, {
			mode: 'dae',
			indentUnit: 4,
			tabSize: 4,
			styleActiveLine: true,
			lineNumbers: true,
			theme: 'default',
			lineWrapping: true,
			matchBrackets: true,
			autoCloseBrackets: true,
			foldGutter: true,
			gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter']
		});
		textarea._editor = editor;

		var syncTextarea = function() {
			textarea.value = editor.getValue();
			textarea.dispatchEvent(new Event('input', { bubbles: true }));
			textarea.dispatchEvent(new Event('change', { bubbles: true }));
			if (typeof onSaveCallback === 'function') {
				onSaveCallback(textarea.value);
			}
		};

		editor.on('change', syncTextarea);
		editor.on('blur', function() {
			editor.save();
		});

		var formatBtn = E('button', {
			'type': 'button',
			'class': 'btn cbi-button cm-format-btn',
			'click': function() {
				try {
					formatEditor(editor);
					syncTextarea();
					formatBtn.textContent = '✓ ' + _('Formatted');
					formatBtn.classList.add('cbi-button-positive');
					clearTimeout(formatBtn._resetTimer);
					formatBtn._resetTimer = setTimeout(function() {
						formatBtn.textContent = _('Format Code');
						formatBtn.classList.remove('cbi-button-positive');
					}, 1500);
				} catch (e) {
					showNotification(null, E('p', _('Failed to format code:') + ' ' + (e.message || e)), 'error');
				}
			}
		}, _('Format Code'));

		var toolbar = E('div', { 'class': 'dae-editor-toolbar' }, [ formatBtn ]);

		var wrapper = editor.getWrapperElement();
		if (!wrapper.previousElementSibling || !wrapper.previousElementSibling.classList.contains('dae-editor-toolbar')) {
			wrapper.parentNode.insertBefore(toolbar, wrapper);
		}

		if (window.IntersectionObserver) {
			var observer = new IntersectionObserver(function(entries) {
				for (var i = 0; i < entries.length; i++) {
					if (entries[i].isIntersecting) {
						editor.refresh();
					}
				}
			});
			observer.observe(wrapper);
		}

		var mapEl = textarea.closest('.cbi-map');
		if (mapEl) {
			var mapInst = (window.L && window.L.dom) ? window.L.dom.findClassInstance(mapEl) : null;
			if (mapInst && !mapInst._cmHooked) {
				bindCodeMirrorToMap(mapInst, onSaveCallback);
			}
		}

		return editor;
	});
}

function renderStatusHeader() {
	var statusEl = E('span', { 'id': 'dae_status', 'style': 'font-weight: 500;' }, [
		E('em', {}, _('Collecting data...'))
	]);

	var reloadBtn = E('button', {
		'type': 'button',
		'class': 'btn cbi-button cbi-button-action',
		'click': function(ev) {
			var btn = ev.target;
			btn.disabled = true;
			btn.innerText = _('Reloading...');
			callDaeReload().then(function() {
				btn.disabled = false;
				btn.innerText = _('Reload Service');
				showNotification(null, E('p', _('DAE service reload triggered successfully.')), 'info');
				return callDaeStatus().then(function(st) {
					updateStatus(st, statusEl);
				});
			}).catch(function(err) {
				btn.disabled = false;
				btn.innerText = _('Reload Service');
				showNotification(null, E('p', _('Failed to reload DAE:') + ' ' + (err.message || err)), 'error');
			});
		}
	}, _('Reload Service'));

	var section = E('fieldset', { 'class': 'cbi-section' }, [
		E('legend', {}, _('Status')),
		E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Running Status')),
			E('div', { 'class': 'cbi-value-field dae-status-field' }, [
				statusEl,
				reloadBtn
			])
		])
	]);

	callDaeStatus().then(function(st) {
		updateStatus(st, statusEl);
	});

	var pollStatusFn = function() {
		return callDaeStatus().then(function(st) {
			updateStatus(st, statusEl);
		}).catch(function() { });
	};

	addElementPoll(pollStatusFn, statusEl, 3);

	return section;
}

function createConfigFileView(filePath, mapTitle, mapDesc, fieldTitle, successMsg) {
	return view.extend({
		load: function() {
			return uci.load('dae');
		},

		render: function() {
			var m = new form.Map('dae', mapTitle, mapDesc);

			var s = m.section(form.NamedSection, '_status');
			s.render = function() {
				return renderStatusHeader();
			};

			s = m.section(form.TypedSection, 'dae');
			s.anonymous = true;
			s.addremove = false;

			var o = s.option(form.TextValue, '_content', fieldTitle);
			o.rows = 25;
			o.wrap = 'off';
			o.load = function(section_id) {
				return readFile(filePath).then(function(content) {
					return content || '';
				});
			};
			o.write = function(section_id, formvalue) {
				return writeFile(filePath, formvalue);
			};

			bindCodeMirrorToMap(m);
			return m.render();
		},

		handleSaveApply: function(ev, mode) {
			return this.handleSave(ev).then(function() {
				return callDaeReload().then(function(resp) {
					if (!resp || resp.success === false)
						throw new Error((resp && resp.message) || _('Service did not accept the request'));

					if (!isServiceEnabled()) {
						showNotification(null, E('p', _('Configuration saved. DAE is disabled, so the service was not started.')), 'info');
						return;
					}

					return callDaeStatus().then(function(st) {
						updateStatus(st);
						if (st.running === false)
							throw new Error(_('DAE did not come back up; check the logs'));
						showNotification(null, E('p', successMsg || _('Configuration applied and service reloaded.')), 'info');
					});
				});
			}).catch(function(err) {
				showNotification(null, E('p', _('Failed to apply configuration:') + ' ' + (err.message || err)), 'error');
			});
		}
	});
}

preloadCodeMirror();

return baseclass.extend({
	callDaeStatus: callDaeStatus,
	callDaeReload: callDaeReload,
	callDaeRestart: callDaeRestart,
	callDaeGetLog: callDaeGetLog,
	callDaeClearLog: callDaeClearLog,
	readFile: readFile,
	writeFile: writeFile,
	ensureCodeMirror: ensureCodeMirror,
	preloadCodeMirror: preloadCodeMirror,
	formatEditor: formatEditor,
	initCodeMirror: initCodeMirror,
	bindCodeMirrorToMap: bindCodeMirrorToMap,
	renderStatusHeader: renderStatusHeader,
	createConfigFileView: createConfigFileView,
	isServiceEnabled: isServiceEnabled,
	showNotification: showNotification,
	updateStatus: updateStatus,
	addElementPoll: addElementPoll
});

