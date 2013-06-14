 var _ = require('lodash')
  , _s = require('underscore.string')
  , dotty = require('dotty')
  , passwordHash = require('password-hash')
  , traverse = require('traverse');

 module.exports = function (options) {
  return _.bindAll({
    createUser: function (req, user) {
      var model = req.getModel()
        , _this = this;

      user.createDate = new Date();
      _.each(options.accessLevels, function (lvl) {
        model.add(_this.getUserCollection(lvl), user);
      });
    },
    getUserCollection: function (key) {
      key = key ? key.split('.').shift() : options.accessLevels[0];
      return options.collectionName + _s.capitalize(key);
    },
    getUserPath: function (key) {
      return _(key.split('.')).rest().join('.');
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
    saveUserSession: function (req, user) {
      var model = req.getModel();
      dotty.put(req.session, options.session.path + '.id', user.id);
      dotty.put(req.session, options.session.path + '.registered', user.registered);
      model.set('_session.' + options.session.path + '.registered', user.registered);
      model.set('_session.' + options.session.path + '.id', user.id);
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
    sendError: function (res, code, err) {
      console.error(err);
      res.send(code, {error: err});
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
  });
};