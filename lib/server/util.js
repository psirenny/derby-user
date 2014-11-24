var bcrypt = require('bcrypt');

module.exports = function (options) {
  var fns = {};
  fns.hash = {};

  fns.hash.generate = function (req, userId, password, callback) {
    var rounds = options.hash.rounds;
    var hash = bcrypt.hashSync(password, rounds);
    callback(null, hash);
  };

  fns.hash.verify = function (req, userId, password, hash, callback) {
    var match = bcrypt.compareSync(password, hash);
    callback(null, match);
  };

  return fns;
};
