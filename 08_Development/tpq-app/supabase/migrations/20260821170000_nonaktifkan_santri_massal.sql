-- =====================================================================
-- 20260821170000_nonaktifkan_santri_massal.sql
--
-- "Pindah Domisili" & "Non Aktif" dipindah dari tombol "Hapus" DI DALAM
-- form Ubah (satu santri) ke popup ikon orang (menu sejajar Pindah Kelas
-- / Naik Kelas) -- jadi aksi MASSAL lewat mode centang, sama seperti dua
-- aksi itu (migrasi 20260821150000, 20260821160000).
--
-- nonaktifkan_santri() (migrasi 20260821130000) diganti dari satu
-- `santri_id` jadi array `santri_ids` -- SATU transaksi mencatat
-- siklus_generus + soft-delete utk SEMUA santri terpilih sekaligus,
-- dengan jenis_siklus/tanggal/keterangan yang SAMA utk seluruh batch
-- (satu form konfirmasi, bukan diulang per santri). Signature (jsonb)
-- tidak berubah jadi CREATE OR REPLACE cukup, tidak perlu DROP dulu.
--
-- TIDAK perlu policy RLS baru: siklus_generus_insert_guru &
-- santri_update_guru yang sudah ada dicek PER BARIS, otomatis berlaku
-- utk berapa pun baris yang disentuh dalam satu statement.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- Tipe kembalian berubah (dulu `public.santri` satu baris, sekarang
-- `SETOF public.santri`) -- CREATE OR REPLACE menolak perubahan tipe
-- kembalian (42P13), jadi fungsi lama WAJIB di-drop dulu.
DROP FUNCTION IF EXISTS public.nonaktifkan_santri(jsonb);

CREATE OR REPLACE FUNCTION public.nonaktifkan_santri(p jsonb)
 RETURNS SETOF public.santri
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_santri_ids  bigint[];
  v_jenis       text := p->>'jenis_siklus';
  v_tanggal     date := coalesce(nullif(btrim(coalesce(p->>'tanggal','')), '')::date, current_date);
  v_guru_id     bigint;
  v_kelompok_id bigint;
  v_cocok       int;
begin
  select array(
    select (jsonb_array_elements_text(p->'santri_ids'))::bigint
  ) into v_santri_ids;

  if v_santri_ids is null or array_length(v_santri_ids, 1) is null then
    raise exception 'Pilih minimal satu santri.';
  end if;
  if v_jenis not in ('Pindah', 'Tidak Aktif') then
    raise exception 'jenis_siklus harus Pindah atau Tidak Aktif';
  end if;

  select pr.guru_id, pr.scope_kelompok_id into v_guru_id, v_kelompok_id
    from auth_profile() pr(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
   where pr.is_active and pr.role = 'guru';
  if v_guru_id is null then
    raise exception 'Hanya guru yang bisa menonaktifkan santri.';
  end if;

  select count(*) into v_cocok
    from santri s
   where s.id = any(v_santri_ids)
     and s.deleted_at is null
     and exists (
           select 1 from kelas k
            where k.id = s.kelas_id and k.guru_id = v_guru_id and k.deleted_at is null
         );
  if v_cocok <> array_length(v_santri_ids, 1) then
    raise exception 'Ada santri yang bukan di kelas Anda atau sudah tidak aktif -- muat ulang layar dan coba lagi.';
  end if;

  insert into siklus_generus (
    kelompok_id, santri_id, nama, jenis_siklus, tanggal, keterangan, dicatat_oleh
  )
  select v_kelompok_id, s.id, s.nama, v_jenis::siklus_generus_jenis, v_tanggal,
         nullif(btrim(coalesce(p->>'keterangan','')), ''), auth.uid()
    from santri s where s.id = any(v_santri_ids);

  return query
    update santri
       set deleted_at = v_tanggal::timestamptz
     where id = any(v_santri_ids)
    returning *;
end;
$function$;

COMMENT ON FUNCTION public.nonaktifkan_santri(jsonb) IS
  'Tandai banyak santri sekaligus Pindah/Tidak Aktif: catat siklus_generus + soft-delete SEJAK tanggal peristiwa, satu transaksi. Khusus guru, dibatasi ke kelas yang dia ampu sendiri. jenis_siklus/tanggal/keterangan sama utk seluruh batch.';

-- DROP FUNCTION di atas ikut menghapus GRANT lama -- WAJIB diberikan lagi,
-- kalau tidak "authenticated" (semua peran login) kehilangan izin panggil
-- fungsi ini sama sekali.
GRANT EXECUTE ON FUNCTION public.nonaktifkan_santri(jsonb) TO authenticated;

COMMIT;
