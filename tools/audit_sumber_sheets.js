/**
 * Hitung baris per kelompok_id di Google Sheets sumber (read-only).
 * Tujuan: memastikan apakah 14 kelompok yang "belum di-ETL" memang punya
 * data di Sheets, atau memang tidak pernah diisi.
 */
require('dotenv').config({ path: 'C:/Users/user/Documents/PPG_Surabaya_Barat/.env' });
const { google } = require('googleapis');

const TABS = ['santri', 'guru', 'jadwal_kbm', 'absensi', 'jadwal_kategori_hari'];

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
  const id = process.env.SPREADSHEET_ID;

  const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
  console.log('TAB yang ada:', meta.data.sheets.map((s) => s.properties.title).join(', '));
  console.log('');

  for (const tab of TABS) {
    let res;
    try {
      res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${tab}!A1:ZZ` });
    } catch (e) {
      console.log(`${tab}: TIDAK BISA DIBACA (${e.message.slice(0, 60)})`);
      continue;
    }
    const rows = res.data.values || [];
    if (rows.length === 0) {
      console.log(`${tab}: KOSONG`);
      continue;
    }
    const header = rows[0];
    const iKel = header.indexOf('kelompok_id');
    const isi = rows.slice(1).filter((r) => r.some((c) => String(c).trim() !== ''));
    const perKel = {};
    for (const r of isi) {
      const k = iKel >= 0 ? String(r[iKel] ?? '').trim() || '(kosong)' : '(tidak ada kolom)';
      perKel[k] = (perKel[k] || 0) + 1;
    }
    const ringkas = Object.entries(perKel)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, n]) => `k${k}:${n}`)
      .join(' ');
    console.log(`${tab}: total ${isi.length} baris | ${ringkas}`);
  }
}

main().catch((e) => {
  console.error('GAGAL:', e.message);
  process.exit(1);
});
