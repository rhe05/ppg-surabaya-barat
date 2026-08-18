-- =====================================================================
-- 20260818250000_impor_santri.sql
--
-- Impor massal santri — padanan serverBulkImportSantri
-- (Modul_MaintainSantri.gs:294-400).
--
-- KENAPA SATU FUNGSI, BUKAN PERULANGAN DI PERAMBAN: menambah santri harus
-- lewat RPC `tambah_santri` (NIS dibuat atomik di dalam advisory lock,
-- lihat 20260817100000). Memanggilnya 200 kali dari peramban berarti 200
-- perjalanan bolak-balik, dan kalau jaringan putus di tengah, separuh
-- daftar sudah masuk tanpa ada yang tahu bagian mana.
--
-- GAGAL SEBAGIAN, BUKAN GAGAL SEMUA: tiap baris dibungkus blok EXCEPTION
-- sendiri. Satu baris rusak (nama kosong, jenjang tidak dikenal) tidak
-- membatalkan 199 baris lain — ia dilaporkan balik dengan nomor barisnya.
-- Ini menyamai perilaku app lama, dan memang yang diinginkan saat mengimpor
-- daftar panjang hasil ketikan tangan: yang bisa masuk, masuk; sisanya
-- diperbaiki lalu diimpor ulang.
--
-- Batas 200 baris per impor dipertahankan dari app lama. Di sana alasannya
-- kuota waktu Apps Script; di sini alasannya berbeda tapi tetap berlaku —
-- satu transaksi yang terlalu panjang menahan kunci lebih lama dari yang
-- pantas untuk sebuah operasi yang bisa dipecah.
--
-- SECURITY INVOKER: pemeriksaan scope sepenuhnya ditangani `tambah_santri`
-- dan policy `santri_insert_admin`. Fungsi ini tidak menambah hak apa pun.
--
-- Idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.impor_santri(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_baris   jsonb := p -> 'baris';
  v_item    jsonb;
  v_no      int := 0;
  v_berhasil int := 0;
  v_gagal   jsonb := '[]'::jsonb;
BEGIN
  IF v_baris IS NULL OR jsonb_typeof(v_baris) <> 'array' THEN
    RAISE EXCEPTION 'Daftar santri kosong atau bentuknya tidak sesuai';
  END IF;

  IF jsonb_array_length(v_baris) > 200 THEN
    RAISE EXCEPTION 'Maksimal 200 santri per impor. Bagi menjadi beberapa berkas.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_baris) LOOP
    v_no := v_no + 1;
    BEGIN
      PERFORM public.tambah_santri(v_item);
      v_berhasil := v_berhasil + 1;
    EXCEPTION WHEN OTHERS THEN
      v_gagal := v_gagal || jsonb_build_object(
        'baris', v_no,
        'nama', coalesce(v_item ->> 'nama', '(tanpa nama)'),
        'alasan', SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object('berhasil', v_berhasil, 'gagal', v_gagal);
END
$$;

REVOKE EXECUTE ON FUNCTION public.impor_santri(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.impor_santri(jsonb) TO authenticated;

COMMIT;
