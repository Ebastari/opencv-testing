
export interface GpsLocation {
  lat: number;
  lon: number;
  accuracy: number;
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
  kesehatan: 'Sehat' | 'Merana' | 'Mati';
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
  aiKesehatan?: 'Sehat' | 'Merana' | 'Mati';
  aiConfidence?: number;
  aiDeskripsi?: string;
  hcvInput?: number;
}

export interface FormState {
  tinggi: number;
  tahunTanam: number;
  jenis: string;
  pekerjaan: string;
  pengawas: string;
  vendor: string;
  tim: string;
  kesehatan: 'Sehat' | 'Merana' | 'Mati';
  spacingX: number;
  spacingY: number;
}

export interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}
