// Second retry pass — the first pass (retry_absensi.js) inserted 67/170 via
// auto-generated id, then hit "duplicate key value violates unique
// constraint absensi_pkey" for the remaining 103: absensi.id allows
// explicit override (unlike ppg), so the earlier explicit-id inserts never
// advanced the identity sequence, causing new auto-ids to collide with
// existing ones. Fix: assign explicit unused ids (current max + N) instead
// of relying on auto-generate. Confirmed via count query these 103 rows are
// NOT yet in the table (count=847=780+67, not 950), so this is safe — no
// risk of re-inserting the 67 that already succeeded.
require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const data = JSON.parse(fs.readFileSync('./transformed_data.json', 'utf8'));
const report = JSON.parse(fs.readFileSync('./load_report.json', 'utf8'));

const orderedFailedIndexes = report.errors
  .filter((e) => e.table === 'absensi')
  .map((e) => e.row_index);

async function main() {
  const { data: maxRow } = await supabase
    .from('absensi')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);
  let nextId = maxRow[0].id + 1;

  const { count: before } = await supabase
    .from('absensi')
    .select('*', { count: 'exact', head: true });
  // pass1 (retry_absensi.js) inserted the first 67 of the 170 originally-
  // failed rows (in report.errors order) before hitting id collisions —
  // skip those, retry only the remaining ones.
  const toRetry = orderedFailedIndexes.slice(67);
  console.log(`Retrying ${toRetry.length} row(s), starting id=${nextId}, current count=${before}`);

  let inserted = 0;
  const errors = [];
  for (const idx of toRetry) {
    const { _source, ...row } = data.absensi[idx];
    row.id = nextId++;
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
  console.log(`Inserted: ${inserted}/${toRetry.length}`);
  if (errors.length) {
    console.log(`Remaining errors: ${errors.length}`);
    console.log(JSON.stringify(errors.slice(0, 10), null, 2));
  }
  const { count: after } = await supabase
    .from('absensi')
    .select('*', { count: 'exact', head: true });
  console.log(`absensi count now: ${after}`);
}

main().catch((e) => console.error('fatal', e));
