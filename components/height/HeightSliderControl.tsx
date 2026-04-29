import React from 'react';

interface HeightSliderControlProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  showLabels?: boolean;
  compact?: boolean;
}

// Komponen slider pengaturan tinggi manual - kontrol utama pengukuran tinggi
const HeightSliderControl: React.FC<HeightSliderControlProps> = ({ 
  value, 
  min = 30, 
  max = 500, 
  onChange,
  showLabels = true,
  compact = false 
}) => {
  const percentage = ((value - min) / (max - min)) * 100;
  
  // Calculate marker positions for visual reference
  const markers = [30, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
  
  return (
    <div className={`${compact ? 'space-y-1' : 'space-y-3'}`}>
      {showLabels && (
        <div className="flex items-center justify-between">
          <div className="font-bold text-xs text-slate-700">Tinggi Manual (Slider)</div>
          <span className="text-lg font-black text-blue-600">{value} cm</span>
        </div>
      )}
      
      <div className="relative">
        {/* Track background */}
        <div className="absolute top-1/2 left-0 right-0 h-2 bg-slate-200 rounded-full transform -translate-y-1/2" />
        
        {/* Active track */}
        <div 
          className="absolute top-1/2 left-0 h-2 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transform -translate-y-1/2 transition-all duration-150"
          style={{ width: `${percentage}%` }}
        />
        
        {/* Slider input */}
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="relative w-full h-8 bg-transparent appearance-none cursor-pointer outline-none
            [&::-webkit-slider-thumb]:appearance-none 
            [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(59,130,246,0.5),0_2px_4px_rgba(0,0,0,0.1)]
            [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-blue-500
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 
            [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white
            [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-blue-500
            [&::-moz-range-thumb]:cursor-pointer"
        />
        
        {/* Min/Max labels */}
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-slate-400 font-medium">{min}</span>
          <span className="text-[10px] text-slate-400 font-medium">{max}</span>
        </div>
        
        {/* Quick value markers */}
        {!compact && (
          <div className="flex justify-between mt-1 px-1">
            {markers.filter((_, i) => i % 2 === 0).map(m => (
              <div 
                key={m}
                className={`text-[8px] cursor-pointer transition-colors ${value === m ? 'text-blue-600 font-bold' : 'text-slate-300 hover:text-slate-500'}`}
                onClick={() => onChange(m)}
              >
                {m}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Current value indicator */}
      {!compact && (
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="px-3 py-1 bg-blue-50 rounded-lg border border-blue-100">
            <span className="text-blue-600 font-black text-sm">{value}</span>
            <span className="text-blue-400 text-xs ml-1">cm</span>
          </div>
          <div className="px-3 py-1 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-slate-600 font-bold text-xs">{(value / 100).toFixed(2)}</span>
            <span className="text-slate-400 text-xs ml-1">m</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default HeightSliderControl;
