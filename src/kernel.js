'use strict';

var _ = require('underscore');
var Q = require('q');
var path = require('path');
var fs = require('fs');
var types = require('./types.js');
var ocl = require('node-opencl');

var log = require('./logger.js');
var logger = log.createLogger('cljs:kernel');


// TODO: Add back in support for defines.

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

    // this.argNames = argNames;
    // Q promise

    //TODO: Alternative way of doing this, since we aren't using debug module anymore
    // Set synchronous based on debug value
    var synchronous = false;
    // if (process.env.DEBUG && process.env.DEBUG.indexOf('perf') !== -1) {
    //     logger.trace('Kernel ' + name + ' is synchronous because DEBUG=perf');
    //     synchronous = true;
    // }

    // For gathering performance data
    this.timings = [];
    this.totalRuns = 0;
    var maxTimings = 100;

    function isDefine(arg) {
        return arg === types.define;
    };


    this.defines = {
        NODECL: undefined
    };


    // var defVal = {dirty: true, val: null};
    // var argValues = _.object(
    //     _.map(args, function (name) { return [name, defVal]; })
    // );
    // var defValues = _.object(
    //     _.map(defines, function (name) { return [name, null]; })
    // );
    // Object.seal(argValues);
    // Object.seal(defValues);

    // If kernel has no defines, compile right away
    // var qKernel = _.without(defines, 'NODECL').length === 0 ? compile() : Q(null);
    this.qKernel = Q(null);

    // {String -> Value} -> Kernel
    // this.set = function (args) {
    //     logger.trace('Setting args for kernel', this.name);

    //     var mustRecompile = false;
    //     _.each(args, function (val, arg) {
    //         if (arg in argValues) {
    //             if (val === undefined || typeof val === 'null') {
    //                 logger.trace('Setting argument %s to %s', arg, val);
    //             }

    //             argValues[arg] = {dirty: true, val: val};
    //         } else if (arg in defValues) {
    //             if (val !== defValues[arg]) {
    //                 mustRecompile = true;
    //             }
    //             defValues[arg] = val;
    //         } else {
    //             logger.die('Kernel %s has no argument/define named %s', name, arg);
    //         }
    //     });

    //     if (mustRecompile) {
    //         qKernel = compile();
    //     }

    //     return this;
    // };

    // this.get = function(arg) {
    //     if (_.contains(defines, arg)) {
    //         return defValues[arg];
    //     } else if (_.contains(args, arg)) {
    //         return argValues[arg].val;
    //     } else {
    //         logger.warn('Kernel %s has no parameter %s', name, arg);
    //         return undefined;
    //     }
    // };

    // function compile () {
    //     logger.trace('Compiling kernel', that.name);

    //     _.each(defValues, function (arg, val) {
    //         if (val === null) {
    //             logger.die('Define %s of kernel %s was never set', arg, name);
    //         }

    //     });

    //     var prefix = _.flatten(_.map(defValues, function (val, key) {
    //         if (typeof val === 'string' || typeof val === 'number' || val === true) {
    //             return ['#define ' + key + ' ' + val];
    //         } else if (val === null) {
    //             return ['#define ' + key];
    //         } else {
    //             return [];
    //         }
    //     }), true).join('\n');
    //     logger.trace('Prefix', prefix);

    //     return source.then(function (source) {
    //         var processedSource = prefix + '\n\n' + source;
    //         // TODO: Alternative way of doing this, since we aren't using debug module anymore
    //         // if (config.ENVIRONMENT === 'local') {
    //         //     var debugFile = path.resolve(__dirname, '..', 'kernels', file + '.debug');
    //         //     fs.writeFileSync(debugFile, processedSource);
    //         // }

    //         return clContext.compile(processedSource, [name])
    //             .then(function (kernels) {
    //                 return kernels[name];
    //             });
    //     });
    // };

    // function setAllArgs(kernel) {
    //     logger.trace('Setting arguments for kernel', name)
    //     var i;
    //     try {
    //         for (i = 0; i < args.length; i++) {
    //             var arg = args[i];
    //             var val = argValues[arg].val;
    //             var dirty = argValues[arg].dirty;
    //             var type = argTypes[arg] || "cl_mem";
    //             if (val === null)
    //                 logger.trace('In kernel %s, argument %s is null', name, arg);

    //             if (dirty) {
    //                 logger.trace('Setting arg %d of kernel %s to value %s', i, name, val);
    //                 ocl.setKernelArg(kernel, i, val, type);
    //                 argValues[arg].dirty = false;
    //             }
    //         }

    //     } catch (e) {
    //         log.makeQErrorHandler(logger, 'Error setting argument %s of kernel %s', args[i], name)(e);
    //     }
    // };

    // function call(kernel, workItems, buffers, workGroupSize) {
    //     // TODO: Consider acquires and releases of buffers.

    //     var queue = clContext.queue;
    //     logger.trace('Enqueuing kernel %s', that.name, kernel);
    //     var start = process.hrtime();
    //     ocl.enqueueNDRangeKernel(queue, kernel, 1, null, workItems, workGroupSize || null);
    //     if (synchronous) {
    //         logger.trace('Waiting for kernel to finish');
    //         ocl.finish(queue);
    //         var diff = process.hrtime(start);
    //         that.timings[that.totalRuns % maxTimings] = (diff[0] * 1000 + diff[1] / 1000000);
    //     }
    //     that.totalRuns++;
    //     return Q(that);
    // }
    //
    //

    function getKernelSource(kernel_path, kernelName) {
        logger.trace('Fetching source for kernel %s at path %s, using fs read', kernelName, kernel_path);
        return Q.denodeify(fs.readFile)(kernel_path, {encoding: 'utf8'});
    }

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


Kernel.prototype.setAllArgs = function (kernel) {
    logger.trace('Setting arguments for kernel', this.name);
    var argValues = this.argValues;
    var argTypes = this.argTypesByPosition;
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
                logger.trace('In kernel %s, argument %s is null', this.name, arg);
            }

            if (dirty) {
                logger.trace('Setting arg %d of kernel %s to value %s', i, this.name, val);
                ocl.setKernelArg(kernel, i, val, type);
                arg.dirty = false;
            }
        }

    } catch (e) {
        log.makeQErrorHandler(logger, 'Error setting argument %s of kernel %s', args[i], this.name)(e);
    }
};

//TODO: Recompile before execution if necessary.

Kernel.prototype.compile = function () {
    var that = this;
    logger.trace('Compiling kernel', that.name);

    // _.each(this.defines, function (arg, val) {
    //     if (val === null) {
    //         logger.die('Define %s of kernel %s was never set', arg, name);
    //     }
    // });

    var prefix = _.flatten(_.map(this.defines, function (val, key) {
        if (typeof val === 'string' || typeof val === 'number' || val === true) {
            return ['#define ' + key + ' ' + val];
        } else if (val === null) {
            return ['#define ' + key];
        } else {
            return [];
        }
    }), true).join('\n');
    logger.trace('Prefix: ', prefix);


    var processedSource = prefix + '\n\n' + this.source;
    // TODO: Alternative way of doing this, since we aren't using debug module anymore
    // if (config.ENVIRONMENT === 'local') {
    //     var debugFile = path.resolve(__dirname, '..', 'kernels', file + '.debug');
    //     fs.writeFileSync(debugFile, processedSource);
    // }

    return this.qSource.then(function (source) {
        var processedSource = prefix + '\n\n' + source;
        logger.trace('preprocessed source: ', processedSource);
        return processedSource;
    }).then(function (processedSource) {
        var kernels = that.cl.compile(processedSource, [that.name]);
        that.mustRecompile = false;
        logger.trace('Build returned kernels: ', kernels);
        return kernels[that.name];
    });
};

// Expects args as an array
Kernel.prototype.run = function(numWorkItems, workGroupSize, args) {
    var that = this;
    if (args) {
        logger.trace('Setting args');
        this.set(args);
    }

    if (this.mustRecompile) {
        logger.trace('Recompiling');
        this.qKernel = this.compile();
    }

    return this.qKernel.then(function (kernel) {
        if (kernel === null || kernel === undefined) {
            logger.error('Kernel is not compiled, aborting');
            return Q();
        } else {
            logger.trace('Setting kernel arguments');
            that.setAllArgs(kernel);
            return that.callKernel(kernel, numWorkItems, workGroupSize);
        }
    }).fail(log.makeQErrorHandler(logger, 'Error running kernel'));
}

Kernel.prototype.callKernel = function (kernel, workItems, workGroupSize) {
    // TODO: Consider acquires and releases of buffers.
    var queue = this.cl.queue;
    logger.trace('Enqueuing kernel %s', this.name, kernel);
    // var start = process.hrtime();
    ocl.enqueueNDRangeKernel(queue, kernel, 1, null, workItems, workGroupSize || null);

    // TODO: Generalize sync/async.
    this.cl.finish();
    logger.trace('Finished');

    // if (synchronous) {
    //     logger.trace('Waiting for kernel to finish');
    //     ocl.finish(queue);
    //     var diff = process.hrtime(start);
    //     that.timings[that.totalRuns % maxTimings] = (diff[0] * 1000 + diff[1] / 1000000);
    // }
    // that.totalRuns++;
    return Q(this);
};



Kernel.prototype.setArgTypesByPosition = function (argTypes) {
    this.argTypesByPosition = argTypes;
};



// () -> Stats
// Kernel.prototype.runtimeStats = function () {
//     var runs = this.timings.length;
//     var mean =  _.reduce(this.timings, function (a, b) {return a + b;}, 0) / runs;
//     var stdDev =
//         _.reduce(this.timings, function (acc, t) {
//             return acc + (t - mean) * (t - mean);
//         }, 0) / (runs > 1 ? runs - 1 : runs);

//     var pretty = sprintf('%25s:%4s ±%4s        #runs:%4d', this.name,
//                          mean.toFixed(0), stdDev.toFixed(0), this.totalRuns);
//     return {
//         name: this.name,
//         runs: this.totalRuns,
//         mean: mean,
//         stdDev: stdDev,
//         pretty: pretty
//     }
// }

module.exports = Kernel;
