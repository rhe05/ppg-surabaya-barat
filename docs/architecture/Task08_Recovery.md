# Task 8 — Rollback & Recovery Strategy (Migration 004)

> Status: **APPROVED**
> Scope: Verification's final readiness decision → a trusted, well-documented database state.
> Rollback never destroys forensic evidence. Every recovery action is traceable.

## 1. Recovery Philosophy

**Rollback**: undo specific, identified writes, backward-only, evidence-scoped.
**Recovery**: the overall decision-and-execution process (may select rollback or another path).
**Replay**: re-execute a bounded portion of Load from already-validated canonical data, forward,
strictly bounded, using the same idempotent UPSERT mechanism.
**Resume**: continue an *interrupted* (not failed) operation from checkpoint — normal operational
continuation, not Recovery-specific.

## 2. Recovery Architecture

Evidence Assembly → Failure Classification → Recovery Decision → Approval Gate (no automatic
execution without recorded approval) → Execution → Recovery Verification → Reporting & Evidence
Seal. States: `diagnosing → decision_pending → approved → executing → recovery_verifying →
resolved`, with `blocked_manual` and re-entrant `escalated` states. Nothing from Tasks 4–7 is
ever deleted or modified by Recovery.

## 3. Recovery Decision Matrix

| Finding Pattern | Path |
|---|---|
| Accepted warnings only | No action |
| Verification sub-stage itself errored | Retry verification |
| Small, root-cause-understood, transient | Partial reload (replay) |
| Concentrated in one entity, unclear/multi-batch | Partial rollback |
| CRITICAL spanning multiple entities / systemic | Full rollback (this run) |
| Rollback itself fails verification / tx log untrustworthy | Restore from backup |
| Ambiguous or conflicting evidence | Manual intervention |

Default when evidence doesn't cleanly map: **manual intervention**, never a forced best-guess.

## 4. Rollback Scope

Row → Batch → Entity → Migration run → Full database (restore). Finer granularity minimizes
disruption but requires high-confidence evidence; coarser granularity is safer to reason about
but costs more, including loss of legitimate unrelated post-snapshot activity for full restore.

## 5. Recovery Sources (priority order)

1. Verification reports (the diagnosis)
2. Transaction logs (the undo map)
3. Checkpoints (bound the rollback's scope accurately)
4. Canonical dataset (source for replay)
5. Pre-load backup (last resort, costliest/coarsest)

## 6. Rollback Strategies

Inserted records: delete-by-UUID. Updated records: requires pre-update value from the pre-load
snapshot (why Task 6 §17's snapshot recommendation is a hard precondition). Partially loaded
entities: target exactly the committed batches per transaction log. Interrupted batches: already
safely handled by Postgres transactional atomicity — needs *resume*, not rollback. Concurrent
modifications: **never silently overwritten** — escalated to manual intervention by default.

## 7. Recovery Verification

Re-runs a scoped version of Task 7's methodology: rollback validation, integrity confirmation,
checksum confirmation against the pre-load snapshot. A rollback that doesn't verify clean
re-enters the Recovery Decision cycle at a potentially wider scope.

## 8. Failure Classification

| Category | Owner |
|---|---|
| Operational failure | Operations |
| Migration failure | Migration engineering |
| Verification failure | Verification engineering |
| Infrastructure failure | Infrastructure/platform ops |
| Operator error | Process/governance |
| Data corruption | Database/infrastructure |

## 9. Retry & Replay Strategy

Retry = same operation, transient cause. Replay = bounded re-execution from unchanged canonical
data via idempotent UPSERT, root cause understood. Resume = interruption without any actual
defect, uses the original stage's own checkpoint mechanism, not a Recovery-specific path.

## 10. Backup Strategy (assumptions, not implementation)

Pre-load snapshot is a **hard prerequisite** for updated-record rollback and restore-from-backup.
Must be transactionally consistent. Snapshot reference recorded in `loading_summary.json`,
echoed into `verification_summary.json`. Retention should outlive the longest plausible recovery
investigation window (weeks, not hours).

## 11–12. Reports & Metrics

`recovery_summary.json`, `recovery_report.json`, `rollback_report.json`, `replay_report.json`,
`recovery_verification_report.json`, `restored_entities.json`, `recovery_metrics.json`,
`decision_trail.json`, `approvals.json`. Metrics: recovery duration, recovered entities, rollback
%, recovery success rate, replay count.

## 13. Operational Safety

**No rollback broader than single-row, evidence-unambiguous cases proceeds without recorded human
approval** — the firmest rule in this document. Emergency stop supported at any transaction
boundary; interrupted recovery always leaves a safe, checkpointed state.

## 14–15. Auditability & Governance

`decision_trail.json` gives the full evidentiary chain for why/what/who/which-evidence/which-path
/final-state. Approval tiered by rollback scope; emergency authority path exists but is always
logged (`emergency: true`) for mandatory post-incident review — emergency speed never means
unaudited. Migration-failure-classified findings trigger a mandatory feedback loop back to the
relevant task's design.

## 16–18. Observability, Business Continuity, Extensibility

RPO for migration-introduced issues is effectively zero (targeted rollback). RTO scales with
affected scope, not total dataset size — reinforces preferring the narrowest sufficient action.
Framework is dataset-size and future-migration agnostic by design.

## Related Documents

- [Task 7 — Verification Strategy](Task07_Verification.md)
- [Task 9 — Operational Runbook](Task09_Runbook.md)
- [Master Architecture Specification](MAS.md)
