
import React, { useState, useMemo } from 'react';
import { PlantEntry } from '../types';

interface DataTabProps {
  entries: PlantEntry[];
  totalEntriesCount: number;
  pendingCount: number;
  isOnline: boolean;
  onSyncPending: () => Promise<void>;
}

// Menambah jumlah item per halaman karena optimasi lazy load gambar sudah diterapkan
const ITEMS_PER_PAGE = 10;
const RETRY_BASE_DELAY_MS = 15000;
const RETRY_MAX_DELAY_MS = 5 * 60 * 1000;

const getRetryDelayMs = (retryCount: number): number => {
  const exponent = Math.max(0, retryCount - 1);
  return Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** exponent);
};

const getNextRetryText = (entry: PlantEntry): string => {
  const retryCount = entry.retryCount || 0;
  if (!entry.lastSyncAttemptAt || retryCount <= 0) {
    return 'Siap dikirim';
  }

  const lastAttempt = new Date(entry.lastSyncAttemptAt).getTime();
  if (!Number.isFinite(lastAttempt)) {
    return 'Siap dikirim';
  }

  const waitUntil = lastAttempt + getRetryDelayMs(retryCount);
  const diff = waitUntil - Date.now();
  if (diff <= 0) {
    return 'Siap retry';
  }

  const seconds = Math.ceil(diff / 1000);
  return `Retry ${seconds} dtk lagi`;
};

export const DataTab: React.FC<DataTabProps> = ({ entries, totalEntriesCount, pendingCount, isOnline, onSyncPending }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [isSyncing, setIsSyncing] = useState(false);

  const getPreviewSrc = (entry: PlantEntry): string => entry.thumbnail || entry.foto;

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [entries]);

  const pendingEntries = useMemo(() => {
    return [...entries]
      .filter((entry) => !entry.uploaded)
      .sort((a, b) => {
        const retryA = a.retryCount || 0;
        const retryB = b.retryCount || 0;
        if (retryA !== retryB) {
          return retryB - retryA;
        }
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
  }, [entries]);

  const latestEntry = sortedEntries[0];
  
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await onSyncPending();
    } finally {
      setIsSyncing(false);
    }
  };

  const paginatedEntries = useMemo(() => {
    return sortedEntries.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  }, [sortedEntries, currentPage]);
  
  const totalPages = Math.ceil(entries.length / ITEMS_PER_PAGE);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-12">
      <div className="flex justify-between items-end px-2">
        <div className="flex flex-col gap-1">
          <h3 className="font-black text-lg text-slate-800 leading-none">Penyimpanan</h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{totalEntriesCount} Entri Tersimpan</span>
          </div>
        </div>
        
        {pendingCount > 0 && (
          <button 
            onClick={handleSync}
            disabled={isSyncing || !isOnline}
            className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl flex items-center gap-2 ${isOnline ? 'bg-blue-600 text-white shadow-blue-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
          >
            {isSyncing ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <span>☁️</span>}
            <span>{isSyncing ? 'SYNCING...' : 'SYNC ALL'}</span>
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="py-24 text-center space-y-4">
          <div className="w-24 h-24 bg-slate-50 rounded-[3rem] flex items-center justify-center text-4xl mx-auto shadow-inner grayscale opacity-40">📸</div>
          <p className="text-slate-800 text-sm font-black uppercase tracking-widest">Belum Ada Data</p>
        </div>
      ) : (
        <>
          <div className="px-1 group">
            <div className="bg-white p-2 rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden">
              <div className="relative aspect-[4/3] w-full rounded-[2.5rem] overflow-hidden bg-slate-100">
                <img src={getPreviewSrc(latestEntry)} className="w-full h-full object-cover" alt="Terakhir" />
                <div className="absolute top-5 left-5 right-5 flex justify-between items-start">
                   <div className={`px-4 py-2 rounded-2xl backdrop-blur-xl border flex items-center gap-2 shadow-2xl ${latestEntry.uploaded ? 'bg-blue-600/80 border-blue-400/50' : 'bg-amber-500/80 border-amber-400/50'}`}>
                      <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">{latestEntry.uploaded ? 'Sync Cloud' : 'Local'}</span>
                   </div>
                </div>
              </div>
            </div>
          </div>

          {totalEntriesCount > entries.length && (
            <p className="px-3 text-[9px] font-bold text-slate-500">
              Menampilkan {entries.length} entri terbaru untuk menjaga browser tetap ringan.
            </p>
          )}

          <div className="space-y-4 pt-4">
            {pendingEntries.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-[2rem] p-4 mx-1 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-[10px] font-black text-amber-700 uppercase tracking-[0.2em]">Retry Queue</h4>
                  <span className="text-[9px] font-black text-amber-700">{pendingEntries.length} pending</span>
                </div>

                <div className="space-y-2 max-h-[170px] overflow-y-auto no-scrollbar pr-1">
                  {pendingEntries.slice(0, 6).map((entry) => (
                    <div key={`retry-${entry.id}`} className="bg-white rounded-xl border border-amber-100 px-3 py-2">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <p className="text-[10px] font-black text-slate-700 uppercase">Pohon #{entry.noPohon}</p>
                          <p className="text-[9px] text-slate-500 font-bold">Retry: {entry.retryCount || 0}x</p>
                        </div>
                        <span className="text-[8px] font-black text-amber-700 uppercase tracking-widest">
                          {getNextRetryText(entry)}
                        </span>
                      </div>
                      {entry.lastSyncError && (
                        <p className="text-[9px] text-red-600 font-semibold mt-1 truncate">{entry.lastSyncError}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.2em] px-3">Riwayat Pengamatan</h4>
            <div className="space-y-3 px-1">
              {paginatedEntries.map(entry => (
                <div key={entry.id} className="bg-white p-4 rounded-[2rem] border border-slate-100 flex gap-4 items-center group active:scale-[0.98] transition-all relative">
                  <div className="relative h-16 w-16 rounded-[1.25rem] overflow-hidden flex-shrink-0 bg-slate-50 border border-slate-50">
                    <img 
                      src={getPreviewSrc(entry)} 
                      className="h-full w-full object-cover" 
                      loading="lazy" 
                      alt="thumbnail" 
                    />
                    <div className={`absolute inset-x-0 bottom-0 h-1 ${entry.kesehatan === 'Sehat' ? 'bg-green-500' : entry.kesehatan === 'Mati' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                  </div>
                  <div className="flex-1">
                    <p className="font-black text-sm text-slate-800">Pohon #{entry.noPohon}</p>
                    <span className="text-[9px] text-slate-400 font-bold uppercase">{entry.tanaman} • {entry.tinggi} cm</span>
                    <div className="mt-1">
                      <span className={`text-[8px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        entry.gpsQualityAtCapture === 'Tinggi'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          : entry.gpsQualityAtCapture === 'Sedang'
                            ? 'bg-amber-50 text-amber-700 border border-amber-100'
                            : entry.gpsQualityAtCapture === 'Rendah'
                              ? 'bg-red-50 text-red-700 border border-red-100'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        GPS: {entry.gpsQualityAtCapture || 'Tidak Tersedia'}
                      </span>
                      <span className="text-[8px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ml-1 bg-slate-100 text-slate-600 border border-slate-200">
                        {Number.isFinite(entry.gpsAccuracyAtCapture) ? `±${Number(entry.gpsAccuracyAtCapture).toFixed(1)}m` : 'Akurasi n/a'}
                      </span>
                    </div>
                  </div>
                  <div className="text-[16px]">{entry.uploaded ? '✅' : '💾'}</div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-between items-center mt-8 px-2">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 disabled:opacity-20 active:scale-90 transition-all">←</button>
                <div className="flex gap-2">
                  {[...Array(totalPages)].map((_, i) => (
                    <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${currentPage === i + 1 ? 'w-8 bg-blue-600' : 'w-1.5 bg-slate-200'}`} />
                  ))}
                </div>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-blue-600 disabled:opacity-20 active:scale-90 transition-all">→</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
