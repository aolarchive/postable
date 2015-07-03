var uuidPackage = require('node-uuid');

module.exports = function uuid(prefix) {
	return (prefix ? (prefix + '-') : '') + uuidPackage.v4();
};