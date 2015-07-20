var uuid = require('./uuid');

module.exports = function initClusterIdGenerator(redis) {

	var cachedClusterId = null;
	var cachedClusterIdExpires = 0;
	var cachedClusterIdTimeout = 1000 * 60; // 1 minute

	function clusterId(callback) {

		if (cachedClusterId && cachedClusterIdExpires > Date.now()) {
			return callback(cachedClusterId);
		}

		function gotClusterId(clusterId) {
			cachedClusterId = clusterId;
			cachedClusterIdExpires = Date.now() + cachedClusterIdTimeout;
			callback(clusterId);
		}

		var redisKeyClusterId = redis.key('cluster_id');
		redis.get(redisKeyClusterId, function (e, clusterId) {
			if (clusterId) {
				return gotClusterId(clusterId);
			}
			redis.set(redisKeyClusterId, uuid('pc'), 'nx', function (e) {
				redis.get(redisKeyClusterId, function (e, clusterId) {
					clusterId || log.error('Could not get cluster ID after set.');
					gotClusterId(clusterId);
				});
			});
		});
	}

	clusterId.refresh = function () {
		cachedClusterId = null;
		cachedClusterIdExpires = 0;
	};

	return clusterId;
};