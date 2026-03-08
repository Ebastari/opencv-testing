
import React from 'react';
import { getAllEntries } from '../services/dbService';
import { exportToCSV, exportToZIP, exportToKMZ } from '../services/exportService';

interface SettingsTabProps {
  appsScriptUrl: string;
  onAppsScriptUrlChange: (url: string) => void;
  onClearData: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ appsScriptUrl, onAppsScriptUrlChange, onClearData }) => {
  const isSecure = window.isSecureContext;
  const [exportState, setExportState] = React.useState<{
    mode: 'csv' | 'kmz' | 'zip' | null;
    current: number;
    total: number;
    phase: 'preparing' | 'packaging' | 'saving' | null;
  }>({
    mode: null,
    current: 0,
    total: 0,
    phase: null,
  });

  const handleExport = async (mode: 'csv' | 'kmz' | 'zip') => {
    const entries = await getAllEntries();
    setExportState({ mode, current: 0, total: entries.length, phase: 'preparing' });
    try {
      if (mode === 'csv') {
        exportToCSV(entries);
        return;
      }
      if (mode === 'kmz') {
        await exportToKMZ(entries, {
          onProgress: (progress) => {
            setExportState({ mode, ...progress });
          },
        });
        return;
      }
      await exportToZIP(entries, {
        onProgress: (progress) => {
          setExportState({ mode, ...progress });
        },
      });
    } finally {
      window.setTimeout(() => {
        setExportState({ mode: null, current: 0, total: 0, phase: null });
      }, 800);
    }
  };

  const exportLabel =
    exportState.phase === 'preparing'
      ? 'Menyiapkan file bertahap...'
      : exportState.phase === 'packaging'
        ? 'Membungkus arsip...'
        : exportState.phase === 'saving'
          ? 'Menyimpan file...'
          : '';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Sinkronisasi Cloud</h4>
        </div>
        <div className="space-y-3 bg-slate-50 p-5 rounded-3xl border border-slate-100">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">URL Google Apps Script</label>
          <input 
            type="url" 
            value={appsScriptUrl} 
            onChange={(e) => onAppsScriptUrlChange(e.target.value)} 
            placeholder="https://script.google.com/..." 
            className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-sm outline-none focus:ring-4 focus:ring-blue-500/10 shadow-sm transition-all" 
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Ekspor Massal</h4>
        </div>
        {exportState.mode && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">
                {exportState.mode.toUpperCase()} EXPORT
              </p>
              <p className="text-[10px] font-black text-emerald-700">
                {exportState.total > 0 ? `${Math.min(exportState.current, exportState.total)}/${exportState.total}` : '--'}
              </p>
            </div>
            <p className="text-[10px] font-bold text-emerald-700">{exportLabel}</p>
            <div className="h-2 rounded-full bg-emerald-100 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-200"
                style={{ width: `${exportState.total > 0 ? (Math.min(exportState.current, exportState.total) / exportState.total) * 100 : 15}%` }}
              />
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3">
          <button onClick={() => void handleExport('csv')} disabled={Boolean(exportState.mode)} className="w-full p-5 bg-white border border-slate-100 rounded-3xl text-xs font-black text-slate-700 active:scale-[0.98] transition-all flex justify-between items-center shadow-sm hover:border-blue-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
            EXPORT CSV <span className="text-xl">📊</span>
          </button>
          <button onClick={() => void handleExport('kmz')} disabled={Boolean(exportState.mode)} className="w-full p-5 bg-white border border-slate-100 rounded-3xl text-xs font-black text-slate-700 active:scale-[0.98] transition-all flex justify-between items-center shadow-sm hover:border-emerald-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
            EXPORT KMZ (GOOGLE EARTH) <span className="text-xl">🌍</span>
          </button>
          <button onClick={() => void handleExport('zip')} disabled={Boolean(exportState.mode)} className="w-full p-5 bg-white border border-slate-100 rounded-3xl text-xs font-black text-slate-700 active:scale-[0.98] transition-all flex justify-between items-center shadow-sm hover:border-orange-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
            DOWNLOAD IMAGE PACK (.ZIP) <span className="text-xl">📦</span>
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="w-2 h-2 rounded-full bg-slate-400" />
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Informasi Sistem</h4>
        </div>
        <div className="bg-slate-900 p-5 rounded-3xl text-white/80 font-mono text-[10px] space-y-2">
          <div className="flex justify-between border-b border-white/5 pb-2">
            <span className="opacity-50">Origin:</span>
            <span>{window.location.origin}</span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-2">
            <span className="opacity-50">Koneksi Aman:</span>
            <span className={isSecure ? 'text-emerald-400' : 'text-red-400'}>{isSecure ? 'YES (Secure)' : 'NO (Unsecured)'}</span>
          </div>
          {!isSecure && (
            <p className="text-[8px] text-amber-400 leading-relaxed italic">
              * Kamera & GPS mungkin tidak berfungsi karena koneksi tidak aman (Bukan HTTPS/Localhost).
            </p>
          )}
        </div>
      </section>

      <section className="pt-8 mt-8 border-t border-slate-100">
        <button onClick={onClearData} className="w-full p-5 bg-red-50 text-red-600 rounded-3xl text-[10px] font-black uppercase tracking-[0.2em] active:scale-[0.98] transition-all shadow-sm ring-1 ring-red-100">
          Reset Semua Data Lokal
        </button>
      </section>
    </div>
  );
};
