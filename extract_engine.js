/**
 * extract_engine.js — Ruang Ngaji → Supabase migration, Extract prototype.
 *
 * ⚠️ SCOPE NOTE: this is a standalone validation prototype, NOT the approved
 * Migration 004 Extract Engine. The frozen architecture (docs/architecture/
 * Task01_Architecture.md) specifies a 17-folder TypeScript structure at
 * 08_Development/tpq-app/migration-004/exporters/, with immutable run-keyed
 * snapshots (snapshots/run-<id>/...), a pipeline-manifest.json state machine,
 * and separate config/contracts/state folders — this single-file script does
 * none of that. Its purpose is narrow: prove the routing logic in
 * DATA_AUTHORITY_ANALYSIS.md actually produces correct output against real
 * data (right counts, no orphans, no cross-source duplicates) before that
 * logic gets ported into the real Extract Engine per Task01_ExtractEngine_PRD.md.
 *
 * Routing logic mirrors 13_AppsScript/Modul_Utilities.gs's
 * FIRESTORE_KELOMPOK_TABLES_ + readSheetAsObjects() merge behavior EXACTLY —
 * if that constant changes in the Apps Script source, update
 * ROUTING.hybridFirestoreKelompok below to match, or this script's output
 * will silently diverge from the live app's actual data split.
 *
 * Setup:
 *   1. npm install googleapis firebase-admin dotenv
 *   2. Copy .env.example to .env, fill in real values (see comments there)
 *   3. node extract_engine.js
 *   4. Output: extracted_data.json (+ a summary printed to stdout)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const admin = require('firebase-admin');

// ─────────────────────────────────────────────────────────────────────────
// Routing table — mirrors Modul_Utilities.gs FIRESTORE_KELOMPOK_TABLES_ and
// the Firestore-only tables (jurnal_kbm/kop_surat, never had a Sheets form).
// Keep this block in sync with the Apps Script source by hand — there is no
// automated check that these two lists agree.
// ─────────────────────────────────────────────────────────────────────────
const ROUTING = {
  // entity -> array of kelompok_id strings that are Firestore-authoritative
  // for that entity. Every kelompok NOT listed here is Sheets-authoritative
  // for that entity.
  hybridFirestoreKelompok: {
    santri: ['1'],
    guru: ['1'],
    jadwal_kbm: ['1'],
    jadwal_kategori_hari: ['1'],
    absensi: ['1'],
  },
  // entities with NO Sheets equivalent at all — Firestore is the only
  // source, for every kelompok that has documents under it.
  firestoreOnly: ['jurnal_kbm'],
  // entities extracted straight from Sheets, all kelompok, no branching.
  // NOTE: kurikulum_* + kelompok/ppg/desa/users are NOT in MAS.md's approved
  // in-scope entity list (docs/architecture/MAS.md §1) — this request asked
  // to extract them anyway (per "Progress + Kurikulum" in the issue). Flagged
  // here, not silently expanded without comment.
  sheetsOnly: [
    'ppg', 'desa', 'kelompok', 'users',
    'kurikulum_prota', 'kurikulum_promes', 'kurikulum_probul', 'kurikulum_pencapaian_santri',
  ],
};

// Reference counts from DATA_AUTHORITY_ANALYSIS.md / prior audit — soft
// checks only (a warning, not a hard failure), since these are a point-in-
// time snapshot from a prior session, not a live invariant.
const REFERENCE_COUNTS = {
  santri: 199,
  absensi: 890, // valid rows only — the known 483 orphaned rows are EXCLUDED
  // from this reference number on purpose; see validateOrphanedAbsensi().
};

// ─────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in ` +
      `(see extract_engine.js header comment for where each value comes from).`
    );
  }
  return v;
}

async function initSheetsClient() {
  const keyPath = requireEnv('GOOGLE_SERVICE_ACCOUNT_KEY_PATH');
  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

function initFirestoreClient() {
  const keyPath = requireEnv('GOOGLE_SERVICE_ACCOUNT_KEY_PATH');
  const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIRESTORE_PROJECT_ID || serviceAccount.project_id,
  });
  return admin.firestore();
}

// ─────────────────────────────────────────────────────────────────────────
// Sheets read — mirrors Modul_Utilities.gs readSheetRowsRaw_(): first row is
// headers, every subsequent row becomes {header: value, ...}. Blank trailing
// cells (row shorter than header row) are treated as ''.
// ─────────────────────────────────────────────────────────────────────────

async function readSheetTab(sheetsClient, spreadsheetId, sheetName) {
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName, // whole-sheet range, matches Apps Script getDataRange()
  });
  const values = res.data.values || [];
  if (values.length === 0) return [];
  const headers = values[0];
  return values.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
    return obj;
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Firestore read — mirrors firestoreListCollection_(): every document in
// 'kelompok/{kelompokId}/{tableName}', flat fields, id = document ID.
// ─────────────────────────────────────────────────────────────────────────

async function readFirestoreCollection(db, kelompokId, tableName) {
  const snap = await db.collection(`kelompok/${kelompokId}/${tableName}`).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function readFirestoreCollectionAllKelompok(db, kelompokIds, tableName) {
  let rows = [];
  for (const kelompokId of kelompokIds) {
    const chunk = await readFirestoreCollection(db, kelompokId, tableName);
    rows = rows.concat(chunk.map((r) => ({ ...r, kelompok_id: kelompokId })));
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────
// Per-entity extraction
// ─────────────────────────────────────────────────────────────────────────

async function extractSheetsOnly(sheetsClient, spreadsheetId, tableName) {
  return readSheetTab(sheetsClient, spreadsheetId, tableName);
}

/**
 * Hybrid entity (santri/guru/jadwal_kbm/jadwal_kategori_hari): Sheets rows
 * for every kelompok EXCEPT the Firestore-authoritative ones (mirrors
 * Modul_Utilities.gs:206-208's exclusion filter — those Sheets rows are a
 * frozen post-migration snapshot, reading them would duplicate the
 * Firestore-side data), unioned with Firestore rows for the
 * Firestore-authoritative kelompok.
 */
async function extractHybridEntity(sheetsClient, db, spreadsheetId, tableName) {
  const firestoreKelompokIds = ROUTING.hybridFirestoreKelompok[tableName] || [];
  const sheetRowsRaw = await readSheetTab(sheetsClient, spreadsheetId, tableName);
  const sheetRows = sheetRowsRaw
    .filter((r) => !firestoreKelompokIds.includes(String(r.kelompok_id)))
    .map((r) => ({ ...r, _source: 'sheets' }));

  let firestoreRows = [];
  for (const kelompokId of firestoreKelompokIds) {
    const rows = await readFirestoreCollection(db, kelompokId, tableName);
    firestoreRows = firestoreRows.concat(
      rows.map((r) => ({ ...r, kelompok_id: kelompokId, _source: 'firestore' }))
    );
  }
  return sheetRows.concat(firestoreRows);
}

/**
 * Absensi — same hybrid pattern, but the table has no kelompok_id column of
 * its own; kelompok membership is resolved via santri_id -> santri.kelompok_id.
 * Requires the already-extracted santri list (both sources) to build that map.
 * Mirrors Modul_Utilities.gs:198-206.
 */
async function extractAbsensi(sheetsClient, db, spreadsheetId, santriRows) {
  const firestoreKelompokIds = ROUTING.hybridFirestoreKelompok.absensi || [];
  const santriKelompokMap = {};
  santriRows.forEach((s) => { santriKelompokMap[String(s.id)] = String(s.kelompok_id); });

  const sheetRowsRaw = await readSheetTab(sheetsClient, spreadsheetId, 'absensi');
  const sheetRows = sheetRowsRaw
    .filter((r) => !firestoreKelompokIds.includes(santriKelompokMap[String(r.santri_id)]))
    .map((r) => ({ ...r, _source: 'sheets' }));

  let firestoreRows = [];
  for (const kelompokId of firestoreKelompokIds) {
    const rows = await readFirestoreCollection(db, kelompokId, 'absensi');
    firestoreRows = firestoreRows.concat(rows.map((r) => ({ ...r, _source: 'firestore' })));
  }
  return sheetRows.concat(firestoreRows);
}

/**
 * Firestore-only entity (jurnal_kbm) — no Sheets side exists at all. Reads
 * every kelompok's subcollection; kelompok with zero documents just
 * contribute an empty array (cheap — Firestore doesn't charge for an empty
 * collection read the same as a populated one, but this DOES mean 1 read
 * call per kelompok regardless of whether it has data, which is the correct
 * tradeoff here since there's no cheaper way to discover "which kelompok
 * have jurnal_kbm docs" without reading first).
 */
async function extractFirestoreOnly(db, kelompokIds, tableName) {
  return readFirestoreCollectionAllKelompok(db, kelompokIds, tableName);
}

// ─────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────

function validateNoNullPKs(rows, entityName, pkField = 'id') {
  const bad = rows.filter((r) => r[pkField] === undefined || r[pkField] === null || String(r[pkField]).trim() === '');
  return {
    check: `${entityName}: no null/blank ${pkField}`,
    pass: bad.length === 0,
    detail: bad.length === 0 ? `all ${rows.length} rows have a ${pkField}` : `${bad.length} row(s) missing ${pkField}`,
  };
}

function validateNoOrphanedFKs(childRows, fkField, parentRows, parentEntityName, entityName, parentPkField = 'id') {
  const parentIds = new Set(parentRows.map((r) => String(r[parentPkField])));
  const orphans = childRows.filter((r) => {
    const fk = r[fkField];
    if (fk === undefined || fk === null || String(fk).trim() === '') return false; // nullable FK, not an orphan
    return !parentIds.has(String(fk));
  });
  return {
    check: `${entityName}.${fkField} -> ${parentEntityName}.${parentPkField} (no orphans)`,
    pass: orphans.length === 0,
    detail: orphans.length === 0
      ? `all ${fkField} values resolve to an existing ${parentEntityName} row`
      : `${orphans.length} orphaned row(s), e.g. ${fkField}=${orphans[0][fkField]} (id=${orphans[0].id})`,
  };
}

function validateCrossSourceDuplicates(rows, entityName) {
  // For hybrid entities: no id should appear from BOTH _source='sheets' and
  // _source='firestore' — that would mean the Sheets-side exclusion filter
  // failed to exclude a Firestore-migrated kelompok's frozen rows.
  const bySource = {};
  rows.forEach((r) => {
    if (!r._source) return;
    bySource[r.id] = bySource[r.id] || new Set();
    bySource[r.id].add(r._source);
  });
  const dupIds = Object.keys(bySource).filter((id) => bySource[id].size > 1);
  return {
    check: `${entityName}: no id present in both Sheets and Firestore output`,
    pass: dupIds.length === 0,
    detail: dupIds.length === 0 ? 'no cross-source duplicates' : `${dupIds.length} id(s) duplicated, e.g. id=${dupIds[0]}`,
  };
}

function validateReferenceCount(rows, entityName, expected) {
  if (expected === undefined) return null;
  return {
    check: `${entityName}: count matches prior reference (${expected})`,
    pass: rows.length === expected,
    detail: `extracted ${rows.length}, reference was ${expected} (soft check — reference is a point-in-time number from a prior audit, not a live invariant; a mismatch is expected if data changed since)`,
    severity: 'warning',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Extract Engine (prototype) — starting...\n');

  const sheetsClient = await initSheetsClient();
  const db = initFirestoreClient();
  const spreadsheetId = requireEnv('SPREADSHEET_ID');

  const data = {};
  const checks = [];

  // 1. Core hierarchy + Sheets-only entities (ppg/desa/kelompok/users first —
  //    needed as FK parents for validation below).
  for (const table of ROUTING.sheetsOnly) {
    console.log(`Reading (Sheets-only): ${table}...`);
    data[table] = await extractSheetsOnly(sheetsClient, spreadsheetId, table);
  }

  // 2. Hybrid entities — santri/guru first (jadwal_kbm/jadwal_kategori_hari
  //    don't depend on santri, but absensi below needs santri's map).
  for (const table of ['santri', 'guru', 'jadwal_kbm', 'jadwal_kategori_hari']) {
    console.log(`Reading (hybrid): ${table}...`);
    data[table] = await extractHybridEntity(sheetsClient, db, spreadsheetId, table);
  }

  // 3. Absensi — special join-based routing, needs data.santri.
  console.log('Reading (hybrid, join-routed): absensi...');
  data.absensi = await extractAbsensi(sheetsClient, db, spreadsheetId, data.santri);

  // 4. Firestore-only entities — needs the full kelompok id list.
  const allKelompokIds = data.kelompok.map((k) => String(k.id));
  for (const table of ROUTING.firestoreOnly) {
    console.log(`Reading (Firestore-only, all kelompok): ${table}...`);
    data[table] = await extractFirestoreOnly(db, allKelompokIds, table);
  }

  // ── Validation ──
  checks.push(validateNoNullPKs(data.santri, 'santri'));
  checks.push(validateNoNullPKs(data.guru, 'guru'));
  checks.push(validateNoNullPKs(data.absensi, 'absensi'));
  checks.push(validateNoNullPKs(data.kelompok, 'kelompok'));

  checks.push(validateNoOrphanedFKs(data.santri, 'kelompok_id', data.kelompok, 'kelompok', 'santri'));
  checks.push(validateNoOrphanedFKs(data.guru, 'kelompok_id', data.kelompok, 'kelompok', 'guru'));
  checks.push(validateNoOrphanedFKs(data.absensi, 'santri_id', data.santri, 'santri', 'absensi'));
  checks.push(validateNoOrphanedFKs(data.kurikulum_promes, 'prota_id', data.kurikulum_prota, 'kurikulum_prota', 'kurikulum_promes'));
  checks.push(validateNoOrphanedFKs(data.kurikulum_probul, 'promes_id', data.kurikulum_promes, 'kurikulum_promes', 'kurikulum_probul'));
  checks.push(validateNoOrphanedFKs(data.kurikulum_pencapaian_santri, 'santri_id', data.santri, 'santri', 'kurikulum_pencapaian_santri'));

  checks.push(validateCrossSourceDuplicates(data.santri, 'santri'));
  checks.push(validateCrossSourceDuplicates(data.guru, 'guru'));
  checks.push(validateCrossSourceDuplicates(data.absensi, 'absensi'));

  const refSantri = validateReferenceCount(data.santri, 'santri', REFERENCE_COUNTS.santri);
  if (refSantri) checks.push(refSantri);
  const absensiValidCount = data.absensi.filter((r) => {
    // "valid" per DATA_AUTHORITY_ANALYSIS.md = resolves to an existing santri
    const santriIds = new Set(data.santri.map((s) => String(s.id)));
    return santriIds.has(String(r.santri_id));
  }).length;
  const refAbsensi = validateReferenceCount(
    { length: absensiValidCount },
    'absensi (valid only)',
    REFERENCE_COUNTS.absensi
  );
  if (refAbsensi) checks.push(refAbsensi);

  const hardFailures = checks.filter((c) => c.pass === false && c.severity !== 'warning');
  const warnings = checks.filter((c) => c.pass === false && c.severity === 'warning');

  const output = {
    _meta: {
      extractedAt: new Date().toISOString(),
      routing: ROUTING,
      counts: Object.fromEntries(Object.keys(data).map((k) => [k, data[k].length])),
      validation: checks,
      hardFailureCount: hardFailures.length,
      warningCount: warnings.length,
    },
    ...data,
  };

  const outPath = path.join(__dirname, 'extracted_data.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log('\n─── Validation summary ───');
  checks.forEach((c) => {
    const icon = c.pass ? '✓' : (c.severity === 'warning' ? '⚠' : '✗');
    console.log(`${icon} ${c.check} — ${c.detail}`);
  });
  console.log(`\nOutput written to ${outPath}`);
  console.log(`Row counts: ${JSON.stringify(output._meta.counts, null, 2)}`);

  if (hardFailures.length > 0) {
    console.error(`\n${hardFailures.length} hard validation failure(s) — see above. Exiting with code 1.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Extract failed:', err);
  process.exitCode = 1;
});
