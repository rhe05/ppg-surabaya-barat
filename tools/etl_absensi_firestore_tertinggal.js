/**
 * Pindahkan catatan absensi Firestore (kelompok 1) yang belum ada di
 * Supabase. Ditemukan 18 Agt 2026 oleh
 * tools/audit_absensi_firestore_vs_supabase.js: 25 catatan dari 15 Juli
 * dan 6 Agustus tertinggal sejak ETL awal.
 *
 * Hanya menyalin yang BENAR-BENAR belum ada (dicocokkan per pasangan
 * santri_id + tanggal). Yang sudah ada tidak disentuh — statusnya di
 * Supabase bisa saja sudah dikoreksi lewat app baru, dan menimpanya dengan
 * nilai lama justru merusak.
 *
 * Skrip ini TIDAK menulis ke DB; ia menghasilkan berkas SQL untuk
 * dijalankan lewat tools/supabase_query.js.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const AKAR = path.resolve(__dirname, '..');
const BERKAS_SQL = path.join(AKAR, 'tools', '_etl_absensi_tertinggal.generated.sql');

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

const STATUS_SAH = ['hadir', 'izin', 'sakit', 'alpa'];
const tgl = (v) => String(v ?? '').slice(0, 10);

async function main() {
  const e = env();
  admin.initializeApp({
    credential: admin.credential.cert(
      require(path.resolve(AKAR, e.GOOGLE_SERVICE_ACCOUNT_KEY_PATH))
    ),
    projectId: e.FIRESTORE_PROJECT_ID,
  });

  const snap = await admin.firestore().collection('kelompok/1/absensi').get();
  const fsRows = snap.docs.map((d) => {
    const x = d.data();
    return {
      santri_id: Number(x.santri_id),
      tanggal: tgl(x.tanggal),
      status: String(x.status || '').toLowerCase(),
    };
  });

  const sbRows = await sql(`
    select a.santri_id::text as santri_id, a.tanggal::text as tanggal
      from public.absensi a join public.santri s on s.id = a.santri_id
     where s.kelompok_id = 1 and a.deleted_at is null;
  `);
  const ada = new Set(sbRows.map((r) => `${r.santri_id}|${r.tanggal}`));

  const santriSb = await sql(
    'select id::text as id from public.santri where kelompok_id = 1 and deleted_at is null;'
  );
  const santriAda = new Set(santriSb.map((r) => r.id));

  const perluPindah = [];
  const dilewati = [];
  for (const r of fsRows) {
    if (ada.has(`${r.santri_id}|${r.tanggal}`)) continue;
    if (!santriAda.has(String(r.santri_id))) {
      dilewati.push({ ...r, alasan: 'santri_id tidak ada di Supabase' });
      continue;
    }
    if (!STATUS_SAH.includes(r.status)) {
      dilewati.push({ ...r, alasan: `status "${r.status}" tidak dikenal` });
      continue;
    }
    perluPindah.push(r);
  }

  console.log('Firestore   :', fsRows.length, 'dokumen');
  console.log('Perlu pindah:', perluPindah.length);
  console.log('Dilewati    :', dilewati.length);
  dilewati.slice(0, 10).forEach((d) =>
    console.log(`  santri ${d.santri_id} ${d.tanggal}: ${d.alasan}`)
  );

  if (perluPindah.length === 0) {
    console.log('\nTidak ada yang perlu dipindah — Supabase sudah memuat semuanya.');
    return;
  }

  const skrip =
    '-- Dihasilkan oleh tools/etl_absensi_firestore_tertinggal.js\n' +
    `-- ${perluPindah.length} catatan absensi Firestore yang belum ada di Supabase.\n` +
    '-- dicatat_oleh dibiarkan NULL: Firestore menyimpan id pengguna app lama,\n' +
    '-- yang tidak punya padanan di auth.users.\n' +
    'BEGIN;\n\n' +
    'INSERT INTO public.absensi (santri_id, kelompok_id, tanggal, status)\n' +
    'SELECT v.santri_id, 1, v.tanggal, v.status\n' +
    '  FROM (VALUES\n' +
    perluPindah
      .map((r) => `    (${r.santri_id}::bigint, '${r.tanggal}'::date, '${r.status}'::absensi_status)`)
      .join(',\n') +
    '\n  ) AS v(santri_id, tanggal, status)\n' +
    /* Penjaga terakhir: kalau baris itu ternyata sudah ada (mis. ada yang
       menginput lewat app baru di sela-sela pemeriksaan ini), lewati saja
       alih-alih menabrak indeks unik dan membatalkan seluruh transaksi. */
    ' WHERE NOT EXISTS (\n' +
    '   SELECT 1 FROM public.absensi a\n' +
    '    WHERE a.santri_id = v.santri_id AND a.tanggal = v.tanggal AND a.deleted_at IS NULL\n' +
    ' );\n\n' +
    'SELECT count(*)::text AS absensi_kelompok_1\n' +
    '  FROM public.absensi a JOIN public.santri s ON s.id = a.santri_id\n' +
    ' WHERE s.kelompok_id = 1 AND a.deleted_at IS NULL;\n\n' +
    'COMMIT;\n';

  fs.writeFileSync(BERKAS_SQL, skrip);
  console.log('\nSQL ditulis ke ' + path.relative(AKAR, BERKAS_SQL));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('GAGAL:', err.message);
    process.exit(1);
  });
