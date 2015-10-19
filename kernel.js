'use strict';

var _ = require('underscore');
var Q = require('q');
var sprintf = require('sprintf-js').sprintf;
var path = require('path');
var fs = require('fs');
var util = require('./util');

var cljs = require('./cl.js');
var ocl = require('node-opencl');
var config = require('config')();

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:cl:kernel');

// Disable debug logging since this file is responsible for 90% of log output.
// Comment me for local debugging.
//debug = function () {}
//Q.longStackSupport = true;


// String * [String] * {String: Type} * String * clCtx
var Kernel = function (name, argNames, argTypes, file, clContext) {
    logger.trace('Creating Kernel', name);

    var that = this;
    this.name = name;
    this.argNames = argNames;
    // Q promise
    var source = util.getKernelSource(file);

    //TODO: Alternative way of doing this, since we aren't using debug module anymore
    // Set synchronous based on debug value
    var synchronous = false;
    if (process.env.DEBUG && process.env.DEBUG.indexOf('perf') !== -1) {
        logger.trace('Kernel ' + name + ' is synchronous because DEBUG=perf');
        synchronous = true;
    }

    // For gathering performance data
    this.timings = [];
    this.totalRuns = 0;
    var maxTimings = 100;

    // Sanity Checks
    _.each(argNames, function (arg) {
        if (!(arg in argTypes)) {
            logger.die('In Kernel %s, argument %s has no type', name, arg);
        }
    });

    function isDefine(arg) {
        return argTypes[arg] === cljs.types.define;
    };
    var args = _.reject(argNames, isDefine);
    var defines = _.filter(argNames, isDefine).concat(['NODECL']);

    var defVal = {dirty: true, val: null};
    var argValues = _.object(
        _.map(args, function (name) { return [name, defVal]; })
    );
    var defValues = _.object(
        _.map(defines, function (name) { return [name, null]; })
    );
    Object.seal(argValues);
    Object.seal(defValues);

    // If kernel has no defines, compile right away
    var qKernel = _.without(defines, 'NODECL').length === 0 ? compile() : Q(null);

    // {String -> Value} -> Kernel
    this.set = function (args) {
        logger.trace('Setting args for kernel', this.name);

        var mustRecompile = false;
        _.each(args, function (val, arg) {
            if (arg in argValues) {
                if (val === undefined || typeof val === 'null') {
                    logger.trace('Setting argument %s to %s', arg, val);
                }

                argValues[arg] = {dirty: true, val: val};
            } else if (arg in defValues) {
                if (val !== defValues[arg]) {
                    mustRecompile = true;
                }
                defValues[arg] = val;
            } else {
                logger.die('Kernel %s has no argument/define named %s', name, arg);
            }
        });

        if (mustRecompile) {
            qKernel = compile();
        }

        return this;
    };

    this.get = function(arg) {
        if (_.contains(defines, arg)) {
            return defValues[arg];
        } else if (_.contains(args, arg)) {
            return argValues[arg].val;
        } else {
            logger.warn('Kernel %s has no parameter %s', name, arg);
            return undefined;
        }
    };

    function compile () {
        logger.trace('Compiling kernel', that.name);

        _.each(defValues, function (arg, val) {
            if (val === null) {
                logger.die('Define %s of kernel %s was never set', arg, name);
            }

        });

        var prefix = _.flatten(_.map(defValues, function (val, key) {
            if (typeof val === 'string' || typeof val === 'number' || val === true) {
                return ['#define ' + key + ' ' + val];
            } else if (val === null) {
                return ['#define ' + key];
            } else {
                return [];
            }
        }), true).join('\n');
        logger.trace('Prefix', prefix);

        return source.then(function (source) {
            var processedSource = prefix + '\n\n' + source;
            // TODO: Alternative way of doing this, since we aren't using debug module anymore
            // if (config.ENVIRONMENT === 'local') {
            //     var debugFile = path.resolve(__dirname, '..', 'kernels', file + '.debug');
            //     fs.writeFileSync(debugFile, processedSource);
            // }

            return clContext.compile(processedSource, [name])
                .then(function (kernels) {
                    return kernels[name];
                });
        });
    };

    function setAllArgs(kernel) {
        logger.trace('Setting arguments for kernel', name)
        var i;
        try {
            for (i = 0; i < args.length; i++) {
                var arg = args[i];
                var val = argValues[arg].val;
                var dirty = argValues[arg].dirty;
                var type = argTypes[arg] || "cl_mem";
                if (val === null)
                    logger.trace('In kernel %s, argument %s is null', name, arg);

                if (dirty) {
                    logger.trace('Setting arg %d of kernel %s to value %s', i, name, val);
                    ocl.setKernelArg(kernel, i, val, type);
                    argValues[arg].dirty = false;
                }
            }

        } catch (e) {
            log.makeQErrorHandler(logger, 'Error setting argument %s of kernel %s', args[i], name)(e);
        }
    };

    function call(kernel, workItems, buffers, workGroupSize) {
        // TODO: Consider acquires and releases of buffers.

        var queue = clContext.queue;
        logger.trace('Enqueuing kernel %s', that.name, kernel);
        var start = process.hrtime();
        ocl.enqueueNDRangeKernel(queue, kernel, 1, null, workItems, workGroupSize || null);
        if (synchronous) {
            logger.trace('Waiting for kernel to finish');
            ocl.finish(queue);
            var diff = process.hrtime(start);
            that.timings[that.totalRuns % maxTimings] = (diff[0] * 1000 + diff[1] / 1000000);
        }
        that.totalRuns++;
        return Q(that);
    }

    // [Int] * [String] -> Promise[Kernel]
    this.exec = function(numWorkItems, resources, workGroupSize) {
        return qKernel.then(function (kernel) {
            if (kernel === null) {
                logger.error('Kernel is not compiled, aborting');
                return Q();
            } else {
                setAllArgs(kernel);
                return call(kernel, numWorkItems, resources, workGroupSize);
            }
        });
    }
}

// () -> Stats
Kernel.prototype.runtimeStats = function () {
    var runs = this.timings.length;
    var mean =  _.reduce(this.timings, function (a, b) {return a + b;}, 0) / runs;
    var stdDev =
        _.reduce(this.timings, function (acc, t) {
            return acc + (t - mean) * (t - mean);
        }, 0) / (runs > 1 ? runs - 1 : runs);

    var pretty = sprintf('%25s:%4s ±%4s        #runs:%4d', this.name,
                         mean.toFixed(0), stdDev.toFixed(0), this.totalRuns);
    return {
        name: this.name,
        runs: this.totalRuns,
        mean: mean,
        stdDev: stdDev,
        pretty: pretty
    }
}

module.exports = Kernel;
