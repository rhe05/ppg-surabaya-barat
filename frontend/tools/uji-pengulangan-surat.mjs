/* Uji end-to-end fondasi "Pengulangan" (migrasi 20260902150000) langsung
   ke produksi lewat Management API -- SELURUHNYA di dalam satu transaksi
   yang di-ROLLBACK di akhir, jadi nol dampak ke data sungguhan. Jalankan
   ulang kapan pun setelah menyentuh trigger/RPC-nya, atau saat menyusun
   Fase 2 (Hafalan Do'a) untuk memastikan Fase 1 belum ikut rusak.

   Butuh SUPABASE_ACCESS_TOKEN di ../.env (lihat memory Management API).
   Jalankan: node tools/uji-pengulangan-surat.mjs

   Skenario: kelas 2 (kelas 1A, guru_id 22), dua sesi Klasikal
   'disampaikan' di bulan yang sengaja BUKAN bulan berjalan (Oktober
   2026) supaya tidak bentrok dgn indeks anti-dobel (migrasi
   20260902140000) terhadap baris produksi yang sudah ada.

     Sesi 1 (10-06): An-Nas, Al-Falaq   Sesi 2 (10-13): An-Nas

   Tiga santri pertama kelas itu diberi pola kehadiran berbeda:
     santri A -- hadir kedua sesi        -> harus 1/1 dan 2/2
     santri B -- hadir sesi 1 saja       -> harus 1/1 dan 1/2
     santri C -- tidak hadir sama sekali -> harus 0/1 dan 0/2
   Ditambah: guru yang BUKAN pemilik kelas mencoba RPC per-santri ->
   harus ditolak dengan pesan, bukan menembus atau galat generik. */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(DIR, '..', '..', '.env'), 'utf8');
const token = env.match(/^SUPABASE_ACCESS_TOKEN=(.*)$/m)[1].trim();
const REF = 'fnhqtkqswxsqmjxynldg';

const KELAS_UJI = 2; // 1A, guru_id 22
const GURU_PEMILIK = '96403f81-feaa-46d9-ba01-358e6d662a74'; // guru_id 22
const GURU_LAIN = 'd4749a9d-7e6d-40b4-aca5-a12b41561de8'; // guru_id 41, kelompok lain

async function jalankan(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const j = await r.json();
  if (j && j.message) throw new Error(j.message);
  return j;
}

const sql = `
begin;

do $$
declare
  v_kelas bigint := ${KELAS_UJI};
  v_kelompok bigint;
  v_s1 bigint; v_s2 bigint; v_s3 bigint;
begin
  select kelompok_id into v_kelompok from kelas where id = v_kelas;
  select id into v_s1 from santri where kelas_id = v_kelas and deleted_at is null order by id limit 1 offset 0;
  select id into v_s2 from santri where kelas_id = v_kelas and deleted_at is null order by id limit 1 offset 1;
  select id into v_s3 from santri where kelas_id = v_kelas and deleted_at is null order by id limit 1 offset 2;

  insert into jurnal_materi (kelas_id, kelompok_id, tahun, bulan, minggu_ke, judul, jenis, status,
    tanggal_rencana, tanggal_disampaikan, klasikal_hafalan_surat)
  values (v_kelas, v_kelompok, 2026, 10, 1, 'Uji sesi 1', 'klasikal', 'disampaikan',
    '2026-10-06', '2026-10-06', 'An-Nas, Al-Falaq');

  insert into jurnal_materi (kelas_id, kelompok_id, tahun, bulan, minggu_ke, judul, jenis, status,
    tanggal_rencana, tanggal_disampaikan, klasikal_hafalan_surat)
  values (v_kelas, v_kelompok, 2026, 10, 2, 'Uji sesi 2', 'klasikal', 'disampaikan',
    '2026-10-13', '2026-10-13', 'An-Nas');

  insert into absensi (santri_id, kelompok_id, tanggal, status)
  values
    (v_s1, v_kelompok, '2026-10-06', 'hadir'),
    (v_s1, v_kelompok, '2026-10-13', 'hadir'),
    (v_s2, v_kelompok, '2026-10-06', 'hadir'),
    (v_s2, v_kelompok, '2026-10-13', 'alpa'),
    (v_s3, v_kelompok, '2026-10-06', 'alpa')
  on conflict (santri_id, tanggal) where deleted_at is null do update set status = excluded.status;
end $$;

create temp table hasil_uji (bagian text, a text, b text, c text, d text);
grant insert, select on hasil_uji to authenticated;

insert into hasil_uji
  select 'turunan', tanggal::text, nama_surat, null
  from jurnal_materi_hafalan_surat where kelas_id = ${KELAS_UJI} and tanggal >= '2026-10-01';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${GURU_PEMILIK}","role":"authenticated"}', true);

insert into hasil_uji
  select 'rpc_kelas', nama_surat, jumlah::text, terakhir::text
  from jurnal_pengulangan_kelas(${KELAS_UJI}, '2026-10-01', '2026-10-31');

insert into hasil_uji
  select 'rpc_santri', nama_santri, nama_surat, jumlah_efektif::text || '/' || jumlah_kelas::text
  from jurnal_pengulangan_santri(${KELAS_UJI}, '2026-10-01', '2026-10-31')
  where nama_santri in (
    select coalesce(nullif(btrim(nama_panggilan),''), nama) from santri
    where id in (select id from santri where kelas_id=${KELAS_UJI} and deleted_at is null order by id limit 3)
  );

select set_config('request.jwt.claims', '{"sub":"${GURU_LAIN}","role":"authenticated"}', true);
do $$
begin
  perform * from jurnal_pengulangan_santri(${KELAS_UJI}, '2026-10-01', '2026-10-31');
  insert into hasil_uji values ('penolakan', 'BAHAYA: guru lain LOLOS', null, null);
exception when others then
  insert into hasil_uji values ('penolakan', 'ditolak', sqlerrm, null);
end $$;

select * from hasil_uji order by bagian, a;

rollback;
`;

const baris = await jalankan(sql);

console.log('── turunan (trigger) ──');
for (const r of baris.filter((x) => x.bagian === 'turunan')) console.log(`  ${r.a}  ${r.b}`);

console.log('── rpc_kelas ──');
for (const r of baris.filter((x) => x.bagian === 'rpc_kelas')) console.log(`  ${r.a.padEnd(10)} ${r.b}x  (terakhir ${r.c})`);

console.log('── rpc_santri (efektif/total) ──');
for (const r of baris.filter((x) => x.bagian === 'rpc_santri')) console.log(`  ${r.a.padEnd(10)} ${r.b.padEnd(10)} ${r.c}`);

console.log('── penolakan guru bukan pemilik ──');
for (const r of baris.filter((x) => x.bagian === 'penolakan')) console.log(`  ${r.a}: ${r.b}`);

const harap = [
  ['turunan', 3],
  ['rpc_kelas', 2],
  ['rpc_santri', 6],
];
let gagal = 0;
for (const [bagian, n] of harap) {
  const jml = baris.filter((x) => x.bagian === bagian).length;
  if (jml !== n) {
    console.log(`GAGAL: ${bagian} seharusnya ${n} baris, dapat ${jml}`);
    gagal += 1;
  }
}
const ditolak = baris.find((x) => x.bagian === 'penolakan');
if (!ditolak || ditolak.a !== 'ditolak') {
  console.log('GAGAL: guru bukan pemilik seharusnya DITOLAK');
  gagal += 1;
}

console.log('\n' + (gagal === 0 ? 'LULUS' : `GAGAL: ${gagal} pemeriksaan`));
process.exitCode = gagal === 0 ? 0 : 1;
