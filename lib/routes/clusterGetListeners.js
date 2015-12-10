var json = require('../json');

module.exports = function (app, config) {

	return function clusterGetListeners(req, res) {

		// Validate arguments.

		var bucket = (req.params.bucket || '').trim();

		if (!bucket) {
			return res.status(400).end();
		}

		// Gets the listener details with the given ID.
		function getListener(id, callback) {
			var redisKeyListener = app.redis.key('listener', id);
			app.redis.get(redisKeyListener, function (e, listenerJson) {
				var listener = null;
				if (listenerJson) {
					listener = json.tryParse(listenerJson);
					if (listener) {
						listener.id = id;
						delete listener.listenerId;
					}
				}
				callback(e, listener || null);
			});
		}

		// Get all listeners in the given bucket.

		var allListeners = [];
		var redisKeyBucketListeners = app.redis.key('listeners', bucket);
		app.redis.zrangebyscore(redisKeyBucketListeners, 0, Date.now(), function (e, replies) {
			if (!Array.isArray(replies) || !replies.length) {
				return complete();
			}
			var pending = replies.length;
			replies.forEach(function (listenerId) {
				getListener(listenerId, function (listener) {
					allListeners.push(listener);
					--pending || complete();
				});
			});
		});

		function complete() {
			res.status(200).json(allListeners);
		}
	};
};
