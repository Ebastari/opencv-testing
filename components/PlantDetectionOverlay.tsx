/**
 * Plant Detection Overlay Component
 * 
 * Komponen ini menampilkan bounding box overlay di atas video
 * untuk menampilkan hasil deteksi tanaman secara real-time.
 * 
 * @example
 * 
 * import { PlantDetectionOverlay } from './components/PlantDetectionOverlay';
 * 
 * <PlantDetectionOverlay
 *   videoRef={videoRef}
 *   isEnabled={true}
 *   pixelToCmRatio={0.04}
 *   onDetection={(plants) => console.log(plants)}
 * />
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  detectPlantsRealtime, 
  pixelsToCentimeters, 
  DEFAULT_VEGETATION_HSV,
  type DetectedPlant 
} from '../ecology/plantDetectionModule';

interface PlantDetectionOverlayProps {
  /** Reference ke elemen video */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Apakah deteksi diaktifkan */
  isEnabled?: boolean;
  /** Interval deteksi dalam milidetik */
  detectionInterval?: number;
  /** Rasio piksel ke cm untuk konversi tinggi */
  pixelToCmRatio?: number;
  /** Callback ketika deteksi selesai */
  onDetection?: (plants: DetectedPlant[], heightCm: number | null) => void;
  /** Tampilkan label tinggi pada bounding box */
  showHeightLabel?: boolean;
  /** Warna bounding box */
  boxColor?: string;
  /** Lebar garis bounding box */
  boxLineWidth?: number;
  /** Ukuran analisis (lebih kecil = lebih cepat) */
  analysisSize?: number;
  /** HSV threshold lower */
  hsvLower?: { h: number; s: number; v: number };
  /** HSV threshold upper */
  hsvUpper?: { h: number; s: number; v: number };
  /** Minimum area kontur */
  minContourArea?: number;
}

export const PlantDetectionOverlay: React.FC<PlantDetectionOverlayProps> = ({
  videoRef,
  isEnabled = true,
  detectionInterval = 1500,
  pixelToCmRatio = 0.04,
  onDetection,
  showHeightLabel = true,
  boxColor = '#00ff00',
  boxLineWidth = 2,
  analysisSize = 160,
  hsvLower = DEFAULT_VEGETATION_HSV.lower,
  hsvUpper = DEFAULT_VEGETATION_HSV.upper,
  minContourArea = 500
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [detectedPlants, setDetectedPlants] = useState<DetectedPlant[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastDetectionTime, setLastDetectionTime] = useState<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  // Fungsi untuk menggambar bounding box di canvas
  const drawBoundingBoxes = useCallback((
    ctx: CanvasRenderingContext2D,
    plants: DetectedPlant[],
    videoWidth: number,
    videoHeight: number,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Hitung skala
    const scaleX = canvasWidth / videoWidth;
    const scaleY = canvasHeight / videoHeight;

    plants.forEach((plant, index) => {
      // Skip jika confidence terlalu rendah
      if (plant.confidence < 10) return;

      // Hitung posisi dan ukuran yang diskalakan
      const x = plant.x * scaleX;
      const y = plant.y * scaleY;
      const width = plant.width * scaleX;
      const height = plant.height * scaleY;

      // Pilih warna berdasarkan index (cycling)
      const colors = ['#00ff00', '#00ffff', '#ffff00', '#ff00ff', '#ff6600'];
      const color = colors[index % colors.length];

      // Gambar bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = boxLineWidth;
      ctx.strokeRect(x, y, width, height);

      // Gambar background untuk label
      if (showHeightLabel) {
        const heightCm = pixelsToCentimeters(plant.height, pixelToCmRatio);
        const label = `${Math.round(heightCm)} cm`;
        
        // Background label
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        const labelWidth = ctx.measureText(label).width + 8;
        ctx.fillRect(x, Math.max(y - 20, 0), labelWidth, 18);

        // Teks label
        ctx.fillStyle = color;
        ctx.font = 'bold 12px Arial';
        ctx.fillText(label, x + 4, Math.max(y - 6, 12));
      }

      // Gambar confidence score
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      const confLabel = `${plant.confidence}%`;
      const confWidth = ctx.measureText(confLabel).width + 8;
      ctx.fillRect(x + width - confWidth, y + height + 2, confWidth, 14);
      
      ctx.fillStyle = color;
      ctx.font = '10px Arial';
      ctx.fillText(confLabel, x + width - confWidth + 4, y + height + 12);
    });
  }, [boxColor, boxLineWidth, showHeightLabel, pixelToCmRatio]);

  // Fungsi untuk melakukan deteksi
  const performDetection = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;

    const video = videoRef.current;
    
    // Pastikan video sudah siap
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    // Set processing flag
    setIsProcessing(true);

    try {
      // Import dan jalankan deteksi
      const result = await detectPlantsRealtime(video);

      if (result.plants.length > 0) {
        // Update state
        setDetectedPlants(result.plants);
        setLastDetectionTime(Date.now());

        // Callback jika ada
        if (onDetection) {
          const heightCm = result.heightPx !== null 
            ? pixelsToCentimeters(result.heightPx, pixelToCmRatio)
            : null;
          onDetection(result.plants, heightCm);
        }

        // Draw bounding boxes
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawBoundingBoxes(
            ctx,
            result.plants,
            video.videoWidth,
            video.videoHeight,
            canvas.width,
            canvas.height
          );
        }
      } else {
        // Clear canvas jika tidak ada tanaman terdeteksi
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        setDetectedPlants([]);
      }
    } catch (error) {
      console.error('Plant detection error:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [videoRef, isProcessing, onDetection, pixelToCmRatio, drawBoundingBoxes]);

  // Setup canvas size dan start detection loop
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !isEnabled) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Function untuk update canvas size
    const updateCanvasSize = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.clientWidth || video.videoWidth;
        canvas.height = video.clientHeight || video.videoHeight;
      }
    };

    // Initial size update
    updateCanvasSize();

    // Update size ketika video metadata berubah
    const handleLoadedMetadata = () => {
      updateCanvasSize();
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    
    // Resize observer untuk handle size changes
    const resizeObserver = new ResizeObserver(updateCanvasSize);
    resizeObserver.observe(video);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      resizeObserver.disconnect();
    };
  }, [videoRef, isEnabled]);

  // Detection loop
  useEffect(() => {
    if (!isEnabled) return;

    // Jalankan deteksi pertama kali
    const timeoutId = setTimeout(() => {
      performDetection();
    }, 1000);

    // Setup interval untuk deteksi berkala
    const intervalId = setInterval(() => {
      performDetection();
    }, detectionInterval);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isEnabled, detectionInterval, performDetection]);

  // Sync canvas size dengan video
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const syncCanvasSize = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (video && canvas) {
        const videoRect = video.getBoundingClientRect();
        canvas.width = videoRect.width;
        canvas.height = videoRect.height;

        // Redraw jika ada plants terdeteksi
        if (detectedPlants.length > 0) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            drawBoundingBoxes(
              ctx,
              detectedPlants,
              video.videoWidth,
              video.videoHeight,
              canvas.width,
              canvas.height
            );
          }
        }
      }
    };

    // Initial sync
    syncCanvasSize();

    // Sync on resize
    window.addEventListener('resize', syncCanvasSize);
    
    // Sync periodically while visible
    const intervalId = setInterval(syncCanvasSize, 500);

    return () => {
      window.removeEventListener('resize', syncCanvasSize);
      clearInterval(intervalId);
    };
  }, [videoRef, detectedPlants, drawBoundingBoxes]);

  // Render component
  return (
    <div 
      className="plant-detection-overlay-container"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 10
      }}
    >
      {/* Canvas untuk bounding box */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        }}
      />

      {/* Indicator untuk status deteksi */}
      {isEnabled && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            background: 'rgba(0, 0, 0, 0.7)',
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 11,
            fontFamily: 'Arial, sans-serif',
            color: detectedPlants.length > 0 ? '#00ff00' : '#ffaa00',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <span 
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: isProcessing ? '#ffff00' : detectedPlants.length > 0 ? '#00ff00' : '#ff6600',
              animation: isProcessing ? 'pulse 1s infinite' : 'none'
            }} 
          />
          <span>
            {isProcessing ? 'Mendeteksi...' : 
             detectedPlants.length > 0 ? 
               `${detectedPlants.length} tanaman` : 
               'Tidak ada tanaman'}
          </span>
        </div>
      )}

      {/* Label info */}
      {detectedPlants.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 100,
            left: 10,
            background: 'rgba(0, 0, 0, 0.8)',
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            maxWidth: 200
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 4, color: '#00ff00' }}>
            Hasil Deteksi
          </div>
          {detectedPlants.slice(0, 3).map((plant, index) => (
            <div key={index} style={{ marginTop: 4, fontSize: 11 }}>
              <span style={{ color: '#00ffff' }}>■</span> Tanaman {index + 1}: {' '}
              {Math.round(pixelsToCentimeters(plant.height, pixelToCmRatio))} cm
            </div>
          ))}
          {detectedPlants.length > 3 && (
            <div style={{ marginTop: 4, fontSize: 10, color: '#aaaaaa' }}>
              +{detectedPlants.length - 3} lebih banyak...
            </div>
          )}
        </div>
      )}

      {/* CSS Animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export default PlantDetectionOverlay;

