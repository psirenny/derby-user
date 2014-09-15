var credential = require('credential');

exports.passwordMatches = function (user, password, callback) {
  var hashedPassword = user.local && user.local.password && user.local.password.hash;
  if (!hashedPassword) return callback(null, false);
  credential.verify(hashedPassword, password, function (err, valid) {
    callback(err, valid);
  });
};

exports.signout = function (callback) {
  var self = this;
  var model = this.req.getModel();
  var userId = this.req.user.id;
  var $user = model.at('users.' + userId);
  $user.fetch(function (err) {
    if (err) return callback(err);
    if (!$user.get('registered')) return callback();
    var user = {id: model.id(), created: new Date()};
    self.req.logout();
    self.req.login(user, function (err) {
      if (err) return callback(err);
      model.add('users', user);
      callback(null, {user: {id: user.id}});
    });
  });
};
