'use strict';

var Q = require('q');
var _ = require('underscore');
var nodeutil = require('util');
var Kernel = require('./kernel.js');
var CLBuffer = require('./clBuffer.js');
var types = require('./types.js');
var ocl = require('node-opencl');

var log = require('./logger.js');
var logger = log.createLogger('cljs:cl');

var defaultVendor = 'nvidia';

var clDeviceType = {
    'cpu': ocl.DEVICE_TYPE_CPU,
    'gpu': ocl.DEVICE_TYPE_GPU,
    'all': ocl.DEVICE_TYPE_ALL,
    'any': ocl.DEVICE_TYPE_ALL,
    'default': ocl.DEVICE_TYPE_ALL
};


// TODO: in call() and setargs(), we currently requires a `argTypes` argument becuase older WebCL
// versions require us to pass in the type of kernel args. However, current versions do not. We want
// to keep this API as close to the current WebCL spec as possible. Therefore, we should not require
// that argument, even on old versions. Instead, we should query the kernel for the types of each
// argument and fill in that information automatically, when required by old WebCL versions.

var CLjs = function(device, vendor) {
    vendor = vendor || defaultVendor;
    device = device || 'all';
    this.types = types;
    var clDevice = clDeviceType[device.toLowerCase()];
    if (!clDevice) {
        logger.warn('Unknown device %s, using "all"', device);
        clDevice = clDeviceType.all;
    }
    this.createCLContextNode(clDevice, vendor.toLowerCase());
};


CLjs.prototype.createCLContextNode = function (DEVICE_TYPE, vendor) {
    if (ocl === undefined) {
        throw new Error("No OpenCL found.");
    }

    if (ocl === null) {
        throw new Error("Can't access OpenCL object");
    }

    var platforms = ocl.getPlatformIDs();
    if (platforms.length === 0) {
        throw new Error("Can't find any OpenCL platforms");
    }
    logger.debug("Found %d OpenCL platforms; using first", platforms.length);
    var platform = platforms[0];

    var clDevices = ocl.getDeviceIDs(platform, DEVICE_TYPE);

    logger.debug("Devices found on platform: %d", clDevices.length);
    if(clDevices.length < 1) {
        throw new Error("No OpenCL devices of specified type (" + DEVICE_TYPE + ") found");
    }

    var devices = clDevices.map(function(d) {
        logger.debug("Found device %s", nodeutil.inspect(d, {depth: null, showHidden: true, colors: true}));

        var typeToString = function (v) {
            return v === ocl.DEVICE_TYPE_CPU ? 'CPU'
                : v === ocl.DEVICE_TYPE_GPU ? 'GPU'
                : v === ocl.DEVICE_TYPE_ACCELERATOR ? 'ACCELERATOR'
                : v === ocl.DEVICE_TYPE_DEFAULT ? 'DEFAULT'
                : ('unknown type: ' + v);
        };

        // TODO: this is definitely not the number of compute units
        var computeUnits = ocl.getDeviceInfo(d, ocl.DEVICE_MAX_WORK_ITEM_SIZES)
            .reduce(function(a, b) {
                return a * b;
            });

        return {
            device: d,
            deviceType: typeToString(ocl.getDeviceInfo(d, ocl.DEVICE_TYPE)),
            computeUnits: computeUnits
        };
    });

    // sort devices first by "nvidia" and then by "computeUnits"
    devices.sort(function(a, b) {
        // FIXME: the number of compute units is calculated weirdly
        var nameA = ocl.getDeviceInfo(a.device, ocl.DEVICE_VENDOR).toLowerCase();
        var nameB = ocl.getDeviceInfo(b.device, ocl.DEVICE_VENDOR).toLowerCase();

        if (nameA.indexOf(vendor) !== -1 && nameB.indexOf(vendor) === -1) {
            return -1;
        }
        if (nameB.indexOf(vendor) !== -1 && nameA.indexOf(vendor) === -1) {
            return 1;
        }
        return b.computeUnits - a.computeUnits;
    });


    var deviceWrapper = null, err = null;
    var i;
    var wrapped;
    var clErrorHandler = function(err){
        log.makeQErrorHandler('General CL Error')(err);
    };
    for (i = 0; i < devices.length && deviceWrapper === null; i++) {
        wrapped = devices[i];

        try {
            wrapped.context = ocl.createContext([ocl.CONTEXT_PLATFORM, platform],
                                                [wrapped.device],
                                                clErrorHandler,
                                                clErrorHandler);

            if (wrapped.context === null) {
                throw new Error("Error creating WebCL context");
            }

            if (ocl.VERSION_2_0) {
                wrapped.queue = ocl.createCommandQueueWithProperties(wrapped.context, wrapped.device, []);
            } else {
                wrapped.queue = ocl.createCommandQueue(wrapped.context, wrapped.device, 0);
            }
            deviceWrapper = wrapped;
        } catch (e) {
            logger.log("Skipping device %d due to error %o. %o", i, e, wrapped);
            err = e;
        }
    }

    if (deviceWrapper === null) {
        throw (err !== null ? err : new Error("A context could not be created from an available device"));
    }

    var attribs = [
        'NAME', 'VENDOR', 'VERSION', 'PROFILE', 'PLATFORM',
        'MAX_WORK_GROUP_SIZE', 'MAX_WORK_ITEM_SIZES', 'MAX_MEM_ALLOC_SIZE',
        'GLOBAL_MEM_SIZE', 'LOCAL_MEM_SIZE','MAX_CONSTANT_BUFFER_SIZE',
        'MAX_CONSTANT_BUFFER_SIZE', 'PROFILE', 'PROFILING_TIMER_RESOLUTION'
    ];


    var props = _.object(attribs.map(function (name) {
        return [name, ocl.getDeviceInfo(deviceWrapper.device, ocl['DEVICE_' + name])];
    }));
    props.TYPE = deviceWrapper.deviceType;

    logger.info('OpenCL    Type:%s  Vendor:%s  Device:%s',
                props.TYPE, props.VENDOR, props.NAME);

    // extract supported OpenCL version
    props.MAX_CL_VERSION = props.VERSION.substring(7,10);

    logger.info('Device Sizes   WorkGroup:%d  WorkItem:%s', props.MAX_WORK_GROUP_SIZE,
         props.MAX_WORK_ITEM_SIZES);
    logger.info('Max Mem (kB)   Global:%d  Alloc:%d  Local:%d  Constant:%d',
          props.GLOBAL_MEM_SIZE / 1024, props.MAX_MEM_ALLOC_SIZE / 1024,
          props.LOCAL_MEM_SIZE / 1024, props.MAX_CONSTANT_BUFFER_SIZE / 1024);
    logger.info('Profile (ns)   Type:%s  Resolution:%d',
         props.PROFILE, props.PROFILING_TIMER_RESOLUTION);

    this.cl = ocl;
    this.context = deviceWrapper.context;
    this.device = deviceWrapper.device;
    this.queue = deviceWrapper.queue;
    this.deviceProps = props;
    this.maxThreads = ocl.getDeviceInfo(deviceWrapper.device, ocl.DEVICE_MAX_WORK_GROUP_SIZE);
    this.numCores = ocl.getDeviceInfo(deviceWrapper.device, ocl.DEVICE_MAX_COMPUTE_UNITS);
};


CLjs.prototype.createKernel = function(filename, kernelName, argTypes) {
    var that = this;
    var kernel = new Kernel(that, kernelName, filename, argTypes);
    return kernel;
};


/**
 * Compile the WebCL program source and return the kernel(s) requested
 *
 * @param cl - the cljs instance object
 * @param {string} source - the source code of the WebCL program you wish to compile
 * @param {(string|string[])} kernels - the kernel name(s) you wish to get from the compiled program
 *
 * @returns {(kernel|Object.<string, kernel>)} If kernels was a single kernel name, returns a
 *          single kernel. If kernels was an array of kernel names, returns an object with each
 *          kernel name mapped to its kernel object.
 */
CLjs.prototype.compile = function (source, kernels, includeDir) {
    var that = this;

    logger.trace('Compiling kernels: ', kernels);

    var context = that.context;
    var device = that.device;

    var program;
    try {
        // compile and link program
        program = ocl.createProgramWithSource(context, source);

        // TODO: Take the cl-fast-relaxed-math as an optional parameter.
        var buildParams = ['-cl-fast-relaxed-math'];
        if (includeDir) {
            // Note: Include dir is not official webcl, won't work in the browser.
            buildParams.push('-I ' + includeDir);
        }
        if ( parseFloat(that.deviceProps.MAX_CL_VERSION) >= 2.0 && ocl.VERSION_2_0) {
            buildParams.push('-cl-std=CL2.0');
        }

        logger.trace('Building with', buildParams);
        ocl.buildProgram(program, [device], buildParams.join(' '));
        logger.trace('Build complete');

        // create kernels
        try {
            var kernelsObjs = typeof kernels === "string" ? [ 'unknown' ] : kernels;
            var compiled = _.object(kernelsObjs.map(function (kernelName) {
                    logger.debug('    Creating Kernel', kernelName);
                    return [kernelName, ocl.createKernel(program, kernelName)];
            }));
            logger.trace('    Created kernels');

            return typeof kernels === "string" ? compiled.unknown : compiled;
        } catch (e) {
            log.makeQErrorHandler(logger, 'Kernel creation error')(e);
        }
    } catch (e) {
        try {
            var buildLog = ocl.getProgramBuildInfo(program, that.device, ocl.PROGRAM_BUILD_LOG);
            log.makeQErrorHandler(logger, 'OpenCL compilation error')(buildLog);
        } catch (e2) {
            log.makeQErrorHandler(logger, 'Kernel creation error (no build log)')(e);
        }
    }
};


CLjs.prototype.finish = function () {
    return ocl.finish(this.queue);
};


CLjs.prototype.createBuffer = function (maybeObject, name) {
    var buffer;

    // Case where passed in array.
    if (maybeObject.length) {
        buffer = new CLBuffer(this, maybeObject.byteLength, name);
    // Case where size passed in.
    } else {
        buffer = new CLBuffer(this, maybeObject, name);
    }

    if (maybeObject.length) {
        return buffer.write(maybeObject);
    } else {
        return buffer;
    }

};


module.exports = CLjs;

