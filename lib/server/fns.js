exports.signout = function (req, callback) {
  var model = req.getModel();
  var userId = req.user.id;
  var $user = model.at('users.' + userId);
  $user.fetch(function (err) {
    if (err) return callback(err);
    if (!$user.get('registered')) return callback();
    var user = {id: model.id(), created: new Date()};
    req.logout();
    req.login(user, function (err) {
      if (err) return callback(err);
      model.add('users', user);
      callback(null, {user: {id: user.id}});
    });
  });
};
