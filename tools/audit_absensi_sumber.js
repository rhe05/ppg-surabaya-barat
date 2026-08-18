/**
 * Bandingkan absensi di sumber (Sheets + Firestore) dengan yang sudah ada
 * di Supabase, untuk tahu persis berapa baris yang benar-benar hilang dan
 * kenapa. Read-only, tidak menulis apa pun.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const admin = require('firebase-admin');

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
    `https://api.supabase.com/v1/projects/fnhqtkqswxsqmjxynldg/database/query`,
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

async function main() {
  const e = env();

  // ── Sheets ──────────────────────────────────────────────────────────
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(AKAR, e.GOOGLE_SERVICE_ACCOUNT_KEY_PATH),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  const absRes = await sheets.spreadsheets.values.get({
    spreadsheetId: e.SPREADSHEET_ID,
    range: 'absensi!A1:ZZ',
  });
  const absRows = absRes.data.values || [];
  const absHdr = absRows[0];
  const absIsi = absRows.slice(1).filter((r) => r.some((c) => String(c).trim() !== ''));
  console.log('Sheets absensi — kolom:', absHdr.join(', '));
  console.log('Sheets absensi — baris berisi:', absIsi.length);

  const iSantri = absHdr.indexOf('santri_id');
  const iTgl = absHdr.indexOf('tanggal');

  const stRes = await sheets.spreadsheets.values.get({
    spreadsheetId: e.SPREADSHEET_ID,
    range: 'santri!A1:ZZ',
  });
  const stRows = stRes.data.values || [];
  const stHdr = stRows[0];
  const stIsi = stRows.slice(1).filter((r) => r.some((c) => String(c).trim() !== ''));
  const iStId = stHdr.indexOf('id');
  const iStKel = stHdr.indexOf('kelompok_id');
  const santriSheets = new Map(
    stIsi.map((r) => [String(r[iStId]).trim(), String(r[iStKel] ?? '').trim()])
  );

  const perKel = {};
  let yatim = 0;
  const tglMin = [];
  for (const r of absIsi) {
    const sid = String(r[iSantri] ?? '').trim();
    const kel = santriSheets.get(sid);
    if (!kel) {
      yatim++;
      continue;
    }
    perKel[kel] = (perKel[kel] || 0) + 1;
    if (r[iTgl]) tglMin.push(String(r[iTgl]).slice(0, 10));
  }
  tglMin.sort();
  console.log(
    'Sheets absensi per kelompok (lewat santri_id):',
    Object.entries(perKel).map(([k, n]) => `k${k}:${n}`).join(' ')
  );
  console.log('Sheets absensi yatim (santri_id tak dikenal):', yatim);
  console.log('Sheets absensi rentang tanggal:', tglMin[0], 's/d', tglMin[tglMin.length - 1]);

  // ── Firestore ───────────────────────────────────────────────────────
  admin.initializeApp({
    credential: admin.credential.cert(require(path.resolve(AKAR, e.GOOGLE_SERVICE_ACCOUNT_KEY_PATH))),
    projectId: e.FIRESTORE_PROJECT_ID,
  });
  const fsAbs = await admin.firestore().collection('kelompok/1/absensi').get();
  const fsTgl = fsAbs.docs.map((d) => String(d.data().tanggal ?? '').slice(0, 10)).sort();
  console.log('');
  console.log('Firestore kelompok/1/absensi:', fsAbs.size, 'dokumen');
  console.log('Firestore rentang tanggal:', fsTgl[0], 's/d', fsTgl[fsTgl.length - 1]);

  // ── Supabase ────────────────────────────────────────────────────────
  const hasil = await sql(`
    select s.kelompok_id::text as kelompok, count(*)::text as jml,
           min(a.tanggal)::text as dari, max(a.tanggal)::text as sampai
      from public.absensi a join public.santri s on s.id = a.santri_id
     group by s.kelompok_id order by s.kelompok_id;
  `);
  console.log('');
  console.log('Supabase absensi per kelompok:');
  for (const b of hasil) console.log(`  k${b.kelompok}: ${b.jml} (${b.dari} s/d ${b.sampai})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('GAGAL:', err.message);
    process.exit(1);
  });
