'use strict';

var Options = require('./options');

module.exports = function (opts) {
  var fns = {};
  var options = Options(opts);

  fns.passwordMatches = function (user, password, callback) {
    var hashedPassword = user.local && user.local.password && user.local.password.hash;
    if (!hashedPassword) return callback(null, false);
    options.hash.verify(null, user.id, password, hashedPassword, callback);
  };

  fns.signout = function (req, callback) {
    var model = req.getModel();
    if (!model) return callback();
    if (req.isUnauthenticated()) return callback();

    var userId = req.user.id;
    var $user = model.at('users.' + userId);

    $user.fetch(function (err) {
      if (err) return callback(err);
      if (!$user.get('registered')) return callback();

      req.logout();

      if (!options.autoGenerate) return callback();
      var user = {id: model.id(), created: Date.now()};

      req.login(user, function (err) {
        if (err) return callback(err);

        model.add('users', user, function (err) {
          if (err) return callback(err);
          callback(null, {user: {id: user.id}});
        });
      });
    });
  };

  return fns;
};
