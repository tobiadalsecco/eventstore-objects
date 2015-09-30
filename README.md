#EventStore objects

EARLY ALPHA STAGE, DON'T USE IT IN PRODUCTION!

A convenient way to handle events sourcing with EventStore DB.

Store your aggregate events and load the aggregate as a complete object. 

Snapshot function included.

## Install

npm install --save eventstore-objects

## How it works

This modules saves events to a EventStore stream with a given id (string). 
If the stream doesn't exist, it is automatically created.
It also creates snapshots automatically (lazily, on aggregate read) at a given and configurable interval of events.
The snapshots are stored as a stream with the main events id plus a configurable suffix (default is '__snapshot').

Aggregates can be retrieved at any point of their history with no effort.



It is important to note that eventstore-objects doesn't use any specific eventType or information overhead when writing to EventStore, so you will be able to use other tools and to read, 'projecting' and understand your streams in many ways without be locked-in.

Eventstore-objects can achieve this by separating (in your configs) the available events into 2 groups: 'set' and 'del'. 
The 'set' type adds the properties to the aggregate when it is loaded from the events stream, while the 'del' type removes the properties from it.
This configuration will only be used on read, without affecting you data or your domain. 

Additionally, you can customize the snapshot event, which is the eventType of every snapshot creation, in its separate stream.

## How to use

### Configuration

```javascript

var configs = {
  host: "localhost",
  port: 1113,
  credentials: {
      username: "admin",
      password: "changeit"
  },
  debug: false,
  events: {
    // events group: set
    set: ['userCreate', 'userSetName', 'userSetProp'], // as many as you wish
    // events group: del (delete)
    del: ['userDelProp'], // as many as you wish
    snapshot: 'userSnapshot'
  },
  maxEventsBetweenSnapshots: 500,
  snapshotSuffix: '__snapshot'
}
var eventStoreObjects = require('eventstore-objects')(configs);

```

### Write

```javascript

eventStoreObjects.append('myStreamId', 'myEvent', { my:'data' }, function(error) {
  // do some callback actions
});

```

### Read

### Track reads

When a stream is read, you can record it as an event, if you wish to track it.

```javascript

var readEventName = 'myReadEvent'; // optionally add an event to track reads. Set as null to ignore.
var readEventData = {user_id: 123}; // the data for the read event. Set as null to ignore

```

### Get latest version of the aggregate (head)

By default, the stream is always returned in its latest version. 

```javascript

eventStoreObjects.read('myStreamId', null, null, readEventName, readEventData, function(err, result) {
  if(err){
    console.log(err);
  }
  if (!result) {
    console.log('Object not found!');
  } else {
    console.log(result);
  }
});

```

The second argument can be set as 'head' too, if you want to be more explicit in your intent:

```javascript

eventStoreObjects.read('myStreamId', 'head', null, readEventName, readEventData, function(err, result) {
  if(err){
    console.log(err);
  }
  if (!result) {
    console.log('Object not found!');
  } else {
    console.log(result);
  }
});

```

### Get a specific version of the aggregate (by event number)

If you want to read the aggregate as it was at the event 42, just do:

```javascript

eventStoreObjects.read('myStreamId', 'at', 42, readEventName, readEventData, function(err, result) {
  if(err){
    console.log(err);
  }
  if (!result) {
    console.log('Object not found!');
  } else {
    console.log(result);
  }
});

```

### Disconnect

```javascript

eventStoreObjects.disconnect();

```

### Connect

```javascript

eventStoreObjects.connect();

```