'use client';

/* Banner pengingat "belum input absen" di Dashboard guru (opsi 1 dari 2
   yang diajukan owner 2026-08-24 -- opsi 2, push notification OS-level
   sungguhan, butuh app jadi PWA dulu, SENGAJA belum dikerjakan, itu
   proyek terpisah yang lebih besar). Susulan 2026-08-24: pengingat yang
   SAMA juga muncul di lonceng (BellPermintaanGuru.tsx, tampil di semua
   halaman guru bukan cuma Dashboard) -- algoritma "kelas+tanggal mana
   yang belum diisi" dipindah ke lib/pengingatAbsen.ts supaya keduanya
   TIDAK menduplikasi query/logikanya sendiri2.

   Pola SaaS standar (Slack/Notion/Linear "catch-up nudge"): banner amber
   (BUKAN merah -- ini pengingat, bukan error) muncul di atas daftar
   kelas Dashboard begitu guru buka app, dgn tombol "Isi Sekarang" yang
   LANGSUNG lompat ke /absensi dgn kelas+tanggal sudah terisi (deep-link
   lewat query string, lihat app/absensi/page.tsx) -- bukan cuma
   pemberitahuan pasif, tapi satu tap menuju penyelesaian.

   TANPA tombol tutup (diputuskan owner 2026-08-24, ronde kedua): ini
   status "ada tindakan yang diperlukan", bukan info yang boleh diabaikan
   -- pola GitHub "failing checks"/Linear "overdue", bukan pola toast yang
   boleh di-dismiss. Kalau ada tombol X, guru bisa menutupnya sekali lalu
   lupa padahal absennya tetap kosong; tanpa tombol itu, satu-satunya
   cara banner ini hilang adalah datanya BENAR-BENAR terisi. Ini otomatis
   terjadi lewat effect di bawah yang menghitung ulang tiap kali komponen
   dimuat (kembali ke Dashboard dari /absensi setelah Simpan, atau dari
   menu Input Kehadiran mana pun) -- tidak butuh mekanisme refresh
   tambahan. */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { hitungAbsenBelumDiisi, type AbsenHilang } from '@/lib/pengingatAbsen';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function labelTanggalPendek(tglStr: string) {
  const d = new Date(tglStr + 'T00:00:00');
  return `${d.getDate()} ${NAMA_BULAN[d.getMonth()]}`;
}

export default function PengingatAbsenBanner({
  kelas,
}: {
  /* Hanya kelas dgn santri aktif -- kelas kosong selalu "belum diisi"
     krn memang tidak pernah bisa py absensi, saring di pemanggil. */
  kelas: { id: number; nama: string }[];
}) {
  const router = useRouter();
  const [hilang, setHilang] = useState<AbsenHilang[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let batal = false;
    hitungAbsenBelumDiisi(kelas)
      .then((daftar) => {
        if (!batal) setHilang(daftar);
      })
      .catch(() => {
        // Pengingat bersifat non-kritis -- gagal diam-diam, jangan
        // mengganggu Dashboard dgn pesan error utk fitur sekunder ini.
      })
      .finally(() => {
        if (!batal) setLoading(false);
      });
    return () => {
      batal = true;
    };
  }, [kelas]);

  if (loading || hilang.length === 0) return null;

  const perKelas = new Map<number, { nama: string; tanggal: string[] }>();
  for (const h of hilang) {
    const ada = perKelas.get(h.kelasId);
    if (ada) ada.tanggal.push(h.tanggal);
    else perKelas.set(h.kelasId, { nama: h.kelasNama, tanggal: [h.tanggal] });
  }

  const paling_awal = hilang[0];

  return (
    <div className="mb-3 rounded-card border border-[#FDE68A] bg-[#FFFBEB] p-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FEF3C7] text-[#B45309]">
          <CalendarClock size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-[#92400E]">Ada absen yang belum diisi</div>
          <div className="mt-1 flex flex-col gap-0.5 text-[12px] text-[#92400E]/85">
            {[...perKelas.values()].map((k, idx) => (
              <div key={idx}>
                <span className="font-semibold">{k.nama}</span>
                {': '}
                {k.tanggal.map(labelTanggalPendek).join(', ')}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              router.push(`/absensi?kelasId=${paling_awal.kelasId}&tanggal=${paling_awal.tanggal}`)
            }
            className="mt-2.5 cursor-pointer rounded-[var(--radius-button)] border-none bg-[#B45309] px-3.5 py-1.5 text-[12px] font-bold text-white transition-transform duration-150 active:scale-[0.96]"
          >
            Isi Sekarang
          </button>
        </div>
      </div>
    </div>
  );
}
