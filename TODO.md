# TODO - AI Height Display Feature

## Task: Display AI Height Estimation with Color Indicator

### Objective
When AI height mode is active, display the estimated height from sample data with:
- Small font size
- Green color when active
- Red color when not active
- Format: "AI Tinggi : XX cm"

### Implementation Plan

1. **Modify components/CameraView.tsx**
   - Add a new status indicator in the status indicators area (top-right panel)
   - Display "AI Tinggi : XX cm" with green background when `isHeightAiMode` is true
   - Display "AI Tinggi : ---" with red background when `isHeightAiMode` is false
   - Use small font size (text-[7px] or similar)
   - Show the estimated height from `heightAiEstimate.cm` when available

2. **Remove "ke titik target" text**
   - Removed the text "ke titik target" from the distance indicator in grid overlay

### Changes made in CameraView.tsx:
- Added new indicator showing AI height status with color coding:
  - Green (emerald) when active with estimated height
  - Amber when measuring
  - Red when inactive
- Removed "ke titik target" text from distance display

### Status
- [x] Read and understand existing code
- [x] Identify location for new indicator
- [x] Implement the AI height display with color coding
- [x] Remove "ke titik target" text from panel

