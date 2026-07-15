# DATABASE DESIGN
## Tahap 16 dari 23

Skema relasional berdasarkan seluruh entitas yang teridentifikasi Tahap 01-15. Tipe data bersifat generik (dapat disesuaikan ke PostgreSQL/MySQL saat implementasi).

---

## 1. Entitas Organisasi

```
ppg
├── id (PK)
├── nama                    -- "PPG Surabaya Barat"

desa
├── id (PK)
├── ppg_id (FK → ppg)
├── nama                    -- "Petemon", "Purwodadi", dst

kelompok
├── id (PK)
├── desa_id (FK → desa)
├── nama                    -- "Kelp Petemon", dst
├── status_aktif            -- enum: aktif, belum_aktif (BR-02)
├── created_at
```
✅ **Seed data final (terkonfirmasi):** 18 Kelompok resmi (BR-01, dikoreksi dari angka "17" sebelumnya). Siap dipakai langsung untuk seed produksi:

```
Petemon: Kelp Petemon, Kelp Simo, Kelp Jl Semarang, Kelp Asem Jaya, Kelp DST
Purwodadi: Kelp Bangun Rejo, Kelp Purwodadi, Kelp Dupak
Tanbar: Manukan 1, Manukan 2, Candi Lontar, Wonorejo
Tantim: Balongsari, Dermo, Buntaran
Benowo: Sememi Barat, Sememi Timur, Pakal
```

## 2. Pengguna & Akses

```
users
├── id (PK)
├── nama
├── username (unique)
├── password_hash
├── role                    -- enum: admin_kelompok, admin_desa, admin_ppg (BR-04)
├── scope_type              -- enum: kelompok, desa, ppg
├── scope_id                -- FK polimorfik → kelompok.id / desa.id / ppg.id sesuai scope_type
├── created_at
```

## 3. Santri & Riwayat Jenjang

```
santri
├── id (PK)
├── kelompok_id (FK → kelompok)
├── nama
├── nis
├── gender                  -- enum: L, P
├── tanggal_lahir
├── jenjang_saat_ini         -- enum: AUD, Cabe Rawit, Pra Remaja, Remaja

riwayat_jenjang
├── id (PK)
├── santri_id (FK → santri)
├── jenjang_lama
├── jenjang_baru
├── tanggal
├── catatan                 -- opsional
├── dicatat_oleh (FK → users)  -- BR-14: tidak menimpa data lama
```

## 4. Guru

```
guru
├── id (PK)
├── kelompok_id (FK → kelompok)
├── nama
├── kategori                -- perlu klarifikasi Anda (padanan "Muballigh Tugasan/Setempat" utk konteks TPQ)
```

## 5. Absensi

```
absensi
├── id (PK)
├── santri_id (FK → santri)
├── tanggal
├── status                  -- enum: hadir, alpa, izin (BR-12)
├── dicatat_oleh (FK → users)
├── UNIQUE (santri_id, tanggal)
```

## 6. Munaqosah

```
periode_munaqosah
├── id (PK)
├── semester                -- mis. "Genap 2025/2026"
├── status                  -- enum: buka, tutup
├── estimasi_buka_kembali   -- wajib diisi saat status=tutup (BR-09)
├── kontak
├── diubah_oleh (FK → users)
├── diubah_pada

munaqosah
├── id (PK)
├── santri_id (FK → santri)
├── periode_id (FK → periode_munaqosah)
├── nilai                   -- 0-100
├── status                  -- enum: belum_dinilai, dinilai
├── dinilai_oleh (FK → users)
├── dinilai_pada
├── UNIQUE (santri_id, periode_id)
```

## 7. Modul Kurikulum

```
kurikulum_akhlaq
├── id (PK)
├── santri_id (FK → santri)
├── semester
├── nilai_akhlaq            -- 0-100 (BR-11)
├── catatan_capaian         -- [ASUMSI CAKUPAN — lihat Feature Breakdown §0]
├── dicatat_oleh (FK → users)
```

## 8. Bimbingan Konseling

```
konseling
├── id (PK)
├── santri_id (FK → santri)
├── tanggal
├── kategori
├── masalah
├── status
├── pencatat_id (FK → users)  -- jejak audit wajib (BR-08)
```

## 9. Dokumen

```
dokumen_folder
├── id (PK)
├── nama
├── parent_folder_id (FK → dokumen_folder, nullable)

dokumen_file
├── id (PK)
├── folder_id (FK → dokumen_folder)
├── nama_file
├── url
├── ukuran_kb
├── uploaded_by (FK → users)
├── uploaded_at
```

## 10. Kalender & Laporan

```
kalender_event
├── id (PK)
├── tanggal
├── judul
├── kategori                -- enum: hari_libur, kbm, musyawarah, pra_munaqosah
├── kelompok_id (FK → kelompok, nullable jika event lintas-Kelompok)

laporan_kbm
├── id (PK)
├── kelompok_id (FK → kelompok)
├── bulan, tahun
├── file_url
├── dibuat_oleh (FK → users)
```

## 11. Audit Log (Lintas Tabel)

```
audit_log
├── id (PK)
├── table_name
├── record_id
├── action                  -- enum: create, update, delete
├── user_id (FK → users)
├── timestamp
├── detail_perubahan        -- JSON, sebelum/sesudah
```
**Alasan:** Mendukung BR-16 (rekonsiliasi data) dan BR-08 (jejak audit konseling) secara struktural, bukan sekadar aturan di level aplikasi.

---

## 12. Relasi Kunci (Ringkasan)

```
ppg 1──* desa 1──* kelompok 1──* santri
                              └─* guru
santri 1──* absensi
santri 1──* munaqosah
santri 1──* riwayat_jenjang
santri 1──* kurikulum_akhlaq
santri 1──* konseling
users *──1 kelompok/desa/ppg (polimorfik via scope_type+scope_id)
```

---

## Quality Control — Tahap 16

**Selesai:** 12 entitas utama dengan field, tipe, relasi, dan constraint kunci (unique, FK) — mencakup seluruh business rule Tahap 12.
**Kurang:** Seed data 10 Kelompok masih placeholder; kategori Guru belum dipadankan konteks TPQ; struktur `catatan_capaian` di Kurikulum masih asumsi field bebas (perlu normalisasi lanjut jika cakupan modul diperjelas).
**Risiko:** Rendah-sedang — perubahan cakupan Modul Kurikulum berpotensi butuh tabel tambahan, tapi tidak mengubah skema inti lainnya.
**Lanjut ke Tahap 17 — System Architecture.**

| Versi | Perubahan |
|---|---|
| 1.0 | Skema 12 entitas, relasi, dan audit log |
