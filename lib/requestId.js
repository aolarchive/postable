var os = require('os');
var crypto = require('crypto');
var hashPrefix = '' + os.hostname() + '' + process.pid;

module.exports = {
	middleware: function (req, res, next) {
		var requestId = req.get('request-id');
		if (!requestId) {
			var time = Math.floor(Date.now() / 1000);
			time < 0 && (time = 0xFFFFFFFF + time + 1);
			var timePrefix = parseInt(time, 10).toString(16);
			var random = Math.floor(Math.random() * 1000001);
			var hash = crypto.createHash('sha1').update(hashPrefix + random).digest('hex');
			requestId = (timePrefix + '_' + hash).substr(0, 40);
		}
		req.requestId = requestId;
		res.set('request-id', requestId);
		next();
	}
};