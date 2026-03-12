import React, { useState, useEffect } from 'react';

interface HeightAiDetectionProps {
  value: number | null;
  onChange: (value: number) => void;
  confidence?: number;
  isActive?: boolean;
  onToggle?: () => void;
  calibrationProgress?: number; // 0-10 samples
  hasCalibration?: boolean;
}

// Komponen deteksi tinggi berbasis AI
// Menampilkan hasil deteksi AI dan kontrol kalibrasi
const HeightAiDetection: React.FC<HeightAiDetectionProps> = ({ 
  value, 
  onChange, 
  confidence,
  isActive,
  onToggle,
  calibrationProgress = 0,
  hasCalibration = false
}) => {
  const [showDetails, setShowDetails] = useState(false);
  
  // Determine status based on confidence
  const getStatusColor = () => {
    if (!value) return 'text-slate-400';
    if (confidence === undefined) return 'text-blue-600';
    if (confidence >= 70) return 'text-emerald-600';
    if (confidence >= 40) return 'text-amber-600';
    return 'text-red-600';
  };
  
  const getStatusLabel = () => {
    if (!value) return 'Menunggu deteksi...';
    if (confidence === undefined) return 'Tersedia';
    if (confidence >= 70) return 'Tinggi keyakinan';
    if (confidence >= 40) return 'Keyakinan sedang';
    return 'Keyakinan rendah';
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="font-bold text-xs text-slate-700">Deteksi Tinggi (AI)</div>
        {isActive && (
          <span className="flex items-center gap-1 text-xs font-bold text-emerald-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            AI Aktif
          </span>
        )}
      </div>
      
      {/* Main value display */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black ${getStatusColor()}`}>
              {value ? `${value} cm` : '--'}
            </span>
            {value && (
              <span className="text-sm text-slate-400">({(value / 100).toFixed(2)} m)</span>
            )}
          </div>
          
          {/* Confidence & Status */}
          <div className="flex items-center gap-2 mt-1">
            {confidence !== undefined && (
              <span className="text-xs text-slate-500">
                Keyakinan: {Math.round(confidence)}%
              </span>
            )}
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500">{getStatusLabel()}</span>
          </div>
        </div>
        
        {/* Toggle button */}
        {onToggle && (
          <button
            onClick={onToggle}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              isActive
                ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            {isActive ? 'Matikan AI' : 'Aktifkan AI'}
          </button>
        )}
      </div>
      
      {/* Calibration progress */}
      {isActive && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Progress Kalibrasi</span>
            <span className="text-slate-600 font-bold">{Math.min(10, calibrationProgress)}/10 sampel</span>
          </div>
          
          {/* Progress bar */}
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ${
                hasCalibration ? 'bg-emerald-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${(Math.min(10, calibrationProgress) / 10) * 100}%` }}
            />
          </div>
          
          {!hasCalibration && calibrationProgress < 10 && (
            <p className="text-xs text-amber-600">
              ⚠️ Kalibrasi belum selesai. Ambil minimal 10 sampel untuk mengaktifkan deteksi AI.
            </p>
          )}
          
          {hasCalibration && (
            <p className="text-xs text-emerald-600">
              ✓ Kalibrasi aktif. AI siap mendeteksi tinggi tanaman.
            </p>
          )}
        </div>
      )}
      
      {/* Details toggle */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="text-xs text-slate-500 hover:text-slate-700 font-medium"
      >
        {showDetails ? '▲ Sembunyikan detail' : '▼ Tampilkan detail'}
      </button>
      
      {/* Details panel */}
      {showDetails && (
        <div className="p-3 bg-slate-50 rounded-lg space-y-2 text-xs">
          <p className="text-slate-600">
            Deteksi tinggi AI menggunakan analisis citra untuk mengukur tinggi tanaman secara otomatis. 
            Untuk hasil optimal, lakukan kalibrasi dengan menginput tinggi manual setidaknya 10 kali.
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => onChange(value ?? 0)}
              disabled={value === null}
              className="px-3 py-1.5 rounded-lg bg-blue-500 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition"
            >
              Gunakan Hasil AI
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HeightAiDetection;
