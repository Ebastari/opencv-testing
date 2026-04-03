# TODO Steps: Fix Google Apps Script DriveApp Access Denied & Unstuck Sync Queue

## 1. ✅ Fix Apps Script (Current Step)
**Goal**: Graceful error handling so metadata saves even if Drive fails.

**Changes**:
- Update `saveImageAndReturnUrl_()` with better try-catch + empty link fallback.
- Improved logging for permission/scope issues.

**After edit**:
```
1. Copy updated google_apps_script.gs
2. script.google.com → Paste → Save → Deploy new Web App version
3. Test POST with photo → Check Sheet (data saves?) + Exec logs
```

## 2. ⏳ Clear Stuck Sync Queue
```
Browser DevTools > Console:
import { retryFailedSyncItems } from './services/dbService.js';
retryFailedSyncItems().then(count => console.log(`${count} items retried`));
```

## 3. 🔧 Enable Drive API Scopes (Permanent Fix)
```
script.google.com → Project Settings → Scopes → Check:
✅ https://www.googleapis.com/auth/drive
Or: Deploy → New deployment → Authorize new scopes
```

## 4. 🧪 Test Full Flow
```
App: Add entry offline → Online → Watch SyncStatusIndicator
Expected: Green "Tersinkron" (0 pending)
```

## 5. 🚀 Deploy & Monitor
- Update app `REACT_APP_API_URL` if Web App URL changed
- Check Exec logs: script.google.com → Executions

**Progress**: ✅ Step 1 | [ ] Step 2 | [ ] Step 3 | [ ] Step 4 | [ ] Step 5

