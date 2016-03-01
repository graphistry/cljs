#!/usr/bin/env node

var CLjs      = require('../src/cl.js');

var cl = new CLjs();

var ones = new Int32Array([1,1,1]);
var twos = new Int32Array([2,2,2]);
var numElements = 3;

// These are NOT promises
var onesBuffer = cl.createBuffer(ones);
var twosBuffer = cl.createBuffer(twos);
var outputBuffer = cl.createBuffer(Int32Array.BYTES_PER_ELEMENT * numElements);

var argTypes = [cl.types.mem_t, cl.types.mem_t, cl.types.mem_t, cl.types.int_t];
var addKernel = cl.createKernel('tests/add.cl', 'add', argTypes);
var args = [onesBuffer, twosBuffer, outputBuffer, numElements];

addKernel.run([256], [256], args)
    .then(function (info) {
        console.log('Ran');
        var result = outputBuffer.read(Int32Array);
        console.log('Result is: ', result);
    });
