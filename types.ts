
export interface GpsLocation {
  lat: number;
  lon: number;
  accuracy: number;
}

export interface PlantEntry {
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
  gridAnchorKoordinat?: string;
  distanceFromAnchorM?: number;
  snappedToGrid?: boolean;
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
