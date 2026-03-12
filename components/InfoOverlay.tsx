
import React, { useRef } from 'react';
import Draggable from 'react-draggable';
import { GpsLocation, FormState } from '../types';
import type { PlantHealthResult } from '../ecology/plantHealth';

interface InfoOverlayProps {
  // FIX: Use FormState type from types.ts to ensure compatibility with props passed from CameraView.
  formState: FormState;
  entriesCount: number;
  gps: GpsLocation | null;
  liveHealth?: PlantHealthResult | null;
}

export const InfoOverlay: React.FC<InfoOverlayProps> = ({ formState, entriesCount, gps, liveHealth }) => {
  const nodeRef = useRef(null);

  const isPoorAccuracy = gps ? gps.accuracy > 30 : false;

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy <= 10) return 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]';
    if (accuracy <= 30) return 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]';
    return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]';
  };

  return (
    <Draggable nodeRef={nodeRef} bounds="parent">
      <div 
        ref={nodeRef}
        className="absolute top-48 left-4 z-20 flex flex-col gap-1.5 cursor-move touch-none active:scale-95 transition-transform"
      >
        {/* Minimalist Status Bar with Accuracy Label */}
        <div className={`flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border transition-all duration-300 shadow-lg ${isPoorAccuracy ? 'animate-pulse border-red-500/50 shadow-red-500/20' : 'border-white/10'}`}>
          <div className={`w-2 h-2 rounded-full ${gps ? getAccuracyColor(gps.accuracy) : 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`} />
          <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${isPoorAccuracy ? 'text-red-400' : 'text-white/80'}`}>
            {gps ? (
              <>
                <span className="opacity-50">GPS:</span>
                <span>±{gps.accuracy.toFixed(1)}m</span>
              </>
            ) : (
              'NO GPS SIGNAL'
            )}
          </span>
        </div>

        {/* Floating Info Pill */}
        <div className="bg-black/30 backdrop-blur-md p-3 rounded-2xl border border-white/5 flex flex-col gap-1 min-w-[140px]">
          <div className="flex justify-between items-center gap-4">
            <span className="text-[8px] font-black text-white/40 uppercase">Species</span>
            <span className="text-[10px] font-bold text-white truncate max-w-[80px]">{formState.jenis || '---'}</span>
          </div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-[8px] font-black text-white/40 uppercase">Height</span>
            <span className="text-[10px] font-bold text-blue-400">{formState.tinggi}cm</span>
          </div>
          {gps && (
            <div className="flex justify-between items-center gap-4">
              <span className="text-[8px] font-black text-white/40 uppercase">Precision</span>
              <span className={`text-[10px] font-bold transition-colors duration-300 ${gps.accuracy <= 10 ? 'text-green-400' : gps.accuracy <= 30 ? 'text-yellow-400' : 'text-red-400 animate-pulse'}`}>
                ±{gps.accuracy.toFixed(1)}m
              </span>
            </div>
          )}
          {liveHealth && (
            <div className="flex justify-between items-center gap-4">
              <span className="text-[8px] font-black text-white/40 uppercase">Health AI</span>
              <span
                className={`text-[10px] font-bold ${
                  liveHealth.health === 'Sehat'
                    ? 'text-emerald-400'
                    : liveHealth.health === 'Merana'
                      ? 'text-yellow-400'
                      : 'text-red-400'
                }`}
              >
                {liveHealth.health} ({liveHealth.confidence}%)
              </span>
            </div>
          )}
          <div className="flex justify-between items-center gap-4 pt-1 border-t border-white/5 mt-1">
            <span className="text-[8px] font-black text-white/40 uppercase">Stored</span>
            <span className="text-[10px] font-bold text-emerald-400">{entriesCount}</span>
          </div>
        </div>
      </div>
    </Draggable>
  );
};
