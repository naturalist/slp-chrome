// Generated by CoffeeScript 1.8.0
(function() {
  var app, assert, r, request;

  request = require('supertest');

  app = require('../server.js');

  assert = require('assert');

  app.db.items.remove({});

  r = request(app);

  describe('Missing route', function() {
    var paths;
    paths = ['/', '/random', '/x', '/x/random'];
    return paths.forEach(function(path) {
      return it("" + path + " goes to 404", function(done) {
        return r.get(path).expect(404, done);
      });
    });
  });

  describe('Add item', function() {
    var p;
    p = null;
    beforeEach(function(done) {
      p = r.post("/x").set('Accept', 'application/json');
      return done();
    });
    return describe('POST /x', function() {
      it('returns 400 if content is missing', function(done) {
        return p.expect(400, done);
      });
      it('returns 400 if there are no keys or messages', function(done) {
        return p.send({
          blah: 1
        }).expect(400, done);
      });
      it('returns 201 if there are keys', function(done) {
        return p.send({
          keys: [1, 2, 3]
        }).end(function(err, res) {
          assert.equal(res.status, 201, "201 OK");
          assert.ok(res.body.id, "id present");
          return done();
        });
      });
      return it('returns 201 if there are messages', function(done) {
        return p.send({
          messages: {
            fingerprint: 123
          }
        }).end(function(err, res) {
          assert.equal(res.status, 201, "201 OK");
          assert.ok(res.body.id, "id present");
          return done();
        });
      });
    });
  });

  describe('Retrieve items', function() {
    var p, result;
    p = null;
    result = null;
    beforeEach(function(done) {
      return p = r.post("/x").set('Accept', 'application/json').send({
        keys: [1, 2, 3]
      }).end(function(err, res) {
        result = res.body;
        return done();
      });
    });
    return describe("GET /x/:id", function() {
      it("returns 404 if id not found", function(done) {
        return r.get("/x/562075c6850ddb4a24c9b005").set('Accept', 'application/json').expect(404, done);
      });
      it("returns 200 if id is found", function(done) {
        return r.get("/x/" + result.id).set('Accept', 'application/json').expect(200, done);
      });
      it("returns the json stored", function(done) {
        return r.get("/x/" + result.id).set('Accept', 'application/json').end(function(err, res) {
          assert.deepEqual(res.body.keys, [1, 2, 3]);
          return done();
        });
      });
      return it("save proper data in the DB", function(done) {
        return r.get("/x/" + result.id).set('Accept', 'application/json').end(function(err, res) {
          return app.db.items.findOne({
            _id: app.ObjectId(result.id)
          }, function(e, r) {
            assert.deepEqual(r.keys, [1, 2, 3]);
            return done();
          });
        });
      });
    });
  });

}).call(this);
