-- testing/seed_test_data.sql
-- Day 8 — RLS test fixtures for `ruang-ngaji-dev`.
-- NOT EXECUTED. Reference/documentation only, per this task's "no code changes" scope.
--
-- IMPORTANT CAVEAT (read before running):
-- Supabase manages `auth.users` through GoTrue (password hashing, session tokens,
-- confirmation flow, etc.) — inserting rows into `auth.users` with a raw SQL INSERT
-- is NOT the supported path and commonly breaks (missing `encrypted_password` format,
-- no confirmation, GoTrue cache desync). The supported way to create real test users is
-- the Admin API (`supabase.auth.admin.createUser()`, service_role key, e.g. via a
-- one-off Node script) or Dashboard > Authentication > Add User. The block below is
-- included because it was asked for, but treat it as illustrative, not something to
-- paste into the SQL Editor as-is.

-- ============================================================
-- Real scope ids used below (verified live against ruang-ngaji-dev
-- this session, not guessed):
--   ppg.id = 1            ("PPG Surabaya Barat")
--   desa.id = 1            ("Petemon", ppg_id=1)
--   desa.id = 2            ("Purwodadi", ppg_id=1)
--   kelompok.id = 6         ("Kelp Bangun Rejo", desa_id=2)
-- ============================================================

-- --- NOT RECOMMENDED, illustrative only ---
-- insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
-- values
--   ('11111111-1111-1111-1111-111111111111', 'test.guru@ruangngaji.test', crypt('<REDACTED>', gen_salt('bf')), now(), now(), now()),
--   ('22222222-2222-2222-2222-222222222222', 'test.admindesa@ruangngaji.test', crypt('<REDACTED>', gen_salt('bf')), now(), now(), now()),
--   ('33333333-3333-3333-3333-333333333333', 'test.adminppg@ruangngaji.test', crypt('<REDACTED>', gen_salt('bf')), now(), now(), now());

-- ============================================================
-- profiles rows — SAFE to run via SQL Editor, but ONLY AFTER the
-- 3 corresponding auth.users rows above actually exist (FK to
-- auth.users.id) — created via Admin API, not the block above.
-- ============================================================
insert into public.profiles (id, display_name, role, scope_ppg_id, scope_desa_id, scope_kelompok_id, is_active)
values
  ('11111111-1111-1111-1111-111111111111', 'Test Guru (Bangun Rejo)', 'GURU', null, null, 6, true),
  ('22222222-2222-2222-2222-222222222222', 'Test Admin Desa (Purwodadi)', 'DESA_ADMIN', null, 2, null, true),
  ('33333333-3333-3333-3333-333333333333', 'Test Admin PPG', 'PPG_ADMIN', 1, null, null, true)
on conflict (id) do update set
  role = excluded.role,
  scope_ppg_id = excluded.scope_ppg_id,
  scope_desa_id = excluded.scope_desa_id,
  scope_kelompok_id = excluded.scope_kelompok_id,
  is_active = excluded.is_active;

-- ⚠️ Role enum label caveat, unresolved from earlier in this project's testing:
-- the actual `role` enum label set in `ruang-ngaji-dev` has never been confirmed
-- (no RPC exists to read pg_enum, profiles table has been empty every time it was
-- checked). 'GURU'/'DESA_ADMIN'/'PPG_ADMIN' above matches the RLS policy SQL
-- generated earlier, but if the real enum uses different labels this INSERT will
-- fail with an invalid input value error, not silently succeed wrong.

-- ============================================================
-- STATUS UPDATE (2026-08-13): this file is superseded, kept for reference only.
-- ============================================================
-- The actual test accounts that now exist in `ruang-ngaji-dev` were created by the
-- project owner via the Supabase Dashboard, with different emails than the ones
-- sketched above: test1@example.com (guru, kelompok 6), test2@example.com
-- (admin_kelompok, kelompok 6), test3@example.com (admin_desa, desa 2).
-- Passwords are intentionally NOT recorded in this repo.
--
-- ⚠️ Also note the role labels above (`GURU`/`DESA_ADMIN`/`PPG_ADMIN`) are WRONG.
-- The real enum labels are lowercase: `guru`, `admin_kelompok`, `admin_desa`
-- (and presumably `admin_ppg`). Confirmed empirically 2026-08-13. Don't copy the
-- uppercase values from the INSERT above without fixing them first.
--
-- RLS scoping with these accounts is verified working end-to-end — see
-- `frontend/AUTH_SETUP.md` for the confirmed results (50 / 50 / 130).
