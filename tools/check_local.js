/**
 * check_local.js — Pemeriksaan cepat SEBELUM commit/deploy (tanpa network).
 *
 * Cara pakai (dari root repo):
 *   node tools/check_local.js
 *
 * Yang diperiksa:
 * 1. Semua blok <script> di Index.html + file yang di-include (Style_Main.html,
 *    Markup_Screens.html, Script_Main.html) valid secara sintaks (parser V8 asli).
 * 2. Semua file .gs/.js backend valid secara sintaks.
 * 3. GUARDRAIL ERROR_LOG.md #1: tidak ada pola URL "://" di dalam blok <script>
 *    — pemroses HtmlService Apps Script bisa memotong string berisi "//" saat
 *    serving dan membuat app layar putih. URL di HTML (href/src) aman.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.join(__dirname, '..', '13_AppsScript');
let problems = 0;

// ── 1. Blok <script> di Index.html + file yang di-include via HtmlService template ──
// Index.html sendiri sekarang hanya shell (<?!= include('...'); ?>); isi CSS/HTML/JS
// sesungguhnya ada di file-file berikut — semua diperiksa sebagai satu kesatuan,
// sama seperti yang akan digabung server saat evaluate().
const HTML_PARTIALS = ['Index.html', 'Style_Main.html', 'Markup_Screens.html', 'Script_Main.html'];
const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;

HTML_PARTIALS.forEach((file) => {
  const filePath = path.join(DIR, file);
  if (!fs.existsSync(filePath)) return;
  const html = fs.readFileSync(filePath, 'utf8');
  let m, i = 0;
  while ((m = re.exec(html)) !== null) {
    i++;
    const body = m[1];
    if (!body.trim()) continue;
    const startLine = html.slice(0, m.index).split('\n').length;
    try {
      new vm.Script(body, { filename: `${file}_block_${i}.js` });
      console.log(`[${file}] script ${i} OK (mulai baris ${startLine})`);
    } catch (e) {
      problems++;
      console.log(`[${file}] script ${i} SYNTAX ERROR (mulai baris ${startLine}): ${e.message}`);
    }

    // ── 3. Guardrail: "://" di dalam blok script ──
    body.split('\n').forEach((line, n) => {
      const idx = line.indexOf('://');
      if (idx === -1) return;
      const trimmed = line.trim();
      // Komentar murni aman (dihapus GAS sebelum bisa merusak apa pun).
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      problems++;
      console.log(`[guardrail] BAHAYA ${file} baris ${startLine + n}: pola "://" di dalam <script> — `
        + 'HtmlService bisa memotong string berisi "//" (lihat ERROR_LOG.md #1).');
      console.log(`            ${trimmed.slice(0, 120)}`);
    });
  }
  re.lastIndex = 0;
});

// ── 2. File backend .gs/.js ──
fs.readdirSync(DIR)
  .filter((f) => f.endsWith('.gs') || f.endsWith('.js'))
  .forEach((f) => {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8');
    try {
      new vm.Script(src, { filename: f });
      console.log(`[backend] ${f} OK`);
    } catch (e) {
      problems++;
      console.log(`[backend] ${f} SYNTAX ERROR: ${e.message}`);
    }
  });

if (problems === 0) {
  console.log('\n[OK] Semua pemeriksaan lokal lolos. Aman untuk commit/deploy.');
} else {
  console.log(`\n[ERR] ${problems} masalah ditemukan — perbaiki sebelum deploy.`);
  process.exit(1);
}
