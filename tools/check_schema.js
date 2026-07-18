/**
 * check_schema.js — Verifikasi struktur Google Sheet yang SEDANG dipakai
 * production, tanpa perlu membuka Sheet manual.
 *
 * Kenapa perlu: setelah menambah sheet/kolom, `setupDatabaseStructure()` harus
 * dijalankan manual di editor Apps Script. Sebelum ini tidak ada cara memastikan
 * langkah itu benar-benar sudah dilakukan — field baru gagal tersimpan diam-diam.
 *
 * Cara pakai (setelah deploy):
 *   node tools/check_schema.js
 *
 * Butuh: ~/.clasprc.json (login clasp akun pemilik). Endpoint doGet(?diag=schema)
 * hanya bisa dipanggil pemilik karena web app access = MYSELF.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const APP_URL = 'https://script.google.com/macros/s/AKfycbxeNx68eV_7btwv_N8EWMxDer1Odf4-B7DEwS-U5TgSMJeVp6gorvR5-ptGBn0o_mM/exec';
const CLASPRC = path.join(os.homedir(), '.clasprc.json');

/** Sheet + kolom yang WAJIB ada. Perbarui bersama Setup_Database.gs. */
const EXPECTED = {
  desa: ['id', 'ppg_id', 'nama'],
  kelompok: ['id', 'desa_id', 'nama', 'status_aktif'],
  guru: ['id', 'kelompok_id', 'nama', 'kecamatan', 'lama_mengajar'],
  santri: ['id', 'kelompok_id', 'nama', 'kecamatan'],
  jadwal_kbm: ['id', 'kelompok_id'],
  pengumuman: ['id', 'kelompok_id'],
};

function readToken() {
  return JSON.parse(fs.readFileSync(CLASPRC, 'utf8')).tokens.default.access_token;
}

function fetchJson(token) {
  return new Promise((resolve, reject) => {
    https.get(APP_URL + '?diag=schema', { headers: { Authorization: 'Bearer ' + token } }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    }).on('error', reject);
  });
}

async function main() {
  let token = readToken();
  let res = await fetchJson(token);

  if (res.status === 401 || res.status === 403) {
    console.log('Token mungkin kedaluwarsa — refresh via clasp...');
    try { execSync('clasp deployments', { stdio: 'ignore' }); } catch (e) { /* abaikan */ }
    token = readToken();
    res = await fetchJson(token);
  }

  let data;
  try {
    data = JSON.parse(res.body);
  } catch (e) {
    console.error('[ERR] Respons bukan JSON (status ' + res.status + '). Deploy terbaru sudah jalan?');
    console.error(res.body.slice(0, 300));
    process.exit(1);
  }

  if (!data.success) {
    console.error('[ERR] Server gagal baca skema: ' + data.error);
    process.exit(1);
  }

  const byName = {};
  data.sheets.forEach((s) => (byName[s.nama] = s));
  console.log('Spreadsheet: ' + data.spreadsheet);
  console.log('Sheet ada (' + data.sheets.length + '): ' + data.sheets.map((s) => s.nama).join(', ') + '\n');

  const masalah = [];
  Object.keys(EXPECTED).forEach((nama) => {
    const sh = byName[nama];
    if (!sh) {
      masalah.push('sheet "' + nama + '" TIDAK ADA');
      return;
    }
    const kurang = EXPECTED[nama].filter((k) => sh.header.indexOf(k) === -1);
    if (kurang.length) {
      masalah.push('sheet "' + nama + '" kurang kolom: ' + kurang.join(', '));
    } else {
      console.log('  [OK] ' + nama + ' (' + sh.header.length + ' kolom, ' + sh.barisData + ' baris data)');
    }
  });

  if (masalah.length) {
    console.error('\n[ERR] Skema belum lengkap:');
    masalah.forEach((m) => console.error('  - ' + m));
    console.error('\nJalankan setupDatabaseStructure() di editor Apps Script, lalu ulangi.');
    process.exit(1);
  }

  console.log('\n[OK] Skema lengkap — setupDatabaseStructure() sudah berjalan.');
}

main().catch((e) => {
  console.error('[ERR] ' + e.message);
  process.exit(1);
});
