-- =====================================================================
-- 20260819110000_santri_kelas_sinkron.sql
--
-- Menjaga dua hal yang baru saja diperbaiki migrasi 20260819100000 agar
-- tidak melenceng lagi begitu ada santri baru:
--
--   1. santri.kelas_id <-> santri.kelas_ngaji tetap sepakat.
--      Aplikasi (form santri, RPC tambah_santri, impor massal) mengirim
--      NAMA kelas sebagai teks, sementara yang dipakai menghitung statistik
--      per kelas adalah kelas_id. Tanpa penyelarasan ini, setiap santri
--      baru lahir tanpa kelas_id dan absensinya menggantung lagi — persis
--      keadaan yang menyebabkan 0 dari 199 santri tidak punya kelas.
--
--   2. kelas.santri_count selalu sama dengan jumlah santri sebenarnya.
--      Kolom itu sudah pernah menyimpang diam-diam (kelas "1A" tertulis 0
--      padahal berisi 7 santri) dan dashboard guru menampilkannya apa
--      adanya. Angka turunan yang dipelihara manual akan selalu menyimpang
--      lagi; dipelihara trigger, tidak bisa.
--
-- Arah penyelarasan sengaja ditentukan oleh APA YANG BERUBAH, bukan oleh
-- kolom mana yang "utama": kalau pemanggil mengubah kelas_id, teksnya
-- mengikuti; selain itu id diturunkan dari teks. Dengan begitu pemanggil
-- lama (yang hanya tahu teks) dan pemanggil baru (yang mengirim id)
-- sama-sama benar tanpa perlu diubah.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Selaraskan kelas_id <-> kelas_ngaji
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sinkron_santri_kelas()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_kelas   kelas%rowtype;
  v_teks    text := nullif(btrim(coalesce(new.kelas_ngaji, '')), '');
  v_id_baru boolean := (TG_OP = 'INSERT' and new.kelas_id is not null)
                       or (TG_OP = 'UPDATE' and new.kelas_id is distinct from old.kelas_id);
begin
  if v_id_baru and new.kelas_id is not null then
    select * into v_kelas from kelas where id = new.kelas_id;
    if not found then
      raise exception 'kelas_id % tidak ada', new.kelas_id;
    end if;
    -- Kelas milik kelompok lain berarti santri "pindah" tanpa sengaja ke
    -- lingkup yang tidak boleh dilihat gurunya. Ditolak, bukan diperbaiki
    -- diam-diam.
    if v_kelas.kelompok_id is distinct from new.kelompok_id then
      raise exception 'Kelas % milik kelompok %, tidak cocok dengan kelompok santri %',
        v_kelas.nama, v_kelas.kelompok_id, new.kelompok_id;
    end if;
    new.kelas_ngaji := v_kelas.nama;
    return new;
  end if;

  -- Santri yang dipindah ke kelompok lain KEHILANGAN kelasnya (teksnya tidak
  -- akan cocok kelas mana pun di kelompok baru, lihat pencarian di bawah).
  -- Itu memang satu-satunya hasil yang benar — kelas milik kelompok lama —
  -- dan sengaja dibiarkan terjadi, bukan ditolak: memindahkan santri adalah
  -- tindakan sah, dan menolaknya hanya memaksa admin mengosongkan kelas dulu
  -- secara manual. Santri itu lalu tampil sebagai "belum berkelas".

  if v_id_baru and new.kelas_id is null then
    new.kelas_ngaji := null;
    return new;
  end if;

  -- Selain itu: id mengikuti teks.
  if v_teks is null then
    new.kelas_id := null;
  else
    select * into v_kelas
      from kelas
     where kelompok_id = new.kelompok_id and nama = v_teks;
    -- Teks yang tidak cocok kelas mana pun TIDAK ditolak: impor massal &
    -- data lama memuat nama kelas yang belum tentu ada barisnya, dan
    -- menolaknya akan membuat santri gagal tersimpan sama sekali. Teksnya
    -- dipertahankan, kelas_id dibiarkan kosong, dan santri itu muncul
    -- sebagai "belum berkelas" — kondisi yang terlihat, bukan tersembunyi.
    new.kelas_id := v_kelas.id;
  end if;

  return new;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.sinkron_santri_kelas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sinkron_santri_kelas ON public.santri;
CREATE TRIGGER trg_sinkron_santri_kelas
  BEFORE INSERT OR UPDATE OF kelas_id, kelas_ngaji, kelompok_id ON public.santri
  FOR EACH ROW EXECUTE FUNCTION public.sinkron_santri_kelas();

-- ---------------------------------------------------------------------
-- 2. Pelihara kelas.santri_count
-- ---------------------------------------------------------------------
-- Menghitung ULANG dari tabel santri untuk kelas yang tersentuh, bukan
-- menambah/mengurangi 1: selisih yang sudah terlanjur ada ikut sembuh, dan
-- soft-delete (deleted_at diisi lewat UPDATE) tidak perlu jalur sendiri.
CREATE OR REPLACE FUNCTION public.hitung_ulang_santri_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_ids bigint[] := array_remove(array[
    case when TG_OP <> 'INSERT' then old.kelas_id end,
    case when TG_OP <> 'DELETE' then new.kelas_id end
  ], null);
begin
  -- Penyaringan dilakukan DI SINI, bukan lewat `AFTER UPDATE OF kelas_id`.
  -- `UPDATE OF` menyala berdasarkan kolom yang disebut di SET, bukan kolom
  -- yang akhirnya berubah — padahal kelas_id di sini justru sering diubah
  -- oleh trigger BEFORE di atas (mis. saat yang di-SET cuma kelas_ngaji atau
  -- kelompok_id). Memakai `UPDATE OF` membuat penghitungan ulang terlewat
  -- persis pada kasus itu, dan santri_count menyimpang diam-diam lagi.
  if TG_OP = 'UPDATE'
     and old.kelas_id is not distinct from new.kelas_id
     and old.deleted_at is not distinct from new.deleted_at then
    return null;
  end if;

  if array_length(v_ids, 1) is null then
    return null;
  end if;

  update kelas k
     set santri_count = (
           select count(*) from santri s
            where s.kelas_id = k.id and s.deleted_at is null
         ),
         updated_at = now()
   where k.id = any(v_ids)
     and k.santri_count is distinct from (
           select count(*) from santri s
            where s.kelas_id = k.id and s.deleted_at is null
         );

  return null;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.hitung_ulang_santri_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hitung_ulang_santri_count ON public.santri;
CREATE TRIGGER trg_hitung_ulang_santri_count
  AFTER INSERT OR DELETE OR UPDATE ON public.santri
  FOR EACH ROW EXECUTE FUNCTION public.hitung_ulang_santri_count();

COMMIT;
