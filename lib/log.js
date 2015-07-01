var winston = require('winston');
var env = process.env;
var logFile = env.POSTABLE_LOG_FILE || null;
var logLevel = env.POSTABLE_LOG_LEVEL || 'info';

if (logFile) {
	module.exports = new (winston.Logger)({
		transports: [
			new (winston.transports.File)({
				filename: logFile,
				level: logLevel
			})
		]
	});
} else {
	module.exports = new (winston.Logger)({
		transports: [
			new (winston.transports.Console)({
				level: logLevel
			})
		]
	});
}