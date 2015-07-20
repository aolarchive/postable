var setup = require('../../setup');
var assert = require('assert');
var express = require('express');

describe('routes/broadcastStartTask', function () {

	it('works', function (done) {

		this.timeout(5000);
		this.slow(5000);

		var ports = [3010,3011];
		var user = 'br0@dc@5t';
		var pass = 'P@55w0Rd!2';
		var uris = ports.map(function (port) { return 'http://127.0.0.1:' + port; }).join(';');
		var instances = [];
		var instancePorts = ports.slice();
		function nextInstance() {
			var port = instancePorts.shift();
			if (port) {
				var instance = setup({
					POSTABLE_AUTH_USER: user, POSTABLE_AUTH_PASS: pass,
					POSTABLE_PORT: port, POSTABLE_BROADCAST: uris
				});
				instance.start();
				instances.push(instance);
				setTimeout(nextInstance, 100);
			} else {
				setTimeout(startTest, 200);
			}
		}
		nextInstance();

		function startTest() {

			var task = { bar: 'baz', baz: Date.now() };
			var closed = [];
			var waiting = instances.length * 2;

			function complete() {
				instances.forEach(function (instance) {
					instance.stop();
				});
				done();
			}

			// Hook up a listener to both instances.
			instances.forEach(function (instance) {
				instance.post('/listeners/', { buckets: ['foo'] }, {
					options: { auth: { user: user, pass: pass } },
					listener: function (item) {
						// Verify the messages coming to the listener are correct.
						assert(item);
						assert(item.data);
						assert(item.data.bar);
						assert(item.data.baz);
						assert(item.data.bar === task.bar);
						assert(item.data.baz === task.baz);
						assert(item.id);
						assert(item.listenerId);
						// Respond to the messages with the expected response.
						var response = { instancePort: instance.port };
						instance.post('/tasks/' + item.id + '/results/' + item.listenerId, response, {
							options: { auth: { user: user, pass: pass } }
						});
						--waiting || complete();
					},
					done: function (reason) {
						closed.push(reason);
					}
				});
			});

			// Broadcast a message from instance 1 and ensure all instances received it.
			setTimeout(function () {
				var waitingPorts = new Set(ports);
				instances[0].post('/broadcast/buckets/foo/tasks/?timeout=2', task, {
					options: { auth: { user: user, pass: pass } },
					listener: function (item) {
						if (item && item.meta) {
							if (item.meta.broadcastClusters) {
								assert(item.meta.broadcastClusters === 2);
							} else if (item.meta.listenersPending) {
								assert(Array.isArray(item.meta.listenersPending));
								assert(item.meta.listenersPending.length === 1);
							} else if (item.meta.error) {
								throw new Error('Unexpected message error');
							} else {
								throw new Error('Unexpected message');
							}
						} else {
							assert(item);
							assert(item.data);
							assert(item.data.instancePort);
							assert(waitingPorts.has(item.data.instancePort));
							waitingPorts.delete(item.data.instancePort);
							--waiting || complete();
						}
					}
				});
			}, 100);

		}
	});

	it('handles status code errors', function (done) {
		runHandleErrorTest.call(this, 'error', [3012,3013], done)
	});

	it('handles header errors', function (done) {
		runHandleErrorTest.call(this, 'no-header', [3014,3015], done)
	});

	function runHandleErrorTest(behavior, ports, done) {

		this.timeout(5000);
		this.slow(5000);
		var instance = setup({ POSTABLE_PORT: ports[0], POSTABLE_BROADCAST: ports.map(function (port) {
			return 'http://127.0.0.1:' + port;
		}).join(';') });
		instance.start();
		var app = express();
		app.post('/buckets/foo/tasks/', function (req, res) {
			switch (behavior) {
				default:
					res.status(500).end();
					break;
				case 'no-header':
					res.status(200).end();
					break;
			}
		});
		var server = app.listen(ports[1]);
		setTimeout(startTest, 100);

		function startTest() {

			var task = { bar: 'baz', baz: Date.now() };
			var closed = [];
			var waiting = 5;
			var errors = 0;

			function complete() {
				if (!errors) {
					throw new Error('Expected at least one error')
				}
				instance.stop();
				server.close();
				done();
			}

			// Hook up a listener to both instances.
			instance.post('/listeners/', { buckets: ['foo'] }, {
				listener: function (item) {
					// Verify the messages coming to the listener are correct.
					assert(item);
					assert(item.data);
					assert(item.data.bar);
					assert(item.data.baz);
					assert(item.data.bar === task.bar);
					assert(item.data.baz === task.baz);
					assert(item.id);
					assert(item.listenerId);
					// Respond to the messages with the expected response.
					var response = { instancePort: instance.port };
					instance.post('/tasks/' + item.id + '/results/' + item.listenerId, response);
					--waiting || complete();
				},
				done: function (reason) {
					closed.push(reason);
				}
			});

			// Broadcast a message from instance 1 and ensure all instances received it.
			setTimeout(function () {
				var waitingPorts = new Set(ports);
				instance.post('/broadcast/buckets/foo/tasks/?timeout=2', task, {
					listener: function (item) {
						if (item && item.meta) {
							if (item.meta.broadcastClusters) {
								assert(item.meta.broadcastClusters === 2);
							} else if (item.meta.listenersPending) {
								assert(Array.isArray(item.meta.listenersPending));
								assert(item.meta.listenersPending.length === 1);
							} else if (item.meta.error) {
								if (behavior === 'error') {
									assert(item.meta.error.status);
									assert(item.meta.error.status === 500);
								} else if (behavior === 'no-header') {
									assert(item.meta.error.status === 0);
								}
								errors++;
							} else {
								throw new Error('Unexpected message');
							}
							--waiting || complete();
						} else {
							assert(item);
							assert(item.data);
							assert(item.data.instancePort);
							assert(waitingPorts.has(item.data.instancePort));
							waitingPorts.delete(item.data.instancePort);
							--waiting || complete();
						}
					}
				});
			}, 100);

		}
	}

});