-- =====================================================================
-- 20260818170000_empat_modul_kecil_rls.sql
--
-- Fondasi DB untuk empat modul kecil yang digarap sekaligus:
-- Siklus Generus, Pengurus Kelompok, Quote Harian, dan Kop Surat.
--
-- Keenam tabelnya (`siklus_generus`, `pengurus_kelp`, `jabatan_pengurus`,
-- `quote_harian`, `kop_surat`, `kop_surat_baris`) punya RLS AKTIF dengan
-- NOL policy — pola yang sama seperti pengumuman/konseling/calendar_events:
-- tertutup senyap, SELECT selalu 0 baris, INSERT selalu ditolak, tanpa
-- pesan error apa pun.
--
-- Tiga bentuk tabel yang berbeda, jadi aturannya juga berbeda:
--
-- A. BER-KELOMPOK (siklus_generus, pengurus_kelp, kop_surat)
--    Scope biasa. `guru` boleh MEMBACA (daftar pengurus & siklus generus
--    memang informasi umum di kelompoknya), menulis hanya admin.
--
-- B. REFERENSI PPG-WIDE (jabatan_pengurus)
--    Tidak punya kolom kelompok_id. Semua pengguna aktif boleh membaca,
--    hanya admin_ppg yang boleh mengubah daftarnya.
--
-- C. TURUNAN (kop_surat_baris)
--    Tidak punya kelompok_id sendiri; hak aksesnya MENUMPANG pada baris
--    induk `kop_surat` lewat subquery. Ini satu-satunya cara yang benar —
--    memberi policy longgar di sini akan membocorkan isi kop surat
--    kelompok lain walau tabel induknya sudah rapat.
--
-- Selain policy, migrasi ini mengisi `jabatan_pengurus` dengan 10 dapukan
-- baku dari JABATAN_PENGURUS_ (Modul_MaintainPengurus.gs:15-26) berikut
-- penanda `is_multi_holder` dari MULTI_HOLDER_JABATAN_ (baris 30): hanya
-- "Wk Pembina Generus Kelp" yang boleh dijabat lebih dari satu orang. Di
-- app lama daftar ini cuma konstanta di kode sehingga tidak pernah ikut
-- ter-ETL, sama seperti kategori pengumuman kemarin.
--
-- Idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ── Seed jabatan_pengurus ────────────────────────────────────────────
INSERT INTO public.jabatan_pengurus (nama, is_multi_holder, urutan)
SELECT v.nama, v.multi, v.urutan
  FROM (VALUES
    ('Pembina Generus Kelp',    false, 1),
    ('Wk Pembina Generus Kelp', true,  2),
    ('PJP Kelp',                false, 3),
    ('Kepsek',                  false, 4),
    ('Pembina Pra Remaja',      false, 5),
    ('Pembina Remaja',          false, 6),
    ('Ketua Muda-Mudi',         false, 7),
    ('Sekertaris Generus',      false, 8),
    ('Koord Tahfidz',           false, 9),
    ('Bendahara',               false, 10)
  ) AS v(nama, multi, urutan)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.jabatan_pengurus j WHERE j.nama = v.nama
 );

-- ── A. Tabel ber-kelompok ────────────────────────────────────────────
-- Dibuat lewat loop supaya ketiga tabel benar-benar mendapat ekspresi yang
-- IDENTIK. Ditulis tangan tiga kali, satu huruf beda akan lolos tanpa
-- ketahuan — itu persis cara celah scope kemarin lahir.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['siklus_generus', 'pengurus_kelp', 'kop_surat'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_scoped', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        AS PERMISSIVE FOR SELECT TO public
        USING (EXISTS ( SELECT 1
           FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
          WHERE p.is_active AND (
                p.role = 'admin_ppg'
             OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = %I.kelompok_id))
             OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = %I.kelompok_id)
             OR (p.role = 'guru'           AND p.scope_kelompok_id = %I.kelompok_id))))
    $f$, t || '_select_scoped', t, t, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tulis_admin', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        AS PERMISSIVE FOR ALL TO public
        USING (EXISTS ( SELECT 1
           FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
          WHERE p.is_active AND (
                p.role = 'admin_ppg'
             OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = %I.kelompok_id))
             OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = %I.kelompok_id))))
        WITH CHECK (EXISTS ( SELECT 1
           FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
          WHERE p.is_active AND (
                p.role = 'admin_ppg'
             OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = %I.kelompok_id))
             OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = %I.kelompok_id))))
    $f$, t || '_tulis_admin', t, t, t, t, t);
  END LOOP;
END
$$;

-- ── B. Referensi PPG-wide ────────────────────────────────────────────
DROP POLICY IF EXISTS "jabatan_pengurus_select_semua" ON public.jabatan_pengurus;
CREATE POLICY "jabatan_pengurus_select_semua" ON public.jabatan_pengurus
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active));

DROP POLICY IF EXISTS "jabatan_pengurus_tulis_ppg" ON public.jabatan_pengurus;
CREATE POLICY "jabatan_pengurus_tulis_ppg" ON public.jabatan_pengurus
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND p.role = 'admin_ppg'))
  WITH CHECK (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND p.role = 'admin_ppg'));

-- quote_harian: PPG-wide juga (satu daftar kutipan dipakai semua kelompok),
-- dan penulisnya HANYA admin_ppg. serverAddQuote/serverDeleteQuote/
-- serverGetQuoteList app lama sama-sama dibuka dengan requireAdminPpg_
-- (Modul_QuoteHarian.gs:57, 79, 45) — bukan pemeriksaan sesi biasa.
-- Semua peran aktif tetap boleh MEMBACA, karena kutipannya ditampilkan di
-- dashboard semua orang.
DROP POLICY IF EXISTS "quote_harian_select_semua" ON public.quote_harian;
CREATE POLICY "quote_harian_select_semua" ON public.quote_harian
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active));

DROP POLICY IF EXISTS "quote_harian_tulis_admin" ON public.quote_harian;
CREATE POLICY "quote_harian_tulis_admin" ON public.quote_harian
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND p.role = 'admin_ppg'))
  WITH CHECK (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND p.role = 'admin_ppg'));

-- ── C. Turunan: menumpang hak akses induknya ─────────────────────────
--
-- BACA boleh menumpang keterlihatan induk: RLS ikut berlaku pada subquery,
-- jadi baris yang induknya tidak terlihat otomatis ikut tidak terlihat.
--
-- TULIS TIDAK BOLEH menumpang cara yang sama. Kalau syaratnya cuma "induk
-- terlihat", role `guru` — yang memang boleh MEMBACA kop surat kelompoknya
-- — akan lolos menulis baris kop surat. Karena itu syarat tulisnya
-- memeriksa scope ADMIN pada kelompok induk secara eksplisit.
DROP POLICY IF EXISTS "kop_surat_baris_ikut_induk" ON public.kop_surat_baris;

DROP POLICY IF EXISTS "kop_surat_baris_select_ikut_induk" ON public.kop_surat_baris;
CREATE POLICY "kop_surat_baris_select_ikut_induk" ON public.kop_surat_baris
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1 FROM public.kop_surat ks WHERE ks.id = kop_surat_baris.kop_surat_id));

DROP POLICY IF EXISTS "kop_surat_baris_tulis_admin" ON public.kop_surat_baris;
CREATE POLICY "kop_surat_baris_tulis_admin" ON public.kop_surat_baris
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
   FROM public.kop_surat ks,
        auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE ks.id = kop_surat_baris.kop_surat_id AND p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = ks.kelompok_id))
     OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = ks.kelompok_id))))
  WITH CHECK (EXISTS ( SELECT 1
   FROM public.kop_surat ks,
        auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE ks.id = kop_surat_baris.kop_surat_id AND p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = ks.kelompok_id))
     OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = ks.kelompok_id))));

COMMIT;
