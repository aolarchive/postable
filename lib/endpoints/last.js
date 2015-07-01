var log = require('../log');

module.exports = function (app, config) {

	return function getLastTask(req, res) {

		// Validate arguments.

		var bucket = (req.params.bucket || '').trim();

		if (!bucket) {
			return res.status(400).end();
		}

		// Return the last task sent to that bucket.

		var redisKeyLastTask = app.redis.key('last', bucket);
		app.redis.get(redisKeyLastTask, function (e, taskJson) {
			var task = null;
			try {
				task = JSON.parse(taskJson);
			} catch (error) {
				log.error('Error parsing JSON when getting last task.', { error: error });
			}
			res.status(200).json(task);
		});
	};
};