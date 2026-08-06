# Task 3 — Data Extraction Strategy (Migration 004)

> Status: **APPROVED**, with 3 assumptions flagged, not yet confirmed by user.

## Assumptions Awaiting Confirmation

1. **ONE Google Spreadsheet** holds all 18 kelompok's rows per entity (distinguished by a
   `kelompok_id` column), not 18 separate spreadsheets.
2. **ONE Firestore project**, live data currently only for kelompok 1 + the newer Firestore
   collections (`jurnal_kbm`/`kop_surat`/`pengumuman`).
3. Extraction transport is **app-mediated** (thin Node exporters calling temporary audited export
   routes added to the deployed Apps Script `Code.js`, same pattern as Migration 003's
   `?diag=kelompokdist` + `tools/diag_query.js`) — **NOT** direct Sheets API / Firestore REST
   service-account credentials. This choice reuses existing RBAC/lock-respecting bridge code
   instead of building parallel direct-API access.

## Scope Decision (flagged, not yet user-confirmed)

`jurnal_kbm` / `kop_surat` / `pengumuman` are **OUT** of Migration 004's extraction scope for now
(P4/deferred) — they were reviewed for *performance* in the 2026-08-05/06 Firestore audit but
never row-counted/quality-audited the way santri/guru/absensi were in Migration 003. Recommended
a Migration-003b-style audit for these three before adding them to scope.

## Extraction Order

Reference tables (`kelompok`/`desa`/`ppg`, `jadwal_kategori_hari`, `users`) → `guru` → `santri` →
`jadwal_kbm` → `absensi` (largest/riskiest last) → `pengurus_kelp` last & isolated.

Order is **risk-minimization** driven, explicitly different from Load's FK-driven order (see
[Task 6](Task06_Loading.md) §3).

## Related Documents

- [Task 2 — Migration Execution Flow](Task02_ExecutionFlow.md)
- [Task 4 — Transformation Strategy](Task04_Transformation.md)
- [Master Architecture Specification](MAS.md)
