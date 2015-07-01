var log = require('./log');

module.exports = {
	tryParse: function () {
		try {
			return JSON.parse.apply(null, arguments);
		} catch (error) {
			log.error('Could not parse JSON: ' + error, { error: error });
			return null;
		}
	}
};