# TESTING PLAN
## Tahap 22 dari 23

---

## 1. Strategi Pengujian

| Level | Cakupan | Prioritas |
|---|---|---|
| Unit Test | Business logic kritis: kalkulasi Santri Teladan (BR-10), validasi RBAC (`canAccessKelompok`, `canDelete`) | Tinggi |
| Integration Test | Endpoint API — terutama yang mengubah data lintas-tabel (mis. tutup periode Munaqosah → trigger rekalkulasi Santri Teladan) | Tinggi |
| Manual/UAT | Seluruh alur di User Journey (Tahap 09) diuji langsung oleh pengguna pilot nyata | **Wajib**, tidak bisa digantikan otomatis |

## 2. Kasus Uji Kritis (Berbasis Business Rules)

| ID | Skenario | Hasil Diharapkan | Sumber Aturan |
|---|---|---|---|
| TC-01 | Admin Kelompok A mencoba akses data Kelompok B | Ditolak (403 FORBIDDEN_SCOPE) | BR-05 |
| TC-02 | Admin Desa mencoba menghapus data santri | Ditolak — hanya Admin Kelompok yang boleh hapus | BR-06/07 |
| TC-03 | Admin PPG mengaktifkan Kelompok | Status berubah, tercatat di audit_log | BR-02, BR-16 |
| TC-04 | Admin Desa menutup periode Munaqosah tanpa isi estimasi buka kembali | Ditolak — field wajib | BR-09 |
| TC-05 | Santri memenuhi Nilai≥90, Akhlaq≥90, Kehadiran≥95% di 1 semester | Muncul di daftar Santri Teladan otomatis | BR-10 |
| TC-06 | Santri Alpa >20% dalam 1 bulan | Ditandai "perlu perhatian" di dashboard | BR-13 |
| TC-07 | Input 2 baris absensi untuk santri+tanggal yang sama | Baris kedua meng-update (upsert), bukan duplikat | Skema `@@unique([santriId, tanggal])` |
| TC-08 | Total guru per kategori tidak sama dengan total keseluruhan | Sistem menandai/menolak data tidak konsisten | BR-16, merespons temuan Tahap 02 |
| TC-09 | Kelompok berstatus "Belum Aktif" | Tidak muncul di pilihan filter default, tapi tetap ada di data | BR-18 |
| TC-10 | Kenaikan jenjang santri dicatat 2 kali | Riwayat lama tidak hilang, tersimpan berurutan | BR-14, BR-17 |

## 3. Rencana UAT (User Acceptance Testing) — Fase Pilot

| Peserta | Skenario Diuji |
|---|---|
| Admin Kelp Petemon | Alur A (onboarding), Alur B (absensi harian), Alur C (Munaqosah & kenaikan jenjang) |
| Admin Kelp Bangun Rejo/Purwodadi/Dupak | Sama seperti di atas, memverifikasi konsistensi lintas-Kelompok dalam 1 Desa |
| Admin Desa Purwodadi | Alur D (perbandingan antar-Kelompok) |
| Admin PPG | Alur E (aktivasi Kelompok) |

**Kriteria sukses UAT:** Pengguna pilot dapat menyelesaikan tugas inti (Alur A-C) **tanpa bantuan intensif** setelah pelatihan awal — sesuai indikator strategis yang ditetapkan Tahap 04 §6.

## 4. Pengujian Non-Fungsional

| Aspek | Cara Uji |
|---|---|
| Performa | Load test dashboard dengan data skala penuh (18 Kelompok, estimasi jumlah santri) sebelum rollout diperluas |
| Keamanan | Coba akses endpoint tanpa token, dengan token kadaluarsa, dan dengan scope salah — pastikan semua ditolak |
| Aksesibilitas | Cek kontras warna sesuai token Tahap 14, uji ukuran target sentuh mobile |

---

## Quality Control — Tahap 22

**Selesai:** 10 kasus uji kritis langsung diturunkan dari Business Rules (bukan generik), rencana UAT terstruktur per role, pengujian non-fungsional dicakup.
**Kurang:** Belum ada automated test suite tertulis (kode) — scaffold Tahap 21 belum mencakup testing framework.
**Risiko:** Rendah — rencana ini cukup untuk memandu QA manual maupun otomatis saat development berjalan.
**Lanjut ke Tahap 23 — Deployment.**

| Versi | Perubahan |
|---|---|
| 1.0 | 10 kasus uji kritis, rencana UAT pilot |
