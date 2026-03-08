import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { PlantEntry } from '../types';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import { ensureLeaflet } from '../services/resourceLoader';
import {
  bulkUpsertCachedPhotoEcologyAnalyses,
  getCachedPhotoEcologyAnalyses,
  type CachedPhotoEcologyAnalysis,
} from '../services/ecologyCacheService';
import { estimateBiomass } from '../ecology/biomass';
import { estimateCarbon } from '../ecology/carbon';
import { calculateNDVI } from '../ecology/ndvi';
import { calculateCanopyCover } from '../ecology/canopyCover';
import { analyzePlantHealthHSV, type PlantHealthResult } from '../ecology/plantHealth';

const HEALTH_COLORS = {
  Sehat: '#10b981',
  Merana: '#f59e0b',
  Mati: '#ef4444',
};

interface PhotoEcologyMetric {
  ndvi: number;
  canopyCover: number;
  hsv: PlantHealthResult;
}

interface BatchProgress {
  active: boolean;
  done: number;
  total: number;
  failed: number;
}

interface CloudEcologySummary {
  totalTrees: number;
  healthyTrees: number;
  unhealthyTrees: number;
  totalBiomass: number;
  totalCarbon: number;
  canopyCoverPct: number;
  hcvHealthIndex: number;
  totalVolumeM3: number;
  avgHeightCm: number;
  medianHeightCm: number;
  tallestHeightCm: number;
}

const getNDVILabel = (ndvi: number): string => {
  if (ndvi > 0.5) return 'Vegetasi Sehat';
  if (ndvi >= 0.2) return 'Vegetasi Sedang';
  return 'Vegetasi Buruk';
};

const getCanopyLabel = (cover: number): string => {
  if (cover > 70) return 'Hutan Rapat';
  if (cover >= 40) return 'Hutan Sedang';
  return 'Hutan Jarang';
};

const round = (value: number, decimals = 2): number => {
  if (!Number.isFinite(value)) return 0;
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
};

const toFinite = (value: unknown, fallback = 0): number => {
  const num = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(num) ? num : fallback;
};

const computeVolumeFromHeightCm = (heightCm: number): number => {
  const safeHeight = Number.isFinite(heightCm) && heightCm > 0 ? heightCm : 0;
  if (safeHeight === 0) {
    return 0;
  }

  const h = safeHeight / 100;
  const dCm = h <= 1.3 ? Math.max(0.5, h * 0.85) : Math.max(1, 0.85 * h ** 1.2);
  const dM = dCm / 100;
  const formFactor = 0.45;
  return Math.PI * (dM / 2) ** 2 * h * formFactor;
};

const median = (values: number[]): number => {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .slice()
    .sort((a, b) => a - b);

  if (sorted.length === 0) {
    return 0;
  }

  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const getHighResImageUrl = (url: string): string => {
  if (!url) return '';
  if (url.startsWith('data:')) return url;

  const driveIdMatch = url.match(/\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
  if (driveIdMatch && driveIdMatch[1]) {
    const fileId = driveIdMatch[1];
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
  }

  return url;
};

const loadImageDataFromSrc = async (src: string, size = 128): Promise<ImageData | null> => {
  if (!src) return null;

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          canvas.width = 0;
          canvas.height = 0;
          resolve(null);
          return;
        }

        context.drawImage(image, 0, 0, size, size);
        const data = context.getImageData(0, 0, size, size);
        // Lepas canvas segera setelah ImageData diambil.
        canvas.width = 0;
        canvas.height = 0;
        image.src = '';
        resolve(data);
      } catch {
        resolve(null);
      }
    };

    image.onerror = () => resolve(null);
    image.src = src;
  });
};

const averageRGB = (imageData: ImageData): { r: number; g: number; b: number } => {
  const pixels = imageData.data;
  let count = 0;
  let r = 0;
  let g = 0;
  let b = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a === 0) continue;
    r += pixels[i];
    g += pixels[i + 1];
    b += pixels[i + 2];
    count += 1;
  }

  if (count === 0) {
    return { r: 0, g: 0, b: 0 };
  }

  return {
    r: r / count,
    g: g / count,
    b: b / count,
  };
};

const analyzePhotoEcology = async (src: string): Promise<PhotoEcologyMetric | null> => {
  const imageData = await loadImageDataFromSrc(getHighResImageUrl(src));
  if (!imageData) {
    return null;
  }

  const avg = averageRGB(imageData);
  return {
    ndvi: calculateNDVI(avg.r, avg.g, avg.b),
    canopyCover: calculateCanopyCover(imageData),
    hsv: analyzePlantHealthHSV(imageData),
  };
};

const toCacheRecord = (
  entryId: string,
  photoRef: string,
  metric: PhotoEcologyMetric,
): CachedPhotoEcologyAnalysis => {
  return {
    entryId,
    photoRef,
    ndvi: metric.ndvi,
    canopyCover: metric.canopyCover,
    hsv: metric.hsv,
    updatedAt: new Date().toISOString(),
  };
};

const fromCacheRecord = (record: CachedPhotoEcologyAnalysis): PhotoEcologyMetric => {
  return {
    ndvi: record.ndvi,
    canopyCover: record.canopyCover,
    hsv: record.hsv,
  };
};

const MapRecenter = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 18);
  }, [center, map]);
  return null;
};

const MapAutoFit = ({ points }: { points: [number, number][] }) => {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) {
      return;
    }

    map.fitBounds(points, {
      padding: [20, 20],
      maxZoom: 18,
    });
  }, [points, map]);

  return null;
};

export const AnalyticsPanel: React.FC<{ entries: PlantEntry[]; appsScriptUrl: string }> = ({
  entries,
  appsScriptUrl,
}) => {
  const [isLeafletReady, setIsLeafletReady] = useState(false);
  const [isImageAnalysisRunning, setIsImageAnalysisRunning] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [cloudSummary, setCloudSummary] = useState<CloudEcologySummary | null>(null);
  const [cloudSummarySource, setCloudSummarySource] = useState<'cloud' | 'local'>('local');
  const [cloudSummaryLoading, setCloudSummaryLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({
    active: false,
    done: 0,
    total: 0,
    failed: 0,
  });
  const [photoMetricsById, setPhotoMetricsById] = useState<Record<string, PhotoEcologyMetric>>({});

  const analyzableEntries = useMemo(() => {
    return entries.filter((entry) => Boolean(entry.id && entry.foto));
  }, [entries]);

  const runBatchAnalysis = useCallback(
    async (targets: PlantEntry[], forceReanalyze: boolean, showProgress: boolean) => {
      if (targets.length === 0) {
        return;
      }

      setIsImageAnalysisRunning(true);
      if (showProgress) {
        setBatchProgress({ active: true, done: 0, total: targets.length, failed: 0 });
      }
      setAnalysisMessage('Image ecology analysis running...');

      try {
        const targetIds = targets.map((entry) => entry.id);
        const cached = await getCachedPhotoEcologyAnalyses(targetIds);
        const cachedById = new Map(cached.map((item) => [item.entryId, item]));

        const computedMap: Record<string, PhotoEcologyMetric> = {};
        const updates: CachedPhotoEcologyAnalysis[] = [];
        let done = 0;
        let failed = 0;

        for (const entry of targets) {
          const cachedItem = cachedById.get(entry.id);
          const isCacheValid = Boolean(cachedItem && cachedItem.photoRef === entry.foto);

          if (!forceReanalyze && isCacheValid && cachedItem) {
            computedMap[entry.id] = fromCacheRecord(cachedItem);
            done += 1;
            if (showProgress) {
              setBatchProgress((prev) => ({ ...prev, done }));
            }
            continue;
          }

          const result = await analyzePhotoEcology(entry.foto);
          if (result) {
            computedMap[entry.id] = result;
            updates.push(toCacheRecord(entry.id, entry.foto, result));
          } else {
            failed += 1;
          }

          done += 1;
          if (showProgress) {
            setBatchProgress((prev) => ({ ...prev, done, failed }));
          }
        }

        if (updates.length > 0) {
          await bulkUpsertCachedPhotoEcologyAnalyses(updates);
        }

        setPhotoMetricsById((prev) => ({ ...prev, ...computedMap }));

        if (failed > 0) {
          setAnalysisMessage(`Image ecology analysis selesai. ${failed} foto gagal dianalisis.`);
        } else {
          setAnalysisMessage('Image ecology analysis selesai.');
        }
      } catch (error) {
        console.error('Batch image ecology analysis error:', error);
        setAnalysisMessage('Image ecology analysis gagal dijalankan.');
      } finally {
        setIsImageAnalysisRunning(false);
        if (showProgress) {
          setBatchProgress((prev) => ({ ...prev, active: false }));
        }
      }
    },
    [],
  );

  useEffect(() => {
    ensureLeaflet().then(() => setIsLeafletReady(true));
  }, []);

  useEffect(() => {
    let active = true;

    const loadCloudSummary = async () => {
      const base = String(appsScriptUrl || '').trim();
      if (!base || base.includes('/s/.../exec')) {
        return;
      }

      setCloudSummaryLoading(true);
      try {
        const sep = base.includes('?') ? '&' : '?';
        const url = `${base}${sep}action=analysis_ecology&t=${Date.now()}`;
        const response = await fetch(url, { method: 'GET', cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        const summary = payload?.summary;
        if (!summary || !active) {
          return;
        }

        const parsed: CloudEcologySummary = {
          totalTrees: toFinite(summary.totalTrees),
          healthyTrees: toFinite(summary.healthyTrees),
          unhealthyTrees: toFinite(summary.unhealthyTrees),
          totalBiomass: toFinite(summary.totalBiomass),
          totalCarbon: toFinite(summary.totalCarbon),
          canopyCoverPct: toFinite(summary.canopyCoverPct),
          hcvHealthIndex: toFinite(summary.hcvHealthIndex),
          totalVolumeM3: toFinite(summary.totalVolumeM3),
          avgHeightCm: toFinite(summary.avgHeightCm),
          medianHeightCm: toFinite(summary.medianHeightCm),
          tallestHeightCm: toFinite(summary.tallestHeightCm),
        };

        setCloudSummary(parsed);
        setCloudSummarySource('cloud');
      } catch {
        if (active) {
          setCloudSummary(null);
          setCloudSummarySource('local');
        }
      } finally {
        if (active) {
          setCloudSummaryLoading(false);
        }
      }
    };

    void loadCloudSummary();

    return () => {
      active = false;
    };
  }, [appsScriptUrl, entries.length]);

  useEffect(() => {
    let active = true;

    const preloadCachedMetrics = async () => {
      if (analyzableEntries.length === 0) {
        if (active) {
          setPhotoMetricsById({});
          setAnalysisMessage('');
        }
        return;
      }

      const ids = analyzableEntries.map((entry) => entry.id);
      const cached = await getCachedPhotoEcologyAnalyses(ids);

      if (!active) {
        return;
      }

      const validCache: Record<string, PhotoEcologyMetric> = {};
      cached.forEach((record) => {
        const current = analyzableEntries.find((entry) => entry.id === record.entryId);
        if (current && current.foto === record.photoRef) {
          validCache[record.entryId] = fromCacheRecord(record);
        }
      });
      setPhotoMetricsById(validCache);

      const recentTargets = analyzableEntries.slice(-3).filter((entry) => !validCache[entry.id]);
      if (recentTargets.length > 0) {
        await runBatchAnalysis(recentTargets, false, false);
      }
    };

    void preloadCachedMetrics();

    return () => {
      active = false;
    };
  }, [analyzableEntries, runBatchAnalysis]);

  const handleAnalyzeAllPhotos = useCallback(async () => {
    await runBatchAnalysis(analyzableEntries, true, true);
  }, [analyzableEntries, runBatchAnalysis]);

  const photoMetrics = useMemo(() => {
    return analyzableEntries
      .map((entry) => photoMetricsById[entry.id])
      .filter((metric): metric is PhotoEcologyMetric => Boolean(metric));
  }, [analyzableEntries, photoMetricsById]);

  const scatterData = useMemo(() => {
    return entries.map((e, idx) => ({
      index: e.noPohon || idx + 1,
      tinggi: typeof e.tinggi === 'string' ? parseFloat(e.tinggi) : e.tinggi,
      kesehatan: e.kesehatan,
      name: `Pohon #${e.noPohon}`,
    }));
  }, [entries]);

  const supervisorData = useMemo(() => {
    const counts: Record<string, number> = {};
    entries.forEach((e) => {
      const name = e.pengawas || 'Anonim';
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [entries]);

  const mapCenter = useMemo(() => {
    const valid = entries.filter((e) => e.gps && e.gps.lat !== 0);
    if (valid.length === 0) return [-2.979129, 115.199507];
    const last = valid[valid.length - 1];
    return [last.gps!.lat, last.gps!.lon];
  }, [entries]);

  const mapPoints = useMemo<[number, number][]>(() => {
    return entries
      .filter((entry) => entry.gps && entry.gps.lat !== 0 && entry.gps.lon !== 0)
      .map((entry) => [entry.gps!.lat, entry.gps!.lon]);
  }, [entries]);

  const ecologySummary = useMemo(() => {
    const heights = entries
      .map((entry) => Number(entry.tinggi))
      .filter((value) => Number.isFinite(value) && value > 0);

    const totalTrees = entries.length;
    const healthyTrees = entries.filter((entry) => entry.kesehatan === 'Sehat').length;
    const unhealthyTrees = Math.max(0, totalTrees - healthyTrees);

    const totalBiomass = round(
      entries.reduce((acc, entry) => acc + estimateBiomass(Number(entry.tinggi) || 0), 0),
      3,
    );
    const totalCarbon = round(estimateCarbon(totalBiomass), 3);
    const totalVolumeM3 = round(
      entries.reduce((acc, entry) => acc + computeVolumeFromHeightCm(Number(entry.tinggi) || 0), 0),
      3,
    );

    const avgHeightCm = heights.length > 0 ? round(heights.reduce((a, b) => a + b, 0) / heights.length, 2) : 0;
    const medianHeightCm = round(median(heights), 2);
    const tallestHeightCm = heights.length > 0 ? round(Math.max(...heights), 2) : 0;

    const canopyAreaM2 = heights.reduce((acc, heightCm) => {
      const hM = heightCm / 100;
      const crownDiameterM = Math.max(0.5, hM * 0.4);
      return acc + Math.PI * (crownDiameterM / 2) ** 2;
    }, 0);
    const plotAreaM2 = Math.max(1, totalTrees * 16);
    const canopyCoverPct = round(Math.max(0, Math.min(100, (canopyAreaM2 / plotAreaM2) * 100)), 2);

    const hcvRaw =
      entries.reduce((acc, entry) => {
        if (entry.kesehatan === 'Sehat') return acc + 1;
        if (entry.kesehatan === 'Merana') return acc + 0.5;
        return acc;
      }, 0) / Math.max(1, totalTrees);
    const hcvHealthIndex = round(hcvRaw * 100, 2);

    const ndviAvg =
      photoMetrics.length > 0
        ? round(photoMetrics.reduce((acc, metric) => acc + metric.ndvi, 0) / photoMetrics.length, 3)
        : 0;

    const canopyAvg =
      photoMetrics.length > 0
        ? round(
            photoMetrics.reduce((acc, metric) => acc + metric.canopyCover, 0) / photoMetrics.length,
            2,
          )
        : 0;

    const hsvLatest = photoMetrics.length > 0 ? photoMetrics[photoMetrics.length - 1].hsv : null;

    const localSummary: CloudEcologySummary = {
      totalTrees,
      healthyTrees,
      unhealthyTrees,
      totalBiomass,
      totalCarbon,
      canopyCoverPct,
      hcvHealthIndex,
      totalVolumeM3,
      avgHeightCm,
      medianHeightCm,
      tallestHeightCm,
    };

    const effectiveSummary = cloudSummary ?? localSummary;

    return {
      summary: effectiveSummary,
      source: cloudSummary ? cloudSummarySource : 'local',
      ndviAvg,
      canopyAvg,
      hsvLatest,
    };
  }, [entries, photoMetrics, cloudSummary, cloudSummarySource]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-2xl">📊</div>
        <p className="font-bold text-[10px] uppercase tracking-widest text-center">
          Belum ada data analitik
          <br />
          <span className="text-[8px] opacity-60">Ambil foto untuk melihat visualisasi</span>
        </p>
      </div>
    );
  }

  if (!isLeafletReady) {
    return (
      <div className="h-[300px] w-full rounded-[2.5rem] bg-slate-100 shimmer flex items-center justify-center text-[10px] font-black uppercase text-slate-400">
        Memuat GIS...
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Eco Summary Metrics</h4>
          <span className={`text-[8px] font-black px-2 py-1 rounded-lg uppercase ${ecologySummary.source === 'cloud' ? 'text-sky-700 bg-sky-50' : 'text-amber-700 bg-amber-50'}`}>
            {cloudSummaryLoading ? 'SYNC CLOUD...' : ecologySummary.source === 'cloud' ? 'SOURCE: CLOUD' : 'SOURCE: LOCAL'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-1">
          <button
            onClick={handleAnalyzeAllPhotos}
            disabled={isImageAnalysisRunning || analyzableEntries.length === 0}
            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
          >
            Analyze all photos
          </button>

          {batchProgress.total > 0 && (
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wide">
              Progress: {batchProgress.done}/{batchProgress.total}
              {batchProgress.failed > 0 ? ` | Failed: ${batchProgress.failed}` : ''}
            </span>
          )}
        </div>

        {(isImageAnalysisRunning || analysisMessage) && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 mx-1">
            {isImageAnalysisRunning ? (
              <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                Image ecology analysis running...
              </p>
            ) : (
              <p className="text-[10px] font-bold text-emerald-700">{analysisMessage}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white rounded-2xl p-4 shadow-lg">
            <p className="text-[9px] font-black uppercase tracking-wider text-emerald-50">Estimasi Biomassa</p>
            <p className="text-xl font-black mt-1">{ecologySummary.summary.totalBiomass}<span className="text-[10px] ml-1">kg</span></p>
            <p className="text-[9px] font-bold text-emerald-100 mt-1">Pohon: {ecologySummary.summary.totalTrees}</p>
          </div>

          <div className="bg-gradient-to-br from-sky-600 to-blue-700 text-white rounded-2xl p-4 shadow-lg">
            <p className="text-[9px] font-black uppercase tracking-wider text-sky-50">Estimasi Karbon</p>
            <p className="text-xl font-black mt-1">{ecologySummary.summary.totalCarbon}<span className="text-[10px] ml-1">kg C</span></p>
            <p className="text-[9px] font-bold text-sky-100 mt-1">Dari total biomassa</p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase">Canopy Cover</p>
            <p className="text-lg font-black text-slate-800">
              {ecologySummary.summary.canopyCoverPct}<span className="text-[10px] ml-1 text-slate-500">%</span>
            </p>
            <p className="text-[9px] text-slate-500 font-bold">Estimasi tutupan tajuk dari tinggi</p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase">HCV Health Index</p>
            <p className="text-lg font-black text-slate-800">
              {ecologySummary.summary.hcvHealthIndex}<span className="text-[10px] ml-1 text-slate-500">%</span>
            </p>
            <p className="text-[9px] text-slate-500 font-bold">
              Sehat: {ecologySummary.summary.healthyTrees} • Tidak sehat: {ecologySummary.summary.unhealthyTrees}
            </p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase">Volume</p>
            <p className="text-lg font-black text-slate-800">
              {ecologySummary.summary.totalVolumeM3}<span className="text-[10px] ml-1 text-slate-500">m3</span>
            </p>
            <p className="text-[9px] text-slate-500 font-bold">Akumulasi volume batang</p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase">Rata-rata Tinggi</p>
            <p className="text-lg font-black text-slate-800">
              {ecologySummary.summary.avgHeightCm}<span className="text-[10px] ml-1 text-slate-500">cm</span>
            </p>
            <p className="text-[9px] text-slate-500 font-bold">Median: {ecologySummary.summary.medianHeightCm} cm</p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase">Pohon Tertinggi</p>
            <p className="text-lg font-black text-slate-800">
              {ecologySummary.summary.tallestHeightCm}<span className="text-[10px] ml-1 text-slate-500">cm</span>
            </p>
            <p className="text-[9px] text-slate-500 font-bold">Distribusi tinggi terdeteksi</p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase">NDVI Kamera</p>
            <p className="text-lg font-black text-slate-800">{ecologySummary.ndviAvg}</p>
            <p className="text-[9px] text-slate-500 font-bold">{getNDVILabel(ecologySummary.ndviAvg)}</p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase">Canopy Kamera</p>
            <p className="text-lg font-black text-slate-800">
              {ecologySummary.canopyAvg}
              <span className="text-[10px] text-slate-500 ml-1">%</span>
            </p>
            <p className="text-[9px] text-slate-500 font-bold">{getCanopyLabel(ecologySummary.canopyAvg)}</p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-400 uppercase mb-1">HSV Plant Health (Citra Terbaru)</p>
          {ecologySummary.hsvLatest ? (
            <div className="text-[10px] font-bold text-slate-700 space-y-1">
              <p>
                Status: {ecologySummary.hsvLatest.health} ({ecologySummary.hsvLatest.confidence}% confidence)
              </p>
              <p>
                HSV: H {ecologySummary.hsvLatest.hue} • S {ecologySummary.hsvLatest.saturation} • V{' '}
                {ecologySummary.hsvLatest.value}
              </p>
            </div>
          ) : (
            <p className="text-[10px] font-bold text-slate-500">
              Belum ada citra yang bisa dianalisis (cek izin CORS untuk gambar cloud).
            </p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            Spatial Distribution (GIS)
          </h4>
          <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase">
            Real-time Location
          </span>
        </div>
        <div className="h-[350px] w-full rounded-[2.5rem] overflow-hidden border border-slate-100 shadow-xl relative z-0">
          <MapContainer
            center={mapCenter as [number, number]}
            zoom={16}
            scrollWheelZoom={false}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" />
            <MapRecenter center={mapCenter as [number, number]} />
            <MapAutoFit points={mapPoints} />
            {entries
              .filter((e) => e.gps && e.gps.lat !== 0)
              .map((entry) => (
                <Marker key={entry.id} position={[entry.gps!.lat, entry.gps!.lon]}>
                  <Popup minWidth={220}>
                    <div className="w-full overflow-hidden">
                      {entry.foto && (
                        <img
                          src={getHighResImageUrl(entry.foto)}
                          className="w-full h-32 object-cover rounded-xl mb-2"
                          alt="Pohon"
                        />
                      )}
                      <p className="font-black text-xs uppercase">Pohon #{entry.noPohon}</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">
                        {entry.tanaman} • {entry.tinggi} CM
                      </p>
                    </div>
                  </Popup>
                </Marker>
              ))}
          </MapContainer>
        </div>
      </section>

      <section className="space-y-4">
        <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest px-1">
          Scatter: Tinggi per Indeks Pohon
        </h4>
        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                type="number"
                dataKey="index"
                name="Indeks"
                unit=""
                fontSize={8}
                fontWeight="bold"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="number"
                dataKey="tinggi"
                name="Tinggi"
                unit="cm"
                fontSize={8}
                fontWeight="bold"
                tickLine={false}
                axisLine={false}
              />
              <ZAxis type="number" range={[100, 100]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{
                  borderRadius: '15px',
                  border: 'none',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                  fontSize: '10px',
                  fontWeight: 'bold',
                }}
              />
              <Scatter name="Pohon" data={scatterData}>
                {scatterData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={HEALTH_COLORS[entry.kesehatan as keyof typeof HEALTH_COLORS] || '#3b82f6'}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="space-y-4">
        <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest px-1">
          Produktivitas Pengawas (Realisasi)
        </h4>
        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={supervisorData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
              <XAxis type="number" hide />
              <YAxis
                dataKey="name"
                type="category"
                fontSize={9}
                fontWeight="black"
                tickLine={false}
                axisLine={false}
                stroke="#64748b"
                width={80}
              />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{
                  borderRadius: '15px',
                  border: 'none',
                  boxShadow: '0 10px 15px rgba(0,0,0,0.1)',
                  fontSize: '10px',
                  fontWeight: 'bold',
                }}
              />
              <Bar dataKey="count" name="Jumlah" fill="#3b82f6" radius={[0, 10, 10, 0]} barSize={20}>
                {supervisorData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={index === 0 ? '#1d4ed8' : '#60a5fa'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};
