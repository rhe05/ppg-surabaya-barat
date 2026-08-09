# Ruang Ngaji — Extraction Topology Analysis

**Date**: 2026-08-09
**Purpose**: Direct answer to the #1 blocker flagged in `RUANG_NGAJI_AUDIT_REPORT.md` (`MAS.md:355`) — "single spreadsheet, single Firestore project, transport choice not yet user-confirmed." This report investigates what the *code itself* proves about that topology.
**Method**: Read-only filesystem inspection of `13_AppsScript/` (all `.gs`/`.js`/`.html`/`.json` files), no live app or credential access. No code changes made.

---

## 1. Google Sheets Integration

**Where the Spreadsheet ID lives**: nowhere in the codebase, and that's structurally significant, not a gap in my search. `13_AppsScript/Modul_Utilities.gs:6` does:
```js
const SS = SpreadsheetApp.getActiveSpreadsheet();
```
This is a **container-bound script** — the Apps Script project is bound *to* one specific Google Sheet (created via Sheet → Extensions → Apps Script), and `getActiveSpreadsheet()` always resolves to that one bound Sheet. Confirmed by grepping every `.gs`/`.js` file: **every single spreadsheet access in the entire codebase** (`Modul_Utilities.gs`, `Modul_InputAbsen.gs`, `Modul_MaintainJadwalKBM.gs`, `Modul_SeedData.gs`, `Setup_Database.gs`) calls `SpreadsheetApp.getActiveSpreadsheet()` — **zero occurrences of `SpreadsheetApp.openById(...)`** with a different, hardcoded ID anywhere. `Setup_Database.gs:13` even computes `DB_SHEET_ID` at runtime via `.getId()` rather than storing it as a constant.

**Conclusion — extraction topology question #1, answered**: **there is exactly one spreadsheet.** The architecture is structurally incapable of silently reading from a second one; nothing in the code has the mechanism to. `.clasp.json` (`13_AppsScript/.clasp.json`) confirms the *script's* own identity (`scriptId`) but — correctly — does not and cannot store the bound Sheet's ID (clasp doesn't manage that relationship).

**What this report cannot tell you**: the actual Spreadsheet ID/URL, since it's genuinely not present in any file in this repo (by design — a container-bound script doesn't need to store it). To get it, open the script from within the Sheet (Extensions → Apps Script) or check `File → Details` in the Sheet directly.

**Sheet count and names**: `Setup_Database.gs` defines **28 sheets** via `createSheetIfNotExists()` calls, run once (idempotently — safe to re-run) by `setupDatabaseStructure()`:

| # | Sheet name | # | Sheet name |
|---|---|---|---|
| 1 | `ppg` | 15 | `pengumuman` |
| 2 | `desa` | 16 | `jadwal_kategori_hari` |
| 3 | `kelompok` | 17 | `kurikulum_prota` |
| 4 | `users` | 18 | `kurikulum_promes` |
| 5 | `santri` | 19 | `kurikulum_probul` |
| 6 | `guru` | 20 | `kurikulum_pencapaian_santri` |
| 7 | `riwayat_jenjang` | 21 | `akses_kelas_request` |
| 8 | `siklus_generus` | 22 | `guru_izin` |
| 9 | `pengurus_kelp` | 23 | `quote_harian` |
| 10 | `absensi` | 24 | `remember_tokens` |
| 11 | `munaqosah` | | |
| 12 | `periode_munaqosah` | | |
| 13 | `konseling` | | |
| 14 | `kurikulum_akhlaq` | | |
| — | `calendar_events`, `files`, `audit_log`, `jadwal_kbm` | | (remaining 4 of the 28) |

(28 sheets confirmed by `grep -oP "createSheetIfNotExists\(ss, '\K[^']+" Setup_Database.gs`, listed in creation order above.)

**Data structure per sheet** — headers are explicit in `Setup_Database.gs`; example (`santri`, the largest real-data table):
```
id, kelompok_id, nama, nis, gender, tanggal_lahir, jenjang_saat_ini, nama_panggilan,
tempat_lahir, pendidikan, kelas_sekolah, kelas_ngaji, alamat, nama_ayah, nama_ibu,
rt, rw, kelurahan, kode_pos, kabupaten_kota, provinsi, nomor_wa_ayah, nomor_wa_ibu,
kecamatan, nomor_wa, status_nikah, mulai_ngaji
```
A representative **example data shape** (not live production data — this is the bulk-import CSV template shipped in the repo, `SAMPLE_BULK_IMPORT.csv`, same field semantics as a subset of the `santri` sheet):
```csv
Nama,NIS,Gender,Tanggal Lahir,Jenjang
Ahmad Ridho,NIS-001,L,2015-03-15,AUD
Siti Nurhaliza,NIS-002,P,2014-07-22,AUD
Budi Santoso,NIS-003,L,2013-11-08,Cabe Rawit
```
Note this template uses **display-friendly headers** ("Nama", "Gender") that get mapped to the sheet's real snake_case columns on import — the template itself is not the literal sheet header row.

---

## 2. Google Apps Script (.gs / .js) Files

**Full inventory**: 27 `.gs` files + `Code.js` + `appsscript.json` in `13_AppsScript/`. Full list (alphabetical, sizes as of this pass):

`Code.js` (29K, entry point) · `Modul_Dashboard.gs` (13K) · `Modul_Export.gs` (4.7K) · `Modul_FirestoreBridge.gs` (18.7K) · `Modul_FirestoreMigration.gs` (29.5K) · `Modul_InputAbsen.gs` (75K, largest) · `Modul_Jurnal.gs` (11.9K) · `Modul_KopSurat.gs` (4.5K) · `Modul_Laporan.gs` (12.3K) · `Modul_MaintainAbsensi.gs` (21.1K) · `Modul_MaintainGuru.gs` (9.6K) · `Modul_MaintainJadwalKBM.gs` (15K) · `Modul_MaintainKalender.gs` (8.6K) · `Modul_MaintainKonseling.gs` (15.8K) · `Modul_MaintainKurikulum.gs` (35.9K) · `Modul_MaintainMunaqosah.gs` (21.8K) · `Modul_MaintainPengumuman.gs` (6K) · `Modul_MaintainPengurus.gs` (5.9K) · `Modul_MaintainPustakUnduhan.gs` (7.2K) · `Modul_MaintainSantri.gs` (16.9K) · `Modul_MaintainSiklusGenerus.gs` (6.6K) · `Modul_Monitoring.gs` (14.3K) · `Modul_QuoteHarian.gs` (3.6K) · `Modul_SeedData.gs` (19.9K) · `Modul_Statistics.gs` (11.5K) · `Modul_UserManagement.gs` (13.4K) · `Modul_Utilities.gs` (26.5K) · `Setup_Database.gs` (19.6K)

**`doGet()`** — exists exactly once, in `Code.js:32`. Returns two different things depending on the query string:
- **No `?diag=` parameter** (normal page load): renders the full HTML app via `HtmlService.createTemplateFromFile(...)` — this is the `Index.html` shell that includes `Style_Main.html`/`Markup_Screens.html`/`Script_Main.html`.
- **With `?diag=schema|rows|kelompokdist|firestoretest|migrate`**: returns **JSON** via `ContentService.createTextOutput(JSON.stringify(...)).setMimeType(ContentService.MimeType.JSON)` — these are developer-only diagnostic/migration-utility routes, gated by the web app's `access` setting (see below), not meant for end-user traffic.

**`doPost()`** — **does not exist anywhere in the codebase.** Grepped every `.gs`/`.js` file, zero matches. This is architecturally deliberate, not missing: `Code.js:7-11` states outright — *"Apps Script Web App secara idiomatis memakai pola google.script.run (client memanggil fungsi server langsung), BUKAN fetch ke endpoint REST"* ("Apps Script Web Apps idiomatically use the google.script.run pattern — client calls server functions directly — not fetch to a REST endpoint"). **All writes (Insert/Update/Delete) happen through `google.script.run.<serverFunctionName>(...)` calls from the browser**, which Apps Script routes directly to a named server function — there is no HTTP POST body to parse, ever.

**Which files call the Google Sheets API**: any file using `SpreadsheetApp`/`readSheetAsObjects`/`appendRowToSheet`/etc. — in practice, **almost every `Modul_*.gs` file**, since Sheets is still the default read/write path for 17 of 18 kelompok (see `Modul_Utilities.gs`'s `readSheetAsObjects`/`appendRowToSheet`/`updateRowByQuery`/`deleteRowByQuery`, which every CRUD module calls).

**Which files call Firestore**: only `Modul_FirestoreBridge.gs` (the raw REST bridge) and its callers — `Modul_FirestoreMigration.gs` (one-time migration utilities), plus the small set of feature modules that branch to Firestore for kelompok_id='1' specifically: `Modul_InputAbsen.gs`, `Modul_Jurnal.gs`, `Modul_KopSurat.gs`, `Modul_MaintainSantri.gs`, `Modul_MaintainGuru.gs`, `Modul_MaintainJadwalKBM.gs`, `Modul_MaintainAbsensi.gs`, `Modul_Monitoring.gs` (all gated through `isKelompokTableOnFirestore_()`/`FIRESTORE_KELOMPOK_TABLES_` in `Modul_Utilities.gs` — see §3).

**Data flow: User input → save**:
```
Browser (HTML form)
   │  onclick handler collects field values
   ▼
google.script.run.serverXxx(token, ...fields)     ← NOT doPost, direct RPC
   ▼
Server function in the matching Modul_*.gs
   │  validateUserAccess(token, ...)  — RBAC check, every write path
   │  withScriptLock_(function () { ... })  — serializes concurrent writers
   ▼
Branch on isKelompokTableOnFirestore_(table, kelompokId):
   ├─ FALSE (17 of 18 kelompok, and any non-kelompok-scoped table)
   │     → appendRowToSheet() / updateRowByQuery() (SpreadsheetApp)
   └─ TRUE (kelompok_id='1' / "Kelp Petemon" ONLY, 5 tables — see §3)
         → firestoreCreateDoc_() / firestoreUpdateDoc_() (Modul_FirestoreBridge.gs, REST)
```

---

## 3. Firestore Connection

**Yes, Firestore is in active use** — but scoped to exactly one kelompok, exactly five tables. Source of truth: `Modul_Utilities.gs`'s `FIRESTORE_KELOMPOK_TABLES_` constant:
```js
const FIRESTORE_KELOMPOK_TABLES_ = {
  santri: ['1'],                 // Kelp Petemon
  guru: ['1'],
  jadwal_kbm: ['1'],
  jadwal_kategori_hari: ['1'],
  absensi: ['1'],
};
```
Plus **two Firestore-only features with no Sheets equivalent at all** (never had one, not a migration-in-progress): `jurnal_kbm` (`Modul_Jurnal.gs`) and `kop_surat` (`Modul_KopSurat.gs`) — these apply to whichever kelompok uses those specific mobile features, not gated by the same table above.

**Collections** (Firestore path structure, from `Modul_FirestoreBridge.gs` callers):
- `kelompok/{kelompokId}/santri/{id}`
- `kelompok/{kelompokId}/guru/{id}`
- `kelompok/{kelompokId}/jadwal_kbm/{id}`
- `kelompok/{kelompokId}/jadwal_kategori_hari/{id}`
- `kelompok/{kelompokId}/absensi/{id}`
- `kelompok/{kelompokId}/jurnal_kbm/{docId}` — `docId` = `slug(kelas) + '__' + tanggal` (deterministic composite key, not an autogenerated ID)
- `kelompok/{kelompokId}/kop_surat/{kategoriSlug}`
- `kelompok/{kelompokId}/_counters/{tabel}` — internal ID-generation counter documents, not user data
- `_bridge_test` — diagnostic-only collection (`?diag=firestoretest`), not application data

**Document structure**: flat field maps mirroring the Sheets column names for the mirrored tables (e.g. a `santri` Firestore document has the same fields as a `santri` Sheets row — `nama`, `nis`, `gender`, etc., encoded via `firestoreEncodeFields_()` in `Modul_FirestoreBridge.gs`, which explicitly does **not** support nested objects/arrays — every value must be flat).

**Firestore project ID**: **not present anywhere in this repository, by deliberate design.** `Modul_FirestoreBridge.gs:30-33`:
```js
function firestoreBaseUrl_() {
  const sa = firestoreServiceAccount_();
  return 'https://firestore.googleapis.com/v1/projects/' + sa.project_id + '/databases/(default)/documents';
}
```
The project ID is read at runtime from the `project_id` field *inside* a service-account credential JSON blob stored in **Apps Script's Script Properties** (`PropertiesService.getScriptProperties().getProperty('FIRESTORE_SERVICE_ACCOUNT_JSON')`) — explicitly documented as *"TIDAK PERNAH masuk git"* ("never goes into git", `Modul_FirestoreBridge.gs:14`). This is correct secrets hygiene, not a documentation gap — **this report cannot and should not surface the project ID**, since doing so would mean it leaked into a committed file, which is exactly what this design prevents. To find it: Apps Script editor → Project Settings → Script Properties (requires project-owner access), or the Firestore/GCP console the service account belongs to.

**Extraction-topology implication**: since the credential (and thus the project ID) lives outside git entirely, a migration Extract engine reading from Firestore will need that same Script Property made available to whatever runs the Extract engine (if it runs outside Apps Script) — this is a **deployment/credentials-provisioning question for the migration implementation**, not something this repo can answer definitively.

---

## 4. HTML/Frontend Code

**Where user input happens**: `13_AppsScript/Markup_Screens.html` (~2190 lines, all screens/modals) contains every form. `Index.html` is a thin shell (`<?!= include(...) ?>` × 3, ~35 lines) — not where forms live (per `FILE_MAP.md`'s explicit guidance, confirmed this session).

**Representative form fields** (login, the universal entry point):
```html
<input id="username" autocomplete="username" placeholder="Username atau email">
<input id="password" type="password" autocomplete="current-password" placeholder="Masukkan password">
<input type="checkbox" id="loginRememberMe">  <!-- added this session -->
```
Other major forms present in `Markup_Screens.html` (not exhaustively enumerated — this file is large): Santri CRUD (nama, NIS, gender, tanggal lahir, jenjang, alamat, orang tua fields, etc. — matching the `santri` sheet's 26 columns), Guru CRUD (nama, kategori — MT/MS/GM/GB, tanggal lahir, alamat, etc.), Jadwal KBM (kategori, guru, **kelas as free-text input**, jam, ruangan), Kurikulum Prota/Promes/Probul modals, Kop Surat letterhead configuration, and the mobile guru screens (Input Absen, Jurnal, Guru Izin, Kurikulum).

**`onclick` handler → data destination**: every form's submit button calls a `window.saveXxx()`/`window.serverXxxSave()`-style JS function in `Script_Main.html`, which in turn calls `google.script.run.serverXxx(...)` — **never** a `fetch()` or `XMLHttpRequest` to an external endpoint. Confirmed no `fetch(` calls to non-Google-service URLs exist in `Script_Main.html` for the write path (the *only* outbound `fetch`-like calls in the whole app are `UrlFetchApp` calls *inside* Apps Script server functions, to `firestore.googleapis.com` — not from the browser).

---

## 5. Google Sheet Export/Backup

**Export mechanism**: yes, CSV/XLSX export exists as a **user-facing feature**, not an automated backup:
- `Modul_Laporan.gs`: `serverExportSantri`, `serverExportGuru`, `serverExportAbsensiMonthly` — CSV.
- `Modul_Export.gs`: `serverBuildXlsxFromData` — real `.xlsx` (not CSV-with-xlsx-extension) via `Utilities.zip`, called by the mobile/desktop "Ekspor" buttons across several screens (Data Guru, Data Generus, Kehadiran Generus).
- These are **on-demand, per-user, per-view exports** (e.g. "export this kelompok's guru list right now") — not scheduled, not a full-database dump.

**Backup strategy**: **no custom backup mechanism exists in this codebase.** Grepped every `.gs`/`.js` file for `backup`/`Backup`/`ScriptApp.newTrigger`/`TriggerBuilder` — **zero matches**. There are no time-driven Apps Script triggers defined in code at all (any that might exist would have to be configured manually in the Apps Script editor's Triggers UI, which is not reflected in any file in this repo — `UNKNOWN — need investigation` whether any exist there). In practice, the app's only backup layer is **Google Sheets' own built-in version history** (File → Version history, retained by Google's infrastructure, not this app) — there is no independent, app-controlled backup/restore mechanism.

**Extraction-topology implication**: an Extract engine cannot rely on any existing "export" feature as its data source — those are scoped/formatted for human consumption (one kelompok, one report at a time), not a full-fidelity machine-readable dump. Extract will need to read directly from Sheets (`SpreadsheetApp`) and Firestore (REST), the same way the application itself does — there is no shortcut export artifact to reuse.

---

## 6. Data Flow Mapping

```
                         ┌─────────────────────────────┐
                         │   Browser (HtmlService page)  │
                         │   Index.html → Style/Markup/  │
                         │   Script_Main.html included    │
                         └───────────────┬───────────────┘
                                         │ google.script.run.serverXxx(token, ...)
                                         │ (NO REST/fetch, NO doPost — ever)
                                         ▼
                         ┌─────────────────────────────┐
                         │  doGet(e) — Code.js:32        │
                         │  · no ?diag → renders HTML     │
                         │  · ?diag=X → returns JSON       │
                         │    (dev/diagnostic routes only) │
                         └───────────────┬───────────────┘
                                         │ (server functions called directly,
                                         │  bypassing doGet entirely, for RPC)
                                         ▼
                         ┌─────────────────────────────┐
                         │  Modul_*.gs server function     │
                         │  validateUserAccess() → RBAC     │
                         │  withScriptLock_() → serialize   │
                         └───────┬─────────────────┬───────┘
                                 │                   │
              isKelompokTableOnFirestore_() = FALSE   TRUE (kelompok_id='1' only,
              (17/18 kelompok + all non-scoped tables)  5 tables: santri/guru/
                                 │                   jadwal_kbm/jadwal_kategori_hari/
                                 ▼                   absensi — plus jurnal_kbm/
              ┌─────────────────────────┐            kop_surat, Firestore-only always)
              │  ONE Google Sheet         │                    │
              │  (container-bound,        │                    ▼
              │  SpreadsheetApp.          │      ┌─────────────────────────────┐
              │  getActiveSpreadsheet(),  │      │  Firestore REST API           │
              │  28 sheets — see §1)      │      │  (Modul_FirestoreBridge.gs,     │
              │  NO hardcoded ID          │      │  JWT service-account auth,      │
              │  anywhere in code         │      │  project_id read from Script    │
              └─────────────────────────┘      │  Properties at runtime,          │
                                                 │  NEVER committed to git)         │
                                                 └─────────────────────────────┘

              CacheService (CacheService.getUserCache()/getScriptCache()) sits in
              front of BOTH sources — session tokens (6h), per-kelompok master-table
              caches (santri/guru/jadwal_kbm, 300s TTL) — reduces read volume to
              either source, does not change which source is authoritative.
```

**Direct answer to the three original extraction-topology assumptions** (`MAS.md:355`):
1. **Single spreadsheet?** — **Confirmed YES**, structurally (container-bound script, zero `openById` calls to any other sheet anywhere in the code).
2. **Single Firestore project?** — **Confirmed YES in the sense that only one project's credentials exist** (one `FIRESTORE_SERVICE_ACCOUNT_JSON` Script Property referenced everywhere in `Modul_FirestoreBridge.gs`) — but the actual project ID value is intentionally not in this repo (Script Properties, never committed), so this report can confirm the *architecture* uses exactly one Firestore project without being able to name it.
3. **Transport choice?** — **Answered**: Sheets via `SpreadsheetApp` (Apps Script native API, no HTTP), Firestore via hand-rolled REST + JWT service-account auth (`UrlFetchApp`, `Modul_FirestoreBridge.gs`) — not the community `FirestoreApp` library (deliberately avoided per the file's own header comment, for auditability).

**What remains genuinely unconfirmed** (not answerable from the filesystem, needs the user or project-owner access): the actual Spreadsheet ID/URL and the actual Firestore project ID — both exist, both are singular, neither is discoverable without Apps Script editor / GCP console access this audit doesn't have.
