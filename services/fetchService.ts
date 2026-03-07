
export interface CloudFetchResult {
  data: any[];
  source: 'network' | 'cache';
  cachedAt?: string;
  total?: number;
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
}

export interface CloudFetchOptions {
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
}

interface CloudCachePayload {
  updatedAt: string;
  data: any[];
}

const looksLikeSingleRowObject = (value: any): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);
  if (keys.length === 0) {
    return false;
  }

  const normalized = keys.map((k) => k.toLowerCase());
  return normalized.some((k) =>
    [
      'id',
      'tanggal',
      'lokasi',
      'koordinat',
      'x',
      'y',
      'tanaman',
      'tinggi',
      'kesehatan',
      'no pohon',
      'nopohon',
    ].includes(k),
  );
};

const extractDataArray = (result: any): any[] | null => {
  if (Array.isArray(result)) {
    return result;
  }

  if (typeof result === 'string') {
    const trimmed = result.trim();
    if (!trimmed) {
      return [];
    }
    try {
      return extractDataArray(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }

  if (!result || typeof result !== 'object') {
    return null;
  }

  const candidates = [
    result.data,
    result.values,
    result.rows,
    result.records,
    result.items,
    result.result,
    result.payload,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }

    if (typeof candidate === 'string') {
      try {
        const parsed = JSON.parse(candidate);
        const parsedRows = extractDataArray(parsed);
        if (parsedRows) {
          return parsedRows;
        }
      } catch {
        // Abaikan kandidat string yang bukan JSON.
      }
    }
  }

  if (looksLikeSingleRowObject(result)) {
    return [result];
  }

  return null;
};

const getCloudCacheKey = (url: string): string => `cloud_cache:${url.trim()}`;

const readCloudCache = (url: string): CloudCachePayload | null => {
  try {
    const raw = localStorage.getItem(getCloudCacheKey(url));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CloudCachePayload;
    if (!parsed || !Array.isArray(parsed.data)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeCloudCache = (url: string, data: any[]): void => {
  try {
    const payload: CloudCachePayload = {
      updatedAt: new Date().toISOString(),
      data,
    };
    localStorage.setItem(getCloudCacheKey(url), JSON.stringify(payload));
  } catch {
    // Abaikan jika storage penuh/tidak tersedia.
  }
};

const withQueryParams = (url: string, options?: CloudFetchOptions): string => {
  if (!options) {
    return url;
  }

  const safeUrl = url.trim();
  if (!safeUrl) {
    return safeUrl;
  }

  try {
    const parsed = new URL(safeUrl);
    if (options.limit && options.limit > 0) {
      parsed.searchParams.set('limit', String(options.limit));
    }
    if (options.offset && options.offset > 0) {
      parsed.searchParams.set('offset', String(options.offset));
    }
    if (options.order) {
      parsed.searchParams.set('order', options.order);
    }
    return parsed.toString();
  } catch {
    return safeUrl;
  }
};

export const fetchCloudDataSmart = async (url: string, options?: CloudFetchOptions): Promise<CloudFetchResult> => {
  // Jangan mencoba melakukan fetch jika URL masih berupa placeholder atau kosong.
  if (!url || url === '' || url.includes('/s/.../exec')) {
    const cached = readCloudCache(url || 'unknown');
    return {
      data: cached?.data || [],
      source: 'cache',
      cachedAt: cached?.updatedAt,
    };
  }

  try {
    const requestUrl = withQueryParams(url, options);
    const response = await fetch(requestUrl, {
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status}`);
    }

    const result = await response.json();
    const rows = extractDataArray(result);

    if (rows) {
      writeCloudCache(url, rows);
      return {
        data: rows,
        source: 'network',
        total: typeof result?.total === 'number' ? result.total : rows.length,
        limit: typeof result?.limit === 'number' ? result.limit : options?.limit,
        offset: typeof result?.offset === 'number' ? result.offset : options?.offset,
        order: result?.order === 'asc' ? 'asc' : 'desc',
      };
    }

    if (result && result.status === 'error') {
      throw new Error(result.message || 'Script mengembalikan error');
    }

    const preview =
      typeof result === 'string'
        ? result.slice(0, 120)
        : JSON.stringify(result).slice(0, 120);
    throw new Error(
      `Format respons cloud tidak dikenali. Gunakan array, data[], rows[], records[], atau items[]. Preview: ${preview}`,
    );
  } catch (error) {
    const cached = readCloudCache(url);
    if (cached) {
      return {
        data: cached.data,
        source: 'cache',
        cachedAt: cached.updatedAt,
      };
    }

    console.error('Fetch Cloud Data Error:', error);
    throw error;
  }
};

export const fetchCloudData = async (url: string): Promise<any[]> => {
  const result = await fetchCloudDataSmart(url);
  return result.data;
};
