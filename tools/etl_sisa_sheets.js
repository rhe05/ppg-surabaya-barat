/**
 * ETL empat tab Sheets yang tertinggal saat migrasi utama:
 * quote_harian, guru_izin, pengurus_kelp, audit_log.
 *
 * Ditemukan 18 Agt 2026 oleh tools/audit_sisa_sheets.js — audit sebelumnya
 * hanya memeriksa santri/guru/jadwal/absensi, sehingga keempat tab ini
 * lolos dari perhatian.
 *
 * Skrip ini TIDAK menulis ke DB. Ia menghasilkan satu berkas SQL yang bisa
 * diperiksa dulu, lalu dijalankan lewat tools/supabase_query.js.
 *
 * PEMETAAN YANG PERLU DIKETAHUI (semuanya karena skema baru lebih ketat):
 *
 * - `dibuat_oleh` / `dicatat_oleh` / `user_id` di Sheets berisi NAMA atau
 *   angka lama ("Admin PPG", "0"), sedangkan kolom barunya uuid yang
 *   mengacu ke profiles. Tidak ada peta yang sahih dari nama ke akun, jadi
 *   diisi NULL. Menebak pemiliknya lebih buruk daripada mengaku tidak tahu.
 * - guru_izin.jenis 'harian' -> 'izin' (nama enum baru).
 * - pengurus_kelp.jabatan (teks) -> jabatan_id lewat pencocokan nama ke
 *   tabel jabatan_pengurus. Baris dengan jabatan tak dikenal dilewati dan
 *   dilaporkan, bukan dipaksa masuk.
 * - audit_log.detail_perubahan di Sheets berupa kalimat biasa, sedangkan
 *   kolom barunya jsonb. Dibungkus {"catatan": "..."} agar isinya utuh
 *   tanpa memalsukan struktur yang tidak pernah ada.
 * - guru_izin punya EXCLUDE constraint anti-tumpang-tindih; data lama
 *   memuat pengajuan ganda di tanggal yang sama. Baris yang bertabrakan
 *   akan ditolak Postgres, dan itu memang benar — dilaporkan per baris.
 *
 * Pemakaian:
 *   node tools/etl_sisa_sheets.js
 *   node tools/supabase_query.js tools/_etl_sisa_sheets.generated.sql
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const AKAR = path.resolve(__dirname, '..');
const BERKAS_SQL = path.join(AKAR, 'tools', '_etl_sisa_sheets.generated.sql');
const TAB = ['quote_harian', 'guru_izin', 'pengurus_kelp', 'audit_log'];

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

const kutip = (v) => (v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

function stempel(v) {
  if (!v) return 'now()';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 'now()' : `'${d.toISOString()}'::timestamptz`;
}

async function main() {
  const e = env();
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(AKAR, e.GOOGLE_SERVICE_ACCOUNT_KEY_PATH),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: e.SPREADSHEET_ID,
    ranges: TAB.map((t) => `${t}!A1:ZZ`),
  });

  const data = {};
  res.data.valueRanges.forEach((vr, i) => {
    const rows = vr.values || [];
    const hdr = (rows[0] || []).map((h) => String(h).trim());
    data[TAB[i]] = rows
      .slice(1)
      .filter((r) => r.some((c) => String(c).trim() !== ''))
      .map((r) => Object.fromEntries(hdr.map((h, k) => [h, (r[k] ?? '').toString().trim()])));
  });

  const bagian = [];
  const catatan = [];

  /* ── quote_harian ── */
  const q = data.quote_harian.filter((r) => r.teks);
  bagian.push(
    'INSERT INTO public.quote_harian (teks, created_at) VALUES\n' +
      q.map((r) => `  (${kutip(r.teks)}, ${stempel(r.dibuat_pada)})`).join(',\n') +
      ';'
  );
  catatan.push(`quote_harian: ${q.length} baris`);

  /* ── guru_izin ── */
  const gi = data.guru_izin.filter((r) => r.guru_id && r.tanggal_mulai);
  bagian.push(
    gi
      .map(
        (r) =>
          'DO $$ BEGIN\n' +
          '  INSERT INTO public.guru_izin (kelompok_id, guru_id, jenis, tanggal_mulai, tanggal_selesai, alasan_kategori, alasan_detail, created_at)\n' +
          `  VALUES (${r.kelompok_id}, ${r.guru_id}, ${kutip(r.jenis === 'cuti' ? 'cuti' : 'izin')}::guru_izin_jenis, ` +
          `${kutip(r.tanggal_mulai)}::date, ${kutip(r.tanggal_selesai || r.tanggal_mulai)}::date, ` +
          `${kutip(r.alasan_kategori)}, ${kutip(r.alasan_detail)}, ${stempel(r.dibuat_pada)});\n` +
          'EXCEPTION WHEN exclusion_violation THEN\n' +
          `  RAISE NOTICE 'guru_izin dilewati (tumpang tindih): guru % tanggal %', ${r.guru_id}, ${kutip(r.tanggal_mulai)};\n` +
          'END $$;'
      )
      .join('\n')
  );
  catatan.push(`guru_izin: ${gi.length} baris (yang tumpang tindih dilewati otomatis)`);

  /* ── pengurus_kelp ── */
  const pk = data.pengurus_kelp.filter((r) => r.nama && r.jabatan);
  bagian.push(
    'INSERT INTO public.pengurus_kelp (kelompok_id, jabatan_id, nama, mulai_dapukan, keterangan, created_at)\n' +
      'SELECT v.kelompok_id, j.id, v.nama, v.mulai, v.keterangan, v.dibuat\n' +
      '  FROM (VALUES\n' +
      pk
        .map(
          (r) =>
            `    (${r.kelompok_id}::bigint, ${kutip(r.jabatan)}, ${kutip(r.nama)}, ` +
            `${r.mulai_dapukan ? kutip(r.mulai_dapukan) + '::date' : 'NULL::date'}, ` +
            `${kutip(r.keterangan)}, ${stempel(r.dibuat_pada)})`
        )
        .join(',\n') +
      '\n  ) AS v(kelompok_id, jabatan, nama, mulai, keterangan, dibuat)\n' +
      '  JOIN public.jabatan_pengurus j ON j.nama = v.jabatan;'
  );
  bagian.push(
    "DO $$\nDECLARE n int;\nBEGIN\n" +
      `  SELECT ${pk.length} - count(*) INTO n FROM public.pengurus_kelp;\n` +
      "  IF n > 0 THEN RAISE NOTICE 'pengurus_kelp: % baris tidak masuk karena jabatannya tidak dikenal', n; END IF;\n" +
      'END $$;'
  );
  catatan.push(`pengurus_kelp: ${pk.length} baris (jabatan dicocokkan lewat nama)`);

  /* ── audit_log ── */
  const al = data.audit_log.filter((r) => r.table_name && r.action);
  const aksiSah = ['create', 'update', 'delete'];
  const alSah = al.filter((r) => aksiSah.includes(String(r.action).toLowerCase()));
  bagian.push(
    'INSERT INTO public.audit_log (table_name, record_id, action, detail_perubahan, created_at) VALUES\n' +
      alSah
        .map(
          (r) =>
            `  (${kutip(r.table_name)}, ${kutip(r.record_id)}, ${kutip(String(r.action).toLowerCase())}::audit_action, ` +
            `${r.detail_perubahan ? `jsonb_build_object('catatan', ${kutip(r.detail_perubahan)})` : 'NULL'}, ` +
            `${stempel(r.timestamp)})`
        )
        .join(',\n') +
      ';'
  );
  catatan.push(
    `audit_log: ${alSah.length} baris` +
      (al.length !== alSah.length ? ` (${al.length - alSah.length} dilewati, action tidak dikenal)` : '')
  );

  const skrip =
    '-- Dihasilkan oleh tools/etl_sisa_sheets.js — jangan disunting tangan.\n' +
    '-- ' + catatan.join('\n-- ') + '\n\n' +
    'BEGIN;\n\n' +
    bagian.join('\n\n') +
    '\n\nSELECT\n' +
    "  (SELECT count(*) FROM public.quote_harian)::text  AS quote_harian,\n" +
    "  (SELECT count(*) FROM public.guru_izin)::text     AS guru_izin,\n" +
    "  (SELECT count(*) FROM public.pengurus_kelp)::text AS pengurus_kelp,\n" +
    "  (SELECT count(*) FROM public.audit_log)::text     AS audit_log;\n\n" +
    'COMMIT;\n';

  fs.writeFileSync(BERKAS_SQL, skrip);
  catatan.forEach((c) => console.log(c));
  console.log('\nSQL ditulis ke ' + path.relative(AKAR, BERKAS_SQL));
}

main().catch((err) => {
  console.error('GAGAL:', err.message);
  process.exit(1);
});
