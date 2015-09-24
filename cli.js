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
    set: 'apparelSetProp',
    del: 'apparelDelProp',
    snapshot: 'apparelSnapshot',
    open: 'apparelOpened'
  },
  maxEventsBetweenSnapshots: 10,
  snapshotSuffix: '__snapshot'
}
var eventStoreObjects = require('./index.js')(configs);
var util = require('util');

eventStoreObjects.onConnect = function(){

  // console.log('Connected!');

  switch (process.argv[2]) {
      case 'set':
          var deltas;
          deltas = JSON.parse(process.argv[4]);
          eventStoreObjects.append(process.argv[3], 'set', deltas, function() {
            console.log('ok');
            eventStoreObjects.disconnect();
          });
          break;
      case 'del':
        var deltas;
        try{
          deltas = JSON.parse(process.argv[4]);
        } catch(e){
          
          deltas = process.argv[4];
        }
        eventStoreObjects.append(process.argv[3], 'del', deltas, function() {
          console.log('ok');
          eventStoreObjects.disconnect();
        });
        break;
      case 'batchInsert':
          var tot = parseInt(process.argv[4]);
          var data = [];
          for (i = 0; i < tot; i++) {
              data.push({
                cmd: 'set',
                data: {
                  'counter': i
                }
              });
          }
          eventStoreObjects.appendMany(process.argv[3], data, function() {});
          break;
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
          eventStoreObjects.append(id, 'set', {a: n}, function() {});
        }, 10);
        setInterval(function(){
          eventStoreObjects.read(id, 'head', null, false, null, function(err, obj) {});
        }, 500);
  }

};

eventStoreObjects.connect();