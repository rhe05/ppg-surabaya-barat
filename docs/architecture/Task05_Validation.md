# Task 5 — Validation Strategy (Migration 004)

> Status: **APPROVED**
> Scope: `staging/enriched/` (Task 4 output) → Load stage go/no-go decision. Validation never
> writes to `staging/`, never mutates canonical records, never calls Supabase.

## 1. Validation Philosophy

Validation answers "is this safe to load, and if not, why not" per record, and "is this run safe
to proceed to Load" per run. **Complete validation, not fail-fast**, at the record level; fail-fast
only at the run level for structural failures. Quality gates map severity-classified findings
through policy into a gate decision, per-entity/kelompok, not run-wide binary.

## 2. Validation Architecture

10 sub-stages: Structural Gate (contract) → Enum & Format Gate → Referential Integrity Gate →
Duplicate Detection Gate → Business Rule Gate → Data Quality Scoring → Policy Evaluation →
Reporting. Reference entities validated to completion before dependent entities' referential
sub-stage runs. Checkpoint granularity: `(entity, sub-stage)`.

## 3. Contract Validation

Required fields, optional fields, data types, nullable constraints (3-way: nullable / must-omit /
never-null), unknown fields (always `ERROR`, never silently ignored). Schema evolution:
contract validated against the `schemaVersion` recorded in the run's own `transform-report.json`,
never against "whatever's latest."

## 4. Referential Integrity Validation

- **Foreign keys resolve** against *validated* parent record sets, not just the UUID map.
- **Orphan records**: carried forward from Task 4's `_unresolved.*.json`, `WARNING` by default.
- **Missing parents**: FK well-formed but parent itself fails structural validation → `ERROR`.
- **Duplicate parents**: `FATAL` for reference-table entities.
- **Circular references**: structural guard only, `FATAL` if ever triggered.

Classification: `relationship_status` enum — `resolved` / `orphan_no_parent` /
`orphan_broken_parent` / `duplicate_parent_conflict`.

## 5. Business Rule Validation

Structural validation asks "does this record have the right shape"; business validation asks
"does this record make sense as a fact about the world." Lifecycle rules, status consistency,
entity ownership, logical consistency, domain-specific restrictions — declared in
`contracts/business-rules/<entity>.rules.yaml`. Default severity `WARNING` (more lenient than §3/
§4 by design).

## 6. Data Quality Validation

Measurable dimensions: Completeness, Uniqueness, Consistency, Accuracy, Validity, Timeliness —
each 0.0–1.0 per entity, weighted (policy-configurable) into an entity quality score, rolled up to
a run-level quality score.

## 7. Duplicate Detection

Exact duplicates (`ERROR`), logical duplicates (`WARNING`, never auto-merged), conflicting
duplicates (`ERROR`), cross-source duplicates (flagged `cross_source: true`). Confidence score
0.0–1.0 per finding; resolution categories: `merge_candidate` / `keep_both_verified_distinct` /
`needs_manual_review` — actual resolution is always a human sign-off in `reports/decisions/`.

## 8. Enum Validation

Canonical value membership check (`FATAL` if outside set), alias-resolution completeness
cross-check, unsupported values (`ERROR`, raw string preserved for alias-table growth), deprecated
values (`WARNING`, loadable but flagged).

## 9. Date & Numeric Validation

Invalid dates reaching this stage = possible Transform regression (`FATAL`). Impossible dates in
context (`ERROR`). Timezone consistency check. Range plausibility for ages (`WARNING`). Numeric
ranges, precision, overflow (`FATAL` if would overflow Postgres column type), format compliance.

## 10. Validation Policies

| Severity | Default gate effect |
|---|---|
| `INFO` | never blocks |
| `WARNING` | doesn't block by default, requires sign-off before Load |
| `ERROR` | blocks that record |
| `FATAL` | blocks the entire entity/run |

`quality/policies/<entity>.policy.json` + `_global.policy.json`. Gate decision per entity:
`PASS` / `PASS_WITH_WARNINGS` / `BLOCKED`.

## 11. Error Classification

Recoverable (data) / Unrecoverable (data) / Data defects (`defect_origin: source`) /
Configuration defects (`defect_origin: configuration`, fatal at run-start) / Source defects
(`defect_origin: source_system`) / Operator defects (governance, not data).

## 12–13. Reporting & Artifacts

`validation_report.json` (single source of truth) → views: `validation_summary.json`,
`quality_score.json`, `policy_results.json`, `policy_violations.json`, `rejected_records.json`,
`warning_records.json`, `duplicate_findings.json`, `referential_findings.json`,
`validation_metrics.json`, `audit_trail.json`.

## 14. Quality Gates

`PASS` → auto-proceeds to Load. `PASS_WITH_WARNINGS` → requires recorded human decision in
`reports/decisions/<runId>/<entity>-approval.json`. `BLOCKED` → entity excluded from this Load
run; run as a whole may still proceed for non-blocked entities.

## 15–18. Performance, Observability, Auditability, Extensibility

Absensi is the only entity needing batch-bounded processing. Incremental validation *across* runs
is explicitly out of scope (one-time migration, not ongoing sync). Every finding traces to a
`rule_id` referencing a specific contract/policy clause — never free-text-only. New entities/
sources/rules are config additions, not pipeline changes.

## Related Documents

- [Task 4 — Transformation Strategy](Task04_Transformation.md)
- [Task 6 — Loading Strategy](Task06_Loading.md)
- [Master Architecture Specification](MAS.md)
