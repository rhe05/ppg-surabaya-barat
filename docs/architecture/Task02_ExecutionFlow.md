# Task 2 — Migration Execution Flow (Migration 004)

> Status: **APPROVED**

## 9 Stages

Pre-flight(0) → Extract(1) → Staging(2) → Transform(3) → Validate(4) → Load(5) → Verify(6) →
Report(7) → Complete(8).

## Migration-003 Decisions Wired In As Execution Gates

The 4 pending Migration-003 decisions were wired in as **execution gates**, not re-litigated:

1. **483 orphan absensi rows** → surfaced in Staging (Stage 2) as `_unresolved.*.json`, actual
   exclude/include decision enforced via `quality/policies/absensi-orphans.policy.json` at
   Validate (Stage 4).
2. **kelompok 6/7/8 unswept data quality** → Validate stage defaults these to `WARNING` (not
   `BLOCKER`) since only kelompok 1 was confirmed clean, escalates to manual approval before Load
   proceeds for those kelompok specifically.
3. **`pengurus_kelp` 404 anomaly** → isolated, expected, non-blocking failure at Extract stage.
4. **Password reset comms** → explicitly placed AFTER Stage 8 completion, as a human
   communication task outside the pipeline, not a pipeline stage.

## Load Stage Idempotency

Load stage: UPSERT on deterministic pre-assigned UUIDs (never regenerate IDs on rerun) is the
core idempotency mechanism; checkpoints are an optimization on top, not the correctness guarantee
itself.

## Related Documents

- [Task 1 — Architecture](Task01_Architecture.md)
- [Task 3 — Extraction Strategy](Task03_Extraction.md)
- [Master Architecture Specification](MAS.md)
