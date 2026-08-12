# RLS Test Plan — Day 8

Status: **documented intent only, not executed**. Every test below states what should
happen and why, but none has a recorded pass/fail result yet — don't read this file as
a test report.

## Test 1 — service_role bypass

**Intent**: `service_role` bypasses RLS entirely (Postgres role-level bypass, not a
policy grant) — this is the same key used by `extract_engine.js`/`load_engine.js`
throughout the migration, and by the UAT spot-checks earlier this project.

```sql
-- run as service_role (the key in root .env, SUPABASE_KEY)
select count(*) from santri;
```

**Expected**: `199` (matches the verified load count from the 2026-08-11 session).

**Status**: not run this session. Live-verifiable in under a minute via the same
pattern used for every prior UAT check in this project (`supabase-js` + `.env`
service key) — flagging as a cheap thing to actually run before go-live, not just
document.

## Test 2 — anon role default-deny

**Intent**: confirms the GRANT (SELECT-only, `anon`+`authenticated`) plus the 32 RLS
policies together produce default-deny for an unauthenticated request — this was
**already live-verified** two sessions ago (Day 5 connectivity test): `curl
localhost:3000/api/santri` with the anon key returned `{"data":[]}`, HTTP 200, not
`permission denied`. Not re-documenting as new — pointing at the existing proof so
this isn't double-counted as a fresh result.

**Status**: ✅ confirmed (2026-08-13 session, not this one).

## Test 3 — per-role scoped access (GURU / DESA_ADMIN / PPG_ADMIN)

**Intent**: with a real authenticated session as each of the 3 test profiles
(`testing/seed_test_data.sql`), confirm:
- `test.guru` (scope_kelompok_id=6) sees only Kelp Bangun Rejo's santri/guru/absensi
  rows, nothing from other kelompok.
- `test.admindesa` (scope_desa_id=2) sees all of Purwodadi desa's kelompok (6, 7, 8),
  nothing from Petemon (desa 1) or other desa.
- `test.adminppg` (scope_ppg_id=1) sees everything.

**Status**: ⚠️ **BLOCKED — not run, not runnable yet.** Two separate blockers, both
real:

1. **No JWT/session exists for the test users.** The `profiles` rows in
   `seed_test_data.sql` are FK'd to `auth.users` rows that don't exist yet (creating
   them needs the Admin API, not raw SQL — see the caveat in that file). Without a
   real `auth.users` row + a way to sign in as it, there's no JWT to attach to a
   Supabase client or to the frontend's `fetch` calls, so `auth.uid()` inside the RLS
   policies' `auth_profile()` helper has nothing to resolve.
2. **The frontend has no login/session flow at all.** Day 5–7 built `lib/supabase.ts`
   with the anon key only, no `signInWithPassword`, no session persistence, no way to
   attach a JWT to the API routes' server-side Supabase client. `GET /api/santri as
   guru` isn't something the current codebase can do yet — it would need actual auth
   UI/logic, which every prior Day explicitly scoped out ("no auth logic yet").

**What would unblock this**: a Day 9-ish "Auth implementation" pass — login page,
`supabase.auth.signInWithPassword()`, session-aware API routes (forwarding the
user's JWT instead of using a bare anon client). Until then, Test 3 stays a documented
intent, not a result.

## API Routes Test — as different roles

Same blocker as Test 3 — `GET /api/santri` as `guru` (scope_kelompok_id=6) and as
`admin_desa` (scope_desa_id=2) both require a real signed-in session the current app
doesn't support. Documenting the expected shape for later:

- As `test.guru`: `/api/santri` → only rows where `kelompok_id = 6`.
- As `test.admindesa`: `/api/santri` → all rows where `kelompok_id` is one of
  `{6, 7, 8}` (kelompok belonging to `desa_id = 2`).

**Status**: not run, blocked on auth (same root cause as Test 3).

## Dashboard Load Test

**Intent**: `npm run dev` → `http://localhost:3000/dashboard` loads without errors.

**Status**: ✅ already verified in the Day 6 session (real browser check, network
tab confirmed 200 OK on all 3 API calls, zero console errors). Not re-run here since
nothing changed in `frontend/` this session (this task is documentation-only, per
scope).

---

# HASIL AKHIR (2026-08-13) — semua tes di atas sudah dijalankan

Dokumen di atas ditulis saat tes belum bisa jalan. Statusnya sekarang:

- **Test 1 (service_role bypass)** — tidak dijalankan sebagai tes terpisah, tapi
  terbukti implisit: seluruh verifikasi lain memakai service_role key dan membaca
  data penuh tanpa hambatan RLS.
- **Test 2 (anon default-deny)** — ✅ terverifikasi.
- **Test 3 (scoped access per role)** — ✅ **TERVERIFIKASI, LULUS.** Login sungguhan
  di browser untuk 3 akun: guru → 50 santri, admin_kelompok → 50, admin_desa → 130.
  Angka cocok persis dengan kebenaran di DB. Sebaran kelompok untuk admin_desa
  tepat {6,7,8} tanpa kebocoran.
- **API routes per role** — tidak berlaku lagi: route `/api/santri|guru|absensi`
  sudah DIHAPUS. Komponen query Supabase langsung, JWT ikut otomatis, RLS yang
  menjaga. Ini justru perbaikan atas bug di mana route selalu query sebagai anonim.
- **Dashboard load** — ✅ terverifikasi.

Dua bug nyata ditemukan lewat proses ini dan sudah diperbaiki: (1) tabel referensi
`kelompok`/`desa`/`ppg` punya RLS aktif tanpa policy sama sekali, membuat cabang
`admin_desa` mengembalikan 0; (2) API route tidak meneruskan JWT user. Detail
lengkap ada di memory proyek dan `frontend/AUTH_SETUP.md`.
