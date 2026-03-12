
import { PlantEntry } from '../types';
import { ensurePiexif } from './resourceLoader';

/**
 * Konversi desimal ke format DMS (Degrees, Minutes, Seconds) EXIF.
 * Menggunakan presisi 1000000 (mikro-detik) untuk akurasi koordinat sub-meter.
 */
const degToExifDMS = (deg: number): [[number, number], [number, number], [number, number]] => {
  const absolute = Math.abs(deg);
  const d = Math.floor(absolute);
  const m = Math.floor((absolute - d) * 60);
  const s = Math.round((absolute - d - m / 60) * 3600 * 1000000);
  
  return [
    [d, 1],
    [m, 1],
    [s, 1000000]
  ];
};

/**
 * Helper untuk mengenkode teks ke UserComment EXIF.
 * Menangani standar 8-byte ASCII header (ASCII\0\0\0).
 */
const encodeExifUserComment = (text: string): string => {
  const piexif = (window as any).piexif;
  if (piexif?.helper?.encodeText) {
    try {
      return piexif.helper.encodeText(text, 'ascii');
    } catch (e) {
      console.warn("[EXIF] Helper encode gagal, menggunakan biner manual.");
    }
  }
  return "ASCII\0\0\0" + text;
};

/**
 * Fungsi Utama: Menyisipkan Digital Signature "Monta AI Pro" & Geotagging.
 */
export const writeExifData = async (dataUrl: string, entryData: Omit<PlantEntry, 'foto'>): Promise<string> => {
  try {
    await ensurePiexif();
    const piexif = (window as any).piexif;
    
    if (!piexif) {
      console.warn("[EXIF] Library piexifjs tidak termuat. Melewati proses tanda tangan digital.");
      return dataUrl;
    }

    const { id, tinggi, tanaman, gps, timestamp, kesehatan } = entryData;
    const dt = new Date(timestamp);
    
    // Generate Random Verification ID (Tanda Tangan Unik)
    const verificationId = `VERIFIED-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    // Format Tanggal EXIF: YYYY:MM:DD HH:MM:SS
    const pad = (n: number) => n.toString().padStart(2, '0');
    const exifDate = `${dt.getFullYear()}:${pad(dt.getMonth() + 1)}:${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;

    // --- 0th IFD: Identitas Aplikasi (Digital Signature) ---
    const zerothIfd: any = {};
    zerothIfd[piexif.ImageIFD.Make] = "MONTANA-TECH";
    zerothIfd[piexif.ImageIFD.Model] = "MONTA-AI-PRO-V1";
    zerothIfd[piexif.ImageIFD.Software] = "Monta AI Pro v1.0";
    zerothIfd[piexif.ImageIFD.Artist] = "Monta AI Official User";
    zerothIfd[piexif.ImageIFD.Copyright] = "Copyright 2026 Monta AI Pro - Verified Original";
    zerothIfd[piexif.ImageIFD.DateTime] = exifDate;

    // --- Exif IFD: Detail Pengamatan & Verifikasi ---
    const exifIfd: any = {};
    exifIfd[piexif.ExifIFD.DateTimeOriginal] = exifDate;
    
    // Gabungkan data tanaman dengan ID Verifikasi unik
    const commentPayload = `Verification_ID: ${verificationId} | Plant_Data: ID=${id}, SPP=${tanaman}, H=${tinggi}cm, Health=${kesehatan}`;
    exifIfd[piexif.ExifIFD.UserComment] = encodeExifUserComment(commentPayload);

    // --- GPS IFD: Geotagging Presisi ---
    const gpsIfd: any = {};
    gpsIfd[piexif.GPSIFD.GPSVersionID] = [2, 3, 0, 0];

    if (gps && (gps.lat !== 0 || gps.lon !== 0)) {
      // Latitude
      gpsIfd[piexif.GPSIFD.GPSLatitudeRef] = gps.lat < 0 ? 'S' : 'N';
      gpsIfd[piexif.GPSIFD.GPSLatitude] = degToExifDMS(gps.lat);
      
      // Longitude
      gpsIfd[piexif.GPSIFD.GPSLongitudeRef] = gps.lon < 0 ? 'W' : 'E';
      gpsIfd[piexif.GPSIFD.GPSLongitude] = degToExifDMS(gps.lon);
      
      // Altitude & Datum
      gpsIfd[piexif.GPSIFD.GPSAltitudeRef] = 0; 
      gpsIfd[piexif.GPSIFD.GPSAltitude] = [0, 1];
      gpsIfd[piexif.GPSIFD.GPSMapDatum] = 'WGS-84';

      // GPS TimeStamp (UTC)
      const utcDate = new Date(dt.getTime() + (dt.getTimezoneOffset() * 60000));
      gpsIfd[piexif.GPSIFD.GPSTimeStamp] = [
        [utcDate.getHours(), 1],
        [utcDate.getMinutes(), 1],
        [utcDate.getSeconds(), 1]
      ];
      gpsIfd[piexif.GPSIFD.GPSDateStamp] = `${utcDate.getFullYear()}:${pad(utcDate.getMonth() + 1)}:${pad(utcDate.getDate())}`;
    }

    // --- PROSES INJEKSI BINER ---
    // piexif.dump mengonversi objek ke biner EXIF
    const exifObj = { "0th": zerothIfd, "Exif": exifIfd, "GPS": gpsIfd };
    const exifBytes = piexif.dump(exifObj);
    
    // piexif.insert menyisipkan biner ke dalam header JPEG Base64
    // Menangani 'data:image/jpeg;base64,' secara otomatis
    const signedImage = piexif.insert(exifBytes, dataUrl);

    console.log(`[MONTA-AI] Metadata Injected: ${verificationId}`);
    return signedImage;

  } catch (error) {
    console.error("[MONTA-AI ERROR] Gagal menyuntikkan metadata:", error);
    return dataUrl; // Fallback ke gambar asli jika gagal
  }
};
