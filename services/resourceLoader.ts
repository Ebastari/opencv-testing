
/**
 * Utility untuk memuat script eksternal hanya saat dibutuhkan.
 * Memastikan library tidak membebani loading awal aplikasi.
 */
export const loadExternalScript = (url: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Cek jika sudah ada
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
};

export const ensureLeaflet = async () => {
  if (typeof (window as any).L !== 'undefined') return;
  await loadExternalScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
};

export const ensurePiexif = async () => {
  // Gunakan versi 1.0.4 yang lebih stabil untuk window global attachment
  const PIEXIF_URL = 'https://cdn.jsdelivr.net/npm/piexifjs@1.0.4/piexif.js';
  
  if (typeof (window as any).piexif !== 'undefined') return;
  
  await loadExternalScript(PIEXIF_URL);
  
  // Terkadang script butuh beberapa ms untuk benar-benar menginisialisasi global variable
  let retries = 0;
  while (typeof (window as any).piexif === 'undefined' && retries < 10) {
    await new Promise(r => setTimeout(r, 50));
    retries++;
  }
};
