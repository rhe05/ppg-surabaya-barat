-- =====================================================================
-- 20260821160000_naikkan_jenjang_santri_guru.sql
--
-- Fitur baru "Naik Kelas" (Data Generus guru, aksi massal, menu yang sama
-- dgn "Pindah Kelas" -- migrasi 20260821150000): guru pilih beberapa
-- santri, lalu naikkan JENJANG mereka satu tingkat (PAUD/TK -> Cabe Rawit
-- -> Pra Remaja -> Remaja SMA -> Remaja). BEDA dari "Pindah Kelas" yang
-- mengganti kelas_ngaji/kelas_id (kelompok belajar) -- ini mengganti
-- jenjang_saat_ini (tahap perkembangan), kelasnya sendiri TIDAK berubah.
--
-- TIDAK perlu policy RLS baru: kelas_id santri tidak disentuh sama
-- sekali, jadi santri_update_guru yang sudah ada (migrasi 20260821120000)
-- sudah cukup -- USING & WITH CHECK-nya sama-sama menguji kelas_id yang
-- TIDAK berubah oleh migrasi ini.
--
-- Santri yang sudah di jenjang tertinggi (Remaja) DILEWATI, bukan
-- ditolak -- guru wajar memilih campuran santri dari berbagai jenjang
-- sekaligus, dan yang sudah mentok tidak seharusnya menggagalkan
-- seluruh permintaan.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.naikkan_jenjang_santri(p jsonb)
 RETURNS SETOF public.santri
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_santri_ids bigint[];
  v_guru_id    bigint;
begin
  select array(
    select (jsonb_array_elements_text(p->'santri_ids'))::bigint
  ) into v_santri_ids;

  if v_santri_ids is null or array_length(v_santri_ids, 1) is null then
    raise exception 'Pilih minimal satu santri.';
  end if;

  select pr.guru_id into v_guru_id
    from auth_profile() pr(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
   where pr.is_active and pr.role = 'guru';
  if v_guru_id is null then
    raise exception 'Hanya guru yang bisa menaikkan jenjang santri.';
  end if;

  if exists (
    select 1 from santri s
     where s.id = any(v_santri_ids)
       and not exists (
             select 1 from kelas k
              where k.id = s.kelas_id and k.guru_id = v_guru_id and k.deleted_at is null
           )
  ) then
    raise exception 'Ada santri yang bukan di kelas Anda -- muat ulang layar dan coba lagi.';
  end if;

  return query
    update santri
       set jenjang_saat_ini = (case jenjang_saat_ini
             when 'PAUD/TK'::santri_jenjang    then 'Cabe Rawit'
             when 'Cabe Rawit'::santri_jenjang  then 'Pra Remaja'
             when 'Pra Remaja'::santri_jenjang  then 'Remaja SMA'
             when 'Remaja SMA'::santri_jenjang  then 'Remaja'
             else jenjang_saat_ini
           end)::santri_jenjang
     where id = any(v_santri_ids)
       and jenjang_saat_ini is distinct from 'Remaja'::santri_jenjang
    returning *;
end;
$function$;

COMMENT ON FUNCTION public.naikkan_jenjang_santri(jsonb) IS
  'Naikkan jenjang_saat_ini satu tingkat utk banyak santri sekaligus, satu transaksi. Khusus guru, dibatasi ke kelas yang dia ampu sendiri. Santri yang sudah di jenjang Remaja (tertinggi) dilewati, bukan ditolak.';

GRANT EXECUTE ON FUNCTION public.naikkan_jenjang_santri(jsonb) TO authenticated;

COMMIT;
