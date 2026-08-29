-- =====================================================================
-- 20260829100000_tabungan_penghimpun_input_semua.sql
--
-- Dua jalur uang masuk, bukan satu (permintaan owner 2026-08-29):
--
--   CARA 1  generus -> guru kelas -> (Setor) -> penghimpun     [sudah ada]
--   CARA 2  generus -> penghimpun langsung                     [BARU]
--
-- Kenyataannya dua-duanya terjadi: ada anak yang menyerahkan ke wali
-- kelasnya, ada orang tua yang menyerahkan langsung ke penghimpun di
-- depan masjid. Memaksa satu jalur saja bukan menyederhanakan, tapi
-- memindahkan kesalahan: uang yang diserahkan langsung akan dicatat
-- oleh guru kelas yang TIDAK PERNAH memegangnya, sehingga kas di tangan
-- guru itu tidak akan pernah cocok saat Setor -- padahal seluruh fitur
-- Setor dibangun di atas kecocokan itu.
--
-- Yang diubah hanya INSERT. Policy lain sudah otomatis benar:
--   - SELECT  : guru sekelompok memang sudah boleh melihat semuanya.
--   - UPDATE  : tabungan_transaksi_update_guru_terima berpatokan pada
--               `dicatat_oleh = auth.uid()`, bukan pada kelas -- jadi
--               penghimpun sudah bisa membetulkan catatannya sendiri.
--   - DELETE  : cabang gurunya juga murni `dicatat_oleh`.
--
-- Kolom `dicatat_guru_id` ditambahkan utk ASAL-USUL yang bisa dibaca di
-- riwayat tiap anak ("· Kak Ratna"). Tidak bisa diturunkan dari
-- `dicatat_oleh` di sisi klien: policy `profiles_self_read` membuat guru
-- cuma bisa membaca profilnya SENDIRI, jadi uuid pencatat tidak bisa
-- diterjemahkan jadi nama. Tanpa ini, guru kelas melihat anaknya belum
-- menabung lalu mencatat ulang -> saldo dobel.
--
-- `dicatat_oleh` TETAP jadi kolom audit yang sebenarnya; `dicatat_guru_id`
-- murni utk tampilan.
--
-- Idempoten.
-- =====================================================================

BEGIN;

-- ── 1. Predikat: pemanggil adalah penghimpun kelompok ini ────────────
-- Dipakai DI DALAM policy, bukan dipanggil klien. SECURITY DEFINER
-- supaya evaluasi policy tidak ikut menembus policy tabel
-- tabungan_penghimpun berulang kali utk tiap baris yang diperiksa.
DROP FUNCTION IF EXISTS public.adalah_penghimpun(bigint);

CREATE FUNCTION public.adalah_penghimpun(p_kelompok_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.tabungan_penghimpun tp,
           auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
     WHERE tp.kelompok_id = p_kelompok_id
       AND tp.guru_id IS NOT NULL
       AND p.is_active
       AND p.role = 'guru'
       AND p.guru_id = tp.guru_id
       AND p.scope_kelompok_id = p_kelompok_id
  )
$$;

COMMENT ON FUNCTION public.adalah_penghimpun(bigint) IS
  'True kalau pemanggil adalah guru yang ditunjuk admin_kelompok sbg penghimpun tabungan kelompok itu. Dipakai di policy tabungan_transaksi_insert supaya penghimpun boleh mencatat penerimaan utk generus mana pun sekelompoknya, bukan cuma kelas yang dia ampu.';

REVOKE ALL ON FUNCTION public.adalah_penghimpun(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adalah_penghimpun(bigint) TO authenticated;

-- ── 2. INSERT: tambah cabang penghimpun ──────────────────────────────
-- Batas arah/status-nya SAMA PERSIS dgn guru biasa: penghimpun tetap
-- tidak bisa menyulap penarikan jadi 'disetujui' sendiri -- aksesnya
-- meluas ke SIAPA, bukan ke APA.
DROP POLICY IF EXISTS "tabungan_transaksi_insert" ON public.tabungan_transaksi;
CREATE POLICY "tabungan_transaksi_insert" ON public.tabungan_transaksi
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = tabungan_transaksi.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tabungan_transaksi.kelompok_id)
       OR (p.role = 'guru'
           AND ( -- santri di kelas yang dia ampu (cara 1) ...
                 EXISTS (SELECT 1 FROM santri s JOIN kelas k ON k.id = s.kelas_id
                          WHERE s.id = tabungan_transaksi.santri_id
                            AND k.guru_id = p.guru_id AND k.deleted_at IS NULL)
                 -- ... atau dia penghimpun kelompok ini (cara 2).
              OR ( p.scope_kelompok_id = tabungan_transaksi.kelompok_id
                   AND public.adalah_penghimpun(tabungan_transaksi.kelompok_id)
                   AND EXISTS (SELECT 1 FROM santri s
                                WHERE s.id = tabungan_transaksi.santri_id
                                  AND s.kelompok_id = tabungan_transaksi.kelompok_id)))
           AND ( (tabungan_transaksi.arah = 'terima' AND tabungan_transaksi.status = 'disetujui')
              OR (tabungan_transaksi.arah = 'tarik'  AND tabungan_transaksi.status = 'pending') )))));

-- ── 3. Asal-usul catatan (utk tampilan) ──────────────────────────────
ALTER TABLE public.tabungan_transaksi
  ADD COLUMN IF NOT EXISTS dicatat_guru_id bigint REFERENCES public.guru (id);

COMMENT ON COLUMN public.tabungan_transaksi.dicatat_guru_id IS
  'Guru yang mencatat baris ini, utk ditampilkan di riwayat anak. Denormalisasi dari profiles.guru_id karena profiles_self_read menutup pemetaan uuid->nama di sisi klien. Audit sebenarnya tetap di dicatat_oleh.';

-- Backfill baris lama (migrasi jalan dgn hak penuh, tidak lewat RLS).
UPDATE public.tabungan_transaksi t
   SET dicatat_guru_id = p.guru_id
  FROM public.profiles p
 WHERE p.id = t.dicatat_oleh
   AND p.guru_id IS NOT NULL
   AND t.dicatat_guru_id IS NULL;

COMMIT;
