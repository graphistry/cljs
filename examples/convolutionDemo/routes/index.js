var express = require('express');
var router = express.Router();
var convolve = require('../convolve.js');
var getPixels = require('get-pixels');
var savePixels = require('save-pixels');
var toArray = require('stream-to-array');
// var cljs = require('../../../cl.js');

// var imgName = 'flower.jpg';
var imgName = 'redpandasmall.jpg';

/* GET home page. */
router.get('/', function(req, res, next) {

    getPixels('public/images/' + imgName, function(err, pixels) {
        if(err) {
            console.log("Bad image path");
            return;
        }
        // width, height, depth
        // x, y, channels
        var size = pixels.shape.slice();
        var width = size[0];
        var height = size[1];
        var channels = size[2];
        var totalLength = width*height*channels;

        var rawData = new Uint8Array(totalLength);

        // Rowwise
        var offset = 0;
        for (var w = 0; w < width; w++) {
            for (var h = 0; h < height; h++ ) {
                for (var c = 0; c < channels; c++) {
                    var val = pixels.get(w,h,c);
                    rawData[offset] = val;
                    offset++;
                }
            }
        }

        var start = Date.now();


        // Process pixels
        // rawData = convolve.blur(rawData, width, height);
        rawData = convolve.edgeDetection(rawData, width, height);
        rawData.then(function (rawData) {

            var end = Date.now();
            var duration = end - start;


            // Toss raw data back into pixels;
            offset = 0;
            for (var w = 0; w < width; w++) {
                for (var h = 0; h < height; h++ ) {
                    for (var c = 0; c < channels; c++) {
                        var val = rawData[offset];
                        pixels.set(w,h,c,val);
                        offset++;
                    }
                }
            }


            var stream = savePixels(pixels, "png");
            toArray(stream, function (err, parts) {
                var buffers = [];
                for (var i = 0, l = parts.length; i < l ; ++i) {
                    var part = parts[i];
                    buffers.push((part instanceof Buffer) ? part : new Buffer(part));
                }
                var buf = Buffer.concat(buffers);

                var base64Encoded = buf.toString('base64');

                var prefix = 'data:image/png;base64,';
                var imageUrl = prefix + base64Encoded;

                res.render('index', {
                    title: 'Edge Detection Demo',
                    duration: String(duration) + ' ms to compute.',
                    imageUrl: imageUrl,
                    imageUrl2: 'http://localhost:3001/images/' + imgName
                });
            });


        });

    });
});

module.exports = router;
