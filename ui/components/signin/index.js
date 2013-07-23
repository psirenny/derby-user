var _ = require('lodash')
  , _s = require('underscore.string')
  , async = require('async')
  , validator = require('validator/validator-min')
  , check = validator.check
  , sanitize = validator.sanitize;

exports.create = function (model, dom) {
  var root = model.parent().parent()
    , config = root.at(model.get('config') || '$user')
    , form = this.form = dom.element(model.get('form') || 'form')
    , handle = this.handle = dom.element(model.get('handle') || 'handle')
    , password = this.password = dom.element(model.get('password') || 'password');

  if (!$) require('../../vendor/jquery.min.js');
  if (!$.fn.ajaxForm) require('../../vendor/jquery.form.min.js');
  if (!$.fn.popupWindow) require('../../vendor/jquery.popupWindow.min.js');
  if (!form) return console.error('must specifiy form element (i.e. <form x-as="form">...</form>');

  var validateEmail = function (e, callback) {
    var value = _s.trim(handle.value)
      , $validation = model.at(handle).at('validation')
      , callback = callback || function () {};

    if (value.length > config.get('validation.email.maximumLength')) {
      $validation.set('state', 'invalid');
      $validation.set('code', '2');
      return callback(true);
    }

    if (value.length < config.get('validation.email.minimumLength')) {
      if (e.type === 'keyup') {
        $validation.set('state', 'tolerated');
        $validation.del('code');
      } else {
        $validation.set('state', 'invalid');
        $validation.set('code', '3');
      }
      return callback(true);
    }

    try {
      check(value).isEmail();
    } catch (ex) {
      if (e.type === 'keyup') {
        $validation.set('state', 'tolerated');
        $validation.del('code');
      } else {
        $validation.set('state', 'invalid');
        $validation.set('code', '4');
      }
      return callback(true);
    }

    $.ajax({
      data: {
        user: {
          public: {
            local: {username: value}
          },
          private: {
            local: {email: value}
          }
        }
      },
      type: 'POST',
      url: '/userExists'
    }).done(function (data) {
      if (data.exists) {
        $validation.set('state', 'valid');
        $validation.del('code');
        callback();
      } else {
        if (e.type === 'keyup') {
          $validation.set('state', 'tolerated');
          $validation.del('code');
        } else {
          $validation.set('state', 'invalid');
          $validation.set('code', '5');
        }
        return callback(true);
      }
    });
  };

  var validateHandle = function (e, callback) {
    var value = handle.value;

    if (!value) {
      var $validation = model.at(handle).at('validation');

      if (e.type === 'submit') {
        $validation.set('state', 'invalid');
        $validation.set('code', '1');
      } else {
        $validation.set('state', 'default');
        $validation.del('code');
      }

      if (callback) return callback(true);
    }

    if (_s.contains(handle.value, '@')) {
      validateEmail(e, callback);
    } else {
      validateUsername(e, callback);
    }
  };

  var validatePassword = function (e, callback) {
    var value = password.value
      , $validation = model.at(password).at('validation')
      , callback = callback || function () {};

    if (!value) {
      if (e.type === 'submit') {
        $validation.set('state', 'invalid');
        $validation.set('code', '1');
      } else {
        $validation.set('state', 'default');
        $validation.del('code');
      }
      return callback(true);
    }

    if (value.length < config.get('validation.password.minimumLength')) {
      if (e.type === 'keyup') {
        $validation.set('state', 'tolerated');
        $validation.del('code');
      } else {
        $validation.set('state', 'invalid');
        $validation.set('code', '2');
      }
      return callback(true);
    }

    if (value.length > config.get('validation.password.maximumLength')) {
      $validation.set('state', 'invalid');
      $validation.set('code', '3');
      return callback(true);
    }

    if (model.at(handle).get('validation.state') !== 'valid') {
      $validation.set('state', 'tolerated');
      $validation.del('code');
      return callback();
    }

    $.ajax({
      data: {
        user: {
          public: {
            local: {username: handle.value}
          },
          private: {
            local: {email: handle.value, password: value},
          }
        }
      },
      type: 'POST',
      url: '/passwordMatches'
    }).done(function (data) {
      if (data.matches) {
        $validation.set('state', 'valid');
        $validation.del('code');
        callback();
      } else {
        if (e.type === 'keyup') {
          $validation.set('state', 'tolerated');
          $validation.del('code');
        } else {
          $validation.set('state', 'invalid');
          $validation.set('code', '4');
        }
        callback(true);
      }
    });
  };

  var validateUsername = function (e, callback) {
    var value = _s.trim(handle.value)
      , $validation = model.at(handle).at('validation')
      , callback = callback || function () {};

    if (_s.contains(value, ' ')) {
      $validation.set('state', 'invalid');
      $validation.set('code', '6');
      return callback(true);
    }

    var invalid = value.match(/[^a-zA-Z0-9_-]/);

    if (invalid && invalid.length) {
      invalid = _.uniq(invalid);
      $validation.set('state', 'invalid');
      $validation.set('code', '7');
      $validation.set('data', {characters: invalid});
      return callback(true);
    }

    if (value.length < config.get('validation.username.minimumLength')) {
      if (e.type === 'keyup') {
        $validation.set('state', 'tolerated');
        $validation.del('code');
      } else {
        $validation.set('state', 'invalid');
        $validation.set('code', '8');
      }
      return callback(true);
    }

    if (value.length > config.get('validation.username.maximumLength')) {
      $validation.set('state', 'invalid');
      $validation.set('code', '9');
      return callback(true);
    }

    $.ajax({
      data: {
        user: {
          public: {
            local: {username: value}
          },
          private: {
            local: {email: value}
          }
        }
      },
      type: 'POST',
      url: '/userExists'
    }).done(function (data) {
      if (data.exists) {
        $validation.set('state', 'valid');
        $validation.del('code');
        callback();
      } else {
        if (e.type === 'keyup') {
          $validation.set('state', 'tolerated');
          $validation.del('code');
        } else {
          $validation.set('state', 'invalid');
          $validation.set('code', '10');
        }
        callback(true);
      }
    });
  };

  dom.addListener(handle, 'keyup', validateHandle);
  dom.addListener(handle, 'change', validateHandle);
  dom.addListener(password, 'keyup', validatePassword);
  dom.addListener(password, 'change', validatePassword);
  dom.addListener(handle, 'keyup', validatePassword);

  dom.addListener(form, 'submit', function (e) {
    async.parallel([
      _.partial(validateHandle, e),
      _.partial(validatePassword, e)
    ], function (err) {
      if (err) return;

      $(form).ajaxSubmit({
        error: function () {
          var redirect = model.get('failureredirect');
          if (redirect) DERBY.app.history.push(redirect);
        },
        success: function (data) {
          var onSuccess = model.get('onsuccess')
            , redirect = model.get('successredirect');

          root.set('_session.' + config.get('session.path') + '.id', data.id);
          root.set('_session.' + config.get('session.path') + '.registered', data.registered);
          if (onSuccess) DERBY.app[onSuccess]();
          if (redirect) DERBY.app.history.push(redirect);
        }
      });
    });

    return false;
  });
};

exports.provider = function (e, el) {
  var onSuccess = this.model.get('onsuccess')
    , redirect = this.model.get('successredirect');

  e.preventDefault();
  if (!el.href) return console.error('must specify a provider url (i.e. <a href="/signin/provider">...</a>');

  $.popupWindow(el.href, {
    onUnload: function () {
      if (onSuccess) DERBY.app[onSuccess]();
      if (redirect) DERBY.app.history.push(redirect);
    }
  });
};