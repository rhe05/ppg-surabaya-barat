'use client';

/* Deteksi status koneksi (2026-08-28). Sebelum ini app sama sekali tidak
   punya penanganan offline -- guru di TPQ dengan sinyal tipis yang menekan
   "Simpan Kehadiran" cuma melihat pesan galat mentah dari fetch
   ("Failed to fetch" / "Load failed"), tanpa petunjuk bahwa masalahnya
   koneksi dan bukan datanya.

   `navigator.onLine` SENGAJA dipakai apa adanya, tanpa ping berkala ke
   server: nilainya memang cuma menandai ada-tidaknya sambungan jaringan
   (bukan jaminan server terjangkau), tapi itu sudah cukup utk membedakan
   dua kasus yang benar-benar berbeda BAGI PENGGUNA -- "HP Anda tidak
   terhubung" vs "ada galat lain". Ping berkala akan menambah lalu lintas
   terus-menerus di koneksi yang justru sedang lemah.

   Mulai dari `true` (bukan navigator.onLine) supaya render server & render
   pertama klien sama -- membaca navigator saat render pertama memicu
   hydration mismatch. Nilai sebenarnya masuk di efek. */

import { useEffect, useState } from 'react';

export function useKoneksi(): boolean {
  const [daring, setDaring] = useState(true);

  useEffect(() => {
    const perbarui = () => setDaring(navigator.onLine);
    perbarui();
    window.addEventListener('online', perbarui);
    window.addEventListener('offline', perbarui);
    return () => {
      window.removeEventListener('online', perbarui);
      window.removeEventListener('offline', perbarui);
    };
  }, []);

  return daring;
}

/* Apakah sebuah galat berasal dari koneksi, bukan dari data/izin? Dipakai
   utk mengganti pesan mentah supabase-js dengan kalimat yang bisa
   ditindaklanjuti. Pesannya beda-beda tiap peramban, jadi dicocokkan
   longgar. */
export function galatKoneksi(pesan: string | null | undefined): boolean {
  if (!pesan) return false;
  const p = pesan.toLowerCase();
  return (
    p.includes('failed to fetch') ||
    p.includes('load failed') ||
    p.includes('networkerror') ||
    p.includes('network error') ||
    p.includes('fetch failed') ||
    p.includes('err_internet') ||
    p.includes('timeout')
  );
}

/* Pesan galat siap tampil: galat koneksi diterjemahkan, sisanya apa
   adanya (jangan menutupi galat sungguhan dengan tebakan). */
export function pesanGalatRamah(pesan: string): string {
  return galatKoneksi(pesan)
    ? 'Tidak bisa terhubung ke server. Periksa koneksi internet Anda, lalu coba lagi.'
    : pesan;
}
