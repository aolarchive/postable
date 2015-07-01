var request = require('request');
var ndjson = require('ndjson');
var extend = require('extend');
var path = require('path');
var fs = require('fs');
var recursive = require('recursive-readdir');
var noop = function () { };

var logFile = __dirname + '/test.out.log';
try {
	fs.unlinkSync(logFile);
} catch (e) {

}

function setupEnv(env) {
	env = env || { };
	Object.keys(process.env).forEach(function (key) {
		if (key.match(/^POSTABLE_/)) {
			delete process.env[key];
		}
	});
	Object.keys(env).forEach(function (key) {
		process.env[key] = env[key];
	});
	process.env.POSTABLE_LOG_FILE = logFile;
	process.env.POSTABLE_LOG_LEVEL = 'debug';
}

setupEnv();
var nextPort = 3000;
var redis = require('../lib/redis');
redis.flushdb();

module.exports = function (env) {

	var server = null;
	var port = nextPort++;
	var base = 'http://localhost:' + port;
	env = env || { };
	env.POSTABLE_PORT = port;

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
			recursive(__dirname + '/../lib', function (err, files) {
				files.forEach(function (file) {
					var fullPath = path.resolve('' + file);
					delete require.cache[fullPath];
				});
			});
			setupEnv(env);
			server = require('../lib/app');
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