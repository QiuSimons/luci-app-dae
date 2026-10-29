'use strict';
'require view';
'require form';
'require ui';
'require uci';
'require dae.common as dae';

return view.extend({
	load: function() {
		return uci.load('dae');
	},

	render: function() {
		var m, s, o;

		m = new form.Map('dae', _('Global Settings'), _('Configure global settings for DAE.'));

		s = m.section(form.NamedSection, '_status');
		s.render = function() {
			return dae.renderStatusHeader();
		};

		s = m.section(form.TypedSection, 'dae');
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.rmempty = false;

		o = s.option(form.Flag, 'subscribe_auto_update', _('Enable Auto Subscribe Update'));
		o.rmempty = false;

		o = s.option(form.ListValue, 'subscribe_update_week_time', _('Update Cycle'));
		o.value('*', _('Every Day'));
		o.value('0', _('Every Monday'));
		o.value('1', _('Every Tuesday'));
		o.value('2', _('Every Wednesday'));
		o.value('3', _('Every Thursday'));
		o.value('4', _('Every Friday'));
		o.value('5', _('Every Saturday'));
		o.value('6', _('Every Sunday'));
		o.default = '*';
		o.depends('subscribe_auto_update', '1');

		o = s.option(form.ListValue, 'subscribe_update_day_time', _('Update Time (Every Day)'));
		for (var t = 0; t <= 23; t++)
			o.value(String(t), t + ':00');
		o.default = '0';
		o.depends('subscribe_auto_update', '1');

		o = s.option(form.TextValue, '_config', _('Global Configuration'), _('Correctly configure the include field for separate-config to work, or enter complete configuration here.'));
		o.rows = 25;
		o.wrap = 'off';
		o.load = function(section_id) {
			return dae.readFile('/etc/dae/config.dae');
		};
		o.write = function(section_id, formvalue) {
			if (formvalue != null)
				return dae.writeFile('/etc/dae/config.dae', formvalue);
		};

		dae.bindCodeMirrorToMap(m);
		return m.render();
	},

	handleSaveApply: function(ev, mode) {
		return this.handleSave(ev).then(function() {
			return ui.changes.apply(mode == '0').then(function() {
				if (dae.isServiceEnabled()) {
					return dae.callDaeReload().then(function() {
						return dae.callDaeStatus().then(function(st) {
							dae.updateStatus(st);
						});
					}).catch(function() {});
				}
			});
		}).catch(function(err) {
			dae.showNotification(null, E('p', _('Failed to apply configuration:') + ' ' + (err.message || err)), 'error');
		});
	}
});

