exports.create = function () {
  if (!$) require('../../vendor/jquery.min.js');
};

exports.signout = function () {
  var model = this.model
    , root = model.parent().parent()
    , config = root.get(model.get('config') || '$auth');

  $.ajax({
    success: function (data) {
      var redirect = model.get('successredirect');
      root.set('_session.' + config.session.idPath, data.id);
      root.set('_session.' + config.session.isRegisteredPath, false);
      if (redirect) DERBY.app.history.push(redirect);
    },
    type: 'POST',
    url: config.signOutRoute
  });
};