
__kernel void add(
    __global int* buffer1,
    __global int* buffer2,
    __global int* outputBuffer,
    int numElements
){

    int gid = get_global_id(0);
    if (gid < numElements) {
        outputBuffer[gid] = buffer1[gid] + buffer2[gid];
    }

}
