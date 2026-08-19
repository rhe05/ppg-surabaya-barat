-- =====================================================================
-- 20260819120000_simpan_absensi_aturan_guru.sql
--
-- Menambah lapisan "sumber kebenaran" di server untuk simpan_absensi_kelas
-- yang sebelumnya hanya ditegakkan di klien (app/absensi/page.tsx,
-- handleSimpanGuru). App lama eksplisit menyebut pemeriksaan klien "cuma
-- optimasi UX" dan validasi server (Modul_InputAbsen.gs iaValidateWaktuAbsen_
-- + iaCekGuruSedangIzin_) sebagai penjaga sesungguhnya — migrasi ini
-- menutup celah itu: klien yang dilewati (API dipanggil langsung, jam di
-- perangkat guru salah, dsb) tetap ditahan di database.
--
-- Tiga aturan, HANYA berlaku untuk role 'guru' — admin_kelompok/admin_desa/
-- admin_ppg tetap bebas menyimpan tanggal apa pun, persis app lama
-- (saveInputAbsen_: "if (!isAdmin) { ...checks... }"):
--   1. Tanggal MASA DEPAN ditolak.
--   2. Tanggal HARI INI ditolak sebelum jam_mulai kelas yang disentuh tiba.
--      Dicek PER KELAS yang benar-benar muncul di baris yang dikirim
--      (santri_id -> santri.kelas_id -> kelas.jam_mulai), bukan diasumsikan
--      satu kelas per panggilan.
--   3. Guru yang sedang mengajukan Izin/Cuti pada tanggal itu ditolak
--      (guru_izin, tanggal di dalam tanggal_mulai..tanggal_selesai).
-- Tanggal LAMPAU selalu boleh — guru sering baru sadar salah beberapa hari
-- kemudian, dan tidak ada batas bawah di app lama maupun di sini.
--
-- Zona waktu: 'Asia/Jakarta', pola yang sama dipakai next_nis_santri()
-- (migrasi 20260817100000).
--
-- Pesannya SENGAJA disalin verbatim dari Script_Main.html:2985-3001 supaya
-- kalaupun jalur ini yang menahan (bukan pre-check klien), guru tetap
-- membaca kalimat yang sama.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.simpan_absensi_kelas(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
  v_penulis     record;
  v_hari_ini    date;
  v_jam_ini     time;
  v_kelas_telat record;
  v_izin_aktif  record;
BEGIN
  IF v_kelompok_id IS NULL OR v_tanggal IS NULL OR v_baris IS NULL THEN
    RAISE EXCEPTION 'kelompok_id, tanggal, dan baris wajib diisi';
  END IF;

  SELECT * INTO v_penulis FROM auth_profile();

  -- Tiga aturan di bawah HANYA utk guru -- admin (kelompok/desa/ppg) bebas,
  -- persis app lama.
  IF v_penulis.role = 'guru' THEN
    v_hari_ini := (now() AT TIME ZONE 'Asia/Jakarta')::date;
    v_jam_ini  := (now() AT TIME ZONE 'Asia/Jakarta')::time;

    IF v_tanggal > v_hari_ini THEN
      RAISE EXCEPTION 'Tidak bisa menyimpan absen untuk tanggal yang akan datang.';
    END IF;

    IF v_tanggal = v_hari_ini THEN
      SELECT k.nama, k.jam_mulai
        INTO v_kelas_telat
        FROM public.santri s
        JOIN public.kelas k ON k.id = s.kelas_id
       WHERE s.id IN (
               SELECT (elem ->> 'santri_id')::bigint
                 FROM jsonb_array_elements(v_baris) elem
             )
         AND k.jam_mulai IS NOT NULL
         AND k.jam_mulai > v_jam_ini
       LIMIT 1;

      IF FOUND THEN
        RAISE EXCEPTION 'Sesi ngaji kelas "%" baru mulai jam %. Absen belum bisa disimpan sebelum sesi berlangsung.',
          v_kelas_telat.nama, to_char(v_kelas_telat.jam_mulai, 'HH24:MI');
      END IF;
    END IF;

    SELECT id INTO v_izin_aktif
      FROM public.guru_izin
     WHERE guru_id = v_penulis.guru_id
       AND tanggal_mulai <= v_tanggal
       AND tanggal_selesai >= v_tanggal
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Anda sedang mengajukan Izin/Cuti pada tanggal ini, tidak bisa input absen. Hubungi Admin Kelompok kalau ini keliru.';
    END IF;
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
$function$;

COMMIT;
