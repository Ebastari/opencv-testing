import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
// ...existing code...
import { getCameraDevices, startCamera } from '../services/cameraService';
import { GpsLocation, FormState } from '../types';
import { Compass } from './Compass';
import { LiveHealthComment } from './LiveHealthComment';
import { analyzePlantHealthHSV, type PlantHealthResult } from '../ecology/plantHealth';
import { detectPlantHeightOpenCV, type PlantHeightDetectionResult, loadOpenCV, calibratePixelToCmRatio, OpenCVLoadState, isOpenCVReady } from '../ecology/plantDetection';
import { detectPlantsRealtime, pixelsToCentimeters, DEFAULT_VEGETATION_HSV, type DetectedPlant } from '../ecology/plantDetectionModule';
import { PlantDetectionOverlay } from './PlantDetectionOverlay';
import { 
  calculateDistanceMeters, 
  calculateDirectionToPoint, 
  isWithinCaptureThreshold, 
  formatDistance, 
  getDirectionArrow,
  getDirectionLabel,
  gridPointToGps,
  DEFAULT_CAPTURE_THRESHOLD_M 
} from '../services/gridService';
import HeightAiDetection from './height/HeightAiDetection';
import HeightSliderControl from './height/HeightSliderControl';
import HeightPixelScale from './height/HeightPixelScale';
import HeightSettingsCard, { type HeightMode } from './height/HeightSettingsCard';

const HEIGHT_MODE_KEY = 'camera-montana-height-mode-v1';

interface HeightAiEstimate {
  cm: number;
  confidence: number;
}

interface HeightAiRange {
  min: number;
  max: number;
}

// New: Height Measurement Mode Types
interface MeasurePoint {
  x: number;
  y: number;
}

const HEIGHT_MIN_CM = 30;
const HEIGHT_MAX_CM = 500;

const HEIGHT_AI_NOTICE_DISMISSED_KEY = 'camera-montana-height-ai-notice-dismissed-v1';
const HEIGHT_AI_CALIBRATION_SAMPLES_KEY = 'camera-montana-height-ai-calibration-samples-v1';
const HEIGHT_AI_RANGE_KEY = 'camera-montana-height-ai-range-v1';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const round = (value: number): number => Math.round(value);

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const stdDev = (values: number[]): number => {
  if (values.length <= 1) return 0;
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const safeParseJson = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const deriveRangeFromSamples = (samples: number[]): HeightAiRange | null => {
  if (samples.length < 10) {
    return null;
  }

  const cleaned = samples
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v >= HEIGHT_MIN_CM && v <= HEIGHT_MAX_CM)
    .sort((a, b) => a - b);

  if (cleaned.length < 10) {
    return null;
  }

  // Gunakan nilai persentil sederhana (abaikan outlier ekstrem pertama/terakhir).
  const min = Math.max(HEIGHT_MIN_CM, round(cleaned[1]));
  const max = Math.min(HEIGHT_MAX_CM, round(cleaned[cleaned.length - 2]));

  if (max <= min) {
    return null;
  }

  return { min, max };
};

const toHSV = (r: number, g: number, b: number): { h: number; s: number; v: number } => {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;

  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === nr) h = 60 * (((ng - nb) / delta) % 6);
    else if (max === ng) h = 60 * ((nb - nr) / delta + 2);
    else h = 60 * ((nr - ng) / delta + 4);
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
};


interface CameraViewProps {
  onCapture: (dataUrl: string, aiHealth?: PlantHealthResult | null, thumbnailDataUrl?: string, mode?: 'manual' | 'ai') => void;
  formState: FormState;
  onFormStateChange: React.Dispatch<React.SetStateAction<FormState>>;
  entriesCount: number;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: string | null;
  gps: GpsLocation | null;
  onGpsUpdate: (gps: GpsLocation) => void;
  onShowSheet: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  isOnline: boolean;
  gridAnchor: { lat: number; lon: number; setAt: string } | null;
  distanceFromAnchorM: number | null;
  effectiveCoordinate: { lat: number; lon: number; snapped: boolean; stepX: number; stepY: number } | null;
  onSetGridAnchor: () => void;
  onClearGridAnchor: () => void;
}

const PLANT_TYPES = ['Sengon', 'Nangka', 'Mahoni', 'Malapari'];
const DAILY_TARGET = 50;
const BRAND_NAME = "PT ENERGI BATUBARA LESTARI";
const MAX_THUMBNAIL_SIZE = 320;

const SHUTTER_SOUND_BASE64 = "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU92T18AZm9vYmFyYmF6cXV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4";

const IconPanel = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="10" width="7" height="11" rx="1.5" />
    <rect x="3" y="12" width="7" height="9" rx="1.5" />
  </svg>
);

const IconHome = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M6.5 10.5V20h11v-9.5" />
    <path d="M10 20v-5h4v5" />
  </svg>
);

const IconSwitchCamera = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="3" y="7" width="18" height="12" rx="2" />
    <path d="m8 7 1.5-2h5L16 7" />
    <path d="M9 12h6" />
    <path d="m13 10 2 2-2 2" />
    <path d="M15 14H9" />
    <path d="m11 16-2-2 2-2" />
  </svg>
);

const IconWarning = () => (
  <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 3 2.5 20h19L12 3Z" />
    <path d="M12 9v5" />
    <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const IconCamera = () => (
  <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M4 8h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
    <path d="m8 8 1.6-2h4.8L16 8" />
    <circle cx="12" cy="14" r="4" />
  </svg>
);

export const CameraView: React.FC<CameraViewProps> = ({
  onCapture,
  formState,
  onFormStateChange,
  entriesCount,
  pendingCount,
  isSyncing,
  lastSyncAt,
  gps,
  onGpsUpdate,
  onShowSheet,
  showToast,
  isOnline,
  gridAnchor,
  distanceFromAnchorM,
  effectiveCoordinate,
  onSetGridAnchor,
  onClearGridAnchor,
}) => {
  // Semua deklarasi state harus di sini, sebelum useEffect
  const [showGridOverlay, setShowGridOverlay] = useState(false);
  // Height mode state - reads from settings
  const [heightMode, setHeightMode] = useState<HeightMode>(() => {
    try {
      const saved = window.localStorage.getItem(HEIGHT_MODE_KEY);
      if (saved === 'ai' || saved === 'slider' || saved === 'pixel-scale') {
        return saved as HeightMode;
      }
    } catch {}
    return 'slider'; // Default to slider mode
  });

  // Listen for height mode changes from settings (when user changes in SettingsTab while app is running)
  // Note: storage event only fires for OTHER tabs, so we also check on focus
  useEffect(() => {
    const checkHeightMode = () => {
      try {
        const saved = window.localStorage.getItem(HEIGHT_MODE_KEY);
        if (saved === 'ai' || saved === 'slider' || saved === 'pixel-scale') {
          setHeightMode(saved as HeightMode);
        }
      } catch {}
    };
    
    // Check on mount and on focus
    checkHeightMode();
    window.addEventListener('focus', checkHeightMode);
    
    // Also listen for storage changes from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === HEIGHT_MODE_KEY && e.newValue) {
        if (e.newValue === 'ai' || e.newValue === 'slider' || e.newValue === 'pixel-scale') {
          setHeightMode(e.newValue as HeightMode);
        }
      }
      // Listen for pixel scale settings changes
      if (e.key === 'pixel-scale-stick-height' && e.newValue) {
        const parsed = parseFloat(e.newValue);
        if (!isNaN(parsed) && parsed > 0 && parsed <= 5) {
          setStickHeightMeters(parsed);
        }
      }
      if (e.key === 'pixel-scale-line-offset' && e.newValue) {
        const parsed = parseFloat(e.newValue);
        if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
          setLineOffsetPercent(parsed);
        }
      }
      if (e.key === 'pixel-scale-line-position' && e.newValue) {
        const parsed = parseFloat(e.newValue);
        if (!isNaN(parsed) && parsed > 10 && parsed <= 90) {
          setLinePositionPercent(parsed);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('focus', checkHeightMode);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Derive isHeightAiMode and isMeasureMode from heightMode
  // Always read from localStorage to ensure sync with settings
  const getCurrentMode = useCallback((): HeightMode => {
    try {
      const saved = window.localStorage.getItem(HEIGHT_MODE_KEY);
      if (saved === 'ai' || saved === 'slider' || saved === 'pixel-scale') {
        return saved as HeightMode;
      }
    } catch {}
    return heightMode;
  }, [heightMode]);
  
  const isHeightAiMode = getCurrentMode() === 'ai';
  const isMeasureMode = getCurrentMode() === 'pixel-scale';
  
  // Show/hide measurement overlay (for pixel scale mode) - default to shown for better UX
  // Sync with localStorage for persistence
  const [showMeasureOverlay, setShowMeasureOverlay] = useState(() => {
    try {
      const saved = localStorage.getItem('pixel-scale-show-overlay');
      return saved !== 'false'; // Default to true
    } catch {
      return true;
    }
  });

  // Persist showMeasureOverlay to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('pixel-scale-show-overlay', showMeasureOverlay.toString());
    } catch {}
  }, [showMeasureOverlay]);
  
  // Height controls collapsed state
  const [heightControlsCollapsed, setHeightControlsCollapsed] = useState(false);
  // Mode pengambilan titik manual aktif jika mode AI nonaktif
  const isManualHeightMode = !isHeightAiMode;
  const [sampleIndicator, setSampleIndicator] = useState<number | null>(null);
  const [calibrationActive, setCalibrationActive] = useState(false);
  const [showCalibrationHint, setShowCalibrationHint] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | undefined>(undefined);
  const [cameraLoading, setCameraLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [needsUserAction, setNeedsUserAction] = useState(false);
  const [showGridPanel, setShowGridPanel] = useState(false);
  const [livePlantHealth, setLivePlantHealth] = useState<PlantHealthResult | null>(null);
  const [showHeightAiNotice, setShowHeightAiNotice] = useState(false);
  const [showHeightAiPopup, setShowHeightAiPopup] = useState(false);
  const [heightAiEstimate, setHeightAiEstimate] = useState<HeightAiEstimate | null>(null);
  const [heightAiSamples, setHeightAiSamples] = useState<number[]>(() => {
    try {
      const parsed = safeParseJson<number[]>(window.localStorage.getItem(HEIGHT_AI_CALIBRATION_SAMPLES_KEY), []);
      return Array.isArray(parsed) ? parsed.filter((v) => Number.isFinite(v)) : [];
    } catch {
      return [];
    }
  });
  const [heightAiRange, setHeightAiRange] = useState<HeightAiRange | null>(() => {
    try {
      const parsed = safeParseJson<HeightAiRange | null>(window.localStorage.getItem(HEIGHT_AI_RANGE_KEY), null);
      if (!parsed || !Number.isFinite(parsed.min) || !Number.isFinite(parsed.max)) {
        return null;
      }
      return parsed.max > parsed.min ? parsed : null;
    } catch {
      return null;
    }
  });

// Height AI Debug
  const [showHeightDebug, setShowHeightDebug] = useState(() => {
    try {
      return localStorage.getItem('camera-height-debug') === 'true';
    } catch {
      return false;
    }
  });
  const [heightDebugResult, setHeightDebugResult] = useState<PlantHeightDetectionResult | null>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);

  // NEW: AI Detection Error States
  const [opencvLoadError, setOpencvLoadError] = useState(false);
  const [detectionFailureReason, setDetectionFailureReason] = useState<'opencv' | 'noplan' | 'lowlight' | 'network' | 'unknown' | null>(null);

  // Update localStorage when toggle changes
  useEffect(() => {
    try {
      localStorage.setItem('camera-height-debug', showHeightDebug.toString());
    } catch {}
  }, [showHeightDebug]);

  // NEW: Manual Height Measurement Mode
  // Note: isMeasureMode is now derived from heightMode (see above)
  const [measurePoints, setMeasurePoints] = useState<MeasurePoint[]>([]);
  const [stickHeightMeters, setStickHeightMeters] = useState(2); // Default 2 meters
  const [lineOffsetPercent, setLineOffsetPercent] = useState(15); // Default 15%
  const [linePositionPercent, setLinePositionPercent] = useState(50); // Center position for reference lines
  const [measuredHeightCm, setMeasuredHeightCm] = useState<number | null>(null);
  const [measureGuideText, setMeasureGuideText] = useState('');
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);
  const [hasSeenGuide, setHasSeenGuide] = useState(false); // Track if user has seen guide
  const [showCaptureAnalysis, setShowCaptureAnalysis] = useState(false); // Show analysis only on capture
  const [draggingLine, setDraggingLine] = useState<number | null>(null);
  
  // Canvas ref for measurement overlay
  const measureCanvasRef = useRef<HTMLCanvasElement>(null);

  // Sync stick height and line offset from HeightPixelScale settings
  useEffect(() => {
    try {
      const savedStickHeight = localStorage.getItem('pixel-scale-stick-height');
      if (savedStickHeight) {
        const parsed = parseFloat(savedStickHeight);
        if (!isNaN(parsed) && parsed > 0 && parsed <= 5) {
          setStickHeightMeters(parsed);
        }
      }
      
      const savedLineOffset = localStorage.getItem('pixel-scale-line-offset');
      if (savedLineOffset) {
        const parsed = parseFloat(savedLineOffset);
        if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
          setLineOffsetPercent(parsed);
        }
      }
      
      const savedLinePosition = localStorage.getItem('pixel-scale-line-position');
      if (savedLinePosition) {
        const parsed = parseFloat(savedLinePosition);
        if (!isNaN(parsed) && parsed > 10 && parsed <= 90) {
          setLinePositionPercent(parsed);
        }
      }
    } catch {}
  }, [isMeasureMode]); // Re-read when entering measure mode

  // Calculate height from measurement points
  const calculateMeasureHeight = useCallback((points: MeasurePoint[], videoHeight: number) => {
    if (points.length !== 2) return null;
    
    const [p1, p2] = points;
    const lineOffset = lineOffsetPercent / 100;
    const pixelDistanceStick = videoHeight * lineOffset * 2;
    const pixelDistanceTree = Math.abs(p1.y - p2.y);
    const heightMeters = (pixelDistanceTree / pixelDistanceStick) * stickHeightMeters;
    return heightMeters * 100; // Convert to cm
  }, [lineOffsetPercent, stickHeightMeters]);

  // Handle measurement mode toggle - mutually exclusive with AI mode
  const handleToggleMeasureMode = useCallback(() => {
    if (isMeasureMode) {
      // Turn off measurement mode - switch to slider
      setHeightMode('slider');
      setMeasurePoints([]);
      setMeasuredHeightCm(null);
      setMeasureGuideText('');
    } else {
      // Turn on measurement mode, turn off AI mode
      setHeightMode('pixel-scale');
      setHeightAiEstimate(null);
      setMeasurePoints([]);
      setMeasuredHeightCm(null);
      // Only show guide on first time
      if (!hasSeenGuide) {
        setMeasureGuideText('✦');
        setHasSeenGuide(true);
        // Show guide for 3 seconds then hide completely
        setTimeout(() => setMeasureGuideText(''), 3000);
      }
      // Don't show toast - too distracting during measurement
    }
  }, [isMeasureMode, showToast]);

  // Handle canvas click for measurement - optimized for field use
  const handleMeasureCanvasClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!isMeasureMode) return;
    
    const canvas = measureCanvasRef.current;
    if (!canvas) return;
    
    // Get click position relative to the canvas/video
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Calculate position - works anywhere on screen
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Check if clicking on existing marker to drag it
    const clickedPointIndex = measurePoints.findIndex(p => {
      const dist = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
      return dist < 30; // 30px radius for easier touching
    });
    
    if (clickedPointIndex >= 0) {
      // Start dragging existing point
      setDraggingPoint(clickedPointIndex);
      return;
    }
    
    // If we already have 2 points and not dragging, don't add more
    if (measurePoints.length >= 2) return;
    
    const newPoints = [...measurePoints, { x, y }];
    setMeasurePoints(newPoints);
    
    // Haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
    
    if (newPoints.length === 1) {
      // Don't show guide text for second point - just hide and let user tap
      // Auto-reset if user doesn't tap second point within 10 seconds
    } else if (newPoints.length === 2) {
      // Calculate height
      const heightCm = calculateMeasureHeight(newPoints, canvas.height);
      if (heightCm) {
        setMeasuredHeightCm(heightCm);
        // Auto-sync to form state
        onFormStateChange(prev => ({ ...prev, tinggi: Math.round(heightCm) }));
        // Don't show guide text overlay - just auto-reset for cleaner UI
        
        // Auto-reset after 2 seconds for next measurement
        setTimeout(() => {
          setMeasurePoints([]);
          setMeasuredHeightCm(null);
        }, 2000);
      }
    }
  }, [isMeasureMode, measurePoints, calculateMeasureHeight, onFormStateChange, showToast]);
  
  // Handle mouse move for dragging markers
  const handleMeasureMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (draggingPoint === null || !isMeasureMode) return;
    
    const canvas = measureCanvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Update the dragged point position
    const newPoints = [...measurePoints];
    newPoints[draggingPoint] = { x, y };
    setMeasurePoints(newPoints);
    
    // Recalculate height if we have 2 points
    if (newPoints.length === 2) {
      const heightCm = calculateMeasureHeight(newPoints, canvas.height);
      if (heightCm) {
        setMeasuredHeightCm(heightCm);
        onFormStateChange(prev => ({ ...prev, tinggi: Math.round(heightCm) }));
      }
    }
  }, [draggingPoint, isMeasureMode, measurePoints, calculateMeasureHeight, onFormStateChange]);
  
  // Handle mouse up to stop dragging
  const handleMeasureMouseUp = useCallback(() => {
    setDraggingPoint(null);
  }, []);

  // Video ref for camera - must be declared before useEffects that use it
  const videoRef = useRef<HTMLVideoElement>(null);

  // Draw measurement overlay
  useEffect(() => {
    const canvas = measureCanvasRef.current;
    if (!canvas || !isMeasureMode) return;
    
    const video = videoRef.current;
    if (!video) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size to match video, with fallback
    const videoWidth = video.videoWidth || 640;
    const videoHeight = video.videoHeight || 480;
    
    // Only update dimensions if significantly different to avoid flickering
    if (Math.abs(canvas.width - videoWidth) > 10 || Math.abs(canvas.height - videoHeight) > 10) {
      canvas.width = videoWidth;
      canvas.height = videoHeight;
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid lines (reference for stick) - using linePositionPercent as center
    const lineOffset = lineOffsetPercent / 100;
    const lineCenter = linePositionPercent / 100;
    const y1 = canvas.height * (lineCenter - lineOffset);
    const y2 = canvas.height * (lineCenter + lineOffset);
    
    // Draw reference lines with labels
    ctx.strokeStyle = '#FF3860';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, y1);
    ctx.lineTo(canvas.width, y1);
    ctx.moveTo(0, y2);
    ctx.lineTo(canvas.width, y2);
    ctx.stroke();
    
    // Draw drag handles on lines (visible when measuring)
    if (isMeasureMode) {
      // Draw drag handle circles on lines
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.strokeStyle = '#FF3860';
      ctx.lineWidth = 2;
      
      // Top line handle
      ctx.beginPath();
      ctx.arc(canvas.width - 50, y1, 12, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      
      // Bottom line handle
      ctx.beginPath();
      ctx.arc(canvas.width - 50, y2, 12, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
    
    // Draw stick height label in center of lines
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${stickHeightMeters} m`, canvas.width - 60, y1 + (y2 - y1) / 2 + 10);
    
    // Draw measurement points with custom colors from settings
    const getMarkerColor = (index: number): string => {
      try {
        if (index === 0) {
          return localStorage.getItem('pixel-scale-marker-base') || '#00FF00';
        } else {
          return localStorage.getItem('pixel-scale-marker-tip') || '#FF0000';
        }
      } catch {
        return index === 0 ? '#00FF00' : '#FF0000';
      }
    };
    
    measurePoints.forEach((p, i) => {
      const markerColor = getMarkerColor(i);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 20, 0, 2 * Math.PI); // Larger marker (20px)
      ctx.fillStyle = markerColor + 'E6'; // Add alpha for visibility
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 4;
      ctx.stroke();
      
      // Add inner dot for visibility
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, 2 * Math.PI);
      ctx.fillStyle = 'white';
      ctx.fill();
    });
    
    // Draw line between points if we have 2 points
    if (measurePoints.length === 2) {
      ctx.beginPath();
      ctx.moveTo(measurePoints[0].x, measurePoints[0].y);
      ctx.lineTo(measurePoints[1].x, measurePoints[1].y);
      ctx.strokeStyle = '#FF3860';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }, [isMeasureMode, measurePoints, lineOffsetPercent, stickHeightMeters]);

// AI Height Debug Visualization Overlay (Fixed: removed duplicate)
  useEffect(() => {
    const canvas = debugCanvasRef.current;
    if (!canvas || !showHeightDebug || !isHeightAiMode || !heightDebugResult) return;

    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match video
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    canvas.width = videoWidth;
    canvas.height = videoHeight;

    // Clear canvas
    ctx.clearRect(0, 0, videoWidth, videoHeight);

    const { vegetationMask, boundingBox, plantHeightPx, plantHeightCm } = heightDebugResult;

    // Scale factor: detection is 160x160, scale to video dimensions
    const scaleX = videoWidth / 160;
    const scaleY = videoHeight / 160;

    // 1. Draw vegetation mask (green semi-transparent)
    if (vegetationMask) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.drawImage(vegetationMask, 0, 0, videoWidth, videoHeight);
      ctx.restore();
    }

    // 2. Draw bounding box (thick blue)
    ctx.strokeStyle = '#00AAFF';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeRect(
      boundingBox.x * scaleX,
      boundingBox.y * scaleY,
      boundingBox.width * scaleX,
      boundingBox.height * scaleY
    );

    // 3. Draw height measurement line (red, from bbox bottom to top)
    const bboxTopY = boundingBox.y * scaleY;
    const bboxBottomY = (boundingBox.y + boundingBox.height) * scaleY;
    const bboxCenterX = (boundingBox.x + boundingBox.width / 2) * scaleX;

    ctx.strokeStyle = '#FF4444';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(bboxCenterX, bboxTopY);
    ctx.lineTo(bboxCenterX, bboxBottomY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 4. Draw height labels
    ctx.fillStyle = '#FF4444';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `${Math.round(plantHeightCm)} cm`,
      bboxCenterX,
      (bboxTopY + bboxBottomY) / 2
    );

    // 5. Debug info panel (top-left)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 220, 100);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Height: ${Math.round(plantHeightCm)} cm`, 20, 25);
    ctx.fillText(`Pixels: ${Math.round(plantHeightPx)} px`, 20, 45);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#00AAFF';
    ctx.fillText(`Bbox: ${Math.round(boundingBox.width)}x${Math.round(boundingBox.height)}`, 20, 65);
    ctx.fillText(`@ ${videoWidth}x${videoHeight}`, 20, 82);

  }, [showHeightDebug, isHeightAiMode, heightDebugResult, videoRef]);

  useEffect(() => {
    if (isHeightAiMode && heightAiSamples.length < 10) {
      setCalibrationActive(true);
      setShowCalibrationHint(true);
      // Petunjuk muncul 2.5 detik
      setTimeout(() => setShowCalibrationHint(false), 2500);
    } else {
      setCalibrationActive(false);
      setShowCalibrationHint(false);
    }
    setShowGridOverlay(isHeightAiMode && heightAiSamples.length >= 10);
  }, [isHeightAiMode, heightAiSamples.length]);

  // Fungsi untuk trigger penanda angka besar setiap kali sampel diambil
  const triggerSampleIndicator = useCallback((sampleNum: number) => {
    setSampleIndicator(sampleNum);
    setTimeout(() => setSampleIndicator(null), 1500); // 1.5 detik
  }, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const boundingBoxCanvasRef = useRef<HTMLCanvasElement>(null);
  const shutterSoundRef = useRef<HTMLAudioElement>(null);
  
  // State untuk plant detection overlay
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [detectedPlants, setDetectedPlants] = useState<{x: number; y: number; width: number; height: number; confidence: number}[]>([]);
  const [showBoundingBox, setShowBoundingBox] = useState(true);
  const [heightAiNoticeDismissed, setHeightAiNoticeDismissed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(HEIGHT_AI_NOTICE_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const hasShownHeightAiNoticeRef = useRef(false);
  const hasAutoEnabledHeightAiRef = useRef(false);
  const heightAiNoticeTimerRef = useRef<number | null>(null);
  const heightAiBufferRef = useRef<number[]>([]);
  const lastHeightSyncRef = useRef(0);
  const canSetAnchor = Boolean(
    gps &&
    Number.isFinite(gps.lat) &&
    Number.isFinite(gps.lon) &&
    Math.abs(gps.lat) <= 90 &&
    Math.abs(gps.lon) <= 180,
  );
  
  const progressPercentage = useMemo(() => Math.min(100, (entriesCount / DAILY_TARGET) * 100), [entriesCount]);

  const stopCurrentStream = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    // Reset analysis canvas as well
    if (analysisCanvasRef.current) {
      analysisCanvasRef.current.width = 0;
      analysisCanvasRef.current.height = 0;
      analysisCanvasRef.current = null;
    }
  }, []);

  const initializeCamera = useCallback(async (deviceId?: string) => {
    setCameraLoading(true);
    setCameraError(null);
    setNeedsUserAction(false);
    stopCurrentStream();
    
    try {
      const stream = await startCamera(deviceId);
      if (videoRef.current) {
        // Wait for video element to be ready
        if (!videoRef.current.srcObject) {
          videoRef.current.srcObject = stream;
        }
        
        // Ensure video metadata is loaded before playing
        if (videoRef.current.readyState < 2) {
          await new Promise<void>((resolve) => {
            const onLoadedMetadata = () => {
              videoRef.current?.removeEventListener('loadedmetadata', onLoadedMetadata);
              videoRef.current?.removeEventListener('error', onError);
              resolve();
            };
            const onError = () => {
              videoRef.current?.removeEventListener('loadedmetadata', onLoadedMetadata);
              videoRef.current?.removeEventListener('error', onError);
              resolve();
            };
            videoRef.current?.addEventListener('loadedmetadata', onLoadedMetadata);
            videoRef.current?.addEventListener('error', onError);
            
            // Timeout after 5 seconds
            setTimeout(() => {
              videoRef.current?.removeEventListener('loadedmetadata', onLoadedMetadata);
              videoRef.current?.removeEventListener('error', onError);
              resolve(); // Resolve anyway to try play
            }, 5000);
          });
        }

        try {
          await videoRef.current.play();
          setCameraLoading(false);
        } catch (playErr) {
          console.error("Autoplay blocked:", playErr);
          setNeedsUserAction(true);
          setCameraLoading(false);
        }

        const currentTrack = stream.getVideoTracks()[0];
        if (currentTrack) {
          const settings = currentTrack.getSettings();
          setCurrentDeviceId(settings.deviceId);
          
          // Log camera info for debugging
          console.log('Camera started:', {
            label: currentTrack.label,
            width: settings.width,
            height: settings.height,
            facingMode: settings.facingMode
          });
        }
      }
    } catch (err: any) {
      console.error("Camera init error:", err);
      setCameraError(err.name === 'NotAllowedError' ? 'Izin kamera ditolak' : 'Gagal memuat kamera');
      setCameraLoading(false);
      showToast('Gagal mengakses kamera.', 'error');
    }
  }, [stopCurrentStream, showToast]);

  // Handle visibility change - restart camera if tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Reinitialize camera when tab becomes visible
        const startup = async () => {
          try {
            const videoDevices = await getCameraDevices();
            setDevices(videoDevices);
            const backCamera = videoDevices.find(d => /back|rear|environment/i.test(d.label));
            await initializeCamera(backCamera?.deviceId || videoDevices[0]?.deviceId);
          } catch (e) {
            console.log('Camera reinit on visibility change failed:', e);
          }
        };
        
        // Only reinitialize if camera is not currently loading/active
        if (cameraLoading || !videoRef.current?.srcObject) {
          startup();
        }
      } else {
        // Stop camera when tab becomes hidden to save resources
        stopCurrentStream();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cameraLoading, stopCurrentStream, initializeCamera]);

  useEffect(() => {
    const startup = async () => {
      try {
        const videoDevices = await getCameraDevices();
        setDevices(videoDevices);
        const backCamera = videoDevices.find(d => /back|rear|environment/i.test(d.label));
        await initializeCamera(backCamera?.deviceId || videoDevices[0]?.deviceId);
      } catch (e) {
        setCameraError('Perangkat tidak didukung');
        setCameraLoading(false);
      }
    };
    startup();
    return () => stopCurrentStream();
  }, [initializeCamera, stopCurrentStream]);
  
  const handleRetryPlay = async () => {
    if (videoRef.current) {
      try {
        await videoRef.current.play();
        setNeedsUserAction(false);
      } catch (err) {
        showToast('Gagal memulai video.', 'error');
      }
    }
  };

  const handleSwitchCamera = useCallback(() => {
    if (devices.length < 2) {
      showToast('Hanya satu kamera terdeteksi.', 'info');
      return;
    }
    const currentIndex = devices.findIndex(d => d.deviceId === currentDeviceId);
    const nextIndex = (currentIndex + 1) % devices.length;
    const nextDevice = devices[nextIndex];
    if (nextDevice) {
      initializeCamera(nextDevice.deviceId);
    }
  }, [devices, currentDeviceId, initializeCamera, showToast]);

  const triggerHeightAiNotice = useCallback(() => {
    if (heightAiNoticeDismissed || hasShownHeightAiNoticeRef.current) {
      return;
    }

    hasShownHeightAiNoticeRef.current = true;
    setShowHeightAiNotice(true);
    setShowHeightAiPopup(true);
    if (heightAiNoticeTimerRef.current !== null) {
      window.clearTimeout(heightAiNoticeTimerRef.current);
    }
    heightAiNoticeTimerRef.current = window.setTimeout(() => {
      setShowHeightAiNotice(false);
      heightAiNoticeTimerRef.current = null;
    }, 2000);
  }, [heightAiNoticeDismissed]);

  const dismissHeightAiNotice = useCallback(() => {
    setShowHeightAiNotice(false);
    setHeightAiNoticeDismissed(true);
    setShowHeightAiPopup(false);
    try {
      window.localStorage.setItem(HEIGHT_AI_NOTICE_DISMISSED_KEY, '1');
    } catch {
      // Ignore storage write failures silently.
    }
  }, []);

  const openHeightAiPopup = useCallback(() => {
    setShowHeightAiPopup(true);
  }, []);

  const closeHeightAiPopup = useCallback(() => {
    setShowHeightAiPopup(false);
  }, []);

  // Tidak perlu tombol addHeightAiSample, proses di handleCaptureClick

  const resetHeightAiCalibration = useCallback(() => {
    setHeightAiSamples([]);
    setHeightAiRange(null);
    showToast('Kalibrasi Tinggi AI direset.', 'info');
  }, [showToast]);

  useEffect(() => {
    try {
      window.localStorage.setItem(HEIGHT_AI_CALIBRATION_SAMPLES_KEY, JSON.stringify(heightAiSamples));
    } catch {
      // Ignore storage write failures silently.
    }
  }, [heightAiSamples]);

  useEffect(() => {
    try {
      if (!heightAiRange) {
        window.localStorage.removeItem(HEIGHT_AI_RANGE_KEY);
      } else {
        window.localStorage.setItem(HEIGHT_AI_RANGE_KEY, JSON.stringify(heightAiRange));
      }
    } catch {
      // Ignore storage write failures silently.
    }
  }, [heightAiRange]);

  const handleToggleHeightAiMode = useCallback(() => {
    // Toggle between AI and slider mode
    const nextMode = heightMode === 'ai' ? 'slider' : 'ai';
    setHeightMode(nextMode);
    showToast(nextMode === 'ai' ? 'Mode Tinggi AI aktif.' : 'Mode Tinggi AI nonaktif.', 'info');
    if (nextMode !== 'ai') {
      setHeightAiEstimate(null);
      heightAiBufferRef.current = [];
// Clear AI errors when switching modes
      setOpencvLoadError(false);
      setDetectionFailureReason(null);
    }
    triggerHeightAiNotice();
  }, [heightMode, triggerHeightAiNotice, showToast]);

  const handleCaptureClick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // VALIDASI: Pastikan video sudah memiliki dimensi nyata
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) {
      showToast('Tunggu kamera siap...', 'info');
      return;
    }

    if (navigator.vibrate) navigator.vibrate([50]);
    if (shutterSoundRef.current) {
      shutterSoundRef.current.currentTime = 0;
      shutterSoundRef.current.play().catch(() => {});
    }
    
    // Downscale ke max 1920px agar tidak OOM di mobile Chrome.
    const MAX_CAPTURE = 1920;
    const scale = Math.min(1, MAX_CAPTURE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Draw frame video yang sudah di-scale
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Overlay Watermark
    const margin = 20;
    const lh = Math.max(18, Math.round(canvas.height * 0.022));
    ctx.font = `bold ${lh}px sans-serif`;
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = Math.max(2, Math.round(lh * 0.1));

    const tanggal = new Date().toLocaleString('id-ID');
    const koordinat = gps ? `${gps.lat.toFixed(6)},${gps.lon.toFixed(6)}` : 'GPS Searching...';

    const lines = [
      `Lokasi: ${koordinat}`,
      `Pohon: ${entriesCount + 1} | Jenis: ${formState.jenis}`,
      `Tinggi: ${formState.tinggi} cm | Status: ${formState.kesehatan}`,
      `Waktu: ${tanggal}`
    ];

    lines.forEach((t, i) => {
      const y = canvas.height - margin - (lines.length - 1 - i) * (lh + 8);
      ctx.strokeText(t, margin, y);
      ctx.fillText(t, margin, y);
    });

    const brandWidth = ctx.measureText(BRAND_NAME).width;
    ctx.strokeText(BRAND_NAME, canvas.width - margin - brandWidth, margin + lh);
    ctx.fillText(BRAND_NAME, canvas.width - margin - brandWidth, margin + lh);

    const thumbnailCanvas = document.createElement('canvas');
    const thumbnailScale = Math.min(1, MAX_THUMBNAIL_SIZE / Math.max(canvas.width, canvas.height));
    thumbnailCanvas.width = Math.max(1, Math.round(canvas.width * thumbnailScale));
    thumbnailCanvas.height = Math.max(1, Math.round(canvas.height * thumbnailScale));
    const thumbnailContext = thumbnailCanvas.getContext('2d');
    let thumbnailDataUrl: string | undefined;
    if (thumbnailContext) {
      thumbnailContext.drawImage(canvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
      thumbnailDataUrl = thumbnailCanvas.toDataURL('image/jpeg', 0.6);
    }
    thumbnailCanvas.width = 0;
    thumbnailCanvas.height = 0;

    // Kirim data JPEG kualitas tinggi
    // Jika sedang kalibrasi AI (mode AI aktif, <10 sampel), simpan tinggi manual sebagai sampel
    if (isHeightAiMode && calibrationActive && heightAiSamples.length < 10) {
      const sample = clamp(round(formState.tinggi), HEIGHT_MIN_CM, HEIGHT_MAX_CM);
      setHeightAiSamples((prev) => {
        const next = [...prev, sample].slice(-10);
        const sampleNumber = Math.min(10, next.length);
        showToast(`Sampel ${sampleNumber} tersimpan`, 'info');
        triggerSampleIndicator(sampleNumber);
        // Jika sudah 10, kunci rentang AI
        if (next.length === 10) {
          const derived = deriveRangeFromSamples(next);
          if (derived) {
            setHeightAiRange(derived);
            setHeightMode('ai');
            showToast(`Rentang AI dikunci: ${derived.min}-${derived.max} cm`, 'success');
            showToast('Selamat, Anda sedang di mode AI.', 'success');
          }
        }
        return next;
      });
    }
    // Show analysis result briefly on capture
    setShowCaptureAnalysis(true);
    setTimeout(() => setShowCaptureAnalysis(false), 2500);
    
    onCapture(canvas.toDataURL('image/jpeg', 0.85), livePlantHealth, thumbnailDataUrl, isHeightAiMode ? 'ai' : 'manual');
  }, [onCapture, formState, gps, entriesCount, showToast, livePlantHealth]);

  useEffect(() => {
    let timerId: number | null = null;
    const video = videoRef.current;
    if (!video || cameraLoading || cameraError || needsUserAction) {
      setLivePlantHealth(null);
      return;
    }

    if (!analysisCanvasRef.current) {
      analysisCanvasRef.current = document.createElement('canvas');
    }

    // Set ukuran canvas sekali di luar loop agar tidak re-alloc GPU buffer tiap tick.
    const ANALYSIS_SIZE = 160;
    const canvas = analysisCanvasRef.current;
    if (canvas.width !== ANALYSIS_SIZE || canvas.height !== ANALYSIS_SIZE) {
      canvas.width = ANALYSIS_SIZE;
      canvas.height = ANALYSIS_SIZE;
    }
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      const v = videoRef.current;
      if (!v || v.videoWidth === 0 || v.videoHeight === 0 || v.readyState < 2) {
        return;
      }

      try {
        if (!context) {
          return;
        }

        const side = Math.min(v.videoWidth, v.videoHeight);
        const sx = Math.max(0, (v.videoWidth - side) / 2);
        const sy = Math.max(0, (v.videoHeight - side) / 2);
        context.drawImage(v, sx, sy, side, side, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
        const imageData = context.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
        const result = analyzePlantHealthHSV(imageData, { centerFocus: true });
        setLivePlantHealth(result);

        if (isHeightAiMode) {
          // Reset estimasi sebelum proses baru agar UI tidak stuck
          setHeightAiEstimate(null);
          (async () => {
            try {
              // Pastikan OpenCV.js sudah dimuat - ENHANCED CHECK
console.log('[AI Height] Analyzing frame, OpenCV ready:', !!(window.cv && window.cv.Mat));
              // Check enhanced state
              const loadState = (window as any).opencvLoadState as OpenCVLoadState || OpenCVLoadState.Idle;
              console.log('[AI Height] OpenCV state:', loadState, 'ready:', isOpenCVReady());
              if (loadState === OpenCVLoadState.Failed || !isOpenCVReady()) {
                try {
                  await loadOpenCV(5);
                  console.log('[AI Height] OpenCV reload attempt complete');
                  await new Promise(r => setTimeout(r, 800));
                } catch (loadErr) {
                  console.error('[AI Height] OpenCV load failed:', loadErr);
                  setDetectionFailureReason('network');
                  setHeightAiEstimate({ cm: 0, confidence: 0 });
                  showToast('OpenCV load gagal - cek console/network. Mode manual?', 'error');
                  return;
                }
              }
              if (!isOpenCVReady()) {
                console.error('[AI Height] OpenCV not ready after load');
                setDetectionFailureReason('opencv');
                setOpencvLoadError(true);
                setHeightAiEstimate({ cm: 0, confidence: 0 });
                return;
              }
              console.log('[AI Height] ✅ OpenCV ready, proceeding...');

              // Buat canvas sementara dari imageData
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = imageData.width;
              tempCanvas.height = imageData.height;
              const tempCtx = tempCanvas.getContext('2d');
              if (tempCtx) tempCtx.putImageData(imageData, 0, 0);
              
              const inputHeight = tempCanvas.height;
              const calibratedRatio = calibratePixelToCmRatio(inputHeight);
              
              console.log('[AI Height] Calibrated ratio:', calibratedRatio.toFixed(4), 'for', inputHeight + 'px height');
              const result = await detectPlantHeightOpenCV(tempCanvas, {
                pixelToCmRatio: calibratedRatio
              });
              console.log('[AI Height] Detection result:', {
                cm: result.plantHeightCm,
                px: result.plantHeightPx,
                bbox: result.boundingBox,
                contours: result.contourCount,
                areas: result.contourAreas,
                maskPx: result.maskPixelCount,
                brightnessV: result.avgBrightnessV
              });
              setHeightDebugResult(result);
              const cm = result.plantHeightCm;
              // Enhanced failure detection
              if (result.avgBrightnessV !== undefined && result.avgBrightnessV < 0.3) {
                setDetectionFailureReason('lowlight');
              } else if (cm === 0) {
                const noBbox = result.boundingBox.width === 0 || result.boundingBox.height === 0;
                setDetectionFailureReason(noBbox ? 'noplan' : 'unknown');
              } else {
                setDetectionFailureReason(null);
                setOpencvLoadError(false);
              }
              // Jika tidak terdeteksi (tinggi 0), set confidence rendah
              const displayEstimate: HeightAiEstimate = {
                cm: Math.round(cm),
                confidence: cm > 0 ? 90 : 0,
              };
              setHeightAiEstimate(displayEstimate);
              // Sinkron ke slider jika beda jauh
              const now = Date.now();
              const delta = Math.abs(formState.tinggi - cm);
              if (cm > 0 && delta >= 6 && now - lastHeightSyncRef.current >= 2500) {
                lastHeightSyncRef.current = now;
                onFormStateChange((prev) => ({ ...prev, tinggi: Math.round(cm) }));
              }
            } catch (err) {
              // Jika error pipeline, set estimasi gagal agar UI tidak stuck
              setHeightAiEstimate({ cm: 0, confidence: 0 });
              // Log error minimal
              if (process.env.NODE_ENV !== 'production') {
console.error('AI Height detection error:', err);
              }
            }
          })();
        }
      } catch {
        // Abaikan frame error sesaat saat stream berubah.
      }
    };

    tick();
    timerId = window.setInterval(tick, 1500);

    return () => {
      if (timerId !== null) {
        window.clearInterval(timerId);
      }
      // Lepas canvas dari GPU/RAM untuk mencegah memory leak.
      if (analysisCanvasRef.current) {
        analysisCanvasRef.current.width = 0;
        analysisCanvasRef.current.height = 0;
        analysisCanvasRef.current = null;
      }
    };
  }, [cameraLoading, cameraError, needsUserAction, currentDeviceId, isHeightAiMode, formState.tinggi, onFormStateChange, heightAiRange]);

  useEffect(() => {
    if (!livePlantHealth || hasAutoEnabledHeightAiRef.current) {
      return;
    }

    // Aktifkan mode Tinggi AI otomatis saat analisis live pertama kali tersedia.
    hasAutoEnabledHeightAiRef.current = true;
    setHeightMode('ai');
    triggerHeightAiNotice();
  }, [livePlantHealth, triggerHeightAiNotice]);

  useEffect(() => {
    return () => {
      if (heightAiNoticeTimerRef.current !== null) {
        window.clearTimeout(heightAiNoticeTimerRef.current);
      }
    };
  }, []);

  // DISABLED: Plant detection effect - causes lag on mobile devices
  // Re-enable if you need real-time plant bounding boxes
  /*
  useEffect(() => {
    const video = videoRef.current;
    const bbCanvas = boundingBoxCanvasRef.current;
    
    if (!video || !bbCanvas || cameraLoading || cameraError || needsUserAction) {
      return;
    }

    const ctx = bbCanvas.getContext('2d');
    if (!ctx) return;

    const runDetection = async () => {
      const v = videoRef.current;
      if (!v || v.videoWidth === 0 || v.videoHeight === 0 || v.readyState < 2) {
        console.warn('[DEBUG] Video belum siap', {
          v,
          videoWidth: v?.videoWidth,
          videoHeight: v?.videoHeight,
          readyState: v?.readyState
        });
        setDetectionError('Video belum siap untuk deteksi');
        return;
      }

      const startTime = performance.now();
      try {
        if (bbCanvas.width !== v.videoWidth || bbCanvas.height !== v.videoHeight) {
          bbCanvas.width = v.videoWidth;
          bbCanvas.height = v.videoHeight;
        }
        ctx.clearRect(0, 0, bbCanvas.width, bbCanvas.height);
        const detectionResult = await detectPlantsRealtime(v);
        const elapsed = performance.now() - startTime;
        console.log('[DEBUG] detectionResult', detectionResult, 'Processing time:', elapsed, 'ms');
        if (detectionResult.error) {
          setDetectionError('Deteksi gagal: ' + detectionResult.error);
        } else if (!detectionResult.plants || detectionResult.plants.length === 0) {
          setDetectionError('Tidak ada tanaman terdeteksi');
        } else {
          setDetectionError(null);
        }
        if (detectionResult.plants && detectionResult.plants.length > 0) {
          const scaleX = v.videoWidth / 160;
          const scaleY = v.videoHeight / 160;
          detectionResult.plants.forEach((plant, index) => {
            const colors = ['#00FF00', '#00FFFF', '#FF00FF', '#FFFF00', '#FF6B6B', '#4ECDC4'];
            const color = colors[index % colors.length];
            const x = plant.x * scaleX;
            const y = plant.y * scaleY;
            const width = plant.width * scaleX;
            const height = plant.height * scaleY;
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, width, height);
            const heightPx = Math.round(plant.height);
            ctx.fillStyle = color;
            ctx.font = 'bold 16px sans-serif';
            ctx.fillText(`Plant ${index + 1}: ${heightPx}px`, x, Math.max(y - 10, 20));
            setDetectedPlants(prev => [...prev, {
              x: plant.x,
              y: plant.y,
              width: plant.width,
              height: plant.height,
              confidence: plant.confidence
            }]);
          });
        }
        if (elapsed > 1000) {
          setDetectionError(`Proses deteksi lambat: ${Math.round(elapsed)} ms. Coba kurangi resolusi atau tutup aplikasi lain.`);
        }
      } catch (err) {
        console.error('[DEBUG] Detection frame error:', err);
        setDetectionError('Error deteksi: ' + (err?.message || err));
      }
    };

    // Run initial detection
    runDetection();
    
    // Set up interval for continuous detection (every 2 seconds)
    timerId = window.setInterval(runDetection, 2000);

    return () => {
      if (timerId !== null) {
        window.clearInterval(timerId);
      }
    };
  }, [cameraLoading, cameraError, needsUserAction, isHeightAiMode]);
  */

  // Calculate grid guidance values
  const gridGuidance = useMemo(() => {
    if (!gridAnchor || !effectiveCoordinate || !gps) {
      return null;
    }
    
    const targetStepX = effectiveCoordinate.stepX;
    const targetStepY = effectiveCoordinate.stepY;
    const currentStepX = effectiveCoordinate.stepX;
    const currentStepY = effectiveCoordinate.stepY;
    
    // Calculate distance to target (current position)
    const distanceToTarget = distanceFromAnchorM ?? 0;
    const isAtTarget = isWithinCaptureThreshold(distanceToTarget, DEFAULT_CAPTURE_THRESHOLD_M);
    
    // Get direction (simplified - shows direction to move)
    const direction = calculateDirectionToPoint(
      currentStepX,
      currentStepY,
      targetStepX,
      targetStepY
    );
    
    return {
      direction,
      distanceToTarget,
      isAtTarget,
      targetStepX,
      targetStepY,
      currentStepX,
      currentStepY,
    };
  }, [gridAnchor, effectiveCoordinate, gps, distanceFromAnchorM]);

  // Simple grid overlay - only show when anchor is set
  const shouldShowGridOverlay = gridAnchor !== null;

  return (
    <div className="relative w-screen h-[100dvh] min-h-[100dvh] bg-black overflow-hidden flex items-center justify-center">
      {/* NEW GRID OVERLAY - Enhanced with target points, directional arrows, and capture feedback */}
      {shouldShowGridOverlay && gridGuidance && (
        <div className="pointer-events-none absolute inset-0 z-20">
          <svg width="100%" height="100%" viewBox="0 0 100 100" className="w-full h-full" style={{position:'absolute',top:0,left:0}}>
            {/* Grid lines - 4x4 grid pattern */}
            {[1,2,3].map(i => (
              <line key={`v${i}`} x1={(i*100/4).toFixed(2)} y1="0" x2={(i*100/4).toFixed(2)} y2="100" stroke="white" strokeWidth="0.5" opacity="0.3" />
            ))}
            {[1,2,3].map(i => (
              <line key={`h${i}`} y1={(i*100/4).toFixed(2)} x1="0" y2={(i*100/4).toFixed(2)} x2="100" stroke="white" strokeWidth="0.5" opacity="0.3" />
            ))}
            
            {/* Target point marker - center of view */}
            <circle cx="50" cy="50" r="3" fill={gridGuidance.isAtTarget ? "#22c55e" : "#3b82f6"} opacity="0.8" />
            
            {/* Green feedback ring when at target */}
            {gridGuidance.isAtTarget && (
              <circle cx="50" cy="50" r="8" fill="none" stroke="#22c55e" strokeWidth="1" opacity="0.6">
                <animate attributeName="r" values="6;12;6" dur="1.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.8;0.2;0.8" dur="1.5s" repeatCount="indefinite" />
              </circle>
            )}
            
            {/* Capture lock indicator - red when at target */}
            {gridGuidance.isAtTarget && (
              <circle cx="50" cy="50" r="15" fill="none" stroke="#ef4444" strokeWidth="2" opacity="0.9">
                <animate attributeName="stroke-opacity" values="1;0.3;1" dur="0.8s" repeatCount="indefinite" />
              </circle>
            )}
          </svg>
          
          {/* Directional Arrow - Large arrow pointing to target direction */}
          {gridGuidance.direction !== 'none' && !gridGuidance.isAtTarget && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
              <div className={`
                relative flex flex-col items-center justify-center
                ${gridGuidance.direction === 'north' ? 'mt-[-20%]' : ''}
                ${gridGuidance.direction === 'south' ? 'mb-[-20%]' : ''}
                ${gridGuidance.direction === 'east' ? 'mr-[-15%]' : ''}
                ${gridGuidance.direction === 'west' ? 'ml-[-15%]' : ''}
              `}>
                {/* Arrow SVG based on direction */}
                <svg 
                  className={`w-20 h-20 ${gridGuidance.direction === 'north' ? 'rotate-0' : ''} ${gridGuidance.direction === 'south' ? 'rotate-180' : ''} ${gridGuidance.direction === 'east' ? 'rotate-90' : ''} ${gridGuidance.direction === 'west' ? 'rotate-[-90deg]' : ''}`}
                  viewBox="0 0 24 24" 
                  fill="none"
                >
                  <path 
                    d="M12 4L4 14h5v6l8-10-8-10v6h5L12 4z" 
                    fill="white" 
                    stroke="black" 
                    strokeWidth="1"
                    opacity="0.9"
                  />
                </svg>
                <span className="absolute -bottom-8 text-white text-xs font-bold bg-black/50 px-2 py-1 rounded">
                  {getDirectionLabel(gridGuidance.direction)}
                </span>
              </div>
            </div>
          )}
          
          {/* At Target Indicator
          {gridGuidance.isAtTarget && (
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
              <div className="flex flex-col items-center">
                <div className="bg-emerald-500/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-emerald-300/50 animate-pulse">
                  <span className="text-white text-sm font-bold">
                    ✓ SESUAI
                  </span>
                </div>
                <span className="text-emerald-200/70 text-[10px] font-medium mt-1">
                  {formatDistance(gridGuidance.distanceToTarget)} dari target
                </span>
              </div>
            </div>
          )}
          
          {/* Capture Lock Indicator - Red when locked/at target */}
          {gridGuidance.isAtTarget && (
            <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
              <div className="flex items-center gap-2 bg-red-500/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-red-300/50">
                <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
                <span className="text-white text-sm font-bold">
                  KUNCI CAPTURE AKTIF
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legacy grid overlay for AI height mode - REMOVED for performance */}
      {/* {showGridOverlay && !gridAnchor && ( */}

      {/* PETUNJUK KALIBRASI, muncul saat mulai mode AI */}
      {showCalibrationHint && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
          <div className="text-white text-2xl sm:text-4xl font-black drop-shadow-lg bg-black/60 rounded-2xl px-8 py-4 animate-fade-in-out text-center">
            Geser slider tinggi manual, lalu klik foto untuk menyimpan sampel
          </div>
        </div>
      )}
      {/* PENANDA ANGKA BESAR, muncul 1-2 detik setiap kali sampel diambil */}
      {sampleIndicator && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
          <div className="text-white text-[7rem] font-black drop-shadow-lg bg-black/30 rounded-2xl px-10 py-2 animate-fade-in-out">
            {sampleIndicator}
          </div>
        </div>
      )}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${cameraLoading ? 'opacity-0' : 'opacity-100'}`} 
      />
      
      {/* Measurement Canvas Overlay - can be hidden to avoid obstruction */}
      {isMeasureMode && !cameraLoading && !cameraError && (
        <>
          {/* Clickable overlay for measurement - always present for interaction */}
          <div
            className="absolute inset-0 z-35"
            style={{ cursor: measurePoints.length < 2 ? 'crosshair' : 'default' }}
            onClick={handleMeasureCanvasClick}
            onMouseMove={handleMeasureMouseMove}
            onMouseUp={handleMeasureMouseUp}
            onMouseLeave={handleMeasureMouseUp}
            onTouchMove={handleMeasureMouseMove}
            onTouchEnd={handleMeasureMouseUp}
          />
          {/* Visual overlay lines - can be toggled */}
          {showMeasureOverlay && (
            <canvas
              ref={measureCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none z-36"
              style={{ objectFit: 'cover', opacity: 0.8 }}
            />
          )}
        </>
      )}
      {/* AI Height Debug Overlay */}
      {showHeightDebug && isHeightAiMode && heightDebugResult && !cameraLoading && !cameraError && (
        <canvas
          ref={debugCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-37"
          style={{ objectFit: 'cover' }}
        />
      )}
      
      {/* Measurement Guide Text - hidden now for cleaner UI */}
      {isMeasureMode && false && measureGuideText && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
          <div className="bg-orange-500/90 backdrop-blur-sm px-6 py-3 rounded-2xl border-2 border-white shadow-lg">
            <span className="text-white text-lg font-bold tracking-wide">{measureGuideText}</span>
          </div>
        </div>
      )}

      {/* Measurement Result Display */}
      {measuredHeightCm && (
        <div className="absolute top-[calc(var(--safe-area-inset-top)+120px)] left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="bg-emerald-500/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-emerald-300/50">
            <span className="text-white text-lg font-bold">
              {(measuredHeightCm / 100).toFixed(2)} m
            </span>
          </div>
        </div>
      )}
      {false && showBoundingBox && !cameraLoading && !cameraError && (
        <PlantDetectionOverlay
          videoRef={videoRef}
          isEnabled={false}
          detectionInterval={5000}
          pixelToCmRatio={0.04}
          onDetection={(plants, heightCm) => {
            console.log('[PlantDetection] Deteksi berhasil:', plants.length, 'tanaman', heightCm ? `${heightCm}cm` : '');
            if (heightCm && heightCm > 0) {
              setHeightAiEstimate({ cm: Math.round(heightCm), confidence: 90 });
            }
          }}
          showHeightLabel={true}
        />
      )}
      
      {/* Bounding Box Overlay Canvas - DISABLED along with plant detection */}
      {false && showBoundingBox && !cameraLoading && !cameraError && !isHeightAiMode && (
        <>
          <canvas
            ref={boundingBoxCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
            style={{ objectFit: 'cover' }}
          />
          {detectionError && (
            <div className="absolute top-0 left-0 right-0 z-50 bg-red-700/80 text-white text-center py-2 text-xs font-bold animate-pulse">
              {detectionError}
            </div>
          )}
        </>
      )}
      
      {(cameraError || needsUserAction) && (
        <div className="z-50 flex flex-col items-center gap-6 px-10 text-center animate-in fade-in duration-500">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/20 text-white">
            {cameraError ? <IconWarning /> : <IconCamera />}
          </div>
          <div className="space-y-2">
            <p className="text-white font-black text-sm uppercase tracking-widest leading-relaxed">
              {cameraError || 'Kamera Siap'}
            </p>
            {needsUserAction && (
              <p className="text-white/60 text-[10px] uppercase tracking-tighter">
                Kebijakan browser memerlukan interaksi manual untuk memulai stream.
              </p>
            )}
          </div>
          {needsUserAction && (
            <button 
              onClick={handleRetryPlay}
              className="px-8 py-4 bg-white text-black font-black text-xs uppercase tracking-widest rounded-full shadow-2xl active:scale-95 transition-transform"
            >
              Aktifkan Kamera
            </button>
          )}
        </div>
      )}

      {cameraLoading && !cameraError && (
        <div className="z-20 flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin" />
          <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Initializing Lens...</span>
        </div>
      )}

      {!isOnline && (
        <div className="absolute top-[calc(var(--safe-area-inset-top)+80px)] left-1/2 -translate-x-1/2 z-30 px-3 py-1 bg-amber-500/95 rounded-full flex items-center gap-2 shadow-lg">
          <span className="text-[10px] font-black text-white uppercase tracking-widest">Mode Offline</span>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
      <audio ref={shutterSoundRef} src={SHUTTER_SOUND_BASE64} preload="auto" />

      <div className="absolute top-0 left-0 right-0 px-3 sm:px-5 py-3 sm:py-5 flex justify-between items-start z-30 pointer-events-none safe-top">
        <div className="flex flex-col gap-3 pointer-events-auto">
          <Compass />
          <a 
            href="https://www.montana-tech.info/" 
            target="_blank"
            rel="noopener noreferrer"
            className="w-10 h-10 rounded-full bg-black/15 backdrop-blur-sm border border-white/5 text-white/70 flex items-center justify-center shadow-lg active:scale-90 transition-all hover:bg-black/30"
          >
            <IconHome />
          </a>
        </div>

        <div className="flex flex-col items-end gap-2 pointer-events-auto max-w-[220px]">
          <div className="w-full bg-black/15 backdrop-blur-sm px-3 py-2 rounded-2xl border border-white/5 shadow-md">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[8px] font-black text-white/60 uppercase tracking-widest">Panel Kamera</span>
              <button
                onClick={() => setShowGridPanel((prev) => !prev)}
                className="w-5 h-5 rounded-md bg-white/10 text-white/90 text-[10px] font-black border border-white/20 flex items-center justify-center"
                title={showGridPanel ? 'Sembunyikan panel' : 'Munculkan panel'}
              >
                {showGridPanel ? '-' : '+'}
              </button>
            </div>

            {!showGridPanel && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[9px] font-black text-white">{entriesCount}/{DAILY_TARGET}</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-red-500'}`} />
                    <span className="text-[7px] font-black text-white/80 uppercase">{isOnline ? 'Online' : 'Offline'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        gps && Number.isFinite(gps.accuracy) && gps.accuracy > 10 ? 'bg-black border border-white/40' : 'bg-emerald-400'
                      }`}
                    />
                    <span className="text-[7px] font-black text-white/80 uppercase">
                      {gps && Number.isFinite(gps.accuracy) && gps.accuracy > 10 ? 'Akurasi Rendah' : 'Akurasi OK'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {showGridPanel && (
              <>
                <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-700" style={{ width: `${progressPercentage}%` }} />
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <span className={`text-[8px] font-black uppercase tracking-widest ${isSyncing ? 'text-blue-300' : isOnline ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {isSyncing ? 'SYNCING' : isOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                  <span className="text-[8px] text-white/60 font-bold">Pending {pendingCount}</span>
                </div>
                <p className="mt-0.5 text-[7px] text-white/45 font-bold">
                  Last sync {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                </p>

                <div className="mt-2 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[8px] font-black text-white/70 uppercase tracking-widest">Grid {formState.spacingX}x{formState.spacingY}</span>
                    <span className={`text-[8px] font-black uppercase tracking-widest ${gridAnchor ? 'text-emerald-200' : 'text-amber-200'}`}>
                      {gridAnchor ? 'AKTIF' : 'MANUAL GPS'}
                    </span>
                  </div>

                  <p className="mt-1 text-[8px] text-white/75 font-bold truncate">
                    KOORDINAT ASLI {gps ? `${gps.lat.toFixed(6)}, ${gps.lon.toFixed(6)}` : '--'}
                  </p>
                  <p className="mt-0.5 text-[8px] text-emerald-200 font-bold truncate">
                    KOORDINAT REVISI {effectiveCoordinate ? `${effectiveCoordinate.lat.toFixed(6)}, ${effectiveCoordinate.lon.toFixed(6)}` : '--'}
                  </p>

                  {gridAnchor && (
                    <p className="mt-0.5 text-[8px] text-amber-200 font-bold">
                      Step {effectiveCoordinate ? `${effectiveCoordinate.stepX}, ${effectiveCoordinate.stepY}` : '--'} | Dist {distanceFromAnchorM !== null ? `${distanceFromAnchorM.toFixed(2)}m` : '--'}
                    </p>
                  )}
                  <p className="mt-0.5 text-[7px] text-white/45">
                    Atas: koordinat asli, bawah: koordinat revisi grid 4x4.
                  </p>

                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <button
                      onClick={onSetGridAnchor}
                      disabled={!canSetAnchor}
                      className="px-2 py-1 rounded-lg bg-blue-500/70 disabled:bg-blue-500/25 text-white text-[8px] font-black uppercase tracking-widest border border-blue-300/30"
                    >
                      Set Awal
                    </button>
                    <button
                      onClick={onClearGridAnchor}
                      className="px-2 py-1 rounded-lg bg-white/10 text-white/90 text-[8px] font-black uppercase tracking-widest border border-white/20"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-end">

            {!gps && (
              <div className="bg-red-500/10 backdrop-blur-sm px-2 py-1 rounded-lg border border-red-500/15 flex items-center gap-2 animate-pulse">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span className="text-[7px] font-black text-red-200 uppercase tracking-widest">GPS SEARCHING</span>
              </div>
            )}

            {gps && Number.isFinite(gps.accuracy) && (
              <div className={`backdrop-blur-sm px-2 py-1 rounded-lg border flex items-center gap-1.5 ${
                gps.accuracy < 5
                  ? 'bg-emerald-500/10 border-emerald-500/15'
                  : gps.accuracy <= 10
                    ? 'bg-amber-500/10 border-amber-500/15'
                    : 'bg-red-500/10 border-red-500/15'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${
                  gps.accuracy < 5 ? 'bg-emerald-400' : gps.accuracy <= 10 ? 'bg-amber-400' : 'bg-red-400'
                }`} />
                <span className={`text-[7px] font-black uppercase tracking-widest ${
                  gps.accuracy < 5 ? 'text-emerald-200' : gps.accuracy <= 10 ? 'text-amber-200' : 'text-red-200'
                }`}>
                  GPS ±{gps.accuracy < 10 ? gps.accuracy.toFixed(1) : Math.round(gps.accuracy)}m
                </span>
              </div>
            )}

            {/* Height Display - prominent like GPS accuracy */}
            <div className={`backdrop-blur-sm px-2 py-1 rounded-lg border flex items-center gap-1.5 ${
              heightMode === 'ai' 
                ? 'bg-cyan-500/10 border-cyan-500/15'
                : heightMode === 'pixel-scale'
                  ? 'bg-orange-500/10 border-orange-500/15'
                  : 'bg-emerald-500/10 border-emerald-500/15'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${
                heightMode === 'ai' ? 'bg-cyan-400' : heightMode === 'pixel-scale' ? 'bg-orange-400' : 'bg-emerald-400'
              }`} />
              <span className={`text-[7px] font-black uppercase tracking-widest ${
                heightMode === 'ai' ? 'text-cyan-200' : heightMode === 'pixel-scale' ? 'text-orange-200' : 'text-emerald-200'
              }`}>
                ±{formState.tinggi}cm
              </span>
            </div>

            {livePlantHealth && (
              <div className="bg-black/15 backdrop-blur-sm px-2 py-1 rounded-lg border border-white/5 flex items-center gap-2">
                <span
                  className={`text-[7px] font-black uppercase tracking-widest ${
                    livePlantHealth.health === 'Sehat'
                      ? 'text-emerald-300'
                      : livePlantHealth.health === 'Merana'
                        ? 'text-amber-300'
                        : 'text-red-300'
                  }`}
                >
                  AI: {livePlantHealth.health}
                </span>
                <span className="text-[7px] font-bold text-white/70">{livePlantHealth.confidence}%</span>
              </div>
            )}

{isHeightAiMode && heightAiEstimate && heightAiEstimate.cm > 0 && (
              <div className="bg-emerald-500/20 backdrop-blur-sm px-2 py-1 rounded-lg border border-emerald-300/25 flex items-center gap-2">
                <span className={`text-[7px] font-black uppercase tracking-widest ${heightAiEstimate.cm > 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                  AI Tinggi
                </span>
                <span className={`text-[7px] font-bold ${heightAiEstimate.cm > 0 ? 'text-emerald-200' : 'text-red-200'}`}>
                  : {heightAiEstimate.cm} cm
                </span>
              </div>
            )}
            {isHeightAiMode && detectionFailureReason && (
              <div className="bg-red-500/20 backdrop-blur-sm px-3 py-2 rounded-xl border border-red-400/30 flex items-center gap-2 text-sm animate-pulse">
                <svg className="w-4 h-4 text-red-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
{detectionFailureReason === 'opencv' && '⚠️ OpenCV belum dimuat (perlu internet)'}
                {detectionFailureReason === 'network' && '🌐 Koneksi internet gagal - cek proxy/VPN'}
                {detectionFailureReason === 'lowlight' && '💡 Cahaya kurang - tambah pencahayaan'}
                {detectionFailureReason === 'noplan' && '🌱 Tanaman tidak terdeteksi, coba atur posisi/cahaya'}
                {detectionFailureReason === 'unknown' && '❓ Deteksi gagal, coba lagi'}
              </div>
            )}
            {isHeightAiMode && (
              <button
                onClick={() => setShowHeightDebug(!showHeightDebug)}
                className={`px-2 py-1 rounded-md border text-[7px] font-black uppercase tracking-wide active:scale-95 transition-all ${
                  showHeightDebug 
                    ? 'bg-purple-500/60 border-purple-400 text-purple-100' 
                    : 'bg-black/30 border-white/20 text-white/70'
                }`}
                title={showHeightDebug ? 'Sembunyikan debug mask/bbox' : 'Tampilkan debug mask/bbox AI height'}
              >
                {showHeightDebug ? 'Debug: ON' : 'Debug'}
              </button>
            )}

            {isHeightAiMode && (!heightAiEstimate || heightAiEstimate.cm === 0) && !detectionFailureReason && (
              <div className="bg-amber-500/20 backdrop-blur-sm px-2 py-1 rounded-lg border border-amber-300/25 flex items-center gap-2">
                <span className="text-[7px] font-black text-amber-200 uppercase tracking-widest">AI Tinggi</span>
                <span className="text-[7px] font-bold text-amber-200">: Mengukur...</span>
              </div>
            )}

            {!isHeightAiMode && (
              <div className="bg-red-500/15 backdrop-blur-sm px-2 py-1 rounded-lg border border-red-300/20 flex items-center gap-2">
                <span className="text-[7px] font-black text-red-300 uppercase tracking-widest">AI Tinggi</span>
                <span className="text-[7px] font-bold text-red-200/70">: ---</span>
              </div>
            )}


            {isMeasureMode && (
              <div className="bg-black/15 backdrop-blur-sm px-2 py-1 rounded-lg border border-orange-300/20 flex items-center gap-2">
                <span className="text-[7px] font-black text-orange-200 uppercase tracking-widest">Ukur Tinggi</span>
                <span className="text-[7px] font-bold text-white/65">Aktif</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* InfoOverlay removed — info already shown in top-right panel and bottom controls */}
      
      <div className="absolute bottom-0 left-0 right-0 z-40 safe-bottom">
        <div className="mx-3 sm:mx-4 mb-3 sm:mb-6 space-y-3 sm:space-y-4">
          
          <div className="mx-auto w-full max-w-[560px] bg-black/14 backdrop-blur-md rounded-[1.1rem] sm:rounded-[1.25rem] border border-white/5 p-2 sm:p-2.5 flex flex-col gap-2 shadow-[0_6px_16px_rgba(0,0,0,0.12)]">
            <div className="flex justify-between items-center px-1.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHeightControlsCollapsed(!heightControlsCollapsed)}
                  className="p-1 rounded hover:bg-white/10 transition-colors"
                  title={heightControlsCollapsed ? 'Tampilkan kontrol tinggi' : 'Sembunyikan kontrol tinggi'}
                >
                  <svg className="w-4 h-4 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {heightControlsCollapsed ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    )}
                  </svg>
                </button>
                <div className={`w-1.5 h-1.5 rounded-full ${
                  heightMode === 'ai' ? 'bg-cyan-400' :
                  heightMode === 'pixel-scale' ? 'bg-orange-400' :
                  'bg-emerald-400'
                }`} />
                <span className="text-[9px] font-black text-white uppercase tracking-wider">
                  {heightMode === 'ai' ? 'Tinggi AI' : heightMode === 'pixel-scale' ? 'Ukur Tinggi' : 'Pengaturan Tinggi'}
                </span>
              </div>
              <span className="text-[10px] sm:text-xs font-black text-white bg-emerald-500/65 px-2.5 sm:px-3 py-1 rounded-xl border border-emerald-300/20">
                {formState.tinggi} cm
              </span>
            </div>
            
            {!heightControlsCollapsed && (
              <>
            <div className="relative px-1.5 py-1.5">
              <input 
                type="range" min={HEIGHT_MIN_CM} max={HEIGHT_MAX_CM} value={formState.tinggi} 
                onChange={e => onFormStateChange(prev => ({ ...prev, tinggi: parseInt(e.target.value) }))}
                className="w-full h-3.5 sm:h-4 bg-emerald-600/20 rounded-full appearance-none cursor-pointer outline-none
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-8 [&::-webkit-slider-thumb]:h-8 sm:[&::-webkit-slider-thumb]:w-10 sm:[&::-webkit-slider-thumb]:h-10 
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white 
                  [&::-webkit-slider-thumb]:shadow-[0_0_16px_rgba(255,255,255,0.7),0_0_8px_rgba(0,0,0,0.18)] 
                  [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-emerald-500
                  [&::-moz-range-thumb]:w-8 [&::-moz-range-thumb]:h-8 sm:[&::-moz-range-thumb]:w-10 sm:[&::-moz-range-thumb]:h-10 [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-emerald-500
                  [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white" 
              />

              <div className="mt-1.5 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5">
                  {/* Toggle overlay visibility for pixel scale mode - addresses obstruction issue */}
                  {isMeasureMode && (
                    <button
                      onClick={() => setShowMeasureOverlay(!showMeasureOverlay)}
                      className={`px-2 py-1 rounded-md border text-[7px] font-black uppercase tracking-wide active:scale-95 transition-all ${
                        showMeasureOverlay 
                          ? 'bg-orange-500/40 border-orange-400/40 text-orange-200' 
                          : 'bg-black/20 border-white/15 text-white/80'
                      }`}
                      title={showMeasureOverlay ? 'Sembunyikan garis pengukuran' : 'Tampilkan garis pengukuran'}
                    >
                      {showMeasureOverlay ? 'Garis: ON' : 'Garis: OFF'}
                    </button>
                    )}
                    
                    {/* Quick stick height adjustment - shown when in measure mode */}
                    {isMeasureMode && (
                    <button
                      onClick={() => {
                        const newHeight = stickHeightMeters >= 3 ? 1 : stickHeightMeters + 0.5;
                        setStickHeightMeters(newHeight);
                        localStorage.setItem('pixel-scale-stick-height', newHeight.toString());
                        if (navigator.vibrate) navigator.vibrate(30);
                      }}
                      className="px-2 py-1 rounded-md border text-[7px] font-black uppercase tracking-wide active:scale-95 transition-all bg-black/20 border-white/15 text-white/80"
                      title={`Tinggi tongkat: ${stickHeightMeters}m - klik untuk ubah`}
                    >
                      📏{stickHeightMeters}m
                    </button>
                    )}
                    
                    {/* Quick line offset adjustment - shown when in measure mode */}
                    {isMeasureMode && (
                    <button
                      onClick={() => {
                        const newOffset = lineOffsetPercent >= 30 ? 10 : lineOffsetPercent + 5;
                        setLineOffsetPercent(newOffset);
                        localStorage.setItem('pixel-scale-line-offset', newOffset.toString());
                        if (navigator.vibrate) navigator.vibrate(30);
                      }}
                      className="px-2 py-1 rounded-md border text-[7px] font-black uppercase tracking-wide active:scale-95 transition-all bg-black/20 border-white/15 text-white/80"
                      title={`Garis: ${lineOffsetPercent}% - klik untuk ubah`}
                    >
                      ‖{lineOffsetPercent}%
                    </button>
                    )}
                    
                    {/* Line position adjustment - move lines up/down */}
                    {isMeasureMode && (
                    <button
                      onClick={() => {
                        const newPos = linePositionPercent >= 80 ? 20 : linePositionPercent + 10;
                        setLinePositionPercent(newPos);
                        localStorage.setItem('pixel-scale-line-position', newPos.toString());
                        if (navigator.vibrate) navigator.vibrate(30);
                      }}
                      className="px-2 py-1 rounded-md border text-[7px] font-black uppercase tracking-wide active:scale-95 transition-all bg-black/20 border-white/15 text-white/80"
                      title={`Posisi garis: ${linePositionPercent}%`}
                    >
                      ↕{linePositionPercent}%
                    </button>
                    )}
                  </div>

                {/* Show status text based on mode */}
                {isHeightAiMode && (
                  <span className="text-[7px] font-black text-cyan-100 uppercase tracking-wide">
                    {heightAiEstimate ? `Estimasi ${heightAiEstimate.cm}cm (${heightAiEstimate.confidence}%)` : 'Mengukur...'}
                  </span>
                )}
                {isMeasureMode && false && measureGuideText && (
                  <span className="text-[7px] font-black text-orange-100 uppercase tracking-wide">
                    {measureGuideText}
                  </span>
                )}
              </div>

              {!isHeightAiMode && (
                <p className="mt-1.5 text-[7px] font-bold text-white/65 uppercase tracking-wide">
                  Tekan AI Tinggi ON untuk estimasi otomatis.
                </p>
              )}

              {heightAiRange && (
                <p className="mt-1.5 text-[7px] font-bold text-cyan-100/90 uppercase tracking-wide">
                  Batas AI aktif: {heightAiRange.min}-{heightAiRange.max} cm.
                </p>
              )}
            </div>
            </>
            )}

          </div>

          <div className="px-2 -mt-1">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1.5 px-2 rounded-2xl bg-black/10 backdrop-blur-sm border border-white/5 shadow-md">
              {PLANT_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => onFormStateChange(prev => ({ ...prev, jenis: type }))}
                  className={`flex-shrink-0 px-2.5 sm:px-3 py-1.5 rounded-xl text-[8px] sm:text-[9px] font-black tracking-widest border transition-all duration-300 ${
                    formState.jenis === type
                      ? 'bg-white/85 border-white/80 text-slate-900 shadow-sm'
                      : 'bg-black/10 border-white/20 text-white/85 hover:bg-white/10'
                  }`}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center px-2 pt-1">
            <button 
              onClick={onShowSheet} 
              className="w-14 h-14 rounded-full bg-black/15 backdrop-blur-sm border border-white/5 text-white/70 flex items-center justify-center shadow-lg active:scale-90 transition-all hover:bg-black/30"
            >
              <IconPanel />
            </button>

            <div className="flex items-center justify-center">
      {/* TOMBOL CAPTURE PUTIH BOLD (SOLID) */}
              <button 
                onClick={e => {
                  handleCaptureClick(e);
                }}
                disabled={cameraLoading || !!cameraError || needsUserAction}
                className="group relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center active:scale-95 transition-all disabled:opacity-20"
              >
                {/* Ring Luar Putih Solid */}
                <div className="absolute inset-0 rounded-full border-[6px] border-white scale-110 group-active:scale-100 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.2)]" />
                
                {/* Lingkaran Dalam Putih Solid */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-full flex items-center justify-center transition-all group-hover:scale-105 shadow-2xl ring-4 ring-black/5">
                  {/* Visual Gap Circle */}
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full border border-black/5" />
                </div>
                
                {/* Efek Sentuh */}
                <div className="absolute w-8 h-8 bg-black/5 rounded-full opacity-0 group-active:opacity-100 transition-opacity" />
              </button>
            </div>

            <button 
              onClick={handleSwitchCamera} 
              className="w-14 h-14 rounded-full bg-black/15 backdrop-blur-sm border border-white/5 text-white/70 flex items-center justify-center shadow-lg active:scale-90 transition-all hover:bg-black/30"
            >
              <IconSwitchCamera />
            </button>
          </div>

        </div>
      </div>

      {showHeightAiPopup && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-4 bg-black/45 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-2xl border border-cyan-300/25 bg-slate-950/95 p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-black text-cyan-100 uppercase tracking-widest">Kalibrasi Tinggi AI</p>
                <p className="mt-1 text-[9px] text-cyan-100/85 font-bold">
                  Ambil 10 sampel manual. Sistem membentuk rentang min-max agar estimasi AI tidak terlalu rendah/tinggi.
                </p>
              </div>
              <button
                onClick={dismissHeightAiNotice}
                className="w-6 h-6 rounded-full border border-cyan-200/35 text-cyan-100 text-[11px] font-black leading-none flex items-center justify-center"
                aria-label="Tutup popup kalibrasi"
                title="Tutup"
              >
                x
              </button>
            </div>

            <div className="mt-3 rounded-xl bg-cyan-500/10 border border-cyan-300/20 p-2.5">
              <p className="text-[9px] font-black text-cyan-100 uppercase tracking-widest">Progress Sampel</p>
              <p className="mt-1 text-[9px] font-bold text-white/90">{Math.min(10, heightAiSamples.length)}/10 sampel</p>
              <p className="mt-1 text-[8px] font-bold text-white/70">Nilai saat ini: {formState.tinggi} cm</p>
              {heightAiRange && (
                <p className="mt-1 text-[8px] font-bold text-cyan-100">Rentang aktif: {heightAiRange.min}-{heightAiRange.max} cm</p>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={resetHeightAiCalibration}
                className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-[9px] font-black uppercase tracking-widest active:scale-95"
              >
                Reset
              </button>
            </div>

            <p className="mt-3 text-[8px] font-bold text-white/65">
              Catatan: tinggi AI akan auto-update ke kolom tinggi di aplikasi, lalu ikut tersimpan saat foto di-capture.
            </p>

            <button
              onClick={closeHeightAiPopup}
              className="mt-3 w-full px-3 py-2 rounded-xl bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest active:scale-95"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.5)_100%)]" />
      
      {/* Live Health Comment -muncul hanya saat capture */}
      {showCaptureAnalysis && livePlantHealth && (
        <LiveHealthComment healthResult={livePlantHealth} duration={2500} />
      )}
    </div>
  );
};
