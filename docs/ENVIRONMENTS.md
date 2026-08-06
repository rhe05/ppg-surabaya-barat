# Environments — RUANG NGAJI / Migration 004

> Generated during Phase 2 (Development Foundation Automation). Reflects actual verified state as
> of 2026-08-06. Update this file if a new environment is ever created — do not let it go stale.

## Current State

| Environment | Exists | Supabase Project | Project Ref | Region | Status |
|---|---|---|---|---|---|
| **Development** | ✅ Yes | `ruang-ngaji-dev` | `fnhqtkqswxsqmjxynldg` | `ap-northeast-1` | `ACTIVE_HEALTHY` |
| **Staging** | ❌ Does not exist | — | — | — | — |
| **Production** | ❌ Does not exist | — | — | — | — |

Verified via `supabase projects list` against the authenticated Supabase organization
(`xjwuqakawlaviurwtmcd`) — **Development is the only project in the org.**

## Rule: Development Only, Enforced Explicitly

Every piece of tooling in this repository that could target a Supabase project must **hardcode**
the Development project ref (`fnhqtkqswxsqmjxynldg`) rather than accept it as a free-form
parameter. This is deliberate, not an oversight:

- `.github/workflows/supabase-validate.yml` sets `SUPABASE_PROJECT_ID` as a hardcoded workflow
  `env:` value and has an explicit `environment-guard` job that refuses to run if
  `TARGET_ENVIRONMENT` is ever anything other than `development`.
- Local `supabase/.temp/project-ref` (CLI-managed, gitignored) currently resolves to the same
  ref.

**Because Staging and Production do not exist**, there is currently no way for any command in
this repo to accidentally reach them — this is the simplest possible enforcement of Migration
004's "safety before speed" principle (see [MAS §2](architecture/MAS.md#2-guiding-principles)).

## When Staging or Production Are Created

Do not generalize the hardcoded-ref pattern above into a parameterized "pick your environment"
mechanism just because a second environment now exists. Instead:

1. Add a new row to the table above with the new project's real ref.
2. Create a **separate**, explicitly-named workflow/config path for it (e.g.
   `supabase-validate-staging.yml`), never a shared parameterized one — this keeps a
   Development-only mistake structurally impossible rather than merely policy-discouraged.
3. Re-run the relevant sections of [Task 9 — Operational Runbook](architecture/Task09_Runbook.md)
   (roles, approval gates, Go/No-Go) for whatever process will govern promotion between
   environments — this doesn't exist yet because there's only ever been one environment to
   reason about.

## Related Documents

- [MAS — Master Architecture Specification](architecture/MAS.md)
- [Task 9 — Operational Runbook & Production Cutover](architecture/Task09_Runbook.md)
