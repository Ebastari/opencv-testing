
import { PlantEntry, CloudTree, CloudEcologyMetrics } from '../types';

const DB_NAME = 'MonitoringTanamanDB';
const DB_VERSION = 4; // Bumped for cloud stores
const STORE_NAME = 'entries';
const PHOTO_ANALYSIS_STORE = 'photo_analysis_cache';
const SYNC_QUEUE_STORE = 'sync_queue';
export const CLOUD_TREES_STORE = 'cloud_trees';
export const CLOUD_ECOLOGY_STORE = 'cloud_ecology';

// Sync queue item interface for offline sync management
interface SyncQueueItem {
  id: string;
  entryId: string;
  action: 'create' | 'update' | 'delete';
  payload: PlantEntry;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  lastAttemptAt?: string;
  lastError?: string;
  status: 'pending' | 'in_progress' | 'failed' | 'completed';
}

// Sync status interface - exported for use in other modules
export interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  inProgressCount: number;
  failedCount: number;
  lastSyncAt: string | null;
  isSyncing: boolean;
}

interface EntryStats {
  total: number;
  pending: number;
}

// In-memory sync status (for real-time UI updates)
let syncStatusCallback: ((status: SyncStatus) => void) | null = null;
let currentSyncStatus: SyncStatus = {
  isOnline: true,
  pendingCount: 0,
  inProgressCount: 0,
  failedCount: 0,
  lastSyncAt: null,
  isSyncing: false,
};

export const onSyncStatusChange = (callback: (status: SyncStatus) => void) => {
  syncStatusCallback = callback;
  callback(currentSyncStatus);
  return () => {
    syncStatusCallback = null;
  };
};

const updateSyncStatus = (partial: Partial<SyncStatus>) => {
  currentSyncStatus = { ...currentSyncStatus, ...partial };
  if (syncStatusCallback) {
    syncStatusCallback(currentSyncStatus);
  }
};

const toPreviewEntry = (entry: PlantEntry): PlantEntry => {
  if (!entry.thumbnail) {
    return entry;
  }

  return {
    ...entry,
    foto: entry.thumbnail,
  };
};

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('uploaded', 'uploaded', { unique: false });
      }

      // Siapkan store cache analisis citra untuk modul ekologi.
      if (!db.objectStoreNames.contains(PHOTO_ANALYSIS_STORE)) {
        const cacheStore = db.createObjectStore(PHOTO_ANALYSIS_STORE, { keyPath: 'entryId' });
        cacheStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Create sync queue store for offline sync management
      if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        const syncStore = db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: 'id' });
        syncStore.createIndex('status', 'status', { unique: false });
        syncStore.createIndex('entryId', 'entryId', { unique: false });
        syncStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Cloud/GAS data stores
      if (!db.objectStoreNames.contains(CLOUD_TREES_STORE)) {
        const store = db.createObjectStore(CLOUD_TREES_STORE, { keyPath: 'cloudId' });
        store.createIndex('syncedAt', 'syncedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(CLOUD_ECOLOGY_STORE)) {
        const store = db.createObjectStore(CLOUD_ECOLOGY_STORE, { keyPath: 'treeId' });
        store.createIndex('analysis_timestamp', 'analysis_timestamp', { unique: false });
      }
    };

    request.onsuccess = (event: any) => resolve(event.target.result);
    request.onerror = (event: any) => reject(event.target.error);
  });
};

export const saveEntry = async (entry: PlantEntry): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getAllEntries = async (): Promise<PlantEntry[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getRecentEntries = async (limit = 60): Promise<PlantEntry[]> => {
  const safeLimit = Math.max(1, Math.floor(limit));
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev');
    const entries: PlantEntry[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || entries.length >= safeLimit) {
        resolve(entries);
        return;
      }

      entries.push(cursor.value as PlantEntry);
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
  });
};

export const getRecentEntriesPreview = async (limit = 60): Promise<PlantEntry[]> => {
  const entries = await getRecentEntries(limit);
  return entries.map(toPreviewEntry);
};

export const getEntryById = async (id: string): Promise<PlantEntry | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve((request.result as PlantEntry | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
};

export const getPendingEntries = async (): Promise<PlantEntry[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    const pending: PlantEntry[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(pending);
        return;
      }

      const entry = cursor.value as PlantEntry;
      if (!entry.uploaded) {
        pending.push(entry);
      }
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
  });
};

export const getEntryStats = async (): Promise<EntryStats> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    let total = 0;
    let pending = 0;

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve({ total, pending });
        return;
      }

      total += 1;
      const entry = cursor.value as PlantEntry;
      if (!entry.uploaded) {
        pending += 1;
      }
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
  });
};

export const updateEntryStatus = async (id: string, uploaded: boolean): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const data = getRequest.result;
      if (data) {
        data.uploaded = uploaded;
        store.put(data);
      }
      resolve();
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
};

export const updateEntrySyncMeta = async (
  id: string,
  patch: { retryCount?: number; lastSyncAttemptAt?: string; lastSyncError?: string; uploaded?: boolean },
): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const data = getRequest.result;
      if (data) {
        const next = {
          ...data,
          ...patch,
        };
        store.put(next);
      }
      resolve();
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
};

export const clearAllEntries = async (): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// ============================================
// SYNC QUEUE OPERATIONS
// ============================================

/**
 * Add an entry to the sync queue for later synchronization
 */
export const addToSyncQueue = async (
  entry: PlantEntry,
  action: 'create' | 'update' | 'delete' = 'create',
): Promise<void> => {
  const db = await initDB();
  const queueItem: SyncQueueItem = {
    id: `${entry.id}_${action}_${Date.now()}`,
    entryId: entry.id,
    action,
    payload: entry,
    retryCount: 0,
    maxRetries: 5,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const request = store.put(queueItem);

    request.onsuccess = async () => {
      await refreshSyncCounts();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get all pending sync queue items
 */
export const getPendingSyncItems = async (): Promise<SyncQueueItem[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, 'readonly');
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const index = store.index('status');
    const request = index.getAll(['pending', 'failed']);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get sync queue item by ID
 */
export const getSyncQueueItem = async (id: string): Promise<SyncQueueItem | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, 'readonly');
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const request = store.get(id);

    request.onsuccess = () => resolve((request.result as SyncQueueItem | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Update sync queue item status
 */
export const updateSyncQueueItem = async (
  id: string,
  updates: Partial<SyncQueueItem>,
): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const data = getRequest.result;
      if (data) {
        store.put({ ...data, ...updates });
      }
      resolve();
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
};

/**
 * Remove completed sync queue items
 */
export const clearCompletedSyncItems = async (): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const index = store.index('status');
    const request = index.openCursor('completed');

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    transaction.oncomplete = async () => {
      await refreshSyncCounts();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
};

/**
 * Get current sync status counts
 */
export const getSyncCounts = async (): Promise<{ pending: number; inProgress: number; failed: number }> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, 'readonly');
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = request.result as SyncQueueItem[];
      const pending = items.filter((i) => i.status === 'pending').length;
      const inProgress = items.filter((i) => i.status === 'in_progress').length;
      const failed = items.filter((i) => i.status === 'failed').length;
      resolve({ pending, inProgress, failed });
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Refresh sync status counts and notify listeners
 */
export const refreshSyncCounts = async (): Promise<void> => {
  const counts = await getSyncCounts();
  updateSyncStatus({
    pendingCount: counts.pending,
    inProgressCount: counts.inProgress,
    failedCount: counts.failed,
  });
};

/**
 * Set online status
 */
export const setOnlineStatus = (isOnline: boolean): void => {
  updateSyncStatus({ isOnline });
};

/**
 * Get current sync status
 */
export const getSyncStatus = (): SyncStatus => {
  return currentSyncStatus;
};

/**
 * Save entry with automatic sync queue addition when offline
 */
export const saveEntryWithSync = async (
  entry: PlantEntry,
  isOnline: boolean = true,
): Promise<void> => {
  // Always save to local DB first
  await saveEntry(entry);

  if (isOnline) {
    // If online, mark as uploaded (will be synced immediately)
    await updateEntryStatus(entry.id, true);
  } else {
    // If offline, add to sync queue
    await addToSyncQueue(entry, 'create');
    await updateEntryStatus(entry.id, false);
  }
};

/**
 * Retry failed sync items (for manual retry)
 */
export const retryFailedSyncItems = async (): Promise<number> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const index = store.index('status');
    const request = index.getAll(['failed']);

    let retryCount = 0;
    request.onsuccess = () => {
      const items = request.result as SyncQueueItem[];
      items.forEach((item) => {
        item.status = 'pending';
        item.retryCount = 0;
        item.lastError = undefined;
        store.put(item);
        retryCount++;
      });
    };

    transaction.oncomplete = async () => {
      await refreshSyncCounts();
      resolve(retryCount);
    };
    transaction.onerror = () => reject(transaction.error);
  });
};
