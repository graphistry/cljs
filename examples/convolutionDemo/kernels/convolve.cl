


inline int inBounds(int idx) {
    return (idx >= 0 && idx < numElements);
}

inline int getChannel(int idx) {
    return idx % 4;
}

inline int make8Bit(int val) {
    if (val < 0) {
        val = 0;
    }
    if (val > 255) {
        val = 255;
    }
    return (uint8) val;
}


__kernel void convolve(
    __global uint8* imageData,
    __global int* mask,
    int width,
    int height,
    int numElements,
    __global uint8* newImageData
){

    int numChannels = 4;
    int gid = get_global_id(0);
    if (gid < numElements) {
        int center = gid;
        int channel = getChannel(gid);
        if (channel === 3) {
            newImageData[center] = imageData[center];
        } else {
            int val = 0;
            for (int x = -1; x < 2; x++) {
                for (int y = -1; y < 2; y++) {
                    int idx = gid + (numChannels * width * y) + (numChannels * x);
                    idx = inBounds(idx) ? idx : center;
                    int dataScaled = ((int) imageData[idx]) * mask[(y+1)*3 + (x+1)];
                    val += dataScaled;
                }
            }

            newImageData[center] = make8Bit(val);
        }

    }
}
