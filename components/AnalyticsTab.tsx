
import React, { useEffect, useState } from 'react';
import { PlantEntry } from '../types';
import { AnalyticsPanel } from './AnalyticsPanel';
import type { PlantHealthResult } from '../ecology/plantHealth';
import { cloudService } from '../services/cloudService';
import { getAllCloudTrees, saveCloudTrees } from '../services/cloudDbService';

interface AnalyticsTabProps {
  entries: PlantEntry[];
  appsScriptUrl: string;
  isOnline: boolean;
  onSelectHealthInsight: (result: PlantHealthResult) => void;
  onBackupNow: () => void;
  isBackupRunning: boolean;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  entries,
  appsScriptUrl,
  isOnline,
  onSelectHealthInsight,
  onBackupNow,
  isBackupRunning,
}) => {
  const [useCloudData, setUseCloudData] = useState(false);
  const [cloudEntries, setCloudEntries] = useState<PlantEntry[]>([]);
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadCloudData = async () => {
      if (!useCloudData) return;

      setIsCloudLoading(true);
      setCloudError('');
      
      try {
        if (isOnline) {
          const cloudTrees = await cloudService.getTreeList();
          await saveCloudTrees(cloudTrees);
          if (!cancelled) {
            setCloudEntries(cloudTrees);
          }
          return;
        }

        const cachedCloudTrees = await getAllCloudTrees();
        if (!cachedCloudTrees.length) {
          throw new Error('Cloud cache kosong');
        }

        if (!cancelled) {
          setCloudEntries(cachedCloudTrees);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Cloud data fetch failed';
        if (!cancelled) {
          setCloudError(message);
        }
      } finally {
        if (!cancelled) {
          setIsCloudLoading(false);
        }
      }
    };

    loadCloudData();

    return () => {
      cancelled = true;
    };
  }, [useCloudData, isOnline]);

  const displayEntries = useCloudData ? cloudEntries : entries;
  const sourceLabel = useCloudData ? 'CLOUD' : 'LOCAL';

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            Total: {displayEntries.length} Titik
          </span>
          <button
            onClick={() => setUseCloudData(!useCloudData)}
            disabled={isCloudLoading}
            className={`text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-full transition-all ${
              useCloudData 
                ? 'text-emerald-700 bg-emerald-50 shadow-md shadow-emerald-100' 
                : 'text-sky-700 bg-sky-50 hover:bg-sky-100 shadow-md shadow-sky-100'
            } disabled:opacity-50`}
          >
            {sourceLabel}
          </button>
          <button
            type="button"
            onClick={onBackupNow}
            disabled={isBackupRunning}
            className="text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-full transition-all text-cyan-700 bg-cyan-50 hover:bg-cyan-100 shadow-md shadow-cyan-100 disabled:opacity-50"
            title="Backup spreadsheet lokal"
          >
            {isBackupRunning ? 'BACKUP...' : 'BACKUP'}
          </button>
        </div>
        {isCloudLoading && (
          <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded-full">
            Loading cloud...
          </span>
        )}
        {cloudError && !isCloudLoading && (
          <span className="text-[8px] font-black text-red-600 uppercase tracking-widest bg-red-50 px-2 py-1 rounded-full">
            {cloudError.slice(0, 20)}...
          </span>
        )}
      </div>

      <div className="px-1">
        <p className={`text-[9px] font-bold rounded-xl px-3 py-2 ${
          useCloudData 
            ? 'text-sky-700 bg-sky-50 border border-sky-100' 
            : 'text-emerald-700 bg-emerald-50 border border-emerald-100'
        }`}>
          {useCloudData 
            ? 'Menggunakan data cloud dari GAS atau cache cloud terakhir. Backup spreadsheet tetap mengambil seluruh data lokal IndexedDB.'
            : 'Analitik menggunakan data lokal. Foto penuh dari IndexedDB saat dibutuhkan. Tombol backup mengekspor format spreadsheet 1-tap.'
          }
        </p>
      </div>

      <AnalyticsPanel 
        entries={displayEntries} 
        appsScriptUrl={appsScriptUrl} 
        useCloudSummary={useCloudData} 
        onSelectHealthInsight={onSelectHealthInsight} 
      />
    </div>
  );
};
