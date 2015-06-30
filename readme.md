# Postable

A simple task distribution and result collection service.

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
|`POSTABLE_PORT`|Optional (defaults to `3000`). The port to listen on.|
|`POSTABLE_AUTH_USER`|Optional (defaults to none). A username for basic HTTP authentication to the service.|
|`POSTABLE_AUTH_PASS`|Optional (defaults to none). A password for basic HTTP authentication to the service.|
|`POSTABLE_REDIS_HOST`|Optional (defaults to `127.0.0.1`). The redis host to use.|
|`POSTABLE_REDIS_PORT`|Optional (defaults to `6379`). The redis port to connect to.|
|`POSTABLE_REDIS_PASS`|Optional (defaults to none). The auth password for redis.|
|`POSTABLE_REDIS_PREFIX`|Optional (defaults to `postable_`). The prefix for redis keys and channels.|
|`POSTABLE_LISTENER_TIMEOUT_SECONDS`|Optional (defaults to `1800`). How long to keep listener data in redis.|
|`POSTABLE_LISTENER_SET_TIMEOUT_SECONDS`|Optional (defaults to `1800`). How long to keep listener set data in redis.|

## Usage

### Listening for Tasks

```
POST /listeners/
{
  "buckets": [ "bucket-1", "bucket-2", ... ],
  
  ... additional listener data ...
}
=> 200
{ "id": <taskId>, "time": <unixTime>, "listenerId": <listenerId>, "data": <taskData> }
...
```

To listen for tasks on buckets, a client will `POST /listeners/` with a body containing the `buckets` to listen to (as an array of strings).

This will be a **long-poll** request and as tasks come in they will be *streamed* to the client as *line-delimited JSON*. 
The connection **is never closed** by the service.

Each task will contain an `id`, `time`, `listenerId`, and the `data` from the task.

### Sending a Task

```
POST /buckets/<bucket>/tasks/
{
  ... task data ...
}
=> 200
{ "meta": { "listenersPending": [ ... ] } }
{ "listener": { "buckets": [...], "id": <listenerId>, "started": <dateString>, ... }, "timeout": false, "data": <result> }
...
```

To send a task to a bucket, simply `POST /buckets/<bucket>/tasks/` with the task data as a JSON object.

The response will be a stream of *line-delimited JSON*. The first entry will be a meta entry containing `listenersPending` (an array of listener IDs).

This task will be given a unique task ID and sent to all listeners. As listeners respond to the task with results, those results
will be *streamed* back to this response. Each entry will contain the listener ID sending the result.
Once all results have been received, the connection will close. 

If the timeout is reached the connection will close with additional entries for each timed out listener with a property `timeout` set to `true`.
This timeout can be configured using `?timeout=<seconds>`.

### Responding to a Task

```
POST /tasks/<taskId>/results/<listenerId>
{
  ... task result ...
}
=> 200
```

To respond to a task from a listener, simply `POST /tasks/<taskId>/results/<listenerId>` with the task result as a JSON object.
 
The `<taskId>` and `<listenerId>` should come from the initial task sent (see **Listening for Tasks**).

### Getting the Last Task

```
GET /buckets/<bucket>/tasks/last
=> 200
{
  ... task data ...
}
```

Return the last task submitted to the given bucket as JSON, or `null` if there was none.

## Implementation

Postable works by using redis for pub/sub. See below for a high-level sequence diagram:

![Sequence Diagram](https://github.com/aol/postable/raw/master/docs/img/sequence.png =550px)