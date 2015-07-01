var setup = require('../../setup');
var assert = require('assert');

describe('endpoints/last', function () {

	it('works', function (done) {

		this.slow(500);
		var instance = setup();
		instance.start();

		var task = { foo: 'bar' };

		instance.post('/buckets/foo/tasks/', task, {
			response: function () {
				instance.get('/buckets/foo/tasks/last', {
					listener: function (last) {
						assert(last);
						assert(last.id);
						assert(last.started);
						assert(last.data);
						assert.deepEqual(task, last.data);
						instance.stop();
						done();
					}
				});
			}
		});

	});

});