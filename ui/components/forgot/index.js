var _ = require('lodash')
  , _s = require('underscore.string')
  , async = require('async')
  , dotty = require('dotty')
  , validator = require('validator/validator-min')
  , check = validator.check
  , sanitize = validator.sanitize;

exports.create = function (model, dom) {
  var self = this
    , form = dom.element(model.get('form') || 'form')
    , handle = this.handle = dom.element(model.get('handle') || 'handle');

  if (!form) {
    return console.error('must specify form element');
  }

  if (!handle) {
    return console.error('must specify handle element');
  }

  this.config = model.parent(2).get('$user');

  dom.addListener(form, 'submit', function (e) {
    e.preventDefault();
    self.validate(e, function (err) {
      if (!err) self.submit(e);
    });
  });

  dom.addListener(handle, 'blur', function (e) {
    self._validateHandle(e);
  });

  dom.addListener(handle, 'keyup', function (e) {
    self._validateHandle(e);
  });
};

exports.submit = function (e) {
  var cancelled = this.emitCancellable('submit', e);
  if (cancelled) return;
  var self = this;

  if (!$) {
    return console.error('jQuery required for derby-user/forgot');
  }

  if (!$.fn.ajaxSubmit) {
    return console.error('jquery.form required for derby-user/forgot');
  }

  $(e.target).ajaxSubmit({
    error: function (err) {
      self.submitError(err);
    },
    success: function (data) {
      self.submitSuccess(data);
    },
    type: self.config.routes.forgot.method,
    url: self.config.routes.forgot.url
  });
};

exports.submitError = function (err) {
  this.emit('submitError', err);
  var redirect = this.model.get('errorredirect');
  if (redirect) DERBY.app.history.push(redirect);
};

exports.submitSuccess = function (data) {
  this.emit('submitSuccess', data);
  var redirect = this.model.get('successredirect');
  if (redirect) DERBY.app.history.push(redirect);
};

exports.validate = function (e, callback) {
  this.emit('validate', e);
  this._validateHandle (e, callback);
};

exports._validateEmailInvalid = function (e, callback) {
  var $path = this.model.at(this.handle).at('validation');

  try {
    check(this.handle.value).isEmail()
  }
  catch (ex) {
    if (e.type === 'keyup') {
      $path.set('state', 'tolerated');
      $path.del('code', '4');
    } else {
      $path.set('state', 'invalid');
      $path.set('code', '4');
    }

    return callback('invalid email');
  }

  callback();
};

exports._validateEmailExists = function (e, callback) {
  var self = this
    , $path = this.model.at(this.handle).at('validation')
    , data = {};

  _.each(this.handle.name.replace(' ', '').split(','), function (param) {
    dotty.put(data, param, self.handle.value);
  });

  $.ajax({
    data: data,
    type: this.config.routes.ajax.userExists.method,
    url: this.config.routes.ajax.userExists.url
  }).done(function (data) {
    if (data.exists) return callback();

    if (e.type === 'keyup') {
      $path.set('state', 'tolerated');
      $path.del('code');
    } else {
      $path.set('state', 'invalid');
      $path.set('code', '5');
    }

    callback('email not found');
  });
};

exports._validateEmailMaximumLength = function (e, callback) {
  if (_s.trim(this.handle.value.length) <= this.config.validation.email.maximumLength) {
    return callback();
  }

  var $path = this.model.at(this.handle).at('validation');
  $path.set('state', 'invalid');
  $path.set('code', '3');
  return callback('email too short');
};

exports._validateEmailMinimumLength = function (e, callback) {
  if (_s.trim(this.handle.value.length) >= this.config.validation.email.minimumLength) {
    return callback();
  }

  var $path = this.model.at(this.handle).at('validation');

  if (e.type === 'keyup') {
    $path.set('state', 'tolerated');
    $path.del('code');
  } else {
    $path.set('state', 'invalid');
    $path.set('code', '2');
  }

    return callback('email too long');
};

exports._validateHandle = function (e, callback) {
  var self = this;

  var result = function (err) {
    if (!err) {
      var $path = self.model.at(self.handle).at('validation');
      $path.set('state', 'valid');
      $path.del('code');
    }
    if (callback) callback(err);
  };

  this._validateHandleRequired(e, function (err) {
    if (err) return result(err);

    if (_s.contains('@', self.handle)) {
      return async.series([
        _.partial(_.bind(self._validateEmailMaximumLength, self), e),
        _.partial(_.bind(self._validateEmailMinimumLength, self), e),
        _.partial(_.bind(self._validateEmailInvalid, self), e),
        _.partial(_.bind(self._validateEmailExists, self), e)
      ], result);
    }

    async.series([
      _.partial(_.bind(self._validateUsernameContainsSpaces, self), e),
      _.partial(_.bind(self._validateUsernameContainsSymbols, self), e),
      _.partial(_.bind(self._validateUsernameMaximumLength, self), e),
      _.partial(_.bind(self._validateUsernameMinimumLength, self), e),
      _.partial(_.bind(self._validateUsernameExists, self), e)
    ], result);
  });
};

exports._validateHandleRequired = function (e, callback) {
  var $path = this.model.at(this.handle).at('validation');
  if (this.handle.value) return callback();

  if (e.type === 'submit') {
    $path.set('state', 'invalid');
    $path.set('code', '1');
  } else {
    $path.set('state', 'default');
    $path.del('code');
  }

  return callback('handle requires value');
};

exports._validateUsernameContainsSpaces = function (e, callback) {
  if (!_s.contains(_s.trim(this.handle.value), ' ')) return callback();
  var $path = this.model.at(this.handle).at('validation');
  $path.set('state', 'invalid');
  $path.set('code', '6');
  return callback('username contains spaces');
};

exports._validateUsernameContainsSymbols = function (e, callback) {
  var invalid = this.handle.value.match(/[^a-zA-Z0-9_-]/);
  if (!invalid || !invalid.length) return callback();
  var $path = this.model.at(this.handle).at('validation');
  invalid = _.uniq(invalid);
  $path.set('state', 'invalid');
  $path.set('code', '7');
  $path.set('data', {characters: invalid});
  return callback('username contains symbols');
};

exports._validateUsernameMaximumLength = function (e, callback) {
  if (_s.trim(this.handle.value.length) <= this.config.validation.username.maximumLength) {
    return callback();
  }

  var $path = this.model.at(this.handle).at('validation');
  $path.set('state', 'invalid');
  $path.set('code', '9');
  return callback('username too short');
};

exports._validateUsernameMinimumLength = function (e, callback) {
  if (_s.trim(this.handle.value.length) >= this.config.validation.username.minimumLength) {
    return callback();
  }

  var $path = this.model.at(this.handle).at('validation');

  if (e.type === 'keyup') {
    $path.set('state', 'tolerated');
    $path.del('code');
  } else {
    $path.set('state', 'invalid');
    $path.set('code', '8');
  }

  return callback('username too long');
};

exports._validateUsernameExists = function (e, callback) {
  var self = this
    , $path = this.model.at(this.handle).at('validation')
    , data = {};

  _.each(this.handle.name.replace(' ', '').split(','), function (param) {
    dotty.put(data, param, self.handle.value);
  });

  $.ajax({
    data: data,
    type: this.config.routes.ajax.userExists.method,
    url: this.config.routes.ajax.userExists.url
  }).done(function (data) {
    if (data.exists) return callback();

    if (e.type === 'keyup') {
      $path.set('state', 'tolerated');
      $path.del('code');
    } else {
      $path.set('state', 'invalid');
      $path.set('code', '10');
    }

    callback('email not found');
  });
};