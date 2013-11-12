var passport = require('passport')
  , passwordHash = require('password-hash')
  , LocalStrategy = require('passport-local').Strategy;

module.exports = function (app, options) {
  passport.serializeUser(function(user, done) {
    done(null, user.id);
  });

  passport.deserializeUser(function(userId, done) {
    done(null, {id: userId});
  });

  passport.use(new LocalStrategy(
    {passReqToCallback: true, usernameField: 'usernameOrEmail'},
    function(req, usernameOrEmail, password, done) {
      var model = req.getModel();
      var $query = !~usernameOrEmail.indexOf('@')
        ? model.query('usersPublic', {'local.username': usernameOrEmail})
        : model.query('usersPrivate', {'local.emails.0.value': usernameOrEmail});

      model.fetch($query, function (err) {
        if (err) return done(err);
        var user = $query.get()[0];
        if (!user) return done(null, false, {error: 'not found'});
        var $private = model.at('usersPrivate.' + user.id);
        $private.fetch(function (err) {
          if (err) return done(err);
          if (passwordHash.verify(password, $private.get('local.hashedPassword'))) return done(null, {id: user.id});
          done(null, false, {error: 'invalid password'});
        });
      });
    }
  ));

  app.use(passport.initialize());
  app.use(passport.session());

  return function () {
    return function (req, res, next) {
      if (req.headers['phonegap']) return next();

      var model = req.getModel()
        , userId = req.session.user && req.session.user.id;

      if (!userId) {
        userId = model.id();
        model.add('usersPrivate', {id: userId});
        model.add('usersPublic', {id: userId, created: new Date(), isRegistered: false});
        req.session.user = {id: userId};
      }

      model.set('_session.user.id', userId);
      next();
    };
  }
};