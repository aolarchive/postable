module.exports = function (app, config) {

	return function broadcastListen(req, res) {

		res.status(200).end();
	};
};