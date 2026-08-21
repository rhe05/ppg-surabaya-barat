-- =====================================================================
-- 20260821150000_pindah_kelas_santri_guru.sql
--
-- Fitur baru "Pindah Kelas" (Data Generus guru, aksi massal): guru pilih
-- beberapa santri di kelas yang sedang dibuka, lalu pindahkan mereka ke
-- kelas LAIN dalam kelompok yang sama (mis. naik kelas, atau pindah ke
-- kelas yang diampu guru lain) -- BEDA dari "Pindah/Tidak Aktif" (migrasi
-- 20260821130000) yang berarti keluar dari TPQ sama sekali dan tercatat
-- ke siklus_generus. Pindah Kelas TIDAK menyentuh siklus_generus --
-- santrinya tetap aktif, cuma kelas_id/kelas_ngaji-nya yang berubah.
--
-- Kenapa perlu policy BARU (bukan cukup santri_update_guru yang sudah
-- ada, migrasi 20260821120000): policy itu memakai USING yang sama sbg
-- WITH CHECK (tidak ditulis eksplisit), artinya kelas TUJUAN juga harus
-- dimiliki guru yang SAMA -- terlalu sempit utk kasus "pindah ke kelas
-- rekan guru lain dalam kelompok yang sama". Policy baru di bawah
-- memakai USING (kelas ASAL milik guru ini) tapi WITH CHECK yang lebih
-- longgar (kelas TUJUAN cukup berada di kelompok yang sama) -- dua
-- policy PERMISSIVE di-OR-kan Postgres, jadi santri_update_guru yang
-- sudah ada TIDAK berubah/tergantikan, ini cuma jalur TAMBAHAN.
--
-- Isi:
--   1. santri_pindah_kelas_guru -- policy UPDATE baru, WITH CHECK longgar
--   2. pindah_kelas_santri() -- pindahkan banyak santri sekaligus, atomik
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. santri_pindah_kelas_guru
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "santri_pindah_kelas_guru" ON public.santri;
CREATE POLICY "santri_pindah_kelas_guru" ON public.santri
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active
      AND p.role = 'guru'
      AND EXISTS (
            SELECT 1 FROM kelas k
             WHERE k.id = santri.kelas_id
               AND k.guru_id = p.guru_id
               AND k.deleted_at IS NULL
          )))
  WITH CHECK (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active
      AND p.role = 'guru'
      AND p.scope_kelompok_id = santri.kelompok_id
      AND EXISTS (
            SELECT 1 FROM kelas k
             WHERE k.id = santri.kelas_id
               AND k.kelompok_id = p.scope_kelompok_id
               AND k.deleted_at IS NULL
          )));

-- ---------------------------------------------------------------------
-- 2. pindah_kelas_santri() -- pindahkan banyak santri, satu transaksi
-- ---------------------------------------------------------------------
-- SECURITY INVOKER (default): UPDATE-nya tunduk pada
-- santri_pindah_kelas_guru di atas (di-OR dgn santri_update_guru) --
-- pengecekan scope di bawah adalah lapis pertama (pesan error ramah),
-- RLS lapis kedua.
--
-- Kirim kelas_ngaji (nama), BUKAN kelas_id -- trigger sinkron_santri_kelas
-- (migrasi 20260819110000) yang menurunkan kelas_id, sama pola dgn
-- tambah_santri(). "Semua atau tidak sama sekali": kalau ada satu saja
-- santri yang bukan di kelas guru ini, SELURUH permintaan ditolak --
-- bukan sebagian pindah sebagian tidak, yang membingungkan.
CREATE OR REPLACE FUNCTION public.pindah_kelas_santri(p jsonb)
 RETURNS SETOF public.santri
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_santri_ids      bigint[];
  v_kelas_tujuan_id bigint := (p->>'kelas_tujuan_id')::bigint;
  v_kelas_tujuan    public.kelas;
  v_guru_id         bigint;
  v_kelompok_id     bigint;
  v_tidak_cocok     int;
begin
  select array(
    select (jsonb_array_elements_text(p->'santri_ids'))::bigint
  ) into v_santri_ids;

  if v_santri_ids is null or array_length(v_santri_ids, 1) is null then
    raise exception 'Pilih minimal satu santri.';
  end if;
  if v_kelas_tujuan_id is null then
    raise exception 'Kelas tujuan wajib dipilih.';
  end if;

  select pr.guru_id, pr.scope_kelompok_id into v_guru_id, v_kelompok_id
    from auth_profile() pr(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
   where pr.is_active and pr.role = 'guru';
  if v_guru_id is null then
    raise exception 'Hanya guru yang bisa memindah kelas santri.';
  end if;

  select * into v_kelas_tujuan from kelas where id = v_kelas_tujuan_id and deleted_at is null;
  if not found or v_kelas_tujuan.kelompok_id is distinct from v_kelompok_id then
    raise exception 'Kelas tujuan tidak ditemukan di kelompok Anda.';
  end if;

  select count(*) into v_tidak_cocok
    from santri s
   where s.id = any(v_santri_ids)
     and not exists (
           select 1 from kelas k
            where k.id = s.kelas_id and k.guru_id = v_guru_id and k.deleted_at is null
         );
  if v_tidak_cocok > 0 then
    raise exception 'Ada santri yang bukan di kelas Anda -- muat ulang layar dan coba lagi.';
  end if;

  return query
    update santri
       set kelas_ngaji = v_kelas_tujuan.nama
     where id = any(v_santri_ids)
    returning *;
end;
$function$;

COMMENT ON FUNCTION public.pindah_kelas_santri(jsonb) IS
  'Pindahkan banyak santri sekaligus ke kelas lain DALAM kelompok yang sama, satu transaksi. Khusus guru; kelas asal wajib miliknya sendiri, kelas tujuan cukup dalam kelompok yang sama. TIDAK menyentuh siklus_generus (santri tetap aktif).';

GRANT EXECUTE ON FUNCTION public.pindah_kelas_santri(jsonb) TO authenticated;

COMMIT;
