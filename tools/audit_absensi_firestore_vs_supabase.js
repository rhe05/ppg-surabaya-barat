/**
 * Bandingkan SETIAP catatan absensi Firestore (kelompok 1) dengan Supabase,
 * per pasangan (santri_id, tanggal) — bukan per jumlah.
 *
 * Perlu karena membandingkan jumlah saja menyesatkan: Supabase memuat baris
 * dari Firestore DAN input baru lewat app Next.js, sedangkan Firestore hanya
 * memuat yang lama. Jumlah bisa berbeda jauh tanpa satu pun data hilang —
 * atau jumlah bisa mirip padahal ada yang tertinggal.
 *
 * Read-only.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
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
    return { santri_id: String(x.santri_id), tanggal: tgl(x.tanggal), status: x.status };
  });
  console.log('Firestore kelompok/1/absensi :', fsRows.length, 'dokumen');

  const sbRows = await sql(`
    select a.santri_id::text as santri_id, a.tanggal::text as tanggal, a.status::text as status
      from public.absensi a join public.santri s on s.id = a.santri_id
     where s.kelompok_id = 1 and a.deleted_at is null;
  `);
  console.log('Supabase absensi kelompok 1  :', sbRows.length, 'baris');

  const kunciSb = new Map(sbRows.map((r) => [`${r.santri_id}|${r.tanggal}`, r.status]));

  const hilang = [];
  const bedaStatus = [];
  for (const r of fsRows) {
    const k = `${r.santri_id}|${r.tanggal}`;
    if (!kunciSb.has(k)) hilang.push(r);
    else if (kunciSb.get(k) !== r.status) bedaStatus.push({ ...r, di_supabase: kunciSb.get(k) });
  }

  console.log('');
  console.log('Ada di Firestore, TIDAK di Supabase :', hilang.length);
  console.log('Ada di keduanya tapi status berbeda :', bedaStatus.length);

  if (hilang.length) {
    const perTgl = {};
    for (const h of hilang) perTgl[h.tanggal] = (perTgl[h.tanggal] || 0) + 1;
    console.log('\nSebaran tanggal yang tertinggal:');
    for (const [t, n] of Object.entries(perTgl).sort()) console.log(`  ${t}: ${n}`);
  }

  if (bedaStatus.length) {
    console.log('\nContoh selisih status (maks 10):');
    bedaStatus.slice(0, 10).forEach((b) =>
      console.log(`  santri ${b.santri_id} ${b.tanggal}: Firestore=${b.status} Supabase=${b.di_supabase}`)
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('GAGAL:', err.message);
    process.exit(1);
  });
