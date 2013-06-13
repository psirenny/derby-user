var config = {
  filename: __filename,
  ns: 'user',
  scripts: {
    change: require('./change'),
    forgot: require('./forgot'),
    reset: require('./reset'),
    signin: require('./signin'),
    signout: require('./signout'),
    signup: require('./signup')
  }
};

module.exports = function (app, options) {
  app.createLibrary(config, options);
};