
export interface GpsLocation {
  lat: number;
  lon: number;
  accuracy: number;
}

export type ViewMode = 'camera' | 'gis';

export type SyncMode = 'fast' | 'lite' | 'hyperlink';
export type PlantHealthLabel = 'Sehat' | 'Merana' | 'Mati';
export type BottomSheetTabId = 'form' | 'grafik' | 'data' | 'hcv' | 'help' | 'dashboard' | 'pengaturan';

export type AutoBackupIntervalMinutes = 0 | 15 | 30 | 60;

export interface BottomSheetTabRequest {
  tabId: BottomSheetTabId;
  requestKey: string;
}

export interface HcvInsightSelection {
  source: 'camera-ai' | 'analytics-ai';
  health: PlantHealthLabel;
  confidence: number;
  hue?: number;
  saturation?: number;
  value?: number;
}

export interface BrowserStorageStatus {
  usageBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  usageRatio: number;
  level: 'normal' | 'warning' | 'critical' | 'unsupported';
}

export const DEFAULT_PLANT_TYPES = ['Sengon', 'Nangka', 'Mahoni', 'Malapari'] as const;

// Cloud/GAS Types
export type Tree = PlantEntry;

export interface EcologyMetrics {
  treeId: string;
  density_ha: number;
  cci: number;
  total_biomass_kg: number;
  ndvi?: number;
  health_score?: number;
  analysis_timestamp: string;
}

export interface CloudTree extends Tree {
  cloudId?: string;
  syncedAt?: string;
}

export interface CloudEcologyMetrics extends EcologyMetrics {
  source: 'cloud';
  analysisDate: string;
}

// ============================================
// GRID SYSTEM TYPES
// ============================================

export type GridDirection = 'north' | 'south' | 'east' | 'west' | 'none';

export interface GridConfig {
  spacingX: number; // meters between columns
  spacingY: number; // meters between rows
  captureThresholdM: number; // max distance to allow capture (default: 1m)
}

export interface GridPoint {
  lat: number;
  lon: number;
  stepX: number; // column index
  stepY: number; // row index
}

export interface GridState {
  anchor: GridPoint; // starting point (set by user)
  currentTarget: GridPoint | null; // current target point to move to
  currentPosition: GridPoint | null; // user's snapped position
  direction: GridDirection; // which direction to move
  distanceToTargetM: number; // distance to target point
  isAtTarget: boolean; // true if within capture threshold
  lastCaptureStepX: number;
  lastCaptureStepY: number;
}

export interface PlantEntry {
    /**
     * Mode pengambilan data: 'manual' untuk sampel manual, 'ai' untuk otomatis
     */
    mode?: 'manual' | 'ai';
  id: string;
  tanggal: string;
  timestamp: string;
  gps?: GpsLocation;
  lokasi: string;
  pekerjaan: string;
  tinggi: number;
  koordinat: string;
  y: number; // Mapping: Longitude (as per user snippet)
  x: number; // Mapping: Latitude (as per user snippet)
  tanaman: string;
  tahunTanam: number;
  pengawas: string;
  vendor: string;
  tim: string;
  kesehatan: PlantHealthLabel;
  gpsQualityAtCapture?: 'Tinggi' | 'Sedang' | 'Rendah' | 'Tidak Tersedia';
  gpsAccuracyAtCapture?: number;
  rawKoordinat?: string;
  revisedKoordinat?: string;
  gridAnchorKoordinat?: string;
  distanceFromAnchorM?: number;
  snappedToGrid?: boolean;
  thumbnail?: string;
  foto: string; // base64
  uploaded?: boolean;
  retryCount?: number;
  lastSyncAttemptAt?: string;
  lastSyncError?: string;
  noPohon: number;
  description?: string;
  linkDrive?: string;
  statusDuplikat?: string;
  statusVerifikasi?: string;
  aiKesehatan?: PlantHealthLabel;
  aiConfidence?: number;
  aiDeskripsi?: string;
  hcvInput?: number;
  hcvDescription?: string;
}

export interface FormState {
  tinggi: number;
  tahunTanam: number;
  jenis: string;
  pekerjaan: string;
  pengawas: string;
  vendor: string;
  tim: string;
  kesehatan: PlantHealthLabel;
  spacingX: number;
  spacingY: number;
}

export interface MapViewProps {
  entries: PlantEntry[];
  onBack: () => void;
  pendingCount: number;
  totalEntriesCount: number;
}

export interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}
