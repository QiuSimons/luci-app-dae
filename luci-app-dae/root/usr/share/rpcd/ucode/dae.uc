#!/usr/bin/ucode

'use strict';

import { readfile, writefile, popen } from 'fs';

let cached_pid = null;

function is_dae_pid(pid) {
	if (!pid)
		return false;

	let comm = readfile('/proc/' + pid + '/comm');
	if (comm)
		return trim(comm) == 'dae';

	let cmd = readfile('/proc/' + pid + '/cmdline');
	return cmd ? match(cmd, /dae/) : false;
}

function get_dae_pid() {
	if (cached_pid && is_dae_pid(cached_pid))
		return cached_pid;

	cached_pid = null;

	let p = popen('pidof dae 2>/dev/null');
	let pids = p ? p.read('all') : '';
	if (p) p.close();
	let m = match(pids, /([0-9]+)/);
	cached_pid = m ? m[1] : null;
	return cached_pid;
}

return {
	'luci.dae': {
		status: {
			call: function(req) {
				let pid = get_dae_pid();
				let running = !!pid;
				let memory = null;
				if (running) {
					let status_str = readfile('/proc/' + pid + '/status');
					if (status_str) {
						let rss_m = match(status_str, /VmRSS:\s+([0-9]+)\s+kB/);
						if (rss_m)
							memory = sprintf('%.1f MB', +rss_m[1] / 1024);
					}
				}
				return { running: running, memory: memory };
			}
		},

		reload: {
			call: function(req) {
				cached_pid = null;
				let rc = system('/etc/init.d/dae hot_reload >/dev/null 2>&1 &');
				if (rc != 0)
					return { success: false, message: 'failed to dispatch hot_reload' };
				return { success: true, queued: true };
			}
		},

		restart: {
			call: function(req) {
				cached_pid = null;
				let rc = system('/etc/init.d/dae restart >/dev/null 2>&1 &');
				if (rc != 0)
					return { success: false, message: 'failed to dispatch restart' };
				return { success: true, queued: true };
			}
		},

		get_log: {
			call: function(req) {
				let p = popen('tail -n 1000 /var/log/dae/dae.log 2>/dev/null');
				let content = p ? p.read('all') : '';
				if (p) p.close();
				return { log: content || '' };
			}
		},

		clear_log: {
			call: function(req) {
				system('mkdir -p /var/log/dae');
				writefile('/var/log/dae/dae.log', '');
				return { success: true };
			}
		}
	}
};

