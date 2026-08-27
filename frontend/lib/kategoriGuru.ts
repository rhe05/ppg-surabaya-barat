/* Kategori guru — disimpan NETRAL-GENDER di DB (`guru.kategori`), tapi
   istilahnya berbentuk gender di TAMPILAN (diminta owner 2026-08-27):
   perempuan memakai "Muballighot ...", laki-laki "Muballigh ...".
   "Guru Bantu" / "Guru Mutu" / "Ketua Muda-i" tidak berbentuk gender.

   Nilai kanonik ini yang disimpan & dipakai sbg kunci (warna badge,
   agregasi KPI, dsb). Panggil labelKategoriGuru() HANYA saat menampilkan
   ke satu orang yang diketahui jenis kelaminnya. */

export const KATEGORI_GURU = [
  'Muballigh Tugasan',
  'Muballigh Setempat',
  'Guru Bantu',
  'Ketua Muda-i',
] as const;

const BENTUK_PEREMPUAN: Record<string, string> = {
  'Muballigh Tugasan': 'Muballighot Tugasan',
  'Muballigh Setempat': 'Muballighot Setempat',
};

export function labelKategoriGuru(
  kategori: string | null | undefined,
  jenisKelamin: string | null | undefined,
): string {
  if (!kategori) return '';
  if (jenisKelamin === 'P') return BENTUK_PEREMPUAN[kategori] ?? kategori;
  return kategori;
}
