# Data Authority Analysis — Ruang Ngaji

**Date**: 2026-08-09
**Method**: Direct read of `13_AppsScript/*.gs` write/read paths, cross-checked against `docs/architecture/MAS.md` and prior audits in this repo. Read-only — no code changes.

## Executive Summary

**Overall Architecture**: **[x] Hybrid — different entities (and, within one entity, different *kelompok*) have different masters.**

This is not "dual master requiring reconciliation" — there is **no reconciliation logic anywhere in the codebase** (confirmed by search, see §4), because the architecture never lets two sources be authoritative for the *same row* at the *same time*. It's better described as **partitioned single-writer**: for each entity, and for entity types that are kelompok-scoped, for each *kelompok*, exactly one source is ever written to — the routing decision is a static table (`FIRESTORE_KELOMPOK_TABLES_`, `Modul_Utilities.gs`), not a runtime merge/conflict process.

**Recommendation for Extract**: Extract does **not** need to design a conflict-resolution or "latest wins" strategy — there is nothing to resolve. What it needs instead is to **reuse the app's own routing table** (`FIRESTORE_KELOMPOK_TABLES_`) as its per-entity, per-kelompok source-selection logic, because that table *is* the authoritative statement of where each row currently lives. Building Extract's own independent "which source is master" heuristic would risk drifting from the app's actual behavior — the app's own constant should be the single input Extract trusts for routing.

---

## Entity Authority Mapping

| Entity | Master | Write To | Read From | Confidence | Evidence |
|---|---|---|---|---|---|
| **Santri** | **Hybrid, per-kelompok**: Firestore for kelompok_id='1' (Kelp Petemon); Sheets for the other 17 | Branches via `isKelompokTableOnFirestore_('santri', kelompokId)` | Same branch, both sources merged transparently for callers via `readSheetAsObjects()` | High | `Modul_Utilities.gs:72-78` (`FIRESTORE_KELOMPOK_TABLES_.santri = ['1']`), `Modul_MaintainSantri.gs:23,135-138,228-230,262-264` (create/update/delete all branch) |
| **Guru** | Same hybrid pattern as Santri | Same branching (`isGuruOnFirestore_` wraps `isKelompokTableOnFirestore_`) | Same merge | High | `Modul_Utilities.gs:74`, `Modul_MaintainGuru.gs:96-103,179,213` |
| **Absensi** | Same hybrid pattern, plus special handling — `absensi` has no `kelompok_id` column of its own, kelompok membership is resolved by joining `santri_id` → `santri.kelompok_id` | Branches at 3+ call sites (`Modul_MaintainAbsensi.gs`, `Modul_InputAbsen.gs`'s `iaRewriteAbsensiKelas_`/`iaRewriteAbsensiKelasFirestore_`) | `readSheetAsObjects('absensi', ...)` merge logic is join-aware (`Modul_Utilities.gs:198-206`) | High | `Modul_Utilities.gs:77,198-206`, `Modul_MaintainAbsensi.gs:162-282` |
| **Jadwal KBM** (a reasonable reading of "Kelas") | Same hybrid pattern | `Modul_MaintainJadwalKBM.gs:156,229,260` (branches) | Same merge | High | `Modul_Utilities.gs:75` |
| **Jadwal Kategori Hari** | Same hybrid pattern | `Modul_MaintainJadwalKBM.gs:325,337` (branches) | Same merge | High | `Modul_Utilities.gs:76` |
| **Progress** (`kurikulum_pencapaian_santri`) | **Sheets only, all 18 kelompok** — not present in `FIRESTORE_KELOMPOK_TABLES_` at all | `updateRowByQuery('kurikulum_pencapaian_santri', ...)` unconditionally, no Firestore branch exists | Sheets only | High | Absence from `FIRESTORE_KELOMPOK_TABLES_` (`Modul_Utilities.gs:72-78`) confirmed by grep — no `isKelompokTableOnFirestore_` call anywhere referencing this table |
| **Jurnal** (`jurnal_kbm`) | **Firestore only, for every kelompok that uses the mobile Jurnal feature** — this table has **never had a Sheets form**, it isn't a "migrated" table, it was born Firestore-native | `Modul_Jurnal.gs` writes directly via `firestoreUpdateDoc_`/deterministic doc-id upsert (`jurnalDocId_` = `slug(kelas)+'__'+tanggal`), no Sheets fallback branch exists at all | Firestore only | High | `Modul_Jurnal.gs` header comment (confirmed this session while building the mobile Kurikulum feature): *"Firestore-only sejak awal... tidak pernah punya sheet"* |
| **Kurikulum** (`kurikulum_prota`/`promes`/`probul`/`pencapaian_santri`) | **Sheets only, all 18 kelompok** | `serverAddProta`/`serverAddPromes`/`serverAddProbul` etc. (`Modul_MaintainKurikulum.gs`) write via generic `appendRowToSheet`/`updateRowByQuery`, no Firestore branch exists anywhere in this file | Sheets only | High | Absence from `FIRESTORE_KELOMPOK_TABLES_`; confirmed by grep — zero `isKelompokTableOnFirestore_`/`firestoreCreateDoc_`/etc. references in `Modul_MaintainKurikulum.gs` |
| **Kelas** (ambiguous term — two real concepts share this word) | See below, split into two rows | | | Medium (term ambiguity, not evidence ambiguity) | |
| — as `jadwal_kbm.kelas` (a guru's actual assigned class, free-text) | Same hybrid pattern as Jadwal KBM above | Same | Same | High | Same as Jadwal KBM row |
| — as Kurikulum's canonical class code ('1'-'9'/'PAUD-TK', `kurikulum_prota.kelas`) | Sheets only, no Firestore involvement, and **no FK to `jadwal_kbm.kelas`** (a genuine architecture gap, documented independently in `RUANG_NGAJI_AUDIT_REPORT.md` §7 gap 3) | Same as Kurikulum row | Same | High | Same as Kurikulum row |

---

## Read Data Flow

**User opens Dashboard (desktop admin, any kelompok)** →
`readSheetAsObjects('santri')` / `readSheetAsObjects('guru')` / `readSheetAsObjects('absensi')` (generic, un-scoped calls used by most desktop screens) → internally: Sheets rows for the 17 non-migrated kelompok **plus** Firestore rows for kelompok_id='1', concatenated into one array (`Modul_Utilities.gs:190-218`) → caller receives a single merged list, **with no visible seam** between the two sources.

**User opens mobile guru screens (Input Absen, Jurnal, Kurikulum — all of which are Kelp Petemon-only in practice today)** →
these use the **kelompok-scoped fast path** (`iaReadKelompokTable_`/`iaReadKelompokTablesParallel_`, `Modul_InputAbsen.gs`), which — for kelompok_id='1' — reads **Firestore only**, skipping the generic merge-with-Sheets logic entirely (documented performance rationale: reading "all kelompok then filter" would be wasteful when the caller already knows it only needs kelompok 1). This is a *narrower, kelompok_id='1'-specific* code path, functionally consistent with the generic merge (same authority answer) but implemented separately for performance.

**Kurikulum reads (desktop and the mobile feature built this session)** → always `readSheetAsObjects('kurikulum_prota'/'kurikulum_promes'/etc.)`, unconditionally Sheets, no Firestore branch anywhere — even for Kelp Petemon.

---

## Write Data Flow

**User inputs Absensi (mobile guru, Kelp Petemon)** → `google.script.run` → server function in `Modul_InputAbsen.gs`/`Modul_MaintainAbsensi.gs` → `isKelompokTableOnFirestore_('absensi', kelompokId)` check → **TRUE for kelompok 1 → Firestore** (`iaRewriteAbsensiKelasFirestore_`, deterministic doc IDs, batched via `UrlFetchApp.fetchAll` parallel writes) — **FALSE for the other 17 → Sheets** (`iaRewriteAbsensiKelas_`, batch `clearContent`+`setValues`).

**User inputs Progress** (kurikulum_pencapaian_santri, e.g. marking a santri's status against a Probul target) → `Modul_MaintainKurikulum.gs` → unconditional `updateRowByQuery('kurikulum_pencapaian_santri', ...)` → **always Sheets**, regardless of kelompok, because this table was never added to the Firestore migration list.

**User inputs Jurnal** (mobile guru, Kelp Petemon) → `Modul_Jurnal.gs`'s `serverSaveJurnal` → `firestoreUpdateDoc_` with a deterministic composite document ID (`slug(kelas)+'__'+tanggal`, so re-saving the same class+date is a natural upsert, not an insert-then-conflict) → **always Firestore**, no Sheets write path exists to even consider.

**User inputs Santri/Guru/Jadwal KBM data** (desktop admin, any kelompok) → same branch pattern as Absensi: `isKelompokTableOnFirestore_(table, kelompokId)` → Firestore only for kelompok 1, Sheets only for the other 17.

---

## Conflict Resolution

**Which case applies**: none of the request's three hypothetical cases (Sheets-master-with-sync-to-Firestore / Firestore-master-with-sync-to-Sheets / dual-master-with-reconciliation) match what's actually implemented. The real model:

**Partitioned single-writer, no reconciliation needed by construction**:
- For the 5 kelompok-scoped, Firestore-eligible tables (santri, guru, jadwal_kbm, jadwal_kategori_hari, absensi): a **one-time copy** moved kelompok 1's historical Sheets rows into Firestore (`Modul_FirestoreMigration.gs` — explicitly a manual, diagnostic-endpoint-triggered, idempotent *copy* tool, not a sync daemon: *"BUKAN bagian dari alur aplikasi pengguna — dipanggil manual lewat endpoint diagnostik saat memindahkan 1 tabel"*). After that one-time copy, **every write path in the live app was updated to branch away from Sheets for kelompok 1** (confirmed: `Modul_MaintainSantri.gs`, `Modul_MaintainGuru.gs`, `Modul_MaintainJadwalKBM.gs`, `Modul_MaintainAbsensi.gs`, `Modul_InputAbsen.gs` all check `isKelompokTableOnFirestore_` before every create/update/delete — no unguarded direct write to the generic `appendRowToSheet`/`updateRowByQuery`/`deleteRowByQuery` for these 5 tables was found in this pass).
- The kelompok-1 rows that existed in Sheets *before* the copy are **not deleted** — they remain as a frozen "last snapshot" (explicit design intent per `Modul_Utilities.gs`'s comments on the sibling `FIRESTORE_TABLES_` mechanism) but are **never read or written again** by the live app for that kelompok/table combination, because the read-merge logic (`Modul_Utilities.gs:206,208`) actively *excludes* Firestore-migrated kelompok's rows from the Sheets side of the merge.
- **No timestamp-based "latest wins" logic exists anywhere** — searched for it, found nothing, because there's never a moment where both sources could legitimately hold conflicting *live* data for the same row under normal operation. (A conflict *could* theoretically arise only if someone manually edited the frozen Sheets row after migration — nothing in the code prevents that, but nothing reads it either, so it would be silently ignored, not merged or resolved.)
- **No cross-check/validation between the two sources exists** in the live app. The closest thing is the diagnostic `?diag=kelompokdist` route (`Code.js:55-81`), which is a manual investigative tool (used to find the 483 orphaned absensi rows), not an automated reconciliation process.

---

## Architecture Documentation

- **MAS.md** (`docs/architecture/MAS.md`) is aware of this dual-source reality and treats it as a *reason the migration exists*, not a design to replicate: `MAS.md:36-39` — *"currently split across Google Sheets (18 kelompok, historical system of record) and Firestore (kelompok 1 + newer collections, live-migrated per the ongoing absensi rollout)... ending the dual-source, dual-consistency-model era."* This confirms Sheets is explicitly called the **"historical system of record"** for the 17 non-migrated kelompok, and Firestore is the live-migrated target for kelompok 1 — language consistent with everything found in code this pass.
- **MAS.md §1** (in/out-of-scope list) does **not** distinguish source (Sheets vs. Firestore) per entity — it lists entities by name only (`santri, guru, kelompok, desa, ppg, jadwal_kbm, jadwal_kategori_hari, users, absensi, pengurus_kelp` in scope). This means **the migration architecture, as currently documented, does not yet have an explicit per-entity extraction-source routing table** — it assumes Extract will figure out the Sheets-vs-Firestore split per entity/kelompok itself. This report's entity mapping above is exactly that missing piece.
- **No ADR** in `11_Decision Log/ADR.md` was found (via targeted grep) to explicitly title itself around "Sheets vs Firestore authority" — `UNKNOWN — need investigation`, full read of that file wasn't done this pass; worth a follow-up read if a formal ADR reference is needed for the migration PRD.
- **Why dual-source exists at all** — not a deliberate target architecture, but an **incremental, rollback-safe migration in progress**: `Modul_Utilities.gs`'s own comments describe `FIRESTORE_KELOMPOK_TABLES_` as *"migrasi PER-KELOMPOK (rollout bertahap, mis. Kelp Petemon dulu sebelum kelompok lain ikut)"* ("per-kelompok migration, staged rollout, e.g. Kelp Petemon first before other kelompok follow"). The dual-source state is a **transitional artifact of migrating the live Apps Script app from Sheets to Firestore kelompok-by-kelompok** — a *different, earlier, already-in-progress* migration than the Supabase migration this report series is investigating. Migration 004 (Supabase) will need to extract from *both* of these sources because the Sheets→Firestore migration is itself incomplete (17 of 18 kelompok not yet moved).

---

## Extract Strategy Recommendation

**Because the authority model is partitioned-single-writer, not dual-master**, Extract's design should be:

1. **Reuse `FIRESTORE_KELOMPOK_TABLES_` as the literal source-routing table**, not reinvent one. For each of the 5 entities it covers (santri, guru, jadwal_kbm, jadwal_kategori_hari, absensi): extract kelompok 1's rows from Firestore, extract the other 17 kelompok's rows from Sheets, and treat this as a **union, not a merge-with-conflict-handling** — there will be no overlapping rows to reconcile, by construction.
2. **`kurikulum_pencapaian_santri` and the rest of the kurikulum chain, plus every other entity not in the Firestore list**: Sheets is the sole source, for all 18 kelompok, full stop — no branching logic needed in Extract for these.
3. **`jurnal_kbm` and `kop_surat`**: Firestore is the sole source, for whichever kelompok has used the mobile feature — these were never in Sheets, so there is no Sheets-side rows to even check.
4. **Do not build timestamp-based conflict resolution or a reconciliation pass** — it would be solving a problem that doesn't exist in this codebase's actual write behavior, and would add complexity (and a false sense that conflicts are being "handled") where the real risk is different: **the frozen post-migration Sheets rows for kelompok 1** are stale data that must be explicitly *excluded* from Extract's Sheets-side read for the 5 migrated tables (exactly mirroring `Modul_Utilities.gs:206,208`'s filter logic) — including them would silently duplicate kelompok 1's data from both sources.
5. **One thing this analysis could not fully close**: whether any Modul_*.gs file *besides* the 5 confirmed here (Santri/Guru/JadwalKBM/JadwalKategoriHari/Absensi) has a write path that *should* branch but doesn't — this pass checked the write call sites for the 5 known Firestore-eligible tables specifically and found consistent branching, but did not exhaustively re-derive `FIRESTORE_KELOMPOK_TABLES_` from first principles against every write in the codebase. Recommend treating `FIRESTORE_KELOMPOK_TABLES_`'s current key list as authoritative (it's the single source of truth the app itself uses) rather than re-auditing it from scratch before Extract implementation begins.
