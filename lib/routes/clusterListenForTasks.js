var uuid = require('../uuid');

module.exports = function (app, config) {

	return function clusterListenForTasks(req, res) {

		// Validate arguments.

		if (!req.body || !req.body.buckets || !Array.isArray(req.body.buckets) || !req.body.buckets.length) {
			return res.status(400).end();
		}

		var buckets = req.body.buckets.map(function (bucket) {
			return (bucket || '').trim()
		});

		// Create a new listener.

		var listenerId = uuid('l');
		var unsubscribers = [];
		var alive = true;
		var listener = req.body;
		listener.id = listenerId;
		listener.started = new Date();
		var redisKeyListener = app.redis.key('listener', listenerId);

		// Add the details of this listener to redis.
		// Add this listener to the buckets listener sets.

		app.redis.setex(redisKeyListener, config.listenerTimeoutSeconds, JSON.stringify(listener));
		buckets.forEach(function (bucket) {
			var redisKeyBucketListeners = app.redis.key('listeners', bucket);
			app.redis.zadd(redisKeyBucketListeners, Date.now(), listenerId);
			app.redis.expire(redisKeyBucketListeners, config.listenerSetTimeoutSeconds);
		});

		var intervalHeartbeatMillis = config.heartbeatMillis || 5000;
		var intervalHeartbeat = setInterval(function () {
			if (alive) {
				res.write(JSON.stringify({ignoreHeartbeat: true}) + "\n");
			}
		}, intervalHeartbeatMillis);

		// Keep this listener in redis as long as the connection is active.
		// Every so often, extend the expiration for this listener.
		// Also extend the expiration for the buckets that the listener is attached to.

		var intervalMillis = Math.max(500, Math.floor(Math.max(1, config.listenerTimeoutSeconds / 2) * 1000) - 1000);
		var intervalHandle = setInterval(function () {
			if (alive) {
				app.redis.expire(redisKeyListener, config.listenerTimeoutSeconds);
				buckets.forEach(function (bucket) {
					var redisKeyLastTask = app.redis.key('last', bucket);
					var redisKeyBucketListeners = app.redis.key('listeners', bucket);
					app.redis.expire(redisKeyLastTask, config.lastTaskTimeoutSeconds);
					app.redis.expire(redisKeyBucketListeners, config.listenerSetTimeoutSeconds);
					app.redis.zadd(redisKeyBucketListeners, Date.now(), listenerId);
					app.redis.zremrangebyscore(redisKeyBucketListeners, 0, Date.now() - (config.listenerTimeoutSeconds * 1000));
				});
			}
		}, intervalMillis);

		// When this response ends, clean up.
		// Remove the listener ID from all bucket listener sets.
		// Unsubscribe from all of the buckets.

		function destroy() {
			if (alive) {
				alive = false;
				clearInterval(intervalHandle);
				clearInterval(intervalHeartbeat);
				buckets.forEach(function (bucket) {
					var redisKeyBucketListeners = app.redis.key('listeners', bucket);
					app.redis.zrem(redisKeyBucketListeners, listenerId);
				});
				unsubscribers.forEach(function (unsubscriber) {
					unsubscriber();
				});
			}
		}
		res.on('finish', destroy);
		res.on('close', destroy);
		res.on('error', destroy);

		// Subscribe to all of the channels for the given buckets.
		// As messages come in, stream them to the response.

		buckets.forEach(function (bucket) {
			var redisKeySendChannel = app.redis.key('send', bucket);
			var unsubscriber = app.redis.sub(redisKeySendChannel, function (data) {
				data.listenerId = listenerId;
				res.write(JSON.stringify(data) + "\n");
			});
			unsubscribers.push(unsubscriber);
		});
	};
};