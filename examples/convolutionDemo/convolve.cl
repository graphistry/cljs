


inline int isValidImageIndex(int idx, int numElements) {
    return (idx >= 0 && idx < numElements);
}

inline int isTransparencyNotColor(int idx) {
    return (idx % 4) == 3;
}

inline uchar make8Bit(int val) {
    if (val < 0) {
        val = 0;
    }
    if (val > 255) {
        val = 255;
    }
    return (uchar) val;
}


__kernel void convolve(
    __global uchar* imageData,
    __global int* mask,
    int width,
    int height,
    int numElements,
    __global uchar* newImageData
){

    int centerIdx = get_global_id(0);
    int sum = 0;

    for (int dx = -1; dx <= 1; dx++) {
        for (int dy = -1; dy <= 1; dy++) {
            int idx = centerIdx + (4 * width * dy) + (4 * dx);
            idx = isValidImageIndex(idx, numElements) ? idx : centerIdx;
            int scaleFromMask = mask[(dy+1)*3 + (dx+1)];
            sum += ((int) imageData[idx]) * scaleFromMask;
        }
    }

    if (isTransparencyNotColor(centerIdx)) {
        sum = (uchar) 255;
    }

    newImageData[centerIdx] = make8Bit(sum);

}
















