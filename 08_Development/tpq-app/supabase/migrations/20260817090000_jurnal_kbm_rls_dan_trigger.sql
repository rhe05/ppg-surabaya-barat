-- =====================================================================
-- 20260817090000_jurnal_kbm_rls_dan_trigger.sql
--
-- jurnal_kbm sebelum migrasi ini: RLS AKTIF tapi 0 policy -> SELECT
-- return 0 baris diam-diam dan semua tulis ditolak. Tabel juga tidak
-- punya trigger rekonsiliasi kelompok_id (berbeda dari absensi yang
-- punya trg_absensi_sync_kelompok_id), padahal jurnal_kbm menyimpan
-- DUA jalur scope: kelompok_id langsung, dan kelas_id -> kelas.kelompok_id.
-- Tanpa rekonsiliasi, klien bisa mengirim kelompok_id yang tidak cocok
-- dengan kelas_id-nya.
--
-- Migrasi ini memasang dua lapis yang saling menutup:
--   1. TRIGGER  -- kelompok_id SELALU ditimpa dari kelas.kelompok_id,
--                  kiriman klien tidak pernah dipercaya.
--   2. POLICY   -- seluruh keputusan scope tulis diambil dari kelas_id,
--                  BUKAN dari kolom kelompok_id, sehingga policy tetap
--                  benar terlepas dari urutan/eksistensi trigger.
--
-- Keputusan yang dikunci di sini:
--   - SELECT : admin_ppg semua / admin_desa se-desa / admin_kelompok
--              se-kelompok / guru HANYA kelas yang dia ampu.
--   - INSERT & UPDATE : guru (hanya kelas miliknya) + ketiga admin
--              (sesuai scope masing-masing).
--   - DELETE : TIDAK ADA policy sama sekali. Penghapusan dilakukan
--              sebagai soft-delete lewat UPDATE deleted_at, konsisten
--              dengan uq_jurnal_kbm_kelas_tanggal yang partial
--              (WHERE deleted_at IS NULL).
--   - Guru pengganti/substitusi BELUM ditangani (sengaja ditunda ke
--     task terpisah). Sementara ini kasus guru pengganti ditangani
--     lewat jalur admin.
--
-- Acuan pola: 20260815000000_sync_dari_produksi.sql
--   - fungsi sync  : baris 187-203 (sync_absensi_kelompok_id)
--   - trigger sync : baris 382     (trg_absensi_sync_kelompok_id)
--   - policy       : baris 455-493 (absensi_*)
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. FUNGSI + TRIGGER SINKRONISASI kelompok_id
-- ---------------------------------------------------------------------
-- Cerminan sync_absensi_kelompok_id, hanya sumber turunannya berbeda:
-- absensi menurunkan kelompok dari santri_id, jurnal_kbm dari kelas_id.
--
-- Sama seperti fungsi absensi, ini SENGAJA bukan SECURITY DEFINER: SELECT
-- ke kelas tunduk pada kelas_select_scoped, jadi kalau pemanggil tidak
-- berhak melihat kelas itu, lookup gagal dan penulisan ikut gagal
-- (fail-closed). Ini lapis ketiga di atas policy.
CREATE OR REPLACE FUNCTION public.sync_jurnal_kbm_kelompok_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_kelompok_id bigint;
begin
  select kelompok_id into v_kelompok_id from kelas where id = new.kelas_id;

  if v_kelompok_id is null then
    raise exception 'jurnal_kbm.kelas_id % tidak ditemukan di tabel kelas', new.kelas_id;
  end if;

  new.kelompok_id = v_kelompok_id;
  return new;
end;
$function$;

COMMENT ON FUNCTION public.sync_jurnal_kbm_kelompok_id() IS
  'jurnal_kbm.kelompok_id TIDAK PERNAH dipercaya dari input klien, selalu ditimpa dari kelas.kelompok_id di sini.';

-- Daftar kolom pemicu memuat kelompok_id, TIDAK hanya kelas_id.
-- Alasannya: `UPDATE OF kelas_id` saja hanya menyala kalau kelas_id ikut
-- di-SET, sehingga `UPDATE jurnal_kbm SET kelompok_id = <palsu>` lolos
-- tanpa rekonsiliasi (policy UPDATE tetap lulus karena kelas_id tidak
-- berubah). Dengan kelompok_id ikut jadi pemicu: setiap penulisan yang
-- menyentuh kelompok_id pasti ditimpa ulang dari kelas_id, dan penulisan
-- yang tidak menyentuhnya meninggalkan nilai lama yang memang sudah benar.
DROP TRIGGER IF EXISTS trg_jurnal_kbm_sync_kelompok_id ON public.jurnal_kbm;
CREATE TRIGGER trg_jurnal_kbm_sync_kelompok_id
  BEFORE INSERT OR UPDATE OF kelas_id, kelompok_id ON public.jurnal_kbm
  FOR EACH ROW EXECUTE FUNCTION sync_jurnal_kbm_kelompok_id();

-- ---------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.jurnal_kbm ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 3. POLICY
-- ---------------------------------------------------------------------

-- SELECT -- admin memakai kelompok_id (dijamin benar oleh trigger),
-- guru memakai kelas.guru_id. Cabang guru SENGAJA berbeda dari
-- absensi_select_scoped yang hanya mengecek se-kelompok: jurnal terikat
-- ke kelas, dan guru hanya berkepentingan pada kelas yang dia ampu.
DROP POLICY IF EXISTS "jurnal_kbm_select_scoped" ON public.jurnal_kbm;
CREATE POLICY "jurnal_kbm_select_scoped" ON public.jurnal_kbm
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = jurnal_kbm.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jurnal_kbm.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.guru_id IS NOT NULL) AND (p.guru_id = ( SELECT kl.guru_id
           FROM kelas kl
          WHERE (kl.id = jurnal_kbm.kelas_id)))))))));

-- INSERT -- SELURUH cabang diturunkan dari kelas_id, termasuk cabang
-- admin. kelompok_id kiriman klien tidak pernah dibaca di sini, jadi
-- memalsukannya tidak membuka jalan ke kelompok lain.
DROP POLICY IF EXISTS "jurnal_kbm_insert_guru_admin" ON public.jurnal_kbm;
CREATE POLICY "jurnal_kbm_insert_guru_admin" ON public.jurnal_kbm
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
             JOIN kelas kl ON ((kl.kelompok_id = k.id))
          WHERE (kl.id = jurnal_kbm.kelas_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = ( SELECT kl.kelompok_id
           FROM kelas kl
          WHERE (kl.id = jurnal_kbm.kelas_id)))) OR ((p.role = 'guru'::text) AND (p.guru_id IS NOT NULL) AND (p.guru_id = ( SELECT kl.guru_id
           FROM kelas kl
          WHERE (kl.id = jurnal_kbm.kelas_id)))))))));

-- UPDATE -- USING dan WITH CHECK memakai ekspresi yang sama persis
-- dengan INSERT, sehingga baris tidak bisa "dipindahkan" ke kelas di
-- luar scope. Ini juga jalur soft-delete: UPDATE deleted_at.
DROP POLICY IF EXISTS "jurnal_kbm_update_guru_admin" ON public.jurnal_kbm;
CREATE POLICY "jurnal_kbm_update_guru_admin" ON public.jurnal_kbm
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
             JOIN kelas kl ON ((kl.kelompok_id = k.id))
          WHERE (kl.id = jurnal_kbm.kelas_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = ( SELECT kl.kelompok_id
           FROM kelas kl
          WHERE (kl.id = jurnal_kbm.kelas_id)))) OR ((p.role = 'guru'::text) AND (p.guru_id IS NOT NULL) AND (p.guru_id = ( SELECT kl.guru_id
           FROM kelas kl
          WHERE (kl.id = jurnal_kbm.kelas_id)))))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
             JOIN kelas kl ON ((kl.kelompok_id = k.id))
          WHERE (kl.id = jurnal_kbm.kelas_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = ( SELECT kl.kelompok_id
           FROM kelas kl
          WHERE (kl.id = jurnal_kbm.kelas_id)))) OR ((p.role = 'guru'::text) AND (p.guru_id IS NOT NULL) AND (p.guru_id = ( SELECT kl.guru_id
           FROM kelas kl
          WHERE (kl.id = jurnal_kbm.kelas_id)))))))));

-- DELETE -- SENGAJA TIDAK ADA POLICY.
-- RLS aktif tanpa policy DELETE berarti tidak seorang pun (termasuk
-- admin_ppg) bisa menghapus baris jurnal_kbm lewat PostgREST. Penghapusan
-- ditempuh sebagai soft-delete: UPDATE jurnal_kbm SET deleted_at = now().
-- Partial unique index uq_jurnal_kbm_kelas_tanggal (WHERE deleted_at IS
-- NULL) membuat baris ter-soft-delete otomatis melepas slot (kelas,
-- tanggal) sehingga jurnal baru bisa dibuat untuk kombinasi yang sama.

COMMIT;
