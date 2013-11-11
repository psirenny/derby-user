Derby User
==========

A user management system for [Derby JS](http://derbyjs.com).

Install
-------

	var user = require('derby-user')(expressApp);

	expressApp
		// after cookieParser, session, racerBrowserChannel, modelMiddleware and bodyParser
		.use(user.init())
		// after app.router and expressApp.router
		.use(user.routes())