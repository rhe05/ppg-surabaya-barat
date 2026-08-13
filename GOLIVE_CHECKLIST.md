# Go-Live Checklist — Ruang Ngaji → Supabase

Status snapshot as of 2026-08-13. Each item marked with real state, not aspirational —
unchecked means genuinely not done, not "assumed fine."

- [x] **1. Schema deployed** — Migration 002 (36 tables, RLS enabled) live on
      `ruang-ngaji-dev`, verified via live `information_schema` queries multiple
      sessions.
- [x] **2. Real production data loaded** — 1646/1646 rows across 13 tables, verified
      via `count: 'exact'` per table (2026-08-11 session), not just the loader's own
      report.
- [x] **3. GRANT privileges correct** — `service_role` (fixed 2026-08-11) and
      `anon`/`authenticated` (fixed + live-verified 2026-08-13, real curl test)
      both confirmed.
- [x] **4. RLS policies written + executed** — **36 policies across 12 tables**
      (counted directly from `pg_policies` on 2026-08-13; the earlier "32 across 8"
      figure was stale). Live-verified via the Day 5 connectivity test
      (`{"data":[]}` HTTP 200 for unauthenticated requests, not `permission denied`).
- [x] **5. Role-scoped RLS actually tested** — ✅ **DONE 2026-08-13.** Real browser
      logins for 3 accounts: `guru` → 50 santri, `admin_kelompok` → 50, `admin_desa`
      → 130, matching DB truth exactly. admin_desa's rows span exactly kelompok
      {6,7,8}, no leakage. Two real bugs found and fixed getting here (reference
      tables had RLS with zero policies; API routes never forwarded the user's JWT).
      ⚠️ `admin_ppg` tier still untested — no account for it.
- [x] **6. Auth implementation** — ✅ **DONE 2026-08-13.** `lib/auth-context.tsx`,
      `app/auth/login/page.tsx`, `components/RequireAuth.tsx`, logout. Note: route
      protection is client-side, not edge middleware (session lives in localStorage;
      real edge protection needs `@supabase/ssr` + cookies). RLS is the actual
      security boundary, so this is a UX concern, not a data-leak one.
- [ ] **7. Real user migration (6 users)** — ⚠️ **NOT DONE.** Old SHA-256 password
      hashes from the Apps Script system can't carry over to Supabase Auth (different
      algorithm entirely) — flagged since Migration 003, still open. `profiles` table
      has 0 rows.
- [ ] **8. `guru.jenis_kelamin` data gap** — 12/18 guru rows NULL, confirmed a
      source-data gap (3 kelompok's Sheets never had it filled in), not a migration
      bug. Your call whether this blocks go-live or gets fixed post-launch.
- [ ] **9. Remaining 14 kelompok not migrated** — only 4 of 18 kelompok (Kelp
      Petemon/Bangun Rejo/Purwodadi/Dupak) have real extracted data. The other 14 have
      zero rows in Supabase.
- [x] **10. Frontend scaffold builds clean** — `npm run build` passes with 0
      TypeScript errors as of Day 7 (dashboard + reports pages).
- [ ] **11. Backups / rollback plan** — not discussed or created this session. The
      live production app (Apps Script + Sheets/Firestore) is untouched and still
      serving real traffic, so there's an implicit rollback (do nothing), but no
      explicit Supabase backup/restore procedure has been written.
- [ ] **12. Monitoring / error tracking** — nothing set up for the Next.js app or
      Supabase project (no Sentry, no Supabase log alerts, nothing beyond Supabase's
      own dashboard).

- [x] **13. RLS policies not captured as a migration file** — ✅ **DONE 2026-08-13.**
      Migration 003 written and committed:
      `08_Development/tpq-app/supabase/migrations/20260813125217_rls_policies_and_functions.sql`
      (commits `038c975`, `2be772c`, **local only, not pushed**). Contains 37 policies,
      7 functions, 1 event trigger (`ensure_rls`), and GRANTs — dumped from the live DB
      via the Management API, not written from memory.
      ⚠️ **Never test-pushed.** `supabase db push` has not been run anywhere, so the
      file is verified by inspection only (counts, ordering, no duplicate triggers).
      Note: migration 002 already contains all 26 regular triggers, so 003 deliberately
      contains none — re-adding them would fail with "trigger already exists".

- [ ] **14. 24 tabel RLS aktif tanpa policy** — ⚠️ **NEW, added 2026-08-13.** Dari 37
      tabel, 12 punya policy dan **25 terkunci** (RLS on, nol policy → hanya
      `service_role` yang bisa menyentuhnya). Satu sudah ditutup di migrasi 003
      (`kategori_kbm`, satu-satunya yang punya data — 15 baris), sisa **24 belum
      diputuskan** dan sengaja dibiarkan.
      Tidak ada yang rusak sekarang: `frontend/` cuma menyentuh 4 tabel
      (`absensi`/`santri`/`guru`/`profiles`), semuanya berpolicy. Tapi 24 tabel itu
      semuanya masih 0 baris, jadi bug "balik 0 baris" tidak bisa dibedakan dari
      "tabelnya memang kosong" — jebakannya baru muncul saat data 14 kelompok sisanya
      dimuat atau saat ada halaman baru yang menyentuhnya. Detail per tabel +
      klasifikasi: `snapshot/AUDIT_RLS_GAP_13_AUG.md`.

## Bottom line

**Closer, but not ready.** Items 5 and 6 are now genuinely done and verified — an
actual user can log in and sees exactly their own scoped data, which was the biggest
unknown across every prior session.

Item 13 (RLS not reproducible from migrations) is now closed on paper — migration 003
exists and is committed. It has never been push-tested, so treat it as written-but-unproven
until a real `supabase db push` runs somewhere.

Remaining blockers, in the order I'd tackle them:
1. **Test-push migration 003** — needs either Docker Desktop (for `supabase db push`
   with a shadow DB) or a throwaway Supabase project to push against. Until this runs,
   the fix for item 13 is unverified.
2. **Item 14** (24 tabel terkunci) — decide per table: butuh policy, atau memang
   sengaja tertutup. Paling murah dikerjakan sekarang selagi semuanya masih 0 baris.
3. **Item 9** (14 of 18 kelompok have no data) — product decision: launch with 4 and
   backfill, or extract the rest first?
4. **Item 7** (6 real users need Auth accounts + password reset comms).
5. **PostgREST 1000-row limit** on `absensi` (currently 950) — not broken yet, will
   silently truncate charts/reports once crossed.

Items 8, 11, 12 remain post-launch-acceptable depending on risk tolerance.
