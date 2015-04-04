var _ = require('lodash');
var bodyParser = require('body-parser');
var credential = require('credential');
var events = require('events');
var express = require('express');
var moment = require('moment');
var Options = require('./options');
var passport = require('passport');
var qs = require('qs');

module.exports = function (opts) {
  var app = express();
  var options = Options(opts);

  app.use(bodyParser.json());

  app.post('/checkPassword', function (req, res, next) {
    var model = req.getModel();
    var userId = req.body.userId;
    var handle = (req.body.handle || '').trim();
    var $query = !~handle.indexOf('@') ?
      model.query('users', {'local.username': handle}) :
      model.query('users', {'local.emails.value': handle});

    if (userId) return next();
    if (!handle) return res.status(422).json({error: 'missing username or email'});

    $query.fetch(function (err) {
      if (err) return res.status(500).json({error: err});
      var user = $query.get()[0];
      if (!user) return res.status(404).json({error: 'not found'});
      req.body.userId = user.id;
      next();
    });
  });

  app.post('/checkPassword', function (req, res) {
    var model = req.getModel();
    var password = req.body.password;
    var userId = req.body.userId;
    var $user = model.at('users.' + userId);

    if (!userId) return res.status(422).json({error: 'missing user id'});
    if (!password) return res.status(422).json({error: 'missing password'});

    $user.fetch(function (err) {
      if (err) return res.status(500).json({error: err});
      if (!$user.get()) return res.status(404).json({error: 'user.exists'});
      var hashedPassword = $user.get('local.password.hash');
      options.hash.verify(req, userId, password, hashedPassword,
        function (err, valid) {
          if (err) return res.status(500).json({error: err});
          res.json({matches: valid});
        }
      );
    });
  });

  app.post('/changeEmail', function (req, res) {
    var model = req.getModel();
    var email = (req.body.email || '').trim();
    if (req.isUnauthenticated()) return res.status(401).json({error: 'not signed in'});
    var userId = req.user.id;
    var $user = model.at('users.' + userId);
    var $find = model.query('users', {'local.emails.value': email});

    if (!email) return res.status(422).json({error: 'missing email'});
    model.fetch($user, $find, function (err) {
      if (err) return res.status(500).json({error: err});
      var found = $find.get()[0];
      if (found) return res.status(409).json({error: 'email.exists'});
      var token = model.id();
      credential.hash(token, function (err, hashedToken) {
        if (err) return res.status(500).json({error: err});
        $user.set('local.emails.0.token.date', Date.now());
        $user.set('local.emails.0.token.hash', hashedToken);
        $user.set('local.emails.0.value', email);
        $user.set('local.emails.0.verified', false, function () {
          options.emitter.emit('user.changeEmail', req, {token: token, userId: userId});
          res.json(null);
        });
      });
    });
  });

  app.post('/changePassword', function (req, res, next) {
    var model = req.getModel();
    var currentPassword = req.body.currentPassword;
    var password = req.body.password;
    if (req.isUnauthenticated()) return res.status(401).json({error: 'not signed in'});
    var userId = req.user.id;
    var $user = model.at('users.' + userId);

    if (!currentPassword) return res.status(422).json({error: 'missing current password'});
    if (!password) return res.status(422).json({error: 'missing password'});

    $user.fetch(function (err) {
      if (err) return res.status(500).json({error: err});
      var hashedPassword = $user.get('local.password.hash');
      options.hash.verify(req, userId, currentPassword, hashedPassword,
        function (err, valid) {
          if (err) return next(err);
          if (!valid) return res.status(401).json({error: 'password.valid'});
          options.hash.generate(req, userId, password,
            function (err, hashedPassword) {
              if (err) return res.status(500).json({error: err});
              $user.set('local.password.hash', hashedPassword, function () {
                res.json(null);
              });
            }
          );
        }
      );
    });
  });

  app.post('/changeUsername', function (req, res) {
    var model = req.getModel();
    var username = (req.body.username || '').trim();
    if (req.isUnauthenticated()) return res.status(401).json({error: 'not signed in'});
    var userId = req.user.id;
    var $query = model.query('users', {'local.username': username});
    var $user = model.at('users.' + userId);

    if (!username) return res.status(422).json({error: 'missing username'});

    model.fetch($user, $query, function (err) {
      if (err) return res.status(500).json({error: err});
      var user = $query.get()[0];
      if (user) return res.status(409).json({error: 'username.exists'});
      $user.set('local.username', username, function () {
        res.json(null);
      });
    });
  });

  app.get('/confirmEmail', function (req, res) {
    var model = req.getModel();
    if (req.isUnauthenticated()) return res.status(401).json({error: 'not signed in'});
    var userId = req.user.id;
    var $user = model.at('users.' + userId);

    $user.fetch(function (err) {
      if (err) return res.status(500).json({error: err});
      var token = model.id();
      credential.hash(token, function (err, hashedToken) {
        if (err) return res.status(500).json({error: err});
        $user.set('local.emails.0.token.date', Date.now());
        $user.set('local.emails.0.token.hash', hashedToken, function () {
          options.emitter.emit('user.sendConfirmEmail', req, {token: token, userId: userId});
          res.json(null);
        });
      });
    });
  });

  app.post('/confirmEmail', function (req, res) {
    var model = req.getModel();
    var token = req.body.token;
    if (req.isUnauthenticated()) return res.status(401).json({error: 'not signed in'});
    var userId = req.user.id;
    var $user = model.at('users.' + userId);
    if (!token) return res.status(422).json({error: 'missing token'});

    $user.fetch(function (err) {
      if (err) return res.status(500).json({error: err});
      var elapsed = moment().diff($user.get('local.emails.0.token.date'));
      if (elapsed > options.tokenDuration) return res.status(401).json({error: 'token expired'});
      var hashedToken = $user.get('local.emails.0.token.hash');
      credential.verify(hashedToken, token, function (err, valid) {
        if (err) return res.status(500).json({error: err});
        if (!valid) return res.status(401).json({error: 'token.valid'});
        $user.del('local.emails.0.token');
        $user.set('local.emails.0.verified', true, function () {
          options.emitter.emit('user.confirmEmail', req, {token: token, userId: userId});
          res.json(null);
        });
      });
    });
  });

  app.get('/confirmEmail/:id/:token', function (req, res, next) {
    var model = req.getModel();
    var token = req.params.token;
    var userId = req.params.id;
    var url = req.baseUrl + '/confirmedEmail/' + userId + '/' + token;
    var $user = model.at('users.' + userId);

    $user.fetch(function (err) {
      if (err) return next(err);
      if ($user.get('local.emails.0.verified')) return res.redirect(url + '?' + qs.stringify({state: {code: 200, msg: 'email.verified'}}));
      var elapsed = moment().diff($user.get('local.emails.0.token.date'));
      if (elapsed > options.tokenDuration) return res.redirect(url + '?' + qs.stringify({error: {code: 401, msg: 'token.expired'}}));
      var hashedToken = $user.get('local.emails.0.token.hash');
      if (!hashedToken) return res.redirect(url + '?' + qs.stringify({error: {code: 401, msg: 'token.invalid'}}));
      credential.verify(hashedToken, token, function (err, valid) {
        if (err) return next(err);
        if (!valid) return res.redirect(url + '?' + qs.stringify({error: {code: 401, msg: 'token.invalid'}}));
        $user.del('local.emails.0.token');
        $user.set('local.emails.0.verified', true, function () {
          res.redirect(url);
        });
      });
    });
  });

  app.get('/confirmedEmail/:id/:token', function (req, res) {
    // override this route to change the redirect
    res.redirect('/');
  });

  app.post('/forgotPassword', function (req, res) {
    var model = req.getModel();
    var handle = (req.body.handle || '').trim();
    var $query = !~handle.indexOf('@') ?
      model.query('users', {'local.username': handle}) :
      model.query('users', {'local.emails.value': handle});

    if (!handle) return res.status(422).json({path: 'handle.required'});

    $query.fetch(function (err) {
      if (err) return res.status(500).json({error: err});
      var user = $query.get()[0];
      if (!user) return res.status(404).json({path: 'handle.found'});
      var $user = model.at('users.' + user.id);
      $user.fetch(function (err) {
        if (err) return res.status(500).json({error: err});
        var token = model.id();
        credential.hash(token, function (err, hashedToken) {
          if (err) return res.status(500).json({error: err});
          $user.set('local.password.token.date', Date.now());
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

    if (!token) return res.status(422).json({path: 'token.required'});
    if (!userId) return res.status(422).json({path: 'userId.required'});
    if (!password) return res.status(422).json({path: 'password.required'});

    $user.fetch(function (err) {
      if (err) return res.status(500).json({error: err});
      var elapsed = moment().diff($user.get('local.password.token.date'));
      if (elapsed > options.tokenDuration) return res.status(401).json({path: 'token.expired'});
      var hashedToken = $user.get('local.password.token.hash');
      if (!hashedToken) return res.status(401).json({path: 'token.missing'});
      credential.verify(hashedToken, token, function (err, valid) {
        if (err) return res.status(500).json({error: err});
        if (!valid) return res.status(401).json({path: 'token.invalid'});
        options.hash.generate(req, userId, password,
          function (err, hashedPassword) {
            if (err) return res.status(500).json({error: err});
            $user.del('local.password.token');
            $user.set('local.password.hash', hashedPassword, function () {
              res.json(null);
            });
          }
        );
      });
    });
  });

  app.get('/session', function (req, res) {
    if (req.isAuthenticated()) return res.json({user: req.user});
    var model = req.getModel();
    var user = {created: Date.now(), id: model.id()};
    model.add('users', user, function (err) {
      if (err) return done(err);
      req.login(user, function (err) {
        if (err) return next(err);
        model.add('users', {id: user.id});
        model.add('users', {id: user.id, created: Date.now()});
        res.status(201).json({user: user});
      });
    });
  });

  app.post('/signin', function (req, res, next) {
    passport.authenticate('local', function (err, user, info) {
      if (!req.body.handle) return res.status(422).json({error: 'handle.required'});
      if (!req.body.password) return res.status(422).json({error: 'password.required'});
      if (err) return res.status(500).json({error: err});
      if (info && info.path === 'handle.required') return res.status(422).json({error: err.path});
      if (info && info.path === 'password.required') return res.status(422).json({error: err.path});
      if (!user) return res.status(404).json({error: 'not found'});
      if (info) return res.status(401).json(info);
      req.login(user, function (err) {
        if (err) return res.status(500).json({error: 'failed'});
        res.json({user: user});
      });
    })(req, res, next);
  });

  app.get('/signout', function (req, res, next) {
    req.duser.signout(req, function (err) {
      var url = req.baseUrl + '/signedout';
      if (err) return res.redirect(url + '?' + qs.stringify(err));
      res.redirect(url);
    });
  });

  app.get('/signedout', function (req, res) {
    // override this route to change the default redirect
    res.redirect('/');
  });

  app.post('/signout', function (req, res) {
    req.duser.signout(req, function (err, obj) {
      if (err) return res.status(500).json(err);
      if (options.autoGenerate) res.status(201);
      res.json(obj);
    });
  });

  app.post('/signup', function (req, res) {
    var model = req.getModel();
    var email = (req.body.email || '').trim();
    var password = req.body.password || '';
    var username = (req.body.username || '').trim();
    var query = {$or: []};
    query.$or.push({'local.username': username});
    query.$or.push({'local.emails.value': email});
    var $user = model.query('users', query);

    if (!email) return res.status(422).json({error: 'email required'});
    if (!password) return res.status(422).json({error: 'password required'});
    if (!username) return res.status(422).json({error: 'username required'});

    $user.fetch(function (err) {
      if (err) return res.status(500).json({error: err});
      var user = $user.get()[0] || {};
      _.defaults(user, {local: {emails: [{value: ''}], username: ''}});
      if (user.local.username === username) return res.status(409).json({error: 'username exists'});
      if (user.local.emails[0].value === email) return res.status(409).json({error: 'email exists'});
      var token = model.id();
      credential.hash(token, function (err, hashedToken) {
        if (err) return res.status(500).json({error: err});
        options.hash.generate(req, null, password,
          function (err, hashedPassword) {
            if (err) return res.status(500).json({error: err});
            user = {};
            user.registered = Date.now();
            user.local = {};
            user.local.username = username;
            user.local.emails = [{}];
            user.local.emails[0].token = {};
            user.local.emails[0].token.date = Date.now();
            user.local.emails[0].token.hash = hashedToken;
            user.local.emails[0].value = email;
            user.local.emails[0].verified = false;
            user.local.password = {};
            user.local.password.hash = hashedPassword;

            function end() {
              options.emitter.emit('user.signup', req, {token: token, userId: user.id});
              res.json({user: {id: user.id}});
            }

            if (!req.user) {
              user.created = Date.now();
              user.id = model.id();
              return model.add('users', user, function (err) {
                if (err) return res.status(500).json({error: err});
                req.login(user, function (err) {
                  if (err) return res.status(500).json({error: 'failed'});
                  res.status(201);
                  end();
                });
              });
            }

            $user = model.at('users.' + req.user.id);
            $user.fetch(function (err) {
              if (err) return done(err);
              user = _.merge({}, $user.get(), user);
              $user.setDiffDeep('', user, end);
            });
          }
        );
      });
    });
  });

  return app;
};
