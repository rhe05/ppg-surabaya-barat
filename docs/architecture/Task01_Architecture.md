# Task 1 — Folder Structure & Architecture (Migration 004)

> Status: **APPROVED** (final, after 3 revision rounds)

## Location

`08_Development/tpq-app/migration-004/` — sibling to the existing `08_Development/tpq-app/supabase/`
which holds the versioned schema migration `20260805080137_database_foundation.sql`.
`migration-004/` is separate, disposable ETL tooling, **NOT** a Supabase-tracked migration file.

## Approved Top-Level Folders (17 total)

- `config/`
- `metadata/`
- `contracts/`
- `quality/`
- `shared-types/`
- `snapshots/` (immutable)
- `staging/` (mutable: raw/normalized/enriched)
- `exporters/`
- `transformers/`
- `validators/`
- `loaders/`
- `state/` (mapping/checkpoints/resume/locks)
- `artifacts/` (generated-sql/csv/reports/mapping)
- `rollback/` (backups/ + plan + runner)
- `logs/`
- `observability/` (metrics/traces/profiling)
- `reports/` (decisions/ only — curated human sign-off, NOT generated reports)
- `docs/` (permanent hand-maintained: Architecture/Execution/Rollback/Runbook/DecisionLog.md)
- `tests/`
- `utilities/`
- `runner/` (with `manifests/<runId>/pipeline-manifest.json`)

## Key Structural Decisions (do not re-litigate)

- `snapshots/` vs `staging/` vs `rollback/backups/` are **3 distinct lifecycle concepts**:
  - `snapshots/` = immutable extraction output
  - `staging/` = mutable, regenerable working data
  - `rollback/backups/` = pre-load Postgres dumps
  These must never be conflated.
- `contracts/` (per-field structural rules) vs `quality/` (aggregate run-level thresholds/policies)
  is a deliberate split — contracts answer "is this field valid," quality answers "is this whole
  run acceptable."
- Every per-run subfolder is keyed by `runId` (embeds timestamp, e.g.
  `run-20260812T090000Z-7f3a`) via `pipeline-manifest.json`, created first thing in
  `runner/migrate.ts` before any stage runs. The manifest has an explicit status state machine
  (`initializing → ready → ... → completed/failed/rolled-back`) and `rollback-runner.ts` must
  refuse to act on a non-terminal-status run.

## Related Documents

- [Task 2 — Migration Execution Flow](Task02_ExecutionFlow.md)
- [Master Architecture Specification](MAS.md)
