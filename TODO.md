# Fix OpenCV Loading & Plant Detection Issues

## Current Problem
- \"⚠️ OpenCV belum dimuat (perlu internet)\" - OpenCV.js CDN fails to load.
- Poor mask quality (no green segmentation), bad pixelToCmRatio, interval/state issues.

## Steps (Track progress by editing this file)

### 1. [x] Enhance OpenCV loader (ecology/plantDetection.ts)
   - Add console.log('[OpenCV] Load attempt X/3...', success/error/timeout.
   - Lighting check: Avg V from HSV, skip if <0.3, log.
   - Logs: Contours, maxArea, final height/ratio/bbox, brightness.
   - Interface: avgBrightnessV in result.

### 2. [ ] Update CameraView.tsx AI analysis
   - Console logs: OpenCV status, detection result, ratio, lighting.
   - Better error handling: Distinguish network/no-plant/low-light.
   - Fix pixelToCmRatio calibration for 160px input.
   - Ensure interval runs, state updates immediately.

### 3. [ ] Add user notifications/overlays
   - Toast/error banner for OpenCV load fail.
   - Overlay hints: \"No plant detected - adjust position/lighting\".
   - Debug info in top panel: contours, ratio, lighting.

### 4. [ ] Test & validate
   - npm run dev
   - Enable AI mode + debug
   - Check console/network tab (OpenCV.js status).
   - Test with plant: Good mask? Accurate height?

### 5. [ ] Optional enhancements
   - HSV tuning sliders in debug mode.
   - Self-host opencv.js in public/ if CDN unreliable.
   - Profile interval FPS (target 60s -> 0.67Hz).

**Progress:** 0/5 complete

