'use strict';


var path = require('path'),
    fs = require('fs'),
    Q = require('q'),
    _ = require('underscore'),
    log = require('common/logger.js'),
    logger = log.createLogger('util');


function getShaderSource(id) {
    var shader_path = path.resolve(__dirname, '..' ,'shaders', id);
    logger.trace('Fetching source for shader %s at path %s, using fs read', id, shader_path);
    return Q.denodeify(fs.readFile)(shader_path, {encoding: 'utf8'});
}


function getKernelSource(id) {
    var kernel_path = path.resolve(__dirname, '.' ,'kernels', id);
    logger.trace('Fetching source for kernel %s at path %s, using fs read', id, kernel_path);
    return Q.denodeify(fs.readFile)(kernel_path, {encoding: 'utf8'});
}

// Should be used as a (mostly) drop in replacement for Q.all when you want each promise to run sequentially
// instead of in parallel. It requires an array of functions that produce promises (as opposed to an array of promises)
function chainQAll (arr) {
    var values = [];
    var chain = Q();

    _.each(arr, function (func, i) {
        chain = chain.then(function () {
            return func().then(function (val) {
                values[i] = val;
                return;
            });
        });

    });

    return chain.then(function () {
        return values;
    });
}


/**
 * Fetch an image as an HTML Image object
 *
 * @returns a promise fulfilled with the HTML Image object, once loaded
 */
function getImage(url) {
    var deferred = Q.defer();
    try {
        var img = new Image();

        img.onload = function() {
            logger.trace("Done loading <img>");

            deferred.resolve(img);
        };

        logger.trace("Loading <img> from src %s", url);
        img.src = url;
        logger.trace("  <img> src set");
    } catch (e) {
        deferred.reject(e);
    }

    return deferred.promise;
}


function rgb(r, g, b, a) {
    if (a === undefined)
        a = 255;
    // Assume little endian machines
    return (a << 24) | (b << 16) | (g << 8) | r;
}


var palettes = {
    palette1: [
        rgb(234,87,61), rgb(251,192,99), rgb(100,176,188), rgb(68,102,153),
        rgb(85,85,119)
    ],
    blue_palette: [
        rgb(247,252,240), rgb(224,243,219), rgb(204,235,197), rgb(168,221,181),
        rgb(123,204,196), rgb(78,179,211),  rgb(43,140,190),  rgb(8,104,172),
        rgb(8,64,129)
    ],
    green2red_palette: [
        rgb(0,104,55),    rgb(26,152,80),   rgb(102,189,99),
        rgb(166,217,106), rgb(217,239,139), rgb(255,255,191), rgb(254,224,139),
        rgb(253,174,97),  rgb(244,109,67),  rgb(215,48,39),   rgb(165,0,38)],
    qual_palette1: [
        rgb(141,211,199), rgb(255,255,179), rgb(190,186,218), rgb(251,128,114),
        rgb(128,177,211), rgb(253,180,98),  rgb(179,222,105), rgb(252,205,229),
        rgb(217,217,217), rgb(188,128,189), rgb(204,235,197), rgb(255,237,111)
    ],
    qual_palette2: [
        rgb(166,206,227), rgb(31,120,180), rgb(178,223,138), rgb(51,160,44),
        rgb(251,154,153), rgb(227,26,28),  rgb(253,191,111), rgb(255,127,0),
        rgb(202,178,214), rgb(106,61,154), rgb(255,255,153), rgb(177,89,40)
    ]
};


function int2color(values, palette) {
    palette = palette || palettes.palette1;

    logger.trace("Palette: %o", palette)

    var ncolors = palette.length;
    return _.map(values, function (val) {
        return palette[val % ncolors];
    });
}


// (->) * string * (->) * ... -> ()
// Run function and print timing data
// Curry to create a timed function wrapper
function perf (perf, name, fn /* args */) {
    var t0 = Date.now();
    var res = fn.apply({}, Array.prototype.slice.call(arguments, 3));
    perf(name, Date.now() - t0, 'ms');
    return res;
}

module.exports = {
    getShaderSource: getShaderSource,
    getKernelSource: getKernelSource,
    getImage: getImage,
    rgb: rgb,
    palettes: palettes,
    int2color: int2color,
    perf: perf,
    chainQAll: chainQAll
};
