'use strict';

const baseUrl = location.protocol + '//' + location.host;
const wsUrl = ((location.protocol === 'https:') ? 'wss:' : 'ws:') + '//' + location.host + '/status';
const logMaxSize = 2 * 1024 * 1024;

const noConnAlertMsg =
`Device actions can not be initiated,
while the server connection is disabled.
Please enable the server connection
in order to control your devices.`;

var ws;
var wsActive = false;

var devs = {};

function actionPowerOn(uid) {
	if (! wsActive) {
		alert(noConnAlertMsg);
		return;
	}
	var url = baseUrl + '/power?uid=' + uid + '&power=on';
	log('action: power on ' + uid);
	get(url);
}

function actionPowerOff(uid) {
	if (! wsActive) {
		alert(noConnAlertMsg);
		return;
	}
	var url = baseUrl + '/power?uid=' + uid + '&power=off';
	log('action: power off ' + uid);
	get(url);
}

function disconnect() {
	if (wsActive) {
		replaceConnectionElement(createConnectionElement('Disconnecting ...'))
		wsActive = false;
		ws.close();
	}
}

function ping() {
	if (wsActive) {
		ws.send(JSON.stringify({ command: 'ping' }));
		return true;
	}
	return false;
}

function initialize() {
	var openCb = function() {
		wsActive = true;
		log("Server connection established");
		replaceConnectionElement(createConnectionElement('Disconnect', 'disconnect'));
		ping();
	}
	var closeCb = function() {
		log('Server connection closed');
		if (wsActive) {
			wsActive = false;
		}
		ws = undefined;
		Object.keys(devs).forEach(function(uid) {
			var dev = devs[uid];
			if (dev) {
				if (dev.status !== 'unreachable') {
					updatePropertyValue(dev.device.uid, 'status', 'unreachable');
				}
			}
		});
		replaceConnectionElement(createConnectionElement('Reconnect', 'initialize'))
	};
	var errorCb = function(e) {
		log('Server connection error' + (e.message ? (' (' + e.message + ')') : ''));
		if (wsActive) {
			wsActive = false;
		}
		ws.close();
	};
	var messageCb = function(event) {
		if (! wsActive) {
			return;
		}
		var d;
		try {
			d = JSON.parse(event.data);
			if (! (d && (typeof(d) === 'object'))) {
				let msg = 'Unexpected data from server';
				log(msg);
				throw new Error(msg);
			}
		} catch(e) {
			d = undefined;
		}
		if (! d) {
			log('Invalid data from server');
			replaceConnectionElement(createConnectionElement('Disconnecting ...'))
			wsActive = false;
			ws.close();
			return;
		}
		update(d);
	};
	var wsOpen = function() {
		replaceConnectionElement(createConnectionElement('Connecting ...'))
		log('Opening server connection');
		if (wsActive) {
			return;
		}
		ws = new WebSocket(wsUrl);
		ws.onopen = openCb;
		ws.onmessage = messageCb;
		ws.onclose = closeCb;
		ws.onerror = errorCb;
	}
	wsOpen();
}

function isDebugSet() {
	var elem = document.getElementById('log.debug.checkbox');
	return (elem && elem.checked);
}

function escapeHtml(s) {
	return (s
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;"));
}

function createDeviceElement(uid, name, properties, actions) {
	var html = '';
	if (! properties) {
		properties = [];
	}
	if (! actions) {
		actions = [];
	}
	html += '<div class="device" id="device.' + uid + '">';
 	html += ('<div class="device-name" id="device.name.' +
			 uid +
			 '">' +
			 (name ? escapeHtml(name) : '?') +
			 '</div>');
 	html += ('<div class="device-properties" id="' +
			 uid +
			 '.properties">');
	properties.forEach(function(p) {
		html += '<div class="device-property" id="device.property.' + uid + '.' + p.id + '">';
		html += ('<div class="device-property-label" id="device.property.' +
				 uid +
				 '.' +
				 p.id +
				 '.label">' +
				 (p.label ? escapeHtml(p.label) : '?') +
				 '</div>');
		html += ('<div class="device-property-value" id="device.property.' +
				 uid +
				 '.' +
				 p.id +
				 '.value">' +
				 (p.value ? escapeHtml(p.value) : '?') +
				 '</div>');
		html += '</div>';
	});
	html += '</div>';
 	html += ('<div class="device-actions" id="' +
			 uid +
			 '.actions">');
	actions.forEach(function(a) {
		html += '<div class="device-action" id="device.action.' + uid + '.' + a.id + '">';
		html += ('<a class="device-action-link" id="device.action.' +
				 uid +
				 '.' +
				 a.id +
				 '.link" onclick="' +
				 a.action +
				 "('" +
				 uid +
				 "')" +
				 '">');
		html += ('<div class="device-action-link-label" id="device.action.' +
				 uid +
				 '.' +
				 a.id +
				 '.label">' +
				 (a.label ? escapeHtml(a.label) : '?') +
				 '</div>');
		html +=  '</a>';
		html += '</div>';
	});
	html += '</div>';
	html += '</div>';
	var div = document.createElement('DIV');
	div.innerHTML = html;
	return div.firstChild;
}

function log(s) {
	var elem = document.getElementById('log');
	if (elem) {
		let ts = (new Date).toISOString().replace(/T/g, ' ').replace(/Z/g, '');
		if (typeof(s) !== 'string') {
			s = JSON.stringify(s, null, 2);
		}
		let html = elem.innerHTML;
		if (logMaxSize && (logMaxSize > 0)) {
			if (html.length > logMaxSize) {
				while (html.length > logMaxSize) {
					let o = html.lastIndexOf('<');
					if (o >= 0) {
						html = html.slice(0, o);
					} else {
						break;
					}
				}
			}
		}
		html = (ts +
				': ' +
				escapeHtml(s) +
				((html === '') ? '' : ('<br />' + html)));
		elem.innerHTML = html;
	}
}

function createConnectionElement(label, action) {
	var html = '';
	if (action || (typeof(label) === 'string')) {
		if (action) {
			html += '<a class="connection-action-link" id="connection.action.link" onclick="' + action + '()">';
		}
		if (label) {
			html += '<div ';
			if (action) {
				html += 'class ="connection-action-label" id="connection.action.link.label"';
			} else {
				html += 'class ="connection-disabled-action-label" id="connection.action.link.label"';
			}
			html += '>';
			if (label === '') {
				html += '&nbsp;';
			} else {
				html += escapeHtml(label);
			}
			html += '</div>';
		}
		if (action) {
			html +=  '</a>';
		}
	} else {
		html += '<div></div>';
	}
	var div = document.createElement('DIV');
	div.innerHTML = html;
	return div.firstChild;
}

function replaceConnectionElement(elem) {
	var parent = document.getElementById('connection.status');
	if (! parent) {
		return;
	}
	while (parent.firstChild) {
		parent.removeChild(parent.firstChild);
	}
	parent.appendChild(elem);
}

function get(url, cb) {
	var req = new XMLHttpRequest();
	var completed = false;
	var start = Date.now()
	req.open("GET", url);
	req.send();
	req.onerror = function(e) {
		if (completed) {
			return;
		}
		completed = true;
		log(url + 'ERROR');
		req.abort();
		if (cb) {
			cb(e);
		}
	};
	req.onreadystatechange = function(e) {
		var runtime = Date.now() - start;
		if (completed) {
			return;
		}
		switch (this.readyState) {
		case 0:
			//UNSENT
			break;
		case 1:
			//OPENED
			break;
		case 2:
			//HEADERS_RECEIVED
			break;
		case 3:
			//LOADING
			break;
		case 4:
			//DONE
			completed = true;
			if (cb) {
				let e = null;
				if (this.status != 200) {
					e = 'Bad HTTP status: ' + this.status;
				}
				cb(e, this.status, req.responseText);
			}
			log('HTTP request completion time: ' + (runtime / 1000).toFixed(4) + 's');
			break;
		}
	};
}	

function propertyLabel(property) {
	var r;
	switch (property) {
	case 'power':
		r = 'Power';
		break;
	case 'energy':
		r = 'Energy consumption';
		break;
	case 'lastSeen':
		r = 'Last seen';
		break;
	default:
		r = (property.length > 0) ? (property.charAt(0).toUpperCase() + property.slice(1)) : property;
	};
	return r;
}

function propertyValueString(property, value) {
	var r;
	switch (property) {
	case 'power':
		r = value ? 'on' : 'off';
		break;
	case 'energy':
		r = value.toFixed(2) + 'W';
		break;
	case 'lastSeen':
		r = new Date(value).toISOString().replace(/T/, ' ').replace(/Z/, '').replace(/\.\d+$/, '');
		break;
	default:
		r = value.toString();
	};
	return r;
}

function updatePropertyValue(uid, property, value) {
	let dev = devs[uid];
	if (dev) {
		switch (property) {
		case 'name':
			dev.name = value;
			break;
		case 'status':
			dev.status = value;
			break;
		case 'address':
			dev.address = value;
			break;
		case 'port':
			dev.port = value;
			break;
		case 'mac':
			dev.mac = value;
			break;
		default:
			dev.device.udata[property] = value;
		}
	}
	let eid;
	switch (property) {
	case 'name':
		eid = 'device.name.' + uid;
		break;
	case 'address':
	case 'port':
	case 'mac':
		eid = undefined;
		break;
	default:
		eid = 'device.property.' + uid + '.' + property + '.value';
	}
	if (eid) {
		let elem = document.getElementById(eid);
		if (elem) {
			elem.innerHTML = escapeHtml(propertyValueString(property, value));
		}
	}
}

function update(d) {
	if (isDebugSet()) {
		log('recv: ' + JSON.stringify(d));
	}
	switch (d.status) {
	case 'hello':
		{
			let name = d.name ? d.name : '';
			let elem = document.getElementById('name');
			if (elem) {
				elem.innerHTML = escapeHtml(name);
			}
		}
		break;
	case 'reachable':
		if (! (d && d.device && d.device.uid && d.device.udata)) {
			break;
		}
		if (devs[d.device.uid]) {
			log('Device ' + d.device.uid + ' becomes reachable');
			updatePropertyValue(d.device.uid, 'name', d.device.name);
			updatePropertyValue(d.device.uid, 'status', 'reachable');
			Object.keys(d.device.udata).forEach(function(k) {
				updatePropertyValue(d.device.uid, k, d.device.udata[k]);
			});	
	} else {
			log('Device ' + d.device.uid + ' is discovered');
			let properties = [ { id: 'status', label: 'Status', value: 'reachable' }];
			Object.keys(d.device.udata).forEach(function(k) {
				let p = { id: k, label: propertyLabel(k), value: propertyValueString(k, d.device.udata[k]) };
				properties.push(p);
			});
			let actions = [ { id: 'power-on', label: 'Power ON', action: 'actionPowerOn' },
							{ id: 'power-off', label: 'Power OFF', action: 'actionPowerOff' } ];
			let child = createDeviceElement(d.device.uid, d.device.name, properties, actions);
			let parent = document.getElementById('devices');
			if (parent) {
				parent.appendChild(child);
			}
		}
		d.status = 'reachable';
		devs[d.device.uid] = d;
		break;
	case 'unreachable':
		log('Device ' + d.device.uid + ' becomes unreachable');
		devs[d.device.uid].status = 'unreachable';
		updatePropertyValue(d.device.uid, 'status', devs[d.device.uid].status);
		break;
	case 'update':
		if (! (d && d.device && d.device.uid && devs[d.device.uid])) {
			break;
		}
		if (! ((typeof(d.device.name) === 'string') || d.device.udata)) {
			break;
		}
		log('Device ' + d.device.uid + ' update');
		if (typeof(d.device.name) === 'string') {
			devs[d.device.uid].device.name = d.device.name;
			updatePropertyValue(d.device.uid, 'name', d.device.name);
		}
		Object.keys(d.device.udata).forEach(function(k) {
			devs[d.device.uid].device.udata[k] = d.device.udata[k];
			updatePropertyValue(d.device.uid, k, d.device.udata[k]);
		});
		break;
	case 'pong':
		log('Pong!');
		break;
	case 'error':
		log('Error!');
		break;
	default:
		log('Unknown message status from server');
	}
}

initialize();
setInterval(ping, 5 * 60 * 1000);
