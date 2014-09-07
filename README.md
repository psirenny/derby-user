Derby User
==========

A user library for [Derby JS](http://derbyjs.com).
It uses [Passport](http://passportjs.org) for authentication
and [Credential](https://github.com/dilvie/credential) for storing hashes.

Installation
------------

    $ npm install derby-user --save

Sever Usage
-----------

In your server file, add the middleware:

    var user = require('derby-user');

    expressApp
      // ...
      // ...
      // cookieParser, session, transport, model, bodyParser...
      .use(user.init(expressApp))
      // ...
      // ...
      // app.router, expressApp.router
      .use(user.routes(expressApp))

App Usage
---------

Example route:

    // subscribe to current user in each route
    app.get('*', function (page, model) {
      var userId = model.get('_session.user.id');
      var user = model.at('users.' + userId);
      model.subscribe(user, function (err) {
        if (err) return next(err);
        model.ref('_page.user', user);
        next();
      });
    });

Example signin controller function:

    app.proto.signin = function (username, password) {
      var model = this.model;
      $.post('/user/signin', {
        username: username,
        password: password
      }).done(function (data) {
        model.set('_session.user.id', data.user.id);
        app.history.push('/');
      });
    };

Example signin view:

    <form on-submit="signin(username, password)">
      <label>username</label>
      <input type="text" value="{username}">
      <label>password</label>
      <input type="password" value="{password}">
    </form>
