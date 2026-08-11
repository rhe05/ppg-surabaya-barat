// One-off retry for the 170 absensi rows that failed on the first pass
// (composite-string Firestore ids incompatible with bigint id) — see
// load_engine.js's absensi id-handling fix. Does NOT touch the 780 rows
// already inserted successfully.
require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const data = JSON.parse(fs.readFileSync('./transformed_data.json', 'utf8'));
const report = JSON.parse(fs.readFileSync('./load_report.json', 'utf8'));

const failedIndexes = new Set(
  report.errors.filter((e) => e.table === 'absensi').map((e) => e.row_index)
);

async function main() {
  console.log(`Retrying ${failedIndexes.size} failed absensi row(s)...`);
  let inserted = 0;
  const errors = [];
  for (const idx of failedIndexes) {
    const { _source, ...row } = data.absensi[idx];
    if (typeof row.id === 'string' && !/^\d+$/.test(row.id)) delete row.id;
    for (const key of Object.keys(row)) {
      if (row[key] === '') delete row[key];
    }
    delete row.dicatat_oleh;
    const { error } = await supabase.from('absensi').insert(row);
    if (error) {
      errors.push({ row_index: idx, error_message: error.message });
    } else {
      inserted += 1;
    }
  }
  console.log(`Inserted: ${inserted}/${failedIndexes.size}`);
  if (errors.length) {
    console.log(`Remaining errors: ${errors.length}`);
    console.log(JSON.stringify(errors.slice(0, 10), null, 2));
  }
}

main().catch((e) => console.error('fatal', e));
