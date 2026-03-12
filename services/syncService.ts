import { PlantEntry } from '../types';
import {
  addToSyncQueue,
  getPendingSyncItems,
  updateSyncQueueItem,
  clearCompletedSyncItems,
  refreshSyncCounts,
  updateEntryStatus,
  getSyncStatus,
  setOnlineStatus,
  onSyncStatusChange,
  type SyncStatus,
} from './dbService';
import { checkInternetConnection } from './networkService';

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || '';
const SYNC_INTERVAL_MS = 30000; // Check for sync every 30 seconds
const MAX_CONCURRENT_SYNCS = 3;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60000;

// Sync state
let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
let lastSyncAt: string | null = null;

// Network listener cleanup
let networkListenerCleanup: (() => void) | null = null;

/**
 * Calculate exponential backoff delay
 */
const getRetryDelay = (retryCount: number): number => {
  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
  return Math.min(delay, MAX_RETRY_DELAY_MS);
};

/**
 * Upload a single entry to the server
 */
const uploadEntryToServer = async (entry: PlantEntry): Promise<boolean> => {
  try {
    // Remove thumbnail from payload to reduce size (already has foto)
    const payload = { ...entry };
    delete payload.thumbnail;

    const response = await fetch(`${API_BASE_URL}/api/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return true;
    }

    // If response is not ok, throw error
    throw new Error(`Server returned ${response.status}`);
  } catch (error) {
    console.error('Failed to upload entry:', error);
    throw error;
  }
};

/**
 * Process a single sync queue item
 */
const processSyncItem = async (
  itemId: string,
  entryId: string,
  retryCount: number,
): Promise<boolean> => {
  // Mark as in progress
  await updateSyncQueueItem(itemId, {
    status: 'in_progress',
    lastAttemptAt: new Date().toISOString(),
  });

  await refreshSyncCounts();

  try {
    // Get the entry from the queue
    const items = await getPendingSyncItems();
    const item = items.find((i) => i.id === itemId);

    if (!item) {
      console.warn('Sync item not found:', itemId);
      return false;
    }

    const success = await uploadEntryToServer(item.payload);

    if (success) {
      // Mark as completed
      await updateSyncQueueItem(itemId, {
        status: 'completed',
      });

      // Update entry uploaded status
      await updateEntryStatus(entryId, true);

      return true;
    }

    throw new Error('Upload failed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const newRetryCount = retryCount + 1;

    // Check if should retry
    if (newRetryCount < 5) {
      await updateSyncQueueItem(itemId, {
        status: 'pending',
        retryCount: newRetryCount,
        lastError: errorMessage,
      });

      // Schedule retry with backoff
      const delay = getRetryDelay(newRetryCount);
      setTimeout(() => {
        triggerSync();
      }, delay);
    } else {
      // Max retries reached, mark as failed
      await updateSyncQueueItem(itemId, {
        status: 'failed',
        retryCount: newRetryCount,
        lastError: `Max retries reached: ${errorMessage}`,
      });
    }

    await refreshSyncCounts();
    return false;
  }
};

/**
 * Main sync function - processes pending items
 */
export const syncPendingEntries = async (): Promise<{
  success: number;
  failed: number;
  total: number;
}> => {
  if (isSyncing) {
    return { success: 0, failed: 0, total: 0 };
  }

  isSyncing = true;

  // Update sync status
  const status = getSyncStatus();
  onSyncStatusChange((s) => {
    s.isSyncing = true;
  });

  try {
    // Check network connection first
    const isOnline = await checkInternetConnection();
    setOnlineStatus(isOnline);

    if (!isOnline) {
      console.log('No network connection, skipping sync');
      return { success: 0, failed: 0, total: 0 };
    }

    const pendingItems = await getPendingSyncItems();

    if (pendingItems.length === 0) {
      lastSyncAt = new Date().toISOString();
      return { success: 0, failed: 0, total: 0 };
    }

    // Sort by created date (oldest first)
    pendingItems.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    // Process up to MAX_CONCURRENT_SYNCS items
    const itemsToProcess = pendingItems.slice(0, MAX_CONCURRENT_SYNCS);
    let successCount = 0;
    let failedCount = 0;

    const results = await Promise.allSettled(
      itemsToProcess.map((item) =>
        processSyncItem(item.id, item.entryId, item.retryCount),
      ),
    );

    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        successCount++;
      } else {
        failedCount++;
      }
    });

    // Clean up completed items
    await clearCompletedSyncItems();

    // Update last sync time
    lastSyncAt = new Date().toISOString();

    return {
      success: successCount,
      failed: failedCount,
      total: itemsToProcess.length,
    };
  } catch (error) {
    console.error('Sync error:', error);
    return { success: 0, failed: 0, total: 0 };
  } finally {
    isSyncing = false;
    await refreshSyncCounts();
  }
};

/**
 * Trigger a sync immediately
 */
export const triggerSync = async (): Promise<{
  success: number;
  failed: number;
  total: number;
}> => {
  return syncPendingEntries();
};

/**
 * Start automatic sync
 */
export const startAutoSync = (): void => {
  if (syncIntervalId) {
    return; // Already running
  }

  // Initial sync
  syncPendingEntries();

  // Set up interval
  syncIntervalId = setInterval(() => {
    syncPendingEntries();
  }, SYNC_INTERVAL_MS);

  // Set up network status listeners
  const handleOnline = () => {
    console.log('Network online - triggering sync');
    setOnlineStatus(true);
    syncPendingEntries();
  };

  const handleOffline = () => {
    console.log('Network offline');
    setOnlineStatus(false);
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  networkListenerCleanup = () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };

  console.log('Auto sync started');
};

/**
 * Stop automatic sync
 */
export const stopAutoSync = (): void => {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }

  if (networkListenerCleanup) {
    networkListenerCleanup();
    networkListenerCleanup = null;
  }

  console.log('Auto sync stopped');
};

/**
 * Get sync status
 */
export const getSyncState = (): {
  isSyncing: boolean;
  lastSyncAt: string | null;
} => {
  return {
    isSyncing,
    lastSyncAt,
  };
};

/**
 * Initialize sync system
 */
export const initSync = async (): Promise<void> => {
  // Check initial network status
  const isOnline = await checkInternetConnection();
  setOnlineStatus(isOnline);

  // Start auto sync
  startAutoSync();
};

/**
 * Subscribe to sync status changes
 */
export const subscribeToSyncStatus = (
  callback: (status: SyncStatus) => void,
): (() => void) => {
  return onSyncStatusChange(callback);
};
