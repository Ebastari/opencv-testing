# GAS Cloud Ecology Integration Plan

## Steps to Complete:

### 1. [✅] Create services/cloudService.ts
- ✅ Implement GAS API calls: getTreeList(), getEcologyAnalysis()
- ✅ Handle retry logic for large responses
- ☐ Add caching (next iteration)

### 2. [✅] Update types.ts
- Add `CloudTree`, `CloudEcologyMetrics` interfaces
- Extend existing types for cloud data compatibility

### 3. [✅] Update services/dbService.ts  
- ✅ Add cloud stores (cloud_trees, cloud_ecology)
- ✅ Export store constants, cloudDbService.ts with methods
- ✅ Hybrid mergeLocalCloudData()

### 4. [ ] Update components/AnalyticsTab.tsx
- Add local/cloud toggle switch
- Display GAS ecology metrics: density (/Ha), CCI, total biomass (Kg)
- Loading/error states for cloud data
- Compare local vs cloud metrics

### 5. [ ] Update services/syncService.ts
- Integrate with uploadService for GAS sync
- Bidirectional sync: local → GAS, GAS → local
- Conflict resolution for ecology data

## Follow-up Steps:
- Test GAS endpoints with real data (✅ Terminal shows working ?list)
- Verify AnalyticsTab displays cloud ecology correctly
- End-to-end sync test

