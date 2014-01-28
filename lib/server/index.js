module.exports = function (app, options) {
  if (!options) options = {};
  return {
    init: require('./init')(app, options),
    routes: require('./routes')(app, options)
  };
};