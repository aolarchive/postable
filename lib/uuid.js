var uuid = require('node-uuid');

module.exports = function (prefix) {
	return (prefix ? (prefix + '-') : '') + uuid.v4();
};