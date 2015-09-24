// ------- COMMAND LINE UTILITY
var configs = {
  host: "icloth",
  port: 1113,
  credentials: {
      username: "admin",
      password: "changeit"
  },
  debug: false,
  events: {
    set: ['itemSetName', 'itemSetProp', 'itemOpened'],
    del: ['itemDelProp'],
    snapshot: 'apparelSnapshot'
  },
  maxEventsBetweenSnapshots: 10,
  snapshotSuffix: '__snapshot'
}
var eventStoreObjects = require('./index.js')(configs);
var util = require('util');

var events = configs.events;

eventStoreObjects.onConnect = function(){

  // console.log('Connected!');

  switch (process.argv[2]) {
      
      case 'fetch':
        var headType = process.argv[4];
        var headParam = process.argv[5] || null;
        eventStoreObjects.read(process.argv[3], headType, headParam, false, null, function(err, obj) { // true, {'user':'some'}
          if (!obj) {
            console.error('Object not found!');
          } else {
            console.info('------ RESULT -----');
            console.log(util.inspect(obj, false, null, true));
          }
          eventStoreObjects.disconnect();
        });
        break;
      case 'runTest':
        var n = 0, id = process.argv[3];
        setInterval(function(){
          n++;
          eventStoreObjects.append(id, 'apparelSetName', {a: n}, function() {});
        }, 10);
        setInterval(function(){
          eventStoreObjects.read(id, 'head', null, false, null, function(err, obj) {});
        }, 500);
      default:
        if(events.set.indexOf(process.argv[2]) > -1){
          console.log('é um evento SET');
          var deltas;
          deltas = JSON.parse(process.argv[4]);
          eventStoreObjects.append(process.argv[3], process.argv[2], deltas, function() {
            console.log('ok');
            eventStoreObjects.disconnect();
          });
        } else if(events.del.indexOf(process.argv[2]) > -1){
          console.log('é um evento DEL');
          var deltas;
          try{
            deltas = JSON.parse(process.argv[4]);
          } catch(e){
            deltas = process.argv[4];
          }
          eventStoreObjects.append(process.argv[3], process.argv[2], deltas, function() {
            console.log('ok');
            eventStoreObjects.disconnect();
          });
        } else {
          console.log('NA-DA');
          eventStoreObjects.disconnect();
        }
  }

};

eventStoreObjects.connect();