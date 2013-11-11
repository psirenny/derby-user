var passport = require('passport')
  , passwordHash = require('password-hash')
  , LocalStrategy = require('passport-local').Strategy;

module.exports = function (app, options) {
  return {
    init: function () {
      passport.serializeUser(function(user, done) {
        done(null, user.id);
      });

      passport.deserializeUser(function(userId, done) {
        done(null, {id: userId});
      });

      passport.use(new LocalStrategy(
        {passReqToCallback: true, usernameField: 'usernameOrEmail'},
        function(req, usernameOrEmail, password, done) {
          var model = req.getModel();
          var $query = !~usernameOrEmail.indexOf('@')
            ? model.query('usersPublic', {'local.username': usernameOrEmail})
            : model.query('usersPrivate', {'local.email': usernameOrEmail});

          model.fetch($query, function (err) {
            if (err) return done(err);
            var user = $query.get()[0];
            if (!user) return done(null, false, {error: 'not found'});
            var $private = model.at('usersPrivate.' + user.id);
            $private.fetch(function (err) {
              if (err) return done(err);
              if (passwordHash.verify(password, $private.get('local.hashedPassword'))) return done(null, {id: user.id});
              done(null, false, {error: 'invalid password'});
            });
          });
        }
      ));

      app.use(passport.initialize());
      app.use(passport.session());

      return function (req, res, next) {
        if (req.headers['phonegap']) return next();

        var model = req.getModel()
          , userId = req.session.user && req.session.user.id;

        if (!userId) {
          userId = model.id();
          model.add('usersPrivate', {id: userId});
          model.add('usersPublic', {id: userId, created: new Date(), isRegistered: false});
          req.session.user = {id: userId};
        }

        model.set('_session.user.id', userId);
        next();
      };
    },
    routes: function () {
      app.post('/user/changeEmail', function (req, res) {
        var model = req.getModel()
          , email = req.body.email
          , userId = model.get('_session.user.id')
          , $query = model.query('usersPrivate', {'local.email': email})
          , $private = model.at('usersPrivate.' + userId);

        if (!userId) return res.send(400, {error: 'not signed in'});
        if (!email) return res.send(400, {error: 'missing email'});

        model.fetch($private, $query, function (err) {
          if (err) return res.send(500, {error: err});
          var user = $query.get()[0];
          if (user && user.id !== userId) return res.send(400, {error: 'email in use'});
          $private.set('local.email', email);
          res.send();
        });
      });

      app.post('/user/changePassword', function (req, res) {
        var model = req.getModel()
          , password = req.body.password
          , confirmPassword = req.body.confirmPassword || password
          , userId = model.get('_session.user.id')
          , $private = model.at('usersPrivate.' + userId);

        if (!userId) return res.send(400, {error: 'not signed in'});
        if (!password) return res.send(400, {error: 'missing password'});
        if (password !== confirmPassword) return res.send(400, {error: 'passwords do not match'});

        $private.fetch(function (err) {
          if (err) return res.send(500, {error: err});
          $private.set('local.hashedPassword', passwordHash.generate(password, options.password));
          res.send();
        });
      });

      app.post('/user/changeUsername', function (req, res) {
        console.log(1);

        var model = req.getModel()
          , username = req.body.username
          , userId = model.get('_session.user.id')
          , $query = model.query('usersPublic', {'local.username': username})
          , $public = model.at('usersPublic.' + userId);

        console.log(2);
        if (!userId) return res.send(400, {error: 'not signed in'});
        if (!username) return res.send(400, {error: 'missing username'});
        console.log(3);

        model.fetch($public, $query, function (err) {
          if (err) return res.send(500, {error: err});
          var user = $query.get()[0];
          if (user && user.id !== userId) return res.send(400, {error: 'username in use'});
          $public.set('local.username', username);
          res.send();
        });
      });

      app.post('/user/signin', function (req, res, next) {
        passport.authenticate('local', function (err, user, info) {
          if (err) return res.send(500, {error: err});
          if (info) return res.send(400, info);
          if (!user) return res.send(404, {error: 'not found'});
          req.session.user.id = user.id;
          res.send({user: user});
        })(req, res, next);
      });

      app.post('/user/signout', function (req, res) {
        var model = req.getModel()
          , userId = model.get('_session.user.id')
          , $public = model.at('usersPublic.' + userId);

        $public.fetch(function (err) {
          if (err) return res.send(500, {error: err});
          if (!$public.get('isRegistered')) return res.send(400, {error: 'not signed in', id: 1});
          var userId = model.id();
          model.add('usersPublic', {created: new Date(), id: userId, isRegistered: false});
          model.add('usersPrivate', {id: userId});
          model.add('usersRestricted', {id: userId});
          model.set('_session.user', {id: userId, isRegistered: false});
          req.session.user.id = userId;
          return res.send({user: {id: userId}});
        });
      });

      app.post('/user/signup', function (req, res) {
        var model = req.getModel()
          , email = req.body.email
          , password = req.body.password
          , username = req.body.username
          , userId = model.get('_session.user.id')
          , $public = model.at('usersPublic.' + userId)
          , $private = model.at('usersPrivate.' + userId)
          , $query1 = model.query('usersPublic', {local: {username: username}})
          , $query2 = model.query('usersPrivate', {local: {email: email}});

        if (!email) return res.send(400, {error: 'missing email', id: 1});
        if (!password) return res.send(400, {error: 'missing password', id: 2});
        if (!username) return res.send(400, {error: 'missing username', id: 3});

        model.fetch($query1, $query2, $public, $private,
          function (err) {
            if (err) return res.send(500, {error: err});
            if ($query1.get()[0] || $query2.get()[0]) return res.send(400, {error: 'user exists', id: 4});
            if ($public.get('isRegistered')) return res.send(400, {error: 'already registered', id: 5});
            $public.set('isRegistered', true);
            $public.set('joined', new Date());
            $public.set('local.username', username);
            $private.set('local.email', email);
            $private.set('local.hashedPassword', passwordHash.generate(password, options.password));
            res.send();
          }
        );
      });

      return function (req, res, next) {
        next();
      };
    }
  }
};