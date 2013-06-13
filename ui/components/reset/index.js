exports.create = function (model, dom) {
  var form = this.form = dom.element(model.get('form') || 'form');
  if (!$) require('../../vendor/jquery.min.js');
  if (!$.fn.ajaxForm) require('../../vendor/jquery.form.min.js');
  if (!form) return console.error('must specifiy form element (i.e. <form x-as="form">...</form>');

  $(function () {
    $(form).ajaxForm({
      error: function () {
        var redirect = model.get('failureredirect');
        if (redirect) DERBY.app.history.push(redirect);
      },
      success: function (data) {
        var root = model.parent().parent()
          , config = root.get(model.get('config') || '$user')
          , onSuccess = model.get('onsuccess')
          , redirect = model.get('successredirect');

        root.set('_session.' + config.session.idPath, data.id);
        root.set('_session.' + config.session.isRegisteredPath, data.registered);
        if (onSuccess) DERBY.app[onSuccess]();
        if (redirect) DERBY.app.history.push(redirect);
      }
    });
  });
};