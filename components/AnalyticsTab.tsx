
import React from 'react';
import { PlantEntry } from '../types';
import { AnalyticsPanel } from './AnalyticsPanel';

interface AnalyticsTabProps {
  entries: PlantEntry[];
  appsScriptUrl: string;
  isOnline: boolean;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ entries }) => {
  const localEntries = entries;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            {`Total Lokal: ${localEntries.length} Titik`}
          </span>
          <span className="text-[8px] font-black text-emerald-700 uppercase tracking-widest bg-emerald-50 px-2 py-1 rounded-full">
            SOURCE: LOCAL
          </span>
        </div>
        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded-full">
          CLOUD ADA DI TAB CLOUD
        </span>
      </div>

      <div className="px-1">
        <p className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
          Analitik menggunakan data lokal ringan. Foto penuh baru diambil dari IndexedDB saat popup dibuka atau analisis citra dijalankan.
        </p>
      </div>

      <AnalyticsPanel entries={localEntries} useCloudSummary={false} />
    </div>
  );
};
