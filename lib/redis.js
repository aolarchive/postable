var redis = require('redis');
var json = require('./json');
var env = process.env;
var keyPrefix = env.POSTABLE_REDIS_PREFIX || 'postable_';

module.exports = function (log) {

	function redisConnect() {
		var host = env.POSTABLE_REDIS_HOST || '127.0.0.1';
		var port = env.POSTABLE_REDIS_PORT || 6379;
		var pass = env.POSTABLE_REDIS_PASS || null;
		var client = redis.createClient(port, host, {auth_pass: pass});
		client.on('connect', function () {
			log.debug('redis:connected: ' + host + ':' + port);
		});
		client.on('error', function (e) {
			log.error('redis:error: ' + e, {error: e});
		});
		client.on('end', function () {
			log.debug('redis:ended: ' + host + ':' + port);
		});
		return client;
	}

// Connect to redis; open 2 connections,
// one for the client and one for the subscriber.

	var redisClient = redisConnect();
	var redisSubscriber = redisConnect();
	var redisSubscriptions = new Map();

// When a message is received, forward it to all internal subscribers.

	redisSubscriber.on('message', function receiveMessage(channel, message) {
		var set = redisSubscriptions.get(channel);
		var data = json.tryParse(message);
		if (set && set.size && data) {
			set.forEach(function (callback) {
				callback(data);
			});
		}
	});

// Wrap redis publish with a JSON stringifier.

	function publish(channel, message, callback) {
		redisClient.publish(channel, JSON.stringify(message), callback);
	}

// Wrap redis subscribe with logic to forward message received internally.
// Also return an unsubscribe function for easily unsubscribing this particular subscription.

	function subscribe(channel, callback) {

		var set = redisSubscriptions.get(channel);
		if (!set) {
			set = new Set();
			redisSubscriptions.set(channel, set);
			redisSubscriber.subscribe(channel);
		}
		set.add(callback);

		function unsubscribe() {
			set.delete(callback);
			if (!set.size) {
				redisSubscriptions.delete(channel);
				redisSubscriber.unsubscribe(channel);
			}
		}

		return unsubscribe;
	}

	redisClient.pub = publish;
	redisClient.sub = subscribe;
	redisClient.key = function () {
		return keyPrefix + Array.prototype.join.call(arguments, '_');
	};

	return redisClient;
};