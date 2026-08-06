# Task 7 — Verification Strategy (Migration 004)

> Status: **APPROVED**
> Scope: successfully completed Load stage → final migration readiness decision. Entirely
> read-only. Never modifies database contents. Never repairs data.

## 1. Verification Philosophy

Verification proves, with objective evidence, that what's in Supabase is identical to what
Validation authorized for Load. It never re-runs Validation's judgment. It never trusts Load's
self-reported counts as sufficient evidence — everything is independently recomputed. It never
initiates corrective action, even on critical findings — it reports `VERIFICATION_FAILED` with
full diagnostic detail; Task 8 decides what to do about it.

## 2. Verification Architecture

Pre-flight Gate → Record Verification → Checksum Verification → Data Reconciliation →
Referential Verification → Constraint Verification → Transaction Verification → Consistency
Verification → Policy Evaluation → Reporting.

## 3. Record Verification

Independently computed row counts / inserted / updated / skipped / failed, cross-referenced
against Load's self-reported `verification_hooks.<entity>.json`. Any disagreement is itself the
finding, regardless of which side is "right."

## 4. Checksum Verification

Deterministic, versioned hashing. Record checksum (per row) → Entity checksum (aggregate,
order-independent) → Batch checksum (correlates mismatch to a batch) → Run checksum (headline
figure).

## 5. Data Reconciliation

Missing rows (`CRITICAL`), unexpected rows (`CRITICAL` if in-namespace/unexplained, `INFO` if
pre-existing unrelated data), modified rows (always `CRITICAL`). Comparison is set-based, keyed
by UUID — never order-dependent.

## 6. Referential Verification

Re-checks FK/parent-child/orphan state against the *live database*, independent confirmation that
Postgres constraints were truly enforced — distinct from Task 5's pre-load prediction.

## 7. Constraint Verification

Confirms constraints are both present (not dropped) and currently satisfied. Valuable even after
successful loading because Load's enforcement only guarantees correctness at write time, not that
constraints weren't altered afterward or that no other path wrote non-conforming data.

## 8. Transaction Verification

Cross-references `transaction_log.json`'s committed/rollback/retry claims against actual database
state — audits Load's bookkeeping, distinct from §3–§7's audit of Load's data outcome.

## 9. Consistency Verification

Entity consistency, cross-table consistency, aggregate consistency, logical consistency —
deliberately redundant with §3/§5 via a different computation path.

## 10. Verification Policies

| Severity | Gate effect |
|---|---|
| `INFO` | never blocks |
| `WARNING` | pushes to `VERIFIED_WITH_WARNINGS`, requires review |
| `ERROR` | blocks that entity |
| `CRITICAL` | blocks entity, by default blocks entire run |

`CRITICAL` deliberately replaces Validation's `FATAL` naming — signals something already
happened, not something about to be prevented.

## 11. Error Classification

Reconciliation failures / Checksum mismatch / Missing data / Unexpected data / Corruption
(`CRITICAL`, treated as a database-integrity emergency) / Operational failures (run-level abort).

## 12–13. Reporting & Metrics

`verification_report.json` (single source of truth) → `verification_summary.json`,
`reconciliation_report.json`, `checksum_report.json`, `consistency_report.json`,
`integrity_report.json`, `transaction_verification_report.json`, `policy_results.json`,
`verification_metrics.json`. Metrics: reconciliation %, checksum match rate, integrity score,
consistency score, duration.

## 14. Auditability

Every claim (every validated record loaded, nothing extra loaded, no unexpected change, correct
loading artifacts used, correct run verified) is provable from a specific artifact, never a
narrative.

## 15. Operational Readiness

`VERIFIED` (zero ERROR/CRITICAL, migration complete) / `VERIFIED_WITH_WARNINGS` (requires human
sign-off) / `VERIFICATION_FAILED` (not complete, triggers Task 8 consideration). Rolled up per
entity — a run can be simultaneously VERIFIED for most entities and FAILED for one.

## 16–19. Performance, Observability, Recovery Prep, Extensibility

Sampling-plus-full-checksum-aggregate two-tier strategy for absensi. Historical
`verification_summary.json` retained permanently. `verification_summary.json`'s gate decision +
`reconciliation_report.json`'s row-level scope + pre-load snapshot reference are the designed
handoff surface for Task 8 — Verification identifies *what evidence exists*, never designs how
Task 8 uses it.

## Related Documents

- [Task 6 — Loading Strategy](Task06_Loading.md)
- [Task 8 — Rollback & Recovery Strategy](Task08_Recovery.md)
- [Master Architecture Specification](MAS.md)
