Derby User
==========

A user management system for [Derby JS](http://derbyjs.com).

Installation
------------

    $ npm install derby-user

In *"/lib/server/index.js"*

    var user = require('derby-user')(expressApp);

    expressApp
      // after cookieParser, session, racerBrowserChannel, modelMiddleware and bodyParser
      .use(user.init())
      // after app.router and expressApp.router
      .use(user.routes())