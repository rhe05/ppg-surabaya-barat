# Auth Setup — Day 9

## How it works

- `lib/auth-context.tsx` — `AuthProvider` wraps the whole app (`app/layout.tsx`).
  Tracks the Supabase session (`supabase.auth.getSession()` + `onAuthStateChange`)
  and, once a session exists, fetches the matching `profiles` row for
  nama/role/scope display.
- `app/auth/login/page.tsx` — email/password form, calls
  `supabase.auth.signInWithPassword()` via `useAuth().signIn()`, redirects to
  `/dashboard` on success.
- `components/RequireAuth.tsx` — client-side route guard. Wraps `dashboard/page.tsx`;
  redirects to `/auth/login` if there's no session once the initial session check
  finishes.
- Logout: `useAuth().signOut()` (calls `supabase.auth.signOut()`), wired to a
  "Keluar" button on the dashboard, redirects to `/auth/login`.
- Session persistence: handled entirely by `@supabase/supabase-js`'s default
  behavior (`persistSession: true` is the client default) — no extra code needed,
  confirmed no new packages were installed for this.

## Deviation from the spec, explained

**No `middleware.ts` was created**, even though it was requested. Reason: Next.js
middleware runs at the edge/server, before any page JS executes — it cannot read
`localStorage`, which is where the plain `@supabase/supabase-js` client stores the
session (that's the "session persistence via localStorage" the task explicitly asked
to keep). A `middleware.ts` written against `localStorage` would silently never work
— it'd always see "no session" and redirect everyone, authenticated or not.

Real edge-level route protection needs the session to travel as a **cookie**, which
requires the `@supabase/ssr` package (a `createServerClient` that reads/writes
auth cookies) — but the task explicitly said "no new packages." Given that
constraint, I built **client-side route protection** instead (`RequireAuth.tsx`) —
it works today with the existing setup, it's just enforced after the page's JS
loads rather than before the server even renders it (a user with JS disabled, or
hitting the page during the brief loading flash, technically sees an empty
loading state rather than being blocked at the network layer). Flagging this
explicitly rather than shipping a `middleware.ts` that looks like protection but
silently doesn't work.

**If real edge-level protection matters before go-live**, the fix is: add
`@supabase/ssr`, switch `lib/supabase.ts` to `createBrowserClient`, add a
`createServerClient` for API routes/middleware, and then `middleware.ts` becomes
possible for real. That's a deliberate scope decision, not something to silently
add here.

## Real gap found while building this: `profiles` has no self-read policy

`profiles` has RLS enabled with 0 policies (intentional default-deny per Migration
002). The 32 policies on santri/guru/etc. work around this via a
`security definer` helper function for their own internal use — but that doesn't
help a client directly querying `profiles` for its own row, which is exactly what
the dashboard's "nama/role/scope" display does. Without a self-read policy, every
authenticated user gets an empty result for their own profile — the dashboard will
show "Profil tidak ditemukan untuk akun ini" even for a user whose profile row
genuinely exists. Fix generated (not executed) at
`testing/profiles_self_read_policy.sql`.

## Test accounts

3 test accounts exist in `ruang-ngaji-dev` (created by the project owner via the
Supabase Dashboard, not by any script here):

| Email | Role | Scope | Expected santri visible |
|---|---|---|---|
| test1@example.com | `guru` | kelompok 6 | 50 |
| test2@example.com | `admin_kelompok` | kelompok 6 | 50 |
| test3@example.com | `admin_desa` | desa 2 (kelompok 6,7,8) | 130 |

**Passwords are deliberately not recorded in this repo** — ask the project owner, or
reset via the Supabase Dashboard. These are working credentials for accounts that
really exist; committing them to git would be a bad habit even for a dev project.

**Role enum labels are confirmed lowercase** (`guru`, `admin_kelompok`, `admin_desa`,
and presumably `admin_ppg`). This was a long-running unknown across several sessions —
the uppercase `GURU`/`DESA_ADMIN`/`PPG_ADMIN` set used in the originally generated 32
RLS policies was **wrong**; the deployed policies now use the lowercase labels.

## What's actually verified

✅ **All verified in a real browser, logging in through the actual form:**
- Route guard: unauthenticated `/dashboard` and `/reports` both redirect to
  `/auth/login`.
- Login works for all 3 accounts; user context (nama/role/scope) displays correctly,
  which also confirms the `profiles` self-read policy is in place.
- **RLS scoping is correct**: test1 → 50 santri, test2 → 50, test3 → 130. Counts read
  from the rendered DOM by paginating to the last page, not from page 1. test3's rows
  span exactly kelompok {6,7,8} with no leakage from other desa, and its Ringkasan
  Absensi aggregates only those same 3 kelompok.
- Logout returns to `/auth/login` for all 3.
- Invalid credentials surface "Email atau password salah" from real GoTrue.
- `npm run build` passes, 0 TypeScript errors.

⚠️ **Not covered:**
- The `admin_ppg` tier — no test account exists for it.
- PostgREST's 1000-row default limit: `absensi` is at 950 for the widest scope. Once
  it crosses 1000, `AbsensiChart` / `AttendanceSummaryReport` will silently truncate
  with no error. Needs server-side aggregation or pagination before then.
