-- =====================================================================
-- 20260828200000_kelas_gabung_dan_gilir.sql
--
-- Tiga hal yang diminta owner 2026-08-28, semuanya bermuara ke satu
-- tujuan: apa yang diatur admin kelp di "Data Kelas" harus TERBACA di
-- Pengumuman Jadwal KBM.
--
-- 1. GABUNG KELAS (sementara, krn ada guru izin). Tabel `kelas_gabung`:
--    kelas X ikut ke kelas induk Y utk rentang tanggal tertentu, dgn jam
--    & ruangan yang DITENTUKAN ADMIN saat menggabung (pilihan owner --
--    jam kedua kelas sering berbeda, mis. Kls 4 15:45 vs Pra Remaja
--    16:45, jadi tidak bisa asal ikut induk).
--
-- 2. GILIR GURU DIHITUNG OTOMATIS. Kolom `guru_id_2` + `pola_gilir_guru`
--    sudah ada sejak 20260827110000 tapi SENGAJA "info saja" waktu itu.
--    Owner kini memilih dihitung otomatis, dan itu mustahil tanpa titik
--    acuan -- karena itu ditambah:
--      gilir_mulai  : tanggal mulai giliran GURU PERTAMA (guru_id)
--      gilir_minggu : panjang satu giliran dlm minggu (default 2)
--    Rumusnya: floor(selisih_hari / (7 * gilir_minggu)) genap -> guru_id,
--    ganjil -> guru_id_2. `pola_gilir_guru` DIPERTAHANKAN sbg catatan
--    bebas utk hal yang tidak tertangkap dua kolom itu.
--
-- 3. `jadwal_kbm.kelas_id` -- INI AKAR MASALAHNYA. Selama ini `kelas`
--    (Data Kelas) dan `jadwal_kbm` (Jadwal KBM) adalah dua data terpisah
--    TANPA relasi apa pun; nama & gurunya kebetulan sama karena diisi
--    manual. Akibatnya mengedit Data Kelas tidak pernah sampai ke
--    pengumuman. Kolom ini menautkan keduanya + di-backfill dgn
--    mencocokkan nama dalam kelompok yang sama, sehingga `kelas` bisa
--    jadi sumber kebenaran utk "siapa yang mengajar".
--
-- Idempoten.
-- =====================================================================

BEGIN;

-- ── 1. Gilir guru: titik acuan + panjang giliran ─────────────────────
ALTER TABLE public.kelas
  ADD COLUMN IF NOT EXISTS gilir_mulai  date,
  ADD COLUMN IF NOT EXISTS gilir_minggu int;

ALTER TABLE public.kelas DROP CONSTRAINT IF EXISTS chk_kelas_gilir_minggu;
ALTER TABLE public.kelas
  ADD CONSTRAINT chk_kelas_gilir_minggu
  CHECK (gilir_minggu IS NULL OR gilir_minggu BETWEEN 1 AND 12);

COMMENT ON COLUMN public.kelas.gilir_mulai IS
  'Tanggal mulai giliran GURU PERTAMA (kelas.guru_id). Bersama gilir_minggu dipakai menghitung siapa yang mengajar pada tanggal tertentu. NULL = tidak ada gilir otomatis.';
COMMENT ON COLUMN public.kelas.gilir_minggu IS
  'Panjang satu giliran dalam minggu (mis. 2 = dua minggu guru A lalu dua minggu guru B).';

-- ── 2. jadwal_kbm -> kelas ───────────────────────────────────────────
ALTER TABLE public.jadwal_kbm
  ADD COLUMN IF NOT EXISTS kelas_id bigint REFERENCES public.kelas (id);

CREATE INDEX IF NOT EXISTS idx_jadwal_kbm_kelas ON public.jadwal_kbm (kelas_id);

COMMENT ON COLUMN public.jadwal_kbm.kelas_id IS
  'Penghubung ke Data Kelas. Sebelum kolom ini, jadwal_kbm.kelas cuma TEKS dan tidak pernah terhubung ke tabel kelas -- perubahan di Data Kelas tidak sampai ke pengumuman.';

-- Backfill: cocokkan nama kelas dalam kelompok yang sama.
UPDATE public.jadwal_kbm j
   SET kelas_id = k.id
  FROM public.kelas k
 WHERE j.kelas_id IS NULL
   AND k.kelompok_id = j.kelompok_id
   AND k.deleted_at IS NULL
   AND lower(btrim(k.nama)) = lower(btrim(j.kelas));

-- ── 3. Gabung kelas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kelas_gabung (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kelompok_id     bigint NOT NULL REFERENCES public.kelompok (id),
  kelas_id        bigint NOT NULL REFERENCES public.kelas (id),
  kelas_induk_id  bigint NOT NULL REFERENCES public.kelas (id),
  tanggal_mulai   date   NOT NULL,
  tanggal_selesai date   NOT NULL,
  jam_mulai       time,
  jam_selesai     time,
  ruangan         text,
  catatan         text,
  dibuat_oleh     uuid REFERENCES public.profiles (id),
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_kelas_gabung_rentang CHECK (tanggal_selesai >= tanggal_mulai),
  CONSTRAINT chk_kelas_gabung_beda    CHECK (kelas_id <> kelas_induk_id)
);
COMMENT ON TABLE public.kelas_gabung IS
  'Penggabungan SEMENTARA satu kelas ke kelas induk (mis. karena gurunya izin). Jam & ruangan ditentukan admin saat menggabung -- jam kedua kelas sering berbeda.';

CREATE INDEX IF NOT EXISTS idx_kelas_gabung_kelompok
  ON public.kelas_gabung (kelompok_id, tanggal_mulai, tanggal_selesai);

ALTER TABLE public.kelas_gabung ENABLE ROW LEVEL SECURITY;

-- Guru WAJIB bisa membaca: pengumuman & jadwal yang dia lihat harus
-- mencerminkan penggabungan yang dibuat admin.
DROP POLICY IF EXISTS "kelas_gabung_select_scoped" ON public.kelas_gabung;
CREATE POLICY "kelas_gabung_select_scoped" ON public.kelas_gabung
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = kelas_gabung.kelompok_id))
       OR (p.role IN ('admin_kelompok', 'guru') AND p.scope_kelompok_id = kelas_gabung.kelompok_id))));

DROP POLICY IF EXISTS "kelas_gabung_tulis_admin" ON public.kelas_gabung;
CREATE POLICY "kelas_gabung_tulis_admin" ON public.kelas_gabung
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = kelas_gabung.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = kelas_gabung.kelompok_id))))
  WITH CHECK (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = kelas_gabung.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = kelas_gabung.kelompok_id))));

COMMIT;
