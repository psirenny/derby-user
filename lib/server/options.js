var _ = require('lodash');
var events = require('events');
var moment = require('moment');
var Util = require('./util');

module.exports = function (opts) {
  var defaults = {};
  var options = {};
  var overrides = {};
  var util = Util(options);

  defaults.autoGenerate = true;
  defaults.config = {usernameField: 'usernameOrEmail'};
  defaults.emitter = new events.EventEmitter();
  defaults.hash = {rounds: 10};
  defaults.hash.generate = util.hash.generate;
  defaults.hash.verify = util.hash.verify;
  defaults.tokenDuration = moment.duration(1, 'days').asMilliseconds();

  // passReqToCallback must be true in order
  // to access the derby model on a request
  overrides.config = {passReqToCallback: true};

  return _.merge(options, defaults, opts, overrides);
};
