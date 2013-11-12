var passport = require('passport')
  , passwordHash = require('password-hash');

module.exports = function (app, options) {
  return function () {
    app.post('/user/changeEmail', function (req, res) {
      var model = req.getModel()
        , email = req.body.email
        , userId = model.get('_session.user.id')
        , $query = model.query('usersPrivate', {'local.emails.value': email})
        , $private = model.at('usersPrivate.' + userId);

      if (!userId) return res.send(400, {error: 'not signed in'});
      if (!email) return res.send(400, {error: 'missing email'});

      model.fetch($private, $query, function (err) {
        if (err) return res.send(500, {error: err});
        var user = $query.get()[0];
        if (user && user.id !== userId) return res.send(400, {error: 'email in use'});
        $private.set('local.emails.0.value', email);
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
      var model = req.getModel()
        , username = req.body.username
        , userId = model.get('_session.user.id')
        , $query = model.query('usersPublic', {'local.username': username})
        , $public = model.at('usersPublic.' + userId);

      if (!userId) return res.send(400, {error: 'not signed in'});
      if (!username) return res.send(400, {error: 'missing username'});

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
        if (!$public.get('isRegistered')) return res.send(400, {error: 'not signed in'});
        var userId = model.id();
        model.add('usersPublic', {created: new Date(), id: userId, isRegistered: false});
        model.add('usersPrivate', {id: userId});
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
        , $query1 = model.query('usersPublic', {'local.username': username})
        , $query2 = model.query('usersPrivate', {'local.emails.value': email});

      if (!email) return res.send(400, {error: 'missing email'});
      if (!password) return res.send(400, {error: 'missing password'});
      if (!username) return res.send(400, {error: 'missing username'});

      model.fetch($query1, $query2, $public, $private,
        function (err) {
          if (err) return res.send(500, {error: err});
          if ($query1.get()[0] || $query2.get()[0]) return res.send(400, {error: 'user exists'});
          if ($public.get('isRegistered')) return res.send(400, {error: 'already registered'});
          $public.set('isRegistered', true);
          $public.set('joined', new Date());
          $public.set('local.username', username);
          $private.set('local.emails.0.value', email);
          $private.set('local.hashedPassword', passwordHash.generate(password, options.password));
          res.send();
        }
      );
    });

    return function (req, res, next) {
      next();
    };
  }
};