module.exports = function (app, options) {
  return {
    init: require('./lib/init')(app, options),
    routes: require('./lib/routes')(app, options)
  }
};