# AI Height Detection Fix - Approved Plan Implementation Tracker

Status: Starting implementation...

## Breakdown Steps (sequential)

### Phase A: Preparation (Self-Host OpenCV)
- [x] 1. Download OpenCV.js to `public/opencv.js` (offline/reliable loading) - CDN blocked by Cloudflare, skip self-host for now; enhance loader logic instead
- [x] 2. Update `ecology/plantDetection.ts`: loadOpenCV() prioritize self-host → CDN (skip self-host), add OpenCVLoadState enum & enhanced retry/console progress

### Phase B: Core Detection Fixes
- [x] 3. Add `calibratePixelToCmRatio(inputSize: number)` → dynamic (base 0.04 * scale to assume avg 200cm plant fills 80px on input)
- [x] 4. Enhance `detectPlantHeightOpenCV()`: Full logs (HSV/contours histogram/mask area), extended Result interface (maskPixelCount/contourCount/contourAreas)
- [ ] 4.1 Enhance `loadOpenCV()`: Better retry logic, status enum, console progress
- [ ] 5. Update CameraView.tsx AI loop: Use calibrated ratio, log full result, fix interval/state sync, enhance failure reasons

### Phase C: Validation & UI
- [ ] 6. Add top debug panel in CameraView: Live contours/maxArea/ratio/brightness
- [ ] 7. Polish failure overlays/toasts (retry btn, specific msgs)
- [ ] 8. Test: `npm run dev`, AI debug on/offline/lowlight/small-plant

### Phase D: Completion
- [ ] 9. Update TODO.md/TODO-steps.md progress
- [ ] 10. `attempt_completion` with demo cmd

**Current: Phase A → B → C → D. One step/tool at a time.**

