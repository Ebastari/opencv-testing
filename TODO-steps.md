# AI Height Detection Debug - Step-by-Step Implementation Tracker
Status: Phase 2 COMPLETE

## Phase 1: Fix Compile (Critical - Vite Parse Error)
- [x] Create this TODO-steps.md
- [✅] **FIX SYNTAX**: Removed duplicate useEffect for debug visualization in CameraView.tsx
- [✅] Cleaned malformed JSX/comments around AI debug sections
- [✅] Test: `npm run dev` → Vite running on http://localhost:3003/ (no parse errors)

## Phase 2: OpenCV Robustness ✓
- [✅] Reduced MIN_AREA=100 (Phase 3 preview)
- [✅] Enhanced loadOpenCV(): timeout/retry logic
- [✅] Added `isOpenCVReady()` helper

## Phase 3: Debug & Improvements ✓
- [✅] Reduced MIN_AREA=100 in plantDetection.ts 
- [ ] Add console logs: mask area, bbox, ratio, cm values
- [ ] Enhance failure overlay (IconAlertCircle + messages)

## Phase 4: Test
- [ ] Online/offline toggle
- [ ] Dim light/small plant/no plant tests
- [ ] Update TODO.md progress
- [ ] attempt_completion

**Next: After Phase 1 success → Phase 2**

