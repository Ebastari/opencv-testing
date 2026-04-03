
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CameraView } from './components/CameraView';
import { BottomSheet } from './components/BottomSheet';
import { useLocalStorage } from './hooks/useLocalStorage';
import { writeExifData } from './services/exifService';
import { exportSpreadsheetBackup } from './services/exportService';
import { uploadToAppsScript } from './services/uploadService';
import { watchGpsLocation } from './services/gpsService';
import { PlantEntry, GpsLocation, ToastState, FormState, DEFAULT_PLANT_TYPES, type AutoBackupIntervalMinutes, type BottomSheetTabRequest, type BrowserStorageStatus, type HcvInsightSelection, type SyncMode, type ViewMode } from './types';
import { MapView } from './components/MapView';
import { Toast } from './components/Toast';
import {
  getAllEntries,
  getEntryStats,
  getPendingEntries,
  getRecentEntries,
  getRecentEntriesPreview,
  saveEntry,
  updateEntrySyncMeta,
  clearAllEntries,
} from './services/dbService';
import { checkInternetConnection } from './services/networkService';
import { generateHealthDescription, type PlantHealthResult } from './ecology/plantHealth.ts';

const RETRY_BASE_DELAY_MS = 5000;
const RETRY_MAX_DELAY_MS = 5 * 60 * 1000;
const FAST_SYNC_INTERVAL_MS = 3000;
const AUTO_BACKUP_CHECK_INTERVAL_MS = 60 * 1000;

const getRetryDelayMs = (retryCount: number): number => {
  const exponent = Math.max(0, retryCount - 1);
  return Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** exponent);
};

const isIOSFamilyDevice = (): boolean => {
  const ua = navigator.userAgent || '';
  const isClassicIOS = /iPhone|iPad|iPod/i.test(ua);
  const isIPadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isClassicIOS || isIPadDesktopMode;
};

const dataUrlToFile = async (dataUrl: string, fileName: string): Promise<File> => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
};

const GPS_ACCURACY_THRESHOLD_M = 20;
const DESKTOP_GPS_ACCURACY_THRESHOLD_M = 60;
const MAX_ACTIVE_ENTRIES = 60;
const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbym0oMDXPNNWn9lKcM7_uC97Dgsu9a8CgnxW849AOeg8wyio7BYU9FBy0gJEveovUaO8g/exec';
const STORAGE_WARNING_RATIO = 0.75;
const STORAGE_CRITICAL_RATIO = 0.9;
const LEGACY_APPS_SCRIPT_URLS = [
  'https://script.google.com/macros/s/AKfycbyZ7Jx8rPkjEcJk7wM_OnIacacu_1MmXisTmLdoyR0UmEqULszsCmgccVaGd3JvSkgsLw/exec',
  'https://script.google.com/macros/s/AKfycbwwxuFkJCGh0FLY3-RpCbrCzltrXH5eVUIuK0qScj5f9DnkgdZwRFfC0mz1xBQMhBTmfQ/exec',
  'https://script.google.com/macros/s/AKfycbyOLIVrNrxyFIJHklKTUFEX-ckqPaORCo9ga6n7d_FGct5v01o5ZqD44bWj138zcTq49Q/exec',
  'https://script.google.com/macros/s/AKfycbzLvcetpQNfIl0NF_L5sfUxUq7vgcVDfCcfHfqif7SJZtSwYZ3jfwjbBX89EcjV5rg8kw/exec',
  'https://script.google.com/macros/s/AKfycbxcxJ2nTJpVqECVPkDhNo5ulpsL0G2KSdiwoOqpJeIBASVq_K3mFGpviIXDhPzcdre3sw/exec',
  'https://script.google.com/macros/s/AKfycbwv1eXbUMODTxqoUrxuN2ezFb0E6E34hdJvmLHclmIC5v76yrnT5PvUuthYQahcaskwjA/exec',
  'https://script.google.com/macros/s/AKfycbw_B-b96eu94j562hLAYKTMLLe9XhTMDS5JhL_GoPzb5OGpDrQ2JHfaiPgXW4lUbMwV_Q/exec',
  'https://script.google.com/macros/s/AKfycbxPDvlK5Xk2WgcEsbqZtUH-k69_Xj3oXU8ciOJP8Y3e0twb4O-T1rNwLWUUTsTt2tmu9A/exec',
];

const normalizePlantType = (value: string): string => value.trim().replace(/\s+/g, ' ');

const mergePlantTypes = (...groups: Array<readonly string[] | string[] | undefined>): string[] => {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const group of groups) {
    if (!group) {
      continue;
    }

    for (const plantType of group) {
      const normalized = normalizePlantType(plantType);
      if (!normalized) {
        continue;
      }

      const key = normalized.toLocaleLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(normalized);
    }
  }

  return merged;
};

const samePlantTypes = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

interface GridAnchor {
  lat: number;
  lon: number;
  setAt: string;
}

const isFiniteCoord = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isValidLatLon = (lat: unknown, lon: unknown): boolean => {
  if (!isFiniteCoord(lat) || !isFiniteCoord(lon)) {
    return false;
  }
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
};

const isValidGpsLocation = (value: GpsLocation | null | undefined): value is GpsLocation => {
  if (!value) {
    return false;
  }
  return isValidLatLon(value.lat, value.lon) && isFiniteCoord(value.accuracy);
};

const isValidGridAnchor = (value: GridAnchor | null | undefined): value is GridAnchor => {
  if (!value) {
    return false;
  }
  return isValidLatLon(value.lat, value.lon);
};

const toRad = (value: number): number => (value * Math.PI) / 180;

const calculateDistanceMeters = (
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): number => {
  const earthRadius = 6371000;
  const dLat = toRad(toLat - fromLat);
  const dLon = toRad(toLon - fromLon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
};

const snapCoordinateToGrid = (
  currentLat: number,
  currentLon: number,
  anchor: GridAnchor,
  spacingX: number,
  spacingY: number,
) => {
  if (!isValidLatLon(currentLat, currentLon) || !isValidGridAnchor(anchor)) {
    return {
      lat: currentLat,
      lon: currentLon,
      stepX: 0,
      stepY: 0,
    };
  }

  const latScale = 111320;
  const lonScale = 111320 * Math.cos(toRad(anchor.lat));
  const safeLonScale = Math.max(1, Math.abs(lonScale));
  const sx = Number(spacingX);
  const sy = Number(spacingY);
  const safeSpacingX = Number.isFinite(sx) && sx > 0 ? sx : 4;
  const safeSpacingY = Number.isFinite(sy) && sy > 0 ? sy : 4;

  const deltaNorthM = (currentLat - anchor.lat) * latScale;
  const deltaEastM = (currentLon - anchor.lon) * safeLonScale;

  const stepY = Math.round(deltaNorthM / safeSpacingY);
  const stepX = Math.round(deltaEastM / safeSpacingX);

  const snappedNorthM = stepY * safeSpacingY;
  const snappedEastM = stepX * safeSpacingX;

  return {
    lat: anchor.lat + snappedNorthM / latScale,
    lon: anchor.lon + snappedEastM / safeLonScale,
    stepX,
    stepY,
  };
};

const isDesktopLikeDevice = (): boolean => {
  const ua = navigator.userAgent || '';
  const isMobile = /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
  return !isMobile;
};

const classifyGpsQualityAtCapture = (
  gps: GpsLocation | null,
): 'Tinggi' | 'Sedang' | 'Rendah' | 'Tidak Tersedia' => {
  if (!gps || !Number.isFinite(gps.accuracy)) {
    return 'Tidak Tersedia';
  }
  if (gps.accuracy < 5) {
    return 'Tinggi';
  }
  if (gps.accuracy <= 10) {
    return 'Sedang';
  }
  return 'Rendah';
};

const mapHealthToHcvWeight = (health: 'Sehat' | 'Merana' | 'Mati'): number => {
  if (health === 'Sehat') return 1;
  if (health === 'Merana') return 0.5;
  return 0;
};

const describeHcvCondition = (health: 'Sehat' | 'Merana' | 'Mati', hcvValue: number): string => {
  const roundedValue = Math.round(hcvValue * 100) / 100;

  if (health === 'Sehat') {
    return `Nilai HCV ${roundedValue} menunjukkan pohon berada pada kondisi baik dengan prioritas pemeliharaan rendah.`;
  }

  if (health === 'Merana') {
    return `Nilai HCV ${roundedValue} menunjukkan pohon perlu perhatian lanjutan karena terindikasi merana dan butuh monitoring berkala.`;
  }

  return `Nilai HCV ${roundedValue} menunjukkan pohon dalam kondisi kritis sehingga perlu evaluasi lapangan dan tindakan penggantian atau perawatan segera.`;
};

const toHcvInputFromAI = (aiHealth?: PlantHealthResult | null): number | undefined => {
  if (!aiHealth) {
    return undefined;
  }

  const confidence = Number(aiHealth.confidence);
  const safeConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 0;
  const hcv = mapHealthToHcvWeight(aiHealth.health) * safeConfidence;
  return Math.round(hcv * 100) / 100;
};

const App: React.FC = () => {
  const [entries, setEntries] = useState<PlantEntry[]>([]);
  const [gisEntries, setGisEntries] = useState<PlantEntry[]>([]);
  const [isBottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [bottomSheetTabRequest, setBottomSheetTabRequest] = useState<BottomSheetTabRequest | null>(null);
  const [hcvInsightSelection, setHcvInsightSelection] = useState<HcvInsightSelection | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [totalEntriesCount, setTotalEntriesCount] = useState(0);
  const [pendingEntriesCount, setPendingEntriesCount] = useState(0);
  const syncInProgressRef = useRef(false);
  const storageToastLevelRef = useRef<'warning' | 'critical' | null>(null);

  const [formState, setFormState] = useLocalStorage<FormState>('formState', {
    tinggi: 30,
    tahunTanam: new Date().getFullYear(),
    jenis: 'Sengon',
    pekerjaan: '',
    pengawas: '',
    vendor: '',
    tim: '',
    kesehatan: 'Sehat',
    spacingX: 4,
    spacingY: 4,
  });
  const [plantTypes, setPlantTypes] = useLocalStorage<string[]>('plantTypes', [...DEFAULT_PLANT_TYPES]);
  const [gridAnchor, setGridAnchor] = useLocalStorage<GridAnchor | null>('gridAnchor', null);
  const [syncMode, setSyncMode] = useLocalStorage<SyncMode>('syncMode', 'fast');
  const [autoBackupIntervalMinutes, setAutoBackupIntervalMinutes] = useLocalStorage<AutoBackupIntervalMinutes>('autoBackupIntervalMinutes', 0);
  const [lastSpreadsheetBackupAt, setLastSpreadsheetBackupAt] = useLocalStorage<string | null>('lastSpreadsheetBackupAt', null);
  const [lastSpreadsheetBackupReminderAt, setLastSpreadsheetBackupReminderAt] = useLocalStorage<string | null>('lastSpreadsheetBackupReminderAt', null);
  const [lastLocalMutationAt, setLastLocalMutationAt] = useLocalStorage<string | null>('lastLocalMutationAt', null);

  const [gps, setGps] = useState<GpsLocation | null>(null);
  const [appsScriptUrl, setAppsScriptUrl] = useLocalStorage<string>(
    'appsScriptUrl',
    DEFAULT_APPS_SCRIPT_URL,
  );
  const [storageStatus, setStorageStatus] = useState<BrowserStorageStatus | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('camera');
  const [isSpreadsheetBackupRunning, setIsSpreadsheetBackupRunning] = useState(false);
  const spreadsheetBackupInProgressRef = useRef(false);

  const toggleViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []); // Toggle between camera/gis

  const availablePlantTypes = useMemo(
    () => mergePlantTypes(DEFAULT_PLANT_TYPES, plantTypes),
    [plantTypes],
  );

  const handleShowHcvInsight = useCallback((result: PlantHealthResult, source: HcvInsightSelection['source']) => {
    setHcvInsightSelection({
      source,
      health: result.health,
      confidence: result.confidence,
      hue: result.hue,
      saturation: result.saturation,
      value: result.value,
    });
    setBottomSheetTabRequest({
      tabId: 'hcv',
      requestKey: `${source}-${Date.now()}`,
    });
    setBottomSheetOpen(true);
  }, []);

  useEffect(() => {
    if (isBottomSheetOpen) {
      return;
    }

    const mergedPlantTypes = mergePlantTypes(DEFAULT_PLANT_TYPES, plantTypes, [formState.jenis]);
    if (!samePlantTypes(plantTypes, mergedPlantTypes)) {
      setPlantTypes(mergedPlantTypes);
    }
  }, [formState.jenis, isBottomSheetOpen, plantTypes, setPlantTypes]);

  const registerPlantType = useCallback((value: string) => {
    const normalized = normalizePlantType(value);
    if (!normalized) {
      return;
    }

    setFormState((prev) => (prev.jenis === normalized ? prev : { ...prev, jenis: normalized }));
    setPlantTypes((prev) => {
      const mergedPlantTypes = mergePlantTypes(DEFAULT_PLANT_TYPES, prev, [normalized]);
      return samePlantTypes(prev, mergedPlantTypes) ? prev : mergedPlantTypes;
    });
  }, [setFormState, setPlantTypes]);

  useEffect(() => {
    const current = String(appsScriptUrl || '').trim();
    if (!current || LEGACY_APPS_SCRIPT_URLS.includes(current) || current.includes('/s/.../exec')) {
      setAppsScriptUrl(DEFAULT_APPS_SCRIPT_URL);
    }
  }, [appsScriptUrl, setAppsScriptUrl]);

  useEffect(() => {
    if (!('storage' in navigator) || typeof navigator.storage.persist !== 'function') {
      return;
    }

    void (async () => {
      try {
        const storageManager = navigator.storage as StorageManager & {
          persisted?: () => Promise<boolean>;
        };
        const persisted = typeof storageManager.persisted === 'function'
          ? await storageManager.persisted()
          : false;

        if (!persisted) {
          await navigator.storage.persist();
        }
      } catch {
        // Browser tertentu menolak tanpa gesture; cukup abaikan.
      }
    })();
  }, []);

  useEffect(() => {
    const sx = Number(formState.spacingX);
    const sy = Number(formState.spacingY);
    if (Number.isFinite(sx) && sx > 0 && Number.isFinite(sy) && sy > 0) {
      return;
    }

    setFormState((prev) => ({
      ...prev,
      spacingX: Number.isFinite(sx) && sx > 0 ? sx : 4,
      spacingY: Number.isFinite(sy) && sy > 0 ? sy : 4,
    }));
  }, [formState.spacingX, formState.spacingY, setFormState]);

  const refreshActiveEntries = useCallback(async () => {
    try {
      const [recentEntries, stats] = await Promise.all([
        getRecentEntriesPreview(MAX_ACTIVE_ENTRIES),
        getEntryStats(),
      ]);
      setEntries(recentEntries);
      setTotalEntriesCount(stats.total);
      setPendingEntriesCount(stats.pending);
    } catch (err) {
      console.error('Gagal memuat database:', err);
    }
  }, []);

  const refreshGisEntries = useCallback(async () => {
    try {
      const allEntries = await getAllEntries();
      const sortedEntries = [...allEntries].sort((left, right) => {
        const leftTime = new Date(left.timestamp).getTime();
        const rightTime = new Date(right.timestamp).getTime();
        return leftTime - rightTime;
      });
      setGisEntries(sortedEntries);
    } catch (err) {
      console.error('Gagal memuat data GIS:', err);
    }
  }, []);

  const refreshBrowserStorage = useCallback(async () => {
    if (!('storage' in navigator) || typeof navigator.storage?.estimate !== 'function') {
      setStorageStatus({
        usageBytes: 0,
        quotaBytes: 0,
        remainingBytes: 0,
        usageRatio: 0,
        level: 'unsupported',
      });
      return;
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usageBytes = estimate.usage ?? 0;
      const quotaBytes = estimate.quota ?? 0;
      const usageRatio = quotaBytes > 0 ? usageBytes / quotaBytes : 0;
      const remainingBytes = Math.max(0, quotaBytes - usageBytes);

      let level: BrowserStorageStatus['level'] = 'normal';
      if (usageRatio >= STORAGE_CRITICAL_RATIO) {
        level = 'critical';
      } else if (usageRatio >= STORAGE_WARNING_RATIO) {
        level = 'warning';
      }

      setStorageStatus({
        usageBytes,
        quotaBytes,
        remainingBytes,
        usageRatio,
        level,
      });
    } catch (error) {
      console.error('Gagal membaca kapasitas browser:', error);
      setStorageStatus(null);
    }
  }, []);

  useEffect(() => {
    void refreshActiveEntries();
  }, [refreshActiveEntries]);

  useEffect(() => {
    if (viewMode !== 'gis') {
      return;
    }
    void refreshGisEntries();
  }, [viewMode, totalEntriesCount, pendingEntriesCount, refreshGisEntries]);

  useEffect(() => {
    void refreshBrowserStorage();
  }, [refreshBrowserStorage, totalEntriesCount, pendingEntriesCount]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info', duration: number = 3000) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), duration);
  }, []);

  const noteLocalDataMutation = useCallback(() => {
    const now = new Date().toISOString();
    setLastLocalMutationAt(now);
    setLastSpreadsheetBackupReminderAt(null);
  }, [setLastLocalMutationAt, setLastSpreadsheetBackupReminderAt]);

  const runSpreadsheetBackup = useCallback(async (source: 'camera' | 'analytics' | 'settings' | 'scheduler') => {
    if (spreadsheetBackupInProgressRef.current) {
      if (source !== 'scheduler') {
        showToast('Backup spreadsheet sedang berjalan.', 'info');
      }
      return false;
    }

    spreadsheetBackupInProgressRef.current = true;
    setIsSpreadsheetBackupRunning(true);

    try {
      const allEntries = await getAllEntries();
      if (allEntries.length === 0) {
        if (source !== 'scheduler') {
          showToast('Belum ada data untuk dibackup.', 'info');
        }
        return false;
      }

      const result = await exportSpreadsheetBackup(allEntries, {
        preferShareSheet: isIOSFamilyDevice() && source !== 'scheduler',
      });

      setLastSpreadsheetBackupAt(new Date().toISOString());
      setLastSpreadsheetBackupReminderAt(null);

      if (source === 'scheduler') {
        showToast('Auto-backup spreadsheet berhasil dijalankan.', 'success', 1800);
        return true;
      }

      if (result.status === 'shared') {
        showToast('Backup spreadsheet dibuka lewat sheet Bagikan.', 'success', 2200);
        return true;
      }

      if (result.status === 'manual_required') {
        showToast('iPhone memerlukan langkah manual. Cek sheet Bagikan atau izin unduhan.', 'info', 3600);
        return true;
      }

      showToast('Backup spreadsheet berhasil diunduh.', 'success', 2200);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backup spreadsheet gagal.';
      console.error('Spreadsheet backup gagal:', error);
      showToast(message || 'Backup spreadsheet gagal.', 'error', 3200);
      return false;
    } finally {
      spreadsheetBackupInProgressRef.current = false;
      setIsSpreadsheetBackupRunning(false);
    }
  }, [setLastSpreadsheetBackupAt, setLastSpreadsheetBackupReminderAt, showToast]);

  const maybeRunScheduledBackup = useCallback(async () => {
    if (autoBackupIntervalMinutes === 0 || document.visibilityState !== 'visible') {
      return;
    }

    if (!lastLocalMutationAt) {
      return;
    }

    const lastMutationAtMs = new Date(lastLocalMutationAt).getTime();
    if (!Number.isFinite(lastMutationAtMs)) {
      return;
    }

    const lastBackupAtMs = lastSpreadsheetBackupAt ? new Date(lastSpreadsheetBackupAt).getTime() : 0;
    if (lastMutationAtMs <= lastBackupAtMs) {
      return;
    }

    const intervalMs = autoBackupIntervalMinutes * 60 * 1000;
    const nowMs = Date.now();
    if (lastBackupAtMs > 0 && nowMs - lastBackupAtMs < intervalMs) {
      return;
    }

    if (isIOSFamilyDevice()) {
      const reminderAtMs = lastSpreadsheetBackupReminderAt ? new Date(lastSpreadsheetBackupReminderAt).getTime() : 0;
      if (reminderAtMs > 0 && nowMs - reminderAtMs < intervalMs) {
        return;
      }

      setLastSpreadsheetBackupReminderAt(new Date().toISOString());
      showToast('iPhone memerlukan tap manual. Gunakan tombol Backup di panel kamera atau analitik.', 'info', 4200);
      return;
    }

    await runSpreadsheetBackup('scheduler');
  }, [
    autoBackupIntervalMinutes,
    lastLocalMutationAt,
    lastSpreadsheetBackupAt,
    lastSpreadsheetBackupReminderAt,
    runSpreadsheetBackup,
    setLastSpreadsheetBackupReminderAt,
    showToast,
  ]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshBrowserStorage();
        void maybeRunScheduledBackup();
      }
    };

    const interval = window.setInterval(() => {
      void refreshBrowserStorage();
      void maybeRunScheduledBackup();
    }, AUTO_BACKUP_CHECK_INTERVAL_MS);

    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [maybeRunScheduledBackup, refreshBrowserStorage]);

  useEffect(() => {
    if (!storageStatus || storageStatus.level === 'normal' || storageStatus.level === 'unsupported') {
      storageToastLevelRef.current = null;
      return;
    }

    if (isOnline) {
      return;
    }

    if (storageToastLevelRef.current === storageStatus.level) {
      return;
    }

    storageToastLevelRef.current = storageStatus.level;
    showToast(
      storageStatus.level === 'critical'
        ? 'Penyimpanan browser hampir penuh. Gunakan export ZIP atau pastikan download otomatis aktif.'
        : 'Penyimpanan browser mulai penuh. Disarankan backup lewat ZIP atau CSV dari menu panel.',
      storageStatus.level === 'critical' ? 'error' : 'info',
      5500,
    );
  }, [isOnline, showToast, storageStatus]);

  const updateOnlineState = useCallback((nextValue: boolean) => {
    setIsOnline((prev) => {
      if (prev !== nextValue) {
        showToast(nextValue ? 'Koneksi Terhubung' : 'Mode Offline Aktif', nextValue ? 'success' : 'info');
      }
      return nextValue;
    });
  }, [showToast]);

  const verifyConnectivity = useCallback(async () => {
    const reachable = await checkInternetConnection(appsScriptUrl);
    updateOnlineState(reachable);
  }, [appsScriptUrl, updateOnlineState]);

  useEffect(() => {
    const handleOnlineEvent = () => {
      void verifyConnectivity();
    };

    const handleOfflineEvent = () => {
      void verifyConnectivity();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void verifyConnectivity();
      }
    };

    void verifyConnectivity();
    const interval = window.setInterval(() => {
      void verifyConnectivity();
    }, 15000);

    window.addEventListener('online', handleOnlineEvent);
    window.addEventListener('offline', handleOfflineEvent);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', handleOnlineEvent);
      window.removeEventListener('offline', handleOfflineEvent);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [verifyConnectivity]);

  useEffect(() => {
    let watchId: number;
    try {
      watchId = watchGpsLocation(
        (location) => {
          if (isValidGpsLocation(location)) {
            setGps(location);
          }
        },
        (error) => console.error("GPS Error:", error)
      );
    } catch (e) {
      console.error("GPS Geolocation not available");
    }
    return () => {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    if (!gridAnchor) {
      return;
    }
    if (isValidGridAnchor(gridAnchor)) {
      return;
    }

    setGridAnchor(null);
    showToast('Titik awal grid tidak valid, otomatis direset.', 'info');
  }, [gridAnchor, setGridAnchor, showToast]);

  const syncPendingEntries = useCallback(async (options?: { background?: boolean; force?: boolean }) => {
    const isBackground = options?.background ?? false;
    const forceSync = options?.force ?? false;

    if (isBackground && syncMode !== 'fast') {
      return;
    }

    if (syncInProgressRef.current) {
      return;
    }

    const storedPending = await getPendingEntries();
    const nowMs = Date.now();
    const pending = storedPending.filter((entry) => {
      if (entry.uploaded) {
        return false;
      }

      if (forceSync) {
        return true;
      }

      if (!entry.lastSyncAttemptAt) {
        return true;
      }

      const retryCount = entry.retryCount || 0;
      const lastAttemptMs = new Date(entry.lastSyncAttemptAt).getTime();
      if (!Number.isFinite(lastAttemptMs)) {
        return true;
      }

      const waitMs = getRetryDelayMs(retryCount);
      return nowMs - lastAttemptMs >= waitMs;
    });

    if (pending.length === 0) {
      if (!isBackground) {
        showToast(
          forceSync ? 'Tidak ada data pending untuk sinkronisasi.' : 'Belum ada data siap retry. Tunggu jeda retry selesai.',
          'info',
        );
      }
      return;
    }

    if (!isOnline) {
      if (!isBackground) {
        showToast('Tidak ada internet untuk sinkronisasi', 'error');
      }
      return;
    }

    setIsSyncing(true);
    syncInProgressRef.current = true;

    if (!isBackground) {
      showToast(`Sinkronisasi ${pending.length} data...`, 'info');
    }
    
    let successCount = 0;
    let unconfirmedCount = 0;
    let failedCount = 0;
    let driveWarningCount = 0;
    let lastErrorMessage = '';
    try {
      for (const entry of pending) {
        const attemptAt = new Date().toISOString();
        await updateEntrySyncMeta(entry.id, {
          lastSyncAttemptAt: attemptAt,
        });

        try {
          const result = await uploadToAppsScript(appsScriptUrl, entry);
          if (!result.ok) {
            throw new Error(result.message);
          }

          if (result.confirmed) {
            await updateEntrySyncMeta(entry.id, {
              uploaded: true,
              retryCount: 0,
              lastSyncAttemptAt: attemptAt,
              lastSyncError: '',
            });
            successCount++;
            if (result.warning) {
              driveWarningCount += 1;
            }
          } else {
            const nextRetry = (entry.retryCount || 0) + 1;
            await updateEntrySyncMeta(entry.id, {
              uploaded: false,
              retryCount: nextRetry,
              lastSyncAttemptAt: attemptAt,
              lastSyncError: result.message || 'Belum terverifikasi oleh server (mode no-cors).',
            });
            unconfirmedCount += 1;
          }
        } catch (error) {
          const nextRetry = (entry.retryCount || 0) + 1;
          await updateEntrySyncMeta(entry.id, {
            uploaded: false,
            retryCount: nextRetry,
            lastSyncAttemptAt: attemptAt,
            lastSyncError: error instanceof Error ? error.message : 'Sinkronisasi gagal.',
          });
          failedCount += 1;
          lastErrorMessage = error instanceof Error ? error.message : 'Sinkronisasi gagal.';
          console.error(`Gagal upload entri ${entry.id}:`, error);
        }
      }

      await refreshActiveEntries();

      if (successCount > 0 || unconfirmedCount > 0) {
        setLastSyncAt(new Date().toISOString());
        if (unconfirmedCount > 0) {
          const prefix = successCount > 0 ? `${successCount} data terverifikasi.` : 'Belum ada data terverifikasi.';
          showToast(`${prefix} ${unconfirmedCount} data masih pending verifikasi.`, 'info');
        } else if (driveWarningCount > 0) {
          showToast(`${successCount} data tersimpan ke cloud. ${driveWarningCount} foto belum berhasil masuk Drive.`, 'info');
        } else {
          showToast(
            isBackground ? `Auto-sync berhasil untuk ${successCount} data.` : `${successCount} data berhasil diunggah`,
            'success',
          );
        }
      } else if (!isBackground) {
        showToast(lastErrorMessage || 'Gagal sinkronisasi data', 'error');
      }

      if (failedCount > 0 && successCount > 0 && !isBackground) {
        showToast(`${failedCount} data gagal sinkron. Cek URL Apps Script dan koneksi.`, 'error');
      }
    } finally {
      setIsSyncing(false);
      syncInProgressRef.current = false;
    }
  }, [appsScriptUrl, showToast, isOnline, refreshActiveEntries, syncMode]);

  useEffect(() => {
    if (!isOnline || syncMode !== 'fast') {
      return;
    }
    void syncPendingEntries({ background: true });
  }, [isOnline, syncMode, syncPendingEntries]);

  useEffect(() => {
    if (!isOnline || syncMode !== 'fast') {
      return;
    }

    const intervalId = window.setInterval(() => {
      void syncPendingEntries({ background: true });
    }, FAST_SYNC_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isOnline, syncMode, syncPendingEntries]);

  const liveCoordinate = useMemo(() => {
    if (!isValidGpsLocation(gps)) {
      return null;
    }
    if (!isValidGridAnchor(gridAnchor)) {
      return { lat: gps.lat, lon: gps.lon, snapped: false, stepX: 0, stepY: 0 };
    }
    const snapped = snapCoordinateToGrid(gps.lat, gps.lon, gridAnchor, formState.spacingX, formState.spacingY);
    return { lat: snapped.lat, lon: snapped.lon, snapped: true, stepX: snapped.stepX, stepY: snapped.stepY };
  }, [gps, gridAnchor, formState.spacingX, formState.spacingY]);

  const distanceFromAnchorM = useMemo(() => {
    if (!isValidGpsLocation(gps) || !isValidGridAnchor(gridAnchor)) {
      return null;
    }
    return calculateDistanceMeters(gridAnchor.lat, gridAnchor.lon, gps.lat, gps.lon);
  }, [gps, gridAnchor]);

  const handleSetGridAnchor = useCallback(() => {
    if (!isValidGpsLocation(gps)) {
      showToast('GPS belum tersedia. Tidak bisa set titik awal.', 'error');
      return;
    }
    setGridAnchor({ lat: gps.lat, lon: gps.lon, setAt: new Date().toISOString() });
    showToast('Titik awal grid diset dari posisi saat ini.', 'success');
  }, [gps, setGridAnchor, showToast]);

  const handleClearGridAnchor = useCallback(() => {
    setGridAnchor(null);
    showToast('Titik awal grid direset.', 'info');
  }, [setGridAnchor, showToast]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && isOnline && syncMode === 'fast') {
        void syncPendingEntries({ background: true });
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isOnline, syncMode, syncPendingEntries]);

  const handleCapture = useCallback(async (dataUrl: string, aiHealth?: PlantHealthResult | null, thumbnailDataUrl?: string, mode?: 'manual' | 'ai') => {
    const timestamp = new Date();
    const pad = (n: number, len: number = 2) => n.toString().padStart(len, '0');
    const id = `${timestamp.getFullYear()}${pad(timestamp.getMonth() + 1)}${pad(timestamp.getDate())}-${pad(timestamp.getHours())}${pad(timestamp.getMinutes())}${pad(timestamp.getSeconds())}${pad(timestamp.getMilliseconds(), 3)}`;

    if (!gps) {
      const continueWithoutGps = window.confirm(
        'GPS belum terkunci. Data akan tersimpan dengan koordinat 0,0. Lanjutkan?',
      );
      if (!continueWithoutGps) {
        showToast('Capture dibatalkan. Tunggu GPS terkunci.', 'info');
        return;
      }
    }

    const activeGpsThreshold = isDesktopLikeDevice()
      ? DESKTOP_GPS_ACCURACY_THRESHOLD_M
      : GPS_ACCURACY_THRESHOLD_M;

    if (gps && gps.accuracy > activeGpsThreshold) {
      const continueWithLowAccuracy = window.confirm(
        `Akurasi GPS saat ini ±${gps.accuracy.toFixed(1)}m (> ${activeGpsThreshold}m). Lanjutkan capture?`,
      );
      if (!continueWithLowAccuracy) {
        showToast('Capture dibatalkan. Tunggu akurasi GPS membaik.', 'info');
        return;
      }
    }

    const hasValidGps = isValidGpsLocation(gps);
    const rawLat = hasValidGps ? gps.lat : 0;
    const rawLon = hasValidGps ? gps.lon : 0;
    const anchorForCapture = hasValidGps && isValidGridAnchor(gridAnchor) ? gridAnchor : null;
    const snappedCoordinate = hasValidGps && anchorForCapture
      ? snapCoordinateToGrid(rawLat, rawLon, anchorForCapture, formState.spacingX, formState.spacingY)
      : null;
    const lat = snappedCoordinate ? snappedCoordinate.lat : rawLat;
    const lon = snappedCoordinate ? snappedCoordinate.lon : rawLon;
    const gpsQualityAtCapture = classifyGpsQualityAtCapture(hasValidGps ? gps : null);
    const distanceToAnchor = hasValidGps && anchorForCapture
      ? calculateDistanceMeters(anchorForCapture.lat, anchorForCapture.lon, rawLat, rawLon)
      : undefined;

    const kesehatanFinal = aiHealth?.health || formState.kesehatan;
    const aiConfidence = aiHealth ? Number(aiHealth.confidence) : undefined;
    // Fallback: jika AI tidak menganalisis (aiHealth null), hitung HCV dari kesehatan manual
    const hcvInput = toHcvInputFromAI(aiHealth)
      ?? (mapHealthToHcvWeight(kesehatanFinal as 'Sehat' | 'Merana' | 'Mati') * 50);
    const hcvDescription = describeHcvCondition(
      kesehatanFinal as 'Sehat' | 'Merana' | 'Mati',
      hcvInput,
    );

    // Deteksi mode: jika AI height mode aktif, mode = 'ai', jika tidak, 'manual'
    // (Jika ingin lebih spesifik, bisa tambahkan prop dari CameraView, di sini asumsikan AI height mode = false berarti manual)
    // Untuk sekarang, default ke 'manual' (bisa diubah jika CameraView mengirimkan info mode)


    const newEntryMeta: Omit<PlantEntry, 'foto'> = {
      id,
      tanggal: timestamp.toLocaleString('id-ID'),
      timestamp: timestamp.toISOString(),
      gps: hasValidGps ? gps : undefined,
      lokasi: `${lat.toFixed(6)},${lon.toFixed(6)}`,
      pekerjaan: formState.pekerjaan,
      tinggi: formState.tinggi,
      koordinat: `${lat.toFixed(6)},${lon.toFixed(6)}`,
      y: lon,
      x: lat,
      tanaman: formState.jenis,
      tahunTanam: formState.tahunTanam,
      pengawas: formState.pengawas,
      vendor: formState.vendor,
      tim: formState.tim,
      kesehatan: kesehatanFinal,
      gpsQualityAtCapture,
      gpsAccuracyAtCapture: hasValidGps ? gps.accuracy : undefined,
      rawKoordinat: `${rawLat.toFixed(6)},${rawLon.toFixed(6)}`,
      revisedKoordinat: snappedCoordinate ? `${lat.toFixed(6)},${lon.toFixed(6)}` : undefined,
      gridAnchorKoordinat: anchorForCapture
        ? `${anchorForCapture.lat.toFixed(6)},${anchorForCapture.lon.toFixed(6)}`
        : undefined,
      distanceFromAnchorM: distanceToAnchor,
      snappedToGrid: Boolean(snappedCoordinate),
      thumbnail: thumbnailDataUrl,
      noPohon: totalEntriesCount + 1,
      uploaded: false,
      retryCount: 0,
      statusDuplikat: "UNIK",
      aiKesehatan: aiHealth?.health,
      aiConfidence: Number.isFinite(aiConfidence) ? aiConfidence : undefined,
      aiDeskripsi: aiHealth ? generateHealthDescription(aiHealth) : undefined,
      hcvInput,
      hcvDescription,
      mode,
    };

    try {
      showToast('Memproses Geotag...', 'info', 1000);
      
      // Injeksi data EXIF ke biner gambar
      const photoWithExif = await writeExifData(dataUrl, newEntryMeta);
      
      const finalEntry: PlantEntry = { ...newEntryMeta, foto: photoWithExif };
      const previewEntry: PlantEntry = {
        ...finalEntry,
        foto: finalEntry.thumbnail || finalEntry.foto,
      };

      // Always save to browser storage first so offline mode stays reliable.
      await saveEntry(finalEntry);
      noteLocalDataMutation();

      const isOnlineNow = await checkInternetConnection();
      const shouldAttemptImmediateUpload = syncMode === 'fast' && isOnlineNow;

      setEntries((prev) => [previewEntry, ...prev].slice(0, MAX_ACTIVE_ENTRIES));
      setTotalEntriesCount((prev) => prev + 1);
      setPendingEntriesCount((prev) => prev + 1);

      if (!isOnlineNow) {
        showToast(
          syncMode === 'fast'
            ? 'Data disimpan offline. Mode Fast akan kirim otomatis saat koneksi kembali.'
            : 'Data disimpan offline. Mode Lite mengharuskan sync manual dari menu panel.',
          'info',
          3200,
        );
      } else if (syncMode === 'lite') {
        showToast('Mode Lite aktif. Data disimpan lokal, kirim manual dari menu Sync.', 'info', 3200);
      }

      const fileName = `TREE_${formState.jenis.toUpperCase()}_${id}.jpg`;

      // iPhone/iPad: buka sheet Bagikan/Simpan agar kompatibel dengan policy Safari iOS.
      if (isIOSFamilyDevice() && typeof navigator.share === 'function') {
        try {
          const imageFile = await dataUrlToFile(photoWithExif, fileName);
          const canShare =
            typeof navigator.canShare === 'function' && navigator.canShare({ files: [imageFile] });

          if (canShare) {
            await navigator.share({
              title: fileName,
              text: 'Foto hasil monitoring tanaman',
              files: [imageFile],
            });
            showToast('Sheet Bagikan/Simpan dibuka.', 'success', 1500);
          } else {
            const preview = window.open(photoWithExif, '_blank');
            if (!preview) {
              showToast('Popup diblokir. Silakan izinkan popup untuk menyimpan foto.', 'error');
            } else {
              showToast('Tap dan tahan gambar lalu pilih Simpan.', 'info', 3000);
            }
          }
        } catch (shareError) {
          // AbortError berarti user menutup sheet, bukan kegagalan sistem.
          if (shareError instanceof DOMException && shareError.name === 'AbortError') {
            showToast('Bagikan dibatalkan pengguna.', 'info', 1500);
          } else {
            const preview = window.open(photoWithExif, '_blank');
            if (!preview) {
              showToast('Gagal membuka bagikan/simpan foto.', 'error');
            } else {
              showToast('Tap dan tahan gambar lalu pilih Simpan.', 'info', 3000);
            }
          }
        }
      } else {
        // Android/Desktop: tetap auto-download.
        const downloadLink = document.createElement('a');
        downloadLink.href = photoWithExif;
        downloadLink.download = fileName;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      }

      if (appsScriptUrl && shouldAttemptImmediateUpload) {
        showToast('Mengirim ke Cloud...', 'info');
        try {
          const attemptAt = new Date().toISOString();
          await updateEntrySyncMeta(finalEntry.id, {
            lastSyncAttemptAt: attemptAt,
          });

          const result = await uploadToAppsScript(appsScriptUrl, finalEntry);
          if (!result.ok) {
            throw new Error(result.message);
          }

          if (result.confirmed) {
            await updateEntrySyncMeta(finalEntry.id, {
              uploaded: true,
              retryCount: 0,
              lastSyncAttemptAt: attemptAt,
              lastSyncError: '',
            });
            setEntries(prev => prev.map(e => e.id === finalEntry.id ? { ...e, uploaded: true, retryCount: 0, lastSyncError: '' } : e));
            setPendingEntriesCount((prev) => Math.max(0, prev - 1));
            setLastSyncAt(new Date().toISOString());
            showToast(result.warning || 'Berhasil Tersinkron!', result.warning ? 'info' : 'success');
          } else {
            await updateEntrySyncMeta(finalEntry.id, {
              uploaded: false,
              retryCount: 1,
              lastSyncAttemptAt: attemptAt,
              lastSyncError: result.message || 'Belum terverifikasi oleh server (mode no-cors).',
            });
            setEntries(prev => prev.map(e => e.id === finalEntry.id ? { ...e, uploaded: false, retryCount: 1, lastSyncError: result.message } : e));
            showToast('Data belum terverifikasi cloud. Tetap di antrian retry.', 'info');
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Gagal Sinkron, Tersimpan Lokal.';
          await updateEntrySyncMeta(finalEntry.id, {
            uploaded: false,
            retryCount: (finalEntry.retryCount || 0) + 1,
            lastSyncAttemptAt: new Date().toISOString(),
            lastSyncError: message,
          });
          console.error('Sinkronisasi capture gagal:', error);
          showToast(message || 'Gagal Sinkron, Tersimpan Lokal.', 'error');
        }

        void syncPendingEntries({ background: true, force: true });
      } else {
        showToast('Tersimpan dengan Geotag.', 'success');
      }
    } catch (error) {
      console.error(error);
      showToast('Gagal memproses gambar.', 'error');
    }
  }, [formState, gps, gridAnchor, totalEntriesCount, appsScriptUrl, noteLocalDataMutation, showToast, syncMode, syncPendingEntries]);

  const handleClearData = async () => {
    if (window.confirm('Hapus semua data dari database lokal?')) {
      await clearAllEntries();
      setEntries([]);
      setGisEntries([]);
      setTotalEntriesCount(0);
      setPendingEntriesCount(0);
      setLastLocalMutationAt(null);
      setLastSpreadsheetBackupReminderAt(null);
      showToast('Database dibersihkan.', 'success');
    }
  };

  // Hitung jumlah terkirim
  const sentEntriesCount = totalEntriesCount - pendingEntriesCount;

  return (
    <div className="w-screen h-[100dvh] min-h-[100dvh] overflow-hidden bg-black text-slate-800">
      {viewMode === 'camera' ? (
        <CameraView 
          onCapture={handleCapture}
          formState={formState}
          onFormStateChange={setFormState}
          plantTypes={availablePlantTypes}
          entriesCount={totalEntriesCount}
          pendingCount={pendingEntriesCount}
          isSyncing={isSyncing}
          lastSyncAt={lastSyncAt}
          gps={gps}
          onGpsUpdate={setGps}
          onShowSheet={() => setBottomSheetOpen(true)}
          onHealthBadgeClick={(result) => handleShowHcvInsight(result, 'camera-ai')}
          showToast={showToast}
          isOnline={isOnline}
          syncMode={syncMode}
          onSyncModeChange={setSyncMode}
          gridAnchor={gridAnchor}
          distanceFromAnchorM={distanceFromAnchorM}
          effectiveCoordinate={liveCoordinate}
          onSetGridAnchor={handleSetGridAnchor}
          onClearGridAnchor={handleClearGridAnchor}
          onBackupNow={() => { void runSpreadsheetBackup('camera'); }}
          isBackupRunning={isSpreadsheetBackupRunning}
          onToggleViewMode={toggleViewMode}
        />
      ) : (
        <MapView 
          entries={gisEntries}
          onBack={() => setViewMode('camera')}
          pendingCount={pendingEntriesCount}
          totalEntriesCount={totalEntriesCount}
        />
      )}
      <BottomSheet
        isOpen={isBottomSheetOpen}
        onClose={() => setBottomSheetOpen(false)}
        entries={entries}
        totalEntriesCount={totalEntriesCount}
        pendingEntriesCount={pendingEntriesCount}
        formState={formState}
        onFormStateChange={setFormState}
        plantTypes={availablePlantTypes}
        onRegisterPlantType={registerPlantType}
        onClearData={handleClearData}
        appsScriptUrl={appsScriptUrl}
        onAppsScriptUrlChange={setAppsScriptUrl}
        syncMode={syncMode}
        onSyncModeChange={setSyncMode}
        storageStatus={storageStatus}
        tabRequest={bottomSheetTabRequest}
        hcvInsightSelection={hcvInsightSelection}
        onSelectHealthInsight={(result) => handleShowHcvInsight(result, 'analytics-ai')}
        showToast={showToast}
        gps={gps}
        onGpsUpdate={setGps}
        onSyncPending={syncPendingEntries}
        isOnline={isOnline}
        onBackupNow={() => { void runSpreadsheetBackup('analytics'); }}
        isBackupRunning={isSpreadsheetBackupRunning}
        autoBackupIntervalMinutes={autoBackupIntervalMinutes}
        onAutoBackupIntervalChange={setAutoBackupIntervalMinutes}
      />
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
};

export default App;
