-- =====================================================================
-- VERIFIKASI MANUAL RLS jurnal_kbm (dijalankan di Supabase SQL Editor
-- project produksi fnhqtkqswxsqmjxynldg, SETELAH migrasi
-- 20260817090000_jurnal_kbm_rls_dan_trigger.sql di-push).
--
-- Jalankan SATU PER SATU. Setiap query berdiri sendiri, dibungkus
-- BEGIN ... ROLLBACK sehingga TIDAK meninggalkan baris apa pun.
--
-- SQL Editor berjalan sebagai postgres (superuser, BYPASSRLS), jadi
-- INSERT biasa tidak akan pernah tertahan RLS. Karena itu tiap query
-- menyamar jadi pengguna sungguhan lewat set_config('request.jwt.claim.sub')
-- + SET LOCAL ROLE authenticated -- persis yang dilakukan PostgREST.
--
-- Data acuan produksi per 2026-08-17:
--   profile guru  : 96403f81-feaa-46d9-ba01-358e6d662a74 (Neiza, guru_id 22, kelompok 1)
--   kelas 2 "1A"        -> guru_id 22  = kelas yang DIA AMPU
--   kelas 3 "1B"        -> guru_id 23  = se-kelompok, BUKAN dia ampu
--   admin_kelompok      : 65360dce-543c-4557-a1e2-68e8c2181eab (scope kelompok 6)
--   admin_ppg           : c1a1b64c-14c5-4da3-9742-84a8d9d42cd9
-- =====================================================================


-- ─── Q1. Guru insert jurnal untuk kelas yang DIA AMPU -> HARUS SUKSES ───
BEGIN;
CREATE TEMP TABLE r (skenario text, harapan text, hasil text) ON COMMIT DROP;
DO $$
DECLARE v_id bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '96403f81-feaa-46d9-ba01-358e6d662a74', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO jurnal_kbm (kelompok_id, kelas_id, tanggal, materi)
    VALUES (1, 2, '2026-08-17', 'Uji Q1') RETURNING id INTO v_id;
    RESET ROLE;
    INSERT INTO r VALUES ('Q1 guru insert kelas miliknya (kelas 2)', 'SUKSES', 'SUKSES, id='||v_id);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO r VALUES ('Q1 guru insert kelas miliknya (kelas 2)', 'SUKSES', 'GAGAL: '||SQLERRM);
  END;
  RESET ROLE;
END $$;
SELECT * FROM r;
ROLLBACK;


-- ─── Q2. Guru insert untuk kelas yang BUKAN dia ampu -> HARUS DITOLAK ───
--     kelas 3 ada di kelompok yang SAMA (kelompok 1), jadi ini membuktikan
--     batasnya benar-benar per-kelas, bukan cuma per-kelompok.
BEGIN;
CREATE TEMP TABLE r (skenario text, harapan text, hasil text) ON COMMIT DROP;
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '96403f81-feaa-46d9-ba01-358e6d662a74', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO jurnal_kbm (kelompok_id, kelas_id, tanggal, materi)
    VALUES (1, 3, '2026-08-17', 'Uji Q2');
    RESET ROLE;
    INSERT INTO r VALUES ('Q2 guru insert kelas BUKAN miliknya (kelas 3, se-kelompok)', 'DITOLAK', 'LOLOS -- BOCOR!');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO r VALUES ('Q2 guru insert kelas BUKAN miliknya (kelas 3, se-kelompok)', 'DITOLAK', 'DITOLAK: '||SQLERRM);
  END;
  RESET ROLE;
END $$;
SELECT * FROM r;
ROLLBACK;


-- ─── Q3. Guru kirim kelompok_id PALSU saat insert kelas miliknya ───
--     -> insert boleh lolos, TAPI kelompok_id yang tersimpan harus tetap 1
--        (ditimpa trigger), bukan 6 yang dikirim.
BEGIN;
CREATE TEMP TABLE r (skenario text, harapan text, hasil text) ON COMMIT DROP;
DO $$
DECLARE v_kel bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '96403f81-feaa-46d9-ba01-358e6d662a74', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO jurnal_kbm (kelompok_id, kelas_id, tanggal, materi)
    VALUES (6, 2, '2026-08-17', 'Uji Q3 kelompok_id palsu') RETURNING kelompok_id INTO v_kel;
    RESET ROLE;
    INSERT INTO r VALUES ('Q3 guru kirim kelompok_id=6 (palsu) utk kelas 2 di kelompok 1',
      'kelompok_id tersimpan = 1',
      CASE WHEN v_kel = 1 THEN 'BENAR, tersimpan '||v_kel||' -- kiriman palsu diabaikan'
           ELSE 'BOCOR! tersimpan '||v_kel END);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO r VALUES ('Q3 guru kirim kelompok_id=6 (palsu) utk kelas 2 di kelompok 1',
      'kelompok_id tersimpan = 1', 'GAGAL: '||SQLERRM);
  END;
  RESET ROLE;
END $$;
SELECT * FROM r;
ROLLBACK;


-- ─── Q4. admin_kelompok (scope kelompok 6) insert untuk kelas di kelompok 1
--        -> HARUS DITOLAK ───
BEGIN;
CREATE TEMP TABLE r (skenario text, harapan text, hasil text) ON COMMIT DROP;
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '65360dce-543c-4557-a1e2-68e8c2181eab', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO jurnal_kbm (kelompok_id, kelas_id, tanggal, materi)
    VALUES (6, 2, '2026-08-17', 'Uji Q4');
    RESET ROLE;
    INSERT INTO r VALUES ('Q4 admin_kelompok(scope 6) insert utk kelas 2 (kelompok 1)', 'DITOLAK', 'LOLOS -- BOCOR!');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO r VALUES ('Q4 admin_kelompok(scope 6) insert utk kelas 2 (kelompok 1)', 'DITOLAK', 'DITOLAK: '||SQLERRM);
  END;
  RESET ROLE;
END $$;
SELECT * FROM r;
ROLLBACK;


-- ─── Q5. admin_ppg insert untuk kelas mana pun -> HARUS SUKSES ───
BEGIN;
CREATE TEMP TABLE r (skenario text, harapan text, hasil text) ON COMMIT DROP;
DO $$
DECLARE v_id bigint; v_kel bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'c1a1b64c-14c5-4da3-9742-84a8d9d42cd9', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO jurnal_kbm (kelompok_id, kelas_id, tanggal, materi)
    VALUES (1, 3, '2026-08-17', 'Uji Q5') RETURNING id, kelompok_id INTO v_id, v_kel;
    RESET ROLE;
    INSERT INTO r VALUES ('Q5 admin_ppg insert utk kelas 3', 'SUKSES', 'SUKSES, id='||v_id||' kelompok_id='||v_kel);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO r VALUES ('Q5 admin_ppg insert utk kelas 3', 'SUKSES', 'GAGAL: '||SQLERRM);
  END;
  RESET ROLE;
END $$;
SELECT * FROM r;
ROLLBACK;


-- ─── Q6 (opsional, cek struktur -- tidak mengubah apa pun) ───
SELECT policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename='jurnal_kbm' ORDER BY cmd;
-- Harapan: 3 baris (INSERT, SELECT, UPDATE). TIDAK ADA baris DELETE.

SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid='public.jurnal_kbm'::regclass AND NOT tgisinternal ORDER BY tgname;
-- Harapan: trg_jurnal_kbm_sync_kelompok_id (BEFORE INSERT OR UPDATE OF kelas_id, kelompok_id)
--          dan trg_jurnal_kbm_updated_at.

SELECT count(*) AS baris_jurnal_tertinggal FROM jurnal_kbm;
-- Harapan: 0 -- membuktikan seluruh Q1-Q5 benar-benar ter-ROLLBACK.
