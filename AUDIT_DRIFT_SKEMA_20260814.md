# AUDIT DRIFT SKEMA MENYELURUH — LIVE vs MIGRASI 001

**Tanggal**: 2026-08-14
**Sifat**: READ-ONLY. Nol DDL/DML di kedua DB. Nol perubahan file migrasi.
**LIVE**: `fnhqtkqswxsqmjxynldg` (37 tabel, data operasional)
**TEST**: `qaqhoibxcotjzgxdthfl` (36 tabel, kosong, pasca-001) — **masih ada, tidak dihapus**
**Metode**: 7 query struktural dijalankan identik di kedua DB via Supabase Management API
(`POST /v1/projects/{ref}/database/query`), hasil dibandingkan per-kunci secara programatik.
Runner memakai guardrail regex yang menolak statement non-baca.

```
========== AUDIT DRIFT SKEMA ==========
Tabel hanya di LIVE            : jadwal_kbm  (1)
Tabel hanya di TEST            : (nihil)
Kolom drift (tambah di LIVE)   : 8  -> jadwal_kategori_hari.diubah_pada, jadwal_kategori_hari.hari_aktif,
                                       kurikulum_probul.minggu1..minggu4,
                                       kurikulum_promes.kelompok_id, santri.kelas_ngaji
Kolom drift (hilang dari LIVE) : 0
Kolom beda TIPE                : 0
Kolom beda NULL/default        : 0
Constraint drift               : 1  -> kurikulum_promes_kelompok_id_fkey (FK -> kelompok(id))
Index drift                    : 0
Enum drift                     : 0  (47 label, identik, urutan identik)
Function drift (public)        : 4  -> auth_profile, rls_auto_enable,
                                       pg_list_public_tables, pg_table_columns
Trigger drift (public)         : 0  (25 di LIVE, 25 di TEST, nama identik)

KLASIFIKASI TERHADAP 003 :
  PENGHALANG (push pasti gagal): 1  -> kurikulum_promes.kelompok_id (003 baris 331)
  LATEN (hilang saat rebuild)  : 8  -> tabel jadwal_kbm (17 kolom, 8 baris) +
                                       7 kolom drift lain (hari_aktif, diubah_pada,
                                       minggu1..4, kelas_ngaji)
  NETRAL                       : 5  -> 4 function public (memang produk 003) +
                                       realtime.tr_check_filters (artefak platform)

kurikulum_promes punya prota_id?      : YA  (bigint, NOT NULL, FK -> kurikulum_prota ON DELETE CASCADE)
  total baris                         : 186
  kelompok_id NULL                    : 0
  tidak konsisten dgn prota           : 0 dari 186

KRITERIA PASS BARU :
  CREATE POLICY di file 001+003       : 37   (001=0, 003=37)
  CREATE FUNCTION di file (distinct)  : 7    (001=3, 003=7 termasuk re-create 3 milik 001)
  CREATE TRIGGER di file              : 26 statement (001=26, 003=0)
                                        -> 25 di schema public, 1 di schema auth
  baseline function public (TEST)     : 3
  baseline trigger public (TEST)      : 25
  event trigger platform (TEST)       : 6 baris -> kriteria = evtname 'ensure_rls' ADA
========================================
```

---

## ⚠️ PREMIS YANG TERBUKTI KELIRU (constraint #10)

| Premis lama | Kenyataan terukur |
|---|---|
| "26 trigger" sebagai target | **25** di `public`. Angka 26 = jumlah statement `create trigger` di 001; satu di antaranya (`trg_auth_user_provision_profile`) menyasar `auth.users`, bukan `public`. |
| "30 non-internal trigger" mencurigakan | Benar dan tidak bermasalah. 30 = 25 public + 5 platform (auth 1, storage 4). LIVE punya **31** karena ada `realtime.tr_check_filters` — schema `realtime` aktif di LIVE, tidak di TEST. Murni artefak platform, bukan drift aplikasi. |
| Trigger sebagai kriteria PASS untuk 003 | **Tidak sah sama sekali.** 003 berisi **0** `CREATE TRIGGER`. Jumlah trigger adalah invarian 001, tidak boleh dipakai mengukur keberhasilan 003. |
| Angka "37 policy / 7 function" diambil dari LIVE yang drift | Kebetulan **sah**: diturunkan ulang dari isi file, hasilnya tetap 37 dan 7. Angkanya benar, tapi sekarang justifikasinya benar juga. |
| `grep -c "CREATE OR REPLACE FUNCTION"` di 001 → 0 | **False negative.** 001 ditulis huruf kecil (`create or replace function`). Perlu `grep -i`. Query di prompt awal akan melaporkan "001 tidak punya function" — salah. |
| "Hanya satu penghalang tersisa" | **KONFIRMASI SAH** — kini terbukti menyeluruh, bukan cuma untuk 13 tabel/nama-kolom. Sudah mencakup 37 tabel × tipe, nullability, default, constraint, index, enum. |

Temuan tambahan: **`supabase_migrations.schema_migrations` di LIVE = `['20260805080137']` saja.**
LIVE punya 37 policy + 4 function tambahan, tapi tidak ada catatan migrasi yang membuatnya.
Ini bukti langsung bahwa seluruh lapisan RLS di LIVE masuk lewat jalur di luar migrasi.

---

## BAGIAN 1 — DRIFT STRUKTUR (37 TABEL)

### 1.1 Tabel
LIVE 37, TEST 36.

| Arah | Tabel |
|---|---|
| Hanya LIVE | `jadwal_kbm` |
| Hanya TEST | — |

`jadwal_kbm` di LIVE: 17 kolom, **8 baris**, **tidak ada FK dari tabel lain yang menunjuk ke sana** (0 dependent). Warisan ad-hoc Apps Script. 003 sudah di-retarget ke `kelas` dan sengaja tidak men-DROP-nya.

### 1.2 Kolom — 4 kategori
Dibandingkan per `(table_name, column_name)`, hanya untuk tabel yang ada di kedua DB.

**Hanya di LIVE (8):**

| Tabel.Kolom | Tipe | Null | Default |
|---|---|---|---|
| jadwal_kategori_hari.diubah_pada | timestamptz | YES | — |
| jadwal_kategori_hari.hari_aktif | text | YES | — |
| kurikulum_probul.minggu1 | text | YES | — |
| kurikulum_probul.minggu2 | text | YES | — |
| kurikulum_probul.minggu3 | text | YES | — |
| kurikulum_probul.minggu4 | text | YES | — |
| **kurikulum_promes.kelompok_id** | **int8** | YES | — |
| santri.kelas_ngaji | text | YES | — |

**Hanya di TEST: 0 drift.** (Kategori paling berbahaya — migrasi punya kolom yang live tidak punya — **nihil**.)
**Beda tipe: 0 drift.**
**Beda nullability / default: 0 drift.**

### 1.3 Constraint
**1 drift**, konsekuensi langsung dari kolom drift di atas:

```
kurikulum_promes::kurikulum_promes_kelompok_id_fkey [f]
  FOREIGN KEY (kelompok_id) REFERENCES kelompok(id)      -- hanya di LIVE
```

Nama sama tapi definisi beda: **0 drift** (kategori yang mudah luput — bersih).
Hanya di TEST: 0 drift.

### 1.4 Index
**0 drift.** Nama identik, `indexdef` identik seluruhnya.

### 1.5 Enum
**0 drift.** 47 label di kedua DB, nama tipe identik, `enumsortorder` identik.

### 1.6a Function (schema `public`)

| DB | Jumlah | Daftar |
|---|---|---|
| LIVE | 7 | auth_profile(), handle_new_auth_user(), pg_list_public_tables(), pg_table_columns(p_table_name text), rls_auto_enable(), set_updated_at(), sync_absensi_kelompok_id() |
| TEST | 3 | handle_new_auth_user(), set_updated_at(), sync_absensi_kelompok_id() |

Selisih 4 (`auth_profile`, `rls_auto_enable`, `pg_list_public_tables`, `pg_table_columns`) = tepat function yang **dibuat 003**. Ini bukan drift bermasalah — ini yang seharusnya dihasilkan push.

### 1.6b Trigger (schema `public`, non-internal)
LIVE 25, TEST 25, **nama identik seluruhnya, 0 drift**.

Filter `n.nspname='public'` adalah koreksi terhadap query lama. Rincian non-public:

| Schema.Tabel | Trigger | TEST | LIVE |
|---|---|---|---|
| auth.users | trg_auth_user_provision_profile | ✓ | ✓ |
| storage.buckets | enforce_bucket_name_length_trigger | ✓ | ✓ |
| storage.buckets | protect_buckets_delete | ✓ | ✓ |
| storage.objects | protect_objects_delete | ✓ | ✓ |
| storage.objects | update_objects_updated_at | ✓ | ✓ |
| realtime.subscription | tr_check_filters | — | ✓ |

Total non-internal semua schema: TEST 30, LIVE 31.

---

## BAGIAN 2 — SILANG DRIFT × MIGRASI 003

### 2.1 Tabel yang disentuh 003
`santri`, `kurikulum_prota`, `kurikulum_promes`, `kurikulum_probul`, `kelas`,
`jadwal_kategori_hari`, `guru`, `absensi` (masing-masing 9 referensi = 1 ENABLE RLS + 4 DROP + 4 CREATE POLICY),
`profiles` (4), `ppg` / `kelompok` / `kategori_kbm` / `desa` (3 masing-masing).
Total 13 tabel, 14 statement `ENABLE ROW LEVEL SECURITY`, 37 `CREATE POLICY`.
`jadwal_kbm` muncul 3× — **semuanya di dalam komentar** (catatan retarget), nol DDL.

### 2.2 Tiap drift vs 003

| Drift | Dipakai 003? | Baris |
|---|---|---|
| **kurikulum_promes.kelompok_id** | **YA** | **331** (badan `kurikulum_promes_select_scoped`, 3 kemunculan di baris itu) |
| jadwal_kategori_hari.hari_aktif | tidak | 0 hit |
| jadwal_kategori_hari.diubah_pada | tidak | 0 hit |
| kurikulum_probul.minggu1..minggu4 | tidak | 0 hit |
| santri.kelas_ngaji | tidak | 0 hit |
| tabel jadwal_kbm | tidak (hanya komentar) | 257, 258, 261 — semua `--` |
| FK kurikulum_promes_kelompok_id_fkey | tidak langsung | — (tapi ikut hilang saat rebuild) |

Grep dijalankan lewat Git Bash, bukan `execSync`/cmd.exe — menghindari palsu-nol yang tercatat 13 Agt.

### 2.3 Klasifikasi

**PENGHALANG (1)** — `kurikulum_promes.kelompok_id`, dipakai 003 baris 331.
Push akan gagal di statement 70 selama kolom ini tidak ada di skema resmi. Ini satu-satunya.
Sekarang klaim itu berlaku menyeluruh: bukan hanya "kolom yang hilang pada 13 tabel", tapi
seluruh permukaan struktur 37 tabel (tipe, null, default, constraint, index, enum) sudah dibandingkan
dan tidak menyisakan penghalang lain.

**LATEN (8)** — ada di LIVE, tidak di migrasi, tidak dipakai 003. Akan **hilang tanpa peringatan**
jika LIVE pernah di-rebuild dari migrasi:

| Objek | Isi di LIVE |
|---|---|
| tabel `jadwal_kbm` (17 kolom) | 8 baris |
| jadwal_kategori_hari.hari_aktif, .diubah_pada | — |
| kurikulum_probul.minggu1..minggu4 | — |
| santri.kelas_ngaji | — |
| FK kurikulum_promes_kelompok_id_fkey | — |

**NETRAL (5)** — 4 function public (justru output 003 yang diharapkan) + `realtime.tr_check_filters` (platform).

---

## BAGIAN 3 — `kurikulum_promes` (FAKTA UNTUK KEPUTUSAN RHEZA)

### 3.1 Kolom lengkap di LIVE

| # | Kolom | Tipe | Null | Default |
|---|---|---|---|---|
| 1 | id | bigint | NO | — |
| 2 | **prota_id** | **bigint** | **NO** | — |
| 3 | semester | smallint | NO | — |
| 4 | target | text | YES | — |
| 5 | deskripsi | text | YES | — |
| 6 | created_by | uuid | YES | — |
| 7 | created_at | timestamptz | NO | now() |
| 8 | updated_at | timestamptz | NO | now() |
| 9 | **kelompok_id** | bigint | **YES** | — |

**Jawaban eksplisit: `prota_id` ADA, dan NOT NULL.** Setiap baris promes wajib punya prota induk.
Perhatikan asimetrinya: `prota_id` NOT NULL, `kelompok_id` nullable.

### 3.2 Foreign key

```
kurikulum_promes_prota_id_fkey     FOREIGN KEY (prota_id)   REFERENCES kurikulum_prota(id) ON DELETE CASCADE
kurikulum_promes_kelompok_id_fkey  FOREIGN KEY (kelompok_id) REFERENCES kelompok(id)          <- drift
kurikulum_promes_created_by_fkey   FOREIGN KEY (created_by) REFERENCES profiles(id)
```

`kurikulum_prota.kelompok_id` sendiri **bigint NOT NULL** — induk selalu punya kelompok.

### 3.3 Isi & konsistensi (LIVE)

| Metrik | Nilai |
|---|---|
| total baris | 186 |
| kelompok_id NULL | 0 |
| kelompok_id distinct | 1 |
| punya prota induk (join berhasil) | 186 / 186 |
| prota induk dgn kelompok_id NULL | 0 |
| **baris tidak konsisten dgn prota** | **0 / 186** |

**Indikasi (bukan keputusan):** `prota_id` NOT NULL + FK CASCADE berarti promes **tidak bisa berdiri
tanpa prota**. Dan pada 186 baris yang ada, `kelompok_id` **selalu** sama dengan `prota.kelompok_id` —
nol penyimpangan. Artinya nilai kolom itu saat ini sepenuhnya bisa diturunkan dari induknya
(`JOIN kurikulum_prota`), sehingga keberadaannya adalah duplikasi yang **secara struktural bisa
menjadi tidak sinkron** — tidak ada trigger atau constraint yang memaksanya tetap sama.
Ini pola yang sama dengan `absensi.kelompok_id`, bedanya `absensi` punya trigger
`sync_absensi_kelompok_id()` untuk menjaganya; `kurikulum_promes` **tidak punya penjaga apa pun**.

Perlu dicatat sebagai penyeimbang: kolom denormalisasi juga menghindarkan policy RLS dari subquery
JOIN ke prota pada setiap baris. Ini trade-off desain, bukan cacat yang jelas sepihak.
**Tidak diputuskan di sini.**

### 3.4 Policy `kurikulum_promes` di 003 (baris 316–336, apa adanya)

```sql
-- [3.9] Tabel: kurikulum_promes  (4 policy)
ALTER TABLE public.kurikulum_promes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kurikulum_promes_delete_ppg_only" ON public.kurikulum_promes;
CREATE POLICY "kurikulum_promes_delete_ppg_only" ...
DROP POLICY IF EXISTS "kurikulum_promes_insert_admin_only" ON public.kurikulum_promes;
CREATE POLICY "kurikulum_promes_insert_admin_only" ...
DROP POLICY IF EXISTS "kurikulum_promes_select_scoped" ON public.kurikulum_promes;
CREATE POLICY "kurikulum_promes_select_scoped" ON public.kurikulum_promes
  AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
    FROM auth_profile() p(...)
   WHERE (p.is_active AND ((p.role = 'admin_ppg') OR
     ((p.role = 'admin_desa') AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k
       WHERE (k.id = kurikulum_promes.kelompok_id)))) OR
     ((p.role = 'admin_kelompok') AND (p.scope_kelompok_id = kurikulum_promes.kelompok_id)) OR
     ((p.role = 'guru')           AND (p.scope_kelompok_id = kurikulum_promes.kelompok_id)))))));
DROP POLICY IF EXISTS "kurikulum_promes_update_admin_only" ON public.kurikulum_promes;
CREATE POLICY "kurikulum_promes_update_admin_only" ...
```

Hanya `_select_scoped` yang menyentuh `kelompok_id`. Tiga policy lain (delete/insert/update)
memakai pengecekan peran murni via `auth_profile()`, **tanpa** referensi kolom apa pun di tabel ini.
Jadi permukaan yang terdampak keputusan Rheza = **1 policy, 1 baris**.

---

## BAGIAN 4 — KRITERIA PASS YANG BENAR

Diturunkan dari **isi file migrasi** (bukan dari LIVE), + baseline platform diukur di TEST pasca-001.

| Kriteria | Query | Harapan pasca-003 | Asal angka |
|---|---|---|---|
| Policy | `SELECT count(*) FROM pg_policies WHERE schemaname='public'` | **37** | 37 `CREATE POLICY` di 003 + 0 di 001; TEST pasca-001 = 0 |
| Function public | `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'` | **7** | baseline TEST 3 + 4 baru dari 003 (003 punya 7 `CREATE OR REPLACE`, 3 di antaranya menimpa milik 001) |
| Trigger public | `... pg_trigger t JOIN pg_class c ... JOIN pg_namespace n ... WHERE NOT t.tgisinternal AND n.nspname='public'` | **25 (tidak berubah)** | 003 punya **0** `CREATE TRIGGER`. Ini invarian 001, **bukan** ukuran keberhasilan 003. |
| Event trigger | `SELECT evtname FROM pg_event_trigger` | **`ensure_rls` ADA** (total jadi 7) | platform menyumbang 6 baris di TEST; jumlah baris tidak informatif |
| RLS enabled | `pg_class.relrowsecurity` | tidak dipakai sbg PASS | 001 sudah `enable row level security` di 36 tempat; 003 mengulang 14 — tidak menambah |
| Rollback bersih (jika gagal) | `schema_migrations` | tetap `['20260805080137']` | terbukti pada 2 kegagalan sebelumnya |

**Yang HARUS berhenti dipakai:**
- `pg_trigger WHERE NOT tgisinternal` tanpa filter schema → menghitung storage/auth/realtime; menghasilkan 30/31.
- Target trigger apa pun sebagai kriteria PASS 003.
- `grep -c "CREATE OR REPLACE FUNCTION"` tanpa `-i` pada 001 → false-zero.
- Jumlah baris `pg_event_trigger` sebagai angka target.

---

## PERTANYAAN TERBUKA

1. **`kurikulum_promes.kelompok_id` — dua jalan, keduanya layak.**
   (a) Tambahkan kolom + FK ke migrasi resmi (kanonisasi drift); atau
   (b) tulis ulang baris 331 agar scoping lewat `JOIN kurikulum_prota`, lalu kolom drift jadi LATEN.
   Fakta pendukung ada di §3.3. **Keputusan milik Rheza.**
   Catatan: (a) tanpa trigger sinkronisasi mewariskan kelas masalah yang sama dengan `absensi`.

2. **7 objek LATEN — dikanonisasi atau dibiarkan hilang?** `jadwal_kbm` (8 baris) + 7 kolom.
   Selama tidak dimasukkan migrasi, keduanya lenyap tanpa peringatan pada rebuild pertama.
   Apakah `hari_aktif`, `minggu1..4`, `kelas_ngaji` masih dipakai frontend/Apps Script?
   Audit ini tidak memeriksa kode aplikasi.

3. **Bagaimana 37 policy LIVE bisa ada tanpa jejak di `schema_migrations`?** Kalau ada jalur
   penulisan lain yang masih aktif (Studio, script ad-hoc), drift akan terulang setelah 003 sukses.

4. **`CREATE EVENT TRIGGER ensure_rls` butuh hak owner/superuser.** LIVE memilikinya (bukti kolom
   `evtname` di LIVE), tapi belum pernah terbukti bisa dibuat lewat `db push` — dua push sebelumnya
   gagal sebelum mencapai baris 169. Ini **masih terbuka** dan hanya bisa dijawab oleh push yang
   melewati statement 70.

5. **`kelas` masih 0 baris** di LIVE; seed `seed_kelas_petemon.sql` belum dijalankan (wewenang Rheza,
   tidak disentuh audit ini). Policy `kelas` akan lolos dibuat tapi belum bisa diuji dengan data.

---

## VERIFIKASI SCOPE

| Constraint | Status |
|---|---|
| READ-ONLY mutlak kedua DB | ✅ nol DDL/DML; runner menolak statement mutasi |
| Tidak edit migrasi 001/003 | ✅ tidak tersentuh |
| Tidak push apa pun | ✅ |
| `seed_kelas_petemon.sql` tidak dieksekusi | ✅ (`kelas` tetap 0 baris) |
| Tidak memutuskan `kurikulum_promes` | ✅ fakta + indikasi saja |
| Project test tidak dihapus | ✅ `qaqhoibxcotjzgxdthfl` responsif |
| Data dummy & `jadwal_kbm` utuh | ✅ jadwal_kbm 8 baris, tidak di-drop |
| Link lokal | ✅ `fnhqtkqswxsqmjxynldg` (tidak pernah diubah) |
| Baseline absensi | ✅ **950** |
