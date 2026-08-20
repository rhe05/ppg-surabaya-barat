/* Label tampilan per peran — dulu cuma dipakai AdminSidebar (identitas di
   footer, di atas tombol Keluar), sekarang juga dipakai header halaman
   (mis. app/santri/page.tsx, diminta owner 20 Agt: pindah label peran dari
   sidebar ke pojok kanan atas blok header putih). Satu sumber supaya kedua
   tempat itu tidak bisa drift. */
export const LABEL_PERAN: Record<string, string> = {
  admin_ppg: 'Admin Aplikasi',
  admin_desa: 'Admin Desa',
  admin_kelompok: 'Admin Kelompok',
  guru: 'Guru',
};
