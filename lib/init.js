var _ = require('lodash')
  , _s = require('underscore.string')
  , dotty = require('dotty')
  , JSONSelect = require('JSONSelect')
  , traverse = require('traverse');

module.exports = function (app, options) {
  var util = require('./util')(options);

  return function (req, res, next) {
    var model = req.getModel()
      , user = {id: dotty.get(req.session, options.session.path + '.id')}
      , $user = model.at(util.getUserCollection() + '.' + user.id);

    dotty.put(req, 'userUtil.save', util.saveUserSession);

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