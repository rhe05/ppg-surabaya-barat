# BUSINESS RULES
## Tahap 12 dari 23

| Field | Isi |
|---|---|
| Status | Draft — final, mengonsolidasikan seluruh aturan dari Tahap 01-11 |

---

## 1. Aturan Organisasi & Struktur Data

| ID | Aturan |
|---|---|
| BR-01 | Struktur organisasi 3 tingkat: PPG → Desa → Kelompok. 1 PPG (Surabaya Barat), 5 Desa, 18 Kelompok. |
| BR-02 | Setiap Kelompok memiliki status `Aktif` / `Belum Aktif`. Hanya Admin PPG yang dapat mengubah status ini. |
| BR-03 | Setiap santri terikat ke tepat 1 Kelompok pada satu waktu. |
| BR-04 | Setiap pengguna (user) terikat ke tepat 1 role dan 1 scope (Kelompok/Desa/PPG) — tidak ada multi-role. |

## 2. Aturan Akses & Kewenangan

| ID | Aturan |
|---|---|
| BR-05 | Admin Kelompok: akses penuh (lihat/input/edit/hapus) terbatas ke Kelompoknya sendiri. |
| BR-06 | Admin Desa: lihat seluruh Kelompok di Desanya; tidak dapat menghapus data. |
| BR-07 | Admin PPG: lihat seluruh organisasi; tidak dapat menghapus data operasional; dapat mengubah status Kelompok. |
| BR-08 | Data Bimbingan Konseling dapat dilihat seluruh role tanpa pembatasan tambahan, namun tetap tercatat jejak audit (pencatat, waktu). |
| BR-09 | Periode input nilai Munaqosah dibuka/ditutup oleh Admin Desa atau Admin PPG. Saat menutup, wajib mencantumkan estimasi/kontak. |

## 3. Aturan Penilaian & Kriteria

| ID | Aturan |
|---|---|
| BR-10 | Kriteria Santri Teladan: Rata-rata Nilai Munaqosah ≥90, Nilai Akhlaq ≥90, Persentase Kehadiran ≥95% — dalam satu periode semester yang sama. |
| BR-11 | Nilai Akhlaq bersumber dari Modul Kurikulum. |
| BR-12 | Absensi memakai 3 status: Hadir, Alpa, Izin. Persentase kehadiran = Hadir / (Hadir+Alpa+Izin) × 100%. |
| BR-13 | Santri dengan Alpa >20% dalam 1 bulan ditandai "perlu perhatian" (ambang dapat dikonfigurasi Admin PPG). |
| BR-14 | Penempatan/kenaikan jenjang (AUD/Cabe Rawit/Pra Remaja/Remaja) berdasarkan kemampuan, diputuskan manual per-santri oleh Admin Kelompok, dicatat dengan riwayat (bukan menimpa data lama). |
| BR-15 | Formula ranking Peringkat KBM: **[BELUM DIDEFINISIKAN — default sementara: rata-rata gabungan Nilai Munaqosah + Akhlaq + persentase Kehadiran, bobot sama]**. Perlu dikonfirmasi Anda; ditandai sebagai parameter yang bisa diubah, bukan hardcode. |

## 4. Aturan Integritas Data

| ID | Aturan |
|---|---|
| BR-16 | Setiap angka agregat/ringkasan harus dapat direkonsiliasi ke data rincinya — sistem harus mencegah kondisi seperti temuan Tahap 02 (subtotal ≠ total). |
| BR-17 | Data historis (kenaikan jenjang, penilaian per periode) tidak boleh ditimpa — disimpan sebagai riwayat berurutan waktu. |
| BR-18 | Kelompok berstatus "Belum Aktif" tidak muncul di pilihan filter default, namun tetap ada di data (tidak dihapus). |

## 5. Aturan Cakupan (Out of Scope)

| ID | Aturan |
|---|---|
| BR-19 | Pembayaran/SPP/infaq: tidak diimplementasikan. |
| BR-20 | Notifikasi otomatis ke wali santri: tidak diimplementasikan. |
| BR-21 | Sertifikat digital/kelulusan khatam: tidak diimplementasikan (default, mengikuti pola BR-19/20). |

---

## Quality Control — Tahap 12

**Selesai:** 21 business rule terformalkan dari seluruh temuan Tahap 01-11, terorganisir per kategori.
**Kurang:** BR-15 (formula ranking) masih default sementara, perlu konfirmasi Anda kapan saja sebelum Tahap 21 (Development).
**Risiko:** Rendah — seluruh aturan konsisten dengan keputusan yang sudah dikonfirmasi; hanya BR-15 murni default tebakan wajar.
**Lanjut ke Tahap 13 — Wireframe.**

| Versi | Perubahan |
|---|---|
| 1.0 | Konsolidasi final 21 business rule |
