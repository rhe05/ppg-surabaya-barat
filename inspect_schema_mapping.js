// Inspect Schema Mapping (prototype) — compares Supabase's actual schema
// for `profiles` / `jadwal_kategori_hari` (and existence of `jadwal_kbm`)
// against the shape of `users` / `jadwal_kbm` in transformed_data.json, to
// inform manual mapping decisions before load_engine.js runs.
//
// Usage: node inspect_schema_mapping.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'transformed_data.json');
const TABLES_LIST_PATH = path.join(__dirname, 'supabase_tables.txt');
const OUT_PATH = path.join(__dirname, 'schema_mapping_report.json');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}. Add it to .env.`);
  return v;
}

async function getColumns(supabase, tableName) {
  const { data, error } = await supabase.rpc('pg_table_columns', { p_table_name: tableName });
  if (error) throw error;
  return (data || []).map((r) => ({ name: r.column_name, type: r.data_type }));
}

function inferColumns(row) {
  if (!row) return [];
  return Object.entries(row).map(([name, value]) => ({
    name,
    type: value === null ? 'unknown (null sample)' : typeof value,
  }));
}

async function main() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`Missing ${DATA_PATH} — run transform_engine.js first.`);
    process.exit(1);
  }

  let createClient;
  try {
    ({ createClient } = require('@supabase/supabase-js'));
  } catch (e) {
    console.error('Missing dependency @supabase/supabase-js. Install it first:\n  npm install @supabase/supabase-js');
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
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

  console.log('Inspect Schema Mapping (prototype) — starting...\n');

  // jadwal_kbm existence: reuse the known table list from check_supabase_schema.js
  // if present, otherwise ask Supabase directly.
  let knownTables = null;
  if (fs.existsSync(TABLES_LIST_PATH)) {
    knownTables = fs.readFileSync(TABLES_LIST_PATH, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  } else {
    const { data: tables, error } = await supabase.rpc('pg_list_public_tables');
    if (error) {
      console.error('Could not list tables (and no cached supabase_tables.txt found):', error.message);
      process.exit(1);
    }
    knownTables = tables.map((r) => r.table_name);
  }
  const jadwalKbmExists = knownTables.includes('jadwal_kbm');
  console.log(`jadwal_kbm exists in Supabase: ${jadwalKbmExists}`);

  // profiles columns
  let profilesColumns = [];
  let profilesRpcError = null;
  try {
    profilesColumns = await getColumns(supabase, 'profiles');
    console.log(`profiles: ${profilesColumns.length} column(s) found via information_schema.`);
  } catch (e) {
    profilesRpcError = e.message;
    console.log(`⚠ Could not read profiles columns: ${e.message}`);
  }

  // profiles row sample (best-effort; RLS/service role dependent)
  let profilesRowSample = null;
  const { data: profilesRows, error: profilesSelectErr } = await supabase.from('profiles').select('*').limit(1);
  if (!profilesSelectErr && profilesRows && profilesRows.length > 0) {
    profilesRowSample = profilesRows[0];
  } else if (profilesSelectErr) {
    console.log(`⚠ Could not select from profiles: ${profilesSelectErr.message}`);
  } else {
    console.log('profiles: table is empty, no row sample.');
  }

  // jadwal_kategori_hari columns
  let jkhColumns = [];
  try {
    jkhColumns = await getColumns(supabase, 'jadwal_kategori_hari');
    console.log(`jadwal_kategori_hari: ${jkhColumns.length} column(s) found via information_schema.`);
  } catch (e) {
    console.log(`⚠ Could not read jadwal_kategori_hari columns: ${e.message}`);
  }

  // jadwal_kbm columns (only if it exists)
  let jadwalKbmColumns = null;
  if (jadwalKbmExists) {
    try {
      jadwalKbmColumns = await getColumns(supabase, 'jadwal_kbm');
    } catch (e) {
      console.log(`⚠ Could not read jadwal_kbm columns: ${e.message}`);
    }
  }

  // Local data-side shapes
  const usersRowSample = (data.users && data.users[0]) || null;
  const jadwalKbmRowSample = (data.jadwal_kbm && data.jadwal_kbm[0]) || null;

  const report = {
    profiles: {
      columns: profilesColumns,
      row_sample: profilesRowSample,
    },
    users_in_transformed: {
      columns: inferColumns(usersRowSample),
      row_sample: usersRowSample,
    },
    jadwal_kategori_hari: {
      columns: jkhColumns,
    },
    jadwal_kbm: {
      exists_in_supabase: jadwalKbmExists,
      columns: jadwalKbmColumns,
      row_sample: jadwalKbmRowSample,
    },
    mapping_decisions_needed: [
      'users → profiles: compatible or skip?',
      'jadwal_kbm: load to new table or skip?',
    ],
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nOutput written to ${OUT_PATH}`);
  console.log('\n=== SUMMARY ===');
  console.log('profiles columns:', profilesColumns.map((c) => `${c.name}:${c.type}`).join(', ') || '(none / error)');
  console.log('users_in_transformed columns:', inferColumns(usersRowSample).map((c) => `${c.name}:${c.type}`).join(', '));
  console.log('jadwal_kategori_hari columns:', jkhColumns.map((c) => `${c.name}:${c.type}`).join(', ') || '(none / error)');
  console.log('jadwal_kbm exists in Supabase:', jadwalKbmExists);
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
