var _ = require('lodash')
  , async = require('async');

exports.create = function (model, dom) {
  var self = this
    , form = this.form = dom.element(model.get('form') || 'form')
    , password = this.password = dom.element(model.get('password') || 'password');

  if (!form) {
    return console.error('must specify form element');
  }

  if (!password) {
    return console.error('must specify password element');
  }

  this.config = model.parent(2).get('$user');

  dom.addListener(form, 'submit', function (e) {
    e.preventDefault();
    self.validate(e, function (err) {
      if (!err) self.submit(e);
    });
  });

  dom.addListener(password, 'blur', function (e) {
    self._validatePassword(e);
  });

  dom.addListener(password, 'keyup', function (e) {
    self._validatePassword(e);
  });
};

exports.submit = function (e) {
  var cancelled = this.emitCancellable('submit', e);
  if (cancelled) return;
  var self = this;

  if (!$) {
    return console.error('jQuery required for derby-user/change');
  }

  if (!$.fn.ajaxSubmit) {
    return console.error('jquery.form required for derby-user/change');
  }

  $(e.target).ajaxSubmit({
    error: function (err) {
      self.submitError(err);
    },
    success: function (data) {
      self.submitSuccess(data);
    },
    type: self.config.routes.change.method,
    url: self.config.routes.change.url
  });
};

exports.submitError = function (err) {
  this.emit('submitError', err);
  this.model.at(this.form).set('state', 'error');
  var redirect = this.model.get('errorredirect');
  if (redirect) DERBY.app.history.push(redirect);
};

exports.submitSuccess = function (data) {
  this.emit('submitSuccess', data);
  this.model.at(this.form).set('state', 'success');
  var redirect = this.model.get('successredirect');
  if (redirect) DERBY.app.history.push(redirect);
};

exports.validate = function (e, callback) {
  this.emit('validate', e);
  this._validatePassword (e, callback);
};

exports._validatePassword = function (e, callback) {
  var self = this;

  var result = function (err) {
    if (!err) {
      var $path = self.model.at(self.password).at('validation');
      $path.set('state', 'valid');
      $path.del('code');
    }
    if (callback) callback(err);
  };

  this._validatePasswordRequired(e, function (err) {
    if (err) return result(err);

    async.series([
      _.partial(_.bind(self._validatePasswordMaximumLength, self), e),
      _.partial(_.bind(self._validatePasswordMinimumLength, self), e)
    ], result);
  });
};

exports._validatePasswordMaximumLength = function (e, callback) {
  if (password.value.length <= this.config.validation.password.maximumLength) {
    return callback();
  }

  var $path = this.model.at(this.password).at('validation');
  $path.set('state', 'invalid');
  $path.set('code', '3');
  return callback('password too short');
};

exports._validatePasswordMinimumLength = function (e, callback) {
  if (password.value.length >= this.config.validation.password.minimumLength) {
    return callback();
  }

  var $path = this.model.at(this.password).at('validation');

  if (e.type === 'keyup') {
    $path.set('state', 'tolerated');
    $path.del('code');
  } else {
    $path.set('state', 'invalid');
    $path.set('code', '2');
  }

  return callback('password too long');
};

exports._validatePasswordRequired = function (e, callback) {
  if (password.value) return callback();
  var $path = this.model.at(this.password).at('validation');
  if (e.type === 'submit') {
    $path.set('state', 'invalid');
    $path.set('code', '1');
  } else {
    $path.set('state', 'default');
    $path.del('code');
  }
  callback(true);
};