
import React, { useEffect, useState, Suspense, lazy } from 'react';
import { PlantEntry, GpsLocation, FormState, type AutoBackupIntervalMinutes, type BottomSheetTabRequest, type BrowserStorageStatus, type HcvInsightSelection, type SyncMode } from '../types';
import { FormTab } from './FormTab';
import { DataTab } from './DataTab';
import { HcvTab } from './HcvTab';
import { HelpTab } from './HelpTab';
import type { PlantHealthResult } from '../ecology/plantHealth';

const AnalyticsTab = lazy(() => import('./AnalyticsTab').then(m => ({ default: m.AnalyticsTab })));
const SettingsTab = lazy(() => import('./SettingsTab').then(m => ({ default: m.SettingsTab })));
const OnlineDashboardTab = lazy(() => import('./OnlineDashboardTab').then(m => ({ default: m.OnlineDashboardTab })));

const IconInput = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M4 20h16" />
    <path d="M5 16.5V6.8a2 2 0 0 1 .6-1.4l2-2a2 2 0 0 1 1.4-.6h9a2 2 0 0 1 2 2v11.7" />
    <path d="M8 8h8M8 12h8" />
  </svg>
);

const IconAnalytics = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M4 20h16" />
    <rect x="6" y="11" width="3" height="7" rx="1" />
    <rect x="11" y="7" width="3" height="11" rx="1" />
    <rect x="16" y="4" width="3" height="14" rx="1" />
  </svg>
);

const IconHistory = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v4h4" />
    <path d="M12 7v6l4 2" />
  </svg>
);

const IconCloud = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M20 16.5a4 4 0 0 0-1.3-7.8A6 6 0 0 0 7 7.5 4.5 4.5 0 0 0 7.5 16h12.2Z" />
  </svg>
);

const IconLeaf = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 21c0-4.6 1.8-8.2 5.5-10.7 1.9-1.2 3.2-3.4 3.5-6.3-3.1.2-5.7 1.2-7.7 3.1A8.2 8.2 0 0 0 12 9.4a8.2 8.2 0 0 0-1.3-2.3C8.7 5.2 6.1 4.2 3 4c.3 2.9 1.6 5.1 3.5 6.3C10.2 12.8 12 16.4 12 21Z" />
    <path d="M12 10v11" />
  </svg>
);

const IconHelp = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.4 9.2a2.8 2.8 0 1 1 4.9 1.8c-.7.8-1.4 1.2-1.8 1.8-.2.3-.3.7-.3 1.2" />
    <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const IconSettings = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
    <path d="m19.4 15 1.2 2.1-2.1 2.1-2.1-1.2a7.8 7.8 0 0 1-1.8.7L14 21h-4l-.6-2.3a7.8 7.8 0 0 1-1.8-.7l-2.1 1.2-2.1-2.1L4.6 15a7.8 7.8 0 0 1-.7-1.8L1.6 12l2.3-.6a7.8 7.8 0 0 1 .7-1.8L3.4 7.5l2.1-2.1 2.1 1.2a7.8 7.8 0 0 1 1.8-.7L10 3.6h4l.6 2.3a7.8 7.8 0 0 1 1.8.7l2.1-1.2 2.1 2.1-1.2 2.1c.3.6.6 1.2.7 1.8l2.3.6-2.3.6a7.8 7.8 0 0 1-.7 1.8Z" />
  </svg>
);

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  entries: PlantEntry[];
  totalEntriesCount: number;
  pendingEntriesCount: number;
  formState: FormState;
  onFormStateChange: React.Dispatch<React.SetStateAction<FormState>>;
  plantTypes: string[];
  onRegisterPlantType: (value: string) => void;
  onClearData: () => void;
  appsScriptUrl: string;
  onAppsScriptUrlChange: (url: string) => void;
  syncMode: SyncMode;
  onSyncModeChange: React.Dispatch<React.SetStateAction<SyncMode>>;
  storageStatus: BrowserStorageStatus | null;
  tabRequest: BottomSheetTabRequest | null;
  hcvInsightSelection: HcvInsightSelection | null;
  onSelectHealthInsight: (result: PlantHealthResult) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  gps: GpsLocation | null;
  onGpsUpdate: (gps: GpsLocation) => void;
  onSyncPending: (options?: { background?: boolean; force?: boolean }) => Promise<void>;
  isOnline: boolean;
  onBackupNow: () => void;
  isBackupRunning: boolean;
  autoBackupIntervalMinutes: AutoBackupIntervalMinutes;
  onAutoBackupIntervalChange: React.Dispatch<React.SetStateAction<AutoBackupIntervalMinutes>>;
}

const TabLoader = () => (
  <div className="flex flex-col gap-4 py-10 animate-pulse px-6">
    <div className="h-48 w-full bg-slate-100 rounded-[2.5rem]" />
    <div className="h-32 w-full bg-slate-100 rounded-[2rem]" />
  </div>
);

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  entries,
  totalEntriesCount,
  pendingEntriesCount,
  formState,
  onFormStateChange,
  plantTypes,
  onRegisterPlantType,
  onClearData,
  appsScriptUrl,
  onAppsScriptUrlChange,
  syncMode,
  onSyncModeChange,
  storageStatus,
  tabRequest,
  hcvInsightSelection,
  onSelectHealthInsight,
  onSyncPending,
  isOnline,
  onBackupNow,
  isBackupRunning,
  autoBackupIntervalMinutes,
  onAutoBackupIntervalChange,
}) => {
  const [activeTab, setActiveTab] = useState('form');

  useEffect(() => {
    if (!tabRequest) {
      return;
    }

    setActiveTab(tabRequest.tabId);
  }, [tabRequest]);

  return (
    <div 
      className={`fixed inset-0 z-40 transition-all duration-500 ease-in-out ${isOpen ? 'bg-black/70 backdrop-blur-sm opacity-100' : 'bg-transparent opacity-0 pointer-events-none'}`} 
      onClick={onClose}
    >
      <div
        className={`absolute bottom-0 left-0 right-0 h-[94vh] bg-white rounded-t-[50px] shadow-[0_-30px_60px_-15px_rgba(0,0,0,0.5)] transition-transform duration-500 cubic-bezier(0.32, 0.72, 0, 1) flex flex-col ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
        onClick={e => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="w-full py-5 flex items-center justify-center flex-shrink-0 group focus:outline-none"
        >
          <div className="h-1.5 w-14 bg-slate-200 rounded-full group-hover:bg-slate-300 transition-all" />
        </button>

        <div className="px-6 pb-6">
          <nav className="flex items-center bg-slate-100 p-1.5 rounded-[1.5rem] border border-slate-200 shadow-inner overflow-x-auto no-scrollbar">
            {[
              { id: 'form', label: 'Input', icon: <IconInput /> },
              { id: 'grafik', label: 'Analitik', icon: <IconAnalytics /> },
              { id: 'data', label: 'Histori', icon: <IconHistory /> },
              { id: 'hcv', label: 'HCV', icon: <IconLeaf /> },
              { id: 'help', label: 'Bantuan', icon: <IconHelp /> },
              { id: 'dashboard', label: 'Cloud', icon: <IconCloud /> },
              { id: 'pengaturan', label: 'Setelan', icon: <IconSettings /> }
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)} 
                className={`flex-1 min-w-[90px] py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  {tab.icon}
                  <span>{tab.label}</span>
                </span>
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-10 space-y-6">
          <Suspense fallback={<TabLoader />}>
            {activeTab === 'form' && (
              <FormTab
                formState={formState}
                onFormStateChange={onFormStateChange}
                plantTypes={plantTypes}
                onRegisterPlantType={onRegisterPlantType}
              />
            )}
            {activeTab === 'grafik' && (
              <AnalyticsTab
                entries={entries}
                appsScriptUrl={appsScriptUrl}
                isOnline={isOnline}
                onSelectHealthInsight={onSelectHealthInsight}
                onBackupNow={onBackupNow}
                isBackupRunning={isBackupRunning}
              />
            )}
            {activeTab === 'data' && <DataTab entries={entries} totalEntriesCount={totalEntriesCount} pendingCount={pendingEntriesCount} isOnline={isOnline} onSyncPending={onSyncPending} />}
            {activeTab === 'hcv' && <HcvTab entries={entries} totalEntriesCount={totalEntriesCount} selectedInsight={hcvInsightSelection} />}
            {activeTab === 'help' && <HelpTab />}
            {activeTab === 'dashboard' && <OnlineDashboardTab appsScriptUrl={appsScriptUrl} isOnline={isOnline} />}
            {activeTab === 'pengaturan' && (
              <SettingsTab
                appsScriptUrl={appsScriptUrl}
                onAppsScriptUrlChange={onAppsScriptUrlChange}
                syncMode={syncMode}
                onSyncModeChange={onSyncModeChange}
                storageStatus={storageStatus}
                onClearData={onClearData}
                autoBackupIntervalMinutes={autoBackupIntervalMinutes}
                onAutoBackupIntervalChange={onAutoBackupIntervalChange}
                onSpreadsheetBackupNow={onBackupNow}
                isSpreadsheetBackupRunning={isBackupRunning}
              />
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
};
