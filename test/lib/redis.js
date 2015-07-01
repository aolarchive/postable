var path = require('path');
var assert = require('assert');
var winston = require('winston');

describe('redis', function () {


	function redisLoggingTo(logArray) {
		delete require.cache[path.resolve(__dirname + '/../../lib/redis.js')];
		return require('../../lib/redis')(new (winston.Logger)({
			transports: [{
				level: 'debug',
				log: function (type, message, context) {
					logArray.push({ type: type, message: message, context: context });
				}
			}]
		}));
	}

	it('logs + debugs "error" events', function () {
		var logged = [];
		var redis = redisLoggingTo(logged);
		redis.emit('error', 'foo');
		assert(logged.length === 1);
		assert(logged[0].type === 'error');
		assert(logged[0].message.match(/redis.*error/i));
	});

	it('debugs "end" events', function () {
		var logged = [];
		var redis = redisLoggingTo(logged);
		redis.emit('end');
		assert(logged.length === 1);
		assert(logged[0].type === 'debug');
		assert(logged[0].message.match(/redis.*ended/i));
	});

});