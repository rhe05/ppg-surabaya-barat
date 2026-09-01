-- =====================================================================
-- 20260901110000_santri_kelas_riwayat.sql
--
-- MASALAH: Riwayat Kehadiran menyaring santri dgn santri.kelas_id (nilai
-- SEKARANG), padahal `absensi` tidak menyimpan kelas sama sekali (kolomnya
-- cuma santri_id/kelompok_id/tanggal/status). Akibatnya begitu seorang
-- santri naik/pindah kelas, SELURUH riwayat bulan-bulan lampau ikut
-- berpindah ke kelas barunya -- guru kelas lama kehilangan datanya, guru
-- kelas baru melihat kehadiran yang bukan miliknya.
--
-- Ini melengkapi period-awareness yang sudah ada utk status aktif
-- (santri.deleted_at sbg "sejak kapan tidak aktif", migrasi 20260821130000
-- & 20260821140000) -- sekarang KEANGGOTAAN KELAS juga punya rentang waktu.
--
-- ATURAN TANGGAL BERLAKU (keputusan owner 2026-09-01): perpindahan selalu
-- berlaku sejak AWAL BULAN saat perpindahan dilakukan. Dipindah tanggal
-- berapa pun di September = terhitung kelas baru sejak 1 September, jadi
-- satu santri tidak pernah terbelah dua kelas dalam satu bulan dan filter
-- bulanan tetap bersih.
--
-- DATA LAMA: di-backfill satu baris per santri = kelas yang dia tempati
-- SEKARANG, berlaku sejak mulai_ngaji. Riwayat kelas sebelum migrasi ini
-- memang tidak ada di mana pun & tidak bisa direkonstruksi (absensi tidak
-- menyimpan kelas) -- jadi bulan lampau tetap menampilkan santri di kelas
-- terakhirnya. Akurat mulai perpindahan BERIKUTNYA.
--
-- Isi:
--   1. tabel santri_kelas_riwayat + indeks
--   2. RLS: SELECT saja (scope sama spt santri); tulis HANYA lewat trigger
--   3. trigger sinkron_santri_kelas_riwayat (INSERT & UPDATE santri)
--   4. backfill dari santri.kelas_id
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Tabel
-- ---------------------------------------------------------------------
-- `mulai` & `selesai` dua-duanya INKLUSIF; selesai NULL = masih berlaku.
CREATE TABLE IF NOT EXISTS public.santri_kelas_riwayat (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  santri_id    bigint NOT NULL REFERENCES public.santri(id) ON DELETE CASCADE,
  kelompok_id  bigint NOT NULL,
  kelas_id     bigint NOT NULL REFERENCES public.kelas(id),
  mulai        date NOT NULL,
  selesai      date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT santri_kelas_riwayat_rentang_masuk_akal CHECK (selesai IS NULL OR selesai >= mulai)
);

-- Satu santri tidak boleh punya dua baris terbuka sekaligus.
CREATE UNIQUE INDEX IF NOT EXISTS santri_kelas_riwayat_satu_terbuka
  ON public.santri_kelas_riwayat (santri_id) WHERE selesai IS NULL;

-- Pola query utamanya: "santri mana saja yang ada di kelas X selama
-- rentang tanggal Y" -- kelas_id dulu, lalu saring rentang.
CREATE INDEX IF NOT EXISTS santri_kelas_riwayat_kelas_rentang
  ON public.santri_kelas_riwayat (kelas_id, mulai, selesai);
CREATE INDEX IF NOT EXISTS santri_kelas_riwayat_santri
  ON public.santri_kelas_riwayat (santri_id, mulai);

COMMENT ON TABLE public.santri_kelas_riwayat IS
  'Riwayat keanggotaan kelas per santri (mulai & selesai INKLUSIF, selesai NULL = masih berlaku). Diisi OTOMATIS oleh trigger sinkron_santri_kelas_riwayat -- jangan ditulis langsung dari aplikasi. Dipakai layar Riwayat Kehadiran supaya bulan lampau menampilkan santri di kelasnya SAAT ITU, bukan kelasnya sekarang.';

-- ---------------------------------------------------------------------
-- 2. RLS -- baca saja, scope sama spt santri_select_scoped
-- ---------------------------------------------------------------------
ALTER TABLE public.santri_kelas_riwayat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "santri_kelas_riwayat_select_scoped" ON public.santri_kelas_riwayat;
CREATE POLICY "santri_kelas_riwayat_select_scoped" ON public.santri_kelas_riwayat
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active
      AND ( p.role = 'admin_ppg'
         OR (p.role = 'admin_desa'
             AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k
                                     WHERE k.id = santri_kelas_riwayat.kelompok_id))
         OR (p.role = 'admin_kelompok'
             AND p.scope_kelompok_id = santri_kelas_riwayat.kelompok_id)
         OR (p.role = 'guru'
             AND p.scope_kelompok_id = santri_kelas_riwayat.kelompok_id) )));

-- Sengaja TIDAK ada policy INSERT/UPDATE/DELETE: satu-satunya penulis
-- adalah trigger di bawah (SECURITY DEFINER, milik pemilik tabel).

-- ---------------------------------------------------------------------
-- 3. Trigger
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sinkron_santri_kelas_riwayat()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mulai        date;
  v_kelas_buka   bigint;
begin
  if TG_OP = 'INSERT' then
    if new.kelas_id is null then
      return new;
    end if;
    -- Santri baru: riwayatnya mulai sejak dia mulai ngaji, BUKAN awal
    -- bulan -- ini bukan perpindahan, ini titik nol datanya.
    insert into santri_kelas_riwayat (santri_id, kelompok_id, kelas_id, mulai)
    values (new.id, new.kelompok_id, new.kelas_id, coalesce(new.mulai_ngaji, current_date));
    return new;
  end if;

  if new.kelas_id is null or new.kelas_id is not distinct from old.kelas_id then
    return new;
  end if;

  v_mulai := date_trunc('month', current_date)::date;

  -- Perpindahan KEDUA di bulan yang sama: baris yang baru dibuat bulan ini
  -- dibuang, bukan ditutup -- kalau ditutup selesai-nya akan jatuh sebelum
  -- mulai-nya (melanggar CHECK) dan bulan ini jadi punya dua kelas.
  delete from santri_kelas_riwayat
   where santri_id = new.id and mulai >= v_mulai;

  select kelas_id into v_kelas_buka
    from santri_kelas_riwayat
   where santri_id = new.id and selesai is null;

  -- Pindah lalu balik lagi ke kelas semula dalam bulan yang sama:
  -- baris lamanya dibiarkan terbuka apa adanya, tidak perlu baris baru.
  if v_kelas_buka is not distinct from new.kelas_id then
    return new;
  end if;

  update santri_kelas_riwayat
     set selesai = v_mulai - 1
   where santri_id = new.id and selesai is null;

  insert into santri_kelas_riwayat (santri_id, kelompok_id, kelas_id, mulai)
  values (new.id, new.kelompok_id, new.kelas_id, v_mulai);

  return new;
end;
$function$;

COMMENT ON FUNCTION public.sinkron_santri_kelas_riwayat() IS
  'Menjaga santri_kelas_riwayat sinkron dgn santri.kelas_id. Perpindahan berlaku sejak AWAL BULAN saat dipindah (keputusan owner 2026-09-01), santri baru sejak mulai_ngaji.';

-- SENGAJA `AFTER INSERT OR UPDATE` polos, BUKAN `UPDATE OF kelas_id`:
-- aplikasi tidak pernah menulis kelas_id langsung, dia menulis kelas_ngaji
-- lalu trigger sinkron_santri_kelas (migrasi 20260819110000) yang
-- menurunkan kelas_id. `UPDATE OF kolom` hanya menyala kalau kolom itu
-- disebut di SET, jadi versi itu TIDAK PERNAH menyala (terbukti saat uji).
-- Perbandingan old/new tetap dilakukan di dalam fungsi.
DROP TRIGGER IF EXISTS trg_sinkron_santri_kelas_riwayat ON public.santri;
CREATE TRIGGER trg_sinkron_santri_kelas_riwayat
  AFTER INSERT OR UPDATE ON public.santri
  FOR EACH ROW EXECUTE FUNCTION public.sinkron_santri_kelas_riwayat();

-- ---------------------------------------------------------------------
-- 4. Backfill
-- ---------------------------------------------------------------------
-- Termasuk santri yang sudah soft-deleted -- riwayat kehadiran bulan
-- lampau memang masih menampilkan mereka (lihat migrasi 20260821140000).
INSERT INTO public.santri_kelas_riwayat (santri_id, kelompok_id, kelas_id, mulai)
SELECT s.id, s.kelompok_id, s.kelas_id, coalesce(s.mulai_ngaji, s.created_at::date, date '2020-01-01')
  FROM public.santri s
 WHERE s.kelas_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.santri_kelas_riwayat r WHERE r.santri_id = s.id);

COMMIT;
