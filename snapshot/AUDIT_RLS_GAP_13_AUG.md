# Audit RLS Gap — 13 Agustus 2026

Sumber: live DB `fnhqtkqswxsqmjxynldg` via Management API `/database/query`
(SELECT saja) + grep codebase. Read-only sepenuhnya: tidak ada policy dibuat,
tidak ada file migrasi diubah, tidak ada DDL dijalankan.

## Koreksi angka

| klaim di issue | angka sebenarnya |
|---|---|
| 36 tabel RLS aktif | **37** tabel, semuanya RLS aktif (0 tabel tanpa RLS) |
| 12 tabel punya policy | **12** ✅ (total 36 policy) |
| 24 tabel terkunci | **25** |

## Temuan utama: kategori [2] KOSONG

**Tidak ada satu pun tabel terkunci yang dipakai kode client live.**

`frontend/` (Next.js, anon key + JWT user — satu-satunya kode yang benar-benar
tunduk RLS) hanya menyentuh 4 tabel lewat 8 pemanggilan `.from()`, dan nol
`.rpc()`:

| tabel | dipakai di | punya policy? |
|---|---|---|
| `absensi` | AbsensiChart.tsx:31, AttendanceSummaryReport.tsx:40, SantriProgressReport.tsx:44 | ✅ 4 |
| `santri` | SantriList.tsx:30, SantriProgressReport.tsx:43 | ✅ 4 |
| `guru` | GuruList.tsx:26 | ✅ 4 |
| `profiles` | lib/auth-context.tsx:65 | ✅ 1 |

Keempatnya punya policy. Jadi kategori [2] DIAM-DIAM RUSAK = **0 tabel**.
Ini kabar baik, tapi lihat "Risiko laten" di bawah — nol-nya rapuh, bukan aman
secara struktural.

## Ringkasan 25 tabel terkunci

`dipakai?` = muncul di kode yang tunduk RLS (`frontend/`). ETL root dan
prototipe Prisma tidak dihitung karena keduanya memakai koneksi yang
mem-bypass RLS.

| tabel | baris | policy | dipakai di kode? | kategori |
|---|---:|---:|---|---|
| `kategori_kbm` | **15** | 0 | tidak (ETL service_role) | **AMBIGU** |
| `jurnal_kbm` | 0 | 0 | tidak (ETL service_role) | AMBIGU |
| `kurikulum_pencapaian_santri` | 0 | 0 | tidak (ETL service_role) | AMBIGU |
| `audit_log` | 0 | 0 | tidak (prototipe Prisma mati) | AMBIGU |
| `konseling` | 0 | 0 | tidak (prototipe Prisma mati) | AMBIGU |
| `munaqosah` | 0 | 0 | tidak (prototipe Prisma mati) | AMBIGU |
| `akses_kelas_request` | 0 | 0 | tidak | [3] |
| `calendar_events` | 0 | 0 | tidak | [3] |
| `files` | 0 | 0 | tidak | [3] |
| `guru_izin` | 0 | 0 | tidak | [3] |
| `hari` | 0 | 0 | tidak | [3] |
| `jabatan_pengurus` | 0 | 0 | tidak | [3] |
| `jadwal_kategori_hari_aktif` | 0 | 0 | tidak | [3] |
| `kategori_pengumuman` | 0 | 0 | tidak | [3] |
| `kelas` | 0 | 0 | tidak | [3] |
| `kop_surat` | 0 | 0 | tidak | [3] |
| `kop_surat_baris` | 0 | 0 | tidak | [3] |
| `kurikulum_akhlaq` | 0 | 0 | tidak | [3] |
| `kurikulum_probul_minggu` | 0 | 0 | tidak | [3] |
| `pengumuman` | 0 | 0 | tidak | [3] |
| `pengurus_kelp` | 0 | 0 | tidak | [3] |
| `periode_munaqosah` | 0 | 0 | tidak | [3] |
| `quote_harian` | 0 | 0 | tidak | [3] |
| `riwayat_jenjang` | 0 | 0 | tidak | [3] |
| `siklus_generus` | 0 | 0 | tidak | [3] |

Rekap kategori:
- **[2] DIAM-DIAM RUSAK — 0 tabel**
- **[1] SENGAJA TERKUNCI — 0 tabel** (tidak ada tabel berisi data yang jelas
  memang diniatkan tertutup; satu-satunya yang berisi data, `kategori_kbm`,
  justru ambigu)
- **[3] KOSONG/TAK TERPAKAI — 19 tabel**
- **AMBIGU — 6 tabel**

## Kenapa 6 tabel ditandai AMBIGU, bukan dipaksa masuk kategori

Ketiganya muncul di kode, tapi di kode yang **tidak tunduk RLS**, jadi
kemunculan itu tidak membuktikan tabelnya rusak maupun tidak dipakai.

**Skrip ETL di root (pakai `SUPABASE_KEY` = service_role → bypass RLS):**
- `kategori_kbm` — `load_engine.js:58`
  `supabase.from('kategori_kbm').select('id, nama')`. Ini `.from()` sungguhan,
  tapi dengan service_role, jadi sekarang jalan normal. Satu-satunya tabel
  terkunci yang punya data (15 baris), dan bentuknya tabel referensi/lookup —
  persis jenis tabel yang paling mungkin dibutuhkan client nanti.
- `jurnal_kbm` — `extract_engine.js:53` (`firestoreOnly`), `load_engine.js:36`
  (urutan load). Terdaftar untuk dimigrasi tapi 0 baris; datanya belum masuk.
- `kurikulum_pencapaian_santri` — `extract_engine.js:61`, `extract_engine.js:325`
  (validasi FK), `load_engine.js:37`. Sama: terjadwal dimuat, belum ada isinya.

**Prototipe Prisma di `08_Development/tpq-app/` (koneksi DB langsung → bypass
RLS, kode tertanggal 15 Jul, sudah digantikan `frontend/`):**
- `audit_log` — dipakai sebagai `prisma.auditLog.create()` di
  `src/app/api/kelompok/[id]/status/route.ts:60`. Tidak terjaring grep
  `audit_log` karena Prisma memakai camelCase.
- `konseling` — hanya field relasi di `prisma/schema.prisma:100`, tidak
  di-query.
- `munaqosah` — hanya field relasi di `prisma/schema.prisma:97` dan `:141`,
  tidak di-query.

## Risiko laten (kenapa "0 tabel rusak" belum berarti aman)

Kategori [2] kosong sekarang hanya karena dua hal yang sama-sama sementara:

1. **`frontend/` baru menggarap 4 tabel.** Begitu ada halaman baru yang
   menyentuh `pengumuman`, `kelas`, `jurnal_kbm`, `kop_surat`, atau
   `kategori_kbm`, tabel itu langsung balik 0 baris — tanpa error, tanpa log.
2. **24 dari 25 tabel terkunci masih kosong.** Bug "balik 0 baris" tidak bisa
   dibedakan dari "tabelnya memang kosong". Saat data 14 kelompok sisanya
   dimuat, tabel-tabel ini terisi tapi tetap balik 0 ke client — dan saat
   itulah gejalanya baru muncul, jauh dari penyebabnya.

Ini bukan skenario hipotetis di project ini: menurut `GOLIVE_CHECKLIST.md`
item 5, persis pola ini sudah pernah terjadi — tabel referensi
`kelompok`/`desa`/`ppg` punya RLS tanpa policy dan membuat cabang `admin_desa`
mengembalikan 0. Perbaikannya menghasilkan 3 policy SELECT yang sekarang
terlihat di daftar 12 tabel.

## Catatan tambahan: 4 tabel hanya punya policy SELECT

Di antara 12 tabel yang "punya policy", empat cuma punya 1 policy dan semuanya
SELECT:

| tabel | policy |
|---|---|
| `ppg` | SELECT |
| `desa` | SELECT |
| `kelompok` | SELECT |
| `profiles` | SELECT |

Artinya lewat client, `profiles` **tidak bisa di-UPDATE sama sekali** — tidak
ada policy INSERT/UPDATE/DELETE. Untuk `ppg`/`desa`/`kelompok` ini kemungkinan
memang disengaja (tabel referensi, hanya dibaca). Untuk `profiles` perlu
diputuskan: onboarding/ubah profil sendiri tidak akan bisa jalan lewat anon
key. Delapan tabel lainnya punya set lengkap DELETE/INSERT/SELECT/UPDATE.

## Soal dugaan penyebab (`ensure_rls`)

Data yang ada **konsisten** dengan dugaan itu — 37/37 tabel RLS aktif, dan
event trigger `ensure_rls` → `public.rls_auto_enable()` memang meng-enable RLS
di setiap tabel baru. Tapi audit ini tidak bisa membuktikannya sebagai
satu-satunya penyebab: migrasi 002 juga sudah meng-`ALTER TABLE ... ENABLE ROW
LEVEL SECURITY` secara eksplisit di 36 tabel. Jadi keduanya sama-sama cukup
untuk menghasilkan keadaan sekarang, dan tidak ada jejak yang memisahkan
kontribusi masing-masing. Yang bisa dipastikan: `ensure_rls` menjamin tabel
**baru** ke depan juga lahir terkunci, jadi masalah ini akan terus berulang
selama policy ditulis manual.

## Data mentah

- `snapshot/AUDIT_RLS_RAW.json` — hasil query per tabel (RLS, jumlah policy,
  `count(*)` sebenarnya, keberadaan kolom `kelompok_id`/`desa_id`/`ppg_id`) +
  daftar 36 policy.

Catatan metode: jumlah baris memakai `count(*)` sungguhan per tabel (lewat
`query_to_xml`), bukan estimasi `reltuples`.
