var log = require('./log');
var request = require('request');
var ndjson = require('ndjson');
var env = process.env;

var listenBaseUrl = env.POSTABLE_LISTEN_BASE_URL;
var listenBucketsHttpUrl = env.POSTABLE_LISTEN_BUCKETS_HTTP_URL;
var listenBucketsRefreshRateSeconds = +(env.POSTABLE_LISTEN_BUCKETS_REFRESH_RATE || 60);
var listenBucketsRefreshRateMillis = listenBucketsRefreshRateSeconds * 1000;
var refreshBucketReconnectRateSeconds = +(env.POSTABLE_LISTEN_BUCKETS_RECONNECT_RATE || 5);
var refreshBucketReconnectRateMillis = refreshBucketReconnectRateSeconds * 1000;
var listenReconnectRateSeconds = +(env.POSTABLE_LISTEN_RECONNECT_RATE || 5);
var listenReconnectRateMillis = listenReconnectRateSeconds * 1000;
var listenListenerDataJson = env.POSTABLE_LISTEN_LISTENER_DATA;
var forwardHttpUrl = env.POSTABLE_LISTEN_FORWARD_HTTP_URL;
var forwardAttempts = env.POSTABLE_LISTEN_FORWARD_ATTEMPTS || 2;
var authUser = env.POSTABLE_AUTH_USER;
var authPass = env.POSTABLE_AUTH_PASS;
var listenData = {};
var auth;

if (authUser && authPass) {
	auth = { user: authUser, pass: authPass };
}
if (!listenBaseUrl) {
	throw new Error('POSTABLE_LISTEN_BASE_URL is required.');
}
listenBaseUrl = listenBaseUrl.replace(/[\/\\ ]+$/, '');
if (!listenBucketsHttpUrl) {
	throw new Error('POSTABLE_LISTEN_BUCKETS_HTTP_URL is required.');
}
if (listenListenerDataJson) {
	listenData = JSON.parse(listenListenerDataJson);
	if (typeof listenData !== 'object') {
		throw new Error('POSTABLE_LISTEN_LISTENER_DATA must be an object.');
	}
}
if (!forwardHttpUrl) {
	throw new Error('POSTABLE_LISTEN_FORWARD_HTTP_URL is required.');
}

var req;
var res;
var connectionNumber = 0;
var listenBucketsString = null;
var refreshBucketsInterval = null;
var readyCallback = null;
var connecting = false;
var refreshingBuckets = false;

module.exports = {
	start: function (ready) {
		readyCallback = ready;
		refreshBuckets();
		refreshBucketsInterval = setInterval(refreshBuckets, listenBucketsRefreshRateMillis);
	},
	stop: function() {
		clearInterval(refreshBucketsInterval);
		endConnection();
	}
};

function endConnection() {

	if (req) {
		try {
			log.debug('Ending previous request...');
			req.end();
		} catch (e) {
			/* istanbul ignore next */
			log.error('Error ending previous request: ' + e.message);
		}
	}

	if (res) {
		try {
			log.debug('Destroying previous response...');
			res.destroy();
		} catch (e) {
			/* istanbul ignore next */
			log.error('Error destroying previous response: ' + e.message);
		}
	}
}

function refreshBuckets() {
	if (!refreshingBuckets) {
		refreshBucketsForce();
	}
}

function refreshBucketsForce() {
	refreshingBuckets = true;
	request({
		method: 'GET',
		url: listenBucketsHttpUrl,
		json: true,
	}, function (e, res, body) {

		var goodResponse = false;
		refreshingBuckets = false;

		if (e) {
			log.error(
				'Error when getting buckets from endpoint (' + listenBucketsHttpUrl + ') ' + (e.message || '?'),
				{ postableBucketsError: e }
			);
		} else if (res.statusCode >= 300) {
			log.error(
				'Status ' + res.statusCode + ' when getting buckets from local endpoint (' + listenBucketsHttpUrl + ')',
				{ postableBucketsResponseBody: JSON.stringify(body) }
			);
		} else if (!Array.isArray(body)) {
			log.error(
				'Non-array returned returned from local buckets endpoint (' + listenBucketsHttpUrl + ')',
				{ postableBucketsResponseBody: JSON.stringify(body) }
			);
		} else if (!body.length) {
			log.info(
				'No buckets from local buckets endpoint (' + listenBucketsHttpUrl + ')',
				{ postableBucketsResponseBody: JSON.stringify(body) }
			);
		} else {
			goodResponse = true;
			body.forEach(function (bucket) {
				if (typeof bucket !== 'string') {
					log.error(
						'Bad bucket from local buckets endpoint (' + listenBucketsHttpUrl + ')',
						{ postableBucketsResponseBody: JSON.stringify(body) }
					);
					goodResponse = false;
				}
			});
		}

		if (goodResponse) {
			body.sort();
			listenData.buckets = body;
			var bucketsString = body.join(',');
			if (bucketsString !== listenBucketsString) {
				log.info('Got new buckets for postable (' + bucketsString + ') from (' + listenBucketsHttpUrl + ')', {
					postableBucketsUrl: listenBucketsHttpUrl,
					postableListenBuckets: listenBucketsString
				});
				listenBucketsString = bucketsString;
				connect();
			}
		} else {
			setTimeout(refreshBuckets, refreshBucketReconnectRateMillis)
		}
	});
}

function connect() {
	if (!connecting) {
		connectForce();
	}
}

function connectForce() {

	connecting = true;
	connectionNumber++;

	var message;
	if (connectionNumber > 1) {
		message = 'Restarting Postable listener (reconnection ' + (connectionNumber - 1) + ')';
	} else {
		message = 'Starting Postable listener';
	}
	message += '; listening to ' + listenData.buckets.length + ' buckets';
	message += ' on (' + listenBaseUrl + ')';
	if (auth) {
		message += ' using auth';
	}

	log.info(message, {
		postableListenBuckets: listenBucketsString,
		postableListenBaseUrl: listenBaseUrl,
		postableListenConnectionNumber: connectionNumber
	});

	var newReq = request({
		method: 'POST',
		url: listenBaseUrl + '/listeners/',
		json: true,
		body: listenData,
		auth: auth
	});

	endConnection();

	newReq.on('response', gotResponse);

	newReq.on('error', function (e) {
		log.error('Error with request: ' + e.message);
		connecting = false;
		setTimeout(connect, listenReconnectRateMillis);
	});

	newReq.on('end', function () {
		log.error('Postable connection closed, restarting...');
		connecting = false;
		setTimeout(connect, listenReconnectRateMillis);
	});

	var jsonStream = newReq.pipe(ndjson.parse({ strict: false }));
	jsonStream.on('data', forwardTask);

	req = newReq;
}

function gotResponse(response) {

	res = response;

	connecting = false;

	var callStatus = response.statusCode;
	var callClusterId = response.headers['x-postable-cluster-id'] || null;
	var badResponse = false;
	var reconnectMessage = 'reconnecting in ' + listenReconnectRateSeconds + ' seconds...';

	if (callStatus !== 200) {
		badResponse = true;
		log.info('Bad response from Postable (status = ' + callStatus + '); ' + reconnectMessage);
	}

	if (!callClusterId) {
		badResponse = true;
		log.info('Bad response from Postable (no cluster ID); ' + reconnectMessage);
	}

	if (badResponse) {
		setTimeout(connect, listenReconnectRateMillis);
		return;
	}

	log.info('Successfully connected to Postable (' + listenBaseUrl + ')', {
		postableListenBaseUrl: listenBaseUrl,
		postableListenConnectionNumber: connectionNumber
	});

	readyCallback && readyCallback();
}

function forwardTask(task) {
	if (task) {

		if (task.ignoreHeartbeat) {
			log.debug('Got heartbeat from Postable (' + listenBaseUrl + ')', {
				postableListenBaseUrl: listenBaseUrl
			});
		} else {
			tryForward(1);
		}

		function tryForward(attempt) {
			if (attempt <= forwardAttempts) {
				req = request({
					method: 'POST',
					url: forwardHttpUrl,
					json: true,
					body: { task: task, attempt: attempt },
					auth: auth
				}, function (e, res, body) {

					var forwarded = false;

					if (e) {
						/* istanbul ignore next */
						log.error(
							'Error when forwarding task to local endpoint (' + forwardHttpUrl + ') ' + (e.message || '?'),
							{ postableForwardError: e }
						);
					} else if (res && res.statusCode >= 300) {
						/* istanbul ignore next */
						log.error(
							'Status ' + res.statusCode + ' when forwarding task to local endpoint (' + forwardHttpUrl + ')',
							{
								postableForwardResponseStatus: res.statusCode,
								postableForwardResponseBody: JSON.stringify(typeof body === 'undefined' ? null : body),
								postableForwardTask: task
							}
						);
					} else {
						forwarded = true;
					}

					forwarded || tryForward(attempt++);
				});
			}
		}
	}
}
