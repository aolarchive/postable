# Postable

A simple task distribution service.

Postable can receive tasks and distribute them to listeners.
Results from listeners are then forwarded back to the original caller as line-delimited JSON.

## Workflow

1. Listeners connect to Postable specifying the *buckets* to listen to.
2. Tasks are submitted to Postable under a specific bucket.
3. Listeners on that bucket receive the task as a line-delimited JSON entry.
4. Listeners respond to Postable with the result for that specific task.
5. Postable streams all results for the task back to the caller as line-delimited JSON.

## Installation

- Install Redis
- Install Postable `npm install postable`
- Set configuration as environment variables
- Run service `bin/postable`

## Configuration

|Environment Variable||
|:---|:---|
|`POSTABLE_REDIS_HOST`|Required. The redis host to use.|
|`POSTABLE_REDIS_PORT`|Required. The redis port to connect to.|
|`POSTABLE_REDIS_PASS`|Optional. The auth password for redis.|
|`POSTABLE_LISTENER_SET_TIMEOUT_SECONDS`|Optional (defaults to `30`). How long to keep listener data in redis.|