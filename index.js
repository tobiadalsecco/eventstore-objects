var EventStoreClient = require("event-store-client");
var http = require('http');


// ------------ CONFIGURATION
var config, options, connection, credentials, events, maxEventsBetweenSnapshots;

var snapshotSuffix = '__snapshot';

var maxEventsFetch = 4096; // the maximum number of events that EventStore db (or node module) seems to support

function connect(){
  var connectionOptions = {
    host:  config.host,
    port:  config.port,
    debug: config.debug,
    onConnect: function(){
      if(eventStoreObjects.onConnect){
        eventStoreObjects.onConnect();
      }
    }
  };
  connection = new EventStoreClient.Connection(connectionOptions);
};

function disconnect(){
  connection.close();
}

//---


function buildPreviousObjectState(id, eventNumber, done){
  console.log('Building previous object state');
  findEventsNearestSnapshot(id, eventNumber, function(err, snapshot){
    if(!snapshot){
      console.log('now building from ZERO + events');
      createObjectFromEvents(id, 0, eventNumber + 1, null, false, function(err, result){
        if(done) done(null, result);
      });
    } else {
      var eventNumberInSnapshot = parseInt(snapshot.events[0].data.__eventNumber);
      createObjectFromEvents(id, eventNumberInSnapshot, eventNumber - eventNumberInSnapshot + 1, snapshot.events[0].data, false, function(err, result){
        if(done) done(null, result);
      });
    }
  });
}

function findEventsNearestSnapshot(streamId, eventNumber, done){
  console.log('will find nearest snapshot:');
  var snapShotNumber = Math.floor(eventNumber / maxEventsBetweenSnapshots) - 1;
  tryFindSnapshot(streamId, snapShotNumber, eventNumber, function(err, snapshot){
    if(done) done(null, snapshot);
  });
}

function tryFindSnapshot(streamId, snapShotNumber, eventNumber, done){
  console.log('finding nearest snapshot try...' + snapShotNumber);
  readSnapshot(streamId, snapShotNumber, function(snapshot){
    if(snapshot.events.length == 0){
      console.log('no snapshot!');
      if(done) done(null, null);
    } else if(snapshot.events[0].data.__eventNumber > eventNumber){
      snapShotNumber--;
      tryFindSnapshot(streamId, snapShotNumber, eventNumber, done);
    } else {
      console.log('## snapshot found!');
      console.log(snapshot.events[0].data);
      if(done) done(null, snapshot);
    }
  });
}

function checkObjectStreamHead(snapshotId, done) {
  //console.log('check snapshot: ' + snapshotId + snapshotSuffix);
  doRequest('/streams/' + snapshotId + snapshotSuffix + '/head/backward/1?format=json', function(err, snapshot) {
    //console.log(err, snapshot);
    done(err, snapshot);
  });
}

//---

// ------------ OBJECT - RELATED FUNCTIONS

function buildObject(id, headType, headParam, addOpenEvent, openEventData, done) {
  headType = headType || 'head';
  if(headType == 'head'){
    if(addOpenEvent === true && openEventData){
      //console.log('add open event');
      appendEvent(id, 'open', openEventData, function(err){
        buildCurrentObject(id, done);
      });
    } else {
      buildCurrentObject(id, done);
    }
  } else if(headType == 'at') {
    buildPreviousObjectState(id, parseInt(headParam), function(err, result){
      if(done) done(null, result);
    });
  } else {
    done('wrong headType', null);
  }
}

function buildCurrentObject(id, done){
  //console.log('-- calling buildObject');
  checkObjectSnapshot(id, function(err, snapshot) {
    if (!snapshot) {
      //console.log('--------- no snapshots');
      createObjectFromEvents(id, 0, maxEventsFetch, null, true, function(err, object) {
        if (!object) {
          //console.log('-- no events');
          done(null, null);
        } else {
          done(err, object);
        }
      });
    } else {
      //console.log('-- we have snapshot!');
      var snap = JSON.parse(snapshot);
      //console.log(snap);
      var evtNum = parseInt(snap.entries[0].id.split('/').pop());
      //console.log('-- lets get snapshot number (evt):', evtNum);
      readSnapshot(id, evtNum, function(completed) {
        //console.log('-- This is the snapshot:');
        var lastSnapshot = completed.events[0].data;
        //console.log(lastSnapshot);
        var readFromEventNumber = lastSnapshot.__eventNumber;
        createObjectFromEvents(id, readFromEventNumber, maxEventsFetch, lastSnapshot, true, function(err, finalObject){
          done(err, finalObject);
        });
      });
    }
  });
}

function createObjectFromEvents(id, from, max, initialObject, checkSnapshot, done) {
  console.log('creating object from ', from, ' walking ', max, ' events');
  initialObject = initialObject || null;
  connection.readStreamEventsForward(
    id, // stream id 
    parseInt(from), // fromEventNumber
    parseInt(max), // maxCount
    false, // resolveLinks
    false, // requiremaster
    null,
    credentials,
    function(completed) {
      var resultsLength = completed.events.length;
      if (resultsLength == 0) {
        //console.log('-- no events');
        return done(null, null);
      }
      var result = addDeltas(completed.events, initialObject);

      if (checkSnapshot == true && resultsLength >= maxEventsBetweenSnapshots) {
        //console.log('-- we need to create a snapshot');
        writeSnapshot(id, result, result.__eventNumber, function(err, success) {
          if (success) {
            //console.log('-- snapshot successfully created');
            return done(null, result);
          } else {
            return done('Error creating snapshot', null);
          }
        });
      } else {
        return done(null, result);
      }
      
    }
  );
}



// ------------ SNAPSHOT - RELATED FUNCTIONS

function checkObjectSnapshot(snapshotId, done) {
  //console.log('check snapshot: ' + snapshotId + snapshotSuffix);
  doRequest('/streams/' + snapshotId + snapshotSuffix + '/head/backward/1?format=json', function(err, snapshot) {
    //console.log(err, snapshot);
    done(err, snapshot);
  });
}

function writeSnapshot(id, data, from, done) {
  //console.log('faço snapshot')
  appendEvent(id + snapshotSuffix, 'snapshot', data, function(err) {
    done(null, true);
  });
}

function readSnapshot(id, snapshotEventNumber, done){
  connection.readStreamEventsBackward(
    id + snapshotSuffix, // stream id 
    snapshotEventNumber, // fromEventNumber
    1, // maxCount
    false, // resolveLinks
    false, // requiremaster
    null,
    credentials,
    function(completed){ done(completed); }
  );
}



// ------------ EVENT/STREAM - RELATED FUNCTIONS

function appendEvent(id, eventType, data, done) {
  var newEvents = [{
    eventId: EventStoreClient.Connection.createGuid(),
    eventType: events[eventType],
    data: data
  }];
  connection.writeEvents(id, EventStoreClient.ExpectedVersion.Any, false, newEvents, credentials, function(completed) {
    done(null);
  });
}

function batchEvents(id, deltas, done) {
  if (deltas.length == 0) {
    //console.log('-- no deltas!');
    return;
  }
  var newEvents = [];
  for (i in deltas) {
    var newEvent = {
      eventId: EventStoreClient.Connection.createGuid(),
      eventType: events[deltas[i].cmd],
      data: deltas[i].data
    };
    newEvents.push(newEvent);
  }
  connection.writeEvents(id, EventStoreClient.ExpectedVersion.Any, false, newEvents, credentials, function(completed) {
    done();
  });
}



// ------------ DELTA - RELATED FUNCTIONS

function addDeltas(deltas, initialObject){
  var result = initialObject || {};
  for (var i in deltas) {
    var evt = deltas[i];
    var eventType = evt.eventType;
    var data = evt.data;
    if (eventType == events.set) {
      for (var prop in data) {
        setProperty(prop, data[prop], result);
      }
    } else if (eventType == events.del) {
      //console.log('==================> del', data);
      deleteProperty(data, result);
    } else if (eventType == events.open){
      setProperty('__lastOpened', data, result);
    }
  }
  result.__eventNumber = evt.eventNumber;
  return result;
}

function setProperty(prop, val, target) {
  //console.log('SET', prop, val, target);
  if (val instanceof Object) {
    setNestedProperty(prop, val, target);
    return;
  }
  target[prop] = val;
}

function setNestedProperty(prop, val, target) {
  //console.log('OBJ', prop, val, target);
  if (!target.hasOwnProperty(prop)) {
    target[prop] = {};
  } else if(!(target[prop] instanceof Object)){
    target[prop] = {};
  }
  for (var p in val) {
    setProperty(p, val[p], target[prop]);
  }
}

function deleteProperty(prop, target) {
  console.log('DEL', prop, target);
  if (prop instanceof Object) {
    //console.log('e um obj, target: ', target);
    deleteNestedProperty(prop, target);
    return;
  }
  if (!target.hasOwnProperty(prop)) {
    console.log('NO PROP');
    return;
  }
  delete target[prop];
}

function deleteNestedProperty(prop, target) {
  console.log('DEL OBJ');
  for (var p in prop) {
    //console.log('------> p:', p, ' | prop:', prop, ' | prop[p]:', prop[p], ' | target: ', target);
    deleteProperty(prop[p], target[p]);
  }
}


// ------------ OTHER FUNCTIONS

/**
 * A simple request, to use when methods are not avaliable in TCP (for instance, stream head)
 */
function doRequest(path, done) {
  var reqOptions = {
    hostname: config.host,
    port: 2113,
    path: path
  }
  http.get(reqOptions, function(response) {
    var finalData = "";
    response.on("data", function(data) {
      finalData += data.toString();
    });
    response.on("end", function() {
      done(null, finalData.toString());
    });
  }).on('error', function(e) {
    done("Got error: " + e.message);
  });
}

var eventStoreObjects = {
  read: buildObject,
  append: appendEvent,
  appendMany: batchEvents,
  connection: connection,
  connect: connect,
  disconnect: disconnect
}

module.exports = function(configs){
  config = {
    'host': configs.host,
    'port': configs.port,
    'credentials': configs.credentials,
    'debug': false
  };
  events = configs.events;
  maxEventsBetweenSnapshots = configs.maxEventsBetweenSnapshots;
  snapshotSuffix = configs.snapshotSuffix || snapshotSuffix;
  return eventStoreObjects;
}