var setup = require('../../setup');
var assert = require('assert');

describe('endpoints/{listen,start}', function () {

	it('works', function (done) {

		this.slow(1000);
		this.timeout(2000);

		var instance = setup();
		instance.start();

		var actual = { tasks: [], responses: [] };
		var expect = { tasks: [], responses: [] };
		var close = { tasks: [], responses: [] };

		var buckets = ['b1','b2','b3'];
		var waiting = 1 + (buckets.length * 2);
		buckets.forEach(function (bucket) {
			expect.tasks.push({ b: bucket });
			expect.responses.push({ r: bucket });
		});

		// Once all messages have been sent,
		// verify that the data expected was sent/received.
		function complete() {
			actual.responses = actual.responses.sort(function (a, b) {
				return a.r.localeCompare(b.r);
			});
			actual.tasks = actual.tasks.sort(function (a, b) {
				return a.b.localeCompare(b.b);
			});
			assert.deepEqual(expect, actual);
			instance.stop();
			done();
		}

		// Ensure no buckets results in 400.
		instance.post('/listeners/', { bad: true }, {
			response: function (res) {
				assert(res.statusCode === 400);
				assert(res.headers['x-postable-cluster-id']);
				--waiting || complete();
			}
		});

		// Hook up a listener to all buckets.
		instance.post('/listeners/', { buckets: buckets }, {
			listener: function (item) {
				// Verify the messages coming to the listener are correct.
				assert(item);
				assert(item.id);
				assert(item.listenerId);
				assert(item.data);
				assert(item.data.task);
				assert('number' === typeof item.data.index);
				actual.tasks.push(item.data.task);
				// Respond to the messages with the expected responses.
				instance.post('/tasks/' + item.id + '/results/' + item.listenerId, expect.responses[item.data.index]);
				--waiting || complete();
			},
			done: function (reason) {
				close.responses.push(reason);
			}
		});
		// Put a task on each bucket.
		setTimeout(function () {
			expect.tasks.forEach(function (t, i) {
				instance.post('/buckets/' + t.b + '/tasks/', { task: t, index: i }, {
					listener: function (item) {
						// Verify that responses coming from the listeners look correct.
						assert(item);
						if (item.meta) {
							assert(item.meta.listenersPending && item.meta.listenersPending.length === 1);
							return;
						}
						assert(item.data);
						assert(item.listener);
						assert(item.listener.id);
						assert.deepEqual(buckets, item.listener.buckets);
						assert(item.timeout === false);
						actual.responses.push(item.data);
						--waiting || complete();
					},
					done: function (reason) {
						close.tasks.push(reason);
					}
				})
			});
		}, 5);

	});


	it('times out listeners', function (done) {

		this.slow(3000);
		this.timeout(2000);

		var instance = setup();
		instance.start();

		// Hook up a listener to all buckets.
		instance.post('/listeners/', { buckets: ['bt1'] }, {
			listener: function (item) {
				instance.post('/tasks/' + item.id + '/results/' + item.listenerId, { foo: 'bar' });
			}
		});
		instance.post('/listeners/', { buckets: ['bt1'] }, {
			listener: function (item) {
				// Do nothing.
			}
		});
		var responses = [];
		// Put a task on the bucket.
		setTimeout(function () {
			instance.post('/buckets/bt1/tasks/?timeout=1', { bar: 'baz' }, {
				listener: function (item) {
					// Verify that responses coming from the listeners look correct.
					assert(item);
					if (item.meta) {
						assert(item.meta.listenersPending && item.meta.listenersPending.length === 2);
						return;
					}
					responses.push(item);
				},
				done: function (reason) {
					assert(responses.length === 2);
					responses.forEach(function (response) {
						assert(response.listener);
						assert(response.listener.id);
						assert(response.listener.started);
						assert.deepEqual(response.listener.buckets, ['bt1']);
					});
					assert(responses[0].timeout === false);
					assert.deepEqual(responses[0].data, { foo: 'bar' });
					assert(responses[1].timeout === true);
					assert(responses[1].data === null);
					done();
					instance.stop();
				}
			});
		}, 5);

	});


	it('periodically extends listeners', function (done) {

		this.slow(4000);
		this.timeout(5000);

		var instance = setup({ POSTABLE_LISTENER_TIMEOUT_SECONDS: 1 });
		instance.start();

		// Hook up a listener.
		instance.post('/listeners/', { buckets: ['be1'] });

		// The listener should be extended in 500ms (half that of POSTABLE_LISTENER_TIMEOUT_SECONDS).
		// Verify that is the case.
		setTimeout(function () {
			var redis = instance.server().app.redis;
			var redisKeyBucketListeners = redis.key('listeners', 'be1');
			redis.zrangebyscore(redisKeyBucketListeners, 0, Date.now(), function (e, replies) {
				assert(replies.length === 1);
				var redisKeyListener = redis.key('listener', replies[0]);
				redis.get(redisKeyListener, function (e, listener) {
					listener = JSON.parse(listener);
					assert(listener.id);
					assert(listener.buckets);
					assert(listener.started);
					redis.pttl(redisKeyListener, function (e, pttl) {
						assert(pttl);
						assert(+pttl > 500);
						done();
						instance.stop();
					});
				});
			});
		}, 700);

	});


	it('removes disconnected listeners', function (done) {

		this.slow(4000);
		this.timeout(5000);

		var instance = setup();
		instance.start();

		// Hook up a listener.
		var req = instance.post('/listeners/', { buckets: ['bd1'] });

		// The listener should be extended in 500ms (half that of POSTABLE_LISTENER_TIMEOUT_SECONDS).
		// Verify that is the case.
		setTimeout(function () {
			var redis = instance.server().app.redis;
			var redisKeyBucketListeners = redis.key('listeners', 'bd1');
			redis.zrangebyscore(redisKeyBucketListeners, 0, Date.now(), function (e, replies) {
				assert(replies.length === 1);
				req.abort();
				setTimeout(function () {
					redis.zrangebyscore(redisKeyBucketListeners, 0, Date.now(), function (e, replies) {
						assert(replies.length === 0);
						done();
						instance.stop();
					});
				}, 100);
			});
		}, 100);

	});


	it('rejects empty results', function (done) {

		var instance = setup();
		instance.start();

		// Hook up a listener.
		instance.post('/tasks/ /results/bar', { }, {
			response: function (res) {
				assert(res.statusCode === 400);
				done();
				instance.stop();
			}
		});
	});


	it('returns immediately with no listeners', function (done) {

		var instance = setup();
		instance.start();
		var items = [];

		// Send a task with no listeners.
		instance.post('/buckets/no-listeners/tasks/?timeout=10', { bar: 'baz' }, {
			listener: function (item) {
				items.push(item);
			},
			response: function (res) {
				setTimeout(function () {
					assert(res.statusCode === 200);
					assert(items.length === 1);
					assert(items[0].meta);
					done();
					instance.stop();
				}, 10);
			}
		});
	});

	it('handles edge case of pending set being empty on timeout', function (done) {

		this.slow(4000);
		this.timeout(4000);

		var instance = setup();
		instance.start();
		var items = [];
		var taskId;

		// Hook up a listener that does not respond.
		instance.post('/listeners/', { buckets: ['edgecase1'] }, {
			listener: function (task) {
				taskId = task.id;
			}
		});

		setTimeout(function () {
			// Send a task.
			instance.post('/buckets/edgecase1/tasks/?timeout=1', { bar: 'baz' }, {
				listener: function (item) {
					items.push(item);
				},
				done: function () {
					assert(items.length === 1);
					assert(items[0].meta);
					done();
					instance.stop();
				},
				response: function (res) {
					assert(res.statusCode === 200);
				}
			});

			setTimeout(function () {
				var redis = instance.server().app.redis;
				var redisKeyPending = redis.key('pending', taskId);
				redis.del(redisKeyPending);
			}, 100);

		}, 100);

	});

});