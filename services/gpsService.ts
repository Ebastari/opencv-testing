
import { GpsLocation } from '../types';

export const getGpsLocation = (): Promise<GpsLocation> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error('Geolocation is not supported by your browser.'));
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        reject(new Error(`Failed to get GPS location: ${error.message}`));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 3000,
      }
    );
  });
};

/**
 * Memulai pemantauan lokasi GPS secara berkelanjutan.
 * @param onUpdate Callback saat lokasi diperbarui
 * @param onError Callback saat terjadi kesalahan
 * @returns Watch ID yang bisa digunakan untuk berhenti memantau
 */
export const watchGpsLocation = (
  onUpdate: (location: GpsLocation) => void,
  onError: (error: GeolocationPositionError) => void
): number => {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported by your browser.');
  }

  return navigator.geolocation.watchPosition(
    (position) => {
      onUpdate({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
    },
    onError,
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 3000,
    }
  );
};
