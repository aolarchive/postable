var setup = require('../../setup');
var assert = require('assert');

describe('routes/clusterGetLastTask', function () {

	it('works', function (done) {

		this.slow(500);
		var instance = setup();
		instance.start();

		var task = { foo: 'bar' };
		var waiting = 2;

		instance.get('/buckets/ /tasks/last', {
			response: function (res) {
				assert(res.statusCode === 400);
				--waiting || done();
			}
		});

		instance.post('/buckets/foo/tasks/', task, {
			response: function () {
				instance.get('/buckets/foo/tasks/last', {
					listener: function (last) {
						if (last.ignoreHeartbeat) return;
						assert(last);
						assert(last.id);
						assert(last.started);
						assert(last.data);
						assert.deepEqual(task, last.data);
						instance.stop();
						--waiting || done();
					}
				});
			}
		});

	});

});