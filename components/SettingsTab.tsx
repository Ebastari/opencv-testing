
import React, { useEffect, useState } from 'react';
import { getAllEntries } from '../services/dbService';
import { exportToCSV, exportToZIP, exportToKMZ } from '../services/exportService';
import { type AutoBackupIntervalMinutes, type BrowserStorageStatus, type SyncMode } from '../types';

interface SettingsTabProps {
  appsScriptUrl: string;
  onAppsScriptUrlChange: (url: string) => void;
  syncMode: SyncMode;
  onSyncModeChange: React.Dispatch<React.SetStateAction<SyncMode>>;
  storageStatus: BrowserStorageStatus | null;
  onClearData: () => void;
  autoBackupIntervalMinutes: AutoBackupIntervalMinutes;
  onAutoBackupIntervalChange: React.Dispatch<React.SetStateAction<AutoBackupIntervalMinutes>>;
  onSpreadsheetBackupNow: () => void;
  isSpreadsheetBackupRunning: boolean;
}

const HEIGHT_MODE_KEY = 'camera-montana-height-mode-v1';
const HEIGHT_AI_BEHAVIOR_KEY = 'camera-montana-height-ai-behavior-v1';

const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
};

export const SettingsTab: React.FC<SettingsTabProps> = ({
  appsScriptUrl,
  onAppsScriptUrlChange,
  syncMode,
  onSyncModeChange,
  storageStatus,
  onClearData,
  autoBackupIntervalMinutes,
  onAutoBackupIntervalChange,
  onSpreadsheetBackupNow,
  isSpreadsheetBackupRunning,
}) => {
  const isSecure = window.isSecureContext;
  // Pengaturan mode pengukuran tinggi
  const [heightMode, setHeightMode] = useState<'ai' | 'slider' | 'pixel-scale'>(() => {
    try {
      const saved = window.localStorage.getItem(HEIGHT_MODE_KEY);
      if (saved === 'ai' || saved === 'slider' || saved === 'pixel-scale') return saved;
    } catch {}
    return 'slider';
  });
  const [heightAiBehavior, setHeightAiBehavior] = useState<'suggestion' | 'automatic'>(() => {
    try {
      const saved = window.localStorage.getItem(HEIGHT_AI_BEHAVIOR_KEY);
      if (saved === 'suggestion' || saved === 'automatic') return saved;
    } catch {}
    return 'suggestion';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(HEIGHT_MODE_KEY, heightMode);
    } catch {}
  }, [heightMode]);
  useEffect(() => {
    try {
      window.localStorage.setItem(HEIGHT_AI_BEHAVIOR_KEY, heightAiBehavior);
    } catch {}
  }, [heightAiBehavior]);
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
      {/* Height Settings Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="w-2 h-2 rounded-full bg-orange-500" />
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Pengaturan Tinggi Tanaman</h4>
        </div>
        <div className="space-y-3 bg-slate-50 p-5 rounded-3xl border border-slate-100">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Metode Pengukuran Tinggi</label>
          <div className="flex gap-2 mt-2">
            <button
              className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wide transition-all ${heightMode === 'ai' ? 'bg-emerald-500/20 border-emerald-300/35 text-emerald-900' : 'bg-white border-slate-200 text-slate-700'}`}
              onClick={() => setHeightMode('ai')}
              type="button"
            ><svg className="w-4 h-4 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/></svg>AI</button>
            <button
              className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wide transition-all ${heightMode === 'slider' ? 'bg-emerald-500/20 border-emerald-300/35 text-emerald-900' : 'bg-white border-slate-200 text-slate-700'}`}
              onClick={() => setHeightMode('slider')}
              type="button"
            ><svg className="w-4 h-4 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>Slider</button>
            <button
              className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wide transition-all ${heightMode === 'pixel-scale' ? 'bg-orange-500/20 border-orange-300/35 text-orange-900' : 'bg-white border-slate-200 text-slate-700'}`}
              onClick={() => setHeightMode('pixel-scale')}
              type="button"
            ><svg className="w-4 h-4 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 6H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/><line x1="6" y1="12" x2="6" y2="16"/><line x1="10" y1="12" x2="10" y2="16"/><line x1="14" y1="12" x2="14" y2="16"/></svg>Pixel Scale</button>
          </div>
          {heightMode === 'ai' && (
            <div className="space-y-2 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3">
              <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Perilaku AI Tinggi</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setHeightAiBehavior('suggestion')}
                  className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wide transition-all ${heightAiBehavior === 'suggestion' ? 'bg-white border-emerald-300 text-emerald-900' : 'bg-transparent border-emerald-100 text-emerald-700'}`}
                >
                  Saran
                </button>
                <button
                  type="button"
                  onClick={() => setHeightAiBehavior('automatic')}
                  className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wide transition-all ${heightAiBehavior === 'automatic' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-transparent border-emerald-100 text-emerald-700'}`}
                >
                  Otomatis
                </button>
              </div>
              <p className="text-[9px] text-emerald-800/80 leading-relaxed">
                Saran menampilkan hasil AI atau fallback riwayat tanpa langsung mengubah kolom tinggi. Otomatis hanya mengisi kolom tinggi bila AI visual berhasil membaca tanaman.
              </p>
            </div>
          )}
          <p className="mt-2 text-[9px] text-slate-500">Pilihan ini akan mempengaruhi tampilan panel kamera, visibilitas slider manual, dan cara AI mengisi tinggi tanaman.</p>
        </div>
      </section>

      {/* Cloud Sync Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Sinkronisasi Cloud</h4>
        </div>
        <div className="space-y-3 bg-slate-50 p-5 rounded-3xl border border-slate-100">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Mode Pengiriman Data</label>
<div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onSyncModeChange('fast')}
                className={`px-3 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-wide transition-all ${syncMode === 'fast' ? 'bg-sky-500/20 border-sky-300/35 text-sky-900' : 'bg-white border-slate-200 text-slate-700'}`}
              >
                Fast
              </button>
              <button
                type="button"
                onClick={() => onSyncModeChange('lite')}
                className={`px-3 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-wide transition-all ${syncMode === 'lite' ? 'bg-slate-700/15 border-slate-300 text-slate-900' : 'bg-white border-slate-200 text-slate-700'}`}
              >
                Lite
              </button>
              <button
                type="button"
                onClick={() => onSyncModeChange('hyperlink')}
                className={`px-3 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-wide transition-all ${syncMode === 'hyperlink' ? 'bg-indigo-500/20 border-indigo-300/35 text-indigo-900' : 'bg-white border-slate-200 text-slate-700'}`}
              >
                Link
              </button>
            </div>
            <p className="text-[9px] text-slate-500 leading-relaxed">
              {syncMode === 'fast'
                ? 'Fast menyimpan data lokal lalu mencoba kirim otomatis setiap koneksi tersedia.'
                : 'Lite menyimpan data lokal saja. Pengiriman dilakukan manual dari menu Histori atau Sync.'}
            </p>
          </div>

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
          <div className="w-2 h-2 rounded-full bg-cyan-500" />
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Backup Spreadsheet</h4>
        </div>
        <div className="space-y-4 bg-slate-50 p-5 rounded-3xl border border-slate-100">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Interval Backup Saat App Aktif</label>
            <div className="grid grid-cols-4 gap-2">
              {([
                { value: 0, label: 'Off' },
                { value: 15, label: '15m' },
                { value: 30, label: '30m' },
                { value: 60, label: '60m' },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onAutoBackupIntervalChange(option.value)}
                  className={`px-3 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-wide transition-all ${autoBackupIntervalMinutes === option.value ? 'bg-cyan-500/20 border-cyan-300/35 text-cyan-900' : 'bg-white border-slate-200 text-slate-700'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-slate-500 leading-relaxed">
              Backup file berjalan hanya saat aplikasi masih terbuka. Pada iPhone, sistem akan memberi pengingat untuk tap backup manual karena Safari sering memblokir auto-download.
            </p>
          </div>

          <button
            type="button"
            onClick={onSpreadsheetBackupNow}
            disabled={isSpreadsheetBackupRunning}
            className="w-full p-5 bg-white border border-cyan-100 rounded-3xl text-xs font-black text-cyan-800 active:scale-[0.98] transition-all flex justify-between items-center shadow-sm hover:border-cyan-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSpreadsheetBackupRunning ? 'MENYIAPKAN BACKUP...' : 'BACKUP SPREADSHEET SEKARANG'} <span className="text-xl">💾</span>
          </button>
        </div>
      </section>

      {/* Export Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Ekspor Massal</h4>
        </div>
        {storageStatus && storageStatus.level !== 'normal' && storageStatus.level !== 'unsupported' && (
          <div className={`rounded-[2rem] border px-4 py-4 space-y-2 ${storageStatus.level === 'critical' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
            <div className="flex items-center justify-between gap-3">
              <p className={`text-[10px] font-black uppercase tracking-wider ${storageStatus.level === 'critical' ? 'text-red-700' : 'text-amber-700'}`}>
                Penyimpanan Browser
              </p>
              <p className={`text-[10px] font-black ${storageStatus.level === 'critical' ? 'text-red-700' : 'text-amber-700'}`}>
                {Math.round(storageStatus.usageRatio * 100)}%
              </p>
            </div>
            <p className={`text-[10px] font-semibold leading-relaxed ${storageStatus.level === 'critical' ? 'text-red-700' : 'text-amber-700'}`}>
              Browser hampir penuh. Ruang tersisa {formatBytes(storageStatus.remainingBytes)} dari {formatBytes(storageStatus.quotaBytes)}.
            </p>
            <p className={`text-[9px] leading-relaxed ${storageStatus.level === 'critical' ? 'text-red-600' : 'text-amber-700'}`}>
              Disarankan aktifkan izin download otomatis browser lalu backup data lewat export ZIP, KMZ, atau CSV di bawah ini.
            </p>
          </div>
        )}
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

      {/* System Info Section */}
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

      {/* Clear Data Section */}
      <section className="pt-8 mt-8 border-t border-slate-100">
        <button onClick={onClearData} className="w-full p-5 bg-red-50 text-red-600 rounded-3xl text-[10px] font-black uppercase tracking-[0.2em] active:scale-[0.98] transition-all shadow-sm ring-1 ring-red-100">
          Reset Semua Data Lokal
        </button>
      </section>
    </div>
  );
};
