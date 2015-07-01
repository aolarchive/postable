var request = require('request');
var ndjson = require('ndjson');
var extend = require('extend');
var path = require('path');
var fs = require('fs');
var noop = function () { };

module.exports = function (env) {

	var server = null;
	var base = 'http://localhost:3000';
	var logFile = __dirname + '/test.out.log';

	Object.keys(process.env).forEach(function (key) {
		if (key.match(/^POSTABLE_/)) {
			delete process.env[key];
		}
	});
	env = env || { };
	Object.keys(env).forEach(function (key) {
		process.env[key] = env[key];
	});

	process.env.POSTABLE_LOG_FILE = logFile;
	process.env.POSTABLE_LOG_LEVEL = 'debug';
	try {
		fs.unlinkSync(logFile);
	} catch (e) {

	}

	function call(method, url, data, opt) {
		opt = opt || { };
		var listener = opt.listener || noop;
		var done = opt.done || noop;
		var response = opt.response || noop;
		var req;
		if (method === 'GET') {
			req = request.get(base + url, extend({ }, opt.options || { }));
		} else {
			req = request.post(base + url, extend({ json: true, body: data }, opt.options || { }));
		}
		var alive = true;
		function complete(state) {
			return function () {
				if (alive) {
					alive = false;
					if (done) {
						done(state);
					}
				}
			}
		}
		if (response) {
			req.on('response', response);
		}
		if (listener) {
			req.pipe(ndjson.parse()).on('data', listener || noop);
		}
		req.on('end', complete('end'));
		req.on('close', complete('complete'));
		req.on('error', complete('error'));
	}

	return {
		server: function () {
			return server;
		},
		start: function () {
			delete require.cache[path.resolve(__dirname + '/../lib/app.js')];
			server = require('../lib/app');
			server.app.redis.flushdb();
		},
		stop: function () {
			server && server.close();
		},
		get: function (url, opt) {
			return call('GET', url, null, opt);
		},
		post: function (url, data, opt) {
			return call('POST', url, data, opt);
		}
	};
};