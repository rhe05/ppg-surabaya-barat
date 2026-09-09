-- =====================================================================
-- 20260910100000_rate_limit.sql
--
-- RATE LIMITING SISI SERVER (Postgres) untuk RPC tulis.
--
-- LATAR BELAKANG — insiden ditemukan 2026-09-10 saat audit:
--   pg_stat_user_tables.absensi.n_tup_ins = 750 JUTA (tabel cuma 3.4rb
--   baris hidup), laju ~550 percobaan INSERT / detik SAAT INI JUGA.
--   pg_stat_statements: 1,4 MILIAR request PostgREST dalam 47 hari.
--   postgres_logs: 100% error = "Data absensi tanggal 2026-08-26 baru
--   saja diubah dari sesi lain" (ERRCODE 40001).
--   => Sebuah KLIEN (kemungkinan tab peramban lama yang tidak pernah
--      ditutup, build ~26 Agt) terjebak menyimpan absensi tanggal
--      2026-08-26 berulang tanpa henti; tiap panggilan kena unique_violation
--      -> 40001 -> klien coba lagi seketika. Ini penyebab "CPU Supabase
--      100%" yang tidak terpecahkan sejak 26 Agt (SUPABASE_RESOURCE_AUDIT.md).
--
-- Perbaikan akar = tutup tab peramban itu (dilakukan owner). Berkas ini
-- memasang PAGAR supaya kejadian seperti ini tidak pernah lagi membakar
-- CPU/kuota: tiap RPC tulis menolak pemanggilan yang terlalu sering dari
-- satu pengguna, dengan biaya SANGAT murah (satu upsert ke tabel counter
-- kecil) alih-alih menjalankan seluruh badan RPC.
--
-- Idempoten. Badan simpan_absensi_kelas disalin UTUH dari produksi
-- 2026-09-10, hanya 1 baris pagar ditambahkan.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Counter jendela-waktu. Kecil & bersih-bersih sendiri. Tanpa policy RLS
-- (RLS aktif + nol policy = tak ada yang bisa menyentuh langsung; hanya
-- fungsi SECURITY DEFINER di bawah).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.laju_permintaan (
  subjek  text        NOT NULL,   -- '<uid|anon>:<aksi>'
  jendela timestamptz NOT NULL,   -- awal bucket waktu
  n       integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (subjek, jendela)
);
ALTER TABLE public.laju_permintaan ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- batasi_laju(aksi, maks, detik):
--   hitung pemanggilan pengguna ini utk `aksi` dalam bucket `detik`
--   terakhir; kalau > `maks` -> RAISE (membatalkan RPC pemanggil).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.batasi_laju(
  p_aksi  text,
  p_maks  integer DEFAULT 40,
  p_detik integer DEFAULT 60
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_subjek  text;
  v_jendela timestamptz;
  v_n       integer;
BEGIN
  v_subjek  := COALESCE(auth.uid()::text, 'anon') || ':' || p_aksi;
  v_jendela := to_timestamp(
                 floor(extract(epoch FROM clock_timestamp()) / p_detik) * p_detik
               );

  INSERT INTO public.laju_permintaan (subjek, jendela, n)
  VALUES (v_subjek, v_jendela, 1)
  ON CONFLICT (subjek, jendela)
  DO UPDATE SET n = public.laju_permintaan.n + 1
  RETURNING n INTO v_n;

  IF v_n > p_maks THEN
    RAISE EXCEPTION
      'Terlalu banyak permintaan dalam waktu singkat. Tunggu sebentar lalu coba lagi.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Sesekali (≈1:200) buang bucket lama supaya tabel tetap kecil.
  IF random() < 0.005 THEN
    DELETE FROM public.laju_permintaan WHERE jendela < now() - interval '15 minutes';
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.batasi_laju(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batasi_laju(text, integer, integer) TO authenticated, anon;

-- ---------------------------------------------------------------------
-- simpan_absensi_kelas — pasang pagar. 20 simpan / 60 detik / pengguna
-- sangat longgar utk pemakaian sah (admin menyimpan banyak kelas
-- berurutan ~10/2menit; guru 1-3/sesi) tapi mematikan loop ~1200+/menit.
-- ---------------------------------------------------------------------
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

  -- Pagar laju (migrasi 20260910100000). Ditaruh SEBELUM kerja berat.
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

COMMENT ON FUNCTION public.batasi_laju(text, integer, integer) IS
  'Rate limit sisi server: hitung pemanggilan auth.uid() utk aksi tsb dalam jendela detik terakhir; RAISE bila melebihi maks. Dipanggil dari RPC tulis. Migrasi 20260910100000.';

COMMIT;
