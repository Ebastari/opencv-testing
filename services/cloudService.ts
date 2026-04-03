import { PlantEntry, EcologyMetrics, CloudTree, CloudEcologyMetrics } from '../types';

const GAS_URL = 'https://script.google.com/macros/s/AKfycbym0oMDXPNNWn9lKcM7_uC97Dgsu9a8CgnxW849AOeg8wyio7BYU9FBy0gJEveovUaO8g/exec';


class CloudService {
  private fetchWithRetry = async (url: string, maxRetries = 3): Promise<Response> => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response;
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
    throw new Error('Max retries exceeded');
  };

  async getTreeList(): Promise<CloudTree[]> {
    try {
      const response = await this.fetchWithRetry(`${GAS_URL}?action=list`);
      const trees: PlantEntry[] = await response.json();
      console.log(`Fetched ${trees.length} trees from GAS`);
      return trees.map((tree) => ({
        ...tree,
        cloudId: tree.id,
        syncedAt: new Date().toISOString()
      })) as CloudTree[];
    } catch (error) {
      console.error('Failed to fetch tree list:', error);
      throw error;
    }
  }

  async getEcologyAnalysis(treeIds: string[]): Promise<CloudEcologyMetrics[]> {
    try {
      const params = new URLSearchParams({
        action: 'analysis_ecology',
        treeIds: treeIds.join(',')
      });
      const response = await this.fetchWithRetry(`${GAS_URL}?${params}`);
      const metrics = await response.json();
      console.log(`Fetched ecology for ${treeIds.length} trees from GAS`);
      return metrics.map((metric: any) => ({
        ...metric,
        source: 'cloud' as const,
        analysisDate: new Date().toISOString()
      })) as CloudEcologyMetrics[];
    } catch (error) {
      console.error('Failed to fetch ecology analysis:', error);
      throw error;
    }
  }

  async syncTreesToGAS(trees: PlantEntry[]): Promise<void> {
    // Implementation for uploading local trees to GAS (bidirectional sync)
    // Uses existing uploadService pattern
    throw new Error('Upload sync not implemented yet');
  }
}

export const cloudService = new CloudService();

