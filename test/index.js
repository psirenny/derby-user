var _ = require('lodash');
var derby = require('derby');
var events = require('events');
var fixtures = require('./fixtures');
var lib = require('..');
var livedb = require('livedb-memory-mongo');
var request = require('supertest');
var should = require('chai').should();

describe('derby-user', function () {
  it('should be an object', function () {
    lib.should.be.an.Object;
  });

  describe('server', function () {
    var emitter = new events.EventEmitter();
    var store = derby.createStore({db: new livedb()});
    var opts1 = {emitter: emitter};
    var opts2 = {autoGenerate: false, emitter: emitter};
    var agent1 = null;
    var agent2 = null;
    var agent3 = null;

    it('should be an object', function () {
      lib.should.have.property('server');
      lib.server.should.be.an.Object;
    });

    before(function () {
      agent1 = request.agent(fixtures.app(lib, derby, store, opts1));
      agent2 = request.agent(fixtures.app(lib, derby, store, opts2));
    });

    describe('init', function () {
      it('should be a function', function () {
        lib.server.should.have.property('init');
        lib.server.init.should.be.a.Function;
      });

      it('should return an app', function () {
        lib.server.init().should.be.a.Function;
      });

      describe('GET *', function () {
        it('should create session', function (done) {
          agent1
            .get('/')
            .expect(200)
            .end(function (err, res) {
              if (err) return done(err);
              res.body.should.be.an.Object;
              res.body.should.have.property('_session');
              res.body._session.should.be.an.Object;
              res.body._session.should.have.property('user');
              res.body._session.user.should.be.an.Object;
              res.body._session.user.should.have.property('id');
              res.body._session.user.id.should.be.a.String;
              res.body._session.user.id.should.not.be.empty;
              var model = store.createModel();
              var $user = model.at('users.' + res.body._session.user.id);
              $user.fetch(function (err) {
                if (err) return done(err);
                var user = $user.get();
                (user === null).should.be.false;
                user.should.be.an.Object;
                user.should.have.property('id');
                user.id.should.be.a.String;
                user.id.should.not.be.empty;
                user.should.have.property('created');
                user.created.should.be.a.Number;
                user.created.should.be.above(0);
                done();
              });
            });
        });

        it('should NOT create session', function (done) {
          agent2
            .get('/')
            .expect(200)
            .end(function (err, res) {
              if (err) return done(err);
              res.body.should.be.an.Object;
              res.body.should.not.have.property('_session');
              done();
            });
        });
      });
    });

    describe('routes', function () {
      it('should be a function', function () {
        lib.server.should.have.property('routes');
        lib.server.routes.should.be.a.Function;
      });

      function reset() {
        store = derby.createStore({db: new livedb()});
        agent1 = request.agent(fixtures.app(lib, derby, store, opts1));
        agent2 = request.agent(fixtures.app(lib, derby, store, opts2));
        agent3 = request.agent(fixtures.app(lib, derby, store, opts2));
      }

      function setup(done) {
        reset();
        agent1
          .post('/user/signup')
          .send({username: 'user1'})
          .send({email: 'user1@email.com'})
          .send({password: 'pass'})
          .expect(200)
          .end(function (err) {
            if (err) return done(err);
            agent2
              .post('/user/signup')
              .send({username: 'user2'})
              .send({email: 'user2@email.com'})
              .send({password: 'pass'})
              .expect(201, done);
          });
      }

      describe('POST /signup', function () {
        before(reset);

        it('should require a username', function (done) {
          agent1
            .post('/user/signup')
            .send({email: 'user1@email.com'})
            .send({password: 'pass'})
            .expect(422)
            .expect({error: 'username required'}, done);
        });

        it('should require an email', function (done) {
          agent1
            .post('/user/signup')
            .send({username: 'user1'})
            .send({password: 'pass'})
            .expect(422)
            .expect({error: 'email required'}, done);
        });

        it('should require a password', function (done) {
          agent1
            .post('/user/signup')
            .send({username: 'user1'})
            .send({email: 'user1@email.com'})
            .expect(422)
            .expect({error: 'password required'}, done);
        });

        it('should register current user', function (done) {
          agent1
            .get('/')
            .end(function (err, res) {
              if (err) return done(err);
              var userId = res.body._session.user.id;
              agent1
                .post('/user/signup')
                .send({username: 'user1'})
                .send({email: 'user1@email.com'})
                .send({password: 'pass'})
                .expect(200)
                .end(function(err, res) {
                  if (err) return done(err);
                  var model = store.createModel();
                  var $user = model.at('users.' + userId);
                  res.body.should.have.property('user');
                  res.body.user.should.be.an.Object;
                  res.body.user.should.have.property('id');
                  res.body.user.id.should.be.a.String;
                  res.body.user.id.should.equal(userId);
                  $user.fetch(function (err) {
                    if (err) return done(err);
                    var user = $user.get();
                    (user === null).should.be.false;
                    user.should.be.an.Object;
                    user.should.have.property('id');
                    user.id.should.be.a.String;
                    user.id.should.not.be.empty;
                    user.should.have.property('created');
                    user.created.should.be.a.Number;
                    user.created.should.be.above(0);
                    user.should.have.property('local');
                    user.local.should.be.an.Object;
                    user.local.should.have.property('username');
                    user.local.username.should.be.a.String;
                    user.local.username.should.not.be.empty;
                    user.local.username.should.equal('user1');
                    user.local.should.have.property('emails');
                    user.local.emails.should.be.an.Array;
                    user.local.emails.should.not.be.empty;
                    user.local.emails[0].should.be.an.Object;
                    user.local.emails[0].should.have.property('value');
                    user.local.emails[0].value.should.be.a.String;
                    user.local.emails[0].value.should.not.be.empty;
                    user.local.emails[0].value.should.equal('user1@email.com');
                    user.local.emails[0].should.have.property('verified');
                    user.local.emails[0].verified.should.be.a.Boolean;
                    user.local.emails[0].verified.should.be.false;
                    user.local.should.have.property('password');
                    user.local.password.should.be.an.Object;
                    user.local.password.should.have.property('hash');
                    user.local.password.hash.should.be.a.String;
                    user.local.password.hash.should.not.be.empty;
                    done();
                  });
                });
            });
        });

        it('should reject username', function (done) {
          agent1
            .post('/user/signup')
            .send({username: 'user1'})
            .send({email: 'user2@email.com'})
            .send({password: 'pass'})
            .expect(409, done);
        });

        it('should reject email', function (done) {
          agent1
            .post('/user/signup')
            .send({username: 'user2'})
            .send({email: 'user1@email.com'})
            .send({password: 'pass'})
            .expect(409, done);
        });

        it('should register a new user', function (done) {
          agent2
            .post('/user/signup')
            .send({username: 'user2'})
            .send({email: 'user2@email.com'})
            .send({password: 'pass'})
            .expect(201)
            .end(function(err, res) {
              if (err) return done(err);
              res.body.should.have.property('user');
              res.body.user.should.be.an.Object;
              res.body.user.should.have.property('id');
              res.body.user.id.should.be.a.String;
              res.body.user.id.should.not.be.empty;
              var model = store.createModel();
              var $user = model.at('users.' + res.body.user.id);
              $user.fetch(function (err) {
                if (err) return done(err);
                var user = $user.get();
                (user === null).should.be.false;
                user.should.be.an.Object;
                user.should.have.property('id');
                user.id.should.be.a.String;
                user.id.should.not.be.empty;
                user.should.have.property('created');
                user.created.should.be.a.Number;
                user.created.should.be.above(0);
                user.should.have.property('local');
                user.local.should.be.an.Object;
                user.local.should.have.property('username');
                user.local.username.should.be.a.String;
                user.local.username.should.not.be.empty;
                user.local.username.should.equal('user2');
                user.local.should.have.property('emails');
                user.local.emails.should.be.an.Array;
                user.local.emails.should.not.be.empty;
                user.local.emails[0].should.be.an.Object;
                user.local.emails[0].should.have.property('value');
                user.local.emails[0].value.should.be.a.String;
                user.local.emails[0].value.should.not.be.empty;
                user.local.emails[0].value.should.equal('user2@email.com');
                user.local.emails[0].should.have.property('verified');
                user.local.emails[0].verified.should.be.a.Boolean;
                user.local.emails[0].verified.should.be.false;
                user.local.should.have.property('password');
                user.local.password.should.be.an.Object;
                user.local.password.should.have.property('hash');
                user.local.password.hash.should.be.a.String;
                user.local.password.hash.should.not.be.empty;
                agent2
                  .get('/')
                  .end(function (err, res) {
                    if (err) return done(err);
                    res.body.should.be.an.Object;
                    res.body.should.have.property('_session');
                    res.body._session.should.be.an.Object;
                    res.body._session.should.have.property('user');
                    res.body._session.user.should.be.an.Object;
                    res.body._session.user.should.have.property('id');
                    res.body._session.user.id.should.be.a.String;
                    res.body._session.user.id.should.not.be.empty;
                    res.body._session.user.id.should.equal(user.id);
                    done();
                  });
              });
            });
        });
      });

      describe('GET /signout', function () {
        before(setup);

        it('should reset session', function (done) {
          agent1
            .get('/user/signout')
            .expect(200)
            .end(function (err, res) {
              agent1
                .get('/')
                .expect(200)
                .end(function (err, res) {
                  if (err) return done(err);
                  res.body.should.be.an.Object;
                  res.body.should.have.property('_session');
                  res.body._session.should.be.an.Object;
                  res.body._session.should.have.property('user');
                  res.body._session.user.should.be.an.Object;
                  res.body._session.user.should.have.property('id');
                  res.body._session.user.id.should.be.a.String;
                  res.body._session.user.id.should.not.be.empty;
                  var model = store.createModel();
                  var $user = model.at('users.' + res.body._session.user.id);
                  $user.fetch(function (err) {
                    if (err) return done(err);
                    var user = $user.get();
                    (user === null).should.be.false;
                    user.should.be.an.Object;
                    user.should.have.property('id');
                    user.id.should.be.a.String;
                    user.id.should.not.be.empty;
                    user.should.have.property('created');
                    user.created.should.be.a.Number;
                    user.created.should.be.above(0);
                    done();
                  });
                });
            });
        });

        it('should clear session', function (done) {
          agent2
            .get('/user/signout')
            .expect(200)
            .end(function (err, res) {
              agent2
                .get('/')
                .expect(200)
                .end(function (err, res) {
                  if (err) return done(err);
                  res.body.should.be.an.Object;
                  res.body.should.not.have.property('_session');
                  done();
                });
            });
        });
      });

      describe('POST /signout', function () {
        before(setup);

        it('should reset session', function (done) {
          agent1
            .post('/user/signout')
            .expect(200)
            .end(function (err, res) {
              agent1
                .get('/')
                .expect(200)
                .end(function (err, res) {
                  if (err) return done(err);
                  res.body.should.be.an.Object;
                  res.body.should.have.property('_session');
                  res.body._session.should.be.an.Object;
                  res.body._session.should.have.property('user');
                  res.body._session.user.should.be.an.Object;
                  res.body._session.user.should.have.property('id');
                  res.body._session.user.id.should.be.a.String;
                  res.body._session.user.id.should.not.be.empty;
                  var model = store.createModel();
                  var $user = model.at('users.' + res.body._session.user.id);
                  $user.fetch(function (err) {
                    if (err) return done(err);
                    var user = $user.get();
                    (user === null).should.be.false;
                    user.should.be.an.Object;
                    user.should.have.property('id');
                    user.id.should.be.a.String;
                    user.id.should.not.be.empty;
                    user.should.have.property('created');
                    user.created.should.be.a.Number;
                    user.created.should.be.above(0);
                    done();
                  });
                });
            });
        });

        it('should clear session', function (done) {
          agent2
            .post('/user/signout')
            .expect(200)
            .end(function (err, res) {
              agent2
                .get('/')
                .expect(200)
                .end(function (err, res) {
                  if (err) return done(err);
                  res.body.should.be.an.Object;
                  res.body.should.not.have.property('_session');
                  done();
                });
            });
        });
      });

      describe('POST /signin', function () {
        before(setup);

        it('should sign in with username', function (done) {
          agent1
            .post('/user/signin')
            .send({usernameOrEmail: 'user1'})
            .send({password: 'pass'})
            .expect(200)
            .end(function (err, res) {
              if (err) return done(err);
              res.body.should.be.an.Object;
              res.body.should.have.property('user');
              res.body.user.should.be.an.Object;
              res.body.user.should.have.property('id');
              res.body.user.id.should.be.a.String;
              res.body.user.id.should.not.be.empty;
              var userId = res.body.user.id;
              agent1
                .get('/')
                .expect(200)
                .end(function (err, res) {
                  if (err) return done(err);
                  res.body.should.be.an.Object;
                  res.body.should.have.property('_session');
                  res.body._session.should.be.an.Object;
                  res.body._session.should.have.property('user');
                  res.body._session.user.should.be.an.Object;
                  res.body._session.user.should.have.property('id');
                  res.body._session.user.id.should.be.a.String;
                  res.body._session.user.id.should.not.be.empty;
                  res.body._session.user.id.should.equal(userId);
                  done();
                });
            });
        });

        it('should sign in with email', function (done) {
          agent1
            .post('/user/signin')
            .send({usernameOrEmail: 'user1@email.com'})
            .send({password: 'pass'})
            .expect(200)
            .end(function (err, res) {
              if (err) return done(err);
              res.body.should.be.an.Object;
              res.body.should.have.property('user');
              res.body.user.should.be.an.Object;
              res.body.user.should.have.property('id');
              res.body.user.id.should.be.a.String;
              res.body.user.id.should.not.be.empty;
              var userId = res.body.user.id;
              agent1
                .get('/')
                .expect(200)
                .end(function (err, res) {
                  if (err) return done(err);
                  res.body.should.be.an.Object;
                  res.body.should.have.property('_session');
                  res.body._session.should.be.an.Object;
                  res.body._session.should.have.property('user');
                  res.body._session.user.should.be.an.Object;
                  res.body._session.user.should.have.property('id');
                  res.body._session.user.id.should.be.a.String;
                  res.body._session.user.id.should.not.be.empty;
                  res.body._session.user.id.should.equal(userId);
                  done();
                });
            });
        });

        it('should require a username or email', function (done) {
          agent1
            .post('/user/signin')
            .send({password: 'pass'})
            .expect(422, done);
        });

        it('should require a password', function (done) {
          agent1
            .post('/user/signin')
            .send({usernameOrEmail: 'user1'})
            .expect(422, done);
        });

        it('should not find username', function (done) {
          agent1
            .post('/user/signin')
            .send({usernameOrEmail: 'missing'})
            .send({password: 'pass'})
            .expect(404, done);
        });

        it('should not find email', function (done) {
          agent1
            .post('/user/signin')
            .send({usernameOrEmail: 'missing@email.com'})
            .send({password: 'pass'})
            .expect(404, done);
        });

        it('should reject password', function (done) {
          agent1
            .post('/user/signin')
            .send({usernameOrEmail: 'user1'})
            .send({password: 'invalid'})
            .expect(401, done);
        });
      });

      describe('GET /session', function () {
        before(function setup(done) {
          reset();
          agent1
            .post('/user/signup')
            .send({username: 'user1'})
            .send({email: 'user1@email.com'})
            .send({password: 'pass'})
            .expect(200, done);
        });

        it('should return current session', function (done) {
          agent1
            .get('/')
            .expect(200)
            .end(function (err, res) {
              if (err) return done(err);
              agent1
                .get('/user/session')
                .expect(200)
                .expect(res.body._session, done);
            });
        });

        it('should create new session', function (done) {
          agent2
            .get('/user/session')
            .expect(201)
            .end(function (err, res) {
              if (err) return done(err);
              res.body.should.be.an.Object;
              res.body.should.have.property('user');
              res.body.user.should.be.an.Object;
              res.body.user.should.have.property('id');
              res.body.user.id.should.be.a.String;
              res.body.user.id.should.not.be.empty;
              var model = store.createModel();
              var $user = model.at('users.' + res.body.user.id);
              $user.fetch(function (err) {
                if (err) return done(err);
                var user = $user.get();
                (user === null).should.be.false;
                user.should.be.an.Object;
                user.should.have.property('id');
                user.id.should.be.a.String;
                user.id.should.not.be.empty;
                user.should.have.property('created');
                user.created.should.be.a.Number;
                user.created.should.be.above(0);
                done();
              });
            });
        });
      });

      describe('POST /checkPassword', function () {
        before(setup);

        it('should return true for username', function (done) {
          agent1
            .post('/user/checkPassword')
            .send({usernameOrEmail: 'user1'})
            .send({password: 'pass'})
            .expect(200)
            .end(function (err, res) {
              if (err) return done(err);
              res.body.should.be.an.Object;
              res.body.should.have.property('matches');
              res.body.matches.should.be.a.Boolean;
              res.body.matches.should.be.true;
              done();
            });
        });

        it('should return true for email', function (done) {
          agent1
            .post('/user/checkPassword')
            .send({usernameOrEmail: 'user1@email.com'})
            .send({password: 'pass'})
            .expect(200)
            .end(function (err, res) {
              if (err) return done(err);
              res.body.should.be.an.Object;
              res.body.should.have.property('matches');
              res.body.matches.should.be.a.Boolean;
              res.body.matches.should.be.true;
              done();
            });
        });

        it('should return true for user id', function (done) {
          agent1
            .get('/')
            .end(function (err, res) {
              if (err) return done(err);
              agent1
                .post('/user/checkPassword')
                .send({userId: res.body._session.user.id})
                .send({password: 'pass'})
                .expect(200)
                .end(function (err, res) {
                  if (err) return done(err);
                  res.body.should.be.an.Object;
                  res.body.should.have.property('matches');
                  res.body.matches.should.be.a.Boolean;
                  res.body.matches.should.be.true;
                  done();
                });
            });
        });

        it('should return false for username', function (done) {
          agent1
            .post('/user/checkPassword')
            .send({usernameOrEmail: 'user1'})
            .send({password: 'invalid'})
            .expect(200)
            .end(function (err, res) {
              if (err) return done(err);
              res.body.should.be.an.Object;
              res.body.should.have.property('matches');
              res.body.matches.should.be.a.Boolean;
              res.body.matches.should.be.false;
              done();
            });
        });

        it('should return false for email', function (done) {
          agent1
            .post('/user/checkPassword')
            .send({usernameOrEmail: 'user1@email.com'})
            .send({password: 'invalid'})
            .expect(200)
            .end(function (err, res) {
              if (err) return done(err);
              res.body.should.be.an.Object;
              res.body.should.have.property('matches');
              res.body.matches.should.be.a.Boolean;
              res.body.matches.should.be.false;
              done();
            });
        });

        it('should return false for user id', function (done) {
          agent1
            .get('/')
            .expect(200)
            .end(function (err, res) {
              if (err) return done(err);
              agent1
                .post('/user/checkPassword')
                .send({userId: res.body._session.user.id})
                .send({password: 'invalid'})
                .expect(200)
                .end(function (err, res) {
                  if (err) return done(err);
                  res.body.should.be.an.Object;
                  res.body.should.have.property('matches');
                  res.body.matches.should.be.a.Boolean;
                  res.body.matches.should.be.false;
                  done();
                });
            });
        });

        it('should require username, email or user id', function (done) {
          agent1
            .post('/user/checkPassword')
            .send({password: 'pass'})
            .expect(422, done);
        });

        it('should require password', function (done) {
          agent1
            .post('/user/checkPassword')
            .send({usernameOrEmail: 'user1'})
            .expect(422, done);
        });

        it('should not find username', function (done) {
          agent1
            .post('/user/checkPassword')
            .send({usernameOrEmail: 'invalid'})
            .send({password: 'pass'})
            .expect(404, done);
        });

        it('should not find email', function (done) {
          agent1
            .post('/user/checkPassword')
            .send({usernameOrEmail: 'invalid@email.com'})
            .send({password: 'pass'})
            .expect(404, done);
        });

        it('should not find user id', function (done) {
          agent1
            .post('/user/checkPassword')
            .send({userId: 'invalid'})
            .send({password: 'pass'})
            .expect(404, done);
        });
      });

      describe('POST /changeEmail', function () {
        before(setup);

        it('should require session', function (done) {
          agent3
            .post('/user/changeEmail')
            .send({email: 'user3@email.com'})
            .expect(401, done);
        });

        it('should require email', function (done) {
          agent1
            .post('/user/changeEmail')
            .expect(422, done);
        });

        it('should reject duplicate email', function (done) {
          agent1
            .post('/user/changeEmail')
            .send({email: 'user1@email.com'})
            .expect(409, done);
        });

        it('should change email', function (done) {
          agent1
            .get('/')
            .end(function (err, res) {
              if (err) return done(err);
              var model = store.createModel();
              var userId = res.body._session.user.id;
              var $user1 = model.at('users.' + userId);
              $user1.fetch(function (err) {
                if (err) return done(err);
                agent1
                  .post('/user/changeEmail')
                  .send({email: 'user3@email.com'})
                  .expect(200)
                  .end(function (err, res) {
                    if (err) return done(err);
                    model = store.createModel();
                    var $user2 = model.at('users.' + userId);
                    $user2.fetch(function (err) {
                      if (err) return done(err);
                      var user2 = $user2.get();
                      user2.local.emails[0].value.should.be.a.String;
                      user2.local.emails[0].value.should.not.be.empty;
                      user2.local.emails[0].value.should.equal('user3@email.com');
                      user2.local.emails[0].verified.should.be.a.Boolean;
                      user2.local.emails[0].verified.should.be.false;
                      user2.local.emails[0].token.should.be.an.Object;
                      user2.local.emails[0].token.should.have.property('hash');
                      user2.local.emails[0].token.hash.should.be.a.String;
                      user2.local.emails[0].token.hash.should.not.equal($user1.get('local.emails.0.token.hash'));
                      user2.local.emails[0].token.should.have.property('date');
                      user2.local.emails[0].token.date.should.be.a.Number;
                      user2.local.emails[0].token.date.should.be.above(0);
                      user2.local.emails[0].token.date.should.not.equal($user1.get('local.emails.0.token.date'));
                      done();
                    });
                  });
              });
            });
        });
      });

      describe('POST /changePassword', function () {
        before(setup);

        it('should require session', function (done) {
          agent3
            .post('/user/changePassword')
            .send({currentPassword: 'pass'})
            .send({password: 'pass2'})
            .expect(401, done);
        });

        it('should require password', function (done) {
          agent1
            .post('/user/changePassword')
            .send({currentPassword: 'pass'})
            .expect(422, done);
        });

        it('should require current password', function (done) {
          agent1
            .post('/user/changePassword')
            .send({password: 'pass2'})
            .expect(422, done);
        });

        it('should reject current password', function (done) {
          agent1
            .post('/user/changePassword')
            .send({currentPassword: 'invalid'})
            .send({password: 'pass2'})
            .expect(401, done);
        });

        it('should change password', function (done) {
          agent1
            .get('/')
            .end(function (err, res) {
              if (err) return done(err);
              var model = store.createModel();
              var userId = res.body._session.user.id;
              var $user1 = model.at('users.' + userId);
              $user1.fetch(function (err) {
                if (err) return done(err);
                agent1
                  .post('/user/changePassword')
                  .send({currentPassword: 'pass'})
                  .send({password: 'pass2'})
                  .expect(200)
                  .end(function (err, res) {
                    if (err) return done(err);
                    model = store.createModel();
                    var $user2 = model.at('users.' + userId);
                    $user2.fetch(function (err) {
                      if (err) return done(err);
                      var user2 = $user2.get();
                      user2.local.password.hash.should.be.a.String;
                      user2.local.password.hash.should.not.be.empty;
                      user2.local.password.hash.should.not.equal($user1.get('local.password.hash'));
                      done();
                    });
                  });
              });
            });
        });
      });

      describe('POST /changeUsername', function () {
        before(setup);

        it('should require session', function (done) {
          agent3
            .post('/user/changeUsername')
            .send({username: 'user3'})
            .expect(401, done);
        });

        it('should require username', function (done) {
          agent1
            .post('/user/changeUsername')
            .expect(422, done);
        });

        it('should reject username', function (done) {
          agent1
            .post('/user/changeUsername')
            .send({username: 'user1'})
            .expect(409, done);
        });

        it('should change username', function (done) {
          agent1
            .get('/')
            .end(function (err, res) {
              if (err) return done(err);
              var model = store.createModel();
              var userId = res.body._session.user.id;
              var $user1 = model.at('users.' + userId);
              $user1.fetch(function (err) {
                if (err) return done(err);
                agent1
                  .post('/user/changeUsername')
                  .send({username: 'user3'})
                  .expect(200)
                  .end(function (err, res) {
                    if (err) return done(err);
                    model = store.createModel();
                    var $user2 = model.at('users.' + userId);
                    $user2.fetch(function (err) {
                      if (err) return done(err);
                      var user2 = $user2.get();
                      user2.local.username.should.be.a.String;
                      user2.local.username.should.not.be.empty;
                      user2.local.username.should.equal('user3');
                      done();
                    });
                  });
              });
            });
        });
      });

      describe('GET /confirmEmail', function () {
        before(setup);

        it('should require session', function (done) {
          agent3
            .get('/user/confirmEmail')
            .expect(401, done);
        });

        it('should confirm email', function (done) {
          var emitted = false;

          emitter.once('user.sendConfirmEmail', function (req, data) {
            req.should.be.an('object');
            data.should.be.an('object');
            data.should.have.property('token');
            data.token.should.be.a.String;
            data.token.should.not.be.empty;
            data.should.have.property('userId');
            data.userId.should.be.a.String;
            data.userId.should.not.be.empty;
            emitted = true;
          });

          agent1
            .get('/')
            .end(function (err, res) {
              if (err) return done(err);
              var model = store.createModel();
              var userId = res.body._session.user.id;
              var $user1 = model.at('users.' + userId);
              $user1.fetch(function (err) {
                if (err) return done(err);
                agent1
                  .get('/user/confirmEmail')
                  .expect(200)
                  .end(function (err, res) {
                    if (err) return done(err);
                    model = store.createModel();
                    var $user2 = model.at('users.' + userId);
                    $user2.fetch(function (err) {
                      if (err) return done(err);
                      var user2 = $user2.get();
                      user2.local.emails[0].token.should.be.an.Object;
                      user2.local.emails[0].token.should.have.property('hash');
                      user2.local.emails[0].token.hash.should.be.a.String;
                      user2.local.emails[0].token.hash.should.not.equal($user1.get('local.emails.0.token.hash'));
                      user2.local.emails[0].token.should.have.property('date');
                      user2.local.emails[0].token.date.should.be.a.Number;
                      user2.local.emails[0].token.date.should.be.above(0);
                      user2.local.emails[0].token.date.should.not.equal($user1.get('local.emails.0.token.date'));
                      emitted.should.be.true;
                      done();
                    });
                  });
              });
            });
        });
      });

      describe('POST /confirmEmail', function () {
        var token = null;

        before(function (done) {
          setup(function (err) {
            if (err) return done(err);

            emitter.once('user.sendConfirmEmail',
              function (req, data) {
                token = data.token;
              }
            );

            agent1
              .get('/user/confirmEmail')
              .expect(200, done);
          });
        });

        it('should require session', function (done) {
          agent3
            .post('/user/confirmEmail')
            .send({token: token})
            .expect(401, done);
        });

        it('should require token', function (done) {
          agent1
            .post('/user/confirmEmail')
            .expect(422, done);
        });

        it('should reject token', function (done) {
          agent1
            .post('/user/confirmEmail')
            .send({token: 'invalid'})
            .expect(401, done)
        });

        it('should confirm email', function (done) {
          var emitted = false;

          emitter.once('user.confirmEmail',
            function (req, data) {
              req.should.be.an('object');
              data.should.be.an('object');
              data.should.have.property('token');
              data.token.should.be.a.String;
              data.token.should.not.be.empty;
              data.should.have.property('userId');
              data.userId.should.be.a.String;
              data.userId.should.not.be.empty;
              emitted = true;
            }
          );

          agent1
            .post('/user/confirmEmail')
            .send({token: token})
            .expect(200)
            .end(function (err) {
              if (err) return done(err);
              emitted.should.be.true;
              done();
            });
        });
      });

      describe('GET /confirmEmail/:id/:token', function () {
        var token = null;

        before(function (done) {
          setup(function (err) {
            if (err) return done(err);

            emitter.once('user.sendConfirmEmail',
              function (req, data) {
                token = data.token;
              }
            );

            agent1
              .get('/user/confirmEmail')
              .expect(200, done);
          });
        });

        it('should reject invalid token', function (done) {
          agent1
            .get('/')
            .expect(200)
            .end(function (err, res) {
              if (err) return done(err);
              var userId = res.body._session.user.id;
              agent1
                .get('/user/confirmEmail/' + userId + '/invalid')
                .expect(302)
                .end(function (err, res) {
                  var loc = res.header['location'];
                  agent1
                    .get(loc)
                    .expect(401)
                    .expect({code: 401, msg: 'token.invalid'}, done)
                });
            });
        });

        it('should reject user missing a token', function (done) {
          agent2
            .get('/')
            .expect(200)
            .end(function (err, res) {
              if (err) return done(err);
              var userId = res.body._session.user.id;
              agent2
                .get('/user/confirmEmail/' + userId + '/invalid')
                .expect(302)
                .end(function (err, res) {
                  var loc = res.header['location'];
                  agent2
                    .get(loc)
                    .expect(401)
                    .expect({code: 401, msg: 'token.invalid'}, done)
                });
            });
        });

        it('should confirm email', function (done) {
          agent1
            .get('/')
            .expect(200)
            .end(function (err, res) {
              if (err) return done(err);
              var userId = res.body._session.user.id;
              agent1
                .get('/user/confirmEmail/' + userId + '/' + token)
                .expect(302)
                .end(function (err, res) {
                  var loc = res.header['location'];
                  agent1
                    .get(loc)
                    .expect(200, done);
                });
            });
        });

        it('should not re-confirm email', function (done) {
          agent1
            .get('/')
            .expect(200)
            .end(function (err, res) {
              if (err) return done(err);
              var userId = res.body._session.user.id;
              agent1
                .get('/user/confirmEmail/' + userId + '/' + token)
                .expect(302)
                .end(function (err, res) {
                  var loc = res.header['location'];
                  agent1
                    .get(loc)
                    .expect(200)
                    .expect({code: 200, msg: 'email.verified'}, done)
                });
            });
        });
      });

      describe('POST /forgotPassword', function () {
        before(setup);

        it('should require username or email', function (done) {
          agent1
            .post('/user/forgotPassword')
            .expect(422, done);
        });

        it('should not find username', function (done) {
          agent1
            .post('/user/forgotPassword')
            .send({usernameOrEmail: 'invalid'})
            .expect(404, done);
        });

        it('should not find email', function (done) {
          agent1
            .post('/user/forgotPassword')
            .send({usernameOrEmail: 'invalid@email.com'})
            .expect(404, done);
        });

        it('should work with username', function (done) {
          var emitted = false;

          emitter.once('user.forgotPassword', function (req, data) {
            req.should.be.an('object');
            data.should.be.an('object');
            data.should.have.property('token');
            data.token.should.be.a.String;
            data.token.should.not.be.empty;
            data.should.have.property('userId');
            data.userId.should.be.a.String;
            data.userId.should.not.be.empty;
            emitted = true;
          });

          agent1
            .post('/user/forgotPassword')
            .send({usernameOrEmail: 'user1'})
            .expect(200)
            .end(function (err) {
              if (err) return done(err);
              emitted.should.be.true;
              done();
            });
        });

        it('should work with email', function (done) {
          var emitted = false;

          emitter.once('user.forgotPassword', function (req, data) {
            req.should.be.an('object');
            data.should.be.an('object');
            data.should.have.property('token');
            data.token.should.be.a.String;
            data.token.should.not.be.empty;
            data.should.have.property('userId');
            data.userId.should.be.a.String;
            data.userId.should.not.be.empty;
            emitted = true;
          });

          agent1
            .post('/user/forgotPassword')
            .send({usernameOrEmail: 'user1@email.com'})
            .expect(200)
            .end(function (err) {
              if (err) return done(err);
              emitted.should.be.true;
              done();
            });
        });
      });

      describe('POST /resetPassword', function () {
        var userId = null;
        var token = null;

        before(function (done) {
          setup(function (err) {
            if (err) return done(err);
            agent1
              .get('/')
              .expect(200)
              .end(function (err, res) {
                if (err) return done(err);
                userId = res.body._session.user.id;

                emitter.once('user.forgotPassword', function (req, data) {
                  token = data.token;
                });

                agent1
                  .post('/user/forgotPassword')
                  .send({usernameOrEmail: 'user1'})
                  .expect(200, done);
              });
          });
        });

        it('should require user id', function (done) {
          agent1
            .post('/user/resetPassword')
            .send({password: 'pass'})
            .send({token: token})
            .expect(422, done);
        });

        it('should require password', function (done) {
          agent1
            .post('/user/resetPassword')
            .send({userId: userId})
            .send({token: token})
            .expect(422, done);
        });

        it('should require token', function (done) {
          agent1
            .post('/user/resetPassword')
            .send({userId: userId})
            .send({password: 'pass'})
            .expect(422, done);
        });

        it('should reset password', function (done) {
          agent1
            .post('/user/resetPassword')
            .send({userId: userId})
            .send({password: 'pass2'})
            .send({token: token})
            .expect(200)
            .end(function (err) {
              if (err) return done(err);
              agent1
                .post('/user/signin')
                .send({usernameOrEmail: 'user1'})
                .send({password: 'pass2'})
                .expect(200)
                .end(function (err, res) {
                  if (err) return done(err);
                  var model = store.createModel();
                  var $user = model.at('users.' + userId);
                  $user.fetch(function (err) {
                    if (err) return done(err);
                    var user = $user.get();
                    user.local.password.should.not.have.property('token');
                    done();
                  });
                });
            });
        });
      });
    });
  });
});
