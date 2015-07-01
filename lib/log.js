var winston = require('winston');
var env = process.env;
var logFile = env.POSTABLE_LOG_FILE || null;
var logLevel = env.POSTABLE_LOG_LEVEL || 'info';

module.exports = new (winston.Logger)({
	transports: logFile ? [
		new (winston.transports.File)({
			filename: logFile,
			level: logLevel
		})
	] : [
		new (winston.transports.Console)({
			level: logLevel
		})
	]
});