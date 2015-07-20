var request = require('request');
var ndjson = require('ndjson');
var log = require('../log');

module.exports = function (app, config) {

	return function broadcastStartTask(req, res) {

		// Start broadcasting to all the hosts.

		var pending = config.broadcastUris.length;

		res.write(JSON.stringify({ meta: { broadcastClusters: pending } }) + "\n");

		config.broadcastUris.forEach(function (uri) {

			var options = {
				method: 'POST',
				url: uri + '/buckets/' + encodeURIComponent(req.params.bucket) + '/tasks/',
				body: req.body,
				json: true,
				qs: req.query,
				auth: req.user ? { username: req.user.name, password: req.user.pass } : null
			};

			var call = request(options);
			var callStatus = 0;
			var callClusterId = null;

			function sendError(statusCode) {
				res.write(JSON.stringify({ clusterId: callClusterId, meta: { error: { status: statusCode } } }) + "\n");
			}

			function sendLine(object) {
				object.clusterId = callClusterId;
				res.write(JSON.stringify(object) + "\n");
			}

			function broadcastErrorHandler(message, end) {
				return function (e) {
					var context = { status: callStatus, error: e || null };
					log.error(message, context);
					sendError(callStatus);
					end && broadcastStep();
				};
			}

			function broadcastStep() {
				--pending || complete();
			}

			call.on('response', function (broadcastResponse) {
				callStatus = broadcastResponse.statusCode;
				callClusterId = broadcastResponse.headers['x-postable-cluster-id'] || null;
				if (callStatus !== 200) {
					broadcastErrorHandler('Unsuccessful broadcast (HTTP ' + (callStatus || '?') + ') to ' + uri)();
				} else if (!callClusterId) {
					callStatus = 0;
					broadcastErrorHandler('Unsuccessful broadcast (no X-Postable-Cluster-Id header) to ' + uri)();
				}
			});

			call.on('error', broadcastErrorHandler('Could not broadcast to ' + uri, true));
			call.on('end', broadcastStep);

			var jsonStream = call.pipe(ndjson.parse({ strict: false }));

			jsonStream.on('data', function (object) {
				sendLine(object);
			});
		});

		function complete() {
			res.end();
		}
	};
};