
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CameraView } from './components/CameraView';
import { BottomSheet } from './components/BottomSheet';
import { useLocalStorage } from './hooks/useLocalStorage';
import { writeExifData } from './services/exifService';
import { uploadToAppsScript } from './services/uploadService';
import { watchGpsLocation } from './services/gpsService';
import { PlantEntry, GpsLocation, ToastState, FormState } from './types';
import { Toast } from './components/Toast';
import { getAllEntries, saveEntry, updateEntrySyncMeta, clearAllEntries } from './services/dbService';
import { checkInternetConnection } from './services/networkService';
import { generateHealthDescription, type PlantHealthResult } from './ecology/plantHealth';

const RETRY_BASE_DELAY_MS = 15000;
const RETRY_MAX_DELAY_MS = 5 * 60 * 1000;

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
const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwwxuFkJCGh0FLY3-RpCbrCzltrXH5eVUIuK0qScj5f9DnkgdZwRFfC0mz1xBQMhBTmfQ/exec';
const LEGACY_APPS_SCRIPT_URLS = [
  'https://script.google.com/macros/s/AKfycbyOLIVrNrxyFIJHklKTUFEX-ckqPaORCo9ga6n7d_FGct5v01o5ZqD44bWj138zcTq49Q/exec',
  'https://script.google.com/macros/s/AKfycbzLvcetpQNfIl0NF_L5sfUxUq7vgcVDfCcfHfqif7SJZtSwYZ3jfwjbBX89EcjV5rg8kw/exec',
  'https://script.google.com/macros/s/AKfycbxcxJ2nTJpVqECVPkDhNo5ulpsL0G2KSdiwoOqpJeIBASVq_K3mFGpviIXDhPzcdre3sw/exec',
  'https://script.google.com/macros/s/AKfycbwv1eXbUMODTxqoUrxuN2ezFb0E6E34hdJvmLHclmIC5v76yrnT5PvUuthYQahcaskwjA/exec',
  'https://script.google.com/macros/s/AKfycbw_B-b96eu94j562hLAYKTMLLe9XhTMDS5JhL_GoPzb5OGpDrQ2JHfaiPgXW4lUbMwV_Q/exec',
  'https://script.google.com/macros/s/AKfycbxPDvlK5Xk2WgcEsbqZtUH-k69_Xj3oXU8ciOJP8Y3e0twb4O-T1rNwLWUUTsTt2tmu9A/exec',
];

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
  const [isBottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const syncInProgressRef = useRef(false);

  const [formState, setFormState] = useLocalStorage<FormState>('formState', {
    tinggi: 10,
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
  const [gridAnchor, setGridAnchor] = useLocalStorage<GridAnchor | null>('gridAnchor', null);

  const [gps, setGps] = useState<GpsLocation | null>(null);
  const [appsScriptUrl, setAppsScriptUrl] = useLocalStorage<string>(
    'appsScriptUrl',
    DEFAULT_APPS_SCRIPT_URL,
  );

  useEffect(() => {
    const current = String(appsScriptUrl || '').trim();
    if (!current || LEGACY_APPS_SCRIPT_URLS.includes(current) || current.includes('/s/.../exec')) {
      setAppsScriptUrl(DEFAULT_APPS_SCRIPT_URL);
    }
  }, [appsScriptUrl, setAppsScriptUrl]);

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

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await getAllEntries();
        setEntries(data);
      } catch (err) {
        console.error("Gagal memuat database:", err);
      }
    };
    loadData();
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info', duration: number = 3000) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), duration);
  }, []);

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

  const syncPendingEntries = useCallback(async (options?: { background?: boolean }) => {
    const isBackground = options?.background ?? false;

    if (syncInProgressRef.current) {
      return;
    }

    const nowMs = Date.now();
    const pending = entries.filter((entry) => {
      if (entry.uploaded) {
        return false;
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
        showToast('Belum ada data siap retry. Tunggu jeda retry selesai.', 'info');
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

      if (successCount > 0 || unconfirmedCount > 0) {
        const updatedData = await getAllEntries();
        setEntries(updatedData);
        setLastSyncAt(new Date().toISOString());
        if (unconfirmedCount > 0) {
          const prefix = successCount > 0 ? `${successCount} data terverifikasi.` : 'Belum ada data terverifikasi.';
          showToast(`${prefix} ${unconfirmedCount} data masih pending verifikasi.`, 'info');
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
  }, [entries, appsScriptUrl, showToast, isOnline]);

  useEffect(() => {
    if (!isOnline) {
      return;
    }
    void syncPendingEntries({ background: true });
  }, [isOnline, syncPendingEntries]);

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
      if (document.visibilityState === 'visible' && isOnline) {
        void syncPendingEntries({ background: true });
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isOnline, syncPendingEntries]);

  const handleCapture = useCallback(async (dataUrl: string, aiHealth?: PlantHealthResult | null) => {
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
      noPohon: entries.length + 1,
      uploaded: false,
      retryCount: 0,
      statusDuplikat: "UNIK",
      aiKesehatan: aiHealth?.health,
      aiConfidence: Number.isFinite(aiConfidence) ? aiConfidence : undefined,
      aiDeskripsi: aiHealth ? generateHealthDescription(aiHealth) : undefined,
      hcvInput,
    };

    try {
      showToast('Memproses Geotag...', 'info', 1000);
      
      // Injeksi data EXIF ke biner gambar
      const photoWithExif = await writeExifData(dataUrl, newEntryMeta);
      
      const finalEntry: PlantEntry = { ...newEntryMeta, foto: photoWithExif };
      
      await saveEntry(finalEntry);
      setEntries(prev => [...prev, finalEntry]);

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

      if (appsScriptUrl && isOnline) {
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
            setLastSyncAt(new Date().toISOString());
            showToast('Berhasil Tersinkron!', 'success');
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
      } else {
        showToast('Tersimpan dengan Geotag.', 'success');
      }
    } catch (error) {
      console.error(error);
      showToast('Gagal memproses gambar.', 'error');
    }
  }, [formState, gps, gridAnchor, entries.length, appsScriptUrl, showToast, isOnline]);

  const handleClearData = async () => {
    if (window.confirm('Hapus semua data dari database lokal?')) {
      await clearAllEntries();
      setEntries([]);
      showToast('Database dibersihkan.', 'success');
    }
  };

  return (
    <div className="w-screen h-[100dvh] min-h-[100dvh] overflow-hidden bg-black text-slate-800">
      <CameraView 
        onCapture={handleCapture}
        formState={formState}
        onFormStateChange={setFormState}
        entriesCount={entries.length}
        pendingCount={entries.filter((entry) => !entry.uploaded).length}
        isSyncing={isSyncing}
        lastSyncAt={lastSyncAt}
        gps={gps}
        onGpsUpdate={setGps}
        onShowSheet={() => setBottomSheetOpen(true)}
        showToast={showToast}
        isOnline={isOnline}
        gridAnchor={gridAnchor}
        distanceFromAnchorM={distanceFromAnchorM}
        effectiveCoordinate={liveCoordinate}
        onSetGridAnchor={handleSetGridAnchor}
        onClearGridAnchor={handleClearGridAnchor}
      />
      <BottomSheet
        isOpen={isBottomSheetOpen}
        onClose={() => setBottomSheetOpen(false)}
        entries={entries}
        formState={formState}
        onFormStateChange={setFormState}
        onClearData={handleClearData}
        appsScriptUrl={appsScriptUrl}
        onAppsScriptUrlChange={setAppsScriptUrl}
        showToast={showToast}
        gps={gps}
        onGpsUpdate={setGps}
        onSyncPending={syncPendingEntries}
        isOnline={isOnline}
      />
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
};

export default App;
