'use strict';
'require dae.common as dae';

return dae.createConfigFileView(
	'/etc/dae/config.d/route.dae',
	_('Routing Settings'),
	_('Configure routing rules for DAE.'),
	_('Route Configuration'),
	_('Route configuration saved and service reloaded.')
);

