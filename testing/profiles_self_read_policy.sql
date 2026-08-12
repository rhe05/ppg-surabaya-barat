-- testing/profiles_self_read_policy.sql
-- NOT EXECUTED. Generated this session while wiring up the dashboard's
-- user-context display (nama/role/scope) — found a real gap, documenting it here
-- rather than guessing past it.
--
-- Why this is needed: `profiles` has RLS enabled with 0 policies (intentional
-- default-deny from Migration 002 — "policy menyusul migrasi keamanan terpisah").
-- The 32 RLS policies on santri/guru/absensi/etc. work around this via the
-- `auth_profile()` SECURITY DEFINER helper function, which bypasses profiles' RLS
-- internally. But that trick only helps *other* tables' policies read the caller's
-- scope — it does nothing for a client directly querying
-- `supabase.from('profiles').select(...)`, which is exactly what
-- `lib/auth-context.tsx` does to show "nama/role/scope" on the dashboard.
--
-- Without this policy, every authenticated user gets 0 rows back for their OWN
-- profile — indistinguishable from "no profile exists for this account" from the
-- client's point of view.

alter table profiles enable row level security; -- already enabled, no-op if so

create policy profiles_select_own on profiles
for select
using (id = auth.uid());

-- Deliberately NOT adding update/insert/delete self-policies here — out of scope
-- for this task (read-only dashboard display), and self-service role/scope editing
-- is a separate authorization decision (should a GURU be able to edit their own
-- `role`? almost certainly not) that shouldn't be bundled into this fix.
