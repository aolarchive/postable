var assert = require('assert');
var setup = require('../setup');
var redis = require('../../lib/redis')(require('../../lib/log'));
var clusterId = require('../../lib/clusterId')(redis);

console.log(setup);

describe('clusterId', function () {

	it('works', function (done) {
		clusterId(function (id1) {
			clusterId(function (id2) {
				assert(id1 === id2);
				clusterId.refresh();
				clusterId(function (id3) {
					assert(id2 === id3);
					done();
				});
			});
		});
	});

});