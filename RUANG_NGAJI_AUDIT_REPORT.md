# Ruang Ngaji Comprehensive Audit Report

**Date**: 2026-08-09
**Scope**: Read-only analysis. No code, schema, or migration changes were made while producing this report.
**Method**: Direct filesystem inspection (folder listings, `git log`/`git tag`, `grep`/`wc` over docs and SQL, targeted reads of primary sources) — not inference from prior conversation memory. Every claim below is either sourced from a specific file (cited inline) or explicitly marked `UNKNOWN — need investigation`.

> ⚠️ **Correction to the request framing before you read further**: the request that produced this report described the migration as "Phase 3 Implementation Engineering (berjalan/running)" with "known gaps: UUID strategy, FK load order." Neither of those two claims survived verification against the actual repo:
> - **UUID strategy is already decided and documented**, not a gap — deterministic UUIDv5 (namespace + legacy-id), see [§7](#7-architecture-gaps--decisions).
> - **FK load order is already decided and documented**, not a gap — exact sequence `ppg → desa → kelompok → jadwal_kategori_hari → users → guru → santri → jadwal_kbm → absensi`, see [§7](#7-architecture-gaps--decisions).
> - **No implementation is "running."** Every migration-engine PRD in the repo is explicitly labeled `DRAFT — design only, no implementation, no SQL`, and a prior internal audit (`AUDIT_READ_PERFORMANCE_2026-08-07.md:22`) states outright: *"migrasi datanya belum dieksekusi sama sekali (baru skema + dokumen arsitektur, 0 baris data dipindah, 0 user memakainya)"* ("the data migration has not been executed at all — only schema + architecture docs exist, 0 rows moved, 0 users on it").
>
> This report proceeds from what's actually in the repo, not from the request's premise.

---

## 1. Executive Summary

- **Project status**: The production app (Google Apps Script + Sheets + Firestore, "Ruang Ngaji") is live, actively used daily by guru/admin across the org, and under continuous active development (most recent commits: 2026-08-09). This is the system of record today.
- **Migration status**: 0% executed. Architecture is fully designed and formally frozen (`migration004-architecture-freeze-v1.0.0` tag, 2026-08-06). Four of nine pipeline stages (Extract/Transform/Validate/Load) have detailed implementation-level PRDs, but **every one is marked DRAFT / no code**. A Supabase project is linked and one schema migration (35 tables, 952 lines of SQL) has been pushed to it — but **zero application data has been migrated**.
- **Data volume (real, production)**: 199 santri, 890 valid absensi rows + 483 orphaned absensi rows, 18 guru — and only **4 of 18 kelompok have any real data at all** (source: `AUDIT_READ_PERFORMANCE_2026-08-07.md:119`, citing live `?diag=kelompokdist`). The request's framing ("100 Kelompok migration, data volume unknown") does not match the org's actual footprint — there are 18 kelompok total in the current schema, not 100, and volume is *not* unknown; it's small and documented.
- **Top 3 blockers**:
  1. No extraction-source-topology confirmation from the user (single spreadsheet? single Firestore project?) — flagged as the top risk-register item in `MAS.md:355`, still open.
  2. Zero implementation code exists for any of the 9 pipeline stages — every stage is design-only.
  3. 483 orphaned absensi rows (Migration 003 residue, kelompok 6/7/8 unswept) are a **confirmed-present data-quality defect** the Validate stage must gate on before any load (`MAS.md:356`).
- **Next 30 days critical path** (see [§10](#10-next-sprint-recommendations) for detail): resolve the open extraction-topology question with the user → implement the Extract engine against the DRAFT PRD → validate against real (small, 4-kelompok) data → do not attempt "100 kelompok" scale work, because that scale doesn't exist in this org yet.

---

## 2. Folder Topology

```
PPG_Surabaya_Barat/
├── 01_Benchmark/          Competitive/prior-art research (2 files)
├── 02_Research/           Market research (1 file)
├── 03_Product/            Product strategy & vision (2 files)
├── 04_PRD/                Master PRD + feature breakdown for the APPS SCRIPT app (2 files)
├── 05_Analysis/           Business analysis, business rules, user journeys/personas (4 files)
├── 06_Design/             Design system, IA, UI spec, wireframes (4 files)
├── 07_Architecture/       Original System/API/Database design docs — Sheets-era, PRE-Supabase (3 files)
├── 08_Development/        Code. Contains tpq-app/ (Next.js+Prisma+Supabase scaffold, see §4)
├── 09_Testing/            Testing plan (1 file)
├── 10_Deployment/         Release plan (1 file)
├── 11_Decision Log/       ADR.md — architecture decision records
├── 12_Change Log/         Version History.md
├── 13_AppsScript/         THE PRODUCTION APP — Google Apps Script backend + HTML/CSS/JS frontend
├── docs/
│   ├── architecture/      Migration 004 design docs: MAS.md (SSOT) + Task01-09 + sprint-02/ PRDs
│   └── performance/       ~35 performance/optimization audit reports (Apps Script era, ongoing)
├── .github/workflows/     CI: deploy-appsscript.yml (Apps Script auto-deploy), supabase-validate.yml
├── .claude/worktrees/     A git worktree snapshot from a prior/parallel Claude Code session — NOT primary tree, excluded from all counts in this report
└── [root-level .md files] FILE_MAP.md, ERROR_LOG.md, CLAUDE.md, several AUDIT_*.md, PHASE_8_*.md
```

**Last-modified reality check** (from `git log -1` per area, not filesystem mtime — filesystem mtime is unreliable after a clone/checkout):
| Area | Last commit | What it tells you |
|---|---|---|
| `13_AppsScript/` | 2026-08-09 (today) | Actively developed — this is where real work happens |
| `docs/architecture/` | 2026-08-07 | Sprint 2 engine PRDs (Extract/Transform/Validate/Load) — 2 days stale, not "running" |
| `08_Development/` | 2026-08-06 | "Development Foundation" commit — added the Supabase project link + first migration |
| `01_Benchmark`–`10_Deployment` | 2026-07-15 (single initial commit) | Pre-implementation planning docs from project kickoff, untouched since |

---

## 3. Markdown Documentation Index

77 `.md` files exist in the primary tree (excludes `.git/`, `node_modules/`, and the `.claude/worktrees/` snapshot). Full per-file classification of all 77 was out of scope for the time available; below is every file that functions as a **single source of truth (SSOT)** or **migration-critical** document, plus the folder-level summary from §2. A full flat list is available via `find . -iname "*.md" -not -path "./.git/*" -not -path "*/node_modules/*"` if needed.

| File | Path | Purpose | Status | Size |
|---|---|---|---|---|
| **MAS.md** | `docs/architecture/MAS.md` | **Migration 004 Master Architecture Specification — declared SSOT for the migration** ("consolidates Tasks 1-9... does not alter any decision") | Frozen/Approved (`migration004-architecture-freeze-v1.0.0`) | 639 lines |
| Task01_Architecture.md | `docs/architecture/` | Folder structure, runId convention | Approved | 54 lines |
| Task02_ExecutionFlow.md | `docs/architecture/` | 9-stage execution flow definition | Approved | 34 lines |
| Task03_Extraction.md | `docs/architecture/` | Extraction strategy (Sheets+Firestore → snapshots) | Approved, **has unconfirmed user assumptions** | 36 lines |
| Task04_Transformation.md | `docs/architecture/` | Canonical model, UUID mapping, relationship resolution | Approved | 151 lines |
| Task05_Validation.md | `docs/architecture/` | Read-only gate decision logic | Approved | 114 lines |
| Task06_Loading.md | `docs/architecture/` | Dependency-ordered transactional load | Approved | 123 lines |
| Task07_Verification.md | `docs/architecture/` | Independent reconciliation + checksum proof | Approved | 109 lines |
| Task08_Recovery.md | `docs/architecture/` | Retry/replay/rollback/restore decision matrix | Approved | 121 lines |
| Task09_Runbook.md | `docs/architecture/` | Human-operated cutover runbook | Approved | 124 lines |
| Task01_ExtractEngine_PRD.md | `docs/architecture/sprint-02/` | Implementation-level Extract module design | **DRAFT, no code** | 1084 lines |
| Task02_TransformEngine_PRD.md | `docs/architecture/sprint-02/` | Implementation-level Transform module design | **DRAFT, no code** | 1488 lines |
| Task03_ValidationEngine_PRD.md | `docs/architecture/sprint-02/` | Implementation-level Validation module design | **DRAFT, no code** | 1357 lines |
| Task04_LoadEngine_PRD.md | `docs/architecture/sprint-02/` | Implementation-level Load module design | **DRAFT, no code, no SQL, no migration scripts** | 2047 lines |
| ADR.md | `11_Decision Log/` | Architecture decision records (Sheets-app era) | Not read in full this pass — `UNKNOWN — need investigation` for content relevance to Migration 004 | — |
| CLAUDE.md | root | Project instructions for AI coding agents — workflow rules, Firestore performance principles | Living document, updated 2026-08-05 | 14.5K |
| FILE_MAP.md | root | Grep-map of `13_AppsScript` code (avoid reading the 7300-line Index.html directly) | Living, updated continuously (today) | ~50K |
| ERROR_LOG.md | root | Historical bug log for the Apps Script app | Living | 65K |
| `docs/performance/*.md` (~35 files) | `docs/performance/` | Apps Script performance audits/optimization reports, ongoing series | Living, several from 2026-08-07 | — |

**What is NOT single-source-of-truth**: the `04_PRD/`, `05_Analysis/`, `06_Design/`, `07_Architecture/` folders are pre-implementation planning docs from project kickoff (2026-07-15), never revisited. `07_Architecture/Database Design.md` in particular describes the **original Sheets-era schema design**, which is a different, earlier artifact than the actual `Setup_Database.gs` schema and the newer Supabase `docs/architecture/Task04_Transformation.md` canonical model — treat it as historical, not authoritative, for migration work.

---

## 4. Application Structure

### 4.1 Entity Relationship Diagram (current production system — Sheets/Firestore hybrid)

```
                         ppg (1 org)
                           │
                          desa (5)
                           │
                       kelompok (18)  ←── status_aktif, per-kelompok Firestore-migration flag
                    ┌──────┼──────────────────────┬─────────────┬───────────────┐
                    ▼      ▼                      ▼             ▼               ▼
                 users   guru                  santri      jadwal_kbm     pengurus_kelp
                  │        │                      │             │
                  │        │(guru_id)        (santri_id)   (kelas name,
                  │        │                      │         free text —
                  │        └──────────────────┐   │         NOT an FK)
                  │                            ▼   ▼
                  │                          absensi (status/tanggal/dicatat_oleh)
                  │
             (role: admin_ppg / admin_desa / admin_kelompok /
              admin_kelp / guru — scope_type + scope_id)

  Kurikulum chain (per kelompok, per kelas — kelas is a STRING code, not an FK to a table):
  kurikulum_prota (per tahun+kelas+kategori)
     └─ kurikulum_promes (per semester I/II)
          └─ kurikulum_probul (per bulan 1-6, jilid/minggu1-4)
               └─ kurikulum_pencapaian_santri (per santri, tracks progress against a probul)

  Standalone / lower-priority for migration (Sheets, low-volume):
  munaqosah, periode_munaqosah, konseling, kurikulum_akhlaq, calendar_events, files,
  pengumuman, jurnal_kbm (Firestore-only for Kelp Petemon, no Sheets equivalent),
  kop_surat (Firestore-only), akses_kelas_request, guru_izin, quote_harian, audit_log
```

**Multi-tenant hierarchy**: `ppg` (1) → `desa` (5) → `kelompok` (18). Confirmed from `Setup_Database.gs` seed comments and `CLAUDE.md`. This is a **3-level hierarchy**, not the 4-level "PPG → Desa → Kelompok → (Santri/Guru as tenant leaves)" some migration docs imply loosely — Santri/Guru are child entities of `kelompok`, not a 4th tenant tier.

### 4.2 Entities Detail

Source: `13_AppsScript/Setup_Database.gs` (live schema definition, confirmed identical table names to the pushed Supabase migration's 35 `CREATE TABLE` statements). Not every field is reproduced here — see `Setup_Database.gs` for full column lists.

| Entity | PK | Key FKs (informal — Sheets has no real FK enforcement) | Notes | Migration-004 scope |
|---|---|---|---|---|
| `ppg` | id | — | 1 row | In scope |
| `desa` | id | ppg_id | 5 rows | In scope |
| `kelompok` | id | desa_id | 18 rows, `status_aktif` flag | In scope |
| `users` | id | scope_id (polymorphic — desa/kelompok/ppg depending on role), guru_id | Auth + RBAC | In scope |
| `santri` | id | kelompok_id | 199 rows (production, current) | In scope |
| `guru` | id | kelompok_id | 18 rows (production, current); `kategori` = MT/MS/GM/GB (Muballigh Tugasan / Muballigh Setempat / Guru Mutu / Guru Bantu) | In scope |
| `jadwal_kbm` | id | kelompok_id, guru_id | `kelas` is FREE TEXT (e.g. "2A", "2 dan 3a") — no canonical class-code FK | In scope |
| `jadwal_kategori_hari` | id | kelompok_id | | In scope |
| `absensi` | id | santri_id | 890 valid rows + **483 orphaned rows** (confirmed data-quality defect, kelompok 6/7/8) | In scope, **gated on orphan cleanup** |
| `pengurus_kelp` | id | kelompok_id | | In scope (flagged "isolated/non-blocking" per Task 3) |
| `kurikulum_prota`/`promes`/`probul`/`pencapaian_santri` | id | chained (prota→promes→probul→pencapaian) | Kelas = string code '1'-'9'/'PAUD-TK', **separate namespace from `jadwal_kbm.kelas`** (no FK between them — see mobile Kurikulum feature work this session, which had to build a heuristic digit-extraction bridge because none exists) | `UNKNOWN — not explicitly listed in MAS.md §1 in-scope/out-of-scope lists; needs confirmation` |
| `jurnal_kbm`, `kop_surat`, `pengumuman` | — | — | **Explicitly OUT OF SCOPE for this migration wave** (`MAS.md:63`) — flagged for a future "Migration-003b-style audit" first | **Out of scope** |
| `munaqosah`, `konseling`, `kurikulum_akhlaq`, `calendar_events`, `files`, `akses_kelas_request`, `guru_izin`, `quote_harian`, `audit_log` | — | — | Not mentioned in MAS.md §1's explicit in/out-of-scope lists | `UNKNOWN — need investigation` |

### 4.3 Current Data Volume

| Entity | Volume (real, production) | Source |
|---|---|---|
| Kelompok with real data | **4 of 18** | `AUDIT_READ_PERFORMANCE_2026-08-07.md:119` |
| Santri | **199** | Same, cites live `?diag=kelompokdist` |
| Guru | **18** | Same |
| Absensi (valid) | **890** | Same |
| Absensi (orphaned/invalid) | **483** | Same, corroborated by `MAS.md:356` risk register |
| Santri (largest kelompok, e.g. mobile perf docs) | "±70 santri/kelompok terbesar" | `AUDIT_READ_PERFORMANCE_2026-08-07.md:203` |

**Annual growth rate**: `UNKNOWN — need investigation`. No document in the repo tracks month-over-month growth. The one forward projection that exists is a **stress-test hypothetical, not a forecast**: `AUDIT_READ_PERFORMANCE_2026-08-07.md:138` models "10.000 santri × 20 hari aktif/bulan × 60 bulan = ±12,000,000 baris absensi" purely to illustrate where the current Sheets-based architecture would structurally fail (Apps Script's 6-minute execution limit) — this is not a volume estimate for this org, it's an order-of-magnitude ceiling test.

**Supabase free-tier (500MB) impact**: at current real volume (199 santri, ~1,373 total absensi rows, 18 guru, handful of kurikulum/jadwal rows), total data is well under 1MB even accounting for indexes and metadata — **free tier is not a near-term constraint**. It becomes relevant only if/when the other 14 kelompok are populated with comparable data density (199 santri × ~4x kelompok scale ≈ still low-single-digit MB). No document in the repo calculates this explicitly — this is my own arithmetic from the confirmed base numbers, flagged as such.

**Largest table by row count today**: `absensi` (1,373 rows combined) — also the only table the architecture docs explicitly flag as capable of structurally breaking the *current* Sheets system at scale (`AUDIT_READ_PERFORMANCE_2026-08-07.md:138`).

---

## 5. Workflow Documentation

This section covers the **production Apps Script app's** workflows (the system actually in daily use). Migration-pipeline "workflows" (Extract→Transform→...) are covered in §6, since they don't exist as executable workflows yet.

### 5.1 Main Workflows (guru mobile, the primary daily-use path)

| Workflow | Steps | Fields | Validation | Response time |
|---|---|---|---|---|
| **Login** | Enter username/password → `serverLogin` → session token cached (`CacheService`, 6h TTL, Apps Script hard max) → optional "remember me" (localStorage token, 30-day, added this session) | username, password | SHA-256 hash compare, account status check | `UNKNOWN — no GAS execution-time logs in repo`; Apps Script's own dashboard would have this, not accessible from here |
| **Input Absen (Kehadiran)** | Menu → "Kehadiran" → pick class (gate popup if >1 class) → mark hadir/izin/sakit/alpa per santri → Simpan | status per santri, tanggal | H-1 window guard, duplicate-submit guard (added `2026-08-08` per commit history) | `UNKNOWN` |
| **Jurnal Mengajar** | Menu → "Jurnal Mengajar" → choose Input or Edit → pick class → materi + catatan textareas → Simpan | materi, catatan | Access-check via `getKelasOwnedByGuru_`/`canGuruAccessKelas_` | `UNKNOWN` |
| **Kurikulum > Prota** (built this session) | Menu → "Kurikulum" → "Program Tahunan" → pick class (gate) → view Semester I/II Target + Rincian Target | Read-only | RBAC via `validateUserAccess` role='guru' branch | `UNKNOWN` |
| **Laporan (PDF)** | Menu → "Laporan" → pick bulan/tahun → Unduh PDF | bulan, tahun | H-1-before-month-end client-side guard | `UNKNOWN` |
| **Guru Izin** | Menu → "Guru Izin" → pilih jenis (harian/cuti) + alasan → submit | jenis, alasan_kategori, alasan_detail | Self-declared, no approval workflow exists in code | `UNKNOWN` |

**Response time**: no document in this repo captures actual GAS execution logs (Stackdriver/Apps Script dashboard data is not exported anywhere in the filesystem). Every `docs/performance/*.md` report is a *static code audit* (reading the code and reasoning about likely cost), not a captured runtime measurement, with one partial exception — `ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md` (title suggests real measurement; **not opened this pass** — flag for follow-up if response-time numbers are needed for sprint planning).

### 5.2 Data Flow (GAS internals)

```
Browser (HtmlService page)
   │ google.script.run.<fn>(...)
   ▼
Apps Script server function (Code.js / Modul_*.gs)
   │
   ├─→ CacheService (CacheService.getUserCache()/getScriptCache()) — session, per-kelompok
   │     master-table caches (santri/guru/jadwal_kbm, 300s TTL)
   │
   ├─→ Google Sheets (SpreadsheetApp) — 17 of 18 kelompok, all non-migrated tables
   │
   └─→ Firestore REST API (UrlFetchApp, custom bridge in Modul_FirestoreBridge.gs)
         — kelompok_id='1' (Kelp Petemon) ONLY, for: santri, guru, jadwal_kbm,
           jadwal_kategori_hari, absensi. jurnal_kbm/kop_surat are Firestore-ONLY
           (never had a Sheets form) for all kelompok that use those features.
```

**Scheduled jobs / triggers**: `UNKNOWN — need investigation`. No `.github/workflows/*.yml` other than the two deploy workflows (`deploy-appsscript.yml`, `supabase-validate.yml`) were inspected for cron schedules, and Apps Script's own time-driven triggers (if any) are configured in the Apps Script project UI, not in this filesystem — **cannot be audited from the repo alone**.

---

## 6. Migration Status Per "Engine"

⚠️ **Naming correction**: the repo does not define 9 independently-named "engines" (Extract/Transform/Validation/Load/Verify/Checkpoint/Recovery/Logging-Audit/Reporting) as the request assumed. What actually exists is **9 pipeline stages** (`MAS.md §3/§4`: Preflight→Extract→Staging→Transform→Validate→Load→Verify→Report→Complete) backed by **9 architecture Tasks** (Task01-09) plus **4 implementation-level "Engine PRDs"** for the first four stages only. "Checkpoint" is a *mechanism within* Load (Task06 §3/§10), not a separate engine. "Logging/Audit" is the evidence-chain discipline running through every stage (`MAS.md §12`), not a separate engine. "Reporting" is Verification's output artifact (`verification_summary.json`), not a separate engine. I've mapped the table below to what actually exists rather than inventing rows for engines that aren't tracked as such.

| Stage | Architecture (Task doc) | Implementation PRD | Code | Test | Deliverables | Owner | ETA |
|---|---|---|---|---|---|---|---|
| Extraction | Task03 — Approved | Task01_ExtractEngine_PRD — **DRAFT** | None | None | Design doc only | `UNKNOWN` | `UNKNOWN` |
| Transformation | Task04 — Approved | Task02_TransformEngine_PRD — **DRAFT** | None | None | Design doc only | `UNKNOWN` | `UNKNOWN` |
| Validation | Task05 — Approved | Task03_ValidationEngine_PRD — **DRAFT** | None | None | Design doc only | `UNKNOWN` | `UNKNOWN` |
| Loading | Task06 — Approved | Task04_LoadEngine_PRD — **DRAFT**, explicitly "no SQL, no migration scripts" | One SQL migration exists (`20260805080137_database_foundation.sql`, 952 lines, 35 tables, 37 RLS references, 36 indexes) — but this is **schema DDL, not the Load engine's data-movement code** | None | Schema deployed to linked Supabase project | `UNKNOWN` | `UNKNOWN` |
| Verification | Task07 — Approved | No sprint-02 PRD exists yet | None | None | Design doc only | `UNKNOWN` | `UNKNOWN` |
| Recovery | Task08 — Approved | No sprint-02 PRD exists yet | None | None | Design doc only | `UNKNOWN` | `UNKNOWN` |
| Runbook/Orchestration | Task09 — Approved | No sprint-02 PRD exists yet | None | None | Design doc (human checklist) | `UNKNOWN` | `UNKNOWN` |

**Blockers common to every stage**: no code has been written for any stage. The 4 stages with implementation-level PRDs (Extract/Transform/Validate/Load) are the furthest along, but "furthest along" here means "most thoroughly designed," not "closest to running." Owner/ETA fields are `UNKNOWN` because no sprint-planning artifact in the repo assigns them — this is precisely the gap the requested report exists to feed into.

---

## 7. Architecture Gaps & Decisions

The request named 2 specific gaps. Both are **already resolved** in the docs, verified by direct citation:

### Gap 1 (as originally framed): UUID vs Bigint identity strategy
- **Actual status**: **Decided, documented, not a gap.** `Task04_Transformation.md:32-43`: *"Decision: deterministic (UUIDv5, namespace + legacy-id), not random UUIDv4. Rationale: makes re-running extraction on the same legacy record always transforming to the same UUID."* A fixed namespace-UUID-per-entity-type file and a legacy-id↔UUID bidirectional mapping index are specified.
- **Impact of the (non-)gap**: none — this was resolved before Migration 004 was frozen (2026-08-06).
- **Remaining real question**: `UNKNOWN — need investigation` whether the *Load Engine PRD*'s conflict-target assumption (`INSERT ... ON CONFLICT (id)`, Task06 §5) has been validated against the actual pushed Supabase schema's primary-key types — i.e., does `database_foundation.sql` actually declare `id` columns as `uuid` type matching this strategy? Not verified this pass; recommend a follow-up `grep -c "uuid" supabase/migrations/*.sql` check before Extract implementation starts.

### Gap 2 (as originally framed): Load order vs FK dependencies
- **Actual status**: **Decided, documented, not a gap.** `Task06_Loading.md:19-21`: exact order is `ppg → desa → kelompok → jadwal_kategori_hari → users → guru → santri → jadwal_kbm → absensi`, justified as guaranteeing every dependency of entity X is durably committed before X loads.
- **Impact of the (non-)gap**: none.
- **Remaining real question**: this load order was defined against the **9-entity in-scope list** (`MAS.md §1`). If any of the "unclear scope" entities from §4.2 (munaqosah, konseling, kurikulum_*, etc.) are added to migration scope later, their position in this order is **not yet defined** — genuinely open, but conditional on a scope decision that hasn't been made.

### Gap 3: genuinely open gaps found this pass

1. **Extraction-topology assumptions unconfirmed** (`MAS.md:355`, top item in the risk register): "single spreadsheet, single Firestore project, transport choice" are stated as Task 3's *assumptions*, not user-confirmed facts. **This blocks Extract implementation** — you cannot write an extractor against an unconfirmed source topology. Highest-priority open item in the entire audit.
2. **483 orphaned absensi rows** (`MAS.md:356`): confirmed-present data defect from a prior migration (Migration 003), unswept in kelompok 6/7/8. Validation policy is designed to gate on this, but the underlying data has not been cleaned — Validate will legitimately block Load until either the data is fixed or an explicit accepted-risk decision is made.
3. **Kurikulum `kelas` namespace has no FK to `jadwal_kbm.kelas`** (discovered independently this session, building the mobile Kurikulum feature): `jadwal_kbm.kelas` is free text ("2A", "2 dan 3a"); `kurikulum_prota.kelas` is a canonical code ('1'-'9'/'PAUD-TK'). No document in `docs/architecture/` addresses this specific relationship, and §4.2 shows kurikulum tables aren't clearly in-scope or out-of-scope for Migration 004 at all. **This needs an explicit scope + schema decision** before Transform can define a UUID/FK strategy for the kurikulum entity chain.
4. **Kurikulum/other entities' migration scope is ambiguous** (see §4.2 `UNKNOWN` rows) — `MAS.md §1` explicitly lists 9 in-scope and 3 out-of-scope entities, but roughly 9 more tables that exist in the live schema (munaqosah, konseling, kurikulum_*, calendar_events, files, akses_kelas_request, guru_izin, quote_harian, audit_log) aren't mentioned in either list. Silent omission, not an explicit "out of scope" decision — needs to be resolved to a real list before Load-order or UUID-namespace work touches them.

---

## 8. Supabase Schema Readiness

| Item | Status | Evidence |
|---|---|---|
| PostgreSQL schema designed? | **Yes, substantially — ~35 tables** | `supabase/migrations/20260805080137_database_foundation.sql`, 952 lines, `CREATE TABLE` for kategori_kbm, hari, jabatan_pengurus, kategori_pengumuman, ppg, desa, kelompok, guru, profiles, kelas, jadwal_kategori_hari(+_aktif), santri, riwayat_jenjang, siklus_generus, pengurus_kelp, absensi, periode_munaqosah, munaqosah, konseling, kurikulum_akhlaq/prota/promes/probul(+_minggu)/pencapaian_santri, calendar_events, files, pengumuman, jurnal_kbm, kop_surat(+_baris), akses_kelas_request, guru_izin, quote_harian, audit_log |
| Deployed to a real Supabase project? | **Yes** | `supabase/.temp/linked-project.json`, `project-ref`, `postgres-version` files present — project is linked and the migration has been pushed at least once |
| RLS policies defined? | **Partially — 37 references found**, depth/coverage not verified | `grep -c "row level security\|create policy"` = 37 hits in the migration file. **Not verified**: whether every table has a policy, or whether policies are correct — would need a per-table `grep` pass, out of scope for this audit's time budget |
| Materialized views planned? | `UNKNOWN — need investigation` | Not found via `grep -i "materialized view"` in the migration file during this pass — recommend explicit check before relying on this |
| Indexes optimized? | **36 indexes exist**, "optimized" not assessable without query-pattern analysis | `grep -c "create index"` = 36. Whether they match actual query patterns from the Apps Script app is unverified |
| Table creation order planned? | **Yes** | Single migration file — Postgres enforces FK-safe creation order at DDL time by construction; separately, the *data load* order is documented in Task06 (§7 above) |
| Prisma schema also exists | Yes, `08_Development/tpq-app/prisma/schema.prisma` (187 lines) — **relationship to the raw SQL migration (source of truth vs. generated-from) not verified this pass** | `prisma/schema.prisma` |

**Caveat on all of the above**: this describes what's in one migration file, not a live inspection of the actual Supabase database (no credentials/access used in this audit — filesystem only). If the linked project has drifted from this migration file (e.g., via `supabase db push` failures, manual dashboard edits), the real state could differ. Recommend `supabase db diff` against the linked project as a first sprint task.

---

## 9. Migration Blockers & Dependencies

**Critical path** (must happen in this order):
1. Resolve extraction-topology assumptions with the user (`MAS.md:355`) — blocks everything downstream.
2. Resolve kurikulum-and-other-entities scope ambiguity (§7 gap 4) — blocks Transform's canonical-model completeness and Load's entity list.
3. Verify/clean the 483 orphaned absensi rows, or get an explicit accepted-risk sign-off to load with them flagged — blocks Validate's gate for the `absensi` entity specifically (doesn't block other entities).
4. Implement Extract engine per its DRAFT PRD (first engine in dependency order, nothing downstream can start without real extraction output).
5. Implement Transform → Validate → Load in sequence, each consuming the prior stage's real (not hypothetical) output.

**Resource constraints**: `UNKNOWN — need investigation`. No document in the repo states guru availability for UAT, a target migration date, or a named team/owner for the migration workstream (distinct from the Apps Script app, which clearly has an active owner given daily commits). This is a real gap for sprint planning — recommend asking the user directly rather than guessing.

**Parallel GAS + Supabase requirement**: not explicitly stated as a requirement anywhere in `MAS.md`, but implied by reality — the Apps Script app is in daily production use and cannot be taken offline for a migration. `MAS.md`'s own risk register (`MAS.md:357`) names "Concurrent live-app writes during Load/Recovery windows" as a Medium/Medium-High risk with a stated mitigation (staging-schema decision flagged for operator confirmation) — meaning this has been anticipated but not yet decided.

**100 Kelompok migration timeline**: the request's premise of "100 Kelompok" doesn't match the org's actual footprint (18 kelompok exist in the schema, per `Setup_Database.gs` seed and `CLAUDE.md`; only 4 have real data today). If "100 Kelompok" refers to a future growth target rather than current scope, that's a `UNKNOWN — need investigation` distinct question worth clarifying directly with the user before it drives sprint sizing.

---

## 10. Next Sprint Recommendations

**Immediate (next 3 days)**:
- Get the user's answer on the extraction-topology risk-register item (`MAS.md:355`) — single spreadsheet? single Firestore project? This is a **question, not an engineering task**, and it's the single highest-leverage thing blocking real progress.
- Get the user's answer on kurikulum/other-entities migration scope (§7 gap 4) — another question, not engineering.
- Run `supabase db diff` (or equivalent) to confirm the linked project's live state matches `database_foundation.sql` — cheap, catches drift early.

**Week 1-2**:
- Implement the Extract engine against `Task01_ExtractEngine_PRD.md`, scoped to the **9 confirmed in-scope entities** (`ppg`, `desa`, `kelompok`, `guru`, `santri`, `jadwal_kbm`, `jadwal_kategori_hari`, `users`, `absensi`), against the **real, small (4-kelompok) dataset** — not a hypothetical "100 kelompok" scale.
- In parallel, get a decision on the 483 orphaned absensi rows (clean vs. accept-and-flag).

**Week 3-4**:
- Implement Transform against `Task02_TransformEngine_PRD.md`, producing real canonical-model output from the Week 1-2 extraction snapshots.
- Begin Validation engine implementation once Transform output exists to validate against — testing against fabricated data before real extraction output exists would validate the wrong thing.

**Timeline for full migration**: `UNKNOWN — cannot responsibly estimate` without (a) the extraction-topology answer, (b) a decision on out-of-list entities, and (c) a named resource commitment. Any timeline given without those three inputs would be a guess dressed as an estimate — recommend against committing to one in sprint planning until they're resolved.

**Risk assessment**:
| Risk | Level | Why |
|---|---|---|
| Migrating with unconfirmed extraction topology | **High** | Could require rework of the entire Extract engine if the assumption (single spreadsheet/Firestore project) turns out wrong |
| Loading with unresolved orphaned absensi rows | **Medium** | Validate is designed to catch this, but only if implemented correctly — real risk is skipping/weakening validation under schedule pressure |
| Scope creep from ambiguous entity list | **Medium** | Kurikulum chain alone has real complexity (§7 gap 3) that isn't accounted for in the current 9-entity scope |
| Building for "100 kelompok" scale that doesn't exist yet | **Low technical risk, real planning-waste risk** | Over-engineering for a scale target that may not reflect the org's actual near-term growth |

---

## 11. Appendix

**Commands used to produce this report** (for reproducibility):
```bash
ls -la                                          # folder topology
find docs -maxdepth 3 -type f                   # migration docs inventory
wc -l docs/architecture/*.md docs/architecture/sprint-02/*.md
grep -n "^create table" supabase/migrations/*.sql
grep -ic "row level security\|create policy" supabase/migrations/*.sql
grep -ic "create index" supabase/migrations/*.sql
git tag -l
git log --oneline -20 -- docs/architecture 08_Development
git log -1 --format=%ai -- docs/architecture
grep -n "UUID Mapping Strategy" docs/architecture/Task04_Transformation.md
grep -n "Load Order Resolution\|Entity Loading Order" docs/architecture/Task06_Loading.md
grep -n -iE "[0-9]+ (baris|rows)" AUDIT_READ_PERFORMANCE_2026-08-07.md ERROR_LOG.md
```

**Explicitly out of scope for this pass** (would need follow-up investigation, listed so they aren't silently dropped):
- Full content read of `11_Decision Log/ADR.md` (only confirmed it exists)
- Full content read of all ~35 `docs/performance/*.md` files (only grepped for volume numbers)
- `ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md` — title suggests actual runtime data, not opened
- Per-table RLS policy coverage check in the Supabase migration
- Materialized view search in the Supabase migration
- `prisma/schema.prisma` vs. raw SQL migration consistency check
- Apps Script time-driven triggers (not visible from filesystem)
- `.claude/worktrees/vibrant-jang-0cb304/` — excluded entirely as a non-primary snapshot, not audited for divergence from the main tree

**Note on the request's own framing**: several premises in the original request (100 Kelompok, "Phase 3... berjalan", "known gaps: UUID/FK order") did not match the verified repo state. This report corrects them explicitly rather than silently reproducing them, per the request's own §VERIFY criterion: *"No assumptions — kalau info missing, explicitly state unknown."*
