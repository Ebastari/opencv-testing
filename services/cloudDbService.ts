import { CloudTree, CloudEcologyMetrics, PlantEntry } from '../types';
import { initDB, CLOUD_TREES_STORE, CLOUD_ECOLOGY_STORE, getAllEntries } from './dbService';

export const saveCloudTrees = async (trees: CloudTree[]): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CLOUD_TREES_STORE, 'readwrite');
    const store = transaction.objectStore(CLOUD_TREES_STORE);
    
    trees.forEach(tree => store.put(tree));
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getAllCloudTrees = async (): Promise<CloudTree[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CLOUD_TREES_STORE, 'readonly');
    const store = transaction.objectStore(CLOUD_TREES_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as CloudTree[]);
    request.onerror = () => reject(request.error);
  });
};

export const saveCloudEcology = async (metrics: CloudEcologyMetrics[]): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CLOUD_ECOLOGY_STORE, 'readwrite');
    const store = transaction.objectStore(CLOUD_ECOLOGY_STORE);
    
    metrics.forEach(metric => store.put(metric));
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getAllCloudEcology = async (): Promise<CloudEcologyMetrics[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CLOUD_ECOLOGY_STORE, 'readonly');
    const store = transaction.objectStore(CLOUD_ECOLOGY_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as CloudEcologyMetrics[]);
    request.onerror = () => reject(request.error);
  });
};

export const getCloudEcologyByTreeId = async (treeId: string): Promise<CloudEcologyMetrics | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CLOUD_ECOLOGY_STORE, 'readonly');
    const store = transaction.objectStore(CLOUD_ECOLOGY_STORE);
    const request = store.get(treeId);

    request.onsuccess = () => resolve((request.result as CloudEcologyMetrics | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
};

export const mergeLocalCloudData = async (): Promise<{
  localTrees: number;
  cloudTrees: number;
  mergedTrees: number;
}> => {
  const localTrees = await getAllEntries(); // from main dbService
  const cloudTrees = await getAllCloudTrees();
  
  // Merge logic: prefer cloud data if exists, fallback to local
  const merged = cloudTrees.map((cloudTree: CloudTree) => {
    const localMatch = localTrees.find((local: PlantEntry) => local.id === cloudTree.cloudId || local.id === cloudTree.id);
    return localMatch ? { ...cloudTree, ...localMatch } : cloudTree;
  }).concat(localTrees.filter((local: PlantEntry) => !cloudTrees.some((cloud: CloudTree) => cloud.cloudId === local.id || cloud.id === local.id)));

  // Save merged to local store (hybrid approach)
  // Implementation depends on final data flow
  
  return {
    localTrees: localTrees.length,
    cloudTrees: cloudTrees.length,
    mergedTrees: merged.length
  };
};

