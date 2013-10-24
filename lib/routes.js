var _ = require('lodash')
  , _s = require('underscore.string')
  , async = require('async')
  , dotty = require('dotty')
  , passwordHash = require('password-hash')
  , tok = require('tok')
  , traverse = require('traverse');

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
      if (verify) target.$query[util.getUserPath(verify)] = true;
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

  var updateUser = function (req, user, callback) {
    var model = req.getModel();

    async.each(options.accessLevels, function (lvl, callback) {
      var $user = model.at(util.getUserCollection(lvl) + '.' + user.id);
      if (!user.updateDate) user.updateDate = new Date();

      $user.fetch(function (err) {
        if (err) return callback(err);
        _.each(user[lvl], function (val, key) {
          $user.set(key, val);
        });
        user.registered = $user.get('registered');
        callback();
      });
    }, callback);
  };

  app.post(options.routes.change.url, function (req, res) {
    var model = req.getModel()
      , body = util.parseBody(req.body)
      , user = util.schemify(body.user);

    user.id = dotty.get(req.session, options.session.path + '.id');

    updateUser(req, user, function (err) {
      if (err) return util.sendError(res, 500, err);
      res.send(_.pick(user, 'id', 'registered'));
    });
  });

  app.post(options.routes.ajax.createUser.url, function (req, res) {
    var model = req.getModel()
      , user = {id: model.id(), registered: false};

    util.createUser(req, user);
    util.saveUserSession(req, user);
    res.send({user: user});
  });

  app.post(options.routes.ajax.passwordMatches.url, function (req, res) {
    var model = req.getModel()
      , body = util.parseBody(req.body)
      , user = body.user;

    findUserId(req, body.user, function (err, userId) {
      if (!userId) return res.send({matches: false});

      traverse(user).forEach(function (x) {
        if (!this.isLeaf) return;

        var path = this.path.join('.')
          , opts = dotty.get(options.schema, path)
          , hash = opts.hash
          , $user = model.at(util.getUserCollection(path) + '.' + userId);

        if (!opts.type || opts.type !== 'password') return;

        $user.fetch(function (err) {
          if (err) return util.sendError(res, 500, err);

          var dbPass = $user.get(util.getUserPath(path))
            , matches = hash ? passwordHash.verify(x, dbPass) : x === dbPass;

          res.send({matches: matches});
        });
      });
    });
  });

  app.post(options.routes.ajax.userExists.url, function (req, res) {
    var model = req.getModel()
      , body = util.parseBody(req.body)
      , user = body.user;

    findUserId(req, body.user, function (err, userId) {
      return res.send({exists: !!userId})
    });
  });

  app.post(options.routes.forgot.url, function (req, res) {
    var model = req.getModel()
      , body = util.parseBody(req.body)
      , user = body.user
      , method = dotty.get(body, 'options.method') || ''
      , verify = dotty.get(options.schema, method + '.verify');

    if (!method) return util.sendError(400, 'method missing');

    findUserId(req, body.user, function (err, userId) {
      if (err) return util.sendError(res, 500, err);
      if (!userId) return util.sendError(res, 404, 'user not found');
      if (!options.routes.forgot.handler) return res.send(res, 500, 'no forgot handler');

      var $user = model.at(util.getUserCollection(verify) + '.' + userId)
        , Tok = tok({secretKey: options.secretKey});

      $user.fetch(function (err) {
        if (err) return util.sendError(res, 500, err);
        if (verify && !$user.get(util.getUserPath(verify))) return util.sendError(res, 400, 'method unverified');

        Tok.create(userId, null, function (err, token) {
          if (err) return util.sendError(res, 500, err);
          options.routes.forgot.handler(req, method, userId, token, function (code, err) {
            if (!code) return res.send();
            util.sendError(res, code, err);
          });
        });
      });
    });
  });

  app.post(options.routes.reset.url, function (req, res) {
    var model = req.getModel()
      , body = util.parseBody(req.body)
      , user = util.schemify(body.user)
      , token = body.token
      , Tok = tok({secretKey: options.secretKey});

    if (!token) return util.sendError(res, 400, 'token missing');
    if (!user.id) return util.sendError(res, 400, 'no user id');

    try {
      token = JSON.parse(token);
    } catch (e) {
      return util.sendError(res, 400, 'token invalid json');
    }

    Tok.check(user.id, token, function (err) {
      if (err) return util.sendError(res, 400, err);
      updateUser(req, user, function (err) {
        if (err) return util.sendError(res, 400, err);
        util.saveUserSession(req, user);
        res.send(_.pick(user, 'id', 'registered'));
      });
    });
  });

  app.post(options.routes.signIn.url, function (req, res) {
    console.log('signIn');

    var model = req.getModel()
      , body = util.parseBody(req.body)
      , keys = util.parseBodyKeys(req.body)
      , user = _.merge(options.defaultUser, body.user)
      , containsPassword = false
      , errorCode = 500;

    findUserId(req, user, function (err, userId) {
      if (err) return util.sendError(res, 500, err);
      if (!userId) return util.sendError(res, 404, 'user not found');
      if (!util.userContainsType(user, 'password')) return util.sendError('passwording missing');
      user.id = userId;

      async.each(keys, function (key, callback) {
        key = key.split('.').slice(1).join('.');

        var path = key.split('.')
          , coll = util.getUserCollection(path.shift())
          , type = dotty.get(options.schema, key + '.type')
          , $user = model.at(coll + '.' + user.id);

        if (!type) return callback();
        if (type !== 'password') return callback();

        $user.fetch(function (err) {
          if (err) return callback(err);
          user.registered = $user.get('registered');

          var hash = dotty.get(options.schema, key + '.hash')
            , dbPass = $user.get(path.join('.'))
            , pass = dotty.get(user, key)
            , ok = hash ? passwordHash.verify(pass, dbPass) : pass === dbPass;

          if (!ok) errorCode = 400;
          callback(ok ? null : 'invalid password');
        });
      }, function (err) {
        if (err) return util.sendError(res, errorCode, err);
        util.saveUserSession(req, user);
        res.send(_.pick(user, 'id', 'registered'));
      });
    });
  });

  app.post(options.routes.signOut.url, function (req, res) {
    var model = req.getModel()
      , userId = dotty.get(req.session, options.session.path + '.id')
      , $user = model.at(util.getUserCollection() + '.' + userId);

    $user.fetch(function (err) {
      if (err) return util.sendError(res, 500, err);
      if (!$user.get('registered')) return util.sendError(res, 400, 'not signed in');
      var user = {id: model.id(), registered: false};
      util.createUser(req, user);
      util.saveUserSession(req, user);
      return res.send(_.pick(user, 'id'));
    });
  });

  app.post(options.routes.signUp.url, function (req, res) {
    var model = req.getModel()
      , body = util.parseBody(req.body)
      , user = body.user
      , joinDate = new Date();

    /*var email = req.body.email
      , password = req.body.password
      , username = req.body.username
      , userId = model.get('_session.user.id')
      , $public = model.at('usersPublic.' + userId)
      , $private = model.at('usersPublic.' + userId);

    if (!email) return res.send(400, {error: 'missing email'});
    if (!password) return res.send(400, {error: 'missing password'});
    if (!username) return res.send(400, {error: 'missing username'});

    var $find = model.query('usersPublic', {local: {username: username}});

    model.fetch($find, function (err) {
      if (err) return res.sendError(500, {error: err});
      $find = model.query()
    });

    model.fetch($public, $private, function (err) {
      if (err) return res.send(500, {error: err});
      $public.set('local.username', username);
      $private.set('local.email', email);
      $private.set('local.hashedPassword', passwordHash.generate(password));
    });*/

    if (!user) return util.sendError(res, 400, 'missing user');
    if (!util.userContainsType(user, 'password')) return util.sendError(res, 400, 'missing password');
    user = util.schemify(_.merge(options.defaultUser, body.user));
    user.id = dotty.get(req.session, options.session.path + '.id');

    findUserId(req, user, function (err, foundUserId) {
      if (foundUserId) return util.sendError(res, 400, 'user exists');

      _.each(options.accessLevels, function (lvl) {
        if (!user[lvl]) user[lvl] = {};
        user[lvl].registered = true;
        user[lvl].joinDate = joinDate;
        user[lvl].updateDate = joinDate;
      });

      updateUser(req, user, function (err) {
        if (err) return util.sendError(res, 500, err);
        return res.send(_.pick(user, 'id'));
      });
    });
  });

  return function (req, res, next) {
    next();
  };
};