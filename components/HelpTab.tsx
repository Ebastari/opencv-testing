import React, { useState } from 'react';

interface HelpFaqItem {
  question: string;
  answer: string;
}

const quickSteps = [
  'Buka tab Input lalu isi data dasar seperti jenis bibit, tinggi tanaman, dan identitas tim.',
  'Kembali ke panel kamera, arahkan kamera ke tanaman yang ingin didata, lalu pastikan GPS sudah aktif.',
  'Ambil foto. Aplikasi akan menyimpan foto, posisi, jenis tanaman, tinggi, kesehatan, dan hasil HCV secara otomatis.',
  'Buka tab Histori untuk melihat daftar data yang tersimpan, atau tab HCV untuk melihat ringkasan hasil kondisi tiap pohon.',
  'Jika internet tersedia, data dapat disinkronkan ke cloud. Jika offline, data tetap aman di perangkat dan akan bisa dikirim nanti.',
];

const advantages = [
  'Satu aplikasi untuk foto lapangan, pencatatan pohon, GPS, HCV, analitik, dan sinkronisasi cloud.',
  'Tetap bisa dipakai saat sinyal buruk karena data disimpan lokal lebih dulu.',
  'Membantu tim lapangan bekerja lebih rapi karena setiap pohon punya nomor, foto, lokasi, dan status yang jelas.',
  'Mengurangi pekerjaan manual saat membuat laporan karena data sudah siap diekspor ke CSV, KMZ, dan paket foto.',
  'Memudahkan pemantauan hasil revegetasi karena pengguna bisa membandingkan histori, analitik lokal, HCV, dan dashboard cloud.',
];

const faqItems: HelpFaqItem[] = [
  {
    question: 'Apa fungsi utama aplikasi ini?',
    answer:
      'Aplikasi ini membantu mendata dan memantau tanaman revegetasi di lapangan. Pengguna cukup memotret tanaman, lalu aplikasi menyimpan informasi penting seperti foto, lokasi GPS, jenis tanaman, tinggi, kondisi kesehatan, dan hasil HCV.',
  },
  {
    question: 'Apa itu revegetasi?',
    answer:
      'Revegetasi adalah kegiatan menanam kembali tanaman di area yang perlu dipulihkan, misalnya lahan bekas tambang atau lahan terbuka. Tujuannya agar area tersebut kembali hijau, stabil, dan memiliki fungsi lingkungan yang lebih baik.',
  },
  {
    question: 'Apa itu HCV di aplikasi ini?',
    answer:
      'Di aplikasi ini, HCV ditampilkan sebagai ringkasan nilai kondisi tanaman saat foto diambil. Nilai ini membantu tim melihat mana pohon yang tampak baik, perlu perhatian, atau butuh tindak lanjut lebih cepat.',
  },
  {
    question: 'Bagaimana cara memakai aplikasi jika saya baru pertama kali?',
    answer:
      'Mulailah dari tab Input, isi data bibit dan parameter dasar, lalu ambil foto dari panel kamera. Setelah foto diambil, cek hasilnya di Histori dan HCV. Dari sana Anda bisa memantau apakah data sudah tersimpan dengan benar.',
  },
  {
    question: 'Kenapa GPS penting?',
    answer:
      'GPS membantu menunjukkan posisi tanaman yang didata. Dengan begitu, tim bisa kembali ke titik yang sama, membuat peta tanam, dan mengecek perkembangan tanaman dari waktu ke waktu.',
  },
  {
    question: 'Apa arti koordinat asli dan koordinat revisi?',
    answer:
      'Koordinat asli adalah posisi GPS yang terbaca langsung saat pengambilan foto. Koordinat revisi adalah posisi yang disesuaikan dengan grid 4x4 jika fitur anchor digunakan, supaya penempatan titik tanam lebih konsisten.',
  },
  {
    question: 'Apakah aplikasi tetap bisa dipakai tanpa internet?',
    answer:
      'Bisa. Aplikasi menyimpan data lebih dulu di perangkat. Saat internet tersedia, data bisa disinkronkan ke cloud tanpa perlu input ulang.',
  },
  {
    question: 'Apa beda tab Histori, HCV, Analitik, dan Cloud?',
    answer:
      'Histori menampilkan daftar data pohon yang tersimpan. HCV menampilkan hasil kondisi per pohon lengkap dengan foto dan deskripsi. Analitik menampilkan ringkasan data lokal. Cloud menampilkan hasil sinkronisasi dan ringkasan data online.',
  },
  {
    question: 'Bagaimana jika jenis bibit saya belum ada?',
    answer:
      'Anda bisa mengetik jenis bibit baru di tab Input. Jenis baru itu akan otomatis ikut tersedia di panel kamera agar bisa dipakai lagi pada pengambilan data berikutnya.',
  },
  {
    question: 'Bagaimana cara membaca hasil kesehatan tanaman?',
    answer:
      'Status seperti Sehat, Merana, atau Mati membantu tim melihat kondisi lapangan secara cepat. Warna dan label di aplikasi dibuat untuk mempermudah identifikasi tanaman yang masih baik dan tanaman yang perlu perhatian.',
  },
  {
    question: 'Apa manfaat mode AI, Slider, dan Pixel Scale untuk tinggi?',
    answer:
      'Mode Manual dipakai saat pengguna ingin menggeser slider sendiri. Mode Pixel Scale dipakai saat pengguna ingin mengukur dari referensi visual pada gambar. Mode AI Visual dipakai saat kamera mencoba membaca tinggi tanaman. Di mode AI, pengguna bisa memilih Saran atau Otomatis. Saran hanya menampilkan hasil AI atau fallback riwayat sampel agar pengguna memutuskan sendiri. Otomatis langsung mengisi kolom tinggi jika AI visual berhasil, tetapi bila AI visual gagal sistem hanya menampilkan Saran Otomatis dari rata-rata sampel yang sudah dikalibrasi.',
  },
  {
    question: 'Bagaimana cara membuat laporan dari aplikasi ini?',
    answer:
      'Di tab Setelan, data bisa diekspor ke CSV untuk tabel laporan, KMZ untuk peta Google Earth, dan ZIP untuk kumpulan foto. Ini memudahkan penyusunan laporan lapangan dan dokumentasi proyek.',
  },
];

const troubleshootingItems = [
  {
    title: 'Kamera tidak mau terbuka',
    body: 'Pastikan browser memberi izin kamera dan aplikasi dijalankan pada koneksi aman seperti HTTPS atau localhost.',
  },
  {
    title: 'GPS belum terkunci',
    body: 'Tunggu beberapa saat di area terbuka agar sinyal GPS lebih stabil. Jika akurasi masih buruk, data tetap bisa diambil, tetapi kualitas posisi akan lebih rendah.',
  },
  {
    title: 'Data tidak muncul di cloud',
    body: 'Periksa koneksi internet dan pastikan URL Google Apps Script di tab Setelan sudah benar. Jika sedang offline, data akan tetap tersimpan lokal dulu.',
  },
  {
    title: 'Hasil HCV belum muncul',
    body: 'Hasil HCV muncul setelah foto berhasil diambil. Setelah capture, buka tab HCV untuk melihat nomor pohon, foto, nilai, dan deskripsinya.',
  },
  {
    title: 'AI tinggi tidak langsung memberi angka',
    body: 'Pastikan tanaman terlihat jelas dan cahaya cukup. Jika AI visual gagal mendeteksi tinggi, aplikasi akan menampilkan Saran Otomatis dari riwayat sampel kalibrasi. Pengguna bisa menerima saran itu atau pindah ke mode Pixel Scale untuk pengukuran visual.',
  },
];

export const HelpTab: React.FC = () => {
  const [openFaqIndex, setOpenFaqIndex] = useState<number>(0);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-12">
      <section className="bg-[linear-gradient(135deg,#082f49_0%,#0f766e_48%,#dcfce7_100%)] rounded-[2.5rem] p-6 text-white shadow-[0_25px_60px_rgba(8,47,73,0.18)] border border-white/20 overflow-hidden relative">
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at top right, white 0, transparent 35%), radial-gradient(circle at bottom left, white 0, transparent 30%)' }} />
        <div className="relative space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 border border-white/20 text-[10px] font-black uppercase tracking-[0.22em]">
            Bantuan Pengguna
          </div>
          <div className="space-y-3 max-w-3xl">
            <h3 className="text-2xl font-black tracking-tight leading-tight">
              Aplikasi ini membantu siapa pun memantau revegetasi dengan cara yang lebih mudah, cepat, dan rapi.
            </h3>
            <p className="text-sm text-white/90 font-semibold leading-relaxed max-w-2xl">
              Anda tidak perlu menjadi ahli kehutanan atau revegetasi untuk mulai memakai aplikasi ini. Sistem dirancang agar pengguna cukup mengisi data dasar, mengambil foto tanaman, lalu aplikasi membantu menyimpan lokasi, kondisi, hasil HCV, dan riwayat data dalam satu alur kerja yang sederhana.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="w-2 h-2 rounded-full bg-cyan-500" />
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Apa yang Aplikasi Ini Lakukan</h4>
        </div>
        <div className="bg-white border border-slate-100 rounded-[2rem] p-5 shadow-sm space-y-3">
          <p className="text-[13px] font-semibold text-slate-700 leading-relaxed">
            Secara sederhana, aplikasi ini adalah alat bantu lapangan untuk mendokumentasikan tanaman hasil revegetasi. Saat Anda mengambil foto, aplikasi dapat menyimpan informasi penting seperti identitas pohon, jenis bibit, tinggi, status kesehatan, lokasi GPS, dan hasil HCV. Semua itu kemudian bisa dilihat kembali, dianalisis, dan dikirim ke cloud.
          </p>
          <p className="text-[13px] font-semibold text-slate-700 leading-relaxed">
            Artinya, pekerjaan yang biasanya tersebar di catatan manual, foto terpisah, dan file laporan bisa dirangkum di satu aplikasi. Ini membantu tim bekerja lebih cepat sekaligus menjaga data tetap rapi dan mudah dilacak.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Keunggulan Utama</h4>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {advantages.map((item) => (
            <div key={item} className="bg-white border border-slate-100 rounded-[1.75rem] px-5 py-4 shadow-sm flex gap-3 items-start">
              <div className="mt-1 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-black">✓</div>
              <p className="text-[13px] font-semibold text-slate-700 leading-relaxed">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cara Pakai Cepat</h4>
        </div>
        <div className="space-y-3">
          {quickSteps.map((step, index) => (
            <div key={step} className="bg-white border border-slate-100 rounded-[1.75rem] px-5 py-4 shadow-sm flex gap-4 items-start">
              <div className="w-8 h-8 rounded-2xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center text-[11px] font-black flex-shrink-0">
                {index + 1}
              </div>
              <p className="text-[13px] font-semibold text-slate-700 leading-relaxed">{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">FAQ</h4>
        </div>
        <div className="space-y-3">
          {faqItems.map((item, index) => {
            const isOpen = openFaqIndex === index;
            return (
              <div key={item.question} className="bg-white border border-slate-100 rounded-[1.75rem] shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? -1 : index)}
                  className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left"
                >
                  <span className="text-[13px] font-black text-slate-800 leading-relaxed">{item.question}</span>
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-black transition-all ${isOpen ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5">
                    <div className="h-px bg-slate-100 mb-4" />
                    <p className="text-[13px] font-semibold text-slate-700 leading-relaxed">{item.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="w-2 h-2 rounded-full bg-rose-500" />
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Troubleshooting Singkat</h4>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {troubleshootingItems.map((item) => (
            <div key={item.title} className="bg-rose-50 border border-rose-100 rounded-[1.75rem] px-5 py-4 shadow-sm">
              <p className="text-[12px] font-black text-rose-700 uppercase tracking-[0.16em] mb-2">{item.title}</p>
              <p className="text-[13px] font-semibold text-slate-700 leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};