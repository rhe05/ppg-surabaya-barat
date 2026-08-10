// Inspect Column Mismatch (prototype) — compares Supabase's actual columns
// for the 5 tables that failed to load against the shape of the
// corresponding tables in transformed_data.json. Read-only.
//
// Usage: node inspect_column_mismatch.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'transformed_data.json');
const OUT_PATH = path.join(__dirname, 'column_mismatch_report.json');

const TABLES = ['kurikulum_prota', 'kurikulum_promes', 'kurikulum_probul', 'santri', 'jadwal_kategori_hari'];

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}. Add it to .env.`);
  return v;
}

// Very loose heuristic: normalize (strip underscores/vowels-insensitive) and
// look for exact or substring matches. Anything below that confidence is
// left unmapped rather than guessed.
function normalize(s) {
  return s.toLowerCase().replace(/[_\s]/g, '');
}

function suggestMapping(dataCol, supabaseCols) {
  const nDataCol = normalize(dataCol);
  const exact = supabaseCols.find((c) => normalize(c) === nDataCol);
  if (exact) return { target: exact, confidence: 'exact' };
  const substr = supabaseCols.find(
    (c) => normalize(c).includes(nDataCol) || nDataCol.includes(normalize(c))
  );
  if (substr) return { target: substr, confidence: 'fuzzy (substring match, verify manually)' };
  return { target: null, confidence: 'no match found' };
}

async function getColumns(supabase, tableName) {
  const { data, error } = await supabase.rpc('pg_table_columns', { p_table_name: tableName });
  if (error) throw error;
  return (data || []).map((r) => ({ name: r.column_name, type: r.data_type }));
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

  console.log('Inspect Column Mismatch (prototype) — starting...\n');

  const report = {};

  for (const table of TABLES) {
    console.log(`--- ${table} ---`);
    let supabaseColumns = [];
    try {
      supabaseColumns = await getColumns(supabase, table);
    } catch (e) {
      console.log(`⚠ Could not read columns: ${e.message}`);
    }
    const supabaseColNames = supabaseColumns.map((c) => c.name);

    const sampleRow = (data[table] && data[table][0]) || null;
    const transformedColNames = sampleRow ? Object.keys(sampleRow).filter((k) => k !== '_source') : [];

    const inSupabaseNotInData = supabaseColNames.filter((c) => !transformedColNames.includes(c));
    const inDataNotInSupabase = transformedColNames.filter((c) => !supabaseColNames.includes(c));

    const mismatches = [];
    for (const col of inDataNotInSupabase) {
      const { target, confidence } = suggestMapping(col, inSupabaseNotInData);
      mismatches.push({
        source_col: col,
        target_col_or_missing: target || 'MISSING (no matching Supabase column)',
        action: target ? `rename ${col} -> ${target} (${confidence})` : 'needs manual decision — drop, or add column to Supabase',
      });
    }
    for (const col of inSupabaseNotInData) {
      const alreadyMapped = mismatches.some((m) => m.target_col_or_missing === col);
      if (!alreadyMapped) {
        mismatches.push({
          source_col: null,
          target_col_or_missing: col,
          action: `Supabase column with no data source — will stay null/default on insert`,
        });
      }
    }

    report[table] = {
      supabase_columns: supabaseColumns,
      transformed_data_columns: transformedColNames,
      mismatches,
    };

    console.log(`  Supabase columns (${supabaseColNames.length}): ${supabaseColNames.join(', ') || '(none / error)'}`);
    console.log(`  transformed_data columns (${transformedColNames.length}): ${transformedColNames.join(', ')}`);
    console.log(`  Mismatches: ${mismatches.length}`);
    mismatches.forEach((m) => console.log(`    - ${m.source_col || '(none)'} -> ${m.target_col_or_missing}: ${m.action}`));
    console.log('');
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(`Output written to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
