/* Urutan & warna jenjang santri — satu sumber dipakai
   components/SantriList.tsx (kartu ringkasan) dan
   components/santri/RingkasanDesaGenerus.tsx (perbandingan antar desa),
   supaya urutan & warnanya tidak bisa drift antar dua tempat. Nilai HARUS
   cocok persis dgn enum santri_jenjang di Postgres (migrasi
   20260805080137_database_foundation.sql, direname 20260820100000 dari
   'AUD' -> 'PAUD/TK'). Warna dari token app lama (globals.css). */
export const JENJANG_URUT = ['PAUD/TK', 'Cabe Rawit', 'Pra Remaja', 'Remaja SMA', 'Remaja'] as const;

export const WARNA_JENJANG: Record<(typeof JENJANG_URUT)[number], string> = {
  'PAUD/TK': '#D97706',
  'Cabe Rawit': '#059669',
  'Pra Remaja': '#D97706',
  'Remaja SMA': '#4F46E5',
  Remaja: '#0D9488',
};
