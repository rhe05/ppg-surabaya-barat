'use client';

/* Banner pengingat "belum input absen" di Dashboard guru (opsi 1 dari 2
   yang diajukan owner 2026-08-24 -- opsi 2, push notification OS-level
   sungguhan, butuh app jadi PWA dulu, SENGAJA belum dikerjakan, itu
   proyek terpisah yang lebih besar).

   Pola SaaS standar (Slack/Notion/Linear "catch-up nudge"): banner amber
   (BUKAN merah -- ini pengingat, bukan error) muncul di atas daftar
   kelas Dashboard begitu guru buka app, berisi tanggal2 kerja 7 hari
   terakhir yang kelasnya belum py baris absensi sama sekali, dgn tombol
   "Isi Sekarang" yang LANGSUNG lompat ke /absensi dgn kelas+tanggal
   sudah terisi (deep-link lewat query string, lihat app/absensi/page.tsx)
   -- bukan cuma pemberitahuan pasif, tapi satu tap menuju penyelesaian.

   Jendela dicek: 7 hari kalender ke belakang dari KEMARIN (bukan hari
   ini -- sesi hari ini mungkin belum selesai/belum waktunya), disaring
   Sabtu/Minggu/tanggal merah pakai nonaktifAkhirPekanLibur yang sama
   dgn kalender Input Kehadiran, supaya definisi "hari kerja" konsisten
   di seluruh app.

   "Belum diisi" = kelas itu NOL baris absensi utk tanggal itu (bukan
   sebagian) -- sama dgn definisi "Hari Aktif" di GuruDashboard/Riwayat
   Kehadiran (tanggalPerKelas Set, hariAktif = ukurannya). Kelas dgn 0
   santri aktif SENGAJA dilewati (pemanggil menyaring lewat prop `kelas`)
   -- kalau tidak, kelas kosong akan SELALU muncul "belum diisi" krn
   memang tidak pernah bisa py absensi.

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
import { supabase } from '@/lib/supabase';
import { nonaktifAkhirPekanLibur } from '@/lib/liburNasional';

const JUMLAH_HARI_DICEK = 7;

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function tanggalStr(d: Date) {
  const dua = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
}

function labelTanggalPendek(tglStr: string) {
  const d = new Date(tglStr + 'T00:00:00');
  return `${d.getDate()} ${NAMA_BULAN[d.getMonth()]}`;
}

type Hilang = { kelasId: number; kelasNama: string; tanggal: string };

export default function PengingatAbsenBanner({
  kelas,
}: {
  /* Hanya kelas dgn santri aktif -- kelas kosong selalu "belum diisi"
     krn memang tidak pernah bisa py absensi, saring di pemanggil. */
  kelas: { id: number; nama: string }[];
}) {
  const router = useRouter();
  const [hilang, setHilang] = useState<Hilang[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let batal = false;

    async function cek() {
      if (kelas.length === 0) {
        setLoading(false);
        return;
      }

      const kandidat: string[] = [];
      const sekarang = new Date();
      for (let i = 1; i <= JUMLAH_HARI_DICEK; i++) {
        const d = new Date(sekarang);
        d.setDate(d.getDate() - i);
        const s = tanggalStr(d);
        if (!nonaktifAkhirPekanLibur(s, d)) kandidat.push(s);
      }
      if (kandidat.length === 0) {
        setLoading(false);
        return;
      }
      const awal = kandidat[kandidat.length - 1];
      const akhir = kandidat[0];

      try {
        const kelasIds = kelas.map((k) => k.id);
        const { data: santriData, error: errSantri } = await supabase
          .from('santri')
          .select('id, kelas_id')
          .in('kelas_id', kelasIds)
          .is('deleted_at', null);
        if (errSantri) throw errSantri;

        const kelasDariSantri = new Map<number, number>();
        (santriData ?? []).forEach((s) => {
          if (s.kelas_id != null) kelasDariSantri.set(s.id, s.kelas_id);
        });

        const terisi = new Map<number, Set<string>>();
        kelasIds.forEach((id) => terisi.set(id, new Set()));

        if (kelasDariSantri.size > 0) {
          const santriIds = [...kelasDariSantri.keys()];
          const { data: absensiData, error: errAbsensi } = await supabase
            .from('absensi')
            .select('santri_id, tanggal')
            .in('santri_id', santriIds)
            .gte('tanggal', awal)
            .lte('tanggal', akhir)
            .is('deleted_at', null);
          if (errAbsensi) throw errAbsensi;

          (absensiData ?? []).forEach((a) => {
            const kId = kelasDariSantri.get(a.santri_id);
            if (kId != null) terisi.get(kId)?.add(a.tanggal);
          });
        }

        if (batal) return;
        const daftar: Hilang[] = [];
        for (const k of kelas) {
          for (const tgl of kandidat) {
            if (!terisi.get(k.id)?.has(tgl)) {
              daftar.push({ kelasId: k.id, kelasNama: k.nama, tanggal: tgl });
            }
          }
        }
        daftar.sort((a, b) => a.tanggal.localeCompare(b.tanggal));
        setHilang(daftar);
      } catch {
        // Pengingat bersifat non-kritis -- gagal diam-diam, jangan
        // mengganggu Dashboard dgn pesan error utk fitur sekunder ini.
      } finally {
        if (!batal) setLoading(false);
      }
    }

    cek();
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
