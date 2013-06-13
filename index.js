var _ = require('lodash')
  , _s = require('underscore.string')
  , dotty = require('dotty')
  , passport = require('passport')
  , traverse = require('traverse');

module.exports = function (app, options) {
  options = _.merge(options || {}, {
    accessLevels: ['public', 'private'],
    clientConfig: {
      path: '$user',
      pick: ['accessLevels', 'routes', 'session', 'validation']
    },
    collectionName: 'users',
    keys: [],
    providers: {
      schema: {
        'public': ['_json.picture', 'displayName', 'photos', 'username'],
        'private': '*'
      },
      strategies: {},
      path: 'providers'
    },
    routes: {
      change: {
        url: '/change'
      },
      forgot: {
        token: {},
        url: '/forgot'
      },
      reset: {
        url: '/reset'
      },
      signIn: {
        url: '/signin'
      },
      signUp: {
        url: '/signup'
      },
      signOut: {
        url: '/signout'
      }
    },
    schema: {
      private: {
        local: {
          email: {
            default: null,
            key: true,
            verify: 'private.local.emailVerified'
          },
          password: {
            default: null,
            hash: {},
            type: 'password'
          },
          phone: {
            default: null,
            key: true,
            type: 'phone',
            verify: 'private.local.phoneVerified'
          }
        }
      },
      public: {
        local: {
          username: {
            default: null,
            key: true
          }
        }
      }
    },
    session: {
      idPath: 'user.id',
      isRegisteredPath: 'user.isRegistered'
    }
  });

  // retrieve user keys from schema
  traverse(options.schema).forEach(function (x) {
    if (this.isLeaf && this.key === 'key' && x) {
      options.keys.push(this.parent.path.join('.'));
    }
  });

  options.keys = _.uniq(options.keys);

  // create user skeleton from schema
  if (!options.skeleton) {
    options.skeleton = traverse(options.schema).map(function (x) {
      if (this.isLeaf && this.key === 'default') {
        if (_.isNull(x) || _.isUndefined(x)) return this.parent.remove();
        this.parent.update(x);
      }
    });
  }

  if (!options.secretKey) {
    throw 'must provide a secretKey';
  }

  if (!options.accessLevels) {
    options.accessLevels = [''];
  }

  _.each(options.accessLevels, function (lvl) {
    var schema = options.providers.schema;
    if (!schema[lvl]) schema[lvl] = [];
    if (_.isString(schema[lvl])) schema[lvl] = [schema[lvl]];
  });

  _.each(options.providers.strategies, function (strategy, name) {
    _.merge(strategy, {
      callback: {
        popup: true,
        url: '/auth/' + name + '/callback'
      },
      config: {},
      module: 'passport-' + name,
      name: 'Strategy',
      options: {
        url: '/auth/' + name
      },
      verify: function (callback) {
        return function () {
          var req = arguments[0]
            , profile = _.last(arguments, 2)[0]
            , profileId = arguments.length === 4 ? arguments[1] : profile.id
            , done = _.last(arguments);

          callback(req, profileId, profile, done);
        };
      }
    }, _.defaults);

    strategy.config.passReqToCallback = true;
  });

  _.defaults(options.routes.reset.token, {secretKey: options.secretKey});

  return {
    init: function () {
      var init = require('./lib/init');
      return init(app, options);
    },
    routes: function () {
      var routes = require('./lib/routes');
      return routes(app, options);
    }
  }
};