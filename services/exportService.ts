
import { PlantEntry } from '../types';

declare const JSZip: any;
declare const saveAs: any;

interface ExportProgress {
  current: number;
  total: number;
  phase: 'preparing' | 'packaging' | 'saving';
}

interface ExportOptions {
  onProgress?: (progress: ExportProgress) => void;
}

const EXPORT_CHUNK_SIZE = 8;

const yieldToMainThread = async (): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });

const emitProgress = (
  onProgress: ExportOptions['onProgress'],
  current: number,
  total: number,
  phase: ExportProgress['phase'],
): void => {
  if (!onProgress) {
    return;
  }
  onProgress({ current, total, phase });
};

const getBase64Payload = (dataUrl: string): string => {
  if (!dataUrl) {
    return '';
  }
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
};

const dataURLtoBlob = (dataurl: string) => {
  const arr = dataurl.split(',');
  const mimeMatch = (arr[0].match(/:(.*?);/)||[])[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while(n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], {type: mimeMatch});
}

const escapeCSV = (val: any): string => {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const exportToCSV = (entries: PlantEntry[]) => {
  const headers = ['ID', 'Timestamp', 'Tinggi (cm)', 'Jenis', 'Kesehatan', 'Lokasi', 'Tahun Tanam', 'GPS Latitude', 'GPS Longitude', 'GPS Accuracy'];
  // FIX: Use 'tanaman' instead of 'jenis', 'tahunTanam' instead of 'tahun', and correctly access timestamp and gps.
  const rows = entries.map(e => [
    e.id, e.timestamp, e.tinggi, e.tanaman, e.kesehatan, e.lokasi, e.tahunTanam,
    e.gps?.lat ?? '', e.gps?.lon ?? '', e.gps?.accuracy ?? ''
  ].map(escapeCSV));

  const csvContent = "data:text/csv;charset=utf-8," 
    + [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "monitoring_tanaman.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportToZIP = async (entries: PlantEntry[], options: ExportOptions = {}) => {
  const zip = new JSZip();
  const imagesFolder = zip.folder("images");
  
  if (!imagesFolder) return;

  const exportableEntries = entries.filter((entry) => Boolean(entry.foto));
  const total = exportableEntries.length;

  emitProgress(options.onProgress, 0, total, 'preparing');

  for (let index = 0; index < exportableEntries.length; index += 1) {
    const entry = exportableEntries[index];
    const base64Data = getBase64Payload(entry.foto);
    if (base64Data) {
      imagesFolder.file(`foto_${entry.id}.jpg`, base64Data, { base64: true, compression: 'STORE' });
    }

    emitProgress(options.onProgress, index + 1, total, 'preparing');
    if ((index + 1) % EXPORT_CHUNK_SIZE === 0) {
      await yieldToMainThread();
    }
  }

  // Also include CSV data
  const headers = ['ID', 'Timestamp', 'Tinggi (cm)', 'Jenis', 'Kesehatan', 'Lokasi', 'Tahun Tanam', 'Image File'];
  // FIX: Use 'tanaman' instead of 'jenis' and 'tahunTanam' instead of 'tahun'.
  const rows = entries.map(e => [e.id, e.timestamp, e.tinggi, e.tanaman, e.kesehatan, e.lokasi, e.tahunTanam, `images/foto_${e.id}.jpg`].map(escapeCSV));
  const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  zip.file("data_monitoring.csv", csvContent);

  emitProgress(options.onProgress, total, total, 'packaging');
  const content = await zip.generateAsync(
    { type: "blob", streamFiles: true, compression: 'STORE' },
    (metadata: { percent: number }) => {
      const current = Math.min(total, Math.max(0, Math.round((metadata.percent / 100) * Math.max(total, 1))));
      emitProgress(options.onProgress, current, total, 'packaging');
    },
  );
  emitProgress(options.onProgress, total, total, 'saving');
  saveAs(content, "monitoring_tanaman_export.zip");
};

const escapeXml = (s: any): string => {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[<>&"']/g, c => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '"': return '&quot;';
            case "'": return '&apos;';
            default: return c;
        }
    });
};


export const exportToKMZ = async (entries: PlantEntry[], options: ExportOptions = {}) => {
  const zip = new JSZip();
  const filesFolder = zip.folder("files");
  if (!filesFolder) return;

  let kmlPlacemarks = '';
  const exportableEntries = entries.filter((entry) => entry.gps && entry.foto);
  const total = exportableEntries.length;

  emitProgress(options.onProgress, 0, total, 'preparing');

  for (let index = 0; index < exportableEntries.length; index += 1) {
    const entry = exportableEntries[index];
    // FIX: Check 'entry.gps' for coordinates.
    if (entry.gps) {
        const imageName = `foto_${entry.id}.jpg`;
        const base64Data = getBase64Payload(entry.foto);
        if (base64Data) {
          filesFolder.file(imageName, base64Data, { base64: true, compression: 'STORE' });
        }

        // FIX: Use 'tanaman' and correctly handle timestamp.
        kmlPlacemarks += `
    <Placemark>
      <name>${escapeXml(entry.tanaman)} - ${escapeXml(entry.id)}</name>
      <description><![CDATA[
        <img src="files/${imageName}" width="300" />
        <br><b>ID:</b> ${escapeXml(entry.id)}
        <br><b>Tinggi:</b> ${escapeXml(entry.tinggi)} cm
        <br><b>Jenis:</b> ${escapeXml(entry.tanaman)}
        <br><b>Kesehatan:</b> ${escapeXml(entry.kesehatan)}
        <br><b>Lokasi:</b> ${escapeXml(entry.lokasi)}
        <br><b>Timestamp:</b> ${escapeXml(new Date(entry.timestamp).toLocaleString('id-ID'))}
      ]]></description>
      <Point>
        <coordinates>${entry.gps.lon},${entry.gps.lat},0</coordinates>
      </Point>
    </Placemark>`;
    }

    emitProgress(options.onProgress, index + 1, total, 'preparing');
    if ((index + 1) % EXPORT_CHUNK_SIZE === 0) {
      await yieldToMainThread();
    }
  }

  const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Data Monitoring Tanaman</name>
    ${kmlPlacemarks}
  </Document>
</kml>`;

  zip.file("doc.kml", kmlContent);
  emitProgress(options.onProgress, total, total, 'packaging');
  const content = await zip.generateAsync(
    { type: "blob", streamFiles: true, compression: 'STORE' },
    (metadata: { percent: number }) => {
      const current = Math.min(total, Math.max(0, Math.round((metadata.percent / 100) * Math.max(total, 1))));
      emitProgress(options.onProgress, current, total, 'packaging');
    },
  );
  emitProgress(options.onProgress, total, total, 'saving');
  saveAs(content, "monitoring_tanaman.kmz");
};
