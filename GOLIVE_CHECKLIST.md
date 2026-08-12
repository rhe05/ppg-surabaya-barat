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
- [x] **4. RLS policies written + executed** — 32 policies across 8 tables, generated
      this project, user-confirmed executed, **live-verified** via the Day 5
      connectivity test (`{"data":[]}` HTTP 200 for unauthenticated requests, not
      `permission denied`).
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

- [ ] **13. RLS policies not captured as a migration file** — ⚠️ **NEW, added
      2026-08-13.** All ~35 policies (the original 32 + `profiles` self-read + the 3
      reference-table reads) exist only as ad-hoc SQL run through the Dashboard
      editor. They are **not** in `08_Development/tpq-app/supabase/migrations/`. A
      fresh `supabase db push` to a new project (staging/production) would produce a
      database with RLS enabled and **no policies** — silently denying everything,
      or worse, if someone "fixes" it by disabling RLS. Highest-priority gap.

## Bottom line

**Closer, but not ready.** Items 5 and 6 are now genuinely done and verified — an
actual user can log in and sees exactly their own scoped data, which was the biggest
unknown across every prior session.

Remaining blockers, in the order I'd tackle them:
1. **Item 13** (RLS not reproducible from migrations) — real correctness risk the
   moment anything touches a non-dev environment.
2. **Item 9** (14 of 18 kelompok have no data) — product decision: launch with 4 and
   backfill, or extract the rest first?
3. **Item 7** (6 real users need Auth accounts + password reset comms).
4. **PostgREST 1000-row limit** on `absensi` (currently 950) — not broken yet, will
   silently truncate charts/reports once crossed.

Items 8, 11, 12 remain post-launch-acceptable depending on risk tolerance.
