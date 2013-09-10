var _ = require('lodash')
  , _s = require('underscore.string')
  , dotty = require('dotty')
  , fs = require('fs')
  , passport = require('passport')
  , traverse = require('traverse');

module.exports = function (app, options) {
  options = _.merge(options || {}, {
    accessLevels: ['public', 'private', 'restricted'],
    clientConfig: {
      path: '$user',
      pick: ['accessLevels', 'defaultUser', 'routes', 'session', 'validation']
    },
    collectionName: 'users',
    keys: [],
    routes: {
      ajax: {
        userExists: {
          method: 'post',
          url: '/userExists'
        },
        passwordMatches: {
          method: 'post',
          url: '/passwordMatches'
        }
      },
      change: {
        method: 'post',
        url: '/change'
      },
      forgot: {
        method: 'post',
        token: {},
        url: '/forgot'
      },
      reset: {
        method: 'post',
        url: '/reset'
      },
      signIn: {
        method: 'post',
        url: '/signin'
      },
      signUp: {
        method: 'post',
        url: '/signup'
      },
      signOut: {
        method: 'post',
        url: '/signout'
      }
    },
    schema: {
      private: {
        local: {
          email: {
            default: null,
            key: true,
            maximumLength: 100,
            minimumLength: 6,
            type: 'email'
            //verify: 'private.local.emailVerified'
          },
          password: {
            default: null,
            hash: {},
            maximumLength: 100,
            minimumLength: 6,
            type: 'password'
          }
        }
      },
      public: {
        local: {
          username: {
            allowedCharacters: /[a-zA-Z_-]/,
            default: null,
            key: true,
            maximumLength: 50,
            minimumLength: 6,
            type: 'username'
          }
        }
      }
    },
    session: {
      path: 'user'
    }
  });

  fs.readFile(__dirname + '/lib/callback.html', 'utf8', function (err, data) {
    if (err) return console.error(err);
    options.providers.callbackTemplate = _.template(data);
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

  _.defaults(options.routes.reset.token, {
    secretKey: options.secretKey
  });

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