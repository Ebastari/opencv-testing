import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { PlantEntry } from '../types';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L, { type LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapViewProps } from '../types';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom icon creator
const createCustomIcon = (color: string, isOffline: boolean) => L.divIcon({
  className: 'custom-marker',
  html: `<div style="
    background: ${color};
    width: 24px; height: 24px;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    position: relative;
    ${isOffline ? 'animation: pulse 2s infinite;' : ''}
  "></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -24]
});

const OFFLINE_COLOR = '#ef4444'; // Red
const SENT_COLOR = '#10b981'; // Green

const MapRecenter = ({ center }: { center: LatLngTuple }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 16);
  }, [center, map]);
  return null;
};

const MapAutoFit = ({ points }: { points: [number, number][] }) => {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    map.fitBounds(points, { padding: [20, 20], maxZoom: 18 });
  }, [points, map]);
  return null;
};

export const MapView: React.FC<MapViewProps> = ({ 
  entries, 
  onBack, 
  pendingCount: _pendingCount,
  totalEntriesCount 
}) => {
  const mapEntries = useMemo(() => 
    [...entries]
      .filter(entry => 
        entry.gps && 
        Number.isFinite(entry.gps.lat) && 
        Number.isFinite(entry.gps.lon) && 
        entry.gps.lat !== 0 && 
        entry.gps.lon !== 0
      )
      .sort((left, right) => {
        const leftTime = new Date(left.timestamp).getTime();
        const rightTime = new Date(right.timestamp).getTime();
        return leftTime - rightTime;
      }), [entries]
  );

  const mapCenter = useMemo<LatLngTuple>(() => {
    if (mapEntries.length === 0) return [-2.979129, 115.199507]; // Lafalet default
    const last = mapEntries[mapEntries.length - 1];
    return [last.gps!.lat, last.gps!.lon];
  }, [mapEntries]);

  const mapPoints = useMemo(() => 
    mapEntries.map(entry => [entry.gps!.lat, entry.gps!.lon] as [number, number]), 
    [mapEntries]
  );

  const offlineCount = mapEntries.filter(e => !e.uploaded).length;
  const sentCount = mapEntries.filter(e => e.uploaded).length;

  return (
    <div className="w-screen h-[100dvh] min-h-[100dvh] bg-black relative overflow-hidden">
      {/* Back Button */}
      <div className="absolute top-[20px] left-[20px] z-[1000]">
        <button 
          onClick={onBack}
          className="w-14 h-14 rounded-full bg-white/90 backdrop-blur-xl border border-white/50 shadow-2xl flex items-center justify-center text-slate-900 font-black text-lg hover:bg-white active:scale-95 transition-all"
          title="Kembali ke Kamera"
        >
          ←
        </button>
      </div>

      {/* Stats Overlay */}
      <div className="absolute top-[20px] right-[20px] z-[1000] bg-white/90 backdrop-blur-xl rounded-2xl px-4 py-3 border border-white/50 shadow-2xl text-sm">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="w-3 h-3 bg-red-500 rounded-full mx-auto mb-1"></div>
            <span className="text-[10px] font-bold text-red-600">Offline</span>
            <div className="text-xs font-black text-slate-800">{offlineCount}</div>
          </div>
          <div className="text-center">
            <div className="w-3 h-3 bg-green-500 rounded-full mx-auto mb-1"></div>
            <span className="text-[10px] font-bold text-green-600">Terkirim</span>
            <div className="text-xs font-black text-slate-800">{sentCount}</div>
          </div>
          <div className="text-center">
            <span className="text-xs font-black text-slate-800">{totalEntriesCount}</span>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Total</div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-[20px] left-1/2 -translate-x-1/2 z-[1000] bg-white/95 backdrop-blur-xl rounded-2xl px-6 py-4 border border-white/50 shadow-2xl text-center">
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">Spatial Distribution (GIS)</p>
        <p className="text-[10px] font-bold text-slate-500 mb-2">Peta Lafalet Tersimpan</p>
        <p className="text-[10px] text-slate-600">Merah: Data offline | Hijau: Data terkirim</p>
      </div>

      {/* Map */}
      <MapContainer
        center={mapCenter}
        zoom={16}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
        className="z-[1]"
      >
        <TileLayer 
          url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
          attribution='&copy; <a href="https://www.google.com/maps">Google Maps</a>'
        />
        <MapRecenter center={mapCenter} />
        <MapAutoFit points={mapPoints} />
        
        {mapEntries.map((entry) => {
          const isOffline = !entry.uploaded;
          const color = isOffline ? OFFLINE_COLOR : SENT_COLOR;
          
          return (
            <Marker
              key={entry.id}
              position={[entry.gps!.lat, entry.gps!.lon]}
              icon={createCustomIcon(color, isOffline)}
            >
              <Popup>
                <div className="min-w-[240px]">
                  <div className="font-black text-sm uppercase mb-2">
                    Pohon #{entry.noPohon} - {entry.tanaman}
                  </div>
                  <div className="space-y-1 text-xs">
                    <div>Tinggi: <span className="font-bold">{entry.tinggi} cm</span></div>
                    <div>Kondisi: <span className={`font-bold ${entry.kesehatan === 'Sehat' ? 'text-green-600' : entry.kesehatan === 'Merana' ? 'text-amber-600' : 'text-red-600'}`}>
                      {entry.kesehatan}
                    </span></div>
                    <div>Status: <span className={`font-bold ${isOffline ? 'text-red-600' : 'text-green-600'}`}>
                      {isOffline ? 'OFFLINE' : 'TERKIRIM'}
                    </span></div>
                    <div>Koordinat: <span className="font-mono">{entry.gps!.lat.toFixed(6)}, {entry.gps!.lon.toFixed(6)}</span></div>
                    <div className="text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-200">
                      Waktu: {new Date(entry.timestamp).toLocaleString('id-ID')}
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
};

