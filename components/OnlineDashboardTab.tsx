
import React, { useState, useEffect, useMemo } from 'react';
import { fetchCloudDataSmart } from '../services/fetchService';

interface OnlineDashboardTabProps {
  appsScriptUrl: string;
  isOnline: boolean;
}

export const OnlineDashboardTab: React.FC<OnlineDashboardTabProps> = ({ appsScriptUrl, isOnline }) => {
  const ANALYSIS_PASSWORD = 'agungganteng';
  const SUMMARY_API_ENDPOINT =
    (import.meta.env.VITE_ECOLOGY_SUMMARY_API_URL as string | undefined)?.trim() ||
    '/api/ecology-summary';

  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'network' | 'cache'>('network');
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [unlockInput, setUnlockInput] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const parseHeight = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    const raw = String(value ?? '').trim();
    if (!raw) {
      return 0;
    }

    // Support values like "123,5", "123.5 cm", and "123 CM".
    const normalized = raw.replace(',', '.').replace(/[^0-9.\-]+/g, '');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const normalizeHealth = (value: unknown): 'Sehat' | 'Merana' | 'Mati' | 'Unknown' => {
    const raw = String(value ?? '').trim().toLowerCase();
    if (raw === 'sehat') {
      return 'Sehat';
    }
    if (raw === 'merana') {
      return 'Merana';
    }
    if (raw === 'mati') {
      return 'Mati';
    }
    return 'Unknown';
  };

  const loadData = async () => {
    if (!appsScriptUrl || appsScriptUrl.includes('/s/.../exec')) {
      setError("URL Apps Script belum dikonfigurasi di Tab Pengaturan.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await fetchCloudDataSmart(appsScriptUrl);
      // Memastikan hasil adalah array sebelum disimpan ke state
      setData(Array.isArray(result.data) ? result.data : []);
      setSource(result.source);
      setCachedAt(result.cachedAt || null);
    } catch (err: any) {
      setError(err.message || "Gagal memuat data cloud.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [appsScriptUrl, isOnline]);

  const stats = useMemo(() => {
    // Defensif: pastikan data adalah array sebelum memanggil metode array
    const safeData = Array.isArray(data) ? data : [];
    
    if (safeData.length === 0) return { total: 0, sehat: 0, persenSehat: "0", rataTinggi: "0" };
    
    const total = safeData.length;
    const sehat = safeData.filter((d) => normalizeHealth(d?.Kesehatan) === 'Sehat').length;
    const totalTinggi = safeData.reduce((acc, curr) => acc + parseHeight(curr?.Tinggi), 0);
    
    return {
      total,
      sehat,
      persenSehat: ((sehat / total) * 100).toFixed(1),
      rataTinggi: (totalTinggi / total).toFixed(1)
    };
  }, [data]);

  const ecologyMetrics = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];

    const sehat = safeData.filter((d) => normalizeHealth(d?.Kesehatan) === 'Sehat').length;
    const merana = safeData.filter((d) => normalizeHealth(d?.Kesehatan) === 'Merana').length;
    const mati = safeData.filter((d) => normalizeHealth(d?.Kesehatan) === 'Mati').length;

    const jenisCount: Record<string, number> = {};
    safeData.forEach((item) => {
      const name = item?.Tanaman ? String(item.Tanaman) : 'Unknown';
      jenisCount[name] = (jenisCount[name] || 0) + 1;
    });

    const jenisTop = Object.entries(jenisCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return {
      total: safeData.length,
      sehat,
      merana,
      mati,
      persenSehat: safeData.length > 0 ? Number(((sehat / safeData.length) * 100).toFixed(1)) : 0,
      rataTinggi: Number(stats.rataTinggi),
      jenisTop,
    };
  }, [data, stats.rataTinggi]);

  const dataFingerprint = useMemo(() => {
    return JSON.stringify({
      total: ecologyMetrics.total,
      sehat: ecologyMetrics.sehat,
      merana: ecologyMetrics.merana,
      mati: ecologyMetrics.mati,
      rataTinggi: ecologyMetrics.rataTinggi,
      jenisTop: ecologyMetrics.jenisTop,
    });
  }, [ecologyMetrics]);

  const buildLocalSummary = (): string => {
    const { total, sehat, merana, mati, persenSehat, rataTinggi, jenisTop } = ecologyMetrics;
    const topJenis = jenisTop[0]?.name || 'Unknown';

    if (total === 0) {
      return 'Belum ada data cloud untuk dianalisis.';
    }

    const statusUtama =
      persenSehat >= 80
        ? 'kondisi ekologi relatif stabil'
        : persenSehat >= 60
          ? 'kondisi ekologi cukup baik namun perlu penguatan'
          : 'kondisi ekologi perlu perhatian prioritas';

    return `Dari ${total} pohon, ${sehat} sehat (${persenSehat}%), ${merana} merana, dan ${mati} mati dengan rata-rata tinggi ${rataTinggi} cm, didominasi jenis ${topJenis}; ${statusUtama}. Prioritaskan pemeliharaan pada titik merana/mati dan evaluasi penyebab lokal secara berkala.`;
  };

  const requestAiSummary = async () => {
    if (ecologyMetrics.total === 0) {
      setAiSummary('Belum ada data cloud untuk dianalisis.');
      setAnalysisError(null);
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const response = await fetch(SUMMARY_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: unlockInput,
          metrics: ecologyMetrics,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      const raw = await response.text();

      if (!contentType.toLowerCase().includes('application/json')) {
        // Umumnya terjadi jika endpoint /api tidak tersedia dan server mengembalikan HTML 404.
        throw new Error('Endpoint AI tidak tersedia di environment ini.');
      }

      let result: any = {};
      try {
        result = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error('Respons AI tidak valid (bukan JSON).');
      }

      if (!response.ok) {
        throw new Error(result?.error || 'Gagal membuat analisis ekologi.');
      }

      setAiSummary(result?.summary || 'Analisis tersedia, tetapi respons kosong.');
    } catch (err: any) {
      setAiSummary(buildLocalSummary());
      setAnalysisError(
        `${err?.message || 'Gagal membuat analisis ekologi.'} Menampilkan analisis lokal sebagai fallback.`,
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUnlock = () => {
    if (unlockInput === ANALYSIS_PASSWORD) {
      setIsUnlocked(true);
      setUnlockError(null);
      return;
    }
    setIsUnlocked(false);
    setUnlockError('Password salah.');
  };

  useEffect(() => {
    if (!isUnlocked) {
      return;
    }
    void requestAiSummary();
  }, [isUnlocked, dataFingerprint, SUMMARY_API_ENDPOINT]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex justify-between items-center px-1">
        <div>
          <h3 className="font-black text-slate-800 uppercase tracking-tighter">Cloud Dashboard</h3>
          <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Real-time Sheets Integration</p>
          {source === 'cache' && (
            <p className="text-[8px] font-black text-amber-700 uppercase tracking-widest mt-1">Menampilkan Data Cache</p>
          )}
        </div>
        <button 
          onClick={loadData}
          disabled={loading}
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 active:scale-90 transition-all shadow-sm border border-slate-200 disabled:opacity-50"
        >
          {loading ? <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : (
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-3.2-6.9" />
              <path d="M21 4v6h-6" />
            </svg>
          )}
        </button>
      </div>

      {source === 'cache' && cachedAt && (
        <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl">
          <p className="text-[9px] font-bold text-amber-700">
            Offline/cadangan aktif. Data terakhir: {new Date(cachedAt).toLocaleString('id-ID')}
          </p>
        </div>
      )}

      {!isOnline && (
        <div className="bg-slate-100 border border-slate-200 p-3 rounded-xl">
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">
            Mode offline. Refresh akan menggunakan cache lokal.
          </p>
        </div>
      )}

      {error ? (
        <div className="bg-red-50 p-6 rounded-[2rem] border border-red-100 text-center space-y-3">
          <p className="text-red-600 text-[10px] font-black uppercase tracking-widest leading-relaxed">
            {error}
          </p>
          <button 
            onClick={loadData} 
            className="px-6 py-2 bg-red-600 text-white text-[9px] font-black rounded-full uppercase tracking-widest shadow-lg shadow-red-200 active:scale-95 transition-all"
          >
            Coba Lagi
          </button>
        </div>
      ) : (
        <>
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-600 p-5 rounded-[2rem] text-white shadow-xl shadow-blue-200">
               <span className="text-[8px] font-black opacity-60 uppercase tracking-widest">Total Terealisasi</span>
               <h2 className="text-3xl font-black mt-1">{stats.total}</h2>
               <p className="text-[9px] mt-2 font-bold opacity-80 uppercase">Pohon Terdata</p>
            </div>
            <div className="bg-emerald-500 p-5 rounded-[2rem] text-white shadow-xl shadow-emerald-200">
               <span className="text-[8px] font-black opacity-60 uppercase tracking-widest">Kesehatan Bibit</span>
               <h2 className="text-3xl font-black mt-1">{stats.persenSehat || 0}%</h2>
               <p className="text-[9px] mt-2 font-bold opacity-80 uppercase">Kondisi Sehat</p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-[2rem] border border-slate-100 flex justify-between items-center shadow-inner">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Rata-rata Tinggi</span>
            <span className="text-sm font-black text-slate-800 mr-2">{stats.rataTinggi} CM</span>
          </div>

          <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Analisis Ekologi Ringkas</h4>
              <span className="text-[8px] font-black text-indigo-700 bg-indigo-50 px-2 py-1 rounded-full uppercase">AI Lock</span>
            </div>

            {!isUnlocked ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={unlockInput}
                    onChange={(e) => setUnlockInput(e.target.value)}
                    placeholder="Masukkan password"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                  <button
                    onClick={handleUnlock}
                    className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest active:scale-95"
                  >
                    Buka
                  </button>
                </div>
                {unlockError && <p className="text-[9px] font-bold text-red-600">{unlockError}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Akses terbuka</p>
                  <button
                    onClick={requestAiSummary}
                    disabled={isAnalyzing}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[9px] font-black uppercase tracking-wider disabled:opacity-50"
                  >
                    {isAnalyzing ? 'Menganalisis...' : 'Refresh Analisis'}
                  </button>
                </div>

                {analysisError ? (
                  <p className="text-[10px] font-bold text-red-600">{analysisError}</p>
                ) : (
                  <p className="text-[10px] font-bold text-slate-700 leading-relaxed">
                    {isAnalyzing ? 'Membuat analisis ekologi...' : (aiSummary || 'Analisis belum tersedia.')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* List Data Terakhir */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Data Terbaru di Cloud</h4>
            <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 no-scrollbar">
              {Array.isArray(data) && data.length > 0 ? (
                data.slice().reverse().map((item, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center shadow-sm hover:border-blue-100 transition-colors">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-800">POHON #{item["No Pohon"] || 'N/A'}</span>
                      <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">
                        {item.Tanaman || 'Unknown'} - {item.Tanggal || '-'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                         <p className="text-[9px] font-black text-blue-600">{item.Tinggi || 0} CM</p>
                         <p className="text-[7px] text-slate-300 font-mono">{item.Koordinat || '-'}</p>
                      </div>
                      {item["Link Drive"] && item["Link Drive"] !== "DATA_HIDDEN" && (
                        <a 
                          href={item["Link Drive"]} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-xs shadow-sm hover:bg-blue-50 transition-colors"
                        >
                          <svg viewBox="0 0 24 24" className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-10Z" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                !loading && (
                  <div className="text-center py-12 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Belum ada data di Cloud</p>
                  </div>
                )
              )}
            </div>
          </div>
        </>
      )}
      
      <div className="p-5 bg-blue-50 rounded-3xl border border-blue-100/50">
        <p className="text-[8px] text-blue-500 font-bold uppercase leading-relaxed text-center italic">
          Data ini disinkronkan langsung dari Google Sheets. Pastikan skrip telah di-deploy sebagai Web App dengan akses publik.
        </p>
      </div>
    </div>
  );
};
