'use strict';
'require dae.common as dae';

return dae.createConfigFileView(
	'/etc/dae/config.d/dns.dae',
	_('DNS Settings'),
	_('Configure DNS settings for DAE.'),
	_('DNS Configuration'),
	_('DNS configuration saved and service reloaded.')
);

