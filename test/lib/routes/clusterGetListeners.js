var setup = require('../../setup');
var assert = require('assert');

describe('routes/clusterGetListeners', function () {

	it('works', function (done) {

		this.slow(500);
		var instance = setup();
		instance.start();

		var waiting = 4;

		instance.get('/buckets/ /listeners/', {
			response: function (res) {
				assert(res.statusCode === 400);
				--waiting || done();
			}
		});


		var listenersAttaching = 2;
		function listenerReturned() {
			if (--listenersAttaching === 0) {

				instance.get('/buckets/foo/listeners/', {
					listener: function (item) {
						assert(item);
						assert(Array.isArray(item));
						assert(item.length === 2);
						--waiting || done();
					}
				});

				instance.get('/buckets/bar/listeners/', {
					listener: function (item) {
						assert(item);
						assert(Array.isArray(item));
						assert(item.length === 1);
						--waiting || done();
					}
				});

				instance.get('/buckets/baz/listeners/', {
					listener: function (item) {
						assert(item);
						assert(Array.isArray(item));
						assert(item.length === 0);
						--waiting || done();
					}
				});
			}
		}

		instance.post('/listeners/', { buckets: ['foo'], info: 'listener-foo' }, { response: listenerReturned });
		instance.post('/listeners/', { buckets: ['foo', 'bar'], info: 'listener-foo-bar' }, { response: listenerReturned });
	});

});