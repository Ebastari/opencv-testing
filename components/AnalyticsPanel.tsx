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
import type { TreeRecord } from '../ecology/density';
import { analyzeEcology } from '../ecology/ecologyReport';
import { calculateCCI } from '../ecology/cci';
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

const estimateAreaHaFromTrees = (trees: TreeRecord[]): number => {
  if (trees.length < 2) {
    return 1;
  }

  const lats = trees.map((tree) => tree.lat);
  const lons = trees.map((tree) => tree.lon);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const latMeters = (maxLat - minLat) * 111320;
  const midLatRad = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const lonMeters = (maxLon - minLon) * 111320 * Math.cos(midLatRad);

  const areaM2 = Math.max(1, Math.abs(latMeters * lonMeters));
  return Math.max(0.01, areaM2 / 10000);
};

const round = (value: number, decimals = 2): number => {
  if (!Number.isFinite(value)) return 0;
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
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
          resolve(null);
          return;
        }

        context.drawImage(image, 0, 0, size, size);
        resolve(context.getImageData(0, 0, size, size));
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

export const AnalyticsPanel: React.FC<{ entries: PlantEntry[] }> = ({ entries }) => {
  const [isLeafletReady, setIsLeafletReady] = useState(false);
  const [isImageAnalysisRunning, setIsImageAnalysisRunning] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState('');
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

  const treeRecords = useMemo<TreeRecord[]>(() => {
    return entries
      .filter((entry) => entry.gps && entry.gps.lat !== 0 && entry.gps.lon !== 0)
      .map((entry) => ({
        lat: entry.gps!.lat,
        lon: entry.gps!.lon,
        health: entry.kesehatan,
        accuracy: entry.gps?.accuracy,
      }));
  }, [entries]);

  const areaHa = useMemo(() => estimateAreaHaFromTrees(treeRecords), [treeRecords]);

  const ecologySummary = useMemo(() => {
    const report = analyzeEcology(treeRecords, areaHa);
    const cciGrade = calculateCCI(report.density, 625).grade;

    const totalBiomass = round(
      entries.reduce((acc, entry) => acc + estimateBiomass(Number(entry.tinggi) || 0), 0),
      3,
    );
    const totalCarbon = round(estimateCarbon(totalBiomass), 3);

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

    return {
      report,
      cciGrade,
      totalBiomass,
      totalCarbon,
      ndviAvg,
      canopyAvg,
      hsvLatest,
    };
  }, [treeRecords, areaHa, entries, photoMetrics]);

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
          <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Ecology Intelligence</h4>
          <span className="text-[8px] font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg uppercase">
            10 Modul Aktif
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

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase">Density</p>
            <p className="text-lg font-black text-slate-800">
              {ecologySummary.report.density}
              <span className="text-[10px] text-slate-500 ml-1">pohon/ha</span>
            </p>
            <p className="text-[9px] text-slate-500 font-bold">
              Sehat: {ecologySummary.report.healthyTrees} • Tidak sehat: {ecologySummary.report.unhealthyTrees}
            </p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase">CCI</p>
            <p className="text-lg font-black text-slate-800">
              {ecologySummary.report.cci}
              <span className="text-[10px] text-slate-500 ml-1">%</span>
            </p>
            <p className="text-[9px] text-slate-500 font-bold">Grade: {ecologySummary.cciGrade}</p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase">Tree Spacing</p>
            <p className="text-lg font-black text-slate-800">
              {ecologySummary.report.spacingMean}
              <span className="text-[10px] text-slate-500 ml-1">m</span>
            </p>
            <p className="text-[9px] text-slate-500 font-bold">Conformity: {ecologySummary.report.spacingConformity}%</p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase">GPS Quality</p>
            <p className="text-lg font-black text-slate-800">
              {ecologySummary.report.gpsAccuracy}
              <span className="text-[10px] text-slate-500 ml-1">m</span>
            </p>
            <p className="text-[9px] text-slate-500 font-bold">Area estimasi: {round(areaHa, 2)} ha</p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase">NDVI Kamera</p>
            <p className="text-lg font-black text-slate-800">{ecologySummary.ndviAvg}</p>
            <p className="text-[9px] text-slate-500 font-bold">{getNDVILabel(ecologySummary.ndviAvg)}</p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase">Canopy Cover</p>
            <p className="text-lg font-black text-slate-800">
              {ecologySummary.canopyAvg}
              <span className="text-[10px] text-slate-500 ml-1">%</span>
            </p>
            <p className="text-[9px] text-slate-500 font-bold">{getCanopyLabel(ecologySummary.canopyAvg)}</p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase">Estimasi Biomassa</p>
            <p className="text-lg font-black text-slate-800">
              {ecologySummary.totalBiomass}
              <span className="text-[10px] text-slate-500 ml-1">kg</span>
            </p>
            <p className="text-[9px] text-slate-500 font-bold">Total pohon: {entries.length}</p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase">Estimasi Karbon</p>
            <p className="text-lg font-black text-slate-800">
              {ecologySummary.totalCarbon}
              <span className="text-[10px] text-slate-500 ml-1">kg C</span>
            </p>
            <p className="text-[9px] text-slate-500 font-bold">Dari total biomassa</p>
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
