exports.create = function () {
  if (!$) require('../../vendor/jquery.min.js');
};

exports.signout = function () {
  var model = this.model
    , root = model.parent().parent()
    , config = root.get(model.get('config') || '$auth');

  $.ajax({
    success: function (data) {
      root.set('_session.' + config.session.idPath, data.id);
      root.set('_session.' + config.session.isRegisteredPath, false);
    },
    type: 'POST',
    url: config.signOutRoute
  });
};