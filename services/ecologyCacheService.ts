export interface CachedPhotoEcologyAnalysis {
  entryId: string;
  photoRef: string;
  ndvi: number;
  canopyCover: number;
  hsv: {
    hue: number;
    saturation: number;
    value: number;
    health: 'Sehat' | 'Merana' | 'Mati';
    confidence: number;
  };
  updatedAt: string;
}

const DB_NAME = 'MonitoringTanamanDB';
const DB_VERSION = 2;
const STORE_ENTRIES = 'entries';
const STORE_PHOTO_ANALYSIS = 'photo_analysis_cache';

const openDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db: IDBDatabase = event.target.result;

      // Jaga store lama agar kompatibel saat user upgrade dari versi lama.
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const store = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('uploaded', 'uploaded', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_PHOTO_ANALYSIS)) {
        const cacheStore = db.createObjectStore(STORE_PHOTO_ANALYSIS, { keyPath: 'entryId' });
        cacheStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = (event: any) => resolve(event.target.result);
    request.onerror = (event: any) => reject(event.target.error);
  });
};

export const getCachedPhotoEcologyAnalyses = async (
  entryIds: string[],
): Promise<CachedPhotoEcologyAnalysis[]> => {
  if (entryIds.length === 0) {
    return [];
  }

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PHOTO_ANALYSIS, 'readonly');
    const store = tx.objectStore(STORE_PHOTO_ANALYSIS);
    const results: CachedPhotoEcologyAnalysis[] = [];

    let pending = entryIds.length;
    entryIds.forEach((entryId) => {
      const req = store.get(entryId);
      req.onsuccess = () => {
        if (req.result) {
          results.push(req.result as CachedPhotoEcologyAnalysis);
        }
        pending -= 1;
        if (pending === 0) {
          resolve(results);
        }
      };
      req.onerror = () => {
        pending -= 1;
        if (pending === 0) {
          resolve(results);
        }
      };
    });

    tx.onerror = () => reject(tx.error);
  });
};

export const upsertCachedPhotoEcologyAnalysis = async (
  item: CachedPhotoEcologyAnalysis,
): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PHOTO_ANALYSIS, 'readwrite');
    const store = tx.objectStore(STORE_PHOTO_ANALYSIS);
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export const bulkUpsertCachedPhotoEcologyAnalyses = async (
  items: CachedPhotoEcologyAnalysis[],
): Promise<void> => {
  if (items.length === 0) {
    return;
  }

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PHOTO_ANALYSIS, 'readwrite');
    const store = tx.objectStore(STORE_PHOTO_ANALYSIS);

    items.forEach((item) => {
      store.put(item);
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};
