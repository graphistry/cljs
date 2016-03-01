var CLjs      = require('../cl.js');

var cl = new CLjs();

var ones = new Int32Array([1,1,1]);
var twos = new Int32Array([2,2,2]);
var numElements = 3;

// These are NOT promises
var onesBuffer = cl.createBuffer(ones);
var twosBuffer = cl.createBuffer(twos);
var outputBuffer = cl.createBuffer(Int32Array.BYTES_PER_ELEMENT * numElements);

var argTypes = [cl.types.mem_t, cl.types.mem_t, cl.types.mem_t, cl.types.int_t];
var addKernel = cl.createKernel('add.cl', 'add', argTypes);
var args = [onesBuffer, twosBuffer, outputBuffer, numElements];

addKernel.run([256], [256], args)
    .then(function (info) {
        console.log('Ran');
        var result = outputBuffer.read(Int32Array);
        console.log('Result is: ', result);
    });

/*
// 1 "instruction", 1 datum
var half = value / 2;

// 1 "instruction", many data
var halves = values.map(function (value) {
    return value / 2;
});


__kernel void halve(
    __global int* values,
    __global int* output
){
    int id = get_global_id(0); // Which data to work on
    output[id] = values[id] / 2; // Do work and write
}




var cl = new CLjs();
var kernel = cl.createKernel('file.cl', 'halve', argTypes);
var dataBuffer = cl.createBuffer(myData);
var outputBuffer = cl.createBuffer(outputSize);
kernel.run(numElements, dataBuffer, outputBuffer);
var result = outputBuffer.read(Int32Array);
*/


/*
// Setup Context
var ocl = require('node-opencl');
var fs  = require('fs');
var myData = new Int32Array([2,4,8]);

var platforms = ocl.getPlatformIDs();
var platform = platforms[0];
var devices = ocl.getDeviceIDs(platform, ocl.DEVICE_TYPE_ALL);
var clErrorHandler = function (e) { throw e;};
var context = ocl.createContext([ocl.CONTEXT_PLATFORM, platform],
        devices, clErrorHandler, clErrorHandler);
var queue = ocl.createCommandQueue(context, devices[0], 0);

// Make Kernel
var source = fs.readFileSync('../kernels/halve.cl', encoding='utf8');
var kernelName = 'halve';
var program = ocl.createProgramWithSource(context, source);
var OPTIONAL_COMPILER_FLAGS = '';
ocl.buildProgram(program, devices, OPTIONAL_COMPILER_FLAGS);
var kernel = ocl.createKernel(program, kernelName);

// Make Data Buffers
var dataBuffer = ocl.createBuffer(context, ocl.MEM_READ_WRITE, myData.byteLength);
ocl.enqueueWriteBuffer(queue, dataBuffer, true, 0, myData.byteLength, myData);
var outputBuffer = ocl.createBuffer(context, ocl.MEM_READ_WRITE, myData.byteLength);

// Set Args
ocl.setKernelArg(kernel, 0, dataBuffer, 'cl_mem');
ocl.setKernelArg(kernel, 1, outputBuffer, 'cl_mem');

// Execute and Read
var numElements = dataBuffer.length;
ocl.enqueueNDRangeKernel(queue, kernel, 1, null, numElements, null);
ocl.finish(queue);

var resultBuffer = new Int32Array(myData.length);
ocl.enqueueReadBuffer(queue, outputBuffer, true, 0, resultBuffer.byteLength, resultBuffer);
var result = resultBuffer;


*/







