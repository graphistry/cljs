# CL.js

Library to make GPU acceleration as seamless and easy as calling an asynchronous function call. Built on top of [Node-OpenCL](https://github.com/mikeseven/node-opencl).


###### Current State
This is currently alpha quality. Many features have not been ported over and the API is likely to change.

## Quick Start

### Install

The package is not yet on the npm repository. You can install it from git:

```sh
git clone https://github.com/graphistry/cljs.git
cd cljs && npm link
```

### Test

```sh
npm run test
```
You should see the following output: `Result is:  [ 3, 3, 3 ]`

### Usage

Here is a minimal example:

```javascript
var cl = new CLjs();
var ones = new Int32Array([1,1,1]);
var twos = new Int32Array([2,2,2]);
var numElements = 3;

// Create input and output buffers
var onesBuffer = cl.createBuffer(ones);
var twosBuffer = cl.createBuffer(twos);
var outputBuffer = cl.createBuffer(Int32Array.BYTES_PER_ELEMENT * numElements);

// Create a kernel
var argTypes = [cl.types.mem_t, cl.types.mem_t, cl.types.mem_t, cl.types.int_t];
var addKernel = cl.createKernel('tests/add.cl', 'add', argTypes);

// Run the kernel...
addKernel
	.run([256], null, [onesBuffer, twosBuffer, outputBuffer, numElements])
	.then(function (info) {
		// ... and download results
   		var result = outputBuffer.read(Int32Array);
       console.log('Result is: ', Array.prototype.slice.call(result));
    });
```

## Going Further

Have a look at the edge detection demo in `cljs/examples/convolutionDemo`. To run it

1. `cd cljs/examples/convolutionDemo`
2. `npm start`
3. Open [localhost:3001?mode=opencl](http://localhost:3001?mode=opencl) in your browser. Compare the speed with [localhost:3001?mode=javascript](http://localhost:3001?mode=javascript)

The meat of the code are in `convolve.js` and `convolve.cl`