"use strict";

var Q = require('q');
var _ = require('underscore');
var nodeutil = require('util');
var path = require('path');

var ocl = require('node-opencl');

// TODO: remove types from SimCL, since they are no longer needed
var types = {
    char_t: "char",
    double_t: "double",
    float_t: "float",
    half_t: "half",
    int_t: "int",
    local_t: "__local",
    long_t: "long",
    short_t: "short",
    uchar_t: "uchar",
    uint_t: "uint",
    ulong_t: "ulong",
    ushort_t: "ushort",
    float2_t: "float2",
    float3_t: "float3",
    float4_t: "float4",
    float8_t: "float8",
    float16_t: "float16",
    define: '#define',
};

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

var create = Q.promised(function(device, vendor) {
    vendor = vendor || 'default';
    device = device || 'all';
    var clDevice = clDeviceType[device.toLowerCase()];
    if (!clDevice) {
        console.log('Unknown device %s, using "all"', device);
        clDevice = clDeviceType.all;
    }
    return createCLContextNode(renderer, clDevice, vendor.toLowerCase());
});


function createCLContextNode(DEVICE_TYPE, vendor) {
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
    console.log("Found %d OpenCL platforms; using first", platforms.length);
    var platform = platforms[0];

    var clDevices = ocl.getDeviceIDs(platform, DEVICE_TYPE);

    console.log("Devices found on platform: %d", clDevices.length);
    if(clDevices.length < 1) {
        throw new Error("No OpenCL devices of specified type (" + DEVICE_TYPE + ") found");
    }

    var devices = clDevices.map(function(d) {
        console.log("Found device %s", nodeutil.inspect(d, {depth: null, showHidden: true, colors: true}));

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

    if (vendor === 'default') {
        vendor = defaultVendor;
    }

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
    var clErrorHandler = function(){
        // TODO
    };
    for (i = 0; i < devices.length && deviceWrapper === null; i++) {
        wrapped = devices[i];

        try {
            wrapped.context = ocl.createContext([ocl.CONTEXT_PLATFORM, platform],
                                                   [wrapped.device], clErrorHandler,
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
            console.log("Skipping device %d due to error %o. %o", i, e, wrapped);
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

    console.log('OpenCL    Type:%s  Vendor:%s  Device:%s',
                props.TYPE, props.VENDOR, props.NAME);

    // extract supported OpenCL version
    props.MAX_CL_VERSION = props.VERSION.substring(7,10);

    console.log('Device Sizes   WorkGroup:%d  WorkItem:%s', props.MAX_WORK_GROUP_SIZE,
         props.MAX_WORK_ITEM_SIZES);
    console.log('Max Mem (kB)   Global:%d  Alloc:%d  Local:%d  Constant:%d',
          props.GLOBAL_MEM_SIZE / 1024, props.MAX_MEM_ALLOC_SIZE / 1024,
          props.LOCAL_MEM_SIZE / 1024, props.MAX_CONSTANT_BUFFER_SIZE / 1024);
    console.log('Profile (ns)   Type:%s  Resolution:%d',
         props.PROFILE, props.PROFILING_TIMER_RESOLUTION);

    var res = {
        cl: ocl,
        context: deviceWrapper.context,
        device: deviceWrapper.device,
        queue: deviceWrapper.queue,
        deviceProps: props,
        maxThreads: ocl.getDeviceInfo(deviceWrapper.device, ocl.DEVICE_MAX_WORK_GROUP_SIZE),
        numCores: ocl.getDeviceInfo(deviceWrapper.device, ocl.DEVICE_MAX_COMPUTE_UNITS)
    };

    //FIXME ??
    res.compile = compile.bind(this, res);
    res.createBuffer = createBuffer.bind(this, res);
    res.createBufferGL = createBufferGL.bind(this, res);
    res.finish = finish;

    return res;
}


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
var compile = Q.promised(function (cl, source, kernels) {
    perf.startTiming('graph-viz:cl:compilekernel');

    console.log('Kernel: ', kernels[0]);
    console.log('Compiling kernels');

    var program;
    try {
        // compile and link program
        program = ocl.createProgramWithSource(cl.context, source);
        // Note: Include dir is not official webcl, won't work in the browser.
        var includeDir = path.resolve(__dirname, '..', 'kernels');
        var clver = '';
        // use OpenCL 2.0 if available
        if (parseFloat(cl.deviceProps.MAX_CL_VERSION) >= 2.0 && ocl.VERSION_2_0) {
            clver = ' -cl-std=CL2.0';
        }
        ocl.buildProgram(program, [cl.device], '-I ' + includeDir + ' -cl-fast-relaxed-math ' + clver);

        // create kernels
        try {
            var kernelsObjs = typeof kernels === "string" ? [ 'unknown' ] : kernels;
            var compiled = _.object(kernelsObjs.map(function (kernelName) {
                    console.log('    Compiling', kernelName);
                    return [kernelName, ocl.createKernel(program, kernelName)];
            }));
            console.log('    Compiled kernels');

            return typeof kernels === "string" ? compiled.unknown : compiled;
        } catch (e) {
            // log.makeQErrorHandler(logger, 'Kernel creation error:')(e);
        }
    } catch (e) {
        try {
            var buildLog = ocl.getProgramBuildInfo(program, cl.device, ocl.PROGRAM_BUILD_LOG)
            // log.makeQErrorHandler(logger, 'OpenCL compilation error')(buildLog);
        } catch (e2) {
            // log.makeQErrorHandler(logger, 'OpenCL compilation failed, no build log possible')(e2);
        }
    }
});



var acquire = function (buffers) {
    return Q.all(
        (buffers||[]).map(function (buffer) {
            return buffer.acquire();
        }));
};


var release = function (buffers) {
    return Q.all(
        (buffers||[]).map(function (buffer) {
            return buffer.release();
        }));
};


// Executes the specified kernel, with `threads` number of threads, acquiring/releasing any needed resources
var call = Q.promised(function (kernel, globalSize, buffers, localSize) {
    return acquire(buffers)
        .then(function () {
            var workgroup;
            if (localSize === undefined || localSize === null) {
                workgroup = null;
            } else {
                workgroup = [localSize];
            }
            var global = [globalSize];
            // TODO: passing `null` might a problem with node-opencl
            ocl.enqueueNDRangeKernel(kernel.cl.queue, kernel.kernel, null, global, workgroup);
        })
        // .fail(log.makeQErrorHandler(logger, 'Kernel error'))
        // TODO: need GL buffer interoperability?
        //.then(release.bind('', buffers)) // Release of GL buffers
        .then(function () {
            // wait for kernel to finish
            // TODO: isn't this also called somewhere else?
            ocl.finish(kernel.cl.queue);
        })
        .then(_.constant(kernel));
});

var finish = function(queue) {
    ocl.finish(queue);
};

var createBuffer = Q.promised(function(cl, size, name) {
    console.log("Creating buffer %s, size %d", name, size);

    var buffer = ocl.createBuffer(cl.context, ocl.MEM_READ_WRITE, size);

    if (buffer === null) {
        throw new Error("Could not create the OpenCL buffer");
    }

    var bufObj = {
        "name": name,
        "buffer": buffer,
        "cl": cl,
        "size": size,
        // FIXME: acquire and release could be removed after GL dependencies are
        //        scraped
        "acquire": function() {
            return Q();
        },
        "release": function() {
            return Q();
        }
    };
    bufObj.delete = Q.promised(function() {
        //buffer.release();
        ocl.ReleaseMemObject(buffer);
        bufObj.size = 0;
        return null;
    });
    bufObj.write = write.bind(this, bufObj);
    bufObj.read = read.bind(this, bufObj);
    bufObj.copyInto = copyBuffer.bind(this, cl, bufObj);
    return bufObj;
});


// TODO: If we call buffer.acquire() twice without calling buffer.release(), it should have no
// effect.
function createBufferGL(cl, vbo, name) {
    console.log("Creating buffer %s from GL buffer", name);

    if(vbo.gl === null) {
        console.log("GL not enabled; falling back to creating CL buffer");
        return createBuffer(cl, vbo.len, name)
            .then(function(bufObj) {
                if(vbo.data !== null) {
                    return bufObj.write(vbo.data);
                } else {
                    return bufObj;
                }
            })
            .then(function(bufObj) {
                // Delete reference to data once we've written it, so we don't leak memory
                bufObj.data = null;
                return bufObj;
            });
    }

    throw new Error("shared GL/CL buffers not supported by node-opencl");
}


var copyBuffer = Q.promised(function (cl, source, destination) {
    console.log("Copying buffer. Source: %s (%d bytes), destination %s (%d bytes)",
        source.name, source.size, destination.name, destination.size);
    return acquire([source, destination])
        .then(function () {
            ocl.enqueueCopyBuffer(cl.queue, source.buffer, destination.buffer, 0, 0, Math.min(source.size, destination.size));
        })
        // .then(function () {
        //     cl.queue.finish();
        // })
        .then(release.bind(null, [source, destination]));
});


var write = Q.promised(function write(buffer, data) {
    console.log('Writing to buffer', buffer.name, buffer.size, 'bytes');

    // Attempting to write data of size 0 seems to crash intel GPU drivers, so return.
    if (data.byteLength === 0) {
        return Q(buffer);
    }

    // TODO acquire not needed if GL is dropped
    return buffer.acquire()
        .then(function () {
            console.log('Writing Buffer', buffer.name, ' with byteLength: ', data.byteLength);
            ocl.enqueueWriteBuffer(buffer.cl.queue, buffer.buffer, true, 0, data.byteLength, data);
            return buffer.release();
        })
        .then(function() {
            // buffer.cl.queue.finish();
            console.log("Finished buffer %s write", buffer.name);

            return buffer;
        });
});


var read = Q.promised(function (buffer, target, optStartIdx, optLen) {
    console.log('Reading from buffer', buffer.name);
    var start = Math.min(optStartIdx || 0, buffer.size);
    var len = optLen !== undefined ? optLen : (buffer.size - start);

    if (len === 0) {
        return Q(buffer);
    }

    return buffer.acquire()
        .then(function() {
            console.log('Reading Buffer', buffer.name, start, len);
            ocl.enqueueReadBuffer(buffer.cl.queue, buffer.buffer, true, start, len, target);
            // TODO acquire and release not needed if GL is dropped
            return buffer.release();
        })
        .then(function() {
            console.log('Done Reading: ', buffer.name);
            return buffer;
        });
        // .fail(log.makeQErrorHandler(logger, 'Read error for buffer', buffer.name));
});


module.exports = {
    "acquire": acquire,
    "call": call,
    "compile": compile,
    "create": create,
    "createBuffer": createBuffer,
    "createBufferGL": createBufferGL,
    "release": release,
    "types": types,
    "write": write,
    "read": read
};
