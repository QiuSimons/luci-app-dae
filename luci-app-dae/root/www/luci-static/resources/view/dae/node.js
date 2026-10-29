'use strict';
'require dae.common as dae';

return dae.createConfigFileView(
	'/etc/dae/config.d/node.dae',
	_('Node Settings'),
	_('Configure nodes and groups for DAE.'),
	_('Node Configuration'),
	_('Node configuration saved and service reloaded.')
);

