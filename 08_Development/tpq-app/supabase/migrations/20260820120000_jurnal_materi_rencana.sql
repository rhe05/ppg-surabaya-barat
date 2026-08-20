-- =====================================================================
-- 20260820120000_jurnal_materi_rencana.sql
--
-- Tabel baru `jurnal_materi` -- fondasi 3 layar "Jurnal Mengajar" (guru
-- mobile) yang diminta owner (20 Agt): Rencana Pembelajaran (daftar materi
-- terencana per minggu dalam sebulan), Pelaksanaan Pembelajaran (tandai
-- materi minggu berjalan sbg sudah/belum disampaikan + catatan), Riwayat
-- Pembelajaran (progres %, filter status, pencarian).
--
-- KENAPA TABEL BARU, BUKAN PERLUASAN `jurnal_kbm` ATAU `kurikulum_probul_
-- minggu` YANG SUDAH ADA (dicek dulu, bukan ditebak):
--   - jurnal_kbm: satu baris = SATU kelas+tanggal, materi teks bebas.
--     Model lama ("apa yang diajarkan hari ini", flat) tidak punya konsep
--     "materi individual dengan status terencana/disampaikan" yang bisa
--     dicentang satu-satu -- mengubahnya berarti mengubah makna tabel yang
--     sudah dipakai fitur Jurnal KBM lama (masih dipertahankan apa adanya
--     di /jurnal utk admin, lihat app/jurnal/page.tsx, TIDAK disentuh).
--   - kurikulum_probul_minggu: satu baris = SATU target teks bebas per
--     minggu (1-4) per kategori_kbm per kelompok -- levelnya "target
--     kelompok/kategori", bukan "daftar materi individual per KELAS" yang
--     bisa dicentang satu-satu spt di layar Pelaksanaan. Menumpangkan
--     model baru ke sana berarti mengubah arti kolom `target` yang sudah
--     dipakai fitur Kurikulum Tahunan (di luar cakupan tugas ini).
--   - kurikulum_pencapaian_santri: level PER SANTRI (pencapaian individual
--     tiap anak thd probul), bukan level per-KELAS "apakah materi ini
--     sudah diajarkan ke kelas hari ini" -- pertanyaan yang beda.
-- Jadi jurnal_materi berdiri sendiri, TIDAK terhubung FK ke kurikulum_*
-- ataupun jurnal_kbm (dicek: tidak ada tabel lain yang mereferensikan
-- konsep ini sebelumnya).
--
-- Pembagian minggu dalam bulan SENGAJA disederhanakan jadi rentang
-- tanggal tetap (1-7 / 8-14 / 15-21 / 22-28 / 29-31 = minggu 1-5), BUKAN
-- diturunkan dari hari KBM sungguhan di jadwal_kbm (yang perlu logic
-- tambahan menghitung tanggal-tanggal cocok per hari-dalam-minggu). Beda
-- dari iaRiwayatBucketMinggu_ (app/absensi/riwayat/page.tsx, dihitung dari
-- hari Senin) -- di sini levelnya PERENCANAAN bulanan kasar (guru
-- menaruh materi ke "minggu ke berapa", bukan tanggal presisi), jadi
-- pembagian kalender sederhana sudah cukup & jauh lebih gampang dijaga.
--
-- Pola RLS/trigger sync kelompok_id DISALIN PERSIS dari jurnal_kbm
-- (20260817090000_jurnal_kbm_rls_dan_trigger.sql) -- terbukti benar,
-- tidak ditebak ulang.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.jurnal_materi (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kelompok_id         bigint NOT NULL REFERENCES public.kelompok (id),
  kelas_id            bigint NOT NULL REFERENCES public.kelas (id),
  guru_id             bigint REFERENCES public.guru (id) ON DELETE SET NULL,
  tahun               int NOT NULL,
  bulan               int NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  minggu_ke           int NOT NULL CHECK (minggu_ke BETWEEN 1 AND 5),
  judul               text NOT NULL CHECK (length(btrim(judul)) > 0),
  urutan              int NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'belum' CHECK (status IN ('belum', 'disampaikan')),
  tanggal_disampaikan date,
  catatan             text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,

  -- status='disampaikan' tanpa tanggal (atau sebaliknya) adalah state yang
  -- tidak bisa ditampilkan konsisten di Riwayat -- dicegah di level tabel,
  -- bukan cuma dijaga aplikasi.
  CONSTRAINT chk_jurnal_materi_tanggal_disampaikan CHECK (
    (status = 'disampaikan' AND tanggal_disampaikan IS NOT NULL)
    OR (status = 'belum' AND tanggal_disampaikan IS NULL)
  )
);

COMMENT ON TABLE public.jurnal_materi IS
  'Materi rencana pembelajaran per kelas, dikelompokkan tahun+bulan+minggu_ke (1-5, rentang tanggal tetap). Satu baris = satu materi individual yang bisa ditandai disampaikan/belum. Berdiri sendiri dari jurnal_kbm (jurnal harian lama) dan kurikulum_* (target per kelompok/kategori) -- lihat komentar migrasi.';

CREATE INDEX IF NOT EXISTS idx_jurnal_materi_kelas_periode
  ON public.jurnal_materi (kelas_id, tahun, bulan) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jurnal_materi_kelompok_periode
  ON public.jurnal_materi (kelompok_id, tahun, bulan) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jurnal_materi_guru_id
  ON public.jurnal_materi (guru_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_jurnal_materi_updated_at ON public.jurnal_materi;
CREATE TRIGGER trg_jurnal_materi_updated_at
  BEFORE UPDATE ON public.jurnal_materi
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- Trigger sinkronisasi kelompok_id -- salinan persis pola
-- sync_jurnal_kbm_kelompok_id (20260817090000).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_jurnal_materi_kelompok_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_kelompok_id bigint;
begin
  select kelompok_id into v_kelompok_id from kelas where id = new.kelas_id;

  if v_kelompok_id is null then
    raise exception 'jurnal_materi.kelas_id % tidak ditemukan di tabel kelas', new.kelas_id;
  end if;

  new.kelompok_id = v_kelompok_id;
  return new;
end;
$function$;

COMMENT ON FUNCTION public.sync_jurnal_materi_kelompok_id() IS
  'jurnal_materi.kelompok_id TIDAK PERNAH dipercaya dari input klien, selalu ditimpa dari kelas.kelompok_id di sini.';

DROP TRIGGER IF EXISTS trg_jurnal_materi_sync_kelompok_id ON public.jurnal_materi;
CREATE TRIGGER trg_jurnal_materi_sync_kelompok_id
  BEFORE INSERT OR UPDATE OF kelas_id, kelompok_id ON public.jurnal_materi
  FOR EACH ROW EXECUTE FUNCTION sync_jurnal_materi_kelompok_id();

-- ---------------------------------------------------------------------
-- RLS -- pola & USING/WITH CHECK PERSIS jurnal_kbm (SELECT: admin_ppg
-- semua / admin_desa se-desa / admin_kelompok se-kelompok / guru HANYA
-- kelas yang dia ampu. INSERT/UPDATE diturunkan dari kelas_id. DELETE
-- sengaja tanpa policy -- soft-delete lewat UPDATE deleted_at).
-- ---------------------------------------------------------------------
ALTER TABLE public.jurnal_materi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jurnal_materi_select_scoped" ON public.jurnal_materi;
CREATE POLICY "jurnal_materi_select_scoped" ON public.jurnal_materi
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM auth_profile() p
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (
            SELECT k.desa_id FROM kelompok k WHERE k.id = jurnal_materi.kelompok_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = jurnal_materi.kelompok_id)
      OR (p.role = 'guru' AND p.guru_id IS NOT NULL AND p.guru_id = (
            SELECT kl.guru_id FROM kelas kl WHERE kl.id = jurnal_materi.kelas_id))
    )
  ));

DROP POLICY IF EXISTS "jurnal_materi_insert_guru_admin" ON public.jurnal_materi;
CREATE POLICY "jurnal_materi_insert_guru_admin" ON public.jurnal_materi
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS (
    SELECT 1 FROM auth_profile() p
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (
            SELECT k.desa_id FROM kelompok k JOIN kelas kl ON kl.kelompok_id = k.id
            WHERE kl.id = jurnal_materi.kelas_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = (
            SELECT kl.kelompok_id FROM kelas kl WHERE kl.id = jurnal_materi.kelas_id))
      OR (p.role = 'guru' AND p.guru_id IS NOT NULL AND p.guru_id = (
            SELECT kl.guru_id FROM kelas kl WHERE kl.id = jurnal_materi.kelas_id))
    )
  ));

DROP POLICY IF EXISTS "jurnal_materi_update_guru_admin" ON public.jurnal_materi;
CREATE POLICY "jurnal_materi_update_guru_admin" ON public.jurnal_materi
  AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS (
    SELECT 1 FROM auth_profile() p
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (
            SELECT k.desa_id FROM kelompok k JOIN kelas kl ON kl.kelompok_id = k.id
            WHERE kl.id = jurnal_materi.kelas_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = (
            SELECT kl.kelompok_id FROM kelas kl WHERE kl.id = jurnal_materi.kelas_id))
      OR (p.role = 'guru' AND p.guru_id IS NOT NULL AND p.guru_id = (
            SELECT kl.guru_id FROM kelas kl WHERE kl.id = jurnal_materi.kelas_id))
    )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM auth_profile() p
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (
            SELECT k.desa_id FROM kelompok k JOIN kelas kl ON kl.kelompok_id = k.id
            WHERE kl.id = jurnal_materi.kelas_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = (
            SELECT kl.kelompok_id FROM kelas kl WHERE kl.id = jurnal_materi.kelas_id))
      OR (p.role = 'guru' AND p.guru_id IS NOT NULL AND p.guru_id = (
            SELECT kl.guru_id FROM kelas kl WHERE kl.id = jurnal_materi.kelas_id))
    )
  ));

-- DELETE -- sengaja tanpa policy, sama spt jurnal_kbm. Soft-delete lewat
-- UPDATE jurnal_materi SET deleted_at = now().
--
-- Tidak ada GRANT/REVOKE eksplisit di sini -- jurnal_kbm (tabel acuan pola
-- ini) jg tidak punya, tabel baru otomatis mewarisi default privilege
-- project (authenticated dapat SELECT/INSERT/UPDATE/DELETE, anon dapat
-- SELECT doang) dan RLS di atas yang jadi penjaga sesungguhnya -- anon
-- tetap 0 baris krn seluruh policy mensyaratkan auth_profile() aktif.

COMMIT;
