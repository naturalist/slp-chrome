// Generated by CoffeeScript 1.8.0
(function() {
  var KeyRing;

  KeyRing = (function() {
    var keyring;

    keyring = [];

    function KeyRing(config) {
      this.config = config;
      this.load();
    }

    KeyRing.prototype.purge = function() {
      keyring = [];
      return localStorage.removeItem(this.config.keyringTag);
    };

    KeyRing.prototype.load = function() {
      var e, json;
      json = localStorage.getItem(this.config.keyringTag);
      keyring = [];
      if (json) {
        try {
          return keyring = JSON.parse(json);
        } catch (_error) {
          e = _error;
          throw "Unable to parse the 'keys' storage";
        }
      }
    };

    KeyRing.prototype.save = function() {
      var json;
      json = JSON.stringify(keyring);
      return localStorage.setItem(this.config.keyringTag, json);
    };

    KeyRing.prototype.find = function(email) {
      var key, _i, _len;
      for (_i = 0, _len = keyring.length; _i < _len; _i++) {
        key = keyring[_i];
        if (key.email === email) {
          return key;
        }
      }
    };

    KeyRing.prototype.add = function(key) {
      keyring.push(key);
      return this.save();
    };

    KeyRing.prototype.length = function() {
      return keyring.length;
    };

    KeyRing.prototype.at = function(idx) {
      return keyring[idx];
    };

    KeyRing.prototype.all = function() {
      return keyring;
    };

    return KeyRing;

  })();

  window.KeyRing = KeyRing;

}).call(this);
