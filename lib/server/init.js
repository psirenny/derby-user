var credential = require('credential');
var express = require('express');
var fns = require('./fns');
var merge = require('merge');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var app = express();

module.exports = function (options) {
  var defaults = {
    autoGenerate: true,
    config: {usernameField: 'usernameOrEmail'}
  };

  options = merge(defaults, options);
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
      var $query = !~usernameOrEmail.indexOf('@') ?
        model.query('users', {'local.username': usernameOrEmail}) :
        model.query('users', {'local.emails.0.value': usernameOrEmail});

      $query.fetch(function (err) {
        if (err) return done(err);
        var user = $query.get()[0];
        if (!user) return done(null, false, {error: 'not found'});
        var $user = model.at('users.' + user.id);
        $user.fetch(function (err) {
          if (err) return done(err);
          req.duser.passwordMatches(user, password, function (err, valid) {
            if (err) return done(err);
            if (!valid) return done(null, false, {error: 'invalid password'});
            $user.del('local.password.token', function () {
              done(null, {id: user.id});
            });
          });
        });
      });
    }
  ));

  app.use(passport.initialize());

  app.use(passport.session());

  app.all('*', function (req, res, next) {
    var model = req.getModel();
    req.duser = fns;
    req.duser.req = req;

    if (req.isAuthenticated()) {
      model.set('_session.user.id', req.user.id);
      return next();
    }

    if (!options.autoGenerate) return next();

    var user = {
      id: model.id(),
      created: new Date()
    };

    req.login(user, function (err) {
      if (err) return next(err);
      model.add('users', user);
      model.set('_session.user.id', user.id);
      next();
    });
  });

  return app;
};
