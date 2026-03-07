
import React, { useState, useEffect, useMemo } from 'react';
import { PlantEntry } from '../types';
import { AnalyticsPanel } from './AnalyticsPanel';
import { fetchCloudDataSmart } from '../services/fetchService';

interface AnalyticsTabProps {
  entries: PlantEntry[];
  appsScriptUrl: string;
  isOnline: boolean;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ entries, appsScriptUrl, isOnline }) => {
  const [cloudData, setCloudData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cloudSource, setCloudSource] = useState<'network' | 'cache'>('network');
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const loadCloudData = async () => {
    if (!appsScriptUrl || appsScriptUrl.includes('/s/.../exec')) return;

    setLoading(true);
    try {
      const result = await fetchCloudDataSmart(appsScriptUrl);
      setCloudData(Array.isArray(result.data) ? result.data : []);
      setCloudSource(result.source);
      setCachedAt(result.cachedAt || null);
    } catch (err) {
      console.error("Gagal sinkronisasi analitik cloud:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCloudData();
  }, [appsScriptUrl, isOnline]);

  const parseNumber = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    const raw = String(value ?? '').trim();
    if (!raw) {
      return 0;
    }

    const normalized = raw.replace(',', '.').replace(/[^0-9.\-]+/g, '');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const pickField = (row: Record<string, any>, keys: string[]): unknown => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
        return row[key];
      }
    }
    return undefined;
  };

  const parseCoordinatePair = (value: unknown): { lat: number; lon: number } | null => {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return null;
    }

    // Pola utama: "lat,lon" atau "lat;lon"
    const separator = raw.includes(';') ? ';' : ',';
    const split = raw.split(separator).map((part) => part.trim());
    if (split.length >= 2) {
      const first = parseNumber(split[0]);
      const second = parseNumber(split[1]);
      if (Number.isFinite(first) && Number.isFinite(second)) {
        return { lat: first, lon: second };
      }
    }

    // Fallback: ekstrak dua angka pertama dari string bebas.
    const nums = raw.match(/-?\d+(?:[.,]\d+)?/g);
    if (nums && nums.length >= 2) {
      const first = parseNumber(nums[0]);
      const second = parseNumber(nums[1]);
      if (Number.isFinite(first) && Number.isFinite(second)) {
        return { lat: first, lon: second };
      }
    }

    return null;
  };

  const normalizeHealth = (value: unknown): PlantEntry['kesehatan'] => {
    const raw = String(value ?? '').trim().toLowerCase();

    if (raw.includes('baik') || raw === 'sehat' || raw.includes('level 4')) {
      return 'Sehat';
    }
    if (raw.includes('merana') || raw.includes('level 2')) {
      return 'Merana';
    }
    if (raw.includes('mati') || raw.includes('level 1')) {
      return 'Mati';
    }

    return 'Sehat';
  };

  // Gabungkan data lokal dan cloud, hindari duplikat berdasarkan ID
  const mergedData = useMemo(() => {
    const map = new Map();
    
    // Masukkan data cloud dulu
    cloudData.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;

      const row = item as Record<string, any>;
      const idValue = pickField(row, ['ID', 'Id', 'id']);
      const rowId = String(idValue ?? `cloud-${index}`);

      // Parsing Koordinat dengan aman (menangani jika data sudah berupa number dari Apps Script)
      let lat = 0;
      let lon = 0;
      let hasGps = false;

      const xValue = pickField(row, ['X', 'x', 'Lat', 'Latitude', 'latitude']);
      const yValue = pickField(row, ['Y', 'y', 'Lon', 'Longitude', 'longitude']);

      if (xValue !== undefined && yValue !== undefined) {
        lat = parseNumber(xValue);
        lon = parseNumber(yValue);
        if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
          hasGps = true;
        }
      }

      if (!hasGps) {
        const koordinatRaw = pickField(row, ['Koordinat', 'koordinat', 'Lokasi', 'lokasi']);
        const parsedPair = parseCoordinatePair(koordinatRaw);
        if (parsedPair && (parsedPair.lat !== 0 || parsedPair.lon !== 0)) {
          lat = parsedPair.lat;
          lon = parsedPair.lon;
          hasGps = true;
        }
      }

      const gpsAccuracy = parseNumber(
        pickField(row, ['GPS_Accuracy_M', 'GPS Accuracy', 'Akurasi', 'Accuracy']),
      );

      const entry: Partial<PlantEntry> = {
        id: rowId,
        noPohon: parseInt(String(pickField(row, ['No Pohon', 'noPohon', 'NoPohon']) ?? 0), 10) || 0,
        tanaman: String(pickField(row, ['Tanaman', 'tanaman', 'Jenis']) ?? 'Unknown'),
        tinggi: parseNumber(pickField(row, ['Tinggi', 'tinggi', 'Height'])),
        kesehatan: normalizeHealth(pickField(row, ['Kesehatan', 'kesehatan', 'Health'])),
        pengawas: String(pickField(row, ['Pengawas', 'pengawas', 'Supervisor']) ?? 'N/A'),
        tanggal: String(pickField(row, ['Tanggal', 'tanggal', 'CreatedAt']) ?? '-'),
        foto: String(pickField(row, ['Link Drive', 'LinkDrive', 'Foto', 'foto', 'Image']) ?? ''),
        gps: hasGps ? { lat, lon, accuracy: gpsAccuracy > 0 ? gpsAccuracy : 0 } : undefined
      };
      map.set(rowId, entry);
    });

    // Masukkan/Timpa dengan data lokal (lebih fresh)
    entries.forEach(entry => {
      map.set(String(entry.id), entry);
    });

    return Array.from(map.values()) as PlantEntry[];
  }, [cloudData, entries]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-2">
          {loading && <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            {loading ? 'Menyinkronkan Cloud...' : `Total Terdeteksi: ${mergedData.length} Titik`}
          </span>
          {!loading && cloudSource === 'cache' && (
            <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-2 py-1 rounded-full">
              CACHE OFFLINE
            </span>
          )}
        </div>
        <button 
          onClick={loadCloudData}
          className="text-[9px] font-black text-blue-600 uppercase tracking-tighter bg-blue-50 px-3 py-1 rounded-full active:scale-95 transition-all"
        >
          Refresh Data
        </button>
      </div>

      {!loading && cloudSource === 'cache' && cachedAt && (
        <div className="px-1">
          <p className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            Menampilkan cache cloud terakhir ({new Date(cachedAt).toLocaleString('id-ID')}).
          </p>
        </div>
      )}
      
      <AnalyticsPanel entries={mergedData} />
    </div>
  );
};
