var _ = require('lodash')
  , _s = require('underscore.string')
  , async = require('async')
  , dotty = require('dotty')
  , validator = require('validator/validator-min')
  , check = validator.check
  , sanitize = validator.sanitize;

exports.create = function (model, dom) {
  var root = model.parent().parent()
    , config = root.at(model.get('config') || '$user')
    , form = this.form = dom.element(model.get('form') || 'form')
    , username = this.username = dom.element(model.get('username') || 'username')
    , email = this.username = dom.element(model.get('email') || 'email')
    , password = this.password = dom.element(model.get('password') || 'password');

  var form = this.form = dom.element(model.get('form') || 'form');
  if (!$) require('../../vendor/jquery.min.js');
  if (!$.fn.ajaxForm) require('../../vendor/jquery.form.min.js');
  if (!$.fn.popupWindow) require('../../vendor/jquery.popupWindow.min.js');
  if (!form) return console.error('must specifiy form element (i.e. <form x-as="form">...</form>');

  var validateEmail = function (e, callback) {
    var value = _s.trim(email.value)
      , $validation = model.at(email).at('validation')
      , callback = callback || function () {};

    if (!value) {
      if (e.type === 'submit') {
        $validation.set('state', 'invalid');
        $validation.set('code', '1');
      } else {
        $validation.set('state', 'default');
        $validation.del('code');
        return callback(true);
      }
    }

    if (value.length > config.get('validation.email.maximumLength')) {
      $validation.set('state', 'invalid');
      $validation.set('code', '3');
      return callback(true);
    }

    if (value.length < config.get('validation.email.minimumLength')) {
      if (e.type === 'keyup') {
        $validation.set('state', 'tolerated');
        $validation.del('code');
      } else {
        $validation.set('state', 'invalid');
        $validation.set('code', '2');
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
        if (e.type === 'keyup') {
          $validation.set('state', 'tolerated');
          $validation.del('code');
        } else {
          $validation.set('state', 'invalid');
          $validation.set('code', '5');
        }
        return callback(true);
      } else {
        $validation.set('state', 'valid');
        $validation.del('code');
        callback();
      }
    });
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

    $validation.set('state', 'valid');
    $validation.del('code');
    callback();
  };

  var validateUsername = function (e, callback) {
    var value = _s.trim(username.value)
      , $validation = model.at(username).at('validation')
      , callback = callback || function () {};

    if (!value) {
      if (e.type === 'submit') {
        $validation.set('state', 'invalid');
        $validation.set('code', '1');
      } else {
        $validation.set('state', 'default');
        $validation.del('code');
        return callback(true);
      }
    }

    if (_s.contains(value, ' ')) {
      $validation.set('state', 'invalid');
      $validation.set('code', '2');
      return callback(true);
    }

    var invalid = value.match(/[^a-zA-Z0-9_-]/);

    if (invalid && invalid.length) {
      invalid = _.uniq(invalid);
      $validation.set('state', 'invalid');
      $validation.set('code', '3');
      $validation.set('data', {characters: invalid});
      return callback(true);
    }

    if (value.length < config.get('validation.username.minimumLength')) {
      if (e.type === 'keyup') {
        $validation.set('state', 'tolerated');
        $validation.del('code');
      } else {
        $validation.set('state', 'invalid');
        $validation.set('code', '4');
      }
      return callback(true);
    }

    if (value.length > config.get('validation.username.maximumLength')) {
      $validation.set('state', 'invalid');
      $validation.set('code', '5');
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
        if (e.type === 'keyup') {
          $validation.set('state', 'tolerated');
          $validation.del('code');
        } else {
          $validation.set('state', 'invalid');
          $validation.set('code', '6');
        }
        callback(true);
      } else {
        $validation.set('state', 'valid');
        $validation.del('code');
        callback();
      }
    });
  };

  dom.addListener(username, 'keyup', validateUsername);
  dom.addListener(username, 'blur', validateUsername);
  dom.addListener(email, 'keyup', validateEmail);
  dom.addListener(email, 'blur', validateEmail);
  dom.addListener(password, 'keyup', validatePassword);
  dom.addListener(password, 'blur', validatePassword);

  dom.addListener(form, 'submit', function (e) {
    var redirect = model.get('failureredirect')
      , onSubmitting = model.get('onsubmitting')
      , onSubmitted = model.get('onSubmitted');

    onSubmitting = dotty.get(DERBY.app, onSubmitting) || function (callback) { callback(); };
    onSubmitted = dotty.get(DERBY.app, onSubmitted) || function (callback) { callback(); };

    var submit = function () {
      $(form).ajaxSubmit({
        error: function () {
          if (redirect) DERBY.app.history.push(redirect);
        },
        success: function (data) {
          var root = model.parent().parent()
            , config = root.get(model.get('config') || '$user')
            , onSuccess = model.get('onsuccess');

          if (onSuccess) DERBY.app[onSuccess]();
          root.set('_session.' + config.session.path + '.id', data.id);
          root.set('_session.' + config.session.path + '.registered', true);
        }
      });

      return false;
    };

    submit = _.wrap(submit, function (fn) {
      async.series([
        _.partial(onSubmitting, e, form),
        fn,
        _.partial(onSubmitted, e, form)
      ]);
    });

    async.parallel([
      _.partial(validateUsername, e),
      _.partial(validateEmail, e),
      _.partial(validatePassword, e)
    ], function (err) {
      if (!err) return submit();
      if (redirect) DERBY.app.history.push(redirect);
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