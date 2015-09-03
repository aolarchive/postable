var winston = require('winston');
var WinstonContext = require('winston-context');
var extend = require('extend');
var env = process.env;
var logFile = env.POSTABLE_LOG_FILE || null;
var logLevel = env.POSTABLE_LOG_LEVEL || 'info';
var logOptions = {
	level: logLevel,
	colorize: false,
	handleExceptions: true,
	json: true,
	timestamp: true,
	stringify: true,
	prettyPrint: false
};

var transports = logFile ? [
	new (winston.transports.File)(extend({ filename:logFile }, logOptions))
] : [
	new (winston.transports.Console)(logOptions)
];

var log = new (winston.Logger)({ level: logLevel, transports: transports });

log.createContext = function (context) {
	return new WinstonContext(log, '', context || { });
};

module.exports = log;