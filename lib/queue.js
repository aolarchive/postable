/**
 * A simple concurrent work queue.
 *
 * @param {number} concurrency The amount of concurrency for the queue.
 *
 * @returns The work queue with a push function.
 */
module.exports = function queue(concurrency) {

	var count = 0;
	var queue = [];

	function drain() {
		if (queue.length && count < concurrency) {
			count++;
			var func = queue.shift();
			func(callback);
		}
	}

	function callback() {
		count--;
		drain();
	}

	function push(func) {
		queue.push(func);
		drain();
	}

	return { push: push };
};
