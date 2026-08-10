// Load Engine (prototype) — inserts transformed_data.json into Supabase.
// Reads transformed_data.json (output of transform_engine.js). Requires
// SUPABASE_URL + SUPABASE_KEY in .env and @supabase/supabase-js installed.
//
// Usage: node load_engine.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const IN_PATH = path.join(__dirname, 'transformed_data.json');
const OUT_REPORT_PATH = path.join(__dirname, 'load_report.json');

// Dependency order. `users` is intentionally excluded — Supabase has no
// `users` table, only `profiles` (uuid-keyed, tied to Supabase Auth, no
// password_hash/username columns) which needs a separate Auth-signup based
// migration, not a plain INSERT. See schema_mapping_report.json.
//
// NOTE: also deviates from the most recently specced Tier 1/Tier 2 split —
// that spec put `jadwal_kategori_hari` and `kurikulum_prota` in "Tier 1 (no
// FK)" before `kelompok`, but both have a `kelompok_id` FK into `kelompok`
// (confirmed via inspect_schema_mapping.js / check_supabase_schema.js), so
// they're ordered after `kelompok` here to avoid FK violations.
const LOAD_ORDER = [
  'ppg',
  'desa',
  'kelompok',
  'jadwal_kategori_hari',
  'kurikulum_prota',
  'kurikulum_promes',
  'kurikulum_probul',
  'guru',
  'santri',
  'jadwal_kbm',
  'absensi',
  'jurnal_kbm',
  'kurikulum_pencapaian_santri',
];

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required env var ${name}. Add it to .env before running load_engine.js.`
    );
  }
  return v;
}

function stripInternal(row) {
  const { _source, ...rest } = row;
  return rest;
}

async function loadTable(supabase, table, rows) {
  const result = { rows_attempted: rows.length, rows_inserted: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = stripInternal(rows[i]);
    const { error } = await supabase.from(table).insert(row);
    if (error) {
      result.errors.push({ table, row_index: i, error_message: error.message });
    } else {
      result.rows_inserted += 1;
    }
  }
  return result;
}

async function main() {
  if (!fs.existsSync(IN_PATH)) {
    console.error(`Missing ${IN_PATH} — run transform_engine.js first.`);
    process.exit(1);
  }

  let createClient;
  try {
    ({ createClient } = require('@supabase/supabase-js'));
  } catch (e) {
    console.error(
      'Missing dependency @supabase/supabase-js. Install it first:\n  npm install @supabase/supabase-js'
    );
    process.exit(1);
  }

  let supabaseUrl, supabaseKey;
  try {
    supabaseUrl = requireEnv('SUPABASE_URL');
    supabaseKey = requireEnv('SUPABASE_KEY');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const data = JSON.parse(fs.readFileSync(IN_PATH, 'utf8'));

  console.log('Load Engine (prototype) — starting...\n');
  console.log(`Load order: ${LOAD_ORDER.join(' -> ')}\n`);

  const tablesLoaded = {};
  const allErrors = [];
  let totalAttempted = 0;
  let totalInserted = 0;
  let tablesSuccess = 0;
  let tablesFailed = 0;

  for (const table of LOAD_ORDER) {
    const rows = data[table] || [];
    if (rows.length === 0) {
      tablesLoaded[table] = { rows_attempted: 0, rows_inserted: 0, errors: 0 };
      tablesSuccess += 1;
      console.log(`${table}: 0 rows (skipped, empty).`);
      continue;
    }
    console.log(`Loading ${table}: ${rows.length} row(s)...`);
    const result = await loadTable(supabase, table, rows);
    tablesLoaded[table] = {
      rows_attempted: result.rows_attempted,
      rows_inserted: result.rows_inserted,
      errors: result.errors.length,
    };
    totalAttempted += result.rows_attempted;
    totalInserted += result.rows_inserted;
    allErrors.push(...result.errors);
    if (result.errors.length === 0) {
      tablesSuccess += 1;
      console.log(`  ✓ ${result.rows_inserted}/${result.rows_attempted} inserted.`);
    } else {
      tablesFailed += 1;
      console.log(`  ✗ ${result.rows_inserted}/${result.rows_attempted} inserted, ${result.errors.length} error(s).`);
    }
  }

  const status =
    tablesFailed === 0 ? 'SUCCESS' : totalInserted > 0 ? 'PARTIAL' : 'FAILED';

  const report = {
    status,
    tables_loaded: tablesLoaded,
    summary: {
      total_rows_attempted: totalAttempted,
      total_rows_inserted: totalInserted,
      tables_success: tablesSuccess,
      tables_failed: tablesFailed,
    },
    errors: allErrors,
  };

  fs.writeFileSync(OUT_REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${OUT_REPORT_PATH}`);
  console.log(`Status: ${status}`);

  if (status === 'FAILED') process.exit(1);
}

main().catch((err) => {
  console.error('Load failed:', err);
  process.exit(1);
});
