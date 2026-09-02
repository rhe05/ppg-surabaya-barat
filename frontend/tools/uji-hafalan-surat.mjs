/* Uji penguraian lib/hafalanSurat.ts terhadap teks Prota SUNGGUHAN di
   produksi (kategori "Hafalan Surat-Surat Al-Qur'an", PAUD-TK s.d. 12).
   Bukan unit test dgn data karangan: teksnya diambil apa adanya dari
   Supabase, karena justru ejaan & bentuk kalimat aslinya yang selama ini
   membuat penguraian gagal diam-diam.

   Jalankan: node tools/uji-hafalan-surat.mjs
   Butuh SUPABASE_ACCESS_TOKEN di ../.env (lihat memory Management API).

   LULUS bila tiap baris materi BARU terurai jadi nama-nama surat pendek,
   bukan kalimat panjang. Baris "surat-surat pilihan (…ayat…)" memang
   sengaja tidak terurai — itu potongan ayat, bukan rentang Juz 'Amma. */

/* Impor .ts langsung mengandalkan pelucutan tipe bawaan Node >= 22.18
   (berkas lib/hafalanSurat.ts sengaja bebas fitur TS yang butuh
   transpilasi sungguhan, jadi tidak perlu tsx/ts-node). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { barisHafalanDariTeks, uraikanBarisHafalan } from '../lib/hafalanSurat.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(here, '..', '..', '.env'), 'utf8');
const token = env.match(/^SUPABASE_ACCESS_TOKEN=(.*)$/m)[1].trim();

const res = await fetch(
  'https://api.supabase.com/v1/projects/fnhqtkqswxsqmjxynldg/database/query',
  {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query:
        "select p.kelas, p.target, p.target2 from kurikulum_prota p " +
        "join kategori_kbm k on k.id = p.kategori_kbm_id " +
        "where k.nama like 'Hafalan Surat%' " +
        "order by (case when p.kelas ~ '^[0-9]+$' then p.kelas::int else 0 end)",
    }),
  }
);
const baris = await res.json();

let gagal = 0;
for (const r of baris) {
  console.log('\n=== ' + (r.kelas === 'PAUD-TK' ? 'PAUD/TK' : 'Kelas ' + r.kelas));
  for (const [teks, sem] of [[r.target, 1], [r.target2, 2]]) {
    for (const b of barisHafalanDariTeks(teks)) {
      const hasil = uraikanBarisHafalan(b);
      const takTerurai = hasil.length === 1 && hasil[0].split(/\s+/).length > 3;
      if (takTerurai && !/ayat|pilihan/i.test(hasil[0])) gagal += 1;
      console.log(
        `  Sem ${sem} ${takTerurai ? '(utuh)' : '->'} ` + hasil.join(' · ')
      );
    }
  }
}
console.log(
  '\n' + (gagal === 0 ? 'LULUS' : 'GAGAL: ' + gagal) + ' baris panjang yang seharusnya terurai.'
);
process.exitCode = gagal === 0 ? 0 : 1;
