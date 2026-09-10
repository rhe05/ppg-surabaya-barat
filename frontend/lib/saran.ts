/* Bentuk saran ketik (combobox "seperti Google") + pembangun daftarnya.
   Diangkat dari components/santri/SantriForm.tsx (2026-08-29) jadi modul
   bersama supaya dipakai ulang di form lain (mis. Tambah Jamaah). */

export type SaranItem<T = unknown> = { teks: string; rec?: T };

/* Nilai unik (case-insensitive) dari satu kolom, urutan sesuai `daftar`
   (pemanggil yang mengatur order dari DB). Untuk field yang cuma perlu
   saran teks tanpa autofill lanjutan. */
export function saranTeksUnik(daftar: (string | null | undefined)[]): SaranItem[] {
  const dilihat = new Set<string>();
  const hasil: SaranItem[] = [];
  for (const v of daftar) {
    const t = (v ?? '').trim();
    if (!t || dilihat.has(t.toLowerCase())) continue;
    dilihat.add(t.toLowerCase());
    hasil.push({ teks: t });
  }
  return hasil;
}

/* Sama, tapi tiap saran membawa baris sumbernya (`rec`) — supaya klik
   satu saran bisa langsung menarik seluruh data yang menyertainya
   (alamat, WA, wilayah, dst). */
export function saranUnikDenganRec<T>(
  daftar: T[],
  ambil: (r: T) => string | null | undefined,
): SaranItem<T>[] {
  const dilihat = new Set<string>();
  const hasil: SaranItem<T>[] = [];
  for (const r of daftar) {
    const t = (ambil(r) ?? '').trim();
    if (!t || dilihat.has(t.toLowerCase())) continue;
    dilihat.add(t.toLowerCase());
    hasil.push({ teks: t, rec: r });
  }
  return hasil;
}
