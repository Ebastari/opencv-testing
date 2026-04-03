import React, { useMemo, useState } from 'react';
import { PlantEntry, type HcvInsightSelection, type PlantHealthLabel } from '../types';
import { generateHealthDescription } from '../ecology/plantHealth';

interface HcvTabProps {
  entries: PlantEntry[];
  totalEntriesCount: number;
  selectedInsight: HcvInsightSelection | null;
}

const ITEMS_PER_PAGE = 8;

const getPreviewSrc = (entry: PlantEntry): string => entry.thumbnail || entry.foto;

const formatHcvValue = (value?: number): string => {
  if (!Number.isFinite(value)) {
    return '-';
  }

  return Number(value).toFixed(2);
};

const getHcvTone = (entry: PlantEntry): string => {
  if (entry.kesehatan === 'Sehat') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  }

  if (entry.kesehatan === 'Merana') {
    return 'bg-amber-50 text-amber-700 border-amber-100';
  }

  return 'bg-red-50 text-red-700 border-red-100';
};

const getHealthWeight = (health: PlantHealthLabel): number => {
  if (health === 'Sehat') {
    return 1;
  }

  if (health === 'Merana') {
    return 0.5;
  }

  return 0;
};

const getInsightTone = (health: PlantHealthLabel): string => {
  if (health === 'Sehat') {
    return 'from-emerald-500 to-teal-500 border-emerald-200 text-emerald-950';
  }

  if (health === 'Merana') {
    return 'from-amber-400 to-orange-400 border-amber-200 text-amber-950';
  }

  return 'from-rose-500 to-red-500 border-rose-200 text-rose-950';
};

const buildInsightScientificDescription = (selection: HcvInsightSelection): string => {
  const hue = Number.isFinite(selection.hue) ? Number(selection.hue) : 0;
  const saturation = Number.isFinite(selection.saturation) ? Number(selection.saturation) : 0;
  const value = Number.isFinite(selection.value) ? Number(selection.value) : 0;

  return generateHealthDescription({
    health: selection.health,
    confidence: Number(selection.confidence.toFixed(2)),
    hue,
    saturation,
    value,
  });
};

const buildFallbackHcvDescription = (entry: PlantEntry): string => {
  if (entry.hcvDescription) {
    return entry.hcvDescription;
  }

  if (entry.aiDeskripsi) {
    return entry.aiDeskripsi;
  }

  if (entry.kesehatan === 'Sehat') {
    return 'Kondisi pohon terpantau baik dan belum membutuhkan tindak lanjut intensif.';
  }

  if (entry.kesehatan === 'Merana') {
    return 'Kondisi pohon perlu perhatian karena terdapat indikasi penurunan kesehatan.';
  }

  return 'Kondisi pohon kritis dan perlu pemeriksaan lapangan lanjutan sesegera mungkin.';
};

export const HcvTab: React.FC<HcvTabProps> = ({ entries, totalEntriesCount, selectedInsight }) => {
  const [currentPage, setCurrentPage] = useState(1);

  const hcvEntries = useMemo(() => {
    return [...entries]
      .filter((entry) => Number.isFinite(entry.hcvInput) || Boolean(entry.hcvDescription) || Boolean(entry.aiDeskripsi))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [entries]);

  const latestEntry = hcvEntries[0];
  const totalPages = Math.max(1, Math.ceil(hcvEntries.length / ITEMS_PER_PAGE));

  const paginatedEntries = useMemo(() => {
    return hcvEntries.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  }, [currentPage, hcvEntries]);

  const selectedInsightHcv = selectedInsight
    ? Math.round(Math.max(0, Math.min(100, getHealthWeight(selectedInsight.health) * selectedInsight.confidence)) * 100) / 100
    : null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-12">
      {selectedInsight && (
        <div className="px-1">
          <div className={`rounded-[2.25rem] border bg-gradient-to-br ${getInsightTone(selectedInsight.health)} p-5 shadow-lg`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/80">Penjelasan AI ke HCV</p>
                <h3 className="mt-2 text-lg font-black text-white">
                  {selectedInsight.health}: {selectedInsight.confidence.toFixed(2)}%
                </h3>
                <p className="mt-1 text-[11px] font-semibold text-white/85">
                  Nilai ini berarti model AI paling yakin bahwa kondisi vegetasi berada pada kelas {selectedInsight.health.toLowerCase()} berdasarkan distribusi spektral HSV pada area tanaman yang terdeteksi.
                </p>
              </div>
              <div className="rounded-2xl bg-white/20 px-3 py-2 text-right backdrop-blur-sm">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/75">Estimasi HCV</p>
                <p className="text-sm font-black text-white">{selectedInsightHcv?.toFixed(2)}%</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-[1.5rem] bg-white/14 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">Dasar Perhitungan Confidence</p>
                <p className="mt-2 text-[11px] font-semibold leading-relaxed text-white/90">
                  Confidence dihitung dari konsistensi kelas piksel vegetasi, konsentrasi hue dominan, lalu dikoreksi dengan penalti rasio vegetasi pada ROI. Secara operasional: confidence = ((konsistensi kelas + konsentrasi hue) / 2) x penalti vegetasi x 100.
                </p>
              </div>

              <div className="rounded-[1.5rem] bg-white/14 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">Konversi ke HCV</p>
                <p className="mt-2 text-[11px] font-semibold leading-relaxed text-white/90">
                  Dasar indeks HCV di aplikasi ini adalah HCV = confidence x bobot kesehatan. Bobot sehat = 1, merana = 0.5, dan mati = 0. Jadi status {selectedInsight.health.toLowerCase()} {selectedInsight.confidence.toFixed(2)}% dikonversi menjadi HCV {selectedInsightHcv?.toFixed(2)}%.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-[1.75rem] bg-white text-slate-700 px-4 py-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em] mb-2">Interpretasi Ilmiah</p>
              <p className="text-[12px] font-semibold leading-relaxed">
                {buildInsightScientificDescription(selectedInsight)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-end px-2">
        <div className="flex flex-col gap-1">
          <h3 className="font-black text-lg text-slate-800 leading-none">HCV Monitoring</h3>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {hcvEntries.length} hasil HCV terbaru
          </span>
        </div>
        <div className="px-4 py-2 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest">
          Total {totalEntriesCount}
        </div>
      </div>

      {hcvEntries.length === 0 ? (
        <div className="py-24 text-center space-y-4">
          <div className="w-24 h-24 bg-emerald-50 rounded-[3rem] flex items-center justify-center text-4xl mx-auto shadow-inner opacity-70">🌿</div>
          <p className="text-slate-800 text-sm font-black uppercase tracking-widest">Belum Ada Hasil HCV</p>
          <p className="text-[11px] text-slate-500 font-semibold px-8">
            Ambil foto dari panel kamera untuk menyimpan hasil analisis HCV ke menu ini.
          </p>
        </div>
      ) : (
        <>
          {latestEntry && (
            <div className="px-1 group">
              <div className="bg-white p-3 rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
                <div className="relative aspect-[4/3] w-full rounded-[2rem] overflow-hidden bg-slate-100">
                  <img src={getPreviewSrc(latestEntry)} className="w-full h-full object-cover" alt={`Pohon ${latestEntry.noPohon}`} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <div className="absolute left-4 right-4 bottom-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-white text-sm font-black uppercase tracking-[0.18em]">Pohon #{latestEntry.noPohon}</p>
                      <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest">{latestEntry.tanaman}</p>
                    </div>
                    <div className="px-3 py-2 rounded-2xl bg-white/90 text-slate-900 text-[11px] font-black uppercase tracking-widest">
                      HCV {formatHcvValue(latestEntry.hcvInput)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {totalEntriesCount > entries.length && (
            <p className="px-3 text-[9px] font-bold text-slate-500">
              Menampilkan hasil HCV dari entri terbaru yang sedang dimuat di aplikasi.
            </p>
          )}

          <div className="space-y-3 px-1">
            {paginatedEntries.map((entry) => (
              <div key={entry.id} className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm space-y-3">
                <div className="flex gap-4 items-start">
                  <div className="relative h-20 w-20 rounded-[1.25rem] overflow-hidden flex-shrink-0 bg-slate-50 border border-slate-50">
                    <img
                      src={getPreviewSrc(entry)}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      alt={`Foto pohon ${entry.noPohon}`}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-sm text-slate-800">Pohon #{entry.noPohon}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                          {entry.tanaman} • {entry.tinggi} cm
                        </p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${getHcvTone(entry)}`}>
                        {entry.kesehatan}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[9px] font-black uppercase tracking-widest">
                        HCV {formatHcvValue(entry.hcvInput)}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[9px] font-black uppercase tracking-widest">
                        {new Date(entry.timestamp).toLocaleDateString('id-ID')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.5rem] bg-slate-50 border border-slate-100 px-4 py-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em] mb-1">Deskripsi HCV</p>
                  <p className="text-[12px] font-semibold text-slate-700 leading-relaxed">
                    {buildFallbackHcvDescription(entry)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-8 px-2">
              <button onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 disabled:opacity-20 active:scale-90 transition-all">←</button>
              <div className="flex gap-2">
                {Array.from({ length: totalPages }).map((_, index) => (
                  <div key={index} className={`h-1.5 rounded-full transition-all duration-500 ${currentPage === index + 1 ? 'w-8 bg-emerald-600' : 'w-1.5 bg-slate-200'}`} />
                ))}
              </div>
              <button onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-emerald-600 disabled:opacity-20 active:scale-90 transition-all">→</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};