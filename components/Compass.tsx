
import React, { useState, useEffect, useCallback } from 'react';

const IconCompass = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6-2-2 6-6 2 2-6Z" />
  </svg>
);

export const Compass: React.FC = () => {
  const [heading, setHeading] = useState<number | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const handleOrientation = useCallback((event: any) => {
    let headingValue = null;

    // Logika untuk iOS (WebKit)
    if (event.webkitCompassHeading !== undefined) {
      headingValue = event.webkitCompassHeading;
    } 
    // Logika untuk Android (Absolute Orientation)
    else if (event.alpha !== null) {
      // Jika menggunakan event 'deviceorientationabsolute', alpha 0 biasanya adalah North
      headingValue = 360 - event.alpha;
    }

    if (headingValue !== null) {
      setHeading(Math.round(headingValue));
      setIsActive(true);
    }
  }, []);

  const startCompass = useCallback(() => {
    // Cek apakah browser mendukung event absolute orientation (umum di Android modern)
    // FIX: Cast window to any when checking for 'ondeviceorientationabsolute' to prevent incorrect type narrowing to 'never'.
    if ('ondeviceorientationabsolute' in (window as any)) {
      window.addEventListener('deviceorientationabsolute', handleOrientation);
    } else {
      window.addEventListener('deviceorientation', handleOrientation);
    }
  }, [handleOrientation]);

  useEffect(() => {
    // Cek kebutuhan izin (khusus iOS 13+)
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      setNeedsPermission(true);
    } else {
      startCompass();
    }

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [startCompass, handleOrientation]);

  const requestPermission = async () => {
    try {
      const response = await (DeviceOrientationEvent as any).requestPermission();
      if (response === 'granted') {
        setNeedsPermission(false);
        startCompass();
      }
    } catch (error) {
      console.error("Compass permission denied", error);
    }
  };

  const getDirectionLabel = (h: number) => {
    // Arah mata angin standar
    const sectors = ['U', 'UT', 'T', 'TG', 'S', 'BD', 'B', 'BL'];
    return sectors[Math.round(h / 45) % 8];
  };

  if (needsPermission && !isActive) {
    return (
      <button 
        onClick={requestPermission}
        className="w-12 h-12 rounded-full bg-blue-600/80 backdrop-blur-md text-white flex items-center justify-center border border-white/40 shadow-lg animate-bounce pointer-events-auto"
        title="Aktifkan Kompas"
      >
        <IconCompass />
      </button>
    );
  }

  return (
    <div className="relative w-16 h-16 flex items-center justify-center group pointer-events-auto select-none">
      {/* Outer Ring / Dial */}
      <div className="absolute inset-0 rounded-full border-2 border-white/20 backdrop-blur-md bg-black/40 shadow-2xl overflow-hidden">
        {/* Subtle grid pattern inside */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle,white_1px,transparent_1px)] bg-[length:8px_8px]" />
      </div>
      
      {/* Rotating Dial */}
      <div 
        className="absolute inset-1 rounded-full transition-transform duration-100 ease-out"
        style={{ transform: `rotate(${- (heading || 0)}deg)` }}
      >
        {/* Cardinal Points - North is Red */}
        <div className="absolute top-1 left-1/2 -translate-x-1/2 flex flex-col items-center">
          <span className="text-[9px] font-black text-red-500 drop-shadow-sm">N</span>
          <div className="w-0.5 h-1.5 bg-red-500 rounded-full" />
        </div>
        
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex flex-col items-center">
          <div className="w-0.5 h-1 bg-white/40 rounded-full mb-0.5" />
          <span className="text-[8px] font-black text-white/40">S</span>
        </div>

        <div className="absolute left-1 top-1/2 -translate-y-1/2 flex items-center">
          <span className="text-[8px] font-black text-white/40">W</span>
          <div className="w-1.5 h-0.5 bg-white/40 rounded-full ml-0.5" />
        </div>

        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
          <div className="w-1.5 h-0.5 bg-white/40 rounded-full mr-0.5" />
          <span className="text-[8px] font-black text-white/40">E</span>
        </div>

        {/* Small Ticks for 45 degrees */}
        {[45, 135, 225, 315].map(deg => (
          <div 
            key={deg}
            className="absolute inset-0 flex items-start justify-center"
            style={{ transform: `rotate(${deg}deg)` }}
          >
            <div className="w-[1px] h-1 bg-white/20 mt-1" />
          </div>
        ))}
      </div>

      {/* Center Digital Display (Static) */}
      <div className="z-10 flex flex-col items-center justify-center bg-black/20 w-8 h-8 rounded-full backdrop-blur-sm border border-white/5">
        <span className="text-[10px] font-black leading-none text-white drop-shadow-md">
          {heading !== null ? getDirectionLabel(heading) : '--'}
        </span>
        <span className="text-[7px] font-mono font-bold text-white/70 leading-none mt-0.5">
          {heading !== null ? `${heading}°` : '--'}
        </span>
      </div>

      {/* Static Indicator Needle (Points to device's current direction) */}
      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 flex flex-col items-center z-20">
        <div className="w-1.5 h-4 bg-red-500 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.8)]" />
        <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[4px] border-t-red-500 -mt-1" />
      </div>

      {/* Calibration message if no heading */}
      {!isActive && (
        <div className="absolute -bottom-8 whitespace-nowrap text-[7px] font-black text-white/40 uppercase tracking-widest animate-pulse">
          Calibrating Sensor...
        </div>
      )}
    </div>
  );
};
