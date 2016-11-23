var setup = require('../setup');
var express = require('express');
var assert = require('assert');
var bodyParser = require('body-parser');
var path = require('path');
var uuid = require('uuid');
var extend = require('extend');
var nextPort = require('../nextPort');

describe('listener', function () {

	var user = 'example';
	var pass = 'P@55w0Rd!';

	function startPostable(options, callback) {
		options = options || {};
		// Start postable
		var instance = setup({ POSTABLE_PORT: options.port, POSTABLE_AUTH_USER: user, POSTABLE_AUTH_PASS: pass });
		instance.start();
		callback(instance);
	}

	function startReceiver(options, callback) {
		options = options || {};
		// Start receiver
		var app = express();
		app.use(bodyParser.json());
		app.use(bodyParser.urlencoded({ extended: true }));
		app.get('/buckets', function (req, res, next) {
			res.status(options.bucketsStatus || 200).json(options.buckets);
		});
		app.post('/task', function (req, res, next) {
			var task = req.body.task;
			if (!options.receiverNoResult) {
				options.instance.post(
					'/tasks/' + task.id + '/results/' + task.listenerId,
					{ taskReceived: task },
					{ options: { auth: { user: user, pass: pass } } }
				);
			}
			res.status(options.receiverStatus || 200);
			res.end();
		});
		var server = app.listen(options.receiverPort, function () {
			callback(server);
		});
	}

	function startPostableAndReceiver(options, callback) {
		var running = true;
		startPostable(options, function (instance) {
			options.instance = instance;
			options.receiverPort = options.receiverPort || nextPort();
			options.instancePort = instance.port;
			startReceiver(options, function (receiver) {
				function stop() {
					if (running) {
						running = false;
						instance.stop();
						receiver.close();
					}
				}
				callback(instance, receiver, stop);
			});
		});
	}

	function startListener(options, callback) {
		options = options || {};
		var bucketPort = options.bucketPort || options.receiverPort;
		process.env.POSTABLE_AUTH_USER = options.user || user;
		process.env.POSTABLE_AUTH_PASS = options.pass || pass;
		process.env.POSTABLE_LISTEN_BUCKETS_HTTP_URL = 'http://localhost:' + bucketPort + '/buckets';
		process.env.POSTABLE_LISTEN_FORWARD_HTTP_URL = 'http://localhost:' + options.receiverPort + '/task';
		process.env.POSTABLE_LISTEN_BASE_URL = 'http://localhost:' + options.instancePort;
		process.env.POSTABLE_LISTEN_RECONNECT_RATE = options.listenerReconnectRate || 5;
		process.env.POSTABLE_LISTEN_BUCKETS_RECONNECT_RATE = options.listenerBucketReconnectRate || 5;
		setup.clearRequireCache();
		var listener = require('../../lib/listener.js');
		listener.start(function () {
			callback(listener);
		}, options.log);
	}

	it('works', function (done) {
		this.slow(500);
		this.timeout(1000);

		var bucket = uuid.v4();
		var options = { buckets: [bucket] };
		startPostableAndReceiver(options, function (instance, receiver, stop) {
			setTimeout(stop, 900);
			startListener(options, function (listener) {

				var task = { bar: 'baz' };
				instance.post('/buckets/' + bucket + '/tasks/', task, {
					options: { auth: { user: user, pass: pass } },
					listener: function (item) {
						if (item && item.data && item.data.taskReceived) {
							assert.deepEqual(item.data.taskReceived.data, task);
							listener.stop();
							stop();
							done();
						}
					}
				});

			});
		});
	});

	it('restarts gracefully', function (done) {
		this.slow(700);
		this.timeout(1000);

		var bucket = uuid.v4();
		var instancePort = nextPort();
		var receiverPort = nextPort();
		var options = {
			port: instancePort,
			instancePort: instancePort,
			receiverPort: receiverPort,
			buckets: [bucket]
		};
		startPostableAndReceiver(options, function (instance, receiver, stop) {
			setTimeout(stop, 900);
			startListener(options, function (listener) {
				// Once the listener is started, stop postable and the receiver.
				stop();
				options.bucketsStatus = 200;
				// Start postable and the receiver again and ensure that we still receive the message from the receiver.
				startPostableAndReceiver(options, function (instance, receiver, stop) {

					setTimeout(function () {
						var task = { bar: 'baz' };
						instance.post('/buckets/' + bucket + '/tasks/', task, {
							options: { auth: { user: user, pass: pass } },
							listener: function (item) {
								if (item && item.data && item.data.taskReceived) {
									assert.deepEqual(item.data.taskReceived.data, task);
									stop();
									done();
								}
							}
						});
					}, 200);
				});
			});
		});
	});

	var badStates = [
		{ name: 'non-200 status', status: 500 },
		{ name: 'no cluster ID', noClusterId: true },
	];

	badStates.forEach(function (state) {
		it('continues to try to reconnect in a bad state (' + state.name + ')', function (done) {

			this.slow(2000);
			this.timeout(5000);

			var badInstance;
			var bucketServer;
			var instancePort = nextPort();
			var receiverPort = nextPort();
			var bucketPort = nextPort();
			var bucket = uuid.v4();

			var options = {
				port: instancePort,
				instancePort: instancePort,
				receiverPort: receiverPort,
				bucketPort: bucketPort,
				buckets: [bucket],
				listenerReconnectRate: '0.1'
			};

			startBucketServer();

			function startBucketServer() {
				var app = express();
				app.use(bodyParser.json());
				app.use(bodyParser.urlencoded({ extended: true }));
				app.get('/buckets', function (req, res, next) {
					res.status(200).json(options.buckets);
				});
				bucketServer = app.listen(bucketPort, startBadApp);
			}

			function startBadApp() {
				var app = require('express')();
				app.use(function (req, res, next) {
					res.status(state.status || 200);
					if (!state.noClusterId) {
						res.set('x-postable-cluster-id', uuid.v4());
					}
					res.end();
				});
				badInstance = app.listen(instancePort, beginListening);
			}

			function beginListening() {
				var listenerStarted;
				startListener(options, function (listener) {
					listenerStarted = listener;
				});
				setTimeout(function () {
					badInstance.close();
					startPostableAndReceiver(options, function (instance, receiver, stop) {
						setTimeout(function () {
							var task = { bar: 'baz' };
							instance.post('/buckets/' + bucket + '/tasks/', task, {
								options: { auth: { user: user, pass: pass } },
								listener: function (item) {
									if (item && item.data && item.data.taskReceived) {
										assert.deepEqual(item.data.taskReceived.data, task);
										bucketServer.close();
										listenerStarted && listenerStarted.stop();
										stop();
										done();
									}
								}
							});
						}, 200);
					});
				}, 100);
			}

		});
	});

	var badBucketStates = [
		{ name: 'no server', noServer: true },
		{ name: 'non-200 status', status: 500 },
		{ name: 'no array body', body: 'bad' },
		{ name: 'empty body', body: [] },
		{ name: 'non-string buckets', body: ['foo', { bad: true }, 'bar'] },
	];

	badBucketStates.forEach(function (badState) {
		it('continues to try to get buckets in a bad state (' + badState.name + ')', function (done) {

			this.slow(2000);
			this.timeout(5000);

			var badBucketServer;
			var bucketServer;
			var instancePort = nextPort();
			var receiverPort = nextPort();
			var bucketPort = nextPort();
			var bucket = uuid.v4();

			var options = {
				port: instancePort,
				instancePort: instancePort,
				receiverPort: receiverPort,
				bucketPort: bucketPort,
				buckets: [bucket],
				listenerReconnectRate: '0.1',
				listenerBucketReconnectRate: '0.1'
			};

			badBucketServer = startBucketServer(badState, beginListening);

			function startBucketServer(bucketServerOptions, callback) {
				bucketServerOptions = bucketServerOptions || {};
				if (!bucketServerOptions.noServer) {
					var app = express();
					app.use(bodyParser.json());
					app.use(bodyParser.urlencoded({ extended: true }));
					app.get('/buckets', function (req, res, next) {
						res.status(bucketServerOptions.status || 200).json(bucketServerOptions.body || [bucket]);
					});
					return app.listen(bucketPort, callback);
				}
				setTimeout(callback, 0);
				return null;
			}

			function beginListening() {
				var listenerStarted;
				startListener(options, function (listener) {
					listenerStarted = listener;
				});
				setTimeout(function () {
					badBucketServer && badBucketServer.close();
					bucketServer = startBucketServer(null, function () {
						startPostableAndReceiver(options, function (instance, receiver, stop) {
							setTimeout(function () {
								var task = { bar: 'baz' };
								instance.post('/buckets/' + bucket + '/tasks/', task, {
									options: { auth: { user: user, pass: pass } },
									listener: function (item) {
										if (item && item.data && item.data.taskReceived) {
											assert.deepEqual(item.data.taskReceived.data, task);
											bucketServer.close();
											listenerStarted && listenerStarted.stop();
											stop();
											done();
										}
									}
								});
							}, 200);
						});
					});
				}, 100);
			}

		});
	});

	it('fails when options are not set', function () {
		var tests = [
			'POSTABLE_LISTEN_BASE_URL',
			'POSTABLE_LISTEN_BUCKETS_HTTP_URL',
			'POSTABLE_LISTEN_FORWARD_HTTP_URL'
		];
		tests.forEach(function (key) {
			tests.forEach(function (key) {
				process.env[key] = 'test';
			});
			delete process.env[key];
			setup.clearRequireCache();
			assert.throws(function () {
				require('../../lib/listener');
			}, Error);
		});
	});

	it('fails when listener data is invalid', function () {
		process.env.POSTABLE_LISTEN_BUCKETS_HTTP_URL =
		process.env.POSTABLE_LISTEN_FORWARD_HTTP_URL =
		process.env.POSTABLE_LISTEN_BASE_URL = 'test';
		process.env.POSTABLE_LISTEN_LISTENER_DATA = '#$%^&*(';
		setup.clearRequireCache();
		assert.throws(function () {
			require('../../lib/listener');
		}, Error);
	});

	it('fails when listener data is not an object', function () {
		process.env.POSTABLE_LISTEN_BUCKETS_HTTP_URL =
		process.env.POSTABLE_LISTEN_FORWARD_HTTP_URL =
		process.env.POSTABLE_LISTEN_BASE_URL = 'test';
		process.env.POSTABLE_LISTEN_LISTENER_DATA = '123';
		setup.clearRequireCache();
		assert.throws(function () {
			require('../../lib/listener');
		}, Error);
	});

});