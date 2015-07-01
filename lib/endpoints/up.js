module.exports = function (app, config) {
	return function serviceUp(req, res) {
		res.status(200).end();
	};
};