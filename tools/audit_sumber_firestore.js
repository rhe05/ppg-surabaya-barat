/**
 * Hitung dokumen per kelompok di Firestore sumber (read-only).
 * Pasangan tools/audit_sumber_sheets.js — bersama-sama menjawab: benarkah
 * 14 kelompok "belum di-ETL", atau memang tidak punya data di mana pun?
 */
require('dotenv').config();
const admin = require('firebase-admin');

const SUB = ['santri', 'guru', 'jadwal_kbm', 'jadwal_kategori_hari', 'absensi', 'jurnal_kbm', 'pengumuman'];

async function main() {
  admin.initializeApp({
    credential: admin.credential.cert(require(require("path").resolve(__dirname, "..", process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH))),
    projectId: process.env.FIRESTORE_PROJECT_ID,
  });
  const db = admin.firestore();

  const kelompok = await db.collection('kelompok').listDocuments();
  console.log('Dokumen kelompok di Firestore:', kelompok.map((d) => d.id).join(', ') || '(tidak ada)');
  console.log('');

  for (const ref of kelompok) {
    const bagian = [];
    for (const sub of SUB) {
      const snap = await ref.collection(sub).count().get();
      const n = snap.data().count;
      if (n > 0) bagian.push(`${sub}:${n}`);
    }
    console.log(`kelompok/${ref.id} -> ${bagian.join(' ') || '(semua sub-koleksi kosong)'}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('GAGAL:', e.message);
    process.exit(1);
  });
