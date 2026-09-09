-- =====================================================================
-- 20260910110000_absensi_fast_path.sql
--
-- Lanjutan penanganan insiden runaway 2026-09-10 (lihat 20260910100000 &
-- ERROR_LOG #38).
--
-- MASALAH YANG TERSISA setelah 20260910100000:
--   `batasi_laju` menaikkan counter di tabel `laju_permintaan`, TAPI
--   klien runaway selalu berakhir `RAISE 40001` -> PostgREST me-rollback
--   SELURUH transaksi RPC -> increment counter ikut hilang -> counter
--   tak pernah menumpuk -> pagar tak pernah menggigit. Terbukti:
--   `laju_permintaan` KOSONG padahal absensi.n_tup_ins masih naik
--   ~550/detik setelah migrasi pertama dijalankan.
--
-- PERBAIKAN DI SINI — FAST-PATH di `simpan_absensi_kelas`:
--   Sebelum loop, cek: apakah SEMUA baris yang dikirim sudah ada persis
--   seperti itu (tanggal + status sama, belum dihapus)? Kalau ya ->
--   kembalikan no-op {baru:0, diperbarui:0}. Transaksi COMMIT, TANPA
--   speculative INSERT, TANPA 40001.
--
--   Efek untuk klien runaway (mengirim ulang data 26 Agt yang tidak
--   berubah): tiap panggilan kini = 1 SELECT ber-index lalu commit.
--   absensi.n_tup_ins BERHENTI naik. Dan karena panggilan kini commit,
--   counter `batasi_laju` mulai menumpuk & pagarnya menggigit.
--
--   Semantik anti-lost-update TIDAK berubah: kalau ada satu saja baris
--   yang beda / baru / tak terlihat (RLS), fast-path tidak kena dan
--   alur normal (dengan cek versi `updated_at`) berjalan seperti biasa.
--
-- Badan fungsi disalin UTUH dari produksi 2026-09-10 (yang sudah memuat
-- baris `batasi_laju` dari migrasi pertama) + satu blok fast-path.
-- Idempoten (CREATE OR REPLACE).
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
  v_cocok       int;
BEGIN
  IF v_kelompok_id IS NULL OR v_tanggal IS NULL OR v_baris IS NULL THEN
    RAISE EXCEPTION 'kelompok_id, tanggal, dan baris wajib diisi';
  END IF;

  -- FAST-PATH (migrasi 20260910110000, insiden runaway 2026-09-10):
  -- kalau SEMUA baris yang dikirim sudah ada persis begini, tidak ada
  -- yang perlu dikerjakan -> no-op yang COMMIT (tanpa speculative INSERT,
  -- tanpa 40001). Menghentikan loop klien yang mengirim ulang data tak
  -- berubah, tanpa mengubah semantik anti-lost-update utk kasus nyata.
  -- Ditaruh PALING DEPAN: resave yang benar-benar no-op tidak menyentuh
  -- apa pun (termasuk tidak dihitung ke kuota laju), dan loop klien basi
  -- jadi semurah mungkin: satu SELECT ber-index lalu commit.
  IF jsonb_array_length(v_baris) > 0 THEN
    SELECT count(*) INTO v_cocok
      FROM public.absensi a
      JOIN jsonb_array_elements(v_baris) elem
        ON (elem ->> 'santri_id')::bigint = a.santri_id
     WHERE a.tanggal = v_tanggal
       AND a.deleted_at IS NULL
       AND a.status = (elem ->> 'status')::absensi_status;

    IF v_cocok = jsonb_array_length(v_baris) THEN
      RETURN jsonb_build_object('baru', 0, 'diperbarui', 0);
    END IF;
  END IF;

  -- Pagar laju (migrasi 20260910100000). Sesudah fast-path, sebelum kerja
  -- tulis yang sebenarnya.
  PERFORM public.batasi_laju('simpan_absensi', 20, 60);

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
