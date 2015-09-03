var json = require('../json');
var uuid = require('../uuid');

module.exports = function (app, config) {

	return function clusterStartTask(req, res) {

		// Validate arguments.

		var taskId = uuid('t');
		var task = { started: new Date(), id: taskId, data: req.body };
		var taskJson = JSON.stringify(task);
		var bucket = req.params.bucket;
		var timeout = Math.max(1, +req.query.timeout || 30);
		var alive = true;

		// If the task is not meant for this cluster, do nothing.

		var cluster = req.query.cluster;
		if (cluster && (
				('string' === typeof cluster && cluster !== req.currentClusterId) ||
				(Array.isArray(cluster) && cluster.indexOf(req.currentClusterId) < 0)
		)) {
			req.log.debug('Start task: different cluster ID given.', {
				requested_cluster: req.query.cluster,
				this_cluster: req.currentClusterId
			});
			return res.status(204).end();
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

		req.log.debug('Start task: starting...', {
			task: task,
			taskBucket: bucket
		});

		// Set this task as the last task received for the bucket.

		var redisKeyLastTask = app.redis.key('last', bucket);
		app.redis.setex(redisKeyLastTask, config.lastTaskTimeoutSeconds, taskJson);

		// Copy the bucket's listener set into another key specifically for this task.
		// Give the set the same timeout as the task with some padding.

		var redisKeyPending = app.redis.key('pending', taskId);
		var redisKeyBucketListeners = app.redis.key('listeners', bucket);
		app.redis.zremrangebyscore(redisKeyBucketListeners, 0, Date.now() - (config.listenerTimeoutSeconds * 1000));
		app.redis.zunionstore(redisKeyPending, 1, redisKeyBucketListeners, function () {
			app.redis.pexpire(redisKeyPending, Math.floor(timeout * 1000) + (30 * 1000));

			// Send a meta message to the caller, listing the listeners we're waiting for.

			app.redis.zrangebyscore(redisKeyPending, 0, Date.now(), function (e, replies) {

				req.log.debug('Start task: got listeners replies (' + replies.length + ')', {
					taskListenersReply: replies
				});

				var listenersPending = null;
				if (!e && replies) {
					listenersPending = replies;
				}

				// If a maximum number of listeners were specified, clip the list and add them to the task.
				// The listener logic will filter this task from its stream if the listener ID is not in the list.

				var maxListeners = Math.max(0, (req.query.max && parseInt(req.query.max, 10)) || 0);
				if (maxListeners && maxListeners < listenersPending.length) {
					listenersPending = listenersPending.slice(listenersPending.length - maxListeners);
					task.listeners = listenersPending;
					taskJson = JSON.stringify(task);
				}

				req.log.debug('Start task: listeners pending (' + listenersPending.length + ')', {
					taskListenersPending: listenersPending
				});

				res.write(JSON.stringify({ meta: { listenersPending: listenersPending } }) + "\n");

				// If there are no listeners, just end now.

				if (!listenersPending.length) {

					req.log.debug('Start task: no listeners, ending task', {
						taskListenersPending: listenersPending
					});

					res.end();
					return;
				}

				function sendHeartbeat() {
					if (alive) {
						res.write(JSON.stringify({ignoreHeartbeat: true}) + "\n");
					}
				}

				var intervalHeartbeatMillis = config.heartbeatMillis || 5000;
				var intervalHeartbeat = setInterval(sendHeartbeat, intervalHeartbeatMillis);

				// Stream results back from subscribers by
				// subscribing to a response channel for the task.

				var redisKeyRespondChannel = app.redis.key('respond', taskId);
				var unsubscribe = app.redis.sub(redisKeyRespondChannel, function (data) {

					req.log.debug('Start task: got response from listener', {
						taskListenerAlive: alive,
						taskListenerResponseData: data
					});

					if (alive && data && data.listenerId) {
						getListener(data.listenerId, function (e, listener) {
							if (listener && listener.id && listener.id === data.listenerId) {
								delete data.listenerId;
								data.listener = listener;
								data.timeout = false;
								res.write(JSON.stringify(data) + "\n");

								// Every time a result from a listener is received, remove the listener ID from the pending set and
								// check the set to see if it has been emptied. If so, end the response.

								app.redis.zrem(redisKeyPending, listener.id, function () {
									app.redis.zcount(redisKeyPending, 0, Date.now(), function (e, count) {
										if (!e && count === 0) {
											res.end();
											destroy();
										}
									});
								});
							}
						});
					}
				});

				// Publish this task on the bucket's channel.

				var redisKeySendChannel = app.redis.key('send', bucket);
				app.redis.publish(redisKeySendChannel, taskJson);

				// When destroying, unsubscribe, clear the timeout/interval, and
				// log the listeners (those in the response set) that failed to respond.

				function destroy() {
					if (alive) {

						req.log.debug('Start task: destroy called, ending task');

						alive = false;
						clearTimeout(timeoutHandle);
						clearInterval(intervalHeartbeat);
						unsubscribe();
					}
				}

				// If the timeout is reached, end the response and destroy.

				var timeoutHandle = setTimeout(function () {

					// For each of the listeners that did not respond, include a timeout response from them.

					req.log.debug('Start task: timeout reached, getting pending listeners');

					app.redis.zrangebyscore(redisKeyPending, 0, Date.now(), function (e, replies) {

						req.log.debug('Start task: got expired listeners replies (' + replies.length + ')', {
							taskListenersExpiredReply: replies
						});

						if (!e && replies && replies.length) {
							var waiting = replies.length;
							replies.forEach(function (listenerId) {
								getListener(listenerId, function (e, listener) {
									var data = { listener: listener, timeout: true, data: null };
									res.write(JSON.stringify(data) + "\n");
									--waiting || timeoutListenersSent();
								});
							});
						} else {
							timeoutListenersSent();
						}
					});
					function timeoutListenersSent() {
						res.end();
						destroy();
					}
				}, Math.floor(timeout * 1000));

				// If the response ends, destroy.

				res.on('finish', destroy);
				res.on('close', destroy);
				res.on('error', destroy);

			});
		});
	};

};