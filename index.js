var _ = require('lodash')
  , _s = require('underscore.string')
  , async = require('async')
  , dotty = require('dotty')
  , passport = require('passport')
  , passwordHash = require('password-hash');

module.exports = function (app, options) {
  var assembleUser = function (obj) {
    var user = {};

    _.each(options.accessLevels, function (lvl) {
      user[lvl] = {};
    });

    _.each(obj, function (val, key) {
      dotty.put(user, key, val);
    });

    return user;
  };

  var findUserId = function (model, user, callback) {
    if (_.isFunction(options.local.findUserId)) {
      return options.local.findUserId(model, user, callback);
    }

    var found = null;

    async.some(options.local.findUserId, function (path, callback) {
      path = path.split('.');

      var val = dotty.get(user, path)
        , coll = getCollection(path.shift())
        , doc = path.join('.')
        , target = {$query: {}};

      target.$query[doc] = val;
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

  var getCollection = function (lvl) {
    return options.collectionName + (lvl ? _s.capitalize(lvl) : '');
  };

  options = _.merge(options || {}, {
    accessLevels: [
      'public',
      'private'
    ],
    clientConfigPath: '$auth',
    collectionName: 'users',
    local: {
      findUserId: [
        'private.local.email',
        'public.local.username'
      ],
      password: {
        hash: {},
        maximumLength: 100,
        minimumLength: 6,
        path: 'private.local.password'
      },
    }
    providers: {
      schema: {
        'public': ['displayName', 'username'],
        'private': '*'
      },
      strategies: {},
      path: 'providers'
    },
    session: {
      idPath: 'user.id',
      isRegisteredPath: 'user.isRegistered'
    },
    signInRoute: '/signin',
    signOutRoute: '/signout',
    signUpRoute: '/signup'
  });

  if (_.isString(options.local.findUserId)) {
    options.local.findUserId = [options.local.findUserId];
  }

  if (!options.accessLevels) {
    options.accessLevels = [''];
  }

  _.each(options.accessLevels, function (lvl) {
    var schema = options.providers.schema;
    if (!schema[lvl]) schema[lvl] = [];
    if (_.isString(schema[lvl])) schema[lvl] = [schema[lvl]];
  });

  _.each(options.providers.strategies, function (strategy, name) {
    _.merge(strategy, {
      callback: {
        popup: true,
        url: '/auth/' + name + '/callback'
      },
      config: {},
      module: 'passport-' + name,
      options: {
        url: '/auth/' + name
      },
      verify: function (callback) {
        return function () {
          var req = arguments[0]
            , profile = _.last(arguments, 2)[0]
            , profileId = arguments.length === 4 ? arguments[1] : profile.id
            , done = _.last(arguments);

          callback(req, profileId, profile, done);
        };
      }
    }, strategy);

    strategy.config.passReqToCallback = true;
  });

  return {
    init: function () {
      app.use(passport.initialize());
      app.use(passport.session());

      passport.serializeUser(function (user, done) {
        done(null, user.id);
      });

      passport.deserializeUser(function (userId, done) {
        return done(null, {id: userId});
      });

      _.each(options.providers.strategies, function (strategy, name) {
        var Strategy = require(strategy.module).Strategy;

        passport.use(new Strategy(strategy.config, strategy.verify(
          function (req, profileId, profile, done) {
            var model = req.getModel()
              , target = {$query: {}}
              , coll = getCollection(options.accessLevels[0])
              , doc = options.providers.path + '.' + name + '.id'
              , query = model.query(coll, target)
              , userId = model.get('_session.' + options.session.idPath);

            target.$query[doc] = profileId;

            model.fetch(query, function (err) {
              if (err) return done(err);
              var foundUser = dotty.get(query.get(), '0');

              if (foundUser) {
                userId = foundUser.id;
              } else {
                _.each(options.accessLevels, function (lvl) {
                  var coll = getCollection(lvl)
                    , part = model.at(coll + '.' + userId)
                    , prov = part.at(options.providers.path + '.' + name);

                  part.fetch(function (err) {
                    if (err) return done(err);
                    part.set('id', userId);
                    part.set('registered', true);
                    prov.set('id', profileId)

                    _.each(options.providers.schema[lvl], function (path) {
                      if (path === '*') {
                        prov.set(profile);
                        profile = {};
                      } else {
                        var val = dotty.get(profile, path);
                        if (!val) return;
                        prov.set(path, val);
                        dotty.remove(profile, path);
                      }
                    });
                  });
                });
              }

              model.set('_session.' + options.session.idPath, userId);
              model.set('_session.' + options.session.isRegisteredPath, true);
              dotty.put(req.session, options.session.idPath, userId);
              dotty.put(req.session, options.session.isRegisteredPath, true);
              done(null, {id: userId});
            });
          }
        )));
      });

      return function (req, res, next) {
        var model = req.getModel()
          , userId = dotty.get(req.session, options.session.idPath);

        if (userId) {
          var coll = getCollection(options.accessLevels[0])
            , part = model.at(coll + '.' + userId);

          part.fetch(function (err) {
            if (err) return next(err);
            model.set('_session.' + options.session.isRegisteredPath, true);
          });
        } else {
          userId = model.id();
          dotty.put(req.session, options.session.idPath, userId);

          _.each(options.accessLevels, function (lvl) {
            model.add(getCollection(lvl), {id: userId, registered: false});
          });

          model.set('_session.' + options.session.isRegisteredPath, false);
        }

        model.set('_session.' + options.session.idPath, userId);
        model.set(options.clientConfigPath + '.accessLevels', options.accessLevels);
        model.set(options.clientConfigPath + '.session', options.session);
        next();
      };
    },
    routes: function () {
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

      app.post(options.signInRoute, function (req, res) {
        var model = req.getModel()
          , user = assembleUser(req.body)
          , pass = dotty.get(user, options.local.password.path);

        findUserId(model, user, function (err, userId) {
          var failure = function (err) {
            if (err) console.error(err);
            return res.send();
          }

          var success = function () {
            dotty.put(req.session, options.session.idPath, userId);
            model.set('_session.' + options.session.idPath, userId);
            model.set('_session.' + options.session.isRegisteredPath, true);
            return res.send({id: userId, isRegistered: true});
          }

          if (err) return failure(err);
          if (!userId) return failure();
          if (!options.local.password) return success();

          var coll = getCollection(options.local.password.path.split('.')[0])
            , part = model.at(coll + '.' + userId)
            , path = options.local.password.path.split('.').slice(1).join('.')

          part.fetch(function (err) {
            if (err) return failure(err);
            var dbPass = part.get(path);

            if (options.local.password.hash) {
              return passwordHash.verify(pass, dbPass) ? success() : failure();
            }

            return dbPass === pass ? success() : failure();
          });
        });
      });

      app.post(options.signUpRoute, function (req, res) {
        var error = function (err) {
          return res.send();
        };

        var success = function () {
          return res.send();
        };

        var model = req.getModel()
          , user = assembleUser(req.body)
          , userId = dotty.get(req.session, options.session.idPath);

        if (options.local.password && options.local.password.hash) {
          var pass = dotty.get(user, options.local.password.path)
            , hash = passwordHash.generate(pass, options.local.password.hash);

          dotty.put(user, options.local.password.path, hash);
        }

        _.each(options.accessLevels, function (lvl) {
          var part = model.at(getCollection(lvl) + '.' + userId);

          part.fetch(function (err) {
            if (err) return error(err);
            var obj = _.merge(part.get(), user[lvl], {registered: true});
            part.set(obj);
          });
        });

        return success();
      });

      return function (req, res, next) {
        next();
      };
    }
  }
};