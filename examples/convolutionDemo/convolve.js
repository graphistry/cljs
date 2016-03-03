"use strict";

var _ = require('underscore');
var Q = require('q');

var CLjs = require('../../src/cl.js');
var cl = new CLjs();

function blur (imageData, width, height) {

    var oneNinth = 0.111111;
    var mask = [
        [oneNinth, oneNinth, oneNinth],
        [oneNinth, oneNinth, oneNinth],
        [oneNinth, oneNinth, oneNinth]
    ];

    return convolve(imageData, width, height, mask);

}

function edgeDetection (imageData, width, height, opencl) {

    var mask = new Int32Array([
        -1, -1, -1,
        -1, 8, -1,
        -1, -1, -1
    ]);

    var convolve = opencl ? convolveCl : convolveJs;
    return convolve(imageData, width, height, mask);
}

function convolveCl(imageData, width, height, mask) {
    // Fast Code Here

    var numElements = imageData.length;
    var imageBuffer = cl.createBuffer(imageData);
    var maskBuffer = cl.createBuffer(mask);
    var outputBuffer = cl.createBuffer(imageData.byteLength);

    var mem_t = cl.types.mem_t;
    var int_t = cl.types.int_t;
    var argTypes = [mem_t, mem_t, int_t, int_t, int_t, mem_t];
    var kernel = cl.createKernel('convolve.cl', 'convolve', argTypes);
    var args = [imageBuffer, maskBuffer, width, height, numElements, outputBuffer];

    return kernel.run([numElements], null, args)
        .then(function() {
            return outputBuffer.read(Uint8Array);
        });

}


function convolveJs(imageData, width, height, mask) {

    var newImageData = new Uint8Array(imageData.length);
    var off = offset.bind(null, width, height, 4);

    var inBounds = function (idx) {
        return !(idx < 0 || idx >= imageData.length);
    }

    for (var h = 0; h < height; h++) {
        for (var w = 0; w < width; w++) {
            for (var c = 0; c < 4; c++) {

                if (c === 3) {
                    var center = off(w,h,c);
                    newImageData[center] = imageData[off(w,h,c)];

                } else {
                    var val = 0;
                    var center = off(w,h,c);
                    for (var x = -1; x < 2; x++) {
                        for (var y = -1; y < 2; y++) {
                            var idx = off(w+x, h+y, c);
                            idx = inBounds(idx) ? idx : center;
                            var dataScaled = imageData[idx] * mask[(y+1)*3 + (x+1)];
                            val += dataScaled;
                        }
                    }

                    newImageData[center] = make8Bit(val);
                }
            }
        }
    }

    return Q(newImageData);
}

function make8Bit (val) {
    if (val < 0) {
        val = 0;
    }
    if (val > 255) {
        val = 255;
    }
    return val;
}



function offset(width, height, channels, w, h, c) {
    // console.log('width, height, channels: ', width, height, channels);
    var idx = h * width * channels;
    idx += w * channels;
    idx += c;
    return idx;
}

module.exports = {
    blur: blur,
    edgeDetection: edgeDetection,
};

    // var imageBuffer = cl.createBuffer(imageData);
    // var maskBuffer = cl.createBuffer(mask);
    // var outputBuffer = cl.createBuffer(imageData.byteLength);
    // var numElements = imageData.length;

    // var argTypes = [cl.types.mem_t, cl.types.mem_t, cl.types.int_t, cl.types.int_t, cl.types.int_t, cl.types.mem_t];
    // var kernel = cl.createKernel('convolve.cl', 'convolve', argTypes);
    // var args = [imageBuffer, maskBuffer, width, height, numElements, outputBuffer];

    // return kernel.run([numElements], false, args)
    //     .then(function () {
    //         return outputBuffer.read(Uint8Array);
    //     });


