/**
 * Plant Detection Module using Classical Computer Vision (OpenCV.js)
 * 
 * This module provides real-time plant detection using HSV color segmentation
 * and contour analysis. It is optimized for processing camera feed frames.
 * 
 * Features:
 * - HSV-based green vegetation detection
 * - Morphological operations for noise reduction
 * - Contour-based plant detection with bounding boxes
 * - Real-time optimized pipeline
 * 
 * @module ecology/plantDetectionModule
 */

// Import types from opencv.d.ts
import type { Mat, MatVector, Scalar, Point, Size, Rect, OpenCV } from '../types/opencv';

/**
 * Default HSV thresholds for green vegetation detection
 * These values are tuned for typical plant colors in outdoor lighting
 */
export const DEFAULT_VEGETATION_HSV = {
  lower: { h: 35, s: 40, v: 40 },
  upper: { h: 85, s: 255, v: 255 }
};

/**
 * Morphological operation parameters
 */
export const DEFAULT_MORPH_PARAMS = {
  kernelSize: 5,
  erodeIterations: 1,
  dilateIterations: 2
};

/**
 * Detection parameters
 */
export const DETECTION_PARAMS = {
  /** Minimum contour area in pixels to be considered a plant */
  minContourArea: 500,
  /** Maximum number of contours to process (for performance) */
  maxContours: 20,
  /** Analysis canvas size (smaller = faster processing) */
  analysisSize: 320
};

/**
 * Interface for a detected plant region
 */
export interface DetectedPlant {
  /** Unique identifier for the detection */
  id: number;
  /** Bounding box x-coordinate (top-left) */
  x: number;
  /** Bounding box y-coordinate (top-left) */
  y: number;
  /** Bounding box width in pixels */
  width: number;
  /** Bounding box height in pixels */
  height: number;
  /** Area of the contour in square pixels */
  area: number;
  /** Confidence score (0-100) based on area and shape */
  confidence: number;
}

/**
 * Result of the plant detection pipeline
 */
export interface PlantDetectionResult {
  /** Array of detected plant regions */
  plants: DetectedPlant[];
  /** Binary mask showing vegetation (white) vs non-vegetation (black) */
  vegetationMask: HTMLCanvasElement | null;
  /** Output canvas with bounding boxes drawn */
  outputCanvas: HTMLCanvasElement | null;
  /** Processing time in milliseconds */
  processingTime: number;
  /** Whether detection was successful */
  success: boolean;
  /** Error message if detection failed */
  error?: string;
}

/**
 * Options for plant detection
 */
export interface PlantDetectionOptions {
  /** HSV lower threshold for green detection */
  hsvLower?: { h: number; s: number; v: number };
  /** HSV upper threshold for green detection */
  hsvUpper?: { h: number; s: number; v: number };
  /** Minimum contour area in pixels */
  minContourArea?: number;
  /** Whether to draw bounding boxes on output */
  drawBoundingBoxes?: boolean;
  /** Whether to generate vegetation mask */
  generateMask?: boolean;
  /** Analysis resolution (width and height) */
  analysisSize?: number;
}

// Type for cv object (handles both namespace and object forms)
type CVType = OpenCV | typeof cv;

/**
 * Get OpenCV.js instance from window
 * Loads OpenCV.js dynamically if not already loaded
 */
export const getOpenCV = async (): Promise<CVType> => {
  // Check if OpenCV is already loaded (can be namespace or object)
  const windowCV = (window as unknown as { cv?: CVType }).cv;
  if (windowCV) {
    // If it's the namespace form (has Mat constructor)
    if ('Mat' in windowCV && typeof windowCV.Mat === 'function') {
      return windowCV as typeof cv;
    }
    // If it's the object form (has Mat property)
    if ((windowCV as OpenCV).Mat) {
      return windowCV as OpenCV;
    }
  }

  // Load OpenCV.js dynamically
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
    script.onload = () => {
      // Wait for OpenCV to initialize
      const checkReady = setInterval(() => {
        const cvLoaded = (window as unknown as { cv?: CVType }).cv;
        if (cvLoaded && ('Mat' in cvLoaded || (cvLoaded as OpenCV).Mat)) {
          clearInterval(checkReady);
          resolve(cvLoaded as CVType);
        }
      }, 100);
    };
    script.onerror = () => reject(new Error('Failed to load OpenCV.js'));
    document.head.appendChild(script);
  });
};

/**
 * Helper to create a Scalar from values
 */
const createScalar = (cv: CVType, v0: number, v1?: number, v2?: number, v3?: number): Scalar => {
  return new cv.Scalar(v0, v1, v2, v3) as unknown as Scalar;
};

/**
 * Helper to create a Point
 */
const createPoint = (cv: CVType, x: number, y: number): Point => {
  return new cv.Point(x, y) as unknown as Point;
};

/**
 * Helper to create a Size
 */
const createSize = (cv: CVType, width: number, height: number): Size => {
  return new cv.Size(width, height) as unknown as Size;
};

/**
 * Preprocess image for plant detection
 * 
 * This function:
 * 1. Creates a canvas from the source (image, video, or canvas)
 * 2. Optionally resizes for faster processing
 * 3. Reads the image data into an OpenCV Mat
 * 
 * @param source - Source image element (HTMLImageElement, HTMLCanvasElement, or HTMLVideoElement)
 * @param analysisSize - Target size for analysis (default: 320)
 * @returns Preprocessed OpenCV Mat ready for analysis
 */
export const preprocessImage = async (
  source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  analysisSize: number = DETECTION_PARAMS.analysisSize
): Promise<{ mat: Mat; width: number; height: number; canvas: HTMLCanvasElement }> => {
  const cv = await getOpenCV();

  // Create a canvas to draw the source image/video
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D context');
  }

  // Calculate scale to fit within analysisSize while maintaining aspect ratio
  const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  
  if (sourceWidth === 0 || sourceHeight === 0) {
    throw new Error('Source image has no dimensions');
  }

  const scale = Math.min(1, analysisSize / Math.max(sourceWidth, sourceHeight));
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);

  // Draw source to canvas
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  // Read canvas to OpenCV Mat
  const mat = cv.imread(canvas);

  return { mat, width: canvas.width, height: canvas.height, canvas };
};

/**
 * Detect vegetation in an image using HSV color thresholding
 * 
 * This function:
 * 1. Converts the image from RGB to HSV color space
 * 2. Applies inRange threshold to find green pixels
 * 3. Creates a binary mask where white = vegetation
 * 
 * @param src - Source OpenCV Mat (RGB)
 * @param hsvLower - Lower HSV threshold (default: {h:35, s:40, v:40})
 * @param hsvUpper - Upper HSV threshold (default: {h:85, s:255, v:255})
 * @returns Binary vegetation mask
 */
export const detectVegetation = async (
  src: Mat,
  hsvLower: { h: number; s: number; v: number } = DEFAULT_VEGETATION_HSV.lower,
  hsvUpper: { h: number; s: number; v: number } = DEFAULT_VEGETATION_HSV.upper
): Promise<Mat> => {
  const cv = await getOpenCV();

  // Step 1: Convert RGB to HSV
  // This separates color information (hue, saturation) from brightness (value)
  // HSV is more suitable for color-based detection than RGB
  const hsv = new cv.Mat();
  cv.cvtColor(src, hsv, cv.COLOR_RGB2HSV);

  // Step 2: Apply HSV thresholding for green vegetation
  // - Hue (0-180 in OpenCV): 35-85 covers green colors
  // - Saturation (0-255): 40-255 captures most green saturation levels
  // - Value (0-255): 40-255 handles varying brightness conditions
  const lower = createScalar(cv, hsvLower.h, hsvLower.s, hsvLower.v, 0);
  const upper = createScalar(cv, hsvUpper.h, hsvUpper.s, hsvUpper.v, 0);
  
  // Create binary mask: white pixels = vegetation, black = non-vegetation
  const mask = new cv.Mat();
  cv.inRange(hsv, lower, upper, mask);

  // Clean up intermediate matrices
  hsv.delete();
  lower.delete?.();
  upper.delete?.();

  return mask;
};

/**
 * Apply morphological operations to clean up the mask
 * 
 * Morphological operations help remove noise and fill gaps:
 * - Erosion: Removes small white specks (noise)
 * - Dilation: Expands white regions to fill small holes
 * 
 * @param mask - Binary input mask
 * @param kernelSize - Size of the morphological kernel (default: 5)
 * @returns Cleaned binary mask
 */
export const applyMorphologicalOperations = async (
  mask: Mat,
  kernelSize: number = DEFAULT_MORPH_PARAMS.kernelSize
): Promise<Mat> => {
  const cv = await getOpenCV();

  // Create elliptical kernel for morphological operations
  // Ellipse is better than rectangle for organic shapes like plants
  const kernel = cv.getStructuringElement(
    cv.MORPH_ELLIPSE,
    createSize(cv, kernelSize, kernelSize)
  );

  // Step 1: Erode to remove small noise particles
  // This shrinks white regions, eliminating small specks
  const eroded = new cv.Mat();
  cv.erode(mask, eroded, kernel, createPoint(cv, -1, -1), DEFAULT_MORPH_PARAMS.erodeIterations);

  // Step 2: Dilate to restore plant regions and fill small holes
  // This expands the remaining vegetation regions
  const dilated = new cv.Mat();
  cv.dilate(eroded, dilated, kernel, createPoint(cv, -1, -1), DEFAULT_MORPH_PARAMS.dilateIterations);

  // Clean up
  kernel.delete();
  eroded.delete();

  return dilated;
};

/**
 * Find plant contours from binary vegetation mask
 * 
 * This function:
 * 1. Finds contours in the binary mask
 * 2. Filters by minimum area to remove noise
 * 3. Returns array of contour points
 * 
 * @param mask - Binary vegetation mask
 * @param minArea - Minimum contour area in pixels (default: 500)
 * @returns Array of detected contours
 */
export const findPlantContours = async (
  mask: Mat,
  minArea: number = DETECTION_PARAMS.minContourArea
): Promise<{ contours: MatVector; boundingBoxes: Rect[]; areas: number[] }> => {
  const cv = await getOpenCV();

  // Find contours in the binary mask
  // RETR_EXTERNAL: Only retrieve external contours (outer boundaries)
  // CHAIN_APPROX_SIMPLE: Compress horizontal, vertical, diagonal segments
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  // Filter contours by minimum area and collect bounding boxes
  const boundingBoxes: Rect[] = [];
  const areas: number[] = [];
  
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);

    // Only keep contours that meet minimum area threshold
    if (area >= minArea) {
      const rect = cv.boundingRect(contour);
      boundingBoxes.push(rect);
      areas.push(area);
    }
  }

  // Clean up hierarchy (not needed after contour detection)
  hierarchy.delete();

  return { contours, boundingBoxes, areas };
};

/**
 * Compute bounding boxes from contours and create detection results
 * 
 * This function:
 * 1. Processes each contour to compute bounding rectangle
 * 2. Calculates confidence based on area and shape
 * 3. Creates DetectedPlant objects
 * 
 * @param boundingBoxes - Array of OpenCV Rect objects
 * @param areas - Array of contour areas
 * @param imageWidth - Original image width for confidence calculation
 * @param imageHeight - Original image height for confidence calculation
 * @returns Array of detected plant objects
 */
export const computeBoundingBoxes = (
  boundingBoxes: Rect[],
  areas: number[],
  imageWidth: number,
  imageHeight: number
): DetectedPlant[] => {
  const plants: DetectedPlant[] = [];
  const totalArea = imageWidth * imageHeight;

  boundingBoxes.forEach((rect, index) => {
    const area = areas[index];
    
    // Calculate confidence based on area relative to image size
    // Larger plants in the image get higher confidence
    const areaRatio = area / totalArea;
    const confidence = Math.min(100, Math.round(areaRatio * 1000));

    plants.push({
      id: index,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      area: Math.round(area),
      confidence
    });
  });

  // Sort by area (largest first)
  plants.sort((a, b) => b.area - a.area);

  return plants;
};

/**
 * Draw bounding boxes on canvas for visualization
 * 
 * @param src - Source OpenCV Mat
 * @param plants - Array of detected plants
 * @returns Canvas with bounding boxes drawn
 */
export const drawBoundingBoxes = async (
  src: Mat,
  plants: DetectedPlant[]
): Promise<HTMLCanvasElement> => {
  const cv = await getOpenCV();

  // Clone source for drawing
  const output = src.clone();

  // Draw each bounding box
  plants.forEach((plant, index) => {
    // Generate color based on index (cycling through colors)
    const colors = [
      [255, 0, 0],     // Red
      [0, 255, 0],     // Green
      [0, 0, 255],     // Blue
      [255, 255, 0],   // Yellow
      [255, 0, 255],   // Magenta
      [0, 255, 255]    // Cyan
    ];
    const color = colors[index % colors.length];

    // Draw rectangle
    const topLeft = createPoint(cv, plant.x, plant.y);
    const bottomRight = createPoint(cv, plant.x + plant.width, plant.y + plant.height);
    const scalar = createScalar(cv, color[0], color[1], color[2], 255);
    cv.rectangle(output, topLeft, bottomRight, scalar, 2);

    // Add label with height
    const label = `Plant ${index + 1}: ${plant.height}px`;
    const labelPos = createPoint(cv, plant.x, Math.max(plant.y - 10, 20));
    cv.putText(output, label, labelPos, cv.FONT_HERSHEY_SIMPLEX, 0.5, scalar, 1);
  });

  // Convert to canvas
  const canvas = document.createElement('canvas');
  canvas.width = (output as unknown as { cols: number }).cols;
  canvas.height = (output as unknown as { rows: number }).rows;
  cv.imshow(canvas, output);

  // Clean up
  output.delete();

  return canvas;
};

/**
 * Convert OpenCV Mat to canvas
 * 
 * @param mat - OpenCV Mat to convert
 * @returns HTMLCanvasElement
 */
export const matToCanvas = async (mat: Mat): Promise<HTMLCanvasElement> => {
  const canvas = document.createElement('canvas');
  canvas.width = (mat as unknown as { cols: number }).cols;
  canvas.height = (mat as unknown as { rows: number }).rows;
  
  const cv = await getOpenCV();
  cv.imshow(canvas, mat);
  
  return canvas;
};

/**
 * Main plant detection function
 * 
 * This is the primary entry point for plant detection.
 * It orchestrates the complete pipeline:
 * 1. Preprocess image (resize and convert to Mat)
 * 2. Detect vegetation (HSV thresholding)
 * 3. Apply morphological operations (denoise)
 * 4. Find contours (detect plant regions)
 * 5. Compute bounding boxes (extract plant measurements)
 * 6. Generate visualization (draw bounding boxes)
 * 
 * @param source - Source image or video frame
 * @param options - Detection options
 * @returns PlantDetectionResult with detected plants and visualizations
 */
export const detectPlants = async (
  source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  options: PlantDetectionOptions = {}
): Promise<PlantDetectionResult> => {
  const startTime = performance.now();

  try {
    // Set defaults
    const {
      hsvLower = DEFAULT_VEGETATION_HSV.lower,
      hsvUpper = DEFAULT_VEGETATION_HSV.upper,
      minContourArea = DETECTION_PARAMS.minContourArea,
      drawBoundingBoxes: shouldDraw = true,
      generateMask: shouldGenerateMask = true,
      analysisSize = DETECTION_PARAMS.analysisSize
    } = options;

    // Step 1: Preprocess image
    const { mat: src, width, height } = await preprocessImage(source, analysisSize);

    // Step 2: Detect vegetation using HSV thresholding
    const mask = await detectVegetation(src, hsvLower, hsvUpper);

    // Step 3: Apply morphological operations to remove noise
    const cleanedMask = await applyMorphologicalOperations(mask);

    // Step 4: Find contours (plant regions)
    const { contours, boundingBoxes, areas } = await findPlantContours(cleanedMask, minContourArea);

    // Step 5: Compute bounding boxes and create plant objects
    const plants = computeBoundingBoxes(boundingBoxes, areas, width, height);

    // Step 6: Generate visualization
    let outputCanvas: HTMLCanvasElement | null = null;
    if (shouldDraw && plants.length > 0) {
      outputCanvas = await drawBoundingBoxes(src, plants);
    }

    // Generate vegetation mask canvas
    let vegetationMask: HTMLCanvasElement | null = null;
    if (shouldGenerateMask) {
      vegetationMask = await matToCanvas(cleanedMask);
    }

    // Clean up OpenCV matrices
    src.delete();
    mask.delete();
    cleanedMask.delete();
    contours.delete();

    const processingTime = performance.now() - startTime;

    return {
      plants,
      vegetationMask,
      outputCanvas,
      processingTime,
      success: true
    };
  } catch (error) {
    const processingTime = performance.now() - startTime;
    
    return {
      plants: [],
      vegetationMask: null,
      outputCanvas: null,
      processingTime,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during detection'
    };
  }
};

/**
 * Quick detection for real-time camera feed
 * 
 * This optimized version is designed for real-time processing:
 * - Uses smaller analysis size
 * - Skips visualization generation
 * - Returns minimal data for performance
 * 
 * @param videoFrame - Current video frame from camera
 * @returns Simplified detection result
 */
export const detectPlantsRealtime = async (
  videoFrame: HTMLVideoElement
): Promise<{
  plants: DetectedPlant[];
  heightPx: number | null;
}> => {
  try {
    console.log('[PlantDetection] Starting detection...', {
      videoWidth: videoFrame.videoWidth,
      videoHeight: videoFrame.videoHeight,
      readyState: videoFrame.readyState
    });
    
    const result = await detectPlants(videoFrame, {
      drawBoundingBoxes: false,
      generateMask: false,
      analysisSize: 160 // Smaller for faster processing
    });

    console.log('[PlantDetection] Result:', {
      success: result.success,
      plantsCount: result.plants.length,
      error: result.error,
      processingTime: result.processingTime
    });

    // Get the height of the tallest plant
    const heightPx = result.plants.length > 0 
      ? Math.max(...result.plants.map(p => p.height))
      : null;

    return {
      plants: result.plants,
      heightPx
    };
  } catch (err) {
    console.error('[PlantDetection] ERROR:', err);
    return {
      plants: [],
      heightPx: null
    };
  }
};

/**
 * Convert pixel height to centimeters using a calibration ratio
 * 
 * @param heightPx - Height in pixels
 * @param pixelToCmRatio - Conversion ratio (pixels per cm)
 * @returns Height in centimeters
 */
export const pixelsToCentimeters = (heightPx: number, pixelToCmRatio: number): number => {
  return heightPx * pixelToCmRatio;
};

/**
 * Estimate pixel-to-centimeter ratio from reference object
 * 
 * If you know the real-world size of an object in the image,
 * you can estimate the conversion ratio.
 * 
 * @param knownHeightPx - Known height in pixels
 * @param knownHeightCm - Known height in centimeters
 * @returns Pixel to cm ratio
 */
export const estimatePixelToCmRatio = (knownHeightPx: number, knownHeightCm: number): number => {
  return knownHeightCm / knownHeightPx;
};

export default {
  detectPlants,
  detectPlantsRealtime,
  preprocessImage,
  detectVegetation,
  applyMorphologicalOperations,
  findPlantContours,
  computeBoundingBoxes,
  drawBoundingBoxes,
  pixelsToCentimeters,
  estimatePixelToCmRatio,
  getOpenCV,
  DEFAULT_VEGETATION_HSV,
  DETECTION_PARAMS
};

