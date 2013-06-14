var _ = require('lodash')
  , _s = require('underscore.string')
  , dotty = require('dotty')
  , passport = require('passport');

module.exports = function (app, options) {
  var util = require('./util')(options);

  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser(function (user, done) {
    done(null, user.id);
  });

  passport.deserializeUser(function (userId, done) {
    return done(null, {id: userId});
  });

  _.each(options.providers.strategies, function (strategy, name) {
    var Strategy = require(strategy.module)[strategy.name];

    passport.use(new Strategy(strategy.config, strategy.verify(
      function (req, profileId, profile, done) {
        var model = req.getModel()
          , target = {$query: {}}
          , userId = model.get('_session.' + options.session.path + '.id')
          , user = {id: userId, registered: true, updateDate: new Date()}
          , $user = model.at(util.getUserCollection() + '.' + userId);

        target.$query[options.providers.path + '.' + name + '.id'] = profileId;
        var query = model.query(util.getUserCollection(), target)

        model.fetch(query, function (err) {
          if (err) return done(err);
          var foundUserId = dotty.get(query.get(), '0.id');
          user.id = foundUserId || user.id;

          $user.fetch(function (err) {
            if (err) return done(err);
            if (!foundUserId && !$user.get('registered')) {
              user.defaultProvider = name;
              user.joinDate = user.updateDate;
            }
          });

          _.each(options.accessLevels, function (lvl) {
            var $user = model.at(util.getUserCollection(lvl) + '.' + user.id)
              , $provider = $user.at(options.providers.path + '.' + name);

            $user.fetch(function (err) {
              if (err) return done(err);
              $user.set(_.merge($user.get(), user));
              $provider.set('id', profileId);

              _.each(options.providers.schema[lvl], function (path) {
                if (path === '*') {
                  $provider.set(profile);
                  profile = {};
                } else {
                  var val = dotty.get(profile, path);
                  if (!val) return;
                  $provider.set(path, val);
                  dotty.remove(profile, path);
                }
              });
            });
          });

          util.saveUserSession(req, user);
          done(null, _.pick(user, 'id'));
        });
      }
    )));
  });

  return function (req, res, next) {
    var model = req.getModel()
      , user = {id: dotty.get(req.session, options.session.path + '.id')}
      , $user = model.at(util.getUserCollection() + '.' + user.id);

    if (options.clientConfig) {
      _.each(_.pick(options, options.clientConfig.pick), function (val, key) {
        model.set(options.clientConfig.path + '.' + key, val);
      });
    }

    if (!user.id) {
      user.id = model.id();
      user.registered = false;
      util.createUser(req, user);
      util.saveUserSession(req, user);
      return next();
    }

    $user.fetch(function (err) {
      if (err) return next(err);
      user.registered = $user.get('registered');
      util.saveUserSession(req, user);
      next();
    });
  };
};
