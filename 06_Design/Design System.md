# DESIGN SYSTEM
## Tahap 14 dari 23

Diturunkan dari verifikasi visual aplikasi referensi (Tahap 01 §6) dan diperbaiki sesuai kelemahan Tahap 02 — **bukan** ditiru mentah.

---

## 1. Warna

| Token | Nilai (usulan) | Pemakaian |
|---|---|---|
| `--color-primary` | #2563EB (biru) | Aksi utama, elemen aktif |
| `--color-success` | #16A34A (hijau) | Status Hadir, Dinilai, Aktif |
| `--color-warning` | #D97706 (kuning/amber) | Status Izin, peringatan |
| `--color-danger` | #DC2626 (merah) | Status Alpa, hapus, alert kritis |
| `--color-neutral-bg` | #F8FAFC (abu sangat muda) | Latar halaman |
| `--color-surface` | #FFFFFF | Card, panel |
| `--color-text-primary` | #0F172A | Judul, teks utama |
| `--color-text-secondary` | #64748B | Label, teks sekunder |
| `--color-empty-state` | #E2E8F0 (pudar, bukan warna solid) | **Perbaikan Tahap 02**: card kosong secara visual jelas beda dari card berisi data |

## 2. Tipografi

| Token | Nilai |
|---|---|
| Font family | Inter / system-ui (sans-serif) |
| `--text-h1` | 24px / bold |
| `--text-h2` | 18px / semibold |
| `--text-stat` | 30px / bold (angka statistik besar) |
| `--text-body` | 14px / regular |
| `--text-label` | 12px / regular, warna secondary |
| `--text-brand-title` | 20px / bold — untuk "PPG" di area logo |
| `--text-brand-subtitle` | 12px / medium, warna secondary, letter-spacing sedikit lebar — untuk "Surabaya Barat" di bawah "PPG" |

**Penempatan branding (area logo sidebar/header):**
```
┌─────────────┐
│ [Ikon]  PPG │  ← --text-brand-title
│   Surabaya  │  ← --text-brand-subtitle
│    Barat    │
└─────────────┘
```
Konsisten dengan posisi logo di Wireframe Tahap 13 §1-2 (pojok kiri atas, area sidebar/header).

## 3. Spacing & Radius

| Token | Nilai |
|---|---|
| `--radius-card` | 14px |
| `--radius-button` | 999px (pill, sesuai temuan Tahap 01 §6a) |
| `--space-card-padding` | 20px |
| `--space-section-gap` | 24px |

## 4. Komponen Inti

| Komponen | Spesifikasi Kunci |
|---|---|
| Badge Status | Pill kecil, warna sesuai token status (success/warning/danger/neutral) — dipakai konsisten di Absensi, Munaqosah, Kelompok |
| Card KPI | Radius 14px, warna solid untuk data valid, warna pudar (`--color-empty-state`) untuk kosong |
| Context Bar | Sticky di atas konten, adaptif menampilkan selector sesuai role (Tahap 10 §4) |
| Toast Notification | Muncul kanan-atas, auto-dismiss 3 detik, dipakai untuk konfirmasi simpan |
| Empty State | Ikon + teks singkat + CTA jika relevan (bukan hanya teks datar) |

## 5. Ikonografi
Gaya outline/line-icon minimalis (konsisten temuan Tahap 01 §6). 1 ikon unik per menu sidebar.

---

## Quality Control — Tahap 14

**Selesai:** Token warna, tipografi, spacing, radius, dan 5 komponen inti terdefinisi, dengan token khusus (`--color-empty-state`) yang secara sengaja memperbaiki kelemahan Tahap 02.
**Kurang:** Palet warna final (hex persis) adalah usulan — idealnya divalidasi dengan uji kontras aksesibilitas (WCAG) sebelum implementasi.
**Risiko:** Rendah.
**Lanjut ke Tahap 15 — UI Specification.**

| Versi | Perubahan |
|---|---|
| 1.0 | Design token & komponen inti |
