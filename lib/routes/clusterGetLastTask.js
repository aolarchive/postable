var json = require('../json');

module.exports = function (app, config) {

	return function clusterGetLastTask(req, res) {

		// Validate arguments.

		var bucket = (req.params.bucket || '').trim();

		if (!bucket) {
			return res.status(400).end();
		}

		// Return the last task sent to that bucket.

		var redisKeyLastTask = app.redis.key('last', bucket);
		app.redis.get(redisKeyLastTask, function (e, taskJson) {
			var task = json.tryParse(taskJson);
			res.status(200).json(task);
		});
	};
};