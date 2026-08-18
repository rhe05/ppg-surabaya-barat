-- =====================================================================
-- 20260818200000_simpan_absensi_atomik.sql
--
-- Mengembalikan perlindungan TABRAKAN SIMPAN pada absensi, yang hilang saat
-- migrasi ke Supabase.
--
-- MASALAH 1 — lost update. App lama menjaga ini lewat dokumen
-- `absensi_sesi` berisi `version` per kelas+tanggal: klien mengirim
-- `expectedVersion`, dan simpan ditolak kalau versinya sudah berubah
-- (perbaikan 2026-08-08). Tabel itu tidak ikut pindah, sehingga di app baru
-- dua orang yang membuka tanggal yang sama lalu menyimpan berurutan membuat
-- yang terakhir menimpa yang pertama TANPA peringatan apa pun.
--
-- MASALAH 2 — tersimpan separuh. Halaman /absensi menyimpan dengan dua
-- panggilan terpisah (INSERT baris baru, lalu UPSERT baris lama). Kalau yang
-- kedua gagal, yang pertama sudah terlanjur masuk dan tidak ada yang
-- membatalkannya.
--
-- BENTUK PERBAIKAN: satu fungsi yang menyimpan seluruh kelas dalam SATU
-- transaksi. Alih-alih meniru tabel `absensi_sesi` (yang butuh identitas
-- kelas — sesuatu yang justru sedang berbeda bentuk antara app lama dan
-- baru), penjaganya memakai `updated_at` yang SUDAH ADA di tiap baris dan
-- SUDAH dijaga trigger `trg_absensi_updated_at`. Klien mengirim nilai
-- updated_at yang ia lihat saat memuat; kalau nilainya sudah bergeser,
-- berarti ada orang lain yang menyimpan lebih dulu dan seluruh penyimpanan
-- dibatalkan.
--
-- Keuntungan dibanding meniru absensi_sesi: tidak ada tabel baru yang harus
-- dijaga konsisten, perlindungannya per-BARIS (dua guru yang mengubah santri
-- berbeda di tanggal sama tidak saling menghalangi), dan tidak ada versi
-- yang bisa "naik" tanpa data berubah.
--
-- SECURITY INVOKER (bawaan): seluruh policy RLS absensi tetap berlaku apa
-- adanya — fungsi ini TIDAK memberi hak baru kepada siapa pun.
--
-- Idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ── Penanda waktu yang benar-benar berbeda tiap penulisan ────────────
--
-- Trigger bersama `set_updated_at()` memakai now(), yang bernilai SAMA
-- sepanjang satu transaksi. Sebagai penjaga versi itu punya celah sempit
-- tapi nyata: dua transaksi yang kebetulan dimulai pada mikrodetik yang
-- sama akan menghasilkan updated_at identik, sehingga penulis kedua
-- menimpa yang pertama tanpa terdeteksi.
--
-- clock_timestamp() dibaca ulang untuk SETIAP baris, jadi tidak ada dua
-- penulisan yang bisa bertabrakan nilainya. Fungsi bersama sengaja TIDAK
-- diubah — penggantian ini hanya untuk tabel `absensi`, satu-satunya tabel
-- yang memakai updated_at sebagai penjaga versi.
CREATE OR REPLACE FUNCTION public.set_updated_at_presisi()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END
$$;

REVOKE EXECUTE ON FUNCTION public.set_updated_at_presisi() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_absensi_updated_at ON public.absensi;
CREATE TRIGGER trg_absensi_updated_at
  BEFORE UPDATE ON public.absensi
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_presisi();

CREATE OR REPLACE FUNCTION public.simpan_absensi_kelas(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_kelompok_id bigint := (p ->> 'kelompok_id')::bigint;
  v_tanggal     date    := (p ->> 'tanggal')::date;
  v_baris       jsonb   := p -> 'baris';
  v_item        jsonb;
  v_santri_id   bigint;
  v_status      absensi_status;
  v_harap       timestamptz;
  v_n           int;
  v_baru        int := 0;
  v_ubah        int := 0;
BEGIN
  IF v_kelompok_id IS NULL OR v_tanggal IS NULL OR v_baris IS NULL THEN
    RAISE EXCEPTION 'kelompok_id, tanggal, dan baris wajib diisi';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_baris) LOOP
    v_santri_id := (v_item ->> 'santri_id')::bigint;
    v_status    := (v_item ->> 'status')::absensi_status;
    -- updated_at yang DILIHAT klien saat memuat. NULL = klien menganggap
    -- baris ini belum ada sama sekali.
    v_harap := NULLIF(v_item ->> 'updated_at', '')::timestamptz;

    IF v_harap IS NULL THEN
      BEGIN
        INSERT INTO public.absensi (santri_id, kelompok_id, tanggal, status, dicatat_oleh)
        VALUES (v_santri_id, v_kelompok_id, v_tanggal, v_status, auth.uid());
        v_baru := v_baru + 1;
      EXCEPTION WHEN unique_violation THEN
        -- Baris itu ternyata SUDAH dibuat orang lain sejak layar dimuat.
        RAISE EXCEPTION 'Data absensi tanggal % baru saja diubah dari sesi lain. Muat ulang lalu simpan kembali.', v_tanggal
          USING ERRCODE = '40001';
      END;
    ELSE
      UPDATE public.absensi
         SET status = v_status,
             dicatat_oleh = auth.uid()
       WHERE santri_id = v_santri_id
         AND tanggal = v_tanggal
         AND deleted_at IS NULL
         AND updated_at = v_harap;
      GET DIAGNOSTICS v_n = ROW_COUNT;

      IF v_n = 0 THEN
        -- Nol baris bisa berarti dua hal: barisnya sudah berubah (tabrakan)
        -- atau RLS menahan. Keduanya sama-sama alasan untuk membatalkan
        -- SELURUH penyimpanan — tidak boleh separuh masuk.
        RAISE EXCEPTION 'Data absensi tanggal % baru saja diubah dari sesi lain, atau Anda tidak berhak mengubahnya. Muat ulang lalu simpan kembali.', v_tanggal
          USING ERRCODE = '40001';
      END IF;
      v_ubah := v_ubah + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('baru', v_baru, 'diperbarui', v_ubah);
END
$$;

-- Wajib: EXECUTE untuk PUBLIC melekat otomatis pada fungsi baru dan anon
-- adalah anggota PUBLIC — GRANT ke authenticated saja TIDAK menutup anon.
REVOKE EXECUTE ON FUNCTION public.simpan_absensi_kelas(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.simpan_absensi_kelas(jsonb) TO authenticated;

COMMIT;
