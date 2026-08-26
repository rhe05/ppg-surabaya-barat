# Audit Resource Supabase — CPU/Compute 100%

**Tanggal**: 2026-08-26
**Project**: Ruang Ngaji (tpq-app)
**Pemicu**: Dashboard Supabase menunjukkan Compute 100%, CPU 100%, Memory 68%, Disk I/O 1%, Database 35.5 MB, WAL 80 MB.
**Sifat audit**: READ-ONLY. Tidak ada perubahan kode/schema/data yang dilakukan dalam audit ini.
**Status perbaikan (diperbarui 2026-08-26)**: CRITICAL #1 ✅ diperbaiki (`15eb83d`), HIGH #2 ✅ diperbaiki (`cc73779`), HIGH #3 ⏳ belum disentuh, MEDIUM #4 ✅ diperbaiki (`0a271c1`), MEDIUM #5 tidak perlu tindakan terpisah.
**⚠️ TAPI CPU MASIH 100% SETELAH SEMUA DI ATAS DI-DEPLOY.** Investigasi lanjutan (lihat bagian "Update investigasi langsung" di bagian bawah file ini) menunjukkan penyebabnya KEMUNGKINAN BUKAN kode aplikasi sama sekali — kemungkinan besar Supabase Studio Dashboard yang terbuka lama hari ini. Baca bagian update di bawah SEBELUM melanjutkan investigasi apa pun.

## Cara membaca profil resource ini

Database **cuma 35.5 MB** tapi **CPU 100%** dengan **Disk I/O cuma 1%** — ini pola yang sangat spesifik: bukan "data terlalu besar untuk discan", tapi **query dipanggil terlalu SERING dan/atau terlalu LEBAR (tanpa filter) relatif terhadap compute tier yang kecil**. Kombinasi "database kecil tapi CPU jenuh" hampir selalu berarti: banyak round-trip kecil yang terus-menerus dipanggil ulang, dan/atau satu-dua query yang menyapu seluruh isi tabel tanpa batas setiap kali dipanggil — persis yang ditemukan di bawah.

Kabar baiknya lebih dulu — yang **TIDAK** ditemukan (jadi bisa dicoret dari daftar curiga):
- **Tidak ada Realtime subscription** (`supabase.channel(`) di seluruh frontend.
- **Tidak ada `setInterval`** (tidak ada polling loop) di mana pun.
- **Satu Supabase client** saja (`lib/supabase.ts`), tidak ada instance ganda.
- **Tidak ada Edge Function, pg_cron job, atau webhook (`pg_net`/`http_post`)** yang benar-benar terpasang — hanya disebut di komentar advisor-lint, bukan kode aktif.
- Tidak ada `useEffect` dengan dependency array berisi object/array/function literal baru tiap render (pola "infinite re-fetch") — semua dependency berupa primitif atau `useCallback` yang di-memo dengan benar.
- Semua loop `range()`/paginasi yang dicek **dibatasi dengan benar** (`if (batch.length < UKURAN_HALAMAN) break`) — tidak ada loop tak berhingga.
- Trigger database semuanya `FOR EACH ROW` sederhana (updated_at, sync kelompok_id/kelas_id) — tidak ada trigger rekursif atau saling panggil.

---

## CRITICAL

### 1. `AbsensiChart.tsx` & `AttendanceSummaryReport.tsx` — full-table scan tabel `absensi` TANPA filter tanggal/kelompok, di halaman yang paling sering dibuka

- **File**: [components/AbsensiChart.tsx:30-43](frontend/components/AbsensiChart.tsx#L30-L43), [components/AttendanceSummaryReport.tsx:39-52](frontend/components/AttendanceSummaryReport.tsx#L39-L52)
- **Dipakai di**: `app/dashboard/page.tsx` (Dashboard desktop admin_ppg/admin_desa/admin_kelompok — halaman pertama yang dibuka setiap login), `app/statistik/page.tsx`, `app/monitoring/page.tsx`, `app/reports/page.tsx`.
- **Penyebab**: kedua komponen memaginasi (1000 baris per halaman) SELURUH tabel `absensi` — satu-satunya filter adalah `.is('deleted_at', null)`, TIDAK ADA filter tanggal, TIDAK ADA filter kelompok, TIDAK ADA batas jumlah hari. `absensi` adalah tabel dengan pertumbuhan tercepat di seluruh skema (satu baris per santri per kelas per hari) — kalau sudah berjalan berbulan-bulan lintas 18 kelompok, jumlah barisnya bisa puluhan ribu.
- **Dampak**: SETIAP kali Dashboard/Statistik/Monitoring/Reports dibuka oleh SIAPA PUN, browser mengirim N round-trip berurutan (N = total_baris / 1000) yang masing-masing memindai seluruh sisa tabel — dan tiap baris tetap kena evaluasi RLS (`EXISTS (... auth_profile() ...)`) meski hasilnya nanti dibuang sebagian besar di klien. Dikalikan jumlah admin yang membuka Dashboard berkali-kali sehari, ini match PERSIS dengan gejala "CPU 100%, disk kecil, data kecil".
- **Bukti**: baris kode di atas — query benar-benar tidak punya `.gte('tanggal', ...)`/`.eq('kelompok_id', ...)` sama sekali, dua-duanya.
- **Rekomendasi minimal & aman** (belum diimplementasikan, sesuai instruksi):
  - Batasi rentang tanggal (mis. 30-90 hari terakhir) sebelum query, seperti pola yang SUDAH ADA & benar di `lib/ringkasanAdminKelp.ts` dan RPC `statistik_kehadiran`.
  - Atau, lebih baik lagi: ganti total ke RPC agregat sisi-server (persis pola `statistik_kehadiran` yang sudah ada) supaya penjumlahan/rata-rata dihitung di Postgres, bukan menarik semua baris mentah ke browser lalu dihitung di JS.
  - Tambahkan `.eq('kelompok_id', ...)` untuk peran yang scope-nya sudah sempit (admin_desa/admin_kelompok) supaya tidak menarik data kelompok lain yang toh akan dibuang.

---

## HIGH

### 2. `AdminKelpDashboard.tsx` — dua query `guru`/`santri` TANPA filter sama sekali (murni mengandalkan RLS)

- **File**: [components/dashboard/AdminKelpDashboard.tsx:605-617](frontend/components/dashboard/AdminKelpDashboard.tsx#L605-L617) (`guru`), [:644-658](frontend/components/dashboard/AdminKelpDashboard.tsx#L644-L658) (`santri`)
- **Penyebab**: ditambahkan sesi ini untuk fitur "hitung ulang per bulan" pada kartu KPI Data Guru/Data Generus — `.select(...)` TANPA `.eq('kelompok_id', ...)` dan TANPA `.is('deleted_at', null)` (sengaja, supaya baris yang sudah di-soft-delete tapi masih aktif di bulan lampau ikut terhitung). Ini SATU-SATUNYA pola "nol filter" di seluruh codebase lain — semua query lain (termasuk ke tabel besar) setidaknya punya `.eq`/`.in`/`.is`.
- **Dampak**: mengandalkan Postgres RLS (predicate `EXISTS (SELECT ... FROM auth_profile() ...)`) untuk menyaring baris per-baris tanpa bantuan index yang selaras — untuk tabel guru/santri yang relatif kecil ini dampaknya jauh lebih ringan dari #1, tapi tetap pola yang tidak konsisten dengan konvensi keamanan+performa yang dipegang di seluruh codebase lain, dan dipanggil di SETIAP kali Dashboard mobile admin_kelompok dibuka.
- **Rekomendasi**: tambahkan `.eq('kelompok_id', kelompokId)` di kedua query (tidak mengubah hasil — RLS admin_kelompok sudah membatasi ke kelompok sendiri, filter eksplisit ini murni membantu planner Postgres mempersempit baris lebih awal).

### 3. `AdminKelpDashboard.tsx` — 8 round-trip Supabase terpisah pada satu kali mount

- **File**: [components/dashboard/AdminKelpDashboard.tsx](frontend/components/dashboard/AdminKelpDashboard.tsx) — `muatBelumIsi` (~L389), `muatRingkasanBulan` (~L410), hitung `jumlahPermintaan` (~L455), `muatKalenderHariIni` (~L469), `muatGuruSedangIzin` (~L561), RPC `statistik_kehadiran` (~L576), query `guru` (~L605), query `santri` (~L644).
- **Penyebab**: tiap kartu KPI di dashboard mobile admin_kelp punya `useEffect` fetch sendiri-sendiri, tidak digabung.
- **Dampak**: satu kali admin_kelompok membuka Dashboard di HP = 8 request Postgres terpisah sekaligus. Bukan bug, tapi paling "berisik" dibanding komponen lain — kandidat kuat untuk konsolidasi kalau CPU masih tinggi setelah #1 diperbaiki.
- **Rekomendasi**: gabungkan beberapa query yang datanya tumpang tindih (mis. `guru`/`santri` KPI bisa satu RPC bareng `muatRingkasanBulan`), atau jadikan lazy (fetch saat kartu benar-benar dilihat/dibuka), pola yang sudah dipakai untuk "rincian per kelas" di kartu yang sama.

---

## MEDIUM

### 4. `PohonWilayah.tsx` — query `santri`/`guru` tanpa scope kelompok, di halaman yang sama dengan #1

- **File**: [components/dashboard/PohonWilayah.tsx:60-61](frontend/components/dashboard/PohonWilayah.tsx#L60-L61)
- **Penyebab**: `supabase.from('santri').select('kelompok_id').is('deleted_at', null)` dan sama utk `guru` — menarik SEMUA baris (bukan cuma milik kelompok sendiri) untuk dihitung per-kelompok di sisi klien, dipakai membangun pohon Desa›Kelompok di Dashboard yang sama dengan #1.
- **Dampak**: lebih ringan dari #1 (tabel santri/guru jauh lebih kecil dari absensi), tapi menambah beban di halaman yang sudah paling sering diakses. Untuk admin_ppg ini memang By Design (perlu lihat semua kelompok), tapi untuk admin_desa/admin_kelompok RLS sudah membatasi — filter eksplisit tetap membantu planner.
- **Rekomendasi**: kalau CPU masih tinggi setelah #1 diperbaiki, pertimbangkan agregasi `count(*) group by kelompok_id` lewat RPC/`select(..., {count:'exact'})` alih-alih menarik satu baris per santri/guru ke klien.

### 5. RLS `EXISTS (... auth_profile() ...)` dipakai di hampir semua tabel

- Pola arsitektur, bukan bug satu file — `auth_profile()` sudah `STABLE SECURITY DEFINER` (praktik baik, hasilnya bisa dipakai ulang dalam satu query oleh planner), tapi predicate `EXISTS` per-baris ini menambah overhead nyata kalau query pemanggilnya sendiri tidak mempersempit baris lebih dulu (persis kombinasi di #1 dan #2). Perbaikan #1 dan #2 akan mengurangi dampaknya secara otomatis tanpa perlu menyentuh RLS sama sekali.

---

## LOW / Tidak ditemukan masalah

- Tidak ada `select('*')` di seluruh frontend.
- RPC `simpan_absensi_kelas` (input absensi) sudah atomik, satu transaksi per kelas, dibatasi jumlah santri per kelas — tidak berisiko.
- RPC `statistik_kehadiran` sudah dibatasi rentang hari (default 30, maks 365) dan filter kelompok opsional — jauh lebih aman dari #1, meski tetap dipanggil berulang dari beberapa halaman (Dashboard mobile + /statistik).
- `naikkan_unduhan` RPC (Pustaka) dipanggil per klik unduh — volume rendah, bukan perhatian.

---

## Kalau setelah baca ini masih belum yakin penyebab pastinya

Audit statis (baca kode) bisa menunjukkan KANDIDAT kuat, tapi bukti definitif query mana yang paling banyak makan CPU ada di telemetry Supabase sendiri. Ambil ini dari Dashboard Supabase (tidak perlu ubah apa pun):

1. **Database → Query Performance / Advisor** (atau `pg_stat_statements` lewat SQL Editor kalau tersedia):
   ```sql
   select query, calls, total_exec_time, mean_exec_time, rows
   from pg_stat_statements
   order by total_exec_time desc
   limit 20;
   ```
   Ini akan langsung menunjukkan query mana (bisa dicocokkan dengan pola SQL di atas) yang paling banyak `calls` dan/atau `total_exec_time` — jawaban paling pasti.
2. **Database → Roles/Connections**: cek jumlah koneksi aktif bersamaan (`select count(*) from pg_stat_activity;`) — kalau tinggi terus-menerus, itu tanda banyak client/tab terbuka bersamaan, bukan satu query nakal.
3. **Jumlah baris tabel `absensi` sungguhan** (konfirmasi ukuran masalah #1):
   ```sql
   select count(*) from absensi;
   ```
4. **Logs → Postgres Logs**, filter `duration` — cari query dengan durasi tertinggi dalam beberapa jam terakhir bertepatan dengan waktu CPU mulai naik.
5. **Reports → API** (kalau ada di plan Anda): cek endpoint PostgREST mana (`/rest/v1/absensi`, dst.) yang paling banyak dipanggil dalam 24 jam terakhir.

Item #1 di `pg_stat_statements` kemungkinan besar akan cocok dengan pola `SELECT id, status FROM absensi WHERE deleted_at IS NULL ORDER BY id ...` (dari CRITICAL #1) — kalau itu yang muncul di posisi teratas, penyebabnya terkonfirmasi tanpa keraguan.

---

## Update investigasi langsung (2026-08-26, setelah CRITICAL/HIGH/MEDIUM di atas di-deploy) — CPU BELUM TURUN, penyebab BUKAN yang diduga di atas

Setelah `15eb83d`/`cc73779`/`0a271c1` di-deploy, owner melapor **CPU masih 100%, tidak turun**. Investigasi lanjutan lewat `pg_stat_statements` & Reports → API menemukan gambaran yang JAUH berbeda dari dugaan statis di atas:

1. **`pg_stat_statements` (stats_reset = 2026-08-04 07:16 UTC, jadi kumulatif ~22 hari)**: query teratas adalah `select set_config('search_path', ...)` — boilerplate setup-sesi PostgREST yang jalan di SETIAP request API — dengan **602.622.352 calls**, rata-rata 0.016ms/call (cepat per-call, tapi VOLUME-nya yang jadi masalah). RPC yang tadinya dicurigai (`statistik_kehadiran`: 113 calls, `simpan_absensi_kelas`: ~85-100an calls) ternyata KECIL, bukan penyebabnya.
2. **`select count(*) from absensi` → 1039 baris saja.** Tabel `absensi` TERNYATA KECIL (bukan "puluhan ribu" seperti diasumsikan CRITICAL #1 di atas) — jadi walau full-table-scan di `AbsensiChart.tsx`/`AttendanceSummaryReport.tsx` tetap pemborosan nyata dan sudah benar diperbaiki, itu BUKAN skala yang bisa menjelaskan 602 juta call.
3. **Grafik Compute/CPU (Aug 19 → Aug 26)**: stabil ~55-70% sepanjang minggu, lalu **melonjak tajam ke 100%+ TEPAT DI HARI INI (26 Agustus)** — bukan pola "terus-menerus 22 hari", tapi lonjakan yang terkonsentrasi hari ini. Ini berarti 602 juta call kumulatif kemungkinan besar didominasi oleh apa pun yang terjadi HARI INI, bukan rata-rata rutin harian.
4. **Reports → API, "Last 24 hours"**: traffic REST API terlihat NORMAL & wajar (query dengan filter yang jelas, jumlah per pola cuma satu-dua digit) — tidak ada tanda bot/serangan pada request `/rest/v1/*` yang tercatat di jendela 24 jam ini.
5. **`pg_stat_activity` (snapshot sesaat)**: cuma segelintir koneksi aktif, dua di antaranya sedang menjalankan `simpan_absensi_kelas` bersamaan — normal (dua guru menyimpan absen di waktu berdekatan), bukan tanda macet/deadlock.

**Kesimpulan sementara**: kombinasi (a) tabel kecil, (b) traffic 24 jam normal, (c) lonjakan yang terkonsentrasi HARI INI, sangat mencurigakan mengarah ke **aktivitas Supabase Studio Dashboard sendiri** (Table Editor/SQL Editor/schema browser yang di-poll berkala) selama sesi kerja panjang hari ini di dashboard tsb — BUKAN traffic dari aplikasi Next.js/pengguna akhir. Perbaikan kode (CRITICAL #1, HIGH #2, MEDIUM #4) TETAP bermanfaat & tetap di-deploy (mengurangi beban riil jangka panjang), tapi kemungkinan besar BUKAN itu penyebab lonjakan spesifik hari ini.

**Tes yang diminta ke owner, BELUM ada hasilnya saat sesi ini berhenti (owner istirahat)**:
1. Tutup SEMUA tab/jendela Supabase Dashboard sepenuhnya, jangan dibuka 15-30 menit.
2. Buka lagi, cek apakah Compute/CPU sudah turun.
3. Kalau turun → terkonfirmasi Studio dashboard yang jadi biang keroknya, bukan kode aplikasi. Kalau tetap 100% → di luar jangkauan diagnosis dari kode/log yang bisa diakses dari sini, perlu hubungi Supabase Support langsung dengan bukti `pg_stat_statements` di atas.

**Next session harus mulai dari sini**: tanyakan hasil tes tutup-dashboard itu dulu sebelum melanjutkan apa pun terkait resource Supabase — JANGAN mengulang investigasi dari awal, konteks lengkapnya sudah di bagian ini.

Temuan sampingan yang belum ditangani (prioritas jauh di bawah): 1 error `401` di endpoint `/rest/v1/kalender_kelompok` kelihatan di Reports → API — kemungkinan bug akses nyata utk satu user, belum diselidiki.
