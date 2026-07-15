// SPDX-License-Identifier: Apache-2.0

'use strict';
'require dom';
'require fs';
'require poll';
'require ui';
'require view';

return view.extend({
	render() {
		let css = '					\
			#log_textarea {				\
				text-align: left;		\
			}					\
			#log_textarea pre {			\
				padding: .5rem;			\
				word-break: break-all;		\
				margin: 0;			\
			}					\
			.description {				\
				background-color: #33ccff;	\
			}';

		let log_textarea = E('div', { 'id': 'log_textarea' },
			E('pre', { 'id': 'log_textarea_content', 'wrap': 'pre' }, [
				_('Collecting data...')
			])
		);

		poll.add(L.bind(function() {
			return fs.read_direct('/var/log/dae/dae.log', 'text')
			.then(function(content) {
				let logContent = content ? content.trim() : '';
				let textarea = document.getElementById('log_textarea_content');
				if (textarea) {
					textarea.textContent = logContent || _('Log is empty.');
				}
			}).catch(function(e) {
				let textarea = document.getElementById('log_textarea_content');
				if (textarea) {
					if (e.toString().includes('NotFoundError')) {
						textarea.textContent = _('Log file does not exist.');
					} else {
						textarea.textContent = _('Unknown error: %s').format(e);
					}
				}
			});
		}));

		const scrollDownButton = E('button', {
				'id': 'scrollDownButton',
				'class': 'cbi-button cbi-button-neutral',
			}, _('Scroll to tail')
		);
		scrollDownButton.addEventListener('click', () => {
			scrollUpButton.scrollIntoView();
			scrollDownButton.blur();
		});

		const scrollUpButton = E('button', {
				'id' : 'scrollUpButton',
				'class': 'cbi-button cbi-button-neutral',
			}, _('Scroll to head')
		);
		scrollUpButton.addEventListener('click', () => {
			scrollDownButton.scrollIntoView();
			scrollUpButton.blur();
		});

		const clearLogButton = E('button', {
				'class': 'cbi-button cbi-input-remove',
				'style': 'margin-right: 15px;',
				'click': function(ev) {
					ev.preventDefault();
					if (confirm(_('Are you sure you want to clear the logs?'))) {
						return fs.write('/var/log/dae/dae.log', '')
						.then(function() {
							let textarea = document.getElementById('log_textarea_content');
							if (textarea) textarea.textContent = _('Log is empty.');
							ui.addNotification(null, E('p', _('Log cleared successfully')), 'info');
						}).catch(function(e) {
							ui.addNotification(null, E('p', _('Failed to clear log: %s').format(e.message)), 'danger');
						});
					}
				}
			}, _('Clear logs')
		);

		return E([
			E('style', [ css ]),
			E('h2', {}, [ _('Log') ]),
			E('div', {'class': 'cbi-map'}, [
				E('div', {'style': 'padding-bottom: 20px'}, [clearLogButton, scrollDownButton]),
				E('div', {'class': 'cbi-section'}, [
					log_textarea,
					E('div', {'style': 'text-align:right'},
						E('small', {}, _('Refresh every %s seconds.').format(L.env.pollinterval))
					)
				]),
				E('div', {'style': 'padding-bottom: 20px'}, [scrollUpButton])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
