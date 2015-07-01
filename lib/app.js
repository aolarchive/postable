require('es6-collections');
var express = require('express');
var bodyParser = require('body-parser');
var basicAuth = require('basic-auth');
var uuid = require('node-uuid');
var log = require('./log');
var redis = require('./redis');
var env = process.env;

var app = express();
app.redis = redis;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.uuid = function (prefix) {
	return (prefix ? (prefix + '-') : '') + uuid.v4();
};

var port = env.POSTABLE_PORT || 3000;
var config = {
	listenerSetTimeoutSeconds: +(env.POSTABLE_LISTENER_SET_TIMEOUT_SECONDS) || 1800, // 30 minutes
	listenerTimeoutSeconds: +(env.POSTABLE_LISTENER_TIMEOUT_SECONDS) || 1800, // 30 minutes
	lastTaskTimeoutSeconds: +(env.POSTABLE_LAST_TASK_TIMEOUT_SECONDS) || 604800 // 7 days
};

// Basic auth.

if (env.POSTABLE_AUTH_USER && env.POSTABLE_AUTH_PASS) {
	app.use(function (req, res, next) {
		var user = basicAuth(req);
		if (!user || user.name !== env.POSTABLE_AUTH_USER || user.pass !== env.POSTABLE_AUTH_PASS) {
			res.statusCode = 401;
			res.setHeader('WWW-Authenticate', 'Basic realm="all"');
			res.end('Unauthorized');
		} else {
			req.user = user;
			next();
		}
	});
}

function endpoint(name) {
	return require('./endpoints/' + name)(app, config);
}

app.get('/', endpoint('up'));
app.get('/buckets/:bucket/tasks/last', endpoint('last'));
app.post('/buckets/:bucket/tasks/', endpoint('start'));
app.post('/tasks/:taskId/results/:listenerId', endpoint('result'));
app.post('/listeners/', endpoint('listen'));

var server = app.listen(port, function () {
	var host = server.address().address;
	var port = server.address().port;
	log.info('Postable listening at http://' + host + ':' + port);
});

server.app = app;
module.exports = server;