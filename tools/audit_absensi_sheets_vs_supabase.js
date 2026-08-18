/**
 * Bandingkan SETIAP catatan absensi Google Sheets dengan Supabase, per
 * pasangan (santri_id, tanggal).
 *
 * Perlu karena membandingkan jumlah baris menyesatkan: Sheets memuat 490
 * baris dengan santri_id yang sudah mati (penomoran lama Kelp Petemon
 * sebelum pindah ke Firestore) yang owner putuskan direlakan 18 Agt 2026.
 * Selisih jumlah karena itu BUKAN bukti data hilang — dan sebaliknya,
 * jumlah yang mirip juga bukan bukti semuanya lengkap.
 *
 * Read-only.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const AKAR = path.resolve(__dirname, '..');

function env() {
  return Object.fromEntries(
    fs
      .readFileSync(path.join(AKAR, '.env'), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [
        l.slice(0, l.indexOf('=')).trim(),
        l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, ''),
      ])
  );
}

async function sql(query) {
  const e = env();
  const r = await fetch(
    'https://api.supabase.com/v1/projects/fnhqtkqswxsqmjxynldg/database/query',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${e.SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  );
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return JSON.parse(t);
}

const tgl = (v) => String(v ?? '').slice(0, 10);

async function main() {
  const e = env();
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(AKAR, e.GOOGLE_SERVICE_ACCOUNT_KEY_PATH),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  const ambil = async (tab) => {
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: e.SPREADSHEET_ID,
      range: `${tab}!A1:ZZ`,
    });
    const rows = r.data.values || [];
    const hdr = rows[0];
    return rows
      .slice(1)
      .filter((x) => x.some((c) => String(c).trim() !== ''))
      .map((x) => Object.fromEntries(hdr.map((h, i) => [h, (x[i] ?? '').toString().trim()])));
  };

  const absensi = await ambil('absensi');
  const santriSheets = await ambil('santri');
  const idSantriSheets = new Set(santriSheets.map((s) => String(s.id)));

  const sbSantri = await sql('select id::text as id from public.santri where deleted_at is null;');
  const idSantriSb = new Set(sbSantri.map((r) => r.id));

  const sbAbsensi = await sql(
    'select santri_id::text as santri_id, tanggal::text as tanggal from public.absensi where deleted_at is null;'
  );
  const adaSb = new Set(sbAbsensi.map((r) => `${r.santri_id}|${r.tanggal}`));

  let cocok = 0;
  const yatim = [];
  const hilang = [];

  for (const a of absensi) {
    const sid = String(a.santri_id);
    const t = tgl(a.tanggal);
    /* "Yatim" = santri_id tidak dikenal DI MANA PUN (bukan di tab santri
       Sheets, bukan pula di Supabase). Inilah 490 baris yang direlakan. */
    if (!idSantriSheets.has(sid) && !idSantriSb.has(sid)) {
      yatim.push({ sid, t });
      continue;
    }
    if (adaSb.has(`${sid}|${t}`)) cocok += 1;
    else hilang.push({ sid, t, status: a.status });
  }

  console.log('Sheets absensi (baris berisi) :', absensi.length);
  console.log('  santri_id sudah mati        :', yatim.length, '(direlakan, keputusan owner 18 Agt)');
  console.log('  santri_id sah & ada di SB   :', cocok);
  console.log('  santri_id sah TAPI HILANG   :', hilang.length);

  if (hilang.length) {
    const perTgl = {};
    for (const h of hilang) perTgl[h.t] = (perTgl[h.t] || 0) + 1;
    console.log('\nSebaran tanggal yang tertinggal:');
    for (const [t, n] of Object.entries(perTgl).sort()) console.log(`  ${t}: ${n}`);
  } else {
    console.log('\nSemua catatan absensi Sheets yang santri-nya masih dikenal SUDAH ada di Supabase.');
  }
}

main().catch((err) => {
  console.error('GAGAL:', err.message);
  process.exit(1);
});
