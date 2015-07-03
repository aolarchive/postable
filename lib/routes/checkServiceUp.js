module.exports = function (app, config) {
	return function checkServiceUp(req, res) {
		res.status(200).end();
	};
};