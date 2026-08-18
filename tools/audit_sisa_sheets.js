/**
 * Hitung isi SELURUH tab Google Sheets sumber, lalu bandingkan dengan
 * jumlah baris tabel padanannya di Supabase.
 *
 * Dipakai menjawab satu pertanyaan: apakah benar semua data lama sudah
 * pindah? Audit sebelumnya (18 Agt) hanya memeriksa santri/guru/jadwal/
 * absensi — tab lain belum pernah dihitung dari sisi SUMBER.
 *
 * Read-only.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const AKAR = path.resolve(__dirname, '..');

/* Peta tab Sheets -> tabel Supabase. null = memang tidak punya padanan. */
const PETA = {
  ppg: 'ppg',
  desa: 'desa',
  kelompok: 'kelompok',
  santri: 'santri',
  guru: 'guru',
  absensi: 'absensi',
  jadwal_kbm: 'jadwal_kbm',
  jadwal_kategori_hari: 'jadwal_kategori_hari',
  kurikulum_prota: 'kurikulum_prota',
  kurikulum_promes: 'kurikulum_promes',
  kurikulum_probul: 'kurikulum_probul',
  kurikulum_pencapaian_santri: 'kurikulum_pencapaian_santri',
  kurikulum_akhlaq: 'kurikulum_akhlaq',
  konseling: 'konseling',
  munaqosah: 'munaqosah',
  periode_munaqosah: 'periode_munaqosah',
  calendar_events: 'calendar_events',
  files: 'files',
  pengumuman: 'pengumuman',
  siklus_generus: 'siklus_generus',
  pengurus_kelp: 'pengurus_kelp',
  quote_harian: 'quote_harian',
  riwayat_jenjang: 'riwayat_jenjang',
  guru_izin: 'guru_izin',
  akses_kelas_request: 'akses_kelas_request',
  audit_log: 'audit_log',
  users: null, // digantikan auth.users + profiles
  remember_tokens: null, // sesi Supabase menggantikannya
  Sheet1: null, // tab bawaan, tidak dipakai
};

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

  const meta = await sheets.spreadsheets.get({ spreadsheetId: e.SPREADSHEET_ID });
  const tabs = meta.data.sheets.map((s) => s.properties.title);

  /* Sekali ambil semua tab, bukan satu per satu. */
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: e.SPREADSHEET_ID,
    ranges: tabs.map((t) => `${t}!A1:ZZ`),
  });

  const isiSheets = {};
  res.data.valueRanges.forEach((vr, i) => {
    const rows = vr.values || [];
    isiSheets[tabs[i]] = Math.max(
      0,
      rows.slice(1).filter((r) => r.some((c) => String(c).trim() !== '')).length
    );
  });

  const tabelSb = [...new Set(Object.values(PETA).filter(Boolean))];
  const hasilSb = await sql(
    tabelSb
      .map((t) => `select '${t}' as tabel, count(*)::int as n from public.${t}`)
      .join(' union all ')
  );
  const isiSb = Object.fromEntries(hasilSb.map((r) => [r.tabel, r.n]));

  const baris = [];
  for (const tab of tabs) {
    const target = PETA[tab];
    const nSheet = isiSheets[tab] ?? 0;
    if (target === null) {
      baris.push([tab, nSheet, '—', nSheet > 0 ? 'sengaja tidak dipindah' : 'kosong']);
      continue;
    }
    if (target === undefined) {
      baris.push([tab, nSheet, '?', 'TAB TIDAK DIKENAL']);
      continue;
    }
    const nSb = isiSb[target] ?? 0;
    let status;
    if (nSheet === 0 && nSb === 0) status = 'sama-sama kosong';
    else if (nSb >= nSheet) status = 'OK';
    else status = 'KURANG ' + (nSheet - nSb);
    baris.push([tab, nSheet, nSb, status]);
  }

  const lebar = [28, 8, 8, 24];
  const garis = (a) =>
    a.map((v, i) => String(v).padEnd(lebar[i])).join('').trimEnd();
  console.log(garis(['TAB SHEETS', 'SHEETS', 'SUPABASE', 'STATUS']));
  console.log('-'.repeat(68));
  for (const b of baris) console.log(garis(b));

  const kurang = baris.filter((b) => String(b[3]).startsWith('KURANG'));
  console.log('');
  console.log(
    kurang.length === 0
      ? 'TIDAK ADA data Sheets yang tertinggal.'
      : `${kurang.length} tab masih tertinggal: ${kurang.map((b) => b[0]).join(', ')}`
  );
}

main().catch((err) => {
  console.error('GAGAL:', err.message);
  process.exit(1);
});
