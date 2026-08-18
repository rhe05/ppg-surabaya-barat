#!/usr/bin/env node
/**
 * tools/supabase_query.js — jalankan berkas SQL ke Postgres Supabase lewat
 * Management API.
 *
 *   node tools/supabase_query.js <berkas.sql> [project_ref]
 *
 * Dipakai untuk memasang migrasi & menjalankan uji peniruan role (pola
 * `BEGIN; set_config + SET LOCAL ROLE; ...; ROLLBACK;`) langsung ke project
 * produksi. Sengaja dipindahkan dari skrip sekali-pakai di scratchpad ke
 * tools/ supaya bisa diberi izin permanen di .claude/settings.json dan
 * jejaknya terbaca di repo.
 *
 * Token diambil dari SUPABASE_ACCESS_TOKEN di .env root repo (tidak pernah
 * dicetak ke layar). Tiap request = koneksi sendiri, jadi transaksi TIDAK
 * bisa dibiarkan terbuka antar-request — satu berkas SQL harus memuat
 * BEGIN sampai COMMIT/ROLLBACK-nya sekaligus.
 */

const fs = require('fs');
const path = require('path');

const AKAR = path.resolve(__dirname, '..');
const REF_BAWAAN = 'fnhqtkqswxsqmjxynldg'; // ruang-ngaji-dev (produksi)

function bacaEnv() {
  const berkas = path.join(AKAR, '.env');
  if (!fs.existsSync(berkas)) throw new Error('.env tidak ditemukan di ' + AKAR);
  return Object.fromEntries(
    fs
      .readFileSync(berkas, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [
        l.slice(0, l.indexOf('=')).trim(),
        l
          .slice(l.indexOf('=') + 1)
          .trim()
          .replace(/^["']|["']$/g, ''),
      ])
  );
}

async function main() {
  const berkasSql = process.argv[2];
  const ref = process.argv[3] || process.env.PROJECT_REF || REF_BAWAAN;
  if (!berkasSql) {
    console.error('Pemakaian: node tools/supabase_query.js <berkas.sql> [project_ref]');
    process.exit(2);
  }

  const env = bacaEnv();
  if (!env.SUPABASE_ACCESS_TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN tidak ada di .env');

  const sql = fs.readFileSync(berkasSql, 'utf8');
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  const teks = await r.text();
  console.log('HTTP', r.status, '| project', ref, '| berkas', path.basename(berkasSql));
  try {
    console.log(JSON.stringify(JSON.parse(teks), null, 2));
  } catch {
    console.log(teks);
  }
  if (!r.ok) process.exit(1);
}

main().catch((e) => {
  console.error('GAGAL:', e.message);
  process.exit(1);
});
