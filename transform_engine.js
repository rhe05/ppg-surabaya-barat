// Transform Engine (prototype) — normalizes and validates extracted_data.json
// before it's loaded into Supabase. Reads extracted_data.json (output of
// extract_engine.js), does NOT touch Sheets/Firestore/network.
//
// Usage: node transform_engine.js

const fs = require('fs');
const path = require('path');

const IN_PATH = path.join(__dirname, 'extracted_data.json');
const OUT_DATA_PATH = path.join(__dirname, 'transformed_data.json');
const OUT_REPORT_PATH = path.join(__dirname, 'transform_report.json');

const KNOWN_ORPHAN_RANGE = { min: 1, max: 70 }; // confirmed orphan santri_id band from extract_engine.js run

function normalizeSantriIds(santri) {
  let normalized = 0;
  const out = santri.map((s) => {
    const id = typeof s.id === 'number' ? s.id : parseInt(s.id, 10);
    if (typeof s.id !== 'number') normalized += 1;
    return { ...s, id };
  });
  return { santri: out, normalized };
}

function normalizeAbsensiSantriIds(absensi) {
  return absensi.map((a) => {
    const santri_id = typeof a.santri_id === 'number' ? a.santri_id : parseInt(a.santri_id, 10);
    return { ...a, santri_id };
  });
}

function dropOrphanedAbsensi(absensi, santriIdSet) {
  const kept = [];
  const dropped = [];
  const nonRangeOrphans = [];
  for (const row of absensi) {
    if (santriIdSet.has(row.santri_id)) {
      kept.push(row);
      continue;
    }
    dropped.push(row);
    const inKnownRange = row.santri_id >= KNOWN_ORPHAN_RANGE.min && row.santri_id <= KNOWN_ORPHAN_RANGE.max;
    if (!inKnownRange) nonRangeOrphans.push(row);
  }
  return { kept, dropped, nonRangeOrphans };
}

function findExactDuplicates(rows) {
  const seen = new Map();
  const dupExamples = [];
  for (const row of rows) {
    const key = JSON.stringify(row);
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  let count = 0;
  for (const [key, n] of seen.entries()) {
    if (n > 1) {
      count += n - 1; // extra copies beyond the first
      if (dupExamples.length < 5) dupExamples.push({ count: n, row: JSON.parse(key) });
    }
  }
  return { count, examples: dupExamples };
}

function main() {
  if (!fs.existsSync(IN_PATH)) {
    console.error(`Missing ${IN_PATH} — run extract_engine.js first.`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(IN_PATH, 'utf8'));

  const warnings = [];
  const tableNames = Object.keys(data).filter((k) => k !== '_meta');

  console.log('Transform Engine (prototype) — starting...\n');

  // 1+2. Normalize santri.id -> number
  const { santri: normalizedSantri, normalized: santriNormalizedCount } = normalizeSantriIds(data.santri);
  console.log(`Normalized santri.id to number for ${santriNormalizedCount}/${normalizedSantri.length} rows.`);

  // 2b. Normalize absensi.santri_id -> number so the FK check is type-safe
  const normalizedAbsensi = normalizeAbsensiSantriIds(data.absensi);

  // 3. Drop known orphaned absensi (santri_id 1-70), but also detect any
  // OTHER orphans (not in 1-70) that shouldn't be silently dropped.
  const santriIdSet = new Set(normalizedSantri.map((s) => s.id));
  const { kept: cleanedAbsensi, dropped: droppedAbsensi, nonRangeOrphans } = dropOrphanedAbsensi(
    normalizedAbsensi,
    santriIdSet
  );
  console.log(`Dropped ${droppedAbsensi.length} orphaned absensi rows (santri_id ${KNOWN_ORPHAN_RANGE.min}-${KNOWN_ORPHAN_RANGE.max} band).`);

  if (nonRangeOrphans.length > 0) {
    warnings.push({
      table: 'absensi',
      type: 'unexpected_orphan_santri_id',
      count: nonRangeOrphans.length,
      examples: nonRangeOrphans.slice(0, 5).map((r) => ({ id: r.id, santri_id: r.santri_id })),
    });
    console.log(`⚠ ${nonRangeOrphans.length} orphaned absensi row(s) reference santri_id OUTSIDE the known 1-${KNOWN_ORPHAN_RANGE.max} band — not part of the previously identified pattern, flagged for review.`);
  }

  // 4a. Exact row duplicates per table (checked on the transformed/cleaned rows)
  const transformed = { ...data, santri: normalizedSantri, absensi: cleanedAbsensi };
  let duplicatesFound = 0;
  for (const table of tableNames) {
    const rows = transformed[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const { count, examples } = findExactDuplicates(rows);
    if (count > 0) {
      duplicatesFound += count;
      warnings.push({ table, type: 'exact_duplicate_rows', count, examples });
      console.log(`⚠ ${table}: ${count} exact duplicate row(s) found.`);
    }
  }

  // 4b. Kelp Petemon santri ID range (kelompok.id === "1")
  const kelpPetemonSantri = normalizedSantri.filter((s) => String(s.kelompok_id) === '1');
  let kelpPetemonRange = { min: null, max: null, count: 0 };
  let kelpPetemonStatus = 'OK';
  if (kelpPetemonSantri.length > 0) {
    const ids = kelpPetemonSantri.map((s) => s.id);
    kelpPetemonRange = { min: Math.min(...ids), max: Math.max(...ids), count: ids.length };
    console.log(`Kelp Petemon santri: ${kelpPetemonRange.count} rows, id range ${kelpPetemonRange.min}-${kelpPetemonRange.max}.`);
  } else {
    kelpPetemonStatus = 'REVIEW_NEEDED';
    warnings.push({ table: 'santri', type: 'kelp_petemon_no_rows', count: 0, examples: [] });
    console.log('⚠ No santri rows found for Kelp Petemon (kelompok_id "1") — REVIEW_NEEDED.');
  }
  // Sanity check: Kelp Petemon is Firestore-routed, so IDs should NOT fall in
  // the 1-70 orphan band (that band belongs to deleted/legacy santri).
  if (kelpPetemonSantri.some((s) => s.id >= KNOWN_ORPHAN_RANGE.min && s.id <= KNOWN_ORPHAN_RANGE.max)) {
    kelpPetemonStatus = 'REVIEW_NEEDED';
    warnings.push({
      table: 'santri',
      type: 'kelp_petemon_id_in_orphan_band',
      count: kelpPetemonSantri.filter((s) => s.id >= KNOWN_ORPHAN_RANGE.min && s.id <= KNOWN_ORPHAN_RANGE.max).length,
      examples: [],
    });
    console.log('⚠ Kelp Petemon has santri id(s) inside the 1-70 orphan band — REVIEW_NEEDED.');
  }

  // 4c. absensi rows without a valid santri, restricted to NOT-1-70 (i.e. the
  // nonRangeOrphans computed above) — already captured as a warning.

  const status = warnings.length === 0 ? 'COMPLETE' : (nonRangeOrphans.length > 0 || kelpPetemonStatus === 'REVIEW_NEEDED' ? 'ERRORS' : 'WARNINGS');

  const report = {
    status,
    summary: {
      tables_processed: tableNames.length,
      orphaned_absensi_dropped: droppedAbsensi.length,
      santri_normalized: santriNormalizedCount,
      duplicates_found: duplicatesFound,
      kelp_petemon_id_range: kelpPetemonRange,
    },
    warnings,
    kelp_petemon_status: kelpPetemonStatus,
  };

  fs.writeFileSync(OUT_DATA_PATH, JSON.stringify(transformed, null, 2));
  fs.writeFileSync(OUT_REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(`\nOutput written to ${OUT_DATA_PATH}`);
  console.log(`Report written to ${OUT_REPORT_PATH}`);
  console.log(`\nStatus: ${status}`);

  if (status === 'ERRORS') process.exit(1);
}

main();
