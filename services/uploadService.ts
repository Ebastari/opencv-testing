
import { PlantEntry } from '../types';

export interface UploadResult {
  ok: boolean;
  confirmed: boolean;
  message: string;
}

const isLikelyAppsScriptUrl = (url: string): boolean => {
  const clean = url.trim();
  return /^https:\/\/script\.google\.com\//i.test(clean) && /\/exec(?:[/?#].*)?$/i.test(clean);
};

const normalizeUrl = (url: string): string => url.trim();

export const uploadToAppsScript = async (url: string, entry: PlantEntry): Promise<UploadResult> => {
  const cleanUrl = normalizeUrl(url);
  if (!cleanUrl) {
    return {
      ok: false,
      confirmed: false,
      message: 'URL Apps Script kosong.',
    };
  }

  if (!isLikelyAppsScriptUrl(cleanUrl)) {
    return {
      ok: false,
      confirmed: false,
      message: 'URL Apps Script tidak valid. Gunakan URL Web App script.google.com dengan endpoint /exec.',
    };
  }

  // Mengonversi titik ke koma untuk koordinat X dan Y sesuai format laporan di snippet
  const formatCoord = (num: number) => (Number.isFinite(num) ? num.toString().replace('.', ',') : '');

  const buildCoordText = (lat: number, lon: number): string => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return '';
    }
    return `${lat.toFixed(6)},${lon.toFixed(6)}`;
  };

  const safeX = Number.isFinite(entry.x) ? entry.x : NaN;
  const safeY = Number.isFinite(entry.y) ? entry.y : NaN;
  const safeCoordText = buildCoordText(safeX, safeY);

  // Teks path yang akan digunakan sebagai nama file di Drive dan referensi di Sheet
  const pathName = `Montana V2_Images/Gambar Montana (${entry.id}).jpg`;
  
  const rawBase64 = (() => {
    if (!entry.foto) {
      return '';
    }
    if (!entry.foto.includes(',')) {
      return entry.foto;
    }
    const parts = entry.foto.split(',');
    return parts.length > 1 ? parts[1] : '';
  })();

  /**
   * Payload diperkecil agar upload foto real tidak mudah melewati batas ukuran Apps Script.
   * Script server V5 sudah mendukung RawBase64 sebagai sumber utama file gambar.
   */
  const payload = {
    "ID": entry.id,
    "Tanggal": entry.tanggal,
    "Lokasi": entry.lokasi?.includes('NaN') ? safeCoordText : entry.lokasi,
    "Pekerjaan": entry.pekerjaan || "",
    "Tinggi": entry.tinggi,
    "Koordinat": entry.koordinat?.includes('NaN') ? safeCoordText : entry.koordinat,
    "Y": formatCoord(safeY), // Longitude
    "X": formatCoord(safeX), // Latitude
    "Tanaman": entry.tanaman,
    "Tahun Tanam": entry.tahunTanam,
    "Pengawas": entry.pengawas,
    "Vendor": entry.vendor,
    // Fallback data URL tetap ada untuk kompatibilitas script lama, tetapi tidak wajib.
    "Gambar": '',
    "Gambar_Nama_File": pathName, // PATH UNTUK DRIVE
    "Description": entry.description || "",
    "Link Drive": entry.linkDrive || "",
    "Status_Duplikat": entry.statusDuplikat || "UNIK",
    "Status_Verifikasi": entry.statusVerifikasi || "",
    "No Pohon": entry.noPohon,
    "Kesehatan": entry.kesehatan,
    "GPS_Quality": entry.gpsQualityAtCapture || 'Tidak Tersedia',
    "GPS_Accuracy_M": Number.isFinite(entry.gpsAccuracyAtCapture) ? Number(entry.gpsAccuracyAtCapture).toFixed(1) : '',
    "Base64": rawBase64,
    "RawBase64": rawBase64
  };

  // 1) Coba kirim dengan CORS agar status sukses/error bisa diverifikasi dari JSON Apps Script.
  try {
    const corsResponse = await fetch(cleanUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    if (!corsResponse.ok) {
      return {
        ok: false,
        confirmed: true,
        message: `HTTP ${corsResponse.status} saat sinkronisasi.`,
      };
    }

    let result: any = null;
    try {
      result = await corsResponse.json();
    } catch {
      return {
        ok: true,
        confirmed: true,
        message: 'Upload berhasil, tetapi respons JSON tidak terbaca.',
      };
    }

    if (result && result.status === 'error') {
      return {
        ok: false,
        confirmed: true,
        message: result.message || 'Apps Script mengembalikan status error.',
      };
    }

    return {
      ok: true,
      confirmed: true,
      message: result?.message || 'Upload berhasil.',
    };
  } catch {
    // 2) Fallback no-cors untuk deployment Apps Script yang tidak membuka CORS.
    // Pada mode ini respons tidak bisa dibaca, jadi dianggap terkirim namun tidak terverifikasi.
    try {
      await fetch(cleanUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
      });

      return {
        ok: true,
        confirmed: false,
        message: 'Permintaan terkirim (no-cors), hasil tidak bisa diverifikasi otomatis.',
      };
    } catch (error) {
      return {
        ok: false,
        confirmed: false,
        message:
          error instanceof Error ? error.message : 'Gagal mengirim data ke Apps Script.',
      };
    }
  }
};
