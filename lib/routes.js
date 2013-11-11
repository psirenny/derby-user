var _ = require('lodash')
  , _s = require('underscore.string')
  , async = require('async')
  , dotty = require('dotty')
  , passport = require('passport')
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

  app.post('/signin', function (req, res) {
    console.log(1);
    passport.authenticate('local', function (req, res) {
      console.log(2);
      if (err) return next(err);
      if (!user) return res.send(400, {error: 'error msg'});
      res.send({user: {id: user.id}});
    });
    res.send(500);
  });

  app.post('/signout', function (req, res) {
    var model = req.getModel()
      , userId = model.get('_session.user.id')
      , $public = model.at('usersPublic.' + userId);

    $public.fetch(function (err) {
      if (err) return res.send(500, {error: err});
      if (!$public.get('isRegistered')) return res.send(400, {error: 'not signed in', id: 1});
      var userId = model.id();
      model.add('usersPublic', {created: new Date(), id: userId, isRegistered: false});
      model.add('usersPrivate', {id: userId});
      model.add('usersRestricted', {id: userId});
      model.set('_session.user', {id: userId, isRegistered: false});
      req.session.user.id = userId;
      req.session.user.isRegistered = false;
      return res.send({user: {id: userId}});
    });
  });

  app.post('/signup', function (req, res) {
    var model = req.getModel()
      , email = req.body.email
      , password = req.body.password
      , username = req.body.username
      , userId = model.get('_session.user.id')
      , $public = model.at('usersPublic.' + userId)
      , $private = model.at('usersPrivate.' + userId)
      , $query1 = model.query('usersPublic', {local: {username: username}})
      , $query2 = model.query('usersPrivate', {local: {email: email}});

    if (!email) return res.send(400, {error: 'missing email', id: 1});
    if (!password) return res.send(400, {error: 'missing password', id: 2});
    if (!username) return res.send(400, {error: 'missing username', id: 3});

    model.fetch($query1, $query2, $public, $private,
      function (err) {
        if (err) return res.send(500, {error: err});
        if ($query1.get()[0] || $query2.get()[0]) return res.send(400, {error: 'user exists', id: 4});
        if ($public.get('isRegistered')) return res.send(400, {error: 'already registered', id: 5});
        $public.set('isRegistered', true);
        $public.set('joined', new Date());
        $public.set('local.username', username);
        $private.set('local.email', email);
        $private.set('local.hashedPassword', passwordHash.generate(password));
        res.send();
      }
    );
  });

  return function (req, res, next) {
    next();
  };
};