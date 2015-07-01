var setup = require('../../setup');
var assert = require('assert');

describe('endpoints/up', function () {

	it('works', function (done) {

		this.slow(500);
		var user = 'example';
		var pass = 'P@55w0Rd!';
		var instance = setup({ POSTABLE_AUTH_USER: user, POSTABLE_AUTH_PASS: pass });
		instance.start();

		var waiting = 2;

		function complete() {
			instance.stop();
			done();
		}

		instance.get('/', {
			options: { auth: { user: user, pass: pass } },
			response: function (res) {
				assert(res.statusCode);
				assert(res.statusCode === 200);
				--waiting || complete();
			}
		});

		instance.get('/', {
			response: function (res) {
				assert(res.statusCode);
				assert(res.statusCode === 401);
				--waiting || complete();
			}
		});

	});

});