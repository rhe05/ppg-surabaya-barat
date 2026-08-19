/**
 * tools/audit_kelas_ngaji.js — read-only.
 *
 * Menjawab satu pertanyaan sebelum backfill santri.kelas_id dikerjakan:
 * seberapa cocok nilai `kelas_ngaji` di sumber lama dengan baris `kelas`
 * di Supabase?
 *
 * Kenapa dua sumber: santri Kelp Petemon (kelompok 1) sudah pindah ke
 * Firestore (FIRESTORE_KELOMPOK_TABLES_ di Modul_Utilities.gs), sisanya
 * masih di Google Sheets. Membaca satu saja akan melewatkan separuh data.
 *
 * Keluarannya: berkas JSON pemetaan (santri_id, kelompok_id, kelas_ngaji)
 * di scratchpad + ringkasan nilai distinct per kelompok. TIDAK menulis
 * apa pun ke sumber mana pun.
 *
 *   node tools/audit_kelas_ngaji.js [berkas-keluaran.json]
 */

const fs = require('fs');
const path = require('path');

const AKAR = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(AKAR, '.env') });

const { google } = require('googleapis');
const admin = require('firebase-admin');

const KELUARAN = process.argv[2] || path.join(AKAR, 'kelas_ngaji_sumber.json');

async function dariSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(AKAR, process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'santri!A1:AZ2000',
  });
  const baris = res.data.values || [];
  if (baris.length === 0) return [];
  const kepala = baris[0];
  const iId = kepala.indexOf('id');
  const iKelompok = kepala.indexOf('kelompok_id');
  const iKelas = kepala.indexOf('kelas_ngaji');
  const iNama = kepala.indexOf('nama');
  if (iKelas === -1) throw new Error('kolom kelas_ngaji tidak ada di sheet santri');

  return baris.slice(1).map((r) => ({
    sumber: 'sheets',
    id: String(r[iId] ?? '').trim(),
    kelompok_id: String(r[iKelompok] ?? '').trim(),
    nama: String(r[iNama] ?? '').trim(),
    kelas_ngaji: String(r[iKelas] ?? '').trim(),
  }));
}

async function dariFirestore() {
  admin.initializeApp({
    credential: admin.credential.cert(
      require(path.resolve(AKAR, process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH))
    ),
    projectId: process.env.FIRESTORE_PROJECT_ID,
  });
  const db = admin.firestore();

  const hasil = [];
  const kelompokRefs = await db.collection('kelompok').listDocuments();
  for (const ref of kelompokRefs) {
    const snap = await ref.collection('santri').get();
    snap.forEach((doc) => {
      const d = doc.data();
      hasil.push({
        sumber: 'firestore',
        id: String(d.id ?? doc.id).trim(),
        kelompok_id: String(d.kelompok_id ?? ref.id).trim(),
        nama: String(d.nama ?? '').trim(),
        kelas_ngaji: String(d.kelas_ngaji ?? '').trim(),
      });
    });
  }
  return hasil;
}

async function main() {
  const [sheets, firestore] = await Promise.all([dariSheets(), dariFirestore()]);

  // Firestore menang untuk kelompok yang sudah pindah: baris Sheets-nya
  // ditinggalkan sebagai salinan basi (pola sama dipakai audit ETL lama).
  const kelompokFirestore = new Set(firestore.map((r) => r.kelompok_id));
  const gabungan = firestore.concat(
    sheets.filter((r) => !kelompokFirestore.has(r.kelompok_id))
  );

  const perKelompok = {};
  for (const r of gabungan) {
    if (!r.id) continue;
    const k = r.kelompok_id || '(kosong)';
    perKelompok[k] = perKelompok[k] || { total: 0, kosong: 0, nilai: {} };
    perKelompok[k].total += 1;
    if (!r.kelas_ngaji) {
      perKelompok[k].kosong += 1;
    } else {
      perKelompok[k].nilai[r.kelas_ngaji] = (perKelompok[k].nilai[r.kelas_ngaji] || 0) + 1;
    }
  }

  console.log('SUMBER: Sheets', sheets.length, 'baris | Firestore', firestore.length, 'baris');
  console.log('Kelompok yang dibaca dari Firestore:', [...kelompokFirestore].join(', ') || '(tidak ada)');
  console.log('Total dipakai:', gabungan.length, 'baris');
  console.log('');

  Object.keys(perKelompok)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((k) => {
      const p = perKelompok[k];
      console.log(`kelompok ${k}: ${p.total} santri, ${p.kosong} tanpa kelas_ngaji`);
      Object.entries(p.nilai)
        .sort((a, b) => b[1] - a[1])
        .forEach(([nama, n]) => console.log(`    "${nama}" -> ${n}`));
    });

  fs.writeFileSync(KELUARAN, JSON.stringify(gabungan, null, 2));
  console.log('');
  console.log('Pemetaan mentah ditulis ke', KELUARAN);
}

main().catch((e) => {
  console.error('GAGAL:', e.message);
  process.exit(1);
});
