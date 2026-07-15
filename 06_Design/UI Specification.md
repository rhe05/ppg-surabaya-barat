# UI SPECIFICATION
## Tahap 15 dari 23

Spesifikasi perilaku antarmuka (interaksi, state, responsive) — melengkapi Wireframe (Tahap 13) dan Design System (Tahap 14) dengan detail yang bisa langsung dipakai developer.

---

## 1. State Komponen

| Komponen | State yang Wajib Ada |
|---|---|
| Tombol Simpan | Default → Loading (spinner) → Sukses (toast hijau) / Gagal (toast merah + pesan jelas) |
| Card KPI | Loading (skeleton) → Berisi data → Kosong (visual pudar, Tahap 14) |
| Form Input Nilai | Default → Error validasi (border merah + pesan) → Valid |
| Badge Status | Statis, warna berdasar token (Tahap 14) |
| Context Bar Selector | Default → Loading saat filter berubah → Data ter-update |

## 2. Responsive Behavior

| Breakpoint | Perilaku |
|---|---|
| Desktop (≥1024px) | Sidebar selalu terlihat, layout multi-kolom |
| Tablet (768-1023px) | Sidebar dapat collapse jadi ikon saja |
| Mobile (<768px) | Sidebar jadi bottom-nav atau hamburger menu; card KPI stack vertikal; tabel jadi card-list (bukan tabel horizontal sempit) |

**Prioritas mobile:** Halaman Absen Santri (Alur B, Tahap 09) harus dioptimalkan mobile-first karena persona Admin Kelompok diasumsikan dominan pakai smartphone (Tahap 08).

## 3. Interaksi Kunci

| Interaksi | Spesifikasi |
|---|---|
| Simpan Absensi | Tap status → warna terisi langsung (optimistic UI) → tombol "Simpan" mengirim seluruh batch sekali → toast konfirmasi |
| Aktivasi Kelompok (Admin PPG) | Klik toggle → modal konfirmasi wajib ("Kelompok X akan online...") → baru dieksekusi |
| Tutup Periode Munaqosah | Klik tombol → modal wajib isi field "Estimasi buka kembali / kontak" → tidak bisa submit kosong |
| Catat Kenaikan Jenjang | Dari profil santri → form singkat (jenjang baru + catatan opsional) → riwayat lama tidak terhapus, hanya ditambah entri baru |

## 4. Aksesibilitas Dasar
- Kontras warna teks:background minimal rasio 4.5:1 (WCAG AA) — perlu verifikasi terhadap token warna Tahap 14
- Semua ikon aksi disertai label teks atau `aria-label`, tidak ikon polos tanpa konteks
- Ukuran target sentuh minimal 44×44px untuk elemen mobile (relevan untuk Absensi cepat)

---

## Quality Control — Tahap 15

**Selesai:** State komponen, breakpoint responsive, 4 interaksi kunci, dan prinsip aksesibilitas dasar terdefinisi.
**Kurang:** Belum ada prototipe interaktif — spesifikasi ini tekstual, akan diverifikasi visual saat implementasi (Tahap 21).
**Risiko:** Rendah.
**Lanjut ke Tahap 16 — Database Design.**

| Versi | Perubahan |
|---|---|
| 1.0 | Spesifikasi state, responsive, interaksi, aksesibilitas |
