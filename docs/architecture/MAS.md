# Migration 004 — Master Architecture Specification (MAS)

**RUANG NGAJI: Google Sheets + Firestore → Supabase**

> Status: Tasks 1–9 approved. This document consolidates them into the project's Single Source
> of Truth. It does not alter any decision made in Tasks 1–9 — every claim below is a summary
> of, or cross-reference to, an already-approved document.

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Guiding Principles](#2-guiding-principles)
3. [Architecture Overview](#3-architecture-overview)
4. [End-to-End State Machine](#4-end-to-end-state-machine)
5. [Architecture Decision Records (ADR Summary)](#5-architecture-decision-records-adr-summary)
6. [Cross-Task Dependency Map](#6-cross-task-dependency-map)
7. [Deliverables Matrix](#7-deliverables-matrix)
8. [Governance Model](#8-governance-model)
9. [Risk Register](#9-risk-register)
10. [Operational Model](#10-operational-model)
11. [Recovery Model](#11-recovery-model)
12. [Evidence Chain](#12-evidence-chain)
13. [Versioning Strategy](#13-versioning-strategy)
14. [Security Model](#14-security-model)
15. [Quality Model](#15-quality-model)
16. [Scalability Considerations](#16-scalability-considerations)
17. [Implementation Guidance](#17-implementation-guidance)
18. [Future Evolution](#18-future-evolution)
19. [Master Glossary](#19-master-glossary)
20. [Final Recommendations](#20-final-recommendations)

---

## 1. Executive Summary

**Migration purpose**: move RUANG NGAJI's operational data — currently split across Google
Sheets (18 kelompok, historical system of record) and Firestore (kelompok 1 + newer collections,
live-migrated per the ongoing absensi rollout) — into a single Supabase/PostgreSQL system, ending
the dual-source, dual-consistency-model era the app has operated under.

**Migration goals**: (1) one canonical, source-independent data model
([Task 4](Task04_Transformation.md)) that no longer requires the app or its maintainers to reason
about Sheets-vs-Firestore quirks; (2) a migration process provably correct end-to-end, not merely
"probably fine" ([Task 5](Task05_Validation.md), [Task 7](Task07_Verification.md)); (3) a process
safe to run against a live, in-use application without unrecoverable risk
([Task 6](Task06_Loading.md), [Task 8](Task08_Recovery.md), [Task 9](Task09_Runbook.md)).

**Success definition**: Task 9 §11's three-part bar — technical success (Verification reaches
VERIFIED/VERIFIED_WITH_WARNINGS-signed-off for every in-scope entity), operational success
(cutover executed per this runbook with every approval gate honored), and business success (TPQ
administrators/guru experience no disruption, migrated data actually serves the org's real
needs). All three must hold; none is individually sufficient.

**Architecture philosophy**: banking-grade discipline applied to a community-organization-scale
problem — every stage ([Tasks 3–9](Task03_Extraction.md)) is built as if incorrect data were
unacceptable, not because this app's data is high-stakes in the financial sense, but because the
org has no dedicated data team to absorb an undetected migration error, and a wrong
absensi/santri record silently corrupts records real people rely on. Safety, auditability, and
reversibility were prioritized over speed and implementation convenience throughout.

**Project boundaries**: in scope — santri, guru, kelompok, desa, ppg, jadwal_kbm,
jadwal_kategori_hari, users, absensi, pengurus_kelp (isolated/non-blocking per Task 3). Out of
scope for this migration wave — jurnal_kbm, kop_surat, pengumuman (Task 3's "Scope decision,"
flagged for a future Migration-003b-style audit before inclusion). Single Google Spreadsheet,
single Firestore project (Task 3's stated, not-yet-user-confirmed assumptions — see §9 Risk
Register).

---

## 2. Guiding Principles

Non-negotiable properties established across Tasks 1–9 — every implementation decision must be
checked against these, not re-derived from scratch:

- **Immutability**: extraction snapshots ([Task 3](Task03_Extraction.md)) are never modified
  after creation; every downstream stage reads them, none rewrites them.
- **Idempotency**: deterministic UUIDs (Task 4 §3) + UPSERT-only writes (Task 6 §5) mean any
  stage can be safely rerun without producing duplicate or drifting state.
- **Resumability**: every stage (Tasks 3–8) checkpoints at a granularity matched to its own
  failure blast radius, so interruption never requires starting over.
- **Auditability**: every finding, decision, and approval is traceable to a specific artifact
  and, where human judgment was involved, a specific named role and timestamp.
- **Deterministic execution**: identical input always produces identical output — no
  wall-clock-dependent, randomly-seeded, or non-reproducible logic anywhere in the canonical
  pipeline.
- **Evidence-first decision making**: no stage decides anything about data correctness without
  first consulting the specific artifact that justifies it.
- **Least surprise / conservative default**: when evidence is ambiguous, every framework defaults
  to the more cautious outcome — NO-GO over GO, BLOCKED over PASS, manual intervention over
  automatic action.
- **Safety before speed**: enacted structurally, e.g. Task 6 §7 keeps Postgres constraints
  enabled rather than disabling them for load throughput.
- **Strict separation of concerns**: Transform decides, Validate judges, Load persists, Verify
  proves, Recover corrects, Runbook orchestrates — each stage explicitly forbidden from doing
  another stage's job.

---

## 3. Architecture Overview

```text
        Task 1: Architecture (folder structure, 17 top-level dirs, runId convention)
        Task 2: Execution Flow (9 stages: Preflight→Extract→Staging→Transform→
                 Validate→Load→Verify→Report→Complete)
                          │
   ┌──────────────────────┼──────────────────────────────────────────────────┐
   ▼                      ▼                                                  ▼
 Task 3               Task 4                                            Task 5
 EXTRACTION    →      TRANSFORMATION    →    (canonical dataset)   →    VALIDATION
 (Sheets+Firestore    (canonical model,           staging/enriched/       (read-only,
  → immutable          UUID mapping,                                      gate decision
  snapshots)           relationship resolve,                              per entity)
                       enum/date/numeric
                       normalize, business
                       rules, harmonization)
                                                                                │
                                                                                ▼
                                                                          Task 6: LOADING
                                                                    (dependency-ordered,
                                                                     batch-transactional,
                                                                     idempotent UPSERT)
                                                                                │
                                                                                ▼
                                                                       Task 7: VERIFICATION
                                                                  (independent, read-only,
                                                                   reconciliation + checksum
                                                                   proof of correctness)
                                                                                │
                                                        ┌───────────────────────┼──────────────────┐
                                                        ▼                                            ▼
                                              VERIFIED / VERIFIED_WITH_WARNINGS         VERIFICATION_FAILED
                                                        │                                            │
                                                        ▼                                            ▼
                                                                                        Task 8: RECOVERY
                                                                                (evidence-driven decision
                                                                                 matrix: retry/replay/
                                                                                 rollback/restore/manual)
                                                        │                                            │
                                                        └────────────────────┬───────────────────────┘
                                                                              ▼
                                                            Task 9: OPERATIONAL RUNBOOK
                                                     (orchestrates all of the above with human
                                                      checklists, roles, approval gates, comms,
                                                      go/no-go, monitoring, closure)
```

**Relationship between tasks**: Task 1 is the substrate (where everything lives); Task 2 is the
technical spine (the 9 execution stages); Tasks 3–7 are the linear happy-path data pipeline, each
strictly consuming the prior stage's output and producing its own immutable/append-only artifact
set; Task 8 is the conditional branch triggered by Task 7's evidence; Task 9 is the orchestration
layer wrapping all of it in human process. No task's design depends on a *later* task's mechanism
— dependency flows strictly forward.

---

## 4. End-to-End State Machine

```text
 Planning ──► Ready ──► Extracting ──► Transforming ──► Validating
                                                              │
                              ┌───────────────────────────────┤
                              ▼ (BLOCKED entities)             ▼ (PASS/PASS_WITH_WARNINGS)
                     [entity excluded, cycle           Loading ──► Verifying
                      back to Transform/Extract              │           │
                      after fix]                              │    ┌─────┴─────┐
                                                                │    ▼           ▼
                                                                │ VERIFIED   VERIFICATION_FAILED
                                                                │    │           │
                                                                │    │           ▼
                                                                │    │      Recovering
                                                                │    │  (Task 8 decision matrix:
                                                                │    │   no-action / retry-verify /
                                                                │    │   replay / rollback / restore /
                                                                │    │   manual)
                                                                │    │           │
                                                                │    │           ▼
                                                                │    │      Recovered ──► [re-enter at
                                                                │    │                     appropriate
                                                                │    │                     upstream state]
                                                                │    ▼
                                                                └──► Cutover ──► Monitoring ──► Completed
                                                                                                   │
                                                                                            (terminal state)

Terminal states: Completed (success), Aborted (NO-GO at any gate, Task 9 §6),
                 Blocked-Pending-Fix (an entity remains excluded pending a Task 4/5 fix,
                 not a run-level failure — run can still reach Completed for other entities)
```

**Transitions**: every arrow above corresponds to a specific gate designed in Tasks 5–9
(Validation's per-entity PASS/WARN/BLOCKED, Verification's VERIFIED/WARN/FAILED, Task 9's
Go/No-Go and approval gates) — this state machine is a summary view, not a new mechanism.

**Terminal states are per-entity as well as per-run**: a single migration run legitimately ends
with some entities `Completed` and others `Blocked-Pending-Fix`, and this is a correct, expected
outcome shape, not a degraded one.

---

## 5. Architecture Decision Records (ADR Summary)

### ADR-1: Immutable extraction snapshots
- **Decision**: Extract writes once, never mutates; every later stage reads from a frozen
  snapshot.
- **Context**: Task 3 — Sheets/Firestore are live, mutable sources; the pipeline needs a stable
  reference point.
- **Rationale**: without immutability, "rerun Transform" and "re-extract" become entangled — a
  bug fix in Transform could silently pick up different source data than the original diagnosis
  was based on.
- **Trade-off**: costs storage (snapshots persist per runId) in exchange for reproducibility and
  clean debugging.

### ADR-2: Canonical, source-independent data model
- **Decision**: Transform's output has no trace of which source system a record came from, in
  shape.
- **Context**: Task 4 §1 — two source systems (Sheets, Firestore) with different shapes for
  overlapping entities.
- **Rationale**: makes every downstream stage (Validate, Load, Verify) source-agnostic, and makes
  a future third source addable without touching those stages.
- **Trade-off**: requires an extra harmonization layer (Task 4 §10) to merge dual-source data
  cleanly.

### ADR-3: Deterministic UUIDv5, never random
- **Decision**: primary keys derived from `(namespace, source, legacy_id)`, not
  database-generated.
- **Context**: Task 4 §3 — idempotent reruns require stable identity.
- **Rationale**: makes Load (Task 6 §5), Verification (Task 7 §4), and Recovery (Task 8 §6) all
  simple to reason about — a rerun always produces the same key for the same source record.
- **Trade-off**: precludes native ID-generation convenience; requires persistent, carefully
  managed UUID-mapping state.

### ADR-4: Read-only Validation, never repairs data
- **Decision**: Validate (Task 5) only classifies and reports; it never mutates canonical
  records.
- **Context**: Task 5 §1 — temptation exists to "just fix" an obviously-wrong value during
  validation.
- **Rationale**: keeps "deciding what the data should be" (Transform) and "judging whether it's
  acceptable" (Validate) sharply separated.
- **Trade-off**: a bad value can't be silently patched at validation time — it must cycle back to
  Transform.

### ADR-5: Independent, evidence-recomputing Verification
- **Decision**: Verify (Task 7) never trusts Load's self-reported counts/outcomes — it
  independently recomputes everything.
- **Context**: Task 7 §1 — Load's own success claims aren't sufficient proof for a banking-grade
  migration.
- **Rationale**: a loader verifying its own work isn't independent evidence.
- **Trade-off**: doubles the read cost — accepted given this migration's modest data volume.

### ADR-6: Evidence-driven Recovery decision matrix, never automatic destructive action
- **Decision**: Task 8 §3's matrix always defaults to "manual intervention" when evidence is
  ambiguous; no broad rollback executes without recorded human approval (Task 8 §13).
- **Context**: Task 8 §1 — a failed migration must never leave the database in an uncertain
  state, but overly automated recovery risks compounding a mistake.
- **Rationale**: the cost of pausing for a human is low; the cost of an automated rollback acting
  on a misdiagnosed situation can be severe.
- **Trade-off**: slower incident resolution in exchange for eliminating "recovery made it worse."

### ADR-7: Operational approval gates as a distinct layer from technical gates
- **Decision**: Task 9 wraps every technical PASS/VERIFIED outcome in its own human
  acknowledgment/approval step.
- **Context**: Task 9 §1 — a technically correct migration can still be operationally mistimed or
  under-communicated.
- **Rationale**: separates "is the data right" from "is now the right time and are the right
  people aligned to proceed."
- **Trade-off**: adds ceremony/latency to every cutover, deliberately.

---

## 6. Cross-Task Dependency Map

```text
Task 1 (folders/runId)  ──underlies──►  every task (all artifacts live in Task 1's structure)
Task 2 (9-stage flow)   ──frames──►     Tasks 3-7 (each task = one or more of the 9 stages)
Task 3 (Extract)        ──produces──►   snapshots/  ──consumed by──►  Task 4
Task 4 (Transform)      ──produces──►   staging/enriched/  ──consumed by──►  Task 5
Task 5 (Validate)       ──produces──►   validation_report.json + gate decision
                                              │
                                    ──consumed by──► Task 6 (as hard precondition)
Task 6 (Load)            ──produces──►  loading artifacts + verification_hooks
                                              │
                                    ──consumed by──► Task 7
Task 7 (Verify)          ──produces──►  verification_summary.json + reconciliation/
                                         checksum reports
                                              │
                              ┌───────────────┴───────────────┐
                              ▼ (on failure)                   ▼ (on success)
                    ──consumed by──► Task 8                Task 9 (cutover proceeds)
Task 8 (Recover)         ──produces──►  recovery artifacts, re-enters pipeline
                                         at appropriate upstream state
Task 9 (Runbook)         ──consumes──►  every artifact from Tasks 1-8, at their
                                         respective decision/gate points; produces
                                         its own operational artifact layer on top
```

**Critical interfaces** (where one task's output becomes another's hard-required input):

1. `snapshots/<runId>/` (Task 3 → Task 4) — must be genuinely immutable, or Task 4's determinism
   (ADR-1) is void.
2. `contracts/canonical/<entity>.schema.json` (Task 4 → Task 5) — the shared vocabulary both
   tasks must agree on.
3. `validation_report.json` gate decision (Task 5 → Task 6) — Load's hard precondition.
4. `verification_hooks.<entity>.json` + `transaction_log.json` (Task 6 → Task 7) — the specific,
   narrow handoff surface Task 6 §11 was deliberately designed to be Task 7's primary input.
5. `verification_summary.json` + pre-load snapshot reference (Task 7 → Task 8) — the trigger
   condition and hard recovery precondition, respectively.
6. Every task's artifact set, at its respective decision point (all tasks → Task 9).

---

## 7. Deliverables Matrix

| Artifact / Family | Produced by | Consumed by | Lifecycle | Retention | Immutability |
|---|---|---|---|---|---|
| `snapshots/<runId>/*` | Task 3 | Task 4 | write-once at extraction | project-lifetime | Immutable |
| `contracts/canonical/*.schema.json` | Task 4 (hand-authored) | Tasks 5, 6, 7 | version-pinned | permanent (versioned) | Append-only per version |
| `staging/enriched/<runId>/*` | Task 4 | Task 5, (6 for replay) | per-run, regenerable | until closure + audit window | Immutable once written |
| `state/mapping/<entity>/legacy-to-uuid.json` | Task 4 | Tasks 4/6/7/8 | persistent across runs | permanent | Append-only |
| `validation_report.json` + family | Task 5 | Tasks 6, 7, 9 | per-run | project-lifetime | Immutable |
| `quality/policies/*.policy.json` | Human-authored | Tasks 5, 7 | versioned config | permanent (versioned) | Versioned |
| `loading_summary.json` + family | Task 6 | Tasks 7, 8, 9 | per-run | project-lifetime | Immutable |
| `state/checkpoints/<runId>/load.*` | Task 6 | Task 6 (resume), Task 8 | per-run, transient | until closure | Mutable during run |
| `verification_summary.json` + family | Task 7 | Tasks 8, 9 | per-run | project-lifetime | Immutable |
| `artifacts/recovery/<recoveryRunId>/*` | Task 8 | Task 9 | per recovery cycle | project-lifetime | Immutable, chained |
| Pre-load backup / snapshot reference | Infra, triggered by Task 6 §17 | Tasks 7, 8 | per-run | outlives recovery window | Immutable |
| `artifacts/operations/<runId>/*` | Task 9 | Auditors, future migrations | per-run | permanent | Immutable |

---

## 8. Governance Model

**Approval model**: layered — technical gates (Tasks 5, 7) are policy-driven and largely
automatic for the clean case; anything short of clean requires named-role human sign-off; any
state-changing recovery action requires approval scaled to its blast radius; production cutover
requires its own final Go/No-Go that doesn't inherit automatically from a clean Verification.

**Evidence model**: every decision — automatic or human — traces to a specific artifact, never to
memory or narrative summary.

**Audit model**: `runId` (and `recoveryRunId` where applicable) is the unbroken thread connecting
every artifact across all nine tasks.

**Change management**: any finding that implicates a task's own design triggers a formal feedback
loop back to that task and a log entry per this project's existing `ERROR_LOG.md` convention.

**Versioning strategy**: see §13 — every governed artifact carries an explicit version; no
consumer ever reads "whatever's latest."

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation | Owning Task |
|---|---|---|---|---|
| Task 3's extraction assumptions (single spreadsheet, single Firestore project, transport) not yet user-confirmed | Medium | High | Explicit checklist item before execution | Task 3 |
| 483 orphaned absensi rows / unswept kelompok 6-7-8 (Migration 003) | Confirmed present | Medium | Execution gates wired into Validate policy | Task 5 |
| Concurrent live-app writes during Load/Recovery windows | Medium | Medium-High | Staging-schema-vs-live decision flagged for operator confirmation; Recovery never silently overwrites | Tasks 6, 8 |
| Pre-load snapshot precondition not verified functional before a real run | Low (if checklist followed) | High | Hard checklist item; explicit hard-precondition statement | Tasks 6, 8, 9 |
| More kelompok Firestore-migrated before this run, invalidating Task 4 §10's harmonization assumption | Low currently, rises over time | Medium | Flagged as "revisit first" if topology changes | Task 4 |
| Operator approves WARNING sign-off without genuine review | Low-Medium | Medium | Approval artifacts require referencing specific findings reviewed | Tasks 5, 7, 9 |
| jurnal_kbm/kop_surat/pengumuman later need urgent inclusion without own quality audit | Low | Medium | Explicit recommendation for Migration-003b-style audit first | Task 3 |
| Full-database restore invoked, losing legitimate post-snapshot activity | Low (last resort) | High | Decision matrix biases toward narrower scopes; highest approval tier required | Task 8 |

---

## 10. Operational Model

Fully specified in [Task 9](Task09_Runbook.md) — summarized, not restated: a checklist-gated,
role-accountable procedure sequencing Preparation → Pre-flight → Freeze → Extraction →
Transformation → Validation → Loading → Verification → (conditional Recovery) → Cutover →
Monitoring → Closure, with asymmetric NO-GO authority and mandatory recorded approval at every
phase transition. Task 9 is the authoritative source for role definitions, checklists,
communication timing, and incident escalation.

---

## 11. Recovery Model

Fully specified in [Task 8](Task08_Recovery.md) — summarized here with explicit attention to its
interaction points with Loading and Verification:

**Interaction with Verification**: Recovery is *triggered by* Task 7's evidence —
`verification_summary.json`'s gate outcome and the detailed findings in `reconciliation_report.
json`/`checksum_report.json`/`transaction_verification_report.json`. Recovery never re-derives
its own diagnosis independently.

**Interaction with Loading**: Recovery's undo mechanism is built directly on Load's own
transactional record — `transaction_log.json` and checkpoints (Task 6 §10/§12) are Recovery's
primary "what needs undoing" map (Task 8 §5).

**The one genuinely new mechanism Recovery introduces**: idempotent *replay* (Task 8 §9) reuses
Load's exact UPSERT mechanism but is invoked from Recovery's decision layer — a deliberate reuse,
not a parallel implementation.

---

## 12. Evidence Chain

```text
Snapshot (Task 3, immutable)
    │  content-hash referenced by →
    ▼
Transform (Task 4) — staging/enriched/, contract-checked
    │  schemaVersion + content-hash referenced by →
    ▼
Validation (Task 5) — validation_report.json, gate decision
    │  content-hash + policy version referenced by →
    ▼
Loading (Task 6) — loading artifacts reference the exact validation_report.json
    │  that authorized each entity (Task 6 §16)
    │  verification_hooks + transaction_log referenced by →
    ▼
Verification (Task 7) — independently recomputes, cross-references Load's claims,
    │  produces verification_summary.json referencing loading artifacts by content-hash
    │  (if FAILED) →
    ▼
Recovery (Task 8) — decision_trail.json references the exact verification findings
    │  that justified the chosen recovery path (Task 8 §14)
    │  recoveryRunId chained to parent runId →
    ▼
Closure (Task 9) — final_signoff.json + full evidence archive, referencing every
       artifact above by content-hash, bundled permanently (Task 9 §19)
```

**How integrity is preserved**: every link in this chain is a content-hash reference, not a
narrative claim — this discipline is repeated verbatim across Tasks 6 §16, 7 §14, 8 §14, and 9
§14. Combined with immutability (ADR-1, extended to every stage's own output), the evidence chain
is tamper-evident: altering any historical artifact breaks a hash reference held by everything
downstream of it.

---

## 13. Versioning Strategy

| Governed Object | Versioning Mechanism | Owning Task |
|---|---|---|
| Canonical schema | `schemaVersion` field, append-only within a version | Task 4 §1, ref. Task 5 §3 |
| Policies (Validation, Verification) | Versioned config files, version recorded in every gate decision | Tasks 5 §10, 7 §10 |
| Contracts (mapping, enum, business-rule) | Version-controlled YAML/JSON, hand-edited | Task 4 §2/§5/§9 |
| Transforms | Deterministic, pure functions keyed to schemaVersion | Task 4 §11/§14 |
| Validation rules | Versioned files, pinned per run | Task 5 §3/§10 |
| Migration runs | `runId` namespaces every artifact; `recoveryRunId` chains additionally | Task 1, carried through every task |
| Artifacts | Never overwritten — a rerun produces a new `runId`'s artifact set | Every task's immutability principle |

**Governing rule**: nothing in this pipeline ever reads "latest" implicitly — every consumer
reads a version pinned by the producing run's own recorded reference.

---

## 14. Security Model

**Least privilege**: extraction uses the app-mediated, RBAC-respecting transport already built
into the deployed Apps Script (Task 3's assumption 3), never a parallel direct-credential path;
Load/Recovery use the same connection path, never an ad hoc elevated-access shortcut even under
incident pressure.

**Artifact protection**: artifacts are treated as evidence, not working files — immutability is
itself a security property.

**Approval integrity**: every approval is identity-and-timestamp-recorded (`approvals.json`),
never a verbal or implicit sign-off.

**Evidence integrity**: the content-hash-chained evidence trail (§12) is itself the primary
integrity control — sufficient for this project's scale, not a claim that stronger controls
wouldn't be valid for a higher-stakes system.

**Audit trail protection**: no task, including Recovery, is ever permitted to delete or rewrite a
prior task's artifacts — the only writes any stage performs are additive, into its own artifact
namespace.

---

## 15. Quality Model

**Quality gates**: Validation's per-entity PASS/PASS_WITH_WARNINGS/BLOCKED (Task 5 §10/§14) and
Verification's per-entity VERIFIED/VERIFIED_WITH_WARNINGS/VERIFICATION_FAILED (Task 7 §10/§15) —
two structurally parallel gate models, deliberately.

**Quality scores**: Task 5 §6's completeness/uniqueness/consistency/accuracy/validity/timeliness
dimensions (pre-load) and Task 7 §13's reconciliation-percentage/checksum-match-rate/integrity/
consistency scores (post-load) — independently computed at two different points; their agreement
is itself a health signal.

**Readiness model**: the composite of every gate along the pipeline plus Task 9's operational
Go/No-Go layered on top.

**Acceptance criteria**: Task 9 §11's three-part success definition (technical/operational/
business) is the acceptance bar for the whole migration.

---

## 16. Scalability Considerations

**Larger datasets**: absensi (the sole unbounded-growth entity) has batching, streaming
checksum/reconciliation strategies, and adaptive batch-sizing already designed in.

**Additional entities**: every task's mechanisms are entity-agnostic, driven by declarative
contracts/policies rather than entity-specific code — adding an entity is a configuration
exercise.

**Multiple migration waves**: this migration's own deferred-scope decision (jurnal_kbm/kop_surat/
pengumuman) is evidence the architecture already accommodates incremental waves.

**Future schema evolution**: the `schemaVersion`-pinning discipline (§13) allows the canonical
model to evolve without invalidating historical runs' interpretability.

**Multi-tenant deployment**: not a current requirement, but every task's `runId`-namespaced,
role-based design imposes no single-tenant assumption that would need unwinding later.

---

## 17. Implementation Guidance

**Implementation priorities** (recommended build order, following the pipeline's own dependency
shape, §6): Task 1's folder scaffolding first → Task 4's contracts (canonical schema, mappings,
enums) before any transform logic → Task 3's extractors → Task 4's transformers → Task 5's
validators → Task 6's loader → Task 7's verifier → Task 8's recovery tooling last (lowest
execution frequency, but never skip it) → Task 9's operational tooling/checklists concurrently.

**Coding constraints** (architectural rules the implementation must honor):
- Every write to Postgres from Load/Recovery uses deterministic-UUID UPSERT — no random ID
  generation for a migrated row.
- Transform, Validate, Verify are pure/read-only with respect to their primary subject — no
  implementation shortcut may blur this.
- Every stage's checkpoint write happens only after the corresponding action is confirmed
  complete, never optimistically before.
- No contract, policy, or schema file is read as "latest" — every consumer resolves a pinned
  version explicitly.
- No stage silently drops a record — every record's fate (pass/reject/skip) is logged.

**Architectural rules that must never be violated**:
1. Never write to `snapshots/` after creation (ADR-1).
2. Never let Load process an entity Validation didn't authorize (Task 6 §1).
3. Never let Recovery execute a state-changing action without recorded approval scoped to its
   blast radius (Task 8 §13).
4. Never let any stage delete or rewrite a prior stage's artifacts (§14).
5. Never advance past a hold point (Task 9 §5) without the specific named-role sign-off it
   requires.

---

## 18. Future Evolution

**Migration Framework**: the nine-task shape (immutable extract → canonical transform →
policy-driven validate → idempotent load → independent verify → evidence-driven recover →
orchestrated runbook) is source-and-target-agnostic in its mechanisms — the natural evolution is
extracting this into a reusable internal framework where a *new* migration only needs to supply
contracts/mappings/policies for its specific entities.

**Internal Platform**: if the org undertakes further data-platform work beyond one-time
migrations (e.g., an ongoing sync pipeline, explicitly out-of-scope per Task 5 §15), the
checkpoint/idempotency/evidence-chain machinery here is a credible foundation, though ongoing-sync
would need genuinely new capability (incremental/delta detection) not built here.

**Migration Toolkit**: the artifact conventions (`runId` namespacing, content-hash evidence
chaining, severity/policy-driven gating) are reusable even independent of the specific pipeline
code.

---

## 19. Master Glossary

- **Canonical Dataset**: the source-independent, fully normalized representation of an entity
  produced by Transform (Task 4), stored in `staging/enriched/`; the single shape every
  downstream stage operates against regardless of original source.
- **Snapshot**: an immutable point-in-time extraction of a source entity (Task 3); never modified
  after creation.
- **Replay**: a bounded, idempotent re-execution of Load against already-validated canonical data
  for a specific scope, used when a root cause is understood and contained (Task 8 §1/§9).
- **Resume**: continuation of an interrupted (not failed) operation from its last checkpoint —
  normal operational continuation, not a Recovery-specific action (Task 8 §1).
- **Recovery**: the overall evidence-driven decision-and-execution process for responding to a
  Verification failure, which may select rollback, replay, restore, or manual intervention
  (Task 8).
- **Rollback**: the specific act of undoing data this migration wrote, returning affected scope
  to its pre-Load state (Task 8 §1/§6).
- **Validation**: read-only, pre-load classification of canonical data against contracts,
  referential integrity, business rules, and quality dimensions (Task 5).
- **Verification**: read-only, post-load, independently-recomputed proof that persisted data
  matches the canonical dataset that was authorized to load (Task 7).
- **Run ID (`runId`)**: the timestamp-embedding identifier namespacing every artifact produced by
  one execution of the migration pipeline (Task 1 §1).
- **Recovery Run ID (`recoveryRunId`)**: a distinct identifier for one Recovery execution cycle,
  chained to its parent `runId` (Task 8 §2).
- **Evidence**: any artifact — snapshot, report, checksum, log, approval record — that
  substantiates a claim or decision made anywhere in the pipeline; the foundational unit of this
  architecture's audit model (§12).
- **Checkpoint**: a persisted record of "how far this stage has gotten," at a granularity matched
  to that stage's own failure blast radius, enabling safe resumability after interruption.
- **Artifact**: any generated file this pipeline produces — reports, logs, checksums,
  checkpoints, approvals — collectively the evidentiary and operational record of a migration
  run.
- **Cutover**: the operational act of switching the live application from the old data source(s)
  to the migrated Supabase data, governed by Task 9's production cutover procedure.
- **Gate Decision**: the classified outcome (e.g., PASS/WARN/BLOCKED, VERIFIED/WARN/FAILED) a
  policy-driven evaluation produces for an entity at Validation or Verification (Tasks 5 §10, 7
  §10).
- **Deterministic UUID**: a primary key derived reproducibly from `(namespace, source,
  legacy_id)` via UUIDv5, guaranteeing the same source record always maps to the same key across
  any number of reruns (Task 4 §3).
- **Harmonization**: the process of resolving which of two source systems' data is authoritative
  for an entity that may exist in both Sheets and Firestore (Task 4 §10).

---

## 20. Final Recommendations

**Architecture strengths**: the pipeline's greatest strength is structural, not any single clever
mechanism — the consistent, repeated discipline of strict stage separation, immutable evidence,
evidence-first decision-making, and conservative default-to-caution behavior, applied uniformly
across all nine tasks. No single stage needs to be perfect for the overall system to be
trustworthy, because every stage downstream independently re-verifies rather than blindly
trusting its predecessor (ADR-5, but present as a pattern throughout).

**Remaining implementation considerations** (not architectural gaps, but items requiring
attention before/during build):
- Confirm Task 3's three stated extraction assumptions (single spreadsheet, single Firestore
  project, transport choice) with the user before writing extractors (§9 Risk Register, top
  item).
- Confirm the pre-load snapshot/backup mechanism is genuinely functional before any real run.
- Resolve the Task 6 §13 open question (load directly into live-app tables vs. staging-schema-
  then-cutover) with an explicit operator decision before Load implementation begins.
- Decide, before scaling this migration to the other 17 kelompok, whether Task 4 §10's
  clean-ownership-boundary harmonization assumption still holds, given any Firestore migration
  progress made in the interim.

**Long-term governance recommendations**: treat this MAS and its nine constituent task documents
as closed/versioned upon this approval (§13's versioning discipline applied to the architecture
documents themselves) — any future material change should be a new, explicitly versioned
decision (a Task 10, or a formally logged ADR amendment), never a silent edit to an approved
document. Retain the full evidence archive (Task 9 §19) through at least one subsequent migration
wave.

---

**This Master Architecture Specification is the Single Source of Truth for Migration 004.** It
supersedes the need to consult Tasks 1–9 individually for routine implementation and governance
questions; the underlying task documents remain the authoritative deep-detail reference for any
question this MAS's summary level doesn't resolve.
