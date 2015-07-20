var setup = require('../setup');
var redis = require('../../lib/redis')(require('../../lib/log'));
var clusterId = require('../../lib/clusterId');

describe('clusterId', function () {
	it('works', function () {
		clusterId(function (id1) {
			clusterId(function (id2) {
				assert(id1 === id2);
			});
		})
	});
});