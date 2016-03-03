"use strict";

var Q = require('q');
var _ = require('underscore');
var nodeutil = require('util');
var path = require('path');
var ocl = require('node-opencl');

var log = require('./logger.js');
var logger = log.createLogger('cljs:clbuffer');

var CLBuffer = function (cl, size, name) {
    var that = this;
    logger.debug("Creating buffer %s, size %d", name, size);

    var buffer = ocl.createBuffer(cl.context, ocl.MEM_READ_WRITE, size);

    if (buffer === null) {
        throw new Error("Could not create the OpenCL buffer");
    }

    this.name = name;
    this.cl = cl;
    this.buffer = buffer;
    this.size = size;

    this.delete = Q.promised(function() {
        ocl.ReleaseMemObject(buffer);
        that.size = 0;
        return null;
    });

};

CLBuffer.prototype.copyInto = function (destination) {
    logger.debug("Copying buffer. Source: %s (%d bytes), destination %s (%d bytes)",
        this.name, this.size, destination.name, destination.size);

    var queue = this.cl.queue;
    var that = this;
    return Q()
        .then(function () {
            ocl.enqueueCopyBuffer(queue, that.buffer, destination.buffer, 0, 0, Math.min(that.size, destination.size));
        })
        .then(function () {
            ocl.finish(queue);
            return that;
        });
};


CLBuffer.prototype.write = function (data) {
    var that = this;
    logger.debug('Writing to buffer', this.name, this.size, 'bytes');

    // Attempting to write data of size 0 seems to crash intel GPU drivers, so return.
    if (data.byteLength === 0) {
        return that;
    }

    ocl.enqueueWriteBuffer(that.cl.queue, that.buffer, true, 0, data.byteLength, data);
    return that;



    // TODO acquire not needed if GL is dropped
    // return Q()
    //     .then(function () {
    //         console.log('Writing Buffer', that.name, ' with byteLength: ', data.byteLength);
    //         ocl.enqueueWriteBuffer(that.cl.queue, that.buffer, true, 0, data.byteLength, data);
    //     })
    //     .then(function() {
    //         // buffer.cl.queue.finish();
    //         console.log("Finished buffer %s write", that.name);
    //         return that;
    //     });
};

CLBuffer.prototype.read = function (cons, optStartIdx, optLen) {
    var that = this;
    var numElements = that.size / cons.BYTES_PER_ELEMENT;
    var resultBuffer = new cons(numElements);

    that.readInto(resultBuffer, optStartIdx, optLen);
    return resultBuffer;
};


CLBuffer.prototype.readInto = function (target, optStartIdx, optLen) {
    var that = this;

    logger.debug('Reading from buffer', that.name);
    var start = Math.min(optStartIdx || 0, that.size);
    var len = optLen !== undefined ? optLen : (that.size - start);

    if (len === 0) {
        return that;
    }

    ocl.enqueueReadBuffer(that.cl.queue, that.buffer, true, start, len, target);
    return that;

    // return Q()
    //     .then(function() {
    //         console.log('Reading Buffer', that.name, start, len);
    //         ocl.enqueueReadBuffer(that.cl.queue, that.buffer, true, start, len, target);
    //         // TODO acquire and release not needed if GL is dropped
    //     })
    //     .then(function() {
    //         console.log('Done Reading: ', that.name);
    //         return that;
    //     });
        // .fail(log.makeQErrorHandler(logger, 'Read error for buffer', buffer.name));
};

module.exports = CLBuffer;

