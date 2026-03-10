/**
 * Type definitions for OpenCV.js
 * These types are for compile-time type checking only.
 * OpenCV.js is loaded at runtime from CDN.
 */

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace cv {
  export class Mat {
    constructor();
    constructor(rows: number, cols: number, type: number, scalar?: Scalar);
    rows: number;
    cols: number;
    type(): number;
    data: Uint8Array | Int8Array | Uint16Array | Int16Array | Float32Array | Float64Array;
    data8U: Uint8Array;
    data16S: Int16Array;
    data32F: Float32Array;
    data64F: Float64Array;
    delete(): void;
  }

  export class MatVector {
    constructor();
    get(index: number): Mat;
    size(): number;
    push_back(mat: Mat): void;
    delete(): void;
  }

  export class Scalar {
    constructor(v0: number, v1?: number, v2?: number, v3?: number);
    v0: number;
    v1: number;
    v2: number;
    v3: number;
  }

  export class Point {
    constructor(x: number, y: number);
    x: number;
    y: number;
  }

  export class Size {
    constructor(width: number, height: number);
    width: number;
    height: number;
  }

  export class Rect {
    constructor(x: number, y: number, width: number, height: number);
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export class RotatedRect {
    constructor();
    center: Point;
    size: Size;
    angle: number;
  }

  export class Moments {
    constructor();
    m00: number;
    m10: number;
    m01: number;
    m20: number;
    m11: number;
    m02: number;
    m30: number;
    m21: number;
    m12: number;
    m03: number;
  }

  // Constants
  export const CV_8UC1: number;
  export const CV_8UC3: number;
  export const CV_8UC4: number;
  export const CV_16S: number;
  export const CV_16SC1: number;
  export const CV_32F: number;
  export const CV_32FC1: number;
  export const CV_64F: number;

  // Color conversion codes
  export const COLOR_BGR2GRAY: number;
  export const COLOR_RGB2GRAY: number;
  export const COLOR_BGR2HSV: number;
  export const COLOR_RGB2HSV: number;
  export const COLOR_BGR2RGB: number;
  export const COLOR_RGB2BGR: number;
  export const COLOR_BGR2RGBA: number;
  export const COLOR_RGB2RGBA: number;
  export const COLOR_RGBA2BGRA: number;

  // Contour retrieval modes
  export const RETR_EXTERNAL: number;
  export const RETR_LIST: number;
  export const RETR_CCOMP: number;
  export const RETR_TREE: number;

  // Contour approximation methods
  export const CHAIN_APPROX_NONE: number;
  export const CHAIN_APPROX_SIMPLE: number;

  // Morphological operations
  export const MORPH_ERODE: number;
  export const MORPH_DILATE: number;
  export const MORPH_OPEN: number;
  export const MORPH_CLOSE: number;
  export const MORPH_GRADIENT: number;
  export const MORPH_ELLIPSE: number;

  // Border types
  export const BORDER_CONSTANT: number;
  export const BORDER_REPLICATE: number;
  export const BORDER_REFLECT: number;

  // Functions
  export function imread(imageElement: HTMLImageElement | HTMLCanvasElement | string): Mat;
  export function imwrite(filename: string, img: Mat, params?: number[]): boolean;
  export function cvtColor(src: Mat, dst: Mat, code: number): void;
  export function inRange(src: Mat, lower: Scalar, upper: Scalar, dst: Mat): void;
  export function split(src: Mat, channels: MatVector): void;
  export function merge(channels: MatVector, dst: Mat): void;
  export function GaussianBlur(src: Mat, dst: Mat, ksize: Size, sigmaX: number, sigmaY?: number, borderType?: number): void;
  export function Laplacian(src: Mat, dst: Mat, ddepth: number, ksize?: number, scale?: number, delta?: number, borderType?: number): void;
  export function Sobel(src: Mat, dst: Mat, ddepth: number, dx: number, dy: number, ksize?: number, scale?: number, delta?: number, borderType?: number): void;
  export function meanStdDev(src: Mat, mean: Mat, stddev: Mat, mask?: Mat): void;
  export function findContours(image: Mat, contours: MatVector, hierarchy: Mat, mode: number, method: number): void;
  export function contourArea(contour: Mat, oriented?: boolean): number;
  export function arcLength(curve: Mat, closed: boolean): number;
  export function approxPolyDP(curve: Mat, approxCurve: Mat, epsilon: number, closed: boolean): void;
  export function boundingRect(curve: Mat): Rect;
  export function minAreaRect(points: Mat): RotatedRect;
  export function moments(src: Mat, binaryImage?: boolean): Moments;
  export function bitwise_and(src1: Mat, src2: Mat, dst: Mat, mask?: Mat): void;
  export function bitwise_or(src1: Mat, src2: Mat, dst: Mat, mask?: Mat): void;
  export function bitwise_xor(src1: Mat, src2: Mat, dst: Mat, mask?: Mat): void;
  export function bitwise_not(src: Mat, dst: Mat, mask?: Mat): void;
  export function add(src1: Mat, src2: Mat, dst: Mat, mask?: Mat, dtype?: number): void;
  export function subtract(src1: Mat, src2: Mat, dst: Mat, mask?: Mat, dtype?: number): void;
  export function multiply(src1: Mat, src2: Mat, dst: Mat, scale?: number, dtype?: number): void;
  export function divide(src1: Mat, src2: Mat, dst: Mat, scale?: number, dtype?: number): void;
  export function convertScaleAbs(src: Mat, dst: Mat, alpha?: number, beta?: number): void;
  export function morphologyEx(src: Mat, dst: Mat, op: number, kernel: Mat): void;
  export function erode(src: Mat, dst: Mat, kernel: Mat, anchor?: Point, iterations?: number, borderType?: number, borderValue?: Scalar): void;
  export function dilate(src: Mat, dst: Mat, kernel: Mat, anchor?: Point, iterations?: number, borderType?: number, borderValue?: Scalar): void;
  export function getStructuringElement(shape: number, ksize: Size, anchor?: Point): Mat;
  export function Canny(image: Mat, edges: Mat, threshold1: number, threshold2: number, apertureSize?: number, L2gradient?: boolean): void;
  export function findContoursAsync(image: Mat, contours: MatVector, hierarchy: Mat, mode: number, method: number): Promise<void>;
  export function resize(src: Mat, dst: Mat, dsize: Size, fx?: number, fy?: number, interpolation?: number): void;
  export function threshold(src: Mat, dst: Mat, thresh: number, maxval: number, type: number): number;
  export function adaptiveThreshold(src: Mat, dst: Mat, maxValue: number, adaptiveMethod: number, thresholdType: number, blockSize: number, C: number): void;
  export function drawContours(image: Mat, contours: MatVector, contourIdx: number, color: Scalar, thickness?: number, lineType?: number, hierarchy?: Mat, maxLevel?: number, offset?: Point): void;
  export function fillPoly(img: Mat, pts: MatVector, color: Scalar, lineType?: number, shift?: number, offset?: Point): void;
  export function getPerspectiveTransform(src: Mat, dst: Mat): Mat;
  export function warpPerspective(src: Mat, dst: Mat, M: Mat, dsize: Size): void;
}

// Declare global cv object
declare global {
  const cv: OpenCV;
}

/**
 * OpenCV.js type definitions for compile-time type checking only.
 * OpenCV.js is loaded at runtime from CDN.
 */
export interface OpenCV {
  // Core classes
  Mat: new (...args: unknown[]) => Mat;
  MatVector: new (...args: unknown[]) => MatVector;
  Scalar: new (...args: unknown[]) => Scalar;
  Point: new (...args: unknown[]) => Point;
  Size: new (...args: unknown[]) => Size;
  Rect: new (...args: unknown[]) => Rect;
  RotatedRect: new (...args: unknown[]) => RotatedRect;
  Moments: new (...args: unknown[]) => Moments;

  // Constants
  CV_8UC1: number;
  CV_8UC3: number;
  CV_8UC4: number;
  CV_16S: number;
  CV_16SC1: number;
  CV_32F: number;
  CV_32FC1: number;
  CV_64F: number;

  // Color conversion codes
  COLOR_BGR2GRAY: number;
  COLOR_RGB2GRAY: number;
  COLOR_BGR2HSV: number;
  COLOR_RGB2HSV: number;
  COLOR_BGR2RGB: number;
  COLOR_RGB2BGR: number;
  COLOR_BGR2RGBA: number;
  COLOR_RGB2RGBA: number;
  COLOR_RGBA2BGRA: number;

  // Contour retrieval modes
  RETR_EXTERNAL: number;
  RETR_LIST: number;
  RETR_CCOMP: number;
  RETR_TREE: number;

  // Contour approximation methods
  CHAIN_APPROX_NONE: number;
  CHAIN_APPROX_SIMPLE: number;

  // Morphological operations
  MORPH_ERODE: number;
  MORPH_DILATE: number;
  MORPH_OPEN: number;
  MORPH_CLOSE: number;
  MORPH_GRADIENT: number;
  MORPH_ELLIPSE: number;

  // Border types
  BORDER_CONSTANT: number;
  BORDER_REPLICATE: number;
  BORDER_REFLECT: number;

  // Font types
  FONT_HERSHEY_SIMPLEX: number;
  FONT_HERSHEY_PLAIN: number;
  FONT_HERSHEY_DUPLEX: number;
  FONT_HERSHEY_COMPLEX: number;
  FONT_HERSHEY_SCRIPT_SIMPLEX: number;
  FONT_HERSHEY_SCRIPT_COMPLEX: number;

  // Functions
  imread: (imageElement: HTMLImageElement | HTMLCanvasElement | string) => Mat;
  imwrite: (filename: string, img: Mat, params?: number[]) => boolean;
  cvtColor: (src: Mat, dst: Mat, code: number) => void;
  inRange: (src: Mat, lower: Scalar, upper: Scalar, dst: Mat) => void;
  split: (src: Mat, channels: MatVector) => void;
  merge: (channels: MatVector, dst: Mat) => void;
  GaussianBlur: (src: Mat, dst: Mat, ksize: Size, sigmaX: number, sigmaY?: number, borderType?: number) => void;
  Laplacian: (src: Mat, dst: Mat, ddepth: number, ksize?: number, scale?: number, delta?: number, borderType?: number) => void;
  Sobel: (src: Mat, dst: Mat, ddepth: number, dx: number, dy: number, ksize?: number, scale?: number, delta?: number, borderType?: number) => void;
  meanStdDev: (src: Mat, mean: Mat, stddev: Mat, mask?: Mat) => void;
  findContours: (image: Mat, contours: MatVector, hierarchy: Mat, mode: number, method: number) => void;
  contourArea: (contour: Mat, oriented?: boolean) => number;
  arcLength: (curve: Mat, closed: boolean) => number;
  approxPolyDP: (curve: Mat, approxCurve: Mat, epsilon: number, closed: boolean) => void;
  boundingRect: (curve: Mat) => Rect;
  minAreaRect: (points: Mat) => RotatedRect;
  moments: (src: Mat, binaryImage?: boolean) => Moments;
  bitwise_and: (src1: Mat, src2: Mat, dst: Mat, mask?: Mat) => void;
  bitwise_or: (src1: Mat, src2: Mat, dst: Mat, mask?: Mat) => void;
  bitwise_xor: (src1: Mat, src2: Mat, dst: Mat, mask?: Mat) => void;
  bitwise_not: (src: Mat, dst: Mat, mask?: Mat) => void;
  add: (src1: Mat, src2: Mat, dst: Mat, mask?: Mat, dtype?: number) => void;
  subtract: (src1: Mat, src2: Mat, dst: Mat, mask?: Mat, dtype?: number) => void;
  multiply: (src1: Mat, src2: Mat, dst: Mat, scale?: number, dtype?: number) => void;
  divide: (src1: Mat, src2: Mat, dst: Mat, scale?: number, dtype?: number) => void;
  convertScaleAbs: (src: Mat, dst: Mat, alpha?: number, beta?: number) => void;
  morphologyEx: (src: Mat, dst: Mat, op: number, kernel: Mat) => void;
  erode: (src: Mat, dst: Mat, kernel: Mat, anchor?: Point, iterations?: number, borderType?: number, borderValue?: Scalar) => void;
  dilate: (src: Mat, dst: Mat, kernel: Mat, anchor?: Point, iterations?: number, borderType?: number, borderValue?: Scalar) => void;
  getStructuringElement: (shape: number, ksize: Size, anchor?: Point) => Mat;
  Canny: (image: Mat, edges: Mat, threshold1: number, threshold2: number, apertureSize?: number, L2gradient?: boolean) => void;
  findContoursAsync: (image: Mat, contours: MatVector, hierarchy: Mat, mode: number, method: number) => Promise<void>;
  resize: (src: Mat, dst: Mat, dsize: Size, fx?: number, fy?: number, interpolation?: number) => void;
  threshold: (src: Mat, dst: Mat, thresh: number, maxval: number, type: number) => number;
  adaptiveThreshold: (src: Mat, dst: Mat, maxValue: number, adaptiveMethod: number, thresholdType: number, blockSize: number, C: number) => void;
  drawContours: (image: Mat, contours: MatVector, contourIdx: number, color: Scalar, thickness?: number, lineType?: number, hierarchy?: Mat, maxLevel?: number, offset?: Point) => void;
  fillPoly: (img: Mat, pts: MatVector, color: Scalar, lineType?: number, shift?: number, offset?: Point) => void;
  getPerspectiveTransform: (src: Mat, dst: Mat) => Mat;
  warpPerspective: (src: Mat, dst: Mat, M: Mat, dsize: Size) => void;
  rectangle: (img: Mat, pt1: Point, pt2: Point, color: Scalar, thickness?: number, lineType?: number, shift?: number) => void;
  putText: (img: Mat, text: string, org: Point, fontFace: number, fontScale: number, color: Scalar, thickness?: number, lineType?: number, bottomLeftOrigin?: boolean) => void;
  imshow: (canvas: HTMLCanvasElement, mat: Mat) => void;
}

export interface Mat {
  rows: number;
  cols: number;
  type(): number;
  data: Uint8Array | Int8Array | Uint16Array | Int16Array | Float32Array | Float64Array;
  data8U: Uint8Array;
  data16S: Int16Array;
  data32F: Float32Array;
  data64F: Float64Array;
  delete(): void;
  clone(): Mat;
  convertTo(m: Mat, rtype: number, alpha?: number, beta?: number): void;
  setTo(s: Scalar): void;
  zeros(rows: number, cols: number, type: number): Mat;
  ones(rows: number, cols: number, type: number): Mat;
}

export interface MatVector {
  get(index: number): Mat;
  size(): number;
  push_back(mat: Mat): void;
  delete(): void;
}

export interface Scalar {
  v0: number;
  v1: number;
  v2: number;
  v3: number;
  delete(): void;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RotatedRect {
  center: Point;
  size: Size;
  angle: number;
}

export interface Moments {
  m00: number;
  m10: number;
  m01: number;
  m20: number;
  m11: number;
  m02: number;
  m30: number;
  m21: number;
  m12: number;
  m03: number;
}

export {};

