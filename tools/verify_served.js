/**
 * verify_served.js — Verifikasi bahwa aplikasi yang BENAR-BENAR disajikan server
 * Apps Script valid (bukan cuma source lokal).
 *
 * Kenapa perlu: HtmlService Apps Script MEMPROSES Index.html saat serving
 * (menghapus komentar, dll) dan prosesnya PUNYA BUG — pernah memotong string JS
 * berisi "//" (lihat ERROR_LOG.md #1) sehingga app layar putih padahal source
 * lokal valid. Satu-satunya cara tahu pasti = ambil output server, parse ulang.
 *
 * Cara pakai (dari root repo, setelah deploy selesai):
 *   node tools/verify_served.js
 *
 * Butuh: ~/.clasprc.json (login clasp akun rheza354@gmail.com).
 * Jika token kedaluwarsa, script otomatis me-refresh via `clasp deployments`.
 *
 * Output:
 *   [OK]  semua blok <script> valid → production sehat.
 *   [ERR] ada blok gagal parse → menunjukkan baris persisnya di output server.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const vm = require('vm');
const { execSync } = require('child_process');

const APP_URL = 'https://script.google.com/macros/s/AKfycbxeNx68eV_7btwv_N8EWMxDer1Odf4-B7DEwS-U5TgSMJeVp6gorvR5-ptGBn0o_mM/exec';
const CLASPRC = path.join(os.homedir(), '.clasprc.json');

function readToken() {
  const c = JSON.parse(fs.readFileSync(CLASPRC, 'utf8'));
  return c.tokens.default.access_token;
}

function fetchApp(token) {
  return new Promise((resolve, reject) => {
    https.get(APP_URL, { headers: { Authorization: 'Bearer ' + token } }, (res) => {
      let chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

function decodeUserHtml(raw) {
  // Layer 1: response berisi JSON ber-escape \xNN. Cari nilai key userHtml.
  const keyPat = '\\x22userHtml\\x22:\\x22';
  const keyIdx = raw.indexOf(keyPat);
  if (keyIdx === -1) return null;
  const valueStart = keyIdx + keyPat.length;
  const endIdx = raw.indexOf('\\x22,\\x22ncc\\x22', valueStart);
  if (endIdx === -1) return null;
  // eslint-disable-next-line no-eval
  const once = eval('"' + raw.slice(valueStart, endIdx) + '"'); // decode \xNN
  return JSON.parse('"' + once + '"'); // decode layer 2 (JSON string escapes)
}

function checkScripts(html) {
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m, i = 0, failures = 0;
  while ((m = re.exec(html)) !== null) {
    i++;
    const body = m[1];
    if (!body.trim()) { console.log(`  [${i}] <script src>, skip`); continue; }
    const startLine = html.slice(0, m.index).split('\n').length;
    try {
      new vm.Script(body, { filename: `served_block_${i}.js` });
      console.log(`  [${i}] OK  (mulai baris ${startLine}, ${body.length} chars)`);
    } catch (e) {
      failures++;
      console.log(`  [${i}] SYNTAX ERROR (mulai baris ${startLine}): ${e.message}`);
      const stackLine = (e.stack || '').split('\n').slice(0, 3).join('\n');
      console.log('      ' + stackLine.replace(/\n/g, '\n      '));
      const dump = path.join(os.tmpdir(), `ppg_served_block_${i}.js`);
      fs.writeFileSync(dump, body);
      console.log(`      blok disimpan: ${dump}`);
    }
  }
  return { total: i, failures };
}

(async () => {
  let token = readToken();
  let res = await fetchApp(token);
  let userHtml = res.status === 200 ? decodeUserHtml(res.body) : null;

  if (!userHtml) {
    console.log('Token mungkin kedaluwarsa — refresh via clasp...');
    try { execSync('clasp deployments', { cwd: path.join(__dirname, '..', '13_AppsScript'), stdio: 'ignore' }); } catch (_) {}
    token = readToken();
    res = await fetchApp(token);
    userHtml = res.status === 200 ? decodeUserHtml(res.body) : null;
  }

  if (!userHtml) {
    console.log(`[ERR] Gagal mengambil/decode app (HTTP ${res.status}). Coba: cd 13_AppsScript && clasp login`);
    process.exit(2);
  }

  console.log(`Berhasil ambil output server (${userHtml.length} chars). Memeriksa semua blok <script>:`);
  const { total, failures } = checkScripts(userHtml);

  if (failures === 0) {
    console.log(`\n[OK] Semua ${total} blok script valid — production sehat.`);
  } else {
    console.log(`\n[ERR] ${failures} blok rusak DI OUTPUT SERVER. Bandingkan dengan source lokal;`);
    console.log('      jika lokal valid tapi server rusak → kena bug pemroses HtmlService (ERROR_LOG.md #1).');
    process.exit(1);
  }
})();
