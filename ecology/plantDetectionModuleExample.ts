/**
 * Contoh Integrasi Plant Detection Module dengan CameraView
 * 
 * File ini menunjukkan cara mengintegrasikan modul deteksi tanaman
 * ke dalam komponen React yang sudah ada.
 * 
 * @example
 * 
 * Import modul:
 * import { detectPlants, detectPlantsRealtime, pixelsToCentimeters, estimatePixelToCmRatio } from './ecology/plantDetectionModule';
 */

import { 
  detectPlants, 
  detectPlantsRealtime, 
  pixelsToCentimeters, 
  estimatePixelToCmRatio,
  type PlantDetectionResult,
  type DetectedPlant,
  type PlantDetectionOptions
} from './plantDetectionModule';

// ==================== CONTOH 1: Deteksi dari Video Frame ====================

/**
 * Hook untuk deteksi tanaman real-time dari video
 * 
 * @param videoRef - Reference ke elemen video
 * @param onDetectionComplete - Callback ketika deteksi selesai
 * @param options - Opsi deteksi
 */
export const usePlantDetection = (
  videoRef: { current: HTMLVideoElement | null },
  onDetectionComplete?: (plants: DetectedPlant[], heightCm: number | null) => void,
  options?: PlantDetectionOptions
) => {
  const pixelToCmRatio = 0.04; // Kalibrasi: 1 cm = 0.04 px (sesuaikan)
  
  const detectFromVideo = async () => {
    if (!videoRef.current) return null;
    
    const video = videoRef.current;
    
    // Pastikan video sudah siap
    if (video.readyState < 2 || video.videoWidth === 0) {
      console.warn('Video belum siap untuk deteksi');
      return null;
    }
    
    try {
      // Deteksi tanaman dari frame video
      const result = await detectPlantsRealtime(video);
      
      if (result.heightPx !== null) {
        // Konversi tinggi piksel ke cm
        const heightCm = pixelsToCentimeters(result.heightPx, pixelToCmRatio);
        
        // Panggil callback jika ada
        if (onDetectionComplete) {
          onDetectionComplete(result.plants, heightCm);
        }
        
        return {
          plants: result.plants,
          heightPx: result.heightPx,
          heightCm: Math.round(heightCm * 10) / 10 // Bulatkan 1 desimal
        };
      }
      
      return null;
    } catch (error) {
      console.error('Deteksi gagal:', error);
      return null;
    }
  };
  
  return { detectFromVideo };
};

// ==================== CONTOH 2: Deteksi dari Canvas ====================

/**
 * Fungsi untuk mendeteksi tanaman dari canvas capture
 * 
 * @param canvas - Canvas yang berisi gambar
 * @returns Hasil deteksi tanaman
 */
export const detectFromCanvas = async (
  canvas: HTMLCanvasElement
): Promise<{
  plants: DetectedPlant[];
  heightPx: number;
  heightCm: number;
  maskDataUrl: string | null;
  outputDataUrl: string | null;
} | null> => {
  try {
    const result = await detectPlants(canvas, {
      drawBoundingBoxes: true,
      generateMask: true,
      analysisSize: 320
    });
    
    if (!result.success || result.plants.length === 0) {
      return null;
    }
    
    // Ambil tanaman tertinggi
    const tallestPlant = result.plants.reduce((prev, current) => 
      current.height > prev.height ? current : prev
    );
    
    const pixelToCmRatio = 0.04;
    const heightCm = pixelsToCentimeters(tallestPlant.height, pixelToCmRatio);
    
    return {
      plants: result.plants,
      heightPx: tallestPlant.height,
      heightCm: Math.round(heightCm * 10) / 10,
      maskDataUrl: result.vegetationMask?.toDataURL() || null,
      outputDataUrl: result.outputCanvas?.toDataURL() || null
    };
  } catch (error) {
    console.error('Deteksi dari canvas gagal:', error);
    return null;
  }
};

// ==================== CONTOH 3: Integrasi dengan CameraView ====================

/**
 * Contoh kode untuk menambahkan ke CameraView.tsx
 * 
 * // Tambahkan import di bagian atas file:
 * import { detectPlantsRealtime, pixelsToCentimeters } from '../ecology/plantDetectionModule';
 * 
 * // Dalam komponen, tambahkan state:
 * const [plantDetectionResult, setPlantDetectionResult] = useState<{
 *   heightCm: number | null;
 *   plants: DetectedPlant[];
 * } | null>(null);
 * 
 * // Dalam useEffect untuk live detection:
 * useEffect(() => {
 *   let intervalId: number;
 *   
 *   const startLiveDetection = async () => {
 *     if (!videoRef.current || !isDetectionEnabled) return;
 *     
 *     try {
 *       const result = await detectPlantsRealtime(videoRef.current);
 *       
 *       if (result.heightPx !== null) {
 *         const pixelToCmRatio = 0.04; // Kalibrasi
 *         const heightCm = pixelsToCentimeters(result.heightPx, pixelToCmRatio);
 *         
 *         setPlantDetectionResult({
 *           heightCm: Math.round(heightCm),
 *           plants: result.plants
 *         });
 *       }
 *     } catch (error) {
 *       console.error('Detection error:', error);
 *     }
 *   };
 *   
 *   // Jalankan deteksi setiap 2 detik
 *   intervalId = window.setInterval(startLiveDetection, 2000);
 *   
 *   return () => {
 *     if (intervalId) clearInterval(intervalId);
 *   };
 * }, [videoRef.current, isDetectionEnabled]);
 */

// ==================== CONTOH 4: Deteksi dengan Kalibrasi ====================

/**
 * Kalibrasi menggunakan objek dengan ukuran diketahui
 * 
 * @param calibrationImage - Gambar dengan objek ukuran diketahui
 * @param knownHeightCm - Tinggi objek sebenarnya dalam cm
 * @returns Rasio piksel ke cm
 */
export const calibrateWithKnownObject = async (
  calibrationImage: HTMLImageElement | HTMLCanvasElement,
  knownHeightCm: number
): Promise<number | null> => {
  try {
    const result = await detectPlants(calibrationImage, {
      drawBoundingBoxes: false,
      generateMask: false,
      analysisSize: 640 // Resolusi lebih tinggi untuk kalibrasi
    });
    
    if (result.plants.length === 0) {
      console.warn('Tidak ada objek terdeteksi untuk kalibrasi');
      return null;
    }
    
    // Ambil objek terbesar sebagai referensi
    const largestPlant = result.plants.reduce((prev, current) => 
      current.area > prev.area ? current : prev
    );
    
    // Hitung rasio
    const ratio = estimatePixelToCmRatio(largestPlant.height, knownHeightCm);
    
    console.log('Kalibrasi selesai:', {
      detectedHeightPx: largestPlant.height,
      knownHeightCm,
      ratio
    });
    
    return ratio;
  } catch (error) {
    console.error('Kalibrasi gagal:', error);
    return null;
  }
};

// ==================== CONTOH 5: Komponen React Lengkap ====================

/**
 * Contoh komponen React untuk deteksi tanaman
 * 
 * Gunakan komponen ini sebagai referensi untuk integrasi:
 * 
 * import React, { useRef, useState, useCallback } from 'react';
 * import { detectPlantsRealtime, pixelsToCentimeters } from './ecology/plantDetectionModule';
 * 
 * interface PlantDetectionComponentProps {
 *   videoRef: React.RefObject<HTMLVideoElement>;
 *   pixelToCmRatio?: number;
 * }
 * 
 * export const PlantDetectionOverlay: React.FC<PlantDetectionComponentProps> = ({
 *   videoRef,
 *   pixelToCmRatio = 0.04
 * }) => {
 *   const [detection, setDetection] = useState<{
 *     heightCm: number;
 *     plantCount: number;
 *   } | null>(null);
 *   const [isDetecting, setIsDetecting] = useState(false);
 * 
 *   const handleDetect = useCallback(async () => {
 *     if (!videoRef.current || isDetecting) return;
 *     
 *     setIsDetecting(true);
 *     try {
 *       const result = await detectPlantsRealtime(videoRef.current);
 *       
 *       if (result.heightPx !== null) {
 *         const heightCm = pixelsToCentimeters(result.heightPx, pixelToCmRatio);
 *         setDetection({
 *           heightCm: Math.round(heightCm),
 *           plantCount: result.plants.length
 *         });
 *       }
 *     } catch (error) {
 *       console.error('Detection error:', error);
 *     } finally {
 *       setIsDetecting(false);
 *     }
 *   }, [videoRef, pixelToCmRatio, isDetecting]);
 * 
 *   return (
 *     <div className="plant-detection-overlay">
 *       <button onClick={handleDetect} disabled={isDetecting}>
 *         {isDetecting ? 'Mendeteksi...' : 'Deteksi Tanaman'}
 *       </button>
 *       
 *       {detection && (
 *         <div className="detection-result">
 *           <p>Tinggi: {detection.heightCm} cm</p>
 *           <p>Jumlah tanaman: {detection.plantCount}</p>
 *         </div>
 *       )}
 *     </div>
 *   );
 * };
 */

export {};

