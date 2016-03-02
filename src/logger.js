'use strict';

var debugFactory = require('debug');

var Logger = function (tag) {
    this.debug = debugFactory(tag);
};

Logger.prototype.trace = function () {
    this.debug.apply(null, arguments);
};

Logger.prototype.debug = function () {
    this.debug.apply(null, arguments);
};

Logger.prototype.info = function () {
    this.debug.apply(null, arguments);
};

Logger.prototype.warn = function () {
    this.debug.apply(null, arguments);
};

Logger.prototype.error = function () {
    this.debug.apply(null, arguments);
};

Logger.prototype.die = function () {
    this.debug.apply(null, arguments);
    process.exit(-1);
};


module.exports = {
    createLogger: function (tag) {
        return new Logger(tag);
    },
    makeQErrorHandler: function () {
        var args = Array.prototype.slice.call(arguments);
        var logger = args.shift();

        return function (err) {
            args.unshift(err);
            logger.error(args);
            throw err;
        };
    }
};
