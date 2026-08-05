/**
 * diag_query.js — panggil endpoint diag ad-hoc (rows/listkelompok) via CLI.
 * node tools/diag_query.js rows guru 50
 * node tools/diag_query.js listkelompok santri 1
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

const APP_URL = 'https://script.google.com/macros/s/AKfycbxeNx68eV_7btwv_N8EWMxDer1Odf4-B7DEwS-U5TgSMJeVp6gorvR5-ptGBn0o_mM/exec';
const CLASPRC = path.join(os.homedir(), '.clasprc.json');

function readToken() {
  return JSON.parse(fs.readFileSync(CLASPRC, 'utf8')).tokens.default.access_token;
}

function fetchFollow(url, token, sisaRedirect) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Authorization: 'Bearer ' + token } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && sisaRedirect > 0) {
        res.resume();
        resolve(fetchFollow(res.headers.location, token, sisaRedirect - 1));
        return;
      }
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    }).on('error', reject);
  });
}

async function main() {
  const [mode, a, b] = process.argv.slice(2);
  const token = readToken();
  let url;
  if (mode === 'rows') {
    url = APP_URL + '?diag=rows&sheet=' + encodeURIComponent(a) + '&limit=' + (b || 50);
  } else if (mode === 'listkelompok') {
    url = APP_URL + '?diag=listkelompok&table=' + encodeURIComponent(a) + '&kelompok=' + encodeURIComponent(b);
  } else if (mode === 'kehadirantest') {
    // node tools/diag_query.js kehadirantest <kelompokId> <tahun> <bulan> [kelas] [guruId]
    const [kelompokId, tahun, bulan, kelas, guruId] = process.argv.slice(3);
    url = APP_URL + '?diag=kehadirantest&kelompok=' + encodeURIComponent(kelompokId)
      + '&tahun=' + encodeURIComponent(tahun) + '&bulan=' + encodeURIComponent(bulan)
      + (kelas ? '&kelas=' + encodeURIComponent(kelas) : '')
      + (guruId ? '&guruid=' + encodeURIComponent(guruId) : '');
  } else {
    console.error('usage: node tools/diag_query.js rows <sheet> [limit] | listkelompok <santri|guru|absensi|jadwal_kbm> <kelompokId> | kehadirantest <kelompokId> <tahun> <bulan> [kelas] [guruId]');
    process.exit(1);
  }
  const res = await fetchFollow(url, token, 5);
  console.log(res.body);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
