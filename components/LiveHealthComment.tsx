import React, { useEffect, useState, useRef } from 'react';
import { generateHealthDescription, type PlantHealthResult } from '../ecology/plantHealth';

interface LiveHealthCommentProps {
  healthResult: PlantHealthResult | null;
  /** Durasi tampil dalam milidetik (default 2000ms = 2 detik) */
  duration?: number;
}

/**
 * Komponen live comment style YouTube yang menampilkan hasil analisis HCV
 * Muncul sekilas (1-2 detik) saat hasil kesehatan tanaman diperbarui.
 */
export const LiveHealthComment: React.FC<LiveHealthCommentProps> = ({
  healthResult,
  duration = 2000,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [comment, setComment] = useState<string>('');
  const [health, setHealth] = useState<'Sehat' | 'Merana' | 'Mati' | null>(null);
  const prevResultRef = useRef<PlantHealthResult | null>(null);

  useEffect(() => {
    // Hanya trigger jika ada hasil baru
    if (healthResult && healthResult !== prevResultRef.current) {
      prevResultRef.current = healthResult;
      
      // Generate komentar dari hasil kesehatan
      const description = generateHealthDescription(healthResult);
      setComment(description);
      setHealth(healthResult.health);
      
      // Tampilkan overlay
      setIsVisible(true);
      
      // Sembunyikan setelah durasi tertentu
      const hideTimer = setTimeout(() => {
        setIsVisible(false);
      }, duration);

      return () => clearTimeout(hideTimer);
    }
  }, [healthResult, duration]);

  // Jangan render jika tidak ada hasil atau tidak visible
  if (!healthResult || !isVisible) {
    return null;
  }

  // Warna berdasarkan status kesehatan
  const bgColor = health === 'Sehat' 
    ? 'rgba(16, 185, 129, 0.95)' // emerald-500
    : health === 'Merana'
      ? 'rgba(245, 158, 11, 0.95)' // amber-500
      : 'rgba(239, 68, 68, 0.95)'; // red-500

  const borderColor = health === 'Sehat'
    ? 'border-emerald-300'
    : health === 'Merana'
      ? 'border-amber-300'
      : 'border-red-300';

  return (
    <div 
      className={`pointer-events-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 
        animate-live-comment-enter`}
      style={{
        animationDuration: `${duration}ms`,
      }}
    >
      <div 
        className={`
          max-w-[85vw] sm:max-w-[480px] 
          px-4 py-3 sm:px-5 sm:py-4 
          rounded-2xl 
          border-2 ${borderColor}
          shadow-[0_8px_32px_rgba(0,0,0,0.4)]
          backdrop-blur-md
          transition-all duration-300
        `}
        style={{ backgroundColor: bgColor }}
      >
        {/* Header dengan ikon dan label */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2.5 h-2.5 rounded-full bg-white/90 animate-pulse" />
          <span className="text-[10px] sm:text-xs font-black text-white/95 uppercase tracking-widest">
            Analisis HCV
          </span>
          <span className={`ml-auto text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-full bg-white/20 text-white`}>
            {health}
          </span>
        </div>
        
        {/* Teks komentar utama */}
        <p className="text-[11px] sm:text-xs font-bold text-white leading-relaxed tracking-wide">
          {comment}
        </p>
        
        {/* Indikator bawah - animasi garis loading */}
        <div className="mt-3 h-0.5 bg-white/20 rounded-full overflow-hidden">
          <div 
            className="h-full bg-white/80 rounded-full animate-loading-bar"
            style={{ 
              animationDuration: `${duration}ms`,
            }}
          />
        </div>
      </div>
    </div>
  );
};

// Inject CSS styles untuk animasi
if (typeof document !== 'undefined') {
  const styleId = 'live-health-comment-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes live-comment-enter {
        0% {
          opacity: 0;
          transform: translate(-50%, -40%) scale(0.9);
        }
        15% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        85% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -60%) scale(0.95);
        }
      }
      
      @keyframes loading-bar {
        0% {
          width: 0%;
        }
        100% {
          width: 100%;
        }
      }
      
      .animate-live-comment-enter {
        animation-name: live-comment-enter;
        animation-timing-function: ease-in-out;
        animation-fill-mode: forwards;
      }
      
      .animate-loading-bar {
        animation-name: loading-bar;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
      }
    `;
    document.head.appendChild(style);
  }
}

