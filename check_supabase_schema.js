// Check Supabase Schema (prototype) — lists all public table names in the
// connected Supabase project via information_schema.tables.
//
// Usage: node check_supabase_schema.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, 'supabase_tables.txt');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required env var ${name}. Add it to .env before running check_supabase_schema.js.`
    );
  }
  return v;
}

async function main() {
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

  console.log('Checking Supabase schema (prototype) — starting...\n');

  // information_schema isn't exposed through the PostgREST table API by
  // default, so this goes through an RPC. Requires a SQL function to exist
  // in the target project — see README note below if it's missing.
  const { data, error } = await supabase.rpc('pg_list_public_tables');

  if (error) {
    console.error('Query failed:', error.message);
    console.error(
      '\nIf this is "function pg_list_public_tables does not exist", it means ' +
      'no RPC function is exposed for querying information_schema. Create one ' +
      'in the Supabase SQL editor:\n\n' +
      "  create or replace function pg_list_public_tables()\n" +
      "  returns table(table_name text) language sql stable as $$\n" +
      "    select table_name from information_schema.tables\n" +
      "    where table_schema = 'public' order by table_name;\n" +
      "  $$;\n"
    );
    process.exit(1);
  }

  const tableNames = (data || []).map((row) => row.table_name);
  console.log(`Found ${tableNames.length} table(s):\n`);
  tableNames.forEach((t) => console.log(`  ${t}`));

  fs.writeFileSync(OUT_PATH, tableNames.join('\n') + '\n');
  console.log(`\nSaved to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('Check failed:', err);
  process.exit(1);
});
