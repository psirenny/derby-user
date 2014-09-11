var bodyParser = require('body-parser');
var credential = require('credential');
var events = require('events');
var express = require('express');
var merge = require('merge');
var moment = require('moment');
var passport = require('passport');
var app = express();

module.exports = function (options) {
  var oneDay = moment.duration(1, 'days');
  var defaults = {
    emitter: new events.EventEmitter(),
    tokenDuration: oneDay.asMilliseconds()
  };

  options = merge(defaults, options);

  app.use(bodyParser.json());

  app.post('/checkPassword', function (req, res, next) {
    var model = req.getModel();
    var userId = req.body.userId;
    var usernameOrEmail = (req.body.usernameOrEmail || '').trim();
    var $query = !~usernameOrEmail.indexOf('@') ?
      model.query('users', {'local.username': usernameOrEmail}) :
      model.query('users', {'local.emails.0.value': usernameOrEmail});

    if (userId) return next();
    if (!usernameOrEmail) return res.status(400).json({error: 'missing username or email'});

    $query.fetch(function (err) {
      if (err) return res.status(500).json({error: err});
      var user = $query.get()[0];
      if (!user) return res.json({error: 'not found'});
      req.body.userId = user.id;
      next();
    });
  });

  app.post('/checkPassword', function (req, res) {
    var model = req.getModel();
    var password = req.body.password;
    var userId = req.body.userId;
    var $user = model.at('users.' + userId);

    if (!userId) return res.status(400).json({error: 'missing user id'});
    if (!password) return res.status(400).json({error: 'missing password'});

    $user.fetch(function (err) {
      if (err) return res.status(500).json({error: err});
      var hashedPassword = $user.get('local.password.hash');
      credential.verify(hashedPassword, password, function (err, valid) {
        if (err) return res.json({error: err});
        if (!valid) return res.json({error: 'invalid password'});
        res.json(null);
      });
    });
  });

  app.post('/changeEmail', function (req, res) {
    var model = req.getModel();
    var email = (req.body.email || '').trim();
    var userId = req.user.id;
    var $query = model.query('usersReserved', {'local.email': email});
    var $user = model.at('users.' + userId);

    if (!userId) return res.status(400).json({error: 'not signed in'});
    if (!email) return res.status(400).json({error: 'missing email'});

    model.fetch($user, $query, function (err) {
      if (err) return res.status(500).json({error: err});
      var reserved = $query.get()[0];
      if (reserved) return res.status(400).json({error: 'email in use'});
      var token = model.id();
      credential.hash(token, function (err, hashedToken) {
        if (err) return res.status(500).json({error: err});
        var oldEmail = $user.get('local.emails.0.value');
        $user.set('local.emails.0.token.date', new Date());
        $user.set('local.emails.0.token.hash', hashedToken);
        $user.set('local.emails.0.value', email);
        $user.set('local.emails.0.verified', false, function () {
          options.emitter.emit('user.changeEmail', req, {token: token, userId: userId});
        });
        if (!oldEmail) return res.json(null);
        $query = model.query('usersReserved', {'local.email': oldEmail});
        $query.fetch(function (err) {
          if (err) return res.data(500, {error: err});
          reserved = $query.get()[0];
          if (!reserved) return res.json(null);
          var $reserved = model.at('usersReserved.' + reserved.id);
          $reserved.fetch(function (err) {
            if (err) return res.status(500).json({error: err});
            $reserved.set('local.email', email);
          });
        });
      });
    });
  });

  app.post('/changePassword', function (req, res) {
    var model = req.getModel();
    var currentPassword = req.body.currentPassword;
    var password = req.body.password;
    var userId = req.user.id;
    var $user = model.at('users.' + userId);

    if (!userId) return res.status(400).json({error: 'not signed in'});
    if (!currentPassword) return res.status(400).json({error: 'missing current password'});
    if (!password) return res.status(400).json({error: 'missing password'});

    $user.fetch(function (err) {
      if (err) return res.status(500).json({error: err});
      var hashedPassword = $user.get('local.password.hash');
      credential.verify(hashedPassword, password, function (err, valid) {
        if (err) return done(err);
        if (!valid) return done(null, false, {error: 'invalid current password'});
        credential.hash(password, function (err, hashedPassword) {
          if (err) return res.status(500).json({error: err});
          $user.set('local.password.hash', hashedPassword, function () {
            res.json(null);
          });
        });
      });
    });
  });

  app.post('/changeUsername', function (req, res) {
    var model = req.getModel();
    var username = (req.body.username || '').trim();
    var userId = req.user.id;
    var $query = model.query('users', {id: {$ne: userId}, 'local.username': username});
    var $user = model.at('users.' + userId);

    if (!userId) return res.status(400).json({error: 'not signed in'});
    if (!username) return res.status(400).json({error: 'missing username'});

    model.fetch($user, $query, function (err) {
      if (err) return res.status(500).json({error: err});
      var user = $query.get()[0];
      if (user) return res.status(400).json({error: 'username in use'});
      $user.set('local.username', username, function () {
        res.json(null);
      });
    });
  });

  app.get('/:id/confirmEmail/:token', function (req, res, next) {
    var model = req.getModel();
    var token = req.params.token;
    var userId = req.params.id;
    var $user = model.at('users.' + userId);

    if (!userId) return next('not signed in');
    if (!token) return next('missing token');

    $user.fetch(function (err) {
      if (err) return next(err);
      var elapsed = moment().diff($user.get('local.emails.0.token.date'));
      if (elapsed > options.tokenDuration) return next('token expired');
      var hashedToken = $user.get('local.emails.0.token.hash');
      credential.verify(hashedToken, token, function (err, valid) {
        if (err) return next(err);
        if (!valid) return next('invalid token');
        $user.del('local.emails.0.token');
        $user.set('local.emails.0.verified', true, function () {
          res.redirect('/confirmedEmail');
        });
      });
    });
  });

  app.get('/confirmedEmail', function (req, res) {
    res.redirect('/');
  });

  app.post('/confirmEmail', function (req, res) {
    var model = req.getModel();
    var token = req.body.token;
    var userId = req.user.id;
    var $user = model.at('users.' + userId);

    if (!userId) return res.status(400).json({error: 'not signed in'});
    if (!token) return res.status(400).json({error: 'missing token'});

    $user.fetch(function (err) {
      if (err) return res.status(500).json({error: err});
      var elapsed = moment().diff($user.get('local.emails.0.token.date'));
      if (elapsed > options.tokenDuration) return res.status(400).json({error: 'token expired'});
      var hashedToken = $user.get('local.emails.0.token.hash');
      credential.verify(hashedToken, token, function (err, valid) {
        if (err) return res.status(500).json({error: err});
        $user.del('local.emails.0.token');
        $user.set('local.emails.0.verified', true, function () {
          res.json(null);
        });
      });
    });
  });

  app.post('/forgotPassword', function (req, res) {
    var model = req.getModel();
    var usernameOrEmail = (req.body.usernameOrEmail || '').trim();
    var $query = !~usernameOrEmail.indexOf('@') ?
      model.query('users', {'local.username': usernameOrEmail}) :
      model.query('users', {'local.emails.0.value': usernameOrEmail});

    if (!usernameOrEmail) return res.status(400).json({error: 'missing username or email'});

    $query.fetch(function (err) {
      if (err) return res.status(500).json({error: err});
      var user = $query.get()[0];
      if (!user) return res.status(400).json({error: 'not found'});
      var $user = model.at('users.' + user.id);
      $user.fetch(function (err) {
        if (err) return res.status(500).json({error: err});
        var token = model.id();
        credential.hash(token, function (err, hashedToken) {
          if (err) return res.status(500).json({error: err});
          $user.set('local.password.token.date', new Date());
          $user.set('local.password.token.hash', hashedToken, function () {
            options.emitter.emit('user.forgotPassword', req, {token: token, userId: user.id});
            res.json(null);
          });
        });
      });
    });
  });

  app.post('/resetPassword', function (req, res, next) {
    var model = req.getModel();
    var password = req.body.password;
    var token = req.body.token;
    var userId = req.body.userId;
    var $user = model.at('users.' + userId);

    if (!userId) return res.status(400).json({error: 'missing user id'});
    if (!password) return res.status(400).json({error: 'missing password'});

    $user.fetch(function (err) {
      if (err) return res.status(500).json({error: err});
      var elapsed = moment().diff($user.get('local.password.token.date'));
      if (elapsed > options.tokenDuration) return next('token expired');
      var hashedToken = $user.get('local.password.token.hash');
      credential.verify(hashedToken, token, function (err, valid) {
        if (err) return res.status(500).json({error: err});
        if (!valid) return res.status(400).json({error: 'invalid token'});
        credential.hash(password, function (err, hashedPassword) {
          if (err) return res.status(500).json({error: err});
          $user.del('local.password.token');
          $user.set('local.password.hash', hashedPassword, function () {
            res.json(null);
          });
        });
      });
    });
  });

  app.post('/sessionize', function (req, res) {
    if (req.isAuthenticated()) return res.json({user: req.user});
    var model = req.getModel();
    var user = {id: model.id()};
    req.login(user, function (err) {
      if (err) return next(err);
      model.add('users', {id: user.id});
      model.add('users', {id: user.id, created: new Date()});
      res.json({user: user});
    });
  });

  app.post('/signin', function (req, res, next) {
    passport.authenticate('local', function (err, user, info) {
      if (err) return res.status(500).json({error: err});
      if (info) return res.status(400).json(info);
      if (!user) return res.status(404).json({error: 'not found'});
      req.login(user, function(err) {
        if (err) return res.status(500).json({error: 'failed'});
        res.json({user: user});
      });
    })(req, res, next);
  });

  app.get('/signout', function (req, res, next) {
    req.duser.signout(req, next);
  });

  app.post('/signout', function (req, res) {
    req.duser.signout(req, function (err, obj) {
      if (err) return res.status(500).json(err);
      res.json(obj);
    });
  });

  app.post('/signup', function (req, res) {
    var model = req.getModel();
    var email = (req.body.email || '').trim();
    var password = req.body.password || '';
    var username = (req.body.username || '').trim();
    var userId = req.user.id;
    var $user = model.at('users.' + userId);
    var $query = model.query('users', {$or: [
      {'local.username': username},
      {'local.emails.value': email}
    ]});

    if (!email) return res.status(400).json({error: 'missing email'});
    if (!password) return res.status(400).json({error: 'missing password'});
    if (!username) return res.status(400).json({error: 'missing username'});

    model.fetch($query, $user,
      function (err) {
        if (err) return res.status(500).json({error: err});
        if ($query.get()[0]) return res.status(400).json({error: 'user exists'});
        if ($user.get('registered')) return res.status(400).json({error: 'already registered'});
        var token = model.id();
        credential.hash(token, function (err, hashedToken) {
          if (err) return res.status(500).json({error: err});
          credential.hash(password, function (err, hashedPassword) {
            if (err) return res.status(500).json({error: err});
            $user.set('registered', new Date());
            $user.set('local.username', username);
            $user.set('local.emails.0.token.date', new Date());
            $user.set('local.emails.0.token.hash', hashedToken);
            $user.set('local.emails.0.value', email);
            $user.set('local.emails.0.verified', false);
            $user.set('local.password.hash', hashedPassword);
            model.add('usersReserved', {local: {email: email}}, function () {
              options.emitter.emit('user.signup', req, {token: token, userId: userId});
              res.json(null);
            });
          });
        });
      }
    );
  });

  app.post('/verifyEmail', function (req, res) {
    var model = req.getModel();
    var email = (req.body.email || '').trim();
    var userId = req.user.id;
    var $query = model.query('users', {id: {$ne: userId}, 'local.emails.value': email});
    var $user = model.at('users.' + userId);

    if (!userId) return res.status(400).json({error: 'not signed in'});

    model.fetch($user, $query, function (err) {
      if (err) return res.status(500).json({error: err});
      var user = $query.get()[0];
      if (user) return res.status(400).json({error: 'email in use'});
      if (email) $user.set('local.emails.0.value', email);
      var token = model.id();
      credential.hash(token, function (err, hashedToken) {
        if (err) return res.status(500).json({error: err});
        $user.set('local.emails.0.token.date', new Date());
        $user.set('local.emails.0.token.hash', hashedToken, function () {
          options.emitter.emit('user.verifyEmail', req, {token: token, userId: userId});
          res.json(null);
        });
      });
    });
  });

  return app;
};
