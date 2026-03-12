const DEFAULT_TIMEOUT_MS = 3500;

// Network quality enum
type NetworkQuality = 'unknown' | 'offline' | 'poor' | 'fair' | 'good' | 'excellent';

// Network state interface
interface NetworkState {
  isOnline: boolean;
  isSlow: boolean;
  quality: NetworkQuality;
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
  downlink?: number;
  rtt?: number;
}

// Listeners for network state changes
const networkListeners: Set<(state: NetworkState) => void> = new Set();

// Current network state
let currentNetworkState: NetworkState = {
  isOnline: true,
  isSlow: false,
  quality: 'unknown',
};

// Update network state and notify listeners
const updateNetworkState = (partial: Partial<NetworkState>) => {
  currentNetworkState = { ...currentNetworkState, ...partial };
  networkListeners.forEach((listener) => listener(currentNetworkState));
};

// Initialize network information API listener
const initNetworkInformation = () => {
  if ('connection' in navigator) {
    const connection = (navigator as any).connection;

    const handleChange = () => {
      const effectiveType = connection.effectiveType;
      const downlink = connection.downlink;
      const rtt = connection.rtt;

      // Determine quality based on connection metrics
      let quality: NetworkQuality = 'good';
      let isSlow = false;

      if (effectiveType === 'slow-2g' || effectiveType === '2g') {
        quality = 'poor';
        isSlow = true;
      } else if (effectiveType === '3g') {
        quality = 'fair';
        isSlow = true;
      } else if (downlink < 1) {
        quality = 'poor';
        isSlow = true;
      } else if (downlink < 5) {
        quality = 'fair';
      } else if (downlink < 10) {
        quality = 'good';
      } else {
        quality = 'excellent';
      }

      updateNetworkState({
        effectiveType,
        downlink,
        rtt,
        quality,
        isSlow,
        isOnline: connection.type !== 'none',
      });
    };

    connection.addEventListener('change', handleChange);
    handleChange(); // Initial state
  }
};

// Initialize browser online/offline listeners
const initBrowserListeners = () => {
  window.addEventListener('online', () => {
    updateNetworkState({ isOnline: true });
    // Re-check connection quality
    checkInternetConnection();
  });

  window.addEventListener('offline', () => {
    updateNetworkState({ isOnline: false, quality: 'offline' });
  });
};

// Initialize on module load
if (typeof window !== 'undefined') {
  initNetworkInformation();
  initBrowserListeners();
}

const withTimeout = async (promise: Promise<Response>, timeoutMs: number): Promise<Response> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Network probe timeout'));
    }, timeoutMs);

    promise
      .then((response) => {
        clearTimeout(timeout);
        resolve(response);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
};

const probe = async (url: string, noCors = false): Promise<boolean> => {
  try {
    const response = await withTimeout(
      fetch(url, {
        method: 'GET',
        cache: 'no-store',
        mode: noCors ? 'no-cors' : 'cors',
      }),
      DEFAULT_TIMEOUT_MS,
    );

    // Opaque response pada no-cors tetap menandakan jaringan dapat menjangkau target.
    if (response.type === 'opaque') {
      return true;
    }

    return response.ok;
  } catch {
    return false;
  }
};

export const checkInternetConnection = async (preferredUrl?: string): Promise<boolean> => {
  // Jika browser menyatakan offline, tetap coba satu probe ringan untuk menangani false negative.
  const checks: Array<{ url: string; noCors: boolean }> = [];

  if (preferredUrl && /^https?:\/\//i.test(preferredUrl)) {
    checks.push({ url: preferredUrl, noCors: true });
  }

  checks.push({ url: 'https://www.gstatic.com/generate_204', noCors: true });
  checks.push({ url: 'https://www.google.com/generate_204', noCors: true });

  for (const item of checks) {
    const ok = await probe(item.url, item.noCors);
    if (ok) {
      return true;
    }
  }

  // Fallback agar tidak terlalu ketat pada jaringan yang memblokir endpoint probe tertentu.
  return navigator.onLine;
};

/**
 * Get current network state
 */
export const getNetworkState = (): NetworkState => {
  return currentNetworkState;
};

/**
 * Subscribe to network state changes
 */
export const onNetworkStateChange = (callback: (state: NetworkState) => void): (() => void) => {
  networkListeners.add(callback);
  // Immediately call with current state
  callback(currentNetworkState);
  // Return unsubscribe function
  return () => {
    networkListeners.delete(callback);
  };
};

/**
 * Check if we have a good connection for data sync
 */
export const isGoodForSync = async (): Promise<boolean> => {
  // Must be online
  if (!currentNetworkState.isOnline) {
    return false;
  }

  // Check actual connection with a probe
  const hasConnection = await checkInternetConnection();
  if (!hasConnection) {
    return false;
  }

  // If connection is poor or offline, don't sync large data
  if (currentNetworkState.quality === 'poor' || currentNetworkState.quality === 'offline') {
    return false;
  }

  return true;
};
