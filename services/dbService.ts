
import { PlantEntry } from '../types';

const DB_NAME = 'MonitoringTanamanDB';
const DB_VERSION = 2;
const STORE_NAME = 'entries';
const PHOTO_ANALYSIS_STORE = 'photo_analysis_cache';

interface EntryStats {
  total: number;
  pending: number;
}

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
