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
		var waiting = buckets.length * 2;
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
			assert.deepEqual(expect, actual);
			instance.stop();
			done();
		}

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
		// Put a task on each bucket.
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

});