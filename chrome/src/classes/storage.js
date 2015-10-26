// Generated by CoffeeScript 1.8.0
(function() {
  var Storage;

  Storage = (function() {
    function Storage(config) {
      this.config = config;
    }

    Storage.prototype.set = function(key, value, callback) {
      var obj;
      obj = {};
      obj[key] = value;
      return chrome.storage.local.set(obj, callback);
    };

    Storage.prototype.get = function(key, callback) {
      return chrome.storage.local.get(key, function(items) {
        if (typeof runtime !== "undefined" && runtime !== null ? runtime.lastError : void 0) {
          throw "Error saving " + key + ": " + runtime.lastError;
        }
        return callback(items[key]);
      });
    };

    Storage.prototype.remove = function(key) {
      return chrome.storage.local.remove(key, function() {
        if (typeof runtime !== "undefined" && runtime !== null ? runtime.lastError : void 0) {
          throw "Error saving " + key + ": " + runtime.lastError;
        }
      });
    };

    return Storage;

  })();

  window.Storage = Storage;

}).call(this);
