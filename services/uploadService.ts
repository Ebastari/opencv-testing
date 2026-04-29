
import { PlantEntry } from '../types';

export interface UploadResult {
  ok: boolean;
  confirmed: boolean;
  message: string;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isLikelyAppsScriptUrl = (url: string): boolean => {
  const clean = url.trim();
  return /^https:\/\/script\.google\.com\//i.test(clean) && /\/exec(?:[/?#].*)?$/i.test(clean);
};

const normalizeUrl = (url: string): string => url.trim();

const isEntryPersistedInCloud = async (url: string, entryId: string): Promise<boolean> => {
  const cleanUrl = normalizeUrl(url);
  const separator = cleanUrl.includes('?') ? '&' : '?';
  const listUrl = `${cleanUrl}${separator}action=list&limit=30&offset=0&order=desc`;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await sleep(700 * attempt);
    }

    try {
      const response = await fetch(listUrl, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
      });

      if (!response.ok) {
        continue;
      }

      const result = await response.json();
      const rows = Array.isArray(result?.data) ? result.data : [];
      const found = rows.some((row: any) => String(row?.ID || '').trim() === entryId);
      if (found) {
        return true;
      }
    } catch {
      // Abaikan kegagalan probe verifikasi, lanjut retry singkat.
    }
  }

  return false;
};

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
  const originalCoordText = String(entry.rawKoordinat || '').trim() || safeCoordText;
  const revisedRawText = String(entry.revisedKoordinat || '').trim();
  const revisedCoordText = entry.snappedToGrid && revisedRawText ? revisedRawText : '';
  const mainCoordText = revisedCoordText || originalCoordText;

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
    "Koordinat": mainCoordText.includes('NaN') ? safeCoordText : mainCoordText,
    "Koordinat_Asli": originalCoordText,
    "Koordinat_Revisi": revisedCoordText,
    "Snapped_To_Grid": entry.snappedToGrid ? '1' : '0',
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
    "AI_Kesehatan": entry.aiKesehatan || '',
    "AI_Confidence": Number.isFinite(entry.aiConfidence as number) ? Number(entry.aiConfidence).toFixed(2) : '',
    "AI_Deskripsi": entry.aiDeskripsi || '',
    "HCV_Input": Number.isFinite(entry.hcvInput as number) ? Number(entry.hcvInput).toFixed(2) : '',
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
    // Setelah kirim no-cors, coba verifikasi via endpoint list terbaru.
    try {
      await fetch(cleanUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
      });

      const verified = await isEntryPersistedInCloud(cleanUrl, entry.id);
      if (verified) {
        return {
          ok: true,
          confirmed: true,
          message: 'Data tersimpan dan terverifikasi lewat pengecekan list terbaru.',
        };
      }

      return {
        ok: true,
        confirmed: false,
        message: 'Permintaan no-cors terkirim, namun verifikasi ID belum ditemukan.',
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
