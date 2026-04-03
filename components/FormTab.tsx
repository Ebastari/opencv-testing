
import React from 'react';
import { FormState } from '../types';

interface FormTabProps {
  formState: FormState;
  onFormStateChange: React.Dispatch<React.SetStateAction<FormState>>;
  plantTypes: string[];
  onRegisterPlantType: (value: string) => void;
}

const normalizePlantType = (value: string): string => value.trim().replace(/\s+/g, ' ');

export const FormTab: React.FC<FormTabProps> = ({ formState, onFormStateChange, plantTypes, onRegisterPlantType }) => {
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (e.target.type === 'number') {
      const parsed = Number(value);
      onFormStateChange((prev) => {
        if (!Number.isFinite(parsed)) {
          if (name === 'spacingX') {
            return { ...prev, spacingX: 4 };
          }
          if (name === 'spacingY') {
            return { ...prev, spacingY: 4 };
          }
          return prev;
        }

        return {
          ...prev,
          [name]: parsed,
        };
      });
      return;
    }

    onFormStateChange((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const normalizedPlantType = normalizePlantType(formState.jenis);
  const isCustomPlantType =
    normalizedPlantType.length > 0 &&
    !plantTypes.some((type) => type.toLocaleLowerCase() === normalizedPlantType.toLocaleLowerCase());

  const handlePlantTypeBlur = () => {
    onRegisterPlantType(formState.jenis);
  };

  const handlePlantTypeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') {
      return;
    }

    e.preventDefault();
    onRegisterPlantType(formState.jenis);
    e.currentTarget.blur();
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-10">
      
      {/* Seksi Administrasi & Identitas - Data ini tersimpan permanen di LocalStorage via App.tsx */}
      <div className="bg-slate-50 p-5 rounded-[2.5rem] border border-slate-100 shadow-sm ring-1 ring-black/5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <span className="text-lg">👤</span>
            </div>
            <div>
              <h3 className="font-black text-sm text-slate-800 uppercase tracking-tight">Administrasi</h3>
              <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest">Auto-Saved Profile</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Nama Pengawas</label>
            <input 
              type="text" 
              name="pengawas" 
              value={formState.pengawas} 
              onChange={handleFormChange} 
              className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all shadow-sm" 
              placeholder="Contoh: Budi Santoso"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Vendor Pelaksana</label>
            <input 
              type="text" 
              name="vendor" 
              value={formState.vendor} 
              onChange={handleFormChange} 
              className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all shadow-sm" 
              placeholder="Nama perusahaan vendor..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Pekerjaan</label>
              <input 
                type="text" 
                name="pekerjaan" 
                value={formState.pekerjaan} 
                onChange={handleFormChange} 
                className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all shadow-sm" 
                placeholder="Jenis kegiatan..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">ID Tim</label>
              <input 
                type="text" 
                name="tim" 
                value={formState.tim} 
                onChange={handleFormChange} 
                className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all shadow-sm" 
                placeholder="Kode tim..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* Seksi Parameter Tanaman */}
      <div className="bg-white p-5 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-inner">
            <span className="text-lg">🌿</span>
          </div>
          <h3 className="font-black text-sm text-slate-800 uppercase tracking-tight">Kondisi Tanaman</h3>
        </div>
        
        <div className="space-y-2 mb-6">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Jenis Bibit</label>
          <div className="space-y-2">
            <input 
              type="text" 
              name="jenis" 
              list="plant-type-suggestions"
              value={formState.jenis} 
              onChange={handleFormChange}
              onBlur={handlePlantTypeBlur}
              onKeyDown={handlePlantTypeKeyDown}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all shadow-sm" 
              placeholder="Ketik jenis bibit..."
            />
            <datalist id="plant-type-suggestions">
              {plantTypes.map((plantType) => (
                <option key={plantType} value={plantType} />
              ))}
            </datalist>
            <p className={`px-1 text-[10px] font-bold ${isCustomPlantType ? 'text-emerald-600' : 'text-slate-400'}`}>
              {isCustomPlantType
                ? 'Bibit baru ini akan otomatis ditambahkan ke tombol tanaman di panel kamera.'
                : 'Pilih dari daftar atau ketik bibit baru, lalu keluar dari kolom untuk menyimpan.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tinggi (cm)</label>
            <div className="relative">
               <input type="number" name="tinggi" value={formState.tinggi} onChange={handleFormChange} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all shadow-sm" />
               <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">CM</span>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tahun Tanam</label>
            <input type="number" name="tahunTanam" value={formState.tahunTanam} onChange={handleFormChange} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all shadow-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Jarak Tanam X (m)</label>
            <div className="relative">
              <input
                type="number"
                name="spacingX"
                min={1}
                max={20}
                step={0.5}
                value={formState.spacingX}
                onChange={handleFormChange}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all shadow-sm"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">M</span>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Jarak Tanam Y (m)</label>
            <div className="relative">
              <input
                type="number"
                name="spacingY"
                min={1}
                max={20}
                step={0.5}
                value={formState.spacingY}
                onChange={handleFormChange}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all shadow-sm"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">M</span>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Status Kesehatan</label>
          <div className="relative">
            <select name="kesehatan" value={formState.kesehatan} onChange={handleFormChange} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-700 outline-none appearance-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all shadow-sm pr-10">
              <option value="Sehat">🟢 SEHAT</option>
              <option value="Merana">🟡 MERANA</option>
              <option value="Mati">🔴 MATI</option>
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300">▼</div>
          </div>
        </div>
      </div>

      <div className="px-6">
        <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100/50 flex items-center gap-3">
           <span className="text-sm">ℹ️</span>
           <p className="text-[9px] text-blue-600 font-bold leading-relaxed uppercase tracking-tight">
             Data Administrasi (Pengawas & Vendor) tidak akan berubah meskipun aplikasi ditutup, memudahkan pengambilan data massal.
           </p>
        </div>
      </div>
    </div>
  );
};
