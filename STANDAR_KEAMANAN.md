# Standar Keamanan & Ketahanan — Ruang Ngaji

> **Pedoman WAJIB** untuk setiap fitur baru / perubahan pada aplikasi
> "Ruang Ngaji" (Next.js 16 client-side + Supabase + Vercel).
> Disusun 2026-09-10 dari hasil audit menyeluruh. Diperbarui sesuai
> temuan baru.
>
> Dokumen ini adalah **aturan yang harus diikuti**, bukan laporan.
> Laporan audit titik-waktu ada di `SECURITY_PERFORMANCE_AUDIT_2026-09-10.md`.

---

## 0. Prinsip inti (baca dulu — menentukan semua aturan di bawah)

**Aplikasi ini TIDAK punya server aplikasi terpisah.** Klien (semua
`'use client'`) bicara LANGSUNG ke Supabase: PostgREST (query tabel) +
RPC (fungsi Postgres). Tidak ada `route.ts`, tidak ada `'use server'`.

Konsekuensinya:

| Konsep keamanan klasik | Di aplikasi ini |
|---|---|
| Validasi server-side | **RLS + CHECK constraint + enum + validasi di dalam RPC** adalah "server-side"-nya. Jangan pernah percaya klien. |
| SQL injection | Tidak mungkin lewat `supabase-js` (query parameterized). Di RPC: **jangan `EXECUTE format(...)` dengan input mentah.** |
| CSRF token | **Tidak berlaku** — auth pakai JWT di header `Authorization`, bukan cookie. Menambah token CSRF = sia-sia. |
| CORS whitelist | Tidak bisa diketatkan tanpa proxy (overkill). **RLS + wajib JWT** yang jadi pengaman. `anon` key memang publik. |
| Rate limiting server | PostgREST tidak punya per-user. **Kita pasang sendiri** (lihat §4). |

**Aturan emas: RLS adalah garis pertahanan utama. Setiap tabel, setiap
kolom sensitif, tidak boleh bisa dibaca/ditulis lintas pengguna.**

---

## 1. Checklist WAJIB — setiap TABEL baru

- [ ] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` — **selalu**, tanpa kecuali.
- [ ] Kolom scope: `kelompok_id` (atau turunannya lewat FK) supaya RLS bisa menyaring.
- [ ] Kebijakan **SELECT** — scoped via `auth_profile()`:
      admin_ppg (semua) | admin_desa (se-desa) | admin_kelompok (se-kelompok) | guru/penerobos (kelasnya/kelompoknya).
- [ ] Kebijakan **INSERT** (`WITH CHECK`) — sama cakupan.
- [ ] Kebijakan **UPDATE** (`USING` + `WITH CHECK`) — sama cakupan.
- [ ] Kebijakan **DELETE** — **JANGAN LUPA.** Kalau data bisa diedit user, ia harus bisa dikoreksi/dihapus. Beberapa tabel lama lupa ini (ERROR_LOG #39: `tilawati_pelaksanaan`). Kalau hapus keras berbahaya → hapus lunak (`deleted_at`) via UPDATE + DELETE keras dikunci `admin_ppg`.
- [ ] `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated;` (RLS yang membatasi baris; grant cuma "boleh sentuh tabel").
- [ ] Trigger `set_updated_at` kalau ada kolom `updated_at`.
- [ ] `SELECT` kolom eksplisit di frontend — **DILARANG `select('*')`**.
- [ ] Tabel referensi non-sensitif (nama desa/kelompok/kategori) BOLEH `USING (true)` untuk authenticated. Data anggota/pribadi TIDAK PERNAH.

### Pola kebijakan baku (InitPlan — cepat)

```sql
CREATE POLICY "<tabel>_select" ON public.<tabel>
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM auth_profile()
      p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
         p.role = 'admin_ppg'::text
      OR (p.role = 'admin_desa'::text AND p.scope_desa_id =
            (SELECT k.desa_id FROM public.kelompok k WHERE k.id = <tabel>.kelompok_id))
      OR (p.role = 'admin_kelompok'::text AND p.scope_kelompok_id = <tabel>.kelompok_id)
      OR (p.role = 'penerobos'::text      AND p.scope_kelompok_id = <tabel>.kelompok_id)
    )));
```

- **Satu `EXISTS (SELECT 1 FROM auth_profile() ...)`**, bukan enam subquery skalar terpisah. `auth_profile()` `STABLE SECURITY DEFINER` → planner evaluasi sekali per-statement (InitPlan), bukan per-baris.
- ⚠️ **JANGAN** bungkus logika RLS dalam fungsi `SECURITY DEFINER` sendiri lalu panggil per-baris — terukur **2,8× lebih lambat** (memory `ppg-rls-initplan-jurnal`).
- Untuk kelas dua-guru: `p.guru_id IN (kl.guru_id, kl.guru_id_2)`, bukan `= kl.guru_id`.

---

## 2. Checklist WAJIB — setiap RPC baru (`CREATE FUNCTION`)

- [ ] `SECURITY DEFINER` hanya kalau perlu bypass RLS; kalau tidak, `SECURITY INVOKER` (default) + andalkan RLS.
- [ ] `SET search_path TO 'public'` pada fungsi `SECURITY DEFINER`.
- [ ] **Validasi scope EKSPLISIT di dalam** — cek `auth_profile()` role + scope; jangan asumsi klien sudah menyaring.
- [ ] Validasi wajib-isi + tipe di awal (`RAISE EXCEPTION` kalau kosong/salah).
- [ ] `REVOKE ALL ON FUNCTION ... FROM PUBLIC;` lalu `GRANT EXECUTE ... TO authenticated;` (memory `ppg-crud-santri-grup-a`).
- [ ] **Rate limit** untuk RPC tulis yang bisa dipanggil beruntun cepat — lihat §4.
- [ ] `CREATE OR REPLACE` gagal (42P13) kalau tipe kembalian berubah → `DROP FUNCTION` dulu (menghapus GRANT lama juga → GRANT ulang).
- [ ] Badan fungsi lama disalin dari **PRODUKSI** (`pg_get_functiondef` via Management API), BUKAN dari ingatan / migrasi lama.

---

## 3. Migrasi

- Satu berkas idempoten per perubahan: `BEGIN; ... COMMIT;`, `CREATE ... IF NOT EXISTS`, `DROP POLICY IF EXISTS` sebelum `CREATE`.
- Dijalankan **owner manual** di Supabase SQL Editor. CLI `supabase db push` TIDAK dipakai (backlog drift).
- **Enum**: `ALTER TYPE x ADD VALUE 'y'` TIDAK boleh dipakai di transaksi yang sama dengan yang MEMAKAI `'y'`. Pisah jadi 2 berkas migrasi, jalankan berurutan.
- Setiap perubahan skema → catat di ingatan + ingatkan owner jalankan.
- Perubahan RLS → verifikasi dengan impersonasi transaksi yang di-rollback:
  `begin; set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>"}'; <query>; rollback;`

---

## 4. Rate limiting ("stun") — DUA lapis

### 4a. Sisi server — `batasi_laju()`

Tabel `laju_permintaan` + fungsi `public.batasi_laju(p_aksi text, p_maks int, p_detik int)`
(migrasi `20260910100000`). Panggil di **awal** RPC tulis, sebelum kerja berat:

```sql
PERFORM public.batasi_laju('nama_aksi', 20, 60);  -- 20 panggilan / 60 detik / pengguna
```

- ⚠️ **Keterbatasan**: kalau RPC selalu `RAISE` (mis. loop yang selalu error), PostgREST me-rollback transaksi → increment counter ikut hilang → pagar tak menggigit. Untuk kasus begini, tambah **fast-path** (§4c).
- Batas longgar (20–40/menit) — cukup untuk pemakaian sah, mematikan loop mesin (ratusan/detik).

### 4b. Sisi klien — `useJedaAksi()`

`frontend/lib/jedaAksi.ts` — bungkus handler tombol yang memanggil
`supabase.rpc()/insert()/update()`:

```tsx
const simpan = useJedaAksi(handleSimpan, { jedaMs: 2500 });
// pakai `simpan` di onClick
```

Menolak pemanggilan ulang selama fn berjalan ATAU dalam `jedaMs` sejak mulai.
**Selain itu**: tiap tombol submit WAJIB `disabled={sedangMenyimpan}`.

### 4c. Fast-path no-op (untuk RPC yang sering "resave data sama")

Kalau input = kondisi yang sudah ada persis → `RETURN` hasil no-op yang
**COMMIT** (tanpa INSERT spekulatif, tanpa error). Contoh: `simpan_absensi_kelas`
(migrasi `20260910110000`). Ini yang benar-benar menghentikan loop klien
basi (ERROR_LOG #38) — bikin tiap panggilan = 1 SELECT ber-index lalu commit.

---

## 5. Input & Output

- **Query**: selalu lewat `supabase-js` (auto-parameterized). Jangan rakit string SQL dari input.
- **Render**: React meng-escape `{teks}` otomatis. **DILARANG** `dangerouslySetInnerHTML`, `.innerHTML`, `eval`, `new Function`.
- **Validasi berlapis** (bukan cuma frontend, biar tak bisa dilewati): enum Postgres + CHECK constraint + validasi di RPC.
- **Ekspor berkas**: escape XML (`lib/xlsx.ts` `lolosXml`), sanitasi nama berkas (`[\\/:*?"<>|]` → `-`).
- Kolom teks bebas (no HP, RT/RW, kode pos) — boleh tanpa CHECK format (bukan risiko keamanan, cuma kualitas data). Tambah CHECK regex bila perlu.

---

## 6. Rahasia & Environment Variable

- **Frontend hanya boleh** `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (keduanya memang publik).
- **`service_role` key: TIDAK PERNAH** di frontend / repo. Nol toleransi.
- `SUPABASE_ACCESS_TOKEN` (Management API) hanya di `.env` **root repo** untuk perkakas diagnostik — jangan di-`import` kode aplikasi.
- `.gitignore`: `.env` + `.env.*` diabaikan, hanya `.env.example` di-track. Cek `git ls-files | grep env` sebelum commit besar.
- Rotasi `SUPABASE_ACCESS_TOKEN` berkala (Supabase → Account → Access Tokens).
- Nilai runtime produksi di **Vercel Project Settings → Environment Variables**, bukan berkas.

---

## 7. HTTP Security Headers

Dipasang di `frontend/next.config.ts` → `async headers()`:

| Header | Nilai |
|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()` |
| `Content-Security-Policy` | `frame-ancestors 'none'` (minimal). CSP penuh siap-uji ada di laporan audit — promosikan setelah verifikasi di preview. |

HTTPS: Vercel + Supabase otomatis. **Supabase Auth → URL Configuration**:
Site URL & Redirect URLs HARUS domain produksi (`https://ruang-ngaji.vercel.app`),
JANGAN `localhost` — kalau salah, login Google & reset password mendarat ke localhost.

---

## 8. Kehematan Supabase (biaya = CPU/compute, bukan storage)

- **Nol `select('*')`** — sebut kolom.
- **Nol Realtime** (`supabase.channel(`) kecuali fitur benar-benar butuh live — WebSocket persisten mahal.
- **Nol `setInterval` polling.**
- Query time-series (`absensi`, `tabungan_transaksi`, `*_kehadiran`): **paginasi wajib** (`.range()` + `break` di `< UKURAN_HALAMAN`). PostgREST diam-diam potong di 1000 baris.
- **Filter eksplisit** `.eq('kelompok_id', ...)` walau RLS sudah membatasi — bantu planner mempersempit baris lebih awal.
- **Agregasi di server**: jumlah/rata-rata → RPC agregat (pola `statistik_kehadiran`), jangan tarik ribuan baris mentah ke JS.
- `useEffect` dep array: hanya primitif atau `useCallback` yang di-memo benar. Jangan object/array/function literal baru tiap render (infinite refetch).
- Fetch paralel: `Promise.all` untuk query yang independen. Data yang sudah di memori → jangan query ulang saat filter/sort (contoh: `UnduhDataSheet` menyaring di klien).
- Pustaka berat (jspdf, recharts) → `import()` dinamis, dimuat saat dipakai.

---

## 9. Kalau CPU/Compute Supabase tinggi tanpa sebab jelas

**Cek DULU lewat Management API (READ-ONLY), sebelum audit pola kode:**

1. `pg_stat_user_tables` — `n_tup_ins` / `n_tup_upd` yang tidak masuk akal untuk jumlah baris hidupnya, `seq_scan` tinggi, `autovacuum_count` ratusan/ribuan.
2. `pg_stat_statements` — `order by calls desc`; cari 1 statement yang menghabiskan >50% `total_exec_time`.
3. `postgres_logs` (`analytics/endpoints/logs.all?sql=...`) — `group by event_message`; kalau 100% satu error → itu loop klien.
4. `pg_stat_activity` — sampel beberapa kali; backend `authenticator` yang selalu mid-query = ada yang menghajar RPC.

Runaway client (tab peramban lama yang tidak pernah ditutup, JS basi) hampir
selalu kelihatan di sini — jauh lebih cepat dari membaca kode. Lihat
ERROR_LOG #38 (insiden 750 juta INSERT / CPU 100% selama 47 hari).

`VACUUM (FULL, ANALYZE) public.<tabel>;` untuk menyusutkan bloat setelah insiden
(kunci tabel ~1 detik, jalankan saat sepi).

---

## 10. Model registrasi (otentikasi masuk)

- **Admin (Admin Kelp / Ketua Muda-i / Penerobos Kelp)**: pra-otorisasi oleh
  admin_ppg lewat kartu "Registrasi" di `/pengaturan` (`admin_kelp_undangan` +
  kolom `peran`). Akun mengklaim peran yang sudah dijatah (cocok nama +
  kelompok) — **tanpa approval lagi**. Admin Kelp = **wajib** lewat undangan.
- **Guru**: dibuat admin_kelp lewat "Registrasi Guru" (tabel `guru`), lalu
  guru mengklaim (`klaim_akun_guru`).
- **Self-service** (`pendaftaran_akun` + approval): fallback untuk guru,
  Ketua Muda-i, Penerobos Kelp yang belum didaftarkan admin.
- `chk_pendaftaran_scope` membatasi kombinasi `peran_diminta` + scope.
  `setujui_pendaftaran()` membatasi siapa boleh menyetujui apa.
- Peran hanya di-set lewat RPC `SECURITY DEFINER` (`klaim_*`,
  `setujui_pendaftaran`), TIDAK PERNAH lewat UPDATE `profiles` dari klien
  (RLS `profiles` = self-read only, tanpa self-update role).

---

## 11. Yang SENGAJA TIDAK dikerjakan (overkill untuk tahap & jenis app ini)

Jangan tambahkan tanpa alasan kuat:

- CSRF token (auth JWT-header, bukan cookie).
- Enkripsi kolom PII (RLS + TLS + at-rest Supabase sudah lapisan yang benar; tidak ada SSN/pembayaran).
- Redis / Vercel KV rate limiting (`batasi_laju` Postgres cukup).
- WAF lanjutan, multi-region failover, PCI-DSS, SAML/OIDC, penetration test terjadwal.
- Service worker / offline cache aset (risiko menyajikan JS basi — persis akar masalah ERROR_LOG #38).
- CORS proxy di depan PostgREST.

---

## 12. Checklist pra-deploy (tiap perubahan)

- [ ] `cd frontend && npx tsc --noEmit` — hijau.
- [ ] `npx next build` — hijau.
- [ ] Kelas Tailwind baru → grep CSS hasil build (`.next/static/chunks/*.css`) — Tailwind v4 bisa diam-diam tidak generate.
- [ ] Perubahan RLS/RPC → SQL diagnostik + impersonasi ke produksi.
- [ ] Migrasi baru → berkas idempoten + ingatkan owner + catat di ingatan.
- [ ] Bug baru → entri `ERROR_LOG.md` di commit yang sama dengan fix.
- [ ] Commit `feat:/fix:/refactor:/docs:/style:`, akhiri `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- [ ] Push `main` = auto-deploy Vercel. Tidak ada CI frontend — verifikasi lokal adalah satu-satunya jaring.
