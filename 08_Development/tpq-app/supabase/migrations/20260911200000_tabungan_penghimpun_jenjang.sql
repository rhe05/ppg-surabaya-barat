-- =====================================================================
-- 20260911200000_tabungan_penghimpun_jenjang.sql
--
-- Keluhan Bu Ratna (guru, ditunjuk penghimpun Tabungan Rekreasi/Qurban):
-- daftar Generus yang tampil di layarnya SEMUA santri kelompok, padahal
-- dia cuma menghimpun jenjang tertentu (mis. Cabe Rawit saja).
--
-- Fix: `tabungan_penghimpun` dapat kolom `jenjang` (array enum
-- santri_jenjang) -- NULL/kosong = semua jenjang (perilaku LAMA, tidak
-- ada yang berubah utk kelompok yang belum mengisi ini). Admin kelp
-- pilih jenjang mana saja saat menunjuk penghimpun; daftar Generus di
-- layar Tabungan disaring `jenjang_saat_ini` sesuai pilihan itu KHUSUS
-- utk si penghimpun sendiri (admin_kelompok tetap lihat semua, itu
-- wewenangnya).
--
-- Tidak ada perubahan RLS -- ini murni filter tampilan (UX), bukan
-- batas keamanan; penghimpun tetap dipercaya admin utk kelompoknya.
-- =====================================================================

BEGIN;

ALTER TABLE public.tabungan_penghimpun
  ADD COLUMN IF NOT EXISTS jenjang public.santri_jenjang[];

COMMIT;
