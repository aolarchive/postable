var winston = require('winston');
var env = process.env;
var logFile = env.POSTABLE_LOG_FILE || null;
var logLevel = env.POSTABLE_LOG_LEVEL || 'info';

var transports = logFile ? [
	new (winston.transports.File)({
		filename: logFile,
		level: logLevel
	})
] : [
	new (winston.transports.Console)({
		level: logLevel
	})
];

var log = new (winston.Logger)({ level: logLevel, transports: transports });
module.exports = log;