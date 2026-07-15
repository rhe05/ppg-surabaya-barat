# WIREFRAME
## Tahap 13 dari 23

Wireframe di bawah bersifat **low-fidelity struktural** (blok tata letak, bukan visual final) — merepresentasikan Bagian 2 (Sitemap) dan pola layout Tahap 01 §4.1, disesuaikan dengan context bar adaptif dari Tahap 10.

---

## 1. Dashboard (Admin Kelompok)

```
┌─────────────────────────────────────────────────┐
│ [Logo] TPQ App     [Context: Semester ▾]  [User▾]│
├───────────┬─────────────────────────────────────┤
│ Sidebar   │  Dashboard — Kelp Petemon            │
│ ▸Dashboard│  ┌─────────────┐ ┌─────────────┐     │
│  Absen    │  │ Total Santri│ │ Total Guru  │     │
│  Munaqosah│  └─────────────┘ └─────────────┘     │
│  Data     │  ┌───────────────────────────────┐   │
│  Santri   │  │ Santri Teladan (list ringkas)  │   │
│  Kurikulum│  └───────────────────────────────┘   │
│  BK       │  ┌───────────┐ ┌───────────────┐     │
│  Guru     │  │ Agenda    │ │ Perlu Perhatian│    │
│  Unduhan  │  │ Terdekat  │ │ (Alpa >20%)   │     │
│  Kalender │  └───────────┘ └───────────────┘     │
│  Laporan  │                                       │
│  Peringkat│                                       │
│  Keluar   │                                       │
└───────────┴─────────────────────────────────────┘
```
**Catatan:** Tidak ada selector Desa/Kelompok di context bar (scope tetap 1 Kelompok, sesuai Tahap 10 §4).

---

## 2. Dashboard (Admin Desa — Purwodadi)

```
┌─────────────────────────────────────────────────┐
│ [Logo]  [Context: Semester ▾ | Kelompok: Semua ▾]│
├───────────┬─────────────────────────────────────┤
│ Sidebar   │  Dashboard — Desa Purwodadi           │
│ ▸Dashboard│  ┌─────────────────────────────────┐ │
│  Banding  │  │ Perbandingan 3 Kelompok (tabel)  │ │
│  Kelompok │  │ Bangun Rejo | Purwodadi | Dupak  │ │
│  Absen    │  │  Hadir 92%  |   88%     |  95%   │ │
│  Munaqosah│  └─────────────────────────────────┘ │
│  ...      │  ┌─────────────┐ ┌─────────────┐     │
│  Keluar   │  │Total Santri │ │Total Guru   │     │
│           │  └─────────────┘ └─────────────┘     │
└───────────┴─────────────────────────────────────┘
```
**Catatan:** Selector Kelompok muncul (bisa pilih di antara Kelompok di Desanya); selector Desa tersembunyi (scope tetap 1 Desa).

---

## 3. Absen Santri — Input Cepat (Admin Kelompok)

```
┌─────────────────────────────────────────────────┐
│ Absen Santri — [Tanggal: Hari ini ▾]             │
├─────────────────────────────────────────────────┤
│ Nama Santri          [Hadir] [Alpa] [Izin]       │
│ ─────────────────────────────────────────────── │
│ Ahmad Fauzi            (●)    ( )     ( )        │
│ Siti Aminah            (●)    ( )     ( )        │
│ ...                                              │
├─────────────────────────────────────────────────┤
│                          [Simpan Kehadiran]      │
└─────────────────────────────────────────────────┘
```
**Catatan:** 1 tap per status per santri, tombol simpan tunggal di bawah — meminimalkan langkah sesuai prioritas Alur B (Tahap 09).

---

## 4. Munaqosah — Banner & Input Nilai

```
┌─────────────────────────────────────────────────┐
│ ⚠ Periode ditutup. Dibuka kembali: 20 Jul 2026.  │
│    Hubungi: Admin Desa Purwodadi                 │
├─────────────────────────────────────────────────┤
│ [Cari santri...] [Semester ▾] [Kelas ▾]          │
├─────────────────────────────────────────────────┤
│ Nama         Kelas        Status                 │
│ Ahmad Fauzi  Cabe Rawit   ● Belum Dinilai        │
│ Siti Aminah  Remaja       ● Dinilai              │
└─────────────────────────────────────────────────┘
```
**Catatan:** Badge status berwarna (bukan teks abu-abu polos seperti referensi) — memperbaiki temuan Tahap 02.

---

## 5. Profil Santri — Akses Cepat & Kenaikan Jenjang

```
┌─────────────────────────────────────────────────┐
│ ← Kembali    Ahmad Fauzi — Cabe Rawit             │
├─────────────────────────────────────────────────┤
│ [Biodata] [Kehadiran] [Munaqosah] [Kurikulum]    │
│ [Konseling] [Riwayat Jenjang]                    │
├─────────────────────────────────────────────────┤
│  Jenjang saat ini: Cabe Rawit                    │
│  [Catat Kenaikan Jenjang →]                      │
└─────────────────────────────────────────────────┘
```
**Catatan:** Tombol "Catat Kenaikan Jenjang" menempel langsung di profil (bukan menu terpisah) — sesuai temuan titik rawan Alur C (Tahap 09).

---

## Quality Control — Tahap 13

**Selesai:** 5 wireframe kunci (Dashboard×2, Absensi, Munaqosah, Profil Santri) — mencakup titik-titik kritis dari User Journey Tahap 09.
**Kurang:** Wireframe modul lain (Data Guru, Kurikulum, Konseling, Unduhan, Kalender, Laporan, Peringkat, Manajemen Kelompok) belum dibuat individual — mengikuti pola layout standar (Tahap 01 §4.1) sehingga risiko rendah jika ditunda ke implementasi.
**Risiko:** Rendah.
**Lanjut ke Tahap 14 — Design System.**

| Versi | Perubahan |
|---|---|
| 1.0 | 5 wireframe struktural kunci |
