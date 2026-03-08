
import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { getCameraDevices, startCamera } from '../services/cameraService';
import { GpsLocation, FormState } from '../types';
import { Compass } from './Compass';
import { analyzePlantHealthHSV, type PlantHealthResult } from '../ecology/plantHealth';

interface CameraViewProps {
  onCapture: (dataUrl: string, aiHealth?: PlantHealthResult | null, thumbnailDataUrl?: string) => void;
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

const SHUTTER_SOUND_BASE64 = "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU92T18AZm9vYmFyYmF6cXV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4enV4";

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const shutterSoundRef = useRef<HTMLAudioElement>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | undefined>(undefined);
  const [cameraLoading, setCameraLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [needsUserAction, setNeedsUserAction] = useState(false);
  const [livePlantHealth, setLivePlantHealth] = useState<PlantHealthResult | null>(null);
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
  }, []);

  const initializeCamera = useCallback(async (deviceId?: string) => {
    setCameraLoading(true);
    setCameraError(null);
    setNeedsUserAction(false);
    stopCurrentStream();
    
    try {
      const stream = await startCamera(deviceId);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
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
          setCurrentDeviceId(currentTrack.getSettings().deviceId);
        }
      }
    } catch (err: any) {
      console.error("Camera init error:", err);
      setCameraError(err.name === 'NotAllowedError' ? 'Izin kamera ditolak' : 'Gagal memuat kamera');
      setCameraLoading(false);
      showToast('Gagal mengakses kamera.', 'error');
    }
  }, [stopCurrentStream, showToast]);

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
    onCapture(canvas.toDataURL('image/jpeg', 0.85), livePlantHealth, thumbnailDataUrl);
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
  }, [cameraLoading, cameraError, needsUserAction, currentDeviceId]);

  return (
    <div className="relative w-screen h-[100dvh] min-h-[100dvh] bg-black overflow-hidden flex items-center justify-center">
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${cameraLoading ? 'opacity-0' : 'opacity-100'}`} 
      />
      
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
              <span className="text-[8px] font-black text-white/60 uppercase tracking-widest">Progress</span>
              <span className="text-[10px] font-bold text-white">{entriesCount}/{DAILY_TARGET}</span>
            </div>
            <div className="w-full h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
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
          </div>
        </div>
      </div>

      {/* InfoOverlay removed — info already shown in top-right panel and bottom controls */}
      
      <div className="absolute bottom-0 left-0 right-0 z-40 safe-bottom">
        <div className="mx-3 sm:mx-4 mb-3 sm:mb-6 space-y-3 sm:space-y-4">
          
          <div className="bg-black/35 backdrop-blur-2xl rounded-[2rem] sm:rounded-[2.5rem] border border-white/10 p-4 sm:p-5 flex flex-col gap-3 sm:gap-4 shadow-2xl">
            <div className="flex justify-between items-center px-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">Pengaturan Tinggi</span>
              </div>
              <span className="text-xs sm:text-sm font-black text-white bg-blue-600 px-3 sm:px-4 py-1.5 rounded-2xl shadow-[0_0_15px_rgba(37,99,235,0.4)] border border-blue-400/30">
                {formState.tinggi} cm
              </span>
            </div>
            
            <div className="relative px-2 py-4">
              <input 
                type="range" min="5" max="1500" value={formState.tinggi} 
                onChange={e => onFormStateChange(prev => ({ ...prev, tinggi: parseInt(e.target.value) }))}
                className="w-full h-3.5 sm:h-4 bg-blue-600/30 rounded-full appearance-none cursor-pointer outline-none
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-8 [&::-webkit-slider-thumb]:h-8 sm:[&::-webkit-slider-thumb]:w-10 sm:[&::-webkit-slider-thumb]:h-10 
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white 
                  [&::-webkit-slider-thumb]:shadow-[0_0_25px_rgba(255,255,255,0.9),0_0_10px_rgba(0,0,0,0.2)] 
                  [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-blue-500
                  [&::-moz-range-thumb]:w-8 [&::-moz-range-thumb]:h-8 sm:[&::-moz-range-thumb]:w-10 sm:[&::-moz-range-thumb]:h-10 [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-blue-500
                  [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white" 
              />
            </div>

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
                onClick={handleCaptureClick} 
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

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.5)_100%)]" />
    </div>
  );
};
