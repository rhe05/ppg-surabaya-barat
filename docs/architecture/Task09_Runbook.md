# Task 9 — Operational Runbook & Production Cutover Guide (Migration 004)

> Status: **APPROVED** — final document of the Migration 004 architecture series.
> Orchestrates Tasks 1–8 into a single, executable production procedure. Does not redesign any
> technical mechanism.

## 1. Runbook Philosophy

The document an operator actually follows on cutover day. Operational principles: every
irreversible/broad-blast-radius action requires recorded approval before execution; the runbook
never overrides a technical stage's own gate logic, only adds the human-process wrapper; stop is
always cheaper than proceeding-on-doubt.

## 2. Migration Timeline

Preparation → Pre-flight (GO/NO-GO) → Freeze → Extraction → Transformation → Validation →
Loading → Verification → (conditional) Recovery → Production Cutover → Post-cutover Monitoring →
Migration Closure. See full ASCII timeline in the original Task 9 response / MAS §3.

## 3. Roles & Responsibilities

Migration Lead, Database Engineer, Application Engineer, QA/Verification Lead, Business Owner,
Incident Commander (activated only during incidents), Observer/Auditor. Full RACI matrix defined
for: pre-cutover checklist, go/no-go, extraction–load execution, validation/verification review,
warnings sign-off, incident declared, recovery execution, migration closure.

## 4. Pre-Cutover Checklist

Infrastructure readiness, backup confirmation (pre-load snapshot mechanism functional — do not
proceed without this), validation approval, rollback readiness, communication readiness,
stakeholder approval, access verification.

## 5. Cutover Procedure

Checklist complete → Go/No-Go → Freeze declared → Extraction (checkpoint) → Transformation
(checkpoint) → Validation (**hold point**, approval gate if warnings) → Loading (checkpoint) →
Verification (**hold point**, approval gate if warnings; Recovery branch if failed) →
Production Cutover Decision (approval gate) → Freeze lifted → Post-cutover Monitoring →
Migration Closure.

## 6. Go/No-Go Decision Framework

**GO**: checklist 100% complete, no open incidents, all approvers available (Migration Lead +
Business Owner, joint). **CONDITIONAL GO**: specific documented low-risk gap with named owner to
close it (joint approval + condition recorded). **NO-GO**: any backup/rollback-readiness/access
gap, unresolved incident, or unavailable required approver — **either** Migration Lead or Business
Owner alone may issue NO-GO (asymmetric authority).

## 7. Incident Response

Unexpected failures halt at the current checkpoint safely. Infrastructure outages resume once
restored (no Task 8 recovery decision needed). Verification failure hands off directly to Task
8's decision matrix. Operator mistakes route to governance review (Task 8 §15), logged
transparently. Any rollback activation formally hands control to Task 8; this runbook's cutover
procedure stays paused until Recovery reaches `resolved`.

## 8. Communication Plan

Technical team (real-time), Management (phase transitions/incidents), Business Owner/stakeholders
(go/no-go, cutover start/complete, sign-off requests), TPQ administrators/guru (freeze timing,
cutover completion), Support personnel (what changed, escalation path). All logged in
`communication_log.json`.

## 9. Operational Checklists

Before / During / After Loading / After Verification / After Cutover / Before Declaring
Completion — each with its own checklist items (see original response for full detail).

## 10. Production Monitoring

System health, database health, application health, user access (RBAC regression check),
error monitoring, performance monitoring. Recommended stabilization window: 24–48 hours of active
watching before Migration Closure proceeds.

## 11. Success Criteria

**Technical**: VERIFIED (or signed-off WARNINGS) for every in-scope entity, zero unresolved
CRITICAL, no post-cutover regression. **Operational**: cutover within planned window, no
undeclared deviation, every approval gate recorded. **Business**: no user disruption reported,
Business Owner confirms functional adequacy. All three required.

## 12. Escalation Procedures

Sev 1 (Critical) → Incident Commander + Business Owner immediately. Sev 2 (Major) → Migration
Lead + relevant role, Business Owner informed. Sev 3 (Minor) → routed to the owning sign-off role.
Sev 4 (Informational) → logged only.

## 13. Documentation & Evidence

`runbook_execution_report.json`, `cutover_summary.json`, `approvals.json`,
`communication_log.json`, `incident_log.json`, `checklist_completion.json`,
`monitoring_report.json`, `final_signoff.json`.

## 14. Auditability

`runbook_execution_report.json` + `approvals.json` + `communication_log.json` +
`incident_log.json` together reconstruct what happened, who approved each step, timeline,
decisions, evidence, and final production state — all cross-referenced to Tasks 1–8's own
artifacts by runId/content-hash.

## 15–16. Lessons Learned & Operational Metrics

Post-closure retrospective using Task 8 §8's failure classification as the root-cause frame.
Metrics: total migration duration, cutover duration, downtime duration, rollback count, incident
count, recovery duration, verification duration.

## 17–18. Business Continuity & Future Reusability

Freeze scoped to the technical extraction requirement, not broader convenience. RPO/RTO reference
Task 8 §17 without redesign. Runbook's phase/role/checklist skeleton is directly reusable for
future Ruang Ngaji migration waves (e.g., extending Firestore migration to the remaining 17
kelompok) and, more generally, as a production-change-management template.

## 19. Migration Closure

Completion approval (Migration Lead → Business Owner sign-off) → Final evidence archive (nothing
generated during migration discarded) → Operational handover → Documentation freeze (future
changes are new versioned decisions, never silent edits) → Long-term archive (retain through at
least one subsequent migration cycle).

## Related Documents

- [Task 8 — Rollback & Recovery Strategy](Task08_Recovery.md)
- [Master Architecture Specification](MAS.md)
