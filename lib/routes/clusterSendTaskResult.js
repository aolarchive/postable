module.exports = function (app, config) {

	return function clusterSendTaskResult(req, res) {

		// Validate arguments.

		var taskId = (req.params.taskId || '').trim();
		var listenerId = (req.params.listenerId || '').trim();

		if (!req.body || !taskId || !listenerId) {
			return res.status(400).end();
		}

		// Send this result back to the task initiator by
		// publishing the result onto the task's channel.

		var response = { listenerId: listenerId, data: req.body };
		var redisKeyRespondChannel = app.redis.key('respond', taskId);
		app.redis.pub(redisKeyRespondChannel, response, function () {
			res.status(200).end();
		});
	};
};