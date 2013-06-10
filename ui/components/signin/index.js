exports.create = function (model, dom) {
  var form = this.form = dom.element(model.get('form') || 'form');
  if (!$) require('../../vendor/jquery.min.js');
  if (!$.fn.ajaxForm) require('../../vendor/jquery.form.min.js');
  if (!$.fn.popupWindow) require('../../vendor/jquery.popupWindow.min.js');
  if (!form) return console.error('must specifiy form element (i.e. <form x-as="form">...</form>');

  $(function () {
    $(form).ajaxForm({
      success: function (data) {
        var root = model.parent().parent()
          , config = root.get(model.get('config') || '$auth');

        root.set('_session.' + config.session.idPath, data.id);
        root.set('_session.' + config.session.isRegisteredPath, data.isRegistered);
      }
    });
  });
};

exports.provider = function (e, el) {
  e.preventDefault();
  if (!el.href) return console.error('must specify a provider url (i.e. <a href="/signin/provider">...</a>');
  $.popupWindow(el.href);
};