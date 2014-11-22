var cookieParser = require('cookie-parser');
var express = require('express');
var expressSession = require('express-session');
var racerBundle = require('racer-bundle');

module.exports = function (lib, derby, store, opts) {
  derby.use(racerBundle);
  session = expressSession({
    resave: false,
    saveUninitialized: true,
    secret: 'secret',
    store: new expressSession.MemoryStore()
  });

  var routes1 = express();
  var routes2 = express();

  routes1.get('/', function (req, res) {
    var model = req.getModel();
    res.json(model.get());
  });

  routes2.get('/signout', function (req, res) {
    res.redirect('/');
  });

  var app = express()
    .use(store.modelMiddleware())
    .use(cookieParser())
    .use(session)
    .use(lib.server.init(opts))
    .use(routes1)
    .use('/user', lib.server.routes(opts))
    .use(routes2);

  return app;
};
