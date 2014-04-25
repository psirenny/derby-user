var credential = require('credential')
  , passport = require('passport')
  , LocalStrategy = require('passport-local').Strategy;

module.exports = function (app, options) {
  if (!options.config) options.config = {};
  if (!options.config.usernameField) options.config.usernameField = 'usernameOrEmail';
  options.config.passReqToCallback = true;

  passport.serializeUser(function(user, done) {
    done(null, user.id);
  });

  passport.deserializeUser(function(userId, done) {
    done(null, {id: userId});
  });

  passport.use(new LocalStrategy(options.config,
    function(req, usernameOrEmail, password, done) {
      var model = req.getModel();
      var $query = !~usernameOrEmail.indexOf('@')
        ? model.query('usersPublic', {'local.username': usernameOrEmail})
        : model.query('usersPrivate', {'local.emails.0.value': usernameOrEmail});

      $query.fetch(function (err) {
        if (err) return done(err);
        var user = $query.get()[0];
        if (!user) return done(null, false, {error: 'not found'});
        var $private = model.at('usersPrivate.' + user.id);
        $private.fetch(function (err) {
          if (err) return done(err);
          var hashedPassword = $private.get('local.password.hash');
          credential.verify(hashedPassword, password, function (err, valid) {
            if (err) return done(err);
            if (!valid) return done(null, false, {error: 'invalid password'});
            $private.del('local.password.token', function () {
              done(null, {id: user.id});
            });
          });
        });
      });
    }
  ));

  return function () {
    app.use(passport.initialize());
    app.use(passport.session());

    return function (req, res, next) {
      var model = req.getModel();

      if (req.headers['phonegap']) {
        return next();
      }

      if (req.isAuthenticated()) {
        model.set('_session.user.id', req.user.id);
        return next();
      }

      var user = {id: model.id()};
      req.login(user, function (err) {
        if (err) return next(err);
        model.add('usersPrivate', {id: user.id});
        model.add('usersPublic', {id: user.id, created: new Date(), isRegistered: false});
        model.set('_session.user.id', user.id);
        next();
      });
    };
  }
};
