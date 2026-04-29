import React, { useState, useEffect } from 'react';

interface HeightPixelScaleProps {
  value: number | null;
  onChange: (value: number) => void;
  onStartMeasure?: () => void;
  onStopMeasure?: () => void;
  isActive?: boolean;
  showOverlay?: boolean;
  onToggleOverlay?: (show: boolean) => void;
}

// Komponen pengukuran tinggi berbasis pixel scale
// Menggunakan arsitektur dari HTML asli dengan perbaikan untuk React
// Fitur: Reference line, dua titik pengukuran, GPS watermark, riwayat
const HeightPixelScale: React.FC<HeightPixelScaleProps> = ({ 
  value, 
  onChange, 
  onStartMeasure, 
  onStopMeasure,
  isActive,
  showOverlay = true,
  onToggleOverlay
}) => {
  const [stickHeight, setStickHeight] = useState(2); // Default 2 meters
  const [lineOffsetPercent, setLineOffsetPercent] = useState(15); // Default 15%
  const [showSettings, setShowSettings] = useState(false);
  const [history, setHistory] = useState<Array<{height: number, date: string, location: string}>>([]);
  
  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pixel-scale-history');
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch {}
  }, []);
  
  // Save history to localStorage
  const saveToHistory = (heightCm: number, location: string) => {
    const newEntry = {
      height: heightCm,
      date: new Date().toISOString(),
      location: location || 'Lokasi tidak tersedia'
    };
    const newHistory = [newEntry, ...history].slice(0, 50); // Keep last 50
    setHistory(newHistory);
    try {
      localStorage.setItem('pixel-scale-history', JSON.stringify(newHistory));
    } catch {}
  };
  
  const handleToggle = () => {
    if (isActive && onStopMeasure) {
      onStopMeasure();
    } else if (!isActive && onStartMeasure) {
      onStartMeasure();
    }
  };
  
  const handleStickHeightChange = (newHeight: number) => {
    setStickHeight(newHeight);
    // Simpan ke localStorage untuk sinkronisasi dengan CameraView
    try {
      localStorage.setItem('pixel-scale-stick-height', newHeight.toString());
    } catch {}
  };
  
  const handleLineOffsetChange = (newOffset: number) => {
    setLineOffsetPercent(newOffset);
    try {
      localStorage.setItem('pixel-scale-line-offset', newOffset.toString());
    } catch {}
  };
  
  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem('pixel-scale-history');
    } catch {}
  };
  
  // Format tanggal Indonesia
  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="font-bold text-xs text-slate-700">Ukur Tinggi (Pixel Scale)</div>
        {isActive && (
          <span className="text-xs font-bold text-orange-500 animate-pulse">● Mengukur</span>
        )}
      </div>
      
      {/* Main controls */}
      <div className="flex items-center gap-3">
        {/* Measurement value display */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-black text-blue-600">{value ? `${value} cm` : '--'}</span>
            {value && (
              <span className="text-xs text-slate-400">({(value / 100).toFixed(2)} m)</span>
            )}
          </div>
        </div>
        
        {/* Start/Stop button */}
        <button
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            isActive 
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' 
              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
          }`}
          onClick={handleToggle}
        >
          {isActive ? 'Berhenti' : 'Mulai Ukur'}
        </button>
      </div>
      
      {/* Guide text when active */}
      {isActive && (
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-xs text-blue-700 font-medium">
            📍 Ketuk titik dasar pohon (hijau), lalu ketuk titik ujungnya (merah) untuk mengukur tinggi
          </p>
        </div>
      )}
      
      {/* Overlay toggle - addresses obstruction issue */}
      {isActive && onToggleOverlay && (
        <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
          <button
            onClick={() => onToggleOverlay(false)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              !showOverlay 
                ? 'bg-slate-800 text-white' 
                : 'bg-slate-200 text-slate-600'
            }`}
          >
            Sembunyikan Garis
          </button>
          <button
            onClick={() => onToggleOverlay(true)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              showOverlay 
                ? 'bg-blue-500 text-white' 
                : 'bg-slate-200 text-slate-600'
            }`}
          >
            Tampilkan Garis
          </button>
        </div>
      )}
      
      {/* Settings section */}
      <div className="space-y-2">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center justify-between w-full p-2 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
        >
          <span className="text-xs font-bold text-slate-600">⚙ Pengaturan</span>
          <span className={`text-xs text-slate-400 transition-transform ${showSettings ? 'rotate-180' : ''}`}>▼</span>
        </button>
        
        {showSettings && (
          <div className="p-3 bg-slate-50 rounded-lg space-y-4">
            {/* Stick height configuration */}
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-2">
                Tinggi Tongkat (meter):
              </label>
              <div className="flex gap-1">
                {[1, 1.5, 2, 2.5, 3].map(h => (
                  <button
                    key={h}
                    onClick={() => handleStickHeightChange(h)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      stickHeight === h
                        ? 'bg-orange-500 text-white'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {h}m
                  </button>
                ))}
              </div>
            </div>
            
            {/* Line offset configuration - controls reference line position */}
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-2">
                Posisi Garis Referensi: {lineOffsetPercent}%
              </label>
              <input
                type="range"
                min="5"
                max="35"
                value={lineOffsetPercent}
                onChange={(e) => handleLineOffsetChange(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500
                  [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>5% (dekat)</span>
                <span>35% (jauh)</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Geser garis merah agar sejajar dengan ujung tongkat ukur
              </p>
            </div>
            
            {/* Custom marker colors */}
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-2">
                Warna Marker:
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    localStorage.setItem('pixel-scale-marker-base', '#00FF00');
                    localStorage.setItem('pixel-scale-marker-tip', '#FF0000');
                  }}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 hover:bg-slate-100"
                >
                  🌿 Hijau/Merah
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem('pixel-scale-marker-base', '#00FFFF');
                    localStorage.setItem('pixel-scale-marker-tip', '#FF00FF');
                  }}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 hover:bg-slate-100"
                >
                  🔵 Biru/Ungu
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem('pixel-scale-marker-base', '#FFFF00');
                    localStorage.setItem('pixel-scale-marker-tip', '#FF8000');
                  }}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 hover:bg-slate-100"
                >
                  🟡 Kuning/Oranye
                </button>
              </div>
            </div>
            
            {/* Info display */}
            <div className="p-2 bg-white rounded-lg border border-slate-200">
              <div className="text-[10px] text-slate-500">
                <div className="flex justify-between">
                  <span>Tinggi Tongkat:</span>
                  <span className="font-bold">{stickHeight} m</span>
                </div>
                <div className="flex justify-between">
                  <span>Garis Referensi:</span>
                  <span className="font-bold">±{lineOffsetPercent}%</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* History section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-600">📋 Riwayat Pengukuran</span>
          {history.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-[10px] text-red-500 hover:text-red-700"
            >
              Hapus Semua
            </button>
          )}
        </div>
        
        <div className="max-h-32 overflow-y-auto space-y-1">
          {history.length === 0 ? (
            <p className="text-[10px] text-slate-400 italic p-2">Belum ada riwayat pengukuran</p>
          ) : (
            history.slice(0, 5).map((item, index) => (
              <div key={index} className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-emerald-600">{(item.height / 100).toFixed(2)} m</span>
                  <span className="text-[10px] text-slate-400">{formatDate(item.date)}</span>
                </div>
                <div className="text-[10px] text-slate-500 truncate">{item.location}</div>
              </div>
            ))
          )}
        </div>
        
        {history.length > 5 && (
          <p className="text-[10px] text-slate-400 text-center">+{history.length - 5} pengukuran lainnya</p>
        )}
      </div>
    </div>
  );
};

export default HeightPixelScale;
