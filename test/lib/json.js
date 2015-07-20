var setup = require('../setup');
var json = require('../../lib/json');
var assert = require('assert');

describe('json', function () {

	describe('tryParse', function () {

		it('returns null for invalid JSON ', function () {
			assert(null === json.tryParse('INVALID JSON'));
		});

	});
});