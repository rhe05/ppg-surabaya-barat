# Design Tokens — Dashboard GURU (mobile) app GAS lama

> Pelengkap `design-tokens-lama.md`, **bukan pengganti**. Recon Langkah 1 ulang.
> **Nol perubahan kode Next.js.**
> Sumber: `13_AppsScript/Style_Main.html`, `Markup_Screens.html`, `Script_Main.html`.
> Tanggal recon: 2026-08-16.

---

## 0. Kabar baik: seluruh warna ADA di sumber, tidak ada yang perlu ditebak

Dashboard guru **tidak** di-generate dengan style inline. Semuanya kelas CSS
ber-prefix `.ia-*` di `Style_Main.html`, dirender oleh
`Script_Main.html:2559-2632`. Setiap warna di bawah adalah nilai persis dari file.

---

## 1. Kenapa recon pertama meleset — dan apakah dokumen lama jadi salah

**Tidak salah, tapi tidak lengkap.** Aplikasi lama punya **dua dashboard yang
sama sekali berbeda**, dipilih berdasarkan role di `Script_Main.html:227-245`:

| Role | Layar | Isi |
|---|---|---|
| `guru` | `#screenInputAbsen` (mobile) | **Yang Anda lihat sebagai Neiza** — hero hijau + kartu per kelas |
| `admin_kelp` | `#screenInputAbsen` (mobile) | Sama, + baris KPI hero khusus |
| `admin_ppg`, `admin_desa`, `admin_kelompok` | `appLayout` + `#screenDashboard` | KPI grid + tabel per desa |

Komentar di sumber eksplisit (`Script_Main.html:226`): role `guru` **tidak pernah**
melihat shell admin — dikunci total ke layar mobile-nya sendiri.

Jadi: `design-tokens-lama.md` mendokumentasikan dashboard **admin**, dan itu tetap
akurat untuk role admin. Yang salah adalah **asumsi saya bahwa hanya ada satu
dashboard**. Konsekuensinya untuk commit `a89d32d`, lihat Bagian 7.

---

## 2. Header (`.ia-header`, Style_Main.html:4859-4865)

```css
.ia-header {
  background: var(--panel);
  border-radius: 0 0 24px 24px;          /* sudut bawah membulat */
  box-shadow: 0 6px 20px rgba(5, 150, 105, 0.22);   /* shadow bertinta hijau */
  overflow: hidden;
}
```

### 2.1 Topbar — hamburger + logo + bell (:4867-4901)
```css
.ia-topbar          { display:flex; align-items:center; gap:10px;
                      background:var(--panel); padding:14px 18px 12px; }
.ia-app-brand       { flex:1; display:flex; align-items:center; gap:7px; }
.ia-app-brand-name  { color:var(--brand-green);   /* #6B9975 */
                      font-size:15px; font-weight:800; letter-spacing:.01em; }
.ia-topbar-actions  { display:flex; gap:8px; }
```

**Ikon daun/tanaman**: bukan SVG dan bukan file — **PNG base64 tertanam langsung**
di `Markup_Screens.html:~200` (`<img class="ia-app-brand-icon" width="20" height="18">`).
Untuk dipakai di Next.js, base64-nya harus disalin dari sana atau diekspor jadi
file di `public/`. Ini keputusan Anda, bukan sesuatu yang bisa saya karang.

### 2.2 Tombol bulat hamburger & bell (:4945-4958, :5046-5064)
```css
.ia-hamburger-btn,
.ia-icon-btn {
  width:40px; height:40px; border-radius:50%; border:none;
  background: var(--panel-2);            /* #F9FAFB */
  color: var(--sage);                    /* #059669 — ikon hijau */
  display:flex; align-items:center; justify-content:center;
  transition: transform .15s ease, background .15s ease;
}
.ia-icon-btn:active { transform:scale(.92); background:var(--border); }
```

Ikon SVG: `stroke="currentColor"`, `stroke-width="2"`, `fill="none"`,
linecap/linejoin `round`. Hamburger 22×22, bell 20×20, kalender 19×19.

### 2.3 Badge notifikasi (:5075+)
```css
.ia-badge { position:absolute; top:-2px; right:-2px;
            background:var(--red); color:#fff;
            font-size:10px; font-weight:700;
            min-width:16px; height:16px; border-radius:999px; }
```

---

## 3. Kartu profil gradient hijau (`.ia-header-hero`, :4903-4910)

```css
.ia-header-hero {
  display:flex; align-items:flex-start; justify-content:space-between; gap:10px;
  background: linear-gradient(135deg, var(--sage) 0%, var(--brand-green) 100%);
  /*                                  #059669          #6B9975              */
  padding: 16px 18px 20px;
}
```

⚠️ Gradient-nya **hijau→hijau-sage**, bukan hijau→teal. Sudut 135deg.

### 3.1 Tiga baris teks kiri (:5026-5044)
```css
.ia-greeting        { flex:1; min-width:0; }
.ia-greeting-name   { color:#fff; font-size:20px; font-weight:700; line-height:1.2; }
.ia-greeting-kelas  { color:rgba(255,255,255,0.88); font-size:12.5px;
                      font-weight:600; margin-top:3px; letter-spacing:.01em; }
```
Isi (dari `Script_Main.html:553`, `705-707`, `716`):
1. `#iaNamaGuru` → nama guru — "Neiza Adinda Nazalia"
2. `#iaGreetingKelasInfo` (`.ia-greeting-kelas`) → `'Guru Generus - ' + singkatan kategori`
3. `#iaGreetingWaktuInfo` (`.ia-greeting-kelas`) → kelompok — "Kelp Petemon"

Baris 2 & 3 memakai **kelas yang sama**, jadi tampilannya identik.

### 3.2 Kolom kanan: tombol kalender + badge tanggal (:4912-4943, :5066-5073)
```css
.ia-header-hero-right { display:flex; flex-direction:column;
                        align-items:flex-end; gap:7px; }

.ia-icon-btn-hero     { background: rgba(255,255,255,0.2); color:#fff; }
.ia-icon-btn-hero:active { background: rgba(255,255,255,0.32); }
```

**Badge tanggal — border emas:**
```css
.ia-greeting-date {
  display:inline-flex; align-items:center; gap:6px;
  color:#fff; font-size:11.5px; font-weight:700; letter-spacing:.01em;
  white-space:nowrap;
  padding: 4px 11px;
  border-radius: 999px;
  background: rgba(255,255,255,0.14);
  border: 1.5px solid rgba(255,209,102,0.85);        /* emas */
  box-shadow: 0 0 0 3px rgba(255,209,102,0.14);      /* halo emas */
}
.ia-greeting-date::before {                          /* titik bulat emas */
  content:''; width:6px; height:6px; border-radius:50%;
  background: #FFD166;
}
```

⚠️ Dua koreksi terhadap deskripsi di brief:
- Warna emas persisnya **`#FFD166`** — token baru, tidak ada di `:root`
  `design-tokens-lama.md`. Hanya muncul di blok ini.
- Yang di kiri teks tanggal adalah **titik bulat 6px** (`::before`), **bukan ikon
  kalender**. Ikon kalender adalah tombol terpisah `.ia-icon-btn-hero` **di atas**
  badge (kolom `flex-direction: column`), bukan di dalamnya.

---

## 4. Kontainer + label bulan-tahun (:5212-5266)

```css
.ia-dashboard-view    { flex:1; overflow-y:auto; padding: 16px 18px 100px; }
.ia-dashboard-toolbar { display:flex; justify-content:flex-end; margin-bottom:12px; }
```

Label "Agustus - 2026" = tombol polos, rata kanan:
```css
.ia-filter-btn.ia-filter-btn-plain {
  border:none; background:none; box-shadow:none;
  padding: 4px 0;
  font-size: 13.5px;
  font-weight: 700;                    /* diwarisi dari .ia-filter-btn */
  color: var(--sage);                  /* #059669 */
}
```
Format teks (`Script_Main.html:2352`): `NamaBulan + ' - ' + tahun` — pemisah
tanda hubung, sesuai yang Anda lihat.

---

## 5. Kartu per kelas (`.ia-dash-card`, :5337-5405)

```css
.ia-dash-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);           /* 14px */
  padding: 16px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);   /* BEDA dari --shadow-card */
}
.ia-dash-card-head    { display:flex; align-items:baseline;
                        justify-content:space-between; margin-bottom:4px; }
.ia-dash-card-kelas   { font-size:15px; font-weight:700; color:var(--text); }
.ia-dash-card-jenjang { font-size:12px; font-weight:600; color:var(--sage); }
.ia-dash-card-info    { font-size:12.5px; font-weight:600; color:var(--text);
                        margin-bottom:4px; }
.ia-dash-card-period  { font-size:11px; font-weight:500; color:var(--text-faint);
                        margin-bottom:12px; }
```

⚠️ `.ia-dash-card` pakai shadow **`0 2px 10px rgba(0,0,0,0.05)`** — hitam netral,
**bukan** `--shadow-card` (`0 2px 12px rgba(15,23,42,.08)`). Jangan disamakan.

Struktur judul untuk role `guru` (`Script_Main.html:2590-2591`): `Kelas {kelas}`,
lalu **hanya jika kategori == 'Cabe Rawit'** ditambah
`<span class="ia-dash-card-jenjang"> · Cabe Rawit</span>`. Kategori lain tidak
dilabeli. (Pill kategori berwarna `.ia-kat-pill-*` **khusus Admin Kelp**, bukan guru.)

Baris info disusun dari potongan yang digabung `' · '` (`Script_Main.html:2560-2576`):
`Kak {namaGuru}` · `{ruangan}` · `{total} Santri` · `{jamMulai}–{jamSelesai} · Durasi {n} Menit`.

Jarak antar kartu: **tidak ada** `margin-bottom` di `.ia-dash-card`. Jarak berasal
dari gap kontainer pembungkusnya — perlu dicek terpisah kalau nanti dipakai.

---

## 6. Lima kotak statistik (:5407-5471) — INI YANG PALING PENTING

```css
.ia-dash-stat-row { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; }

.ia-dash-stat {
  display:flex; flex-direction:column; align-items:center; gap:3px;
  padding: 10px 4px 9px;
  border-radius: var(--radius-md, 10px);     /* efektif 10px */
  background: var(--panel-2);                /* #F9FAFB — default 4 kotak status */
}
.ia-dash-stat-num     { font-size:18px; font-weight:800; line-height:1;
                        color:var(--text); font-variant-numeric:tabular-nums; }
.ia-dash-stat-percent { font-size:10px; font-weight:700; line-height:1;
                        padding:2px 7px; border-radius:999px;
                        font-variant-numeric:tabular-nums; }
.ia-dash-stat-label   { font-size:10.5px; font-weight:700; color:var(--text-dim);
                        text-transform:uppercase; letter-spacing:.02em;
                        margin-top:1px; }
```

### 6.1 Kotak 1 — HARI AKTIF (kartu solid gradient teal)
```css
.ia-dash-stat.hariaktif {
  background: linear-gradient(155deg, #0F766E 0%, #0D9488 60%, #14B8A6 100%);
  box-shadow: 0 4px 14px rgba(13, 148, 136, 0.26),
              inset 0 1px 0 rgba(255, 255, 255, 0.14);
}
.ia-dash-stat.hariaktif .ia-dash-stat-num   { color: #FFFFFF; }
.ia-dash-stat.hariaktif .ia-dash-stat-label { color: rgba(255,255,255,0.85); }
```
**Tiga hex baru** yang belum pernah tercatat: `#0F766E`, `#14B8A6` (`#0D9488` = `--teal`).
Gradient **155deg**, tiga stop (0% / 60% / 100%).

Label dipecah jadi **dua baris terpisah** (`Script_Main.html:2604-2605`):
dua elemen `.ia-dash-stat-label`, "HARI" lalu "AKTIF". Kotak ini **tidak punya**
`.ia-dash-stat-percent`.

Alasan dibedakan (komentar :5462-5465): Hari Aktif adalah info **struktural**
(jumlah sesi kelas), bukan status kehadiran — sengaja tidak disamakan dengan 4
kotak lain.

### 6.2 Kotak 2-5 — status kehadiran

Background kotak **seragam `--panel-2` (#F9FAFB)**; yang berwarna hanya **angka**
dan **pill persentase**:

| Kotak | Angka (`-num`) | Pill background | Pill teks |
|---|---|---|---|
| HADIR | `--sage` **#059669** | `rgba(5, 150, 105, 0.12)` | `--sage` #059669 |
| IZIN | `--indigo` **#4F46E5** | `rgba(79, 70, 229, 0.12)` | `--indigo` #4F46E5 |
| SAKIT | **#B45309** (hardcode) | `rgba(180, 83, 9, 0.12)` | #B45309 |
| ALPA | `--red` **#DC2626** | `rgba(220, 38, 38, 0.12)` | `--red` #DC2626 |

⚠️ **Koreksi terhadap deskripsi di brief.** Brief menyebut "kotak background hijau
muda / ungu muda / oranye muda / merah muda". Di sumber, **kotaknya abu-abu
seragam** — yang bertinta warna hanya pill persentase kecil di dalamnya. Yang
Anda lihat sebagai "kotak berwarna" kemungkinan besar pill itu.

⚠️ **SAKIT = #B45309 (coklat-oranye), bukan `--brass` #D97706.** Ini konsisten
dengan tabel konflik di `design-tokens-lama.md` Bagian 4: `.ia-dash-stat` memang
punya nilai sakit yang ketiga, berbeda dari toggle input maupun kartu ringkasan.
Sesuai keputusan #2 Anda (replikasi apa adanya), **#B45309 yang dipakai di sini**.

Persentase dihitung dari `hadir+izin+sakit+alpa` (bukan dari total santri) —
`Script_Main.html:2594-2595`.

---

## 7. Dampak ke commit `a89d32d` (dashboard) — perlu keputusan Anda

Commit `a89d32d` menyamakan `/dashboard` Next.js dengan dashboard **admin**.
Tiga kemungkinan, dan ini bukan keputusan yang boleh saya ambil sendiri:

- **(a) `a89d32d` benar, cuma belum lengkap.** Kalau `/dashboard` Next.js memang
  ditujukan untuk role admin, styling-nya sudah tepat — tinggal ditambah layar
  guru terpisah. Perlu tahu: apakah aplikasi baru akan punya dua dashboard juga?
- **(b) `a89d32d` salah sasaran.** Kalau `/dashboard` sebenarnya untuk guru
  (Neiza), commit itu perlu di-revert dan diganti dengan struktur di dokumen ini.
- **(c) Keduanya perlu ada**, dipilih berdasarkan `profile.role` — tapi itu
  **percabangan logic**, di luar scope "visual only", jadi butuh persetujuan
  eksplisit Anda sebelum saya sentuh.

Karena keempat commit belum di-push, revert `a89d32d` masih murah kalau perlu.

---

## 8. Yang BELUM saya telusuri (bilang kalau perlu)

Semua di bawah ada di sumber, hanya belum saya ekstrak karena belum jelas dibutuhkan:

- Menu dropdown hamburger (`.ia-menu-dropdown`, `.ia-menu-item`, 9 item + divider)
- Bottom bar / tombol simpan (`.ia-bottom-bar`, :5825+)
- Panel filter Bulan-Tahun (tab segmented, :5301-5363)
- Datepicker (`.ppg-datepicker`)
- Baris KPI hero Admin Kelp (:5476+) — hanya relevan kalau role `admin_kelp` ikut dimigrasi
- Breakpoint mobile `.ia-*` (:7230-7231 dst)
- Kondisi kosong (`.ia-dash-empty`, :5587)
