exports.create = function () {
  if (!$) require('../../vendor/jquery.min.js');
};

exports.signout = function () {
  var model = this.model
    , root = model.parent().parent()
    , config = root.get(model.get('config') || '$user')
    , onSuccess = model.get('onsuccess');

  $.ajax({
    success: function (data) {
      var redirect = model.get('successredirect');
      root.set('_session.' + config.session.path + '.id', data.id);
      root.set('_session.' + config.session.path + '.registered', false);
      if (onSuccess) DERBY.app[onSuccess]();
      if (redirect) DERBY.app.history.push(redirect);
    },
    type: 'POST',
    url: config.routes.signOut.url
  });
};