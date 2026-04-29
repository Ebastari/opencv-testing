
export const getCameraDevices = async (): Promise<MediaDeviceInfo[]> => {
  if (!navigator.mediaDevices?.enumerateDevices) {
    console.warn("enumerateDevices() not supported.");
    return [];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'videoinput');
  } catch (e) {
    console.error("Error enumerating devices:", e);
    return [];
  }
};

export const startCamera = async (deviceId?: string): Promise<MediaStream> => {
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: deviceId 
      ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
  };

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    console.warn("Primary constraints failed, retrying with basic video...", err);
    // Fallback ke konfigurasi paling dasar jika ideal gagal
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
};
