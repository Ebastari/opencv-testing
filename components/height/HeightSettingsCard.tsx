import { useState, useEffect, FC } from 'react';
import HeightAiDetection from './HeightAiDetection';
import HeightSliderControl from './HeightSliderControl';
import HeightPixelScale from './HeightPixelScale';

export type HeightMode = 'ai' | 'slider' | 'pixel-scale';

interface HeightSettingsCardProps {
  // Current height value
  heightValue: number;
  onHeightChange: (value: number) => void;
  
  // Mode selection
  mode: HeightMode;
  onModeChange: (mode: HeightMode) => void;
  
  // AI specific
  aiValue?: number | null;
  aiConfidence?: number;
  aiIsActive?: boolean;
  onAiToggle?: () => void;
  aiCalibrationProgress?: number;
  hasAiCalibration?: boolean;
  
  // Pixel scale specific
  pixelScaleValue?: number | null;
  pixelScaleIsActive?: boolean;
  onPixelScaleStart?: () => void;
  onPixelScaleStop?: () => void;
  showPixelOverlay?: boolean;
  onTogglePixelOverlay?: (show: boolean) => void;
  
  // Callback for mode-specific actions
  onApplyAiValue?: () => void;
}

// Key for storing height mode preference
const HEIGHT_MODE_KEY = 'camera-montana-height-mode-v1';

const HeightSettingsCard: FC<HeightSettingsCardProps> = ({
  heightValue,
  onHeightChange,
  mode,
  onModeChange,
  aiValue,
  aiConfidence,
  aiIsActive,
  onAiToggle,
  aiCalibrationProgress = 0,
  hasAiCalibration = false,
  pixelScaleValue,
  pixelScaleIsActive,
  onPixelScaleStart,
  onPixelScaleStop,
  showPixelOverlay = true,
  onTogglePixelOverlay,
  onApplyAiValue
}) => {
  const [expandedSection, setExpandedSection] = useState<HeightMode | null>(mode);

  // Auto-expand the selected mode section
  useEffect(() => {
    setExpandedSection(mode);
  }, [mode]);

  // Save mode preference to localStorage
  const handleModeChange = (newMode: HeightMode) => {
    onModeChange(newMode);
    try {
      window.localStorage.setItem(HEIGHT_MODE_KEY, newMode);
    } catch (e) {
      console.warn('Failed to save height mode:', e);
    }
  };

  // Get mode icon
  const getModeIcon = (m: HeightMode) => {
    switch (m) {
      case 'ai': return '🤖';
      case 'slider': return '🎚️';
      case 'pixel-scale': return '📏';
    }
  };

  // Get mode label
  const getModeLabel = (m: HeightMode) => {
    switch (m) {
      case 'ai': return 'AI Detection';
      case 'slider': return 'Slider';
      case 'pixel-scale': return 'Pixel Scale';
    }
  };

  // Get mode description
  const getModeDescription = (m: HeightMode) => {
    switch (m) {
      case 'ai': return 'Deteksi otomatis tinggi tanaman menggunakan AI';
      case 'slider': return 'Atur tinggi secara manual dengan slider';
      case 'pixel-scale': return 'Ukur tinggi dengan mengetuk titik pada gambar';
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-100">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
          Pengaturan Tinggi Tanaman
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Pilih metode pengukuran tinggi yang ingin digunakan
        </p>
      </div>

      {/* Mode Selection Tabs */}
      <div className="p-4 bg-slate-50">
        <div className="flex gap-2">
          {(['ai', 'slider', 'pixel-scale'] as HeightMode[]).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className={`flex-1 py-3 px-2 rounded-xl border text-xs font-bold transition-all ${
                mode === m
                  ? m === 'ai'
                    ? 'bg-cyan-500/20 border-cyan-300/35 text-cyan-900'
                    : m === 'slider'
                    ? 'bg-emerald-500/20 border-emerald-300/35 text-emerald-900'
                    : 'bg-orange-500/20 border-orange-300/35 text-orange-900'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="block text-lg mb-1">{getModeIcon(m)}</span>
              {getModeLabel(m)}
            </button>
          ))}
        </div>
      </div>

      {/* Current Height Display - Always Visible */}
      <div className="px-5 py-4 bg-gradient-to-r from-blue-50 to-emerald-50 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Tinggi Saat Ini
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-800">{heightValue}</span>
            <span className="text-sm text-slate-500">cm</span>
            <span className="text-sm text-slate-400">({(heightValue / 100).toFixed(2)} m)</span>
          </div>
        </div>
      </div>

      {/* Mode-Specific Controls */}
      <div className="p-5">
        {/* AI Detection Section */}
        <div className={`transition-all ${mode !== 'ai' ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🤖</span>
            <span className="font-bold text-xs text-slate-700">AI Detection</span>
          </div>
          <HeightAiDetection
            value={aiValue ?? null}
            onChange={onHeightChange}
            confidence={aiConfidence}
            isActive={aiIsActive}
            onToggle={mode === 'ai' ? onAiToggle : undefined}
            calibrationProgress={aiCalibrationProgress}
            hasCalibration={hasAiCalibration}
          />
        </div>

        {/* Divider */}
        <div className="my-4 h-px bg-slate-100" />

        {/* Slider Control Section */}
        <div className={`transition-all ${mode !== 'slider' ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🎚️</span>
            <span className="font-bold text-xs text-slate-700">Slider Control</span>
          </div>
          <HeightSliderControl
            value={heightValue}
            onChange={onHeightChange}
            min={30}
            max={500}
            showLabels={true}
            compact={false}
          />
        </div>

        {/* Divider */}
        <div className="my-4 h-px bg-slate-100" />

        {/* Pixel Scale Section */}
        <div className={`transition-all ${mode !== 'pixel-scale' ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📏</span>
            <span className="font-bold text-xs text-slate-700">Pixel Scale</span>
          </div>
          <HeightPixelScale
            value={pixelScaleValue ?? null}
            onChange={onHeightChange}
            isActive={pixelScaleIsActive}
            onStartMeasure={mode === 'pixel-scale' ? onPixelScaleStart : undefined}
            onStopMeasure={mode === 'pixel-scale' ? onPixelScaleStop : undefined}
            showOverlay={showPixelOverlay}
            onToggleOverlay={mode === 'pixel-scale' ? onTogglePixelOverlay : undefined}
          />
        </div>
      </div>

      {/* Footer - Mode indicator */}
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Metode aktif: <span className="font-bold">{getModeLabel(mode)}</span>
          </span>
          <span className="text-xs text-slate-400">
            {getModeDescription(mode)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default HeightSettingsCard;
