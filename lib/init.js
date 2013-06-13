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
          , coll = util.getUserCollection(options.accessLevels[0])
          , doc = options.providers.path + '.' + name + '.id'
          , query = model.query(coll, target)
          , userId = model.get('_session.' + options.session.idPath);

        target.$query[doc] = profileId;

        model.fetch(query, function (err) {
          if (err) return done(err);
          userId = dotty.get(query.get(), '0.id') || userId;

          _.each(options.accessLevels, function (lvl) {
            var coll = util.getUserCollection(lvl)
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
      , userId = dotty.get(req.session, options.session.idPath)
      , isRegistered = false;

    // pass config to the client
    if (options.clientConfig) {
      _.each(_.pick(options, options.clientConfig.pick), function (val, key) {
        model.set(options.clientConfig.path + '.' + key, val);
      });
    }

    var saveSession = function () {
      dotty.put(req.session, options.session.idPath, userId);
      dotty.put(req.session, options.session.isRegisteredPath, isRegistered);
      model.set('_session.' + options.session.isRegisteredPath, isRegistered);
      model.set('_session.' + options.session.idPath, userId);
    };

    if (!userId) {
      userId = model.id();

      _.each(options.accessLevels, function (lvl) {
        model.add(util.getUserCollection(lvl), {id: userId, registered: false});
      });

      saveSession();
      return next();
    }

    var $user = model.at(util.getUserCollection() + '.' + userId);

    $user.fetch(function (err) {
      if (err) return next(err);
      isRegistered = $user.get('registered');
      saveSession();
      next();
    });
  };
};