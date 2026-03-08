
import React, { useState, Suspense, lazy } from 'react';
import { PlantEntry, GpsLocation, FormState } from '../types';
import { FormTab } from './FormTab';
import { DataTab } from './DataTab';

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
  onClearData: () => void;
  appsScriptUrl: string;
  onAppsScriptUrlChange: (url: string) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  gps: GpsLocation | null;
  onGpsUpdate: (gps: GpsLocation) => void;
  onSyncPending: () => Promise<void>;
  isOnline: boolean;
}

const TabLoader = () => (
  <div className="flex flex-col gap-4 py-10 animate-pulse px-6">
    <div className="h-48 w-full bg-slate-100 rounded-[2.5rem]" />
    <div className="h-32 w-full bg-slate-100 rounded-[2rem]" />
  </div>
);

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen, onClose, entries, totalEntriesCount, pendingEntriesCount, formState, onFormStateChange, onClearData, appsScriptUrl, onAppsScriptUrlChange, onSyncPending, isOnline
}) => {
  const [activeTab, setActiveTab] = useState('form');

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
            {activeTab === 'form' && <FormTab formState={formState} onFormStateChange={onFormStateChange} />}
            {activeTab === 'grafik' && <AnalyticsTab entries={entries} appsScriptUrl={appsScriptUrl} isOnline={isOnline} />}
            {activeTab === 'data' && <DataTab entries={entries} totalEntriesCount={totalEntriesCount} pendingCount={pendingEntriesCount} isOnline={isOnline} onSyncPending={onSyncPending} />}
            {activeTab === 'dashboard' && <OnlineDashboardTab appsScriptUrl={appsScriptUrl} isOnline={isOnline} />}
            {activeTab === 'pengaturan' && <SettingsTab appsScriptUrl={appsScriptUrl} onAppsScriptUrlChange={onAppsScriptUrlChange} onClearData={onClearData} />}
          </Suspense>
        </div>
      </div>
    </div>
  );
};
