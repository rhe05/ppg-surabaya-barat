// Generates a CREATE TABLE statement for jadwal_kbm based on the actual
// shape of jadwal_kbm rows in transformed_data.json (8 rows, Kelp Petemon
// only, Firestore-sourced). Read-only — does not touch Supabase.
//
// Usage: node generate_jadwal_kbm_ddl.js

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'transformed_data.json');
const OUT_PATH = path.join(__dirname, 'jadwal_kbm_create_table.sql');

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const rows = data.jadwal_kbm;

console.log(`Inspecting jadwal_kbm: ${rows.length} row(s).\n`);
console.log('Sample rows (first 3):');
console.log(JSON.stringify(rows.slice(0, 3), null, 2));

// dibuat_oleh is 0 on every single row (8/8) — not a valid FK to any user/
// profile id space (ids start at 1, profiles.id is uuid). Flagging instead
// of silently adding a FK constraint that would never resolve.
const dibuatOlehValues = [...new Set(rows.map((r) => r.dibuat_oleh))];
console.log(`\ndibuat_oleh distinct values across all rows: ${JSON.stringify(dibuatOlehValues)}`);
if (dibuatOlehValues.length === 1 && dibuatOlehValues[0] === 0) {
  console.log('⚠ dibuat_oleh is always 0 — not a real FK, looks like an unset/default placeholder. No FK constraint added for this column.');
}

const sql = `-- Generated from transformed_data.json (jadwal_kbm, ${rows.length} rows, Kelp Petemon only).
-- dibuat_oleh is NOT given a FK constraint: all ${rows.length}/${rows.length} rows have
-- dibuat_oleh = 0, which doesn't resolve to any user/profile id — looks like
-- an unset placeholder in the source data, not a real reference.
create table public.jadwal_kbm (
  id bigint primary key,
  kelompok_id bigint not null references public.kelompok(id),
  hari text,
  keterangan text,
  dibuat_oleh bigint,
  dibuat_pada date,
  tanggal date,
  ruangan text,
  kategori text,
  jam_mulai time,
  jam_selesai time,
  santri_count integer not null default 0,
  kelas text,
  guru_id bigint references public.guru(id),
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
`;

fs.writeFileSync(OUT_PATH, sql);
console.log(`\nSQL written to ${OUT_PATH}`);
console.log('\n=== SQL ===\n');
console.log(sql);
