# Task 6 — Loading Strategy (Migration 004)

> Status: **APPROVED**
> Scope: `validation_report.json` PASS/PASS_WITH_WARNINGS authorization → Postgres/Supabase
> persisted state. Load performs zero business transformations.

## 1. Loading Philosophy

Load persists already-correct data with maximum safety guarantees. It treats Validation's gate
decision as a hard precondition, never re-evaluates it. It performs zero business logic. It ends
at "the write succeeded and Postgres accepted it" — provable correctness is Task 7's job.

## 2. Loading Architecture

Pre-flight Gate → Load Order Resolution → Per-Entity Batch Load (batch split → per-batch
transaction → checkpoint → retry loop) → Post-Entity Reconciliation → Reporting.

## 3. Entity Loading Order

`ppg → desa → kelompok → jadwal_kategori_hari → users → guru → santri → jadwal_kbm → absensi`.
Strict dependency order guarantees: by the time Load reaches entity X, every entity X depends on
is already durably committed — a constraint violation signals a real integrity problem, not an
ordering artifact.

## 4. Transaction Strategy

**Decision: one transaction per batch**, not per record and not per entity — balances blast
radius of failure against throughput and enables clean checkpointed resume. Rollback boundary:
entire batch rolls back, zero partial-batch commits. Savepoints used sparingly, within a batch,
for individually-authorized row-level skips — every savepoint-rollback is logged as a distinct
finding.

## 5. Idempotent Loading

Every write: `INSERT ... ON CONFLICT (id) DO UPDATE`, conflict target always the deterministic
UUID (Task 4 §3). Never regenerate IDs. Retry-safe: a retried batch can always be fully
resubmitted wholesale. Reruns cannot produce duplicate data by construction.

## 6. Batch Loading Strategy

Configurable batch size (absensi only; other entities single-batch). Adaptive batching: shrinks
on failure, never auto-grows. Batch failure recorded in `failure_report.json`, checkpoint stays
at last successfully committed batch — entity Load marked incomplete, other independent entities
still proceed.

## 7. Constraint Management

**FKs, unique, check, NOT NULL — all kept enabled**, never disabled for load-speed. Deferred
constraints used only within a single batch transaction, checked at batch commit, never as a
whole-run "validate FKs later" strategy. Rationale: constraint violations at Load are treated as
a last-resort integrity net, not routine.

## 8. Error Handling

| Class | Retryable | Routing |
|---|---|---|
| Transaction failures | Yes | retry loop |
| Constraint violations | No | immediate rollback, `failure_report.json` |
| Connectivity failures | Yes | retry loop, backoff |
| Timeout | Yes, w/ adaptive shrink | retry loop |
| Deadlock | Yes (immediate first retry) | retry loop |
| Permission errors | No | fatal at run-level |
| Storage limits | No | fatal at run-level |

## 9. Retry Strategy

Exponential backoff with jitter, capped delay, deadlock exception (immediate first retry).
Configurable max attempts per batch; exhaustion marks batch `failed` in checkpoint, entity halts,
other entities proceed.

## 10. Loading Checkpoints

Per-entity status + per-batch array (`pending`/`committed`/`failed`, `retryCount`). Per-transaction
= per-batch in this architecture (transaction scope decision, §4). Checkpoint writes only after
commit is confirmed, never optimistically before.

## 11. Load Verification Hooks

Inserted / updated / skipped / failed counts, plus checksum references — written to
`verification_hooks.<entity>.json`, Task 7's designated primary input. Load never performs
verification itself.

## 12. Loading Reports

`loading_summary.json`, `batch_statistics.json`, `transaction_log.json`, `retry_report.json`,
`failure_report.json`, `throughput_metrics.json`, `verification_hooks.<entity>.json`,
`constraint_events.json`.

## 13. Operational Safety

Dry-run mode: full pipeline through batch-open, always rolls back instead of committing, still
generates all reports. Recommendation flagged (not decided unilaterally): load into a staging
schema first, verify, then deliberate cutover — rather than loading directly into live-app-served
tables, given concurrent-user risk.

## 14. Performance Considerations

Existing indexes/constraints remain in place, no drop-and-rebuild. Parallel loading only across
independent entities at the same dependency level, never within one entity's batch sequence.

## 15–16. Observability & Auditability

Throughput, batch duration, retry statistics tracked per batch/entity. Every audit question (what
loaded, when, by which run/transaction, which validation report authorized it, whether retried,
whether rolled back) answerable from `transaction_log.json` + `loading_summary.json` alone.

## 17. Recovery Readiness

Checkpoints + `transaction_log.json` + UPSERT insert/update outcome distinction are the designed
handoff for Task 8. Load's pre-flight stage recommended to trigger a Postgres backup/snapshot
checkpoint before the first batch commits — the hard precondition Task 8 depends on.

## 18. Future Extensibility

New entity = new position in dependency order + own checkpoint/batch config, no mechanism
changes. Batch/transaction/checkpoint/idempotent-UPSERT pattern is reusable across future
migrations.

## Related Documents

- [Task 5 — Validation Strategy](Task05_Validation.md)
- [Task 7 — Verification Strategy](Task07_Verification.md)
- [Master Architecture Specification](MAS.md)
