var cookieParser = require('cookie-parser');
var express = require('express');
var expressSession = require('express-session');
var racerBundle = require('racer-bundle');

exports.app = function (lib, derby, store, opts) {
  derby.use(racerBundle);
  session = expressSession({
    resave: false,
    saveUninitialized: true,
    secret: 'secret',
    store: new expressSession.MemoryStore()
  });

  var routes = express();
  var routes2 = express();

  routes.get('/', function (req, res) {
    var model = req.getModel();
    res.json(model.get());
  });

  routes.get('/user/confirmedEmail/:id/:token', function (req, res) {
    var state = req.query.state || {};
    var error = req.query.error || {};
    if (state.code) return res.status(state.code).json(state);
    if (error.code) return res.status(error.code).json(error);
    res.json(null);
  });

  var app = express()
    .use(store.modelMiddleware())
    .use(cookieParser())
    .use(session)
    .use(lib.server.init(opts))
    .use(routes)
    .use('/user', lib.server.routes(opts));

  return app;
};
