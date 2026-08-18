/**
 * Pulihkan kolom `kelas` pada kurikulum_prota di Supabase.
 *
 * LATAR: ETL menjatuhkan kolom `kelas` (kode kanonik '1'-'9'/'PAUD-TK' di
 * Sheets). Akibatnya 94 baris prota di Supabase punya kelas_id NULL dan
 * tidak bisa dibedakan — tiap kategori punya 9-10 baris yang tampak kembar.
 * `kelas_id` (FK ke tabel `kelas`) BUKAN rumah yang tepat untuk nilai ini:
 * tabel `kelas` berisi ruang kelas per-kelompok ("1A", "2 & 3A", "PAUD/TK B")
 * yang namespace-nya berbeda — app lama sendiri memperingatkan hal itu
 * (Modul_MaintainKurikulum.gs:146+). Jadi dipulihkan sebagai kolom teks
 * `kelas`, persis seperti di Sheets.
 *
 * CARA MENCOCOKKAN: lewat URUTAN, bukan isi. Pencocokan isi tidak mungkin —
 * banyak baris prota punya target & deskripsi kosong (Tajwid, Hafalan Do'a),
 * sehingga (kategori,target,deskripsi) cuma menghasilkan 29 kunci unik dari
 * 94 baris. Yang dipakai: baris ke-n Sheets = baris ke-n Supabase saat
 * diurutkan id, karena load_engine menyisipkan sesuai urutan berkas.
 * Anggapan itu TIDAK dipercaya begitu saja — tiap pasangan diverifikasi
 * kategori+target+deskripsi-nya; satu saja meleset, skrip berhenti tanpa
 * menghasilkan apa pun.
 *
 * Skrip ini TIDAK pernah menulis ke DB; ia hanya menghasilkan berkas SQL.
 *   node tools/backfill_prota_kelas.js
 *   node tools/supabase_query.js tools/_backfill_prota_kelas.generated.sql
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const AKAR = path.resolve(__dirname, '..');
const BERKAS_SQL = path.join(AKAR, 'tools', '_backfill_prota_kelas.generated.sql');

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

const norm = (v) => String(v ?? '').replace(/\r\n/g, '\n').trim();

async function main() {
  const e = env();
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(AKAR, e.GOOGLE_SERVICE_ACCOUNT_KEY_PATH),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: e.SPREADSHEET_ID,
    range: 'kurikulum_prota!A1:ZZ',
  });
  const rows = res.data.values || [];
  const hdr = rows[0];
  const asli = rows
    .slice(1)
    .filter((x) => x.some((c) => String(c).trim() !== ''))
    .map((x) => Object.fromEntries(hdr.map((h, i) => [h, x[i]])));

  const sb = await sql(
    'select p.id, k.nama as kategori, p.target, p.deskripsi ' +
      'from public.kurikulum_prota p ' +
      'join public.kategori_kbm k on k.id = p.kategori_kbm_id ' +
      'order by p.id;'
  );

  console.log('Sheets: ' + asli.length + ' baris | Supabase: ' + sb.length + ' baris');
  if (asli.length !== sb.length) {
    console.error('BERHENTI: jumlah baris beda, urutan tidak bisa dipakai.');
    process.exit(1);
  }

  const cocok = [];
  const meleset = [];
  for (let i = 0; i < sb.length; i++) {
    const a = asli[i];
    const b = sb[i];
    const sama =
      norm(a.kategori) === norm(b.kategori) &&
      norm(a.target) === norm(b.target) &&
      norm(a.deskripsi) === norm(b.deskripsi);
    if (sama) cocok.push({ id: b.id, kelas: norm(a.kelas) });
    else meleset.push({ i: i, a: a, b: b });
  }

  console.log('Terverifikasi cocok: ' + cocok.length + ' | meleset: ' + meleset.length);
  if (meleset.length) {
    meleset.slice(0, 5).forEach(function (m) {
      console.error(
        '  baris ' +
          m.i +
          ': Sheets[' +
          m.a.kategori +
          ' | ' +
          String(m.a.target).slice(0, 30) +
          '] vs SB[' +
          m.b.kategori +
          ' | ' +
          String(m.b.target).slice(0, 30) +
          ']'
      );
    });
    console.error('BERHENTI: urutan tidak sejajar, tidak menghasilkan apa pun.');
    process.exit(1);
  }

  const kosong = cocok.filter((c) => !c.kelas);
  if (kosong.length) {
    console.error('BERHENTI: ' + kosong.length + ' baris Sheets tidak punya nilai kelas.');
    process.exit(1);
  }

  const perKelas = {};
  for (const c of cocok) perKelas[c.kelas] = (perKelas[c.kelas] || 0) + 1;
  console.log(
    'Sebaran kelas: ' +
      Object.entries(perKelas)
        .sort()
        .map(([k, n]) => k + ':' + n)
        .join(' ')
  );

  const baris = cocok
    .map((c) => '  (' + c.id + ", '" + c.kelas.replace(/'/g, "''") + "')")
    .join(',\n');

  const skrip =
    '-- Dihasilkan oleh tools/backfill_prota_kelas.js — jangan disunting tangan.\n' +
    'BEGIN;\n\n' +
    'ALTER TABLE public.kurikulum_prota ADD COLUMN IF NOT EXISTS kelas text;\n\n' +
    'UPDATE public.kurikulum_prota p\n' +
    '   SET kelas = v.kelas\n' +
    '  FROM (VALUES\n' +
    baris +
    '\n) AS v(id, kelas)\n' +
    ' WHERE p.id = v.id;\n\n' +
    'DO $$\n' +
    'DECLARE n int;\n' +
    'BEGIN\n' +
    '  SELECT count(*) INTO n FROM public.kurikulum_prota WHERE kelas IS NULL;\n' +
    "  IF n <> 0 THEN RAISE EXCEPTION 'Guard gagal: masih % baris prota tanpa kelas', n; END IF;\n" +
    'END $$;\n\n' +
    'SELECT kelas, count(*)::text AS jml FROM public.kurikulum_prota GROUP BY kelas ORDER BY kelas;\n\n' +
    'COMMIT;\n';

  fs.writeFileSync(BERKAS_SQL, skrip);
  console.log('\nSQL ditulis ke ' + path.relative(AKAR, BERKAS_SQL));
}

main().catch((err) => {
  console.error('GAGAL:', err.message);
  process.exit(1);
});
