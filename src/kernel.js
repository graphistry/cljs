'use strict';

var _ = require('underscore');
var Q = require('q');
var fs = require('fs');
//var types = require('./types.js');
var ocl = require('node-opencl');

var log = require('./logger.js');
var logger = log.createLogger('cljs:kernel');


// String * [String] * {String: Type} * String * clCtx
var Kernel = function (cl, name, file, argTypes) {
    logger.trace('Creating Kernel', name);

    var that = this;
    this.name = name;
    this.file = file;
    this.qSource = getKernelSource(file, name);
    this.argTypes = argTypes;
    this.cl = cl;
    this.mustRecompile = true;
    this.argTypesByPosition = argTypes || [];
    this.argValues = Array.apply(null, new Array(argTypes.length)).map(function () {
             return {
                    dirty: true,
                    val: null
             };
         });
    this.defines = {}; // TODO: Add back in support for defines.


    function getKernelSource(kernel_path, kernelName) {
        logger.trace('Fetching source for kernel %s at path %s, using fs read', kernelName, kernel_path);
        return Q.denodeify(fs.readFile)(kernel_path, {encoding: 'utf8'});
    }


    function setAllArgs(kernel) {
        logger.trace('Setting arguments for kernel', that.name);
        var argValues = that.argValues;
        var argTypes = that.argTypesByPosition;
        var i;
        try {
            for (i = 0; i < argTypes.length; i++) {
                var arg = argValues[i];
                var val = arg.val;
                var dirty = arg.dirty;
                var type = argTypes[i] || "cl_mem";

                if (type === 'cl_mem') {
                    val = val.buffer || val;
                }

                if (val === null) {
                    logger.trace('In kernel %s, argument %s is null', that.name, arg);
                }

                if (dirty) {
                    logger.trace('Setting arg %d of kernel %s to value %s', i, that.name, val);
                    ocl.setKernelArg(kernel, i, val, type);
                    arg.dirty = false;
                }
            }

        } catch (e) {
            log.makeQErrorHandler(logger, 'Error setting argument %s of kernel %s', args[i], that.name)(e);
        }
    }


    //TODO: Recompile before execution if necessary.
    function compile() {
        logger.trace('Compiling kernel', that.name);

        _.each(that.defines, function (arg, val) {
            if (val === null) {
                logger.die('Define %s of kernel %s was never set', arg, name);
            }
        });

        var prefix = _.flatten(_.map(that.defines, function (val, key) {
            if (typeof val === 'string' || typeof val === 'number' || val === true) {
                return ['#define ' + key + ' ' + val];
            } else if (val === null) {
                return ['#define ' + key];
            } else {
                return [];
            }
        }), true).join('\n');
        logger.trace('Prefix: ', prefix);

        return that.qSource.then(function (source) {
            var processedSource = prefix + '\n\n' + source;
            logger.trace('preprocessed source: ', processedSource);
            return processedSource;
        }).then(function (processedSource) {
            var kernels = that.cl.compile(processedSource, [that.name]);
            that.mustRecompile = false;
            logger.trace('Build returned kernels: ', kernels);
            return kernels[that.name];
        });
    }


    function callKernel(kernel, workItems, workGroupSize) {
        // TODO: Consider acquires and releases of buffers.
        var queue = that.cl.queue;
        logger.trace('Enqueuing kernel %s', that.name, kernel);
        ocl.enqueueNDRangeKernel(queue, kernel, 1, null, workItems, workGroupSize || null);

        // TODO: Generalize sync/async.
        that.cl.finish();
        logger.trace('Finished');

        return Q(that);
    }


    // Expects args as an array
    this.run = function(numWorkItems, workGroupSize, args) {
        if (args) {
            that.set(args);
        }

        if (that.mustRecompile) {
            logger.trace('Recompiling');
            that.qKernel = compile();
        }

        return that.qKernel.then(function (kernel) {
            if (kernel === null || kernel === undefined) {
                logger.error('Kernel is not compiled, aborting');
                return Q();
            } else {
                logger.trace('Setting kernel arguments');
                setAllArgs(kernel);
                return callKernel(kernel, numWorkItems, workGroupSize);
            }
        }).fail(log.makeQErrorHandler(logger, 'Error running kernel'));
    };
};

Kernel.prototype.define = function (key, val) {
    if (arguments.length === 1) {
        this.defines[key] = null;
    } else {
        this.defines[key] = val;
    }
    this.mustRecompile = true;
};


Kernel.prototype.set = function (args) {
    logger.trace('Setting args for kernel', this.name);
    var that = this;
    var argValues = that.argValues;

    _.each(args, function (val, i) {
        if (val !== argValues[i].val) {
            argValues[i] = {
                dirty: true,
                val: val
            };
        }
    });

    return this;
};


Kernel.prototype.setArgTypesByPosition = function (argTypes) {
    this.argTypesByPosition = argTypes;
};


module.exports = Kernel;
