 var _ = require('lodash')
  , _s = require('underscore.string')
  , dotty = require('dotty')
  , passwordHash = require('password-hash')
  , traverse = require('traverse');

 module.exports = function (options) {
  return {
    getUserCollection: function (lvl) {
      if (!lvl) lvl = options.accessLevels[0];
      return options.collectionName + _s.capitalize(lvl);
    },
    parseBody: function (obj) {
      var body = {};

      _.each(obj, function (val, keys) {
        keys = keys.replace(' ', '').split(',');
        _.each(keys, function (key) {
          dotty.put(body, key, val);
        });
      });

      return body;
    },
    parseBodyKeys: function (obj) {
      var allKeys = [];

      _.each(obj, function (val, keys) {
        allKeys.push(keys.replace(' ', '').split(','));
      });

      return _(allKeys).flatten().uniq().value();
    },
    schemify: function (user) {
      traverse(options.schema).forEach(function (x) {
        if (!this.isLeaf || this.key !== 'type') return;

        switch (x) {
          case 'password':
            var path = this.parent.path.join('.')
              , pass = dotty.get(user, path)
              , hash = dotty.get(options.schema, path + '.hash');

            if (hash) dotty.put(user, path, passwordHash.generate(pass, hash));
            break;
        }
      });

      return user;
    },
    userContainsType: function (user, type) {
      var found;

      traverse(user).forEach(function (x) {
        if (!this.isLeaf) return;
        var path = this.path.join('.') + '.type';
        if (dotty.get(options.schema, path)) found = true;
      });

      return found;
    }
  };
};