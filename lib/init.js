var _ = require('lodash')
  , _s = require('underscore.string')
  , dotty = require('dotty')
  , passport = require('passport')
  , LocalStrategy = require('passport-local').Strategy
  , passwordHash = require('password-hash');

module.exports = function (app, options) {
  var util = require('./util')(options);

  app.use(function (req, res, next) {
    console.log('a');
    var model = req.getModel()
      , user = {id: dotty.get(req.session, options.session.path + '.id')}
      , $user = model.at(util.getUserCollection() + '.' + user.id);

    dotty.put(req, 'userUtil.save', util.saveUserSession);

    if (options.clientConfig) {
      _.each(_.pick(options, options.clientConfig.pick), function (val, key) {
        model.set(options.clientConfig.path + '.' + key, val);
      });
    }

    if (req.headers['phonegap']) return next();

    var userId = req.session.user && req.session.user.id;

    if (!userId) {
      userId = model.id();
      model.add('usersPrivate', {id: userId});
      model.add('usersPublic', {id: userId, created: new Date(), isRegistered: false});
      model.add('usersRestricted', {id: userId});
      model.set('_session.user.id', userId);
      model.set('_session.user.isRegistered', false);
      req.session.user = {id: userId};
      return next();
    }

    model.set('_session.user.id', userId);
    var $user = model.at('usersRestricted.' + userId);
    $user.fetch(function (err) {
      if (err) return next(err);
      model.set('_session.user.id', userId);
      model.set('_session.user.isRegistered', $user.get('isRegistered'));
      return next();
    });
  });

  app.use(passport.initialize());
  app.use(passport.session());
  return function (req, res, next) {next();};
};