/**
 * Bedah 490 baris absensi Sheets yang santri_id-nya tidak ada di tab santri.
 * Pertanyaannya: apakah itu riwayat kelompok 1 (yang santri-nya pindah ke
 * Firestore) yang belum masuk Supabase, atau sampah rujukan mati?
 * Read-only.
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
      .map((x) => Object.fromEntries(hdr.map((h, i) => [h, x[i]])));
  };

  const absensi = await ambil('absensi');
  const santri = await ambil('santri');
  const idSantriSheets = new Set(santri.map((s) => String(s.id).trim()));

  const yatim = absensi.filter((a) => !idSantriSheets.has(String(a.santri_id).trim()));
  const perTgl = {};
  const idUnik = new Set();
  for (const a of yatim) {
    const t = String(a.tanggal ?? '').slice(0, 10);
    perTgl[t] = (perTgl[t] || 0) + 1;
    idUnik.add(String(a.santri_id).trim());
  }
  console.log('Baris yatim:', yatim.length, '| santri_id unik:', idUnik.size);
  console.log('Sebaran tanggal:');
  for (const [t, n] of Object.entries(perTgl).sort()) console.log(`  ${t}: ${n}`);
  const contoh = [...idUnik].sort((a, b) => Number(a) - Number(b));
  console.log('santri_id rentang:', contoh[0], 's/d', contoh[contoh.length - 1]);

  // Apakah id itu cocok dgn santri Firestore kelompok 1?
  admin.initializeApp({
    credential: admin.credential.cert(require(path.resolve(AKAR, e.GOOGLE_SERVICE_ACCOUNT_KEY_PATH))),
    projectId: e.FIRESTORE_PROJECT_ID,
  });
  const fsSantri = await admin.firestore().collection('kelompok/1/santri').get();
  const idFs = new Set(fsSantri.docs.map((d) => d.id));
  const cocokFs = [...idUnik].filter((i) => idFs.has(i)).length;
  console.log('');
  console.log('santri Firestore kelompok 1:', idFs.size, 'dokumen');
  console.log('santri_id yatim yang cocok dgn id Firestore:', cocokFs, 'dari', idUnik.size);

  // Apakah pasangan (tanggal, santri) itu sudah ada di Supabase?
  const daftarTgl = Object.keys(perTgl).filter(Boolean).sort();
  const adaDiSb = await sql(`
    select a.tanggal::text as tanggal, count(*)::text as jml
      from public.absensi a join public.santri s on s.id=a.santri_id
     where s.kelompok_id = 1 and a.tanggal between '${daftarTgl[0]}' and '${daftarTgl[daftarTgl.length - 1]}'
     group by a.tanggal order by a.tanggal;
  `);
  console.log('');
  console.log('Supabase absensi kelompok 1 pada rentang tanggal yang sama:');
  if (adaDiSb.length === 0) console.log('  (tidak ada satu pun)');
  for (const b of adaDiSb) console.log(`  ${b.tanggal}: ${b.jml}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('GAGAL:', err.message);
    process.exit(1);
  });
