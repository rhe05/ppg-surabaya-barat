# Migration Guide — Operator Reference

For whoever picks up cutover work later (may be future-you, may not). Written from
what's actually been done and verified in this project, not a generic template.

## 1. Current architecture

- **Old (still live, still serving real users)**: Google Apps Script + Google
  Sheets/Firestore, app name "Ruang Ngaji". Do not touch without a clear reason — 18
  kelompok's guru use it daily.
- **New (in progress, not live)**: Supabase Postgres (`ruang-ngaji-dev`, ref
  `fnhqtkqswxsqmjxynldg`) + Next.js frontend (`frontend/`, this repo).

## 2. Supabase project setup (already done, documented for reference)

- Schema: `08_Development/tpq-app/supabase/migrations/20260805080137_database_foundation.sql`
  — 36 tables, RLS enabled on all, `profiles` table keyed to `auth.users` (1:1),
  scope columns (`scope_ppg_id`/`scope_desa_id`/`scope_kelompok_id`) drive
  authorization instead of separate junction tables.
- 2 read-only helper RPCs exist for schema introspection (`pg_list_public_tables()`,
  `pg_table_columns(p_table_name)`) — PostgREST doesn't expose `information_schema`
  directly, these were added manually via SQL Editor. No raw-SQL-exec RPC exists (by
  design — higher blast radius, never added).
- GRANTs: `service_role` gets full privileges, `anon`+`authenticated` get `SELECT`
  only on `public` schema tables. Both confirmed live via real query tests, not just
  assumed from the GRANT statement running without error.

## 3. Data load (already done for 4 of 18 kelompok)

Scripts live in project root (`extract_engine.js` → `transform_engine.js` →
`load_engine.js`), explicitly flagged in their own headers as throwaway prototypes,
not the formal 17-folder Migration 004 architecture. They work, and have loaded real
data once (1646/1646 rows, 2026-08-11), but:
- Only Kelp Petemon (1), Bangun Rejo (6), Purwodadi (7), Dupak (8) have real data.
- The other 14 kelompok need the same extract→transform→load run against their
  Sheets data — the scripts branch by source (Firestore for kelompok 1, Sheets for
  the rest) so this should mostly be re-running the same pipeline, not new code, but
  hasn't been tried at that scale.
- `transformed_data.json` is git-ignored (contains real santri PII) — regenerate via
  `node extract_engine.js && node transform_engine.js`, don't expect it checked in.

## 4. RLS policies

32 policies across 8 tables (santri, guru, absensi, kurikulum_prota/promes/probul,
jadwal_kbm, jadwal_kategori_hari) — generated in chat during Day 7-adjacent sessions,
executed manually by the project owner in the SQL Editor (not by any script — no
DDL-execution tooling exists in this project by design). Relies on a
`security definer` helper function `auth_profile()` to read the caller's own
`profiles` row without hitting `profiles`' own default-deny RLS. If you need to
regenerate or audit these, the actual SQL text isn't saved to a file anywhere in this
repo — it only exists in chat history from that session. **Recommend writing it to
`08_Development/tpq-app/supabase/migrations/` as a proper migration file before
go-live**, so it's reproducible from a fresh `supabase db push` instead of living only
in someone's memory of a chat.

## 5. What cutover actually requires (not done yet)

In rough dependency order:
1. **Auth implementation** in `frontend/` — login page, `signInWithPassword`,
   session-aware Supabase client (currently only the bare anon-key client exists).
2. **Real user migration** — the 6 real users' old SHA-256 password hashes can't
   convert to Supabase Auth; they need fresh accounts + a communicated password
   reset, not a silent migration.
3. **Role-scoped RLS testing** — with real sessions (see
   `testing/RLS_TEST_PLAN.md` Test 3), not just the unauthenticated default-deny
   check that's already done.
4. **Remaining 14 kelompok extraction** — decide if this happens before or after
   initial cutover (could plausibly launch with 4 kelompok live and backfill the
   rest, if that's operationally acceptable — that's a product decision, not a
   technical one).
5. **Formalize the RLS SQL as a migration file** (see §4).
6. **Backup/monitoring** — neither exists yet, see `GOLIVE_CHECKLIST.md` items 11–12.

## 6. Validation commands (real, tested this project)

```bash
# Check schema state
node check_supabase_schema.js

# Re-run extract/transform for kelompok 1/6/7/8 (needs GCP service account creds, see
# EXTRACT_EXECUTION_REPORT.md for the one-time setup)
node extract_engine.js
node transform_engine.js
node load_engine.js

# Frontend build/verify
cd frontend && npm run build && npm run dev
# then check http://localhost:3000/dashboard and /reports manually
```

No automated test suite exists for either the migration scripts or the frontend —
every verification so far has been manual (real queries, real browser checks), not
CI-enforced.
