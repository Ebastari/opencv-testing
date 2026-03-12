import React, { useEffect, useState } from 'react';
import { subscribeToSyncStatus } from '../services/syncService';

interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  inProgressCount: number;
  failedCount: number;
  lastSyncAt: string | null;
  isSyncing: boolean;
}

interface SyncStatusIndicatorProps {
  compact?: boolean;
}

const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ compact = false }) => {
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: true,
    pendingCount: 0,
    inProgressCount: 0,
    failedCount: 0,
    lastSyncAt: null,
    isSyncing: false,
  });

  useEffect(() => {
    const unsubscribe = subscribeToSyncStatus((newStatus) => {
      setStatus(newStatus);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const formatLastSync = (dateStr: string | null): string => {
    if (!dateStr) return 'Belum pernah';

    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Baru saja';
    if (diffMins < 60) return `${diffMins} menit lalu`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} jam lalu`;

    return date.toLocaleDateString('id-ID');
  };

  const getStatusColor = (): string => {
    if (!status.isOnline) return '#ef4444'; // Red - offline
    if (status.isSyncing) return '#3b82f6'; // Blue - syncing
    if (status.failedCount > 0) return '#f59e0b'; // Amber - has failures
    if (status.pendingCount > 0) return '#eab308'; // Yellow - has pending
    return '#22c55e'; // Green - all synced
  };

  const getStatusText = (): string => {
    if (!status.isOnline) return 'Offline';
    if (status.isSyncing) return 'Menyinkronkan...';
    if (status.failedCount > 0) return `${status.failedCount} gagal`;
    if (status.pendingCount > 0) return `${status.pendingCount} menunggu`;
    return 'Tersinkron';
  };

  const getIcon = (): string => {
    if (!status.isOnline) return '○'; // Offline circle
    if (status.isSyncing) return '↻'; // Spinning sync arrows
    if (status.failedCount > 0) return '!'; // Warning
    if (status.pendingCount > 0) return '◔'; // Partial circle
    return '●'; // Full synced
  };

  if (compact) {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          borderRadius: '12px',
          backgroundColor: `${getStatusColor()}20`,
          color: getStatusColor(),
          fontSize: '12px',
          fontWeight: 500,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            animation: status.isSyncing ? 'spin 1s linear infinite' : 'none',
          }}
        >
          {getIcon()}
        </span>
        <span>{status.pendingCount + status.inProgressCount}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '8px',
        backgroundColor: '#1f2937',
        color: '#f3f4f6',
        fontSize: '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: getStatusColor(),
            animation: status.isSyncing ? 'pulse 1.5s ease-in-out infinite' : 'none',
          }}
        />
        <span style={{ fontWeight: 600 }}>{getStatusText()}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', color: '#9ca3af' }}>
        <div>
          <span style={{ color: '#6b7280' }}>Status: </span>
          {status.isOnline ? 'Online' : 'Offline'}
        </div>
        <div>
          <span style={{ color: '#6b7280' }}>Terakhir: </span>
          {formatLastSync(status.lastSyncAt)}
        </div>
        <div>
          <span style={{ color: '#6b7280' }}>Menunggu: </span>
          {status.pendingCount}
        </div>
        <div>
          <span style={{ color: '#6b7280' }}>Gagal: </span>
          <span style={{ color: status.failedCount > 0 ? '#f59e0b' : '#9ca3af' }}>
            {status.failedCount}
          </span>
        </div>
      </div>

      {status.isSyncing && (
        <div
          style={{
            marginTop: '8px',
            height: '4px',
            backgroundColor: '#374151',
            borderRadius: '2px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              backgroundColor: '#3b82f6',
              width: '60%',
              animation: 'progress 2s ease-in-out infinite',
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes progress {
          0% { width: 0%; margin-left: 0%; }
          50% { width: 60%; margin-left: 20%; }
          100% { width: 0%; margin-left: 100%; }
        }
      `}</style>
    </div>
  );
};

export default SyncStatusIndicator;
