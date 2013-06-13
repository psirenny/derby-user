var _ = require('lodash')
  , _s = require('underscore.string')
  , async = require('async')
  , dotty = require('dotty')
  , passport = require('passport')
  , passwordHash = require('password-hash')
  , tok = require('tok');

module.exports = function (app, options) {
  var util = require('./util')(options);

  var findUserId = function (req, user, callback) {
    var model = req.getModel()
      , found = null;

    async.some(options.keys, function (key, callback) {
      var path = key.split('.')
        , val = dotty.get(user, path)
        , verify = dotty.get(options.schema, key + '.verify')
        , coll = util.getUserCollection(path.shift())
        , doc = path.join('.')
        , target = {$query: {}};

      target.$query[doc] = val;
      if (verify) target.$query[verify] = true;
      var query = model.query(coll, target);

      model.fetch(query, function (err) {
        if (err) return callback(err);
        var userId = dotty.get(query.get(), '0.id');
        if (userId) found = userId;
        callback(userId);
      });
    }, function (userId) {
      callback(null, found);
    });
  };

  _.each(options.providers.strategies, function (strategy, name) {
    app.get(strategy.options.url, passport.authenticate(name, strategy.options));

    app.get(strategy.callback.url, passport.authenticate(name, strategy.callback), function (req, res) {
      if (!strategy.callback.popup) return res.redirect('/');

      var model = req.getModel()
        , userId = model.get('_session.' + options.session.idPath);

      // blank page with a script that immediately closes the window
      var script = _s.sprintf("<script>"
        + "if (opener && opener.location) {"
        + "opener.DERBY.app.model.set('_session.%s', '%s');"
        + "opener.DERBY.app.model.set('_session.%s', true);"
        + "}"
        + "window.close();"
        + "</script>",
        options.session.idPath,
        userId,
        options.session.isRegisteredPath
      );

      res.send(script);
    });
  });

  app.post(options.routes.forgot.url, function (req, res) {
    var model = req.getModel()
      , body = util.parseBody(req.body);

    findUserId(req, body.user, function (err, userId) {
      if (err) return res.send(500, {error: err});
      if (!userId) return res.send(404, {error: 'user not found'});
      if (!options.routes.forgot.handler) return res.send(500, {error: 'no reset handler'});

      var Tok = tok({secretKey: options.secretKey});
      Tok.create(userId, null, function (err, token) {
        if (err) return res.send(500, {error: err});
        options.routes.forgot.handler(req, body, userId, token);
        return res.send();
      });
    });
  });

  app.post(options.routes.change.url, function (req, res) {
    var model = req.getModel()
      , body = util.parseBody(req.body)
      , user = util.schemify(body.user);

    user.id = dotty.get(req.session, options.session.idPath);

    updateUser(req, user, function (err) {
      if (err) return res.send(400, {error: err});
      res.send({id: user.id, registered: user.registered});
    });
  });

  var saveUserSession = function (req, user, callback) {
    var model = req.getModel();
    dotty.put(req.session, options.session.idPath, user.id);
    model.set('_session.' + options.session.idPath, user.id);
    model.set('_session.' + options.session.isRegisteredPath, user.registered);
  };

  var updateUser = function (req, user, callback) {
    var model = req.getModel();

    async.each(options.accessLevels, function (lvl, callback) {
      var $user = model.at(util.getUserCollection(lvl) + '.' + user.id);

      $user.fetch(function (err) {
        if (err) return callback(err);
        var obj = _.merge($user.get(), user[lvl]);
        $user.set(obj);
        user.registered = obj.registered
        callback();
      });
    }, callback);
  };

  app.post(options.routes.reset.url, function (req, res) {
    var model = req.getModel()
      , body = util.parseBody(req.body)
      , user = util.schemify(body.user)
      , token = body.token
      , Tok = tok({secretKey: options.secretKey});

    if (!token) return res.send(400, {error: 'token missing'});
    if (!user.id) return res.send(400, {error: 'user id missing'});

    try {
      token = JSON.parse(token);
    } catch (e) {
      return res.send(400, {error: 'token must be valid json'});
    }

    Tok.check(user.id, token, function (err) {
      if (err) return res.send(400, {error: err});

      updateUser(req, user, function (err) {
        if (err) return res.send(400, {error: err});
        saveUserSession(req, user);
        res.send({id: user.id, registered: user.registered});
      });
    });
  });

  app.post(options.routes.signIn.url, function (req, res) {
    var model = req.getModel()
      , body = util.parseBody(req.body)
      , keys = util.parseBodyKeys(req.body)
      , user = _.merge(options.skeleton, body.user)
      , containsPassword = false;

    findUserId(req, user, function (err, userId) {
      var failure = function (err) {
        return res.send(400, {error: err});
      }

      var success = function () {
        dotty.put(req.session, options.session.idPath, userId);
        model.set('_session.' + options.session.idPath, userId);
        model.set('_session.' + options.session.isRegisteredPath, true);
        return res.send({id: userId, isRegistered: true});
      }

      if (err) return failure(err);
      if (!userId) return res.send(400, {error: 'user not found'});

      async.all(keys, function (key, callback) {
        // "user.private.local.password" -> "private.local.password"
        key = key.split('.').slice(1).join('.');

        var path = key.split('.')
          , coll = util.getUserCollection(path.shift()) // "usersPrivate"
          , type = dotty.get(options.schema, key + '.type');

        if (type && type === 'password') {
          containsPassword = true;
        } else {
          return callback(true);
        }

        // "usersPrivate.<userId>"
        var $user = model.at(coll + '.' + userId);

        $user.fetch(function (err) {
          if (err) return error = err;

          var hash = dotty.get(options.schema, key + '.hash') // options.schema.private.local.password.hash
            , dbPass = $user.get(path.join('.')) // model.get('usersPrivate.<userId>.private.local.password')
            , pass = dotty.get(user, key); // request.body.user.private.local.password

          callback(hash ? passwordHash.verify(pass, dbPass) : pass === dbPass);
        });
      }, function (result) {
        if (!containsPassword) return failure();
        return result ? success() : failure();
      });
    });
  });

  app.post(options.routes.signOut.url, function (req, res) {
    var model = req.getModel()
      , userId = dotty.get(req.session, options.session.idPath)
      , user = model.at(util.getUserCollection() + '.' + userId);

    user.fetch(function (err) {
      if (err) return res.send(500, {err: err});
      if (!user.get('registered')) return res.send(400, {error: 'already signed out'});
      var userId = model.id();
      dotty.put(req.session, options.session.idPath, userId);

      _.each(options.accessLevels, function (lvl) {
        model.add(util.getUserCollection(lvl), {id: userId, registered: false});
      });

      model.set('_session.' + options.session.isRegisteredPath, false);
      return res.send({id: userId});
    });
  });

  app.post(options.routes.signUp.url, function (req, res) {
    var model = req.getModel()
      , body = util.parseBody(req.body)
      , user = util.schemify(_.merge(options.skeleton, body.user));

    user.id = dotty.get(req.session, options.session.idPath);

    findUserId(req, user, function (err, foundUserId) {
      if (foundUserId) {
        return res.send(400, {error: 'user already exists'});
      }

      if (!util.userContainsType(user, 'password')) {
        return res.send(400, {error: 'password required'});
      }

      _.each(options.accessLevels, function (lvl) {
        user[lvl].registered = true;
      });

      updateUser(req, user, function (err) {
        if (err) return res.send(500, {error: err});
        return res.send({id: user.id});
      });
    });
  });

  return function (req, res, next) {
    next();
  };
};