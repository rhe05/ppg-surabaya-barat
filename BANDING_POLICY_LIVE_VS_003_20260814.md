# BANDING ISI POLICY — LIVE vs MIGRASI 003

**Tanggal**: 2026-08-14
**Sifat**: READ-ONLY. Nol DDL/DML di kedua DB. Nol push. Nol perubahan file migrasi.
**LIVE**: `fnhqtkqswxsqmjxynldg` · **TEST (003 murni)**: `qaqhoibxcotjzgxdthfl`
**Metode**: `pg_policies` vs `pg_policies` (apel-ke-apel, sudah ternormalisasi Postgres),
dibandingkan per `(tablename, policyname)` dengan normalisasi whitespace.

```
========== PERBANDINGAN POLICY LIVE vs 003 ==========
Policy di LIVE                   : 37
Policy di TEST (003)             : 37

Hanya di LIVE                    : 4  -> jadwal_kbm_{delete_ppg_only, insert_admin_only,
                                          select_scoped, update_admin_only}
  yang DIHARAPKAN (jadwal_kbm_*) : 4
  TAK TERDUGA                    : 0
Hanya di 003                     : 4  -> kelas_{delete_ppg_only, insert_admin_only,
                                          select_scoped, update_admin_only}
  yang DIHARAPKAN (kelas_*)      : 4
  TAK TERDUGA                    : 0

qual BERBEDA                     : 1
  DIHARAPKAN (promes)            : 1
  TAK TERDUGA                    : 0
    -> lebih longgar             : 0
    -> lebih ketat               : 0
    -> setara (beda penulisan)   : 1  (promes: scoping pindah ke prota, semantik setara)
with_check berbeda               : 0
cmd / roles berbeda              : 0

FUNCTION
  hanya di LIVE                  : 0
  hanya di 003                   : 0
  body berbeda                   : 0
  sync_absensi_kelompok_id sama? : YA  (byte-identik setelah normalisasi whitespace)

DAMPAK PUSH
  Tabel RLS ON + 0 policy skrg   : 24 di LIVE -> [daftar di §4.1]
  Total statement top-level      : 104  (37 DROP POLICY, 37 CREATE POLICY, 13 ALTER TABLE,
                                         7 CREATE OR REPLACE FUNCTION, 1 CREATE EVENT TRIGGER,
                                         5 GRANT, 2 ALTER DEFAULT PRIVILEGES, BEGIN, COMMIT)
  Rentang DROP POLICY            : baris 184 s/d 398
  003 dalam satu transaksi?      : YA  (BEGIN; baris 25 -- COMMIT; baris 421, eksplisit)
  Statement pemaksa non-transaksi: TIDAK ADA
                                   (0 hit: concurrently / vacuum / create database /
                                    alter system / reindex)

absensi (harus tetap)            : 950  ✅
kelas                            : 8    (seed Rheza terkonfirmasi)
jadwal_kbm                       : 8    (utuh)
=====================================================
```

**Tidak ada satu pun selisih tak terduga.** Ketiga selisih yang ada persis ketiga yang
sudah diputuskan Rheza. Tidak ada policy live yang lebih ketat lalu tergantikan versi
lebih longgar — skenario kebocoran senyap yang jadi alasan audit ini: **tidak terjadi**.

---

## ⚠️ KOREKSI PREMIS (constraint #10)

| Premis di prompt | Kenyataan terukur |
|---|---|
| "LIVE punya 4 function, TEST punya 7" | **LIVE punya 7, TEST punya 7 — identik, nama & body.** Angka 4 berasal dari audit kemarin, saat itu selisihnya LIVE 7 vs TEST **3** (TEST belum di-push). Setelah 003 masuk TEST kemarin, TEST jadi 7. Tidak ada function yang akan ditambah/ditimpa secara bermakna oleh push. |

Temuan lain yang perlu dicatat:

**File 003 memuat kriteria PASS yang sudah terbukti salah, sebagai komentar.**
Baris ~425 di blok VERIFIKASI penutup masih menulis:
```
--   SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal;      -- 26
```
Angka 26 itu justru premis yang sudah dikoreksi (yang benar: 25 di `public`; dan 003
berisi 0 `CREATE TRIGGER` sehingga trigger bukan kriteria PASS sama sekali). Komentar
ini tidak berpengaruh pada eksekusi, tapi akan menyesatkan siapa pun yang memverifikasi
push berikutnya dengan mengikutinya. **Tidak saya ubah** (di luar scope prompt ini).

**Koreksi angka laporan saya kemarin**: audit drift menulis "14 statement ENABLE ROW
LEVEL SECURITY" di 003. Yang benar **13** statement `ALTER TABLE ... ENABLE ROW LEVEL
SECURITY`; hit ke-14 ada di dalam badan function `rls_auto_enable` (baris 115, string
`format()`), bukan statement DDL. 13 = jumlah tabel berpolicy. Tidak mengubah kesimpulan apa pun.

---

## BAGIAN 1–2 — SELISIH POLICY

### 2.1 Hanya di LIVE (4) — semua DIHARAPKAN

| Policy | cmd |
|---|---|
| jadwal_kbm.jadwal_kbm_delete_ppg_only | DELETE |
| jadwal_kbm.jadwal_kbm_insert_admin_only | INSERT |
| jadwal_kbm.jadwal_kbm_select_scoped | SELECT |
| jadwal_kbm.jadwal_kbm_update_admin_only | UPDATE |

Keempatnya **akan tetap hidup** setelah push — 003 tidak menyebut `jadwal_kbm` dalam DDL
apa pun (hanya komentar). Konsekuensi: `jadwal_kbm` tetap terlindungi RLS sebagai cadangan,
tapi 4 policy itu permanen tanpa catatan migrasi. Drift yang bertahan, disengaja.

### 2.2 Hanya di 003 (4) — semua DIHARAPKAN

| Policy | cmd |
|---|---|
| kelas.kelas_delete_ppg_only | DELETE |
| kelas.kelas_insert_admin_only | INSERT |
| kelas.kelas_select_scoped | SELECT |
| kelas.kelas_update_admin_only | UPDATE |

Ini justru tujuan push: 8 baris `kelas` hasil seed baru akan terlihat aplikasi setelahnya.

### 2.3 `qual` berbeda (1) — DIHARAPKAN

**`kurikulum_promes.kurikulum_promes_select_scoped`**

```
LIVE : ... ((p.role = 'admin_desa') AND (p.scope_desa_id = (SELECT k.desa_id FROM kelompok k
             WHERE (k.id = kurikulum_promes.kelompok_id))))
       OR ((p.role = 'admin_kelompok') AND (p.scope_kelompok_id = kurikulum_promes.kelompok_id))
       OR ((p.role = 'guru')           AND (p.scope_kelompok_id = kurikulum_promes.kelompok_id))

003  : ... ((p.role = 'admin_desa') AND (p.scope_desa_id = (SELECT k.desa_id FROM kelompok k
             WHERE (k.id = (SELECT pr.kelompok_id FROM kurikulum_prota pr
                            WHERE (pr.id = kurikulum_promes.prota_id))))))
       OR ((p.role = 'admin_kelompok') AND (p.scope_kelompok_id = (SELECT pr.kelompok_id ...)))
       OR ((p.role = 'guru')           AND (p.scope_kelompok_id = (SELECT pr.kelompok_id ...)))
```

**Arah perubahan: SETARA (beda penulisan saja).** Dasar penilaian:
- Empat cabang peran identik jumlah dan isinya (admin_ppg tanpa filter; admin_desa se-desa;
  admin_kelompok se-kelompok; guru se-kelompok). Tidak ada cabang bertambah/berkurang.
- Yang berubah hanya **sumber** nilai kelompok: kolom langsung → subquery ke prota induk.
- `prota_id` NOT NULL + FK `ON DELETE CASCADE` → subquery skalar selalu tepat satu baris,
  tidak pernah NULL, tidak pernah multi-row.
- Diverifikasi pada data live: 186 baris promes, `kelompok_id` NULL = 0, **tidak konsisten
  dengan prota induk = 0 dari 186**. Pada seluruh data yang ada, kedua bentuk menghasilkan
  nilai yang sama persis.

Catatan kejujuran: kesetaraan ini berlaku **selama** `kelompok_id` = `prota.kelompok_id`.
Kalau suatu saat ada baris yang menyimpang, bentuk 003 mengikuti prota (sumber yang dijaga
FK) dan bentuk LIVE mengikuti kolom telanjang. Justru itu alasan perubahannya.

### 2.4 `with_check` berbeda
**0 selisih.**

### 2.5 `cmd` / `roles` berbeda
**0 selisih.** Distribusi roles identik di kedua DB:

| roles | LIVE | 003 |
|---|---|---|
| `{public}` | 33 | 33 |
| `{authenticated}` | 4 | 4 |

Empat policy `{authenticated}` sama persis di kedua sisi: `desa_read_authenticated`,
`kategori_kbm_read_authenticated`, `kelompok_read_authenticated`, `ppg_read_authenticated`
(semuanya SELECT). Push tidak mengubah satu pun `roles`.

### Sebaran policy per tabel

| Tabel | LIVE | 003 |
|---|---|---|
| absensi, guru, jadwal_kategori_hari, kurikulum_probul, kurikulum_promes, kurikulum_prota, santri | 4 | 4 |
| desa, kategori_kbm, kelompok, ppg, profiles | 1 | 1 |
| **jadwal_kbm** | **4** | **0** |
| **kelas** | **0** | **4** |

---

## BAGIAN 3 — FUNCTION

**0 selisih pada ketiga kategori.**

| Kategori | Hasil |
|---|---|
| Hanya di LIVE | 0 |
| Hanya di 003 | 0 |
| Body berbeda | 0 |

Ketujuh function identik nama dan body (setelah normalisasi whitespace):
`auth_profile`, `handle_new_auth_user`, `pg_list_public_tables`, `pg_table_columns`,
`rls_auto_enable`, `set_updated_at`, `sync_absensi_kelompok_id`.

**`sync_absensi_kelompok_id()` — SAMA.** Function yang menyentuh `absensi` ini identik
antara live dan 003. `CREATE OR REPLACE` saat push akan menulis ulang definisi yang
persis sama. Tidak ada perubahan perilaku pada jalur tulis `absensi`.

---

## BAGIAN 4 — DAMPAK PUSH KE LIVE

### 4.1 Tabel RLS ON + 0 policy

**LIVE: 24 tabel** — terkunci total (hanya role owner via Studio yang bisa membaca):

```
akses_kelas_request, audit_log, calendar_events, files, guru_izin, hari,
jabatan_pengurus, jadwal_kategori_hari_aktif, jurnal_kbm, kategori_pengumuman,
kelas, konseling, kop_surat, kop_surat_baris, kurikulum_akhlaq,
kurikulum_pencapaian_santri, kurikulum_probul_minggu, munaqosah, pengumuman,
pengurus_kelp, periode_munaqosah, quote_harian, riwayat_jenjang, siklus_generus
```

| | Jumlah | Keterangan |
|---|---|---|
| Terkunci sekarang di LIVE | 24 | termasuk `kelas` (8 baris seed, belum terlihat aplikasi) |
| **Akan TERBUKA oleh push** | **1** | **`kelas`** — satu-satunya |
| Tetap terkunci setelah push | 23 | sama persis dengan daftar TEST pasca-003 |

TEST pasca-003 punya 23 tabel terkunci — daftarnya identik dengan LIVE minus `kelas`.
Ini konfirmasi silang: push tidak membuka tabel lain yang tak terduga.

### 4.2 Inventaris statement

| Statement | Jumlah |
|---|---|
| DROP POLICY IF EXISTS | 37 |
| CREATE POLICY | 37 |
| ALTER TABLE ... ENABLE ROW LEVEL SECURITY | 13 |
| CREATE OR REPLACE FUNCTION | 7 |
| CREATE EVENT TRIGGER | 1 (baris 169, `ensure_rls`) |
| CREATE TRIGGER | 0 |
| GRANT | 5 (baris 410–414) |
| ALTER DEFAULT PRIVILEGES | 2 (baris 416, 418) |
| BEGIN; / COMMIT; | 1 / 1 |
| **Total top-level** | **104** |

Rentang: `DROP POLICY` pertama baris **184**, terakhir baris **398**.
`CREATE POLICY` pertama baris **185**, terakhir baris **399**.
Pola file: DROP dan CREATE **berselang-seling per policy** (drop lalu create untuk
policy yang sama), bukan 37 drop dulu baru 37 create.

### 4.3 Transaksi

**BEGIN; eksplisit di baris 25 — COMMIT; eksplisit di baris 421.** File 431 baris;
yang di luar transaksi hanya komentar (header baris 1–24, blok VERIFIKASI baris 422–431).
Seluruh 102 statement DDL berada di dalamnya, termasuk `CREATE EVENT TRIGGER` (169),
semua policy, semua GRANT.

Statement pemaksa keluar transaksi: **TIDAK ADA** (0 hit untuk `concurrently`, `vacuum`,
`create database`, `alter system`, `reindex`).

Fakta pendukung dari uji kemarin: push 003 ke TEST berjalan penuh, dan **dua kegagalan
sebelumnya rollback bersih** — `schema_migrations` kembali ke `['20260805080137']` dan
policy kembali 0 pada kedua kesempatan. Perilaku transaksional sudah teramati, bukan
sekadar dibaca dari file.

Catatan: `BEGIN;`/`COMMIT;` di dalam file berada di atas pembungkus transaksi Supabase
CLI sendiri. Baris 54/60/69/72/84/93/106/125 yang mengandung `begin`/`end` adalah blok
plpgsql di badan function, **bukan** kontrol transaksi.

Fakta disajikan apa adanya. Penilaian aman/tidak aman untuk push ke live: **keputusan Rheza.**

---

## PERTANYAAN TERBUKA

1. **4 policy `jadwal_kbm_*` akan bertahan tanpa catatan migrasi.** Dibiarkan (konsisten
   dengan status LATEN `jadwal_kbm`), atau ikut dibereskan saat penghapusan bertahap nanti?

2. **Jendela tanpa policy saat push berjalan di live.** Karena seluruhnya dalam satu
   transaksi, pembaca lain tidak pernah melihat keadaan separuh jadi. Tapi DDL mengambil
   `ACCESS EXCLUSIVE LOCK` pada 13 tabel selama transaksi berjalan — aplikasi bisa
   ter-block sesaat. Perlu jendela waktu sepi, atau tidak masalah untuk skala ini?

3. **`schema_migrations` LIVE.** Push akan menambahkan `20260813125217`. Tapi baris 001
   yang sudah tercatat tidak menjamin isi live = isi 001 (audit kemarin sudah menemukan
   9 objek LATEN). Perlu keputusan terpisah: apakah drift LATEN dikanonisasi ke migrasi,
   atau diterima sebagai selisih permanen yang terdokumentasi?

4. **Komentar VERIFIKASI di baris ~425 memuat angka trigger 26 yang sudah terbukti salah.**
   Dikoreksi di commit terpisah, atau dibiarkan sebagai jejak sejarah?

5. **Setelah push, 23 tabel tetap terkunci total.** Sebagian sudah punya data (`jurnal_kbm`,
   `pengumuman`, `kop_surat`, dll). Kapan policy untuk tabel-tabel itu direncanakan?
   Selama terkunci, fitur yang menyentuhnya tidak akan jalan lewat aplikasi.

---

## VERIFIKASI SCOPE

| Constraint | Status |
|---|---|
| READ-ONLY mutlak kedua DB | ✅ nol DDL/DML; runner menolak statement mutasi |
| Nol push (termasuk ke TEST) | ✅ |
| Tidak edit file migrasi | ✅ |
| Tidak menyimpulkan push aman/tidak | ✅ fakta + arah perubahan saja |
| Objek LATEN tidak disentuh | ✅ `jadwal_kbm` 8 baris, `kurikulum_promes.kelompok_id` utuh |
| Project test tidak dihapus | ✅ |
| Link lokal | ✅ `fnhqtkqswxsqmjxynldg` |
| Baseline absensi | ✅ **950** |
