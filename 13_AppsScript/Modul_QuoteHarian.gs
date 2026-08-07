/**
 * Modul_QuoteHarian.gs — Pool "Quote of the Day" utk popup sukses Simpan
 * Absen (Input Absen guru, mobile). Admin PPG kelola daftar quote lewat
 * CRUD sederhana (menu "Kelola Quote", hanya tampil di mode Admin PPG
 * override Input Absen). Quote yang tampil tiap hari dipilih OTOMATIS
 * berputar (round-robin berdasar hari, BUKAN dijadwal per tanggal) — kalau
 * admin belum menambah quote baru, quote lama akan tampil lagi bergiliran.
 */

const QUOTE_HARIAN_DEFAULT_ = 'Pejuang Tidak Mundur Karena diCaci Tidak Maju Karena diPuji';

/**
 * GET seluruh pool teks quote (dipanggil sekali saat screen Input Absen
 * guru dibuka, guru MAUPUN admin override — siapa saja yang sudah login
 * boleh lihat). SEBELUMNYA fungsi ini mengembalikan 1 quote deterministik
 * per HARI KALENDER (sama sepanjang hari, tidak berubah walau berkali-kali
 * Simpan Kehadiran) — diganti kembalikan SELURUH pool supaya klien bisa
 * pilih quote ACAK setiap kali Simpan Kehadiran berhasil (lihat
 * window.iaPickRandomQuote_, Script_Main.html) TANPA round-trip tambahan.
 *
 * Cache 3600dtk (pool cuma berubah kalau admin PPG Tambah/Hapus quote lewat
 * "Kelola Quote" — sangat jarang) — di-invalidate eksplisit di
 * serverAddQuote_/serverDeleteQuote di bawah, bukan cuma menunggu TTL habis
 * (audit performa 2026-08-07, Sprint 1).
 */
function serverGetQuoteHariIni(token) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const cached = cacheGet_('quote_harian_pool');
  if (cached) return { success: true, data: { pool: cached } };

  const quotes = readSheetAsObjects(SHEET_NAMES.QUOTE_HARIAN)
    .filter(function (q) { return String(q.teks || '').trim() !== ''; })
    .map(function (q) { return q.teks; });

  const pool = quotes.length ? quotes : [QUOTE_HARIAN_DEFAULT_];
  cachePut_('quote_harian_pool', pool, 3600);
  return { success: true, data: { pool: pool } };
}

/**
 * GET daftar semua quote — khusus Admin PPG (modal "Kelola Quote").
 */
function serverGetQuoteList(token) {
  const ctx = requireAdminPpg_(token);
  if (!ctx.success) return ctx;

  const quotes = readSheetAsObjects(SHEET_NAMES.QUOTE_HARIAN)
    .sort(function (a, b) { return (parseInt(b.id) || 0) - (parseInt(a.id) || 0); });
  return { success: true, data: quotes };
}

/**
 * TAMBAH quote baru ke pool — khusus Admin PPG.
 */
function serverAddQuote(token, teks) {
  const ctx = requireAdminPpg_(token);
  if (!ctx.success) return ctx;

  teks = String(teks || '').trim();
  if (!teks) return { success: false, error: 'Teks quote tidak boleh kosong.' };
  if (teks.length > 300) return { success: false, error: 'Teks quote terlalu panjang (maks 300 karakter).' };

  let newId;
  withScriptLock_(function () {
    newId = generateId(SHEET_NAMES.QUOTE_HARIAN);
    appendRowToSheet(SHEET_NAMES.QUOTE_HARIAN, [newId, teks, ctx.user.nama || ctx.user.id, new Date().toISOString()]);
  });
  cacheDrop_('quote_harian_pool');

  logAudit('quote_harian', String(newId), 'create', ctx.user.id, `Tambah quote: "${teks}"`);
  return { success: true, message: 'Quote berhasil ditambahkan.' };
}

/**
 * HAPUS satu quote dari pool — khusus Admin PPG.
 */
function serverDeleteQuote(token, id) {
  const ctx = requireAdminPpg_(token);
  if (!ctx.success) return ctx;

  withScriptLock_(function () {
    deleteRowByQuery(SHEET_NAMES.QUOTE_HARIAN, { id: id });
  });
  cacheDrop_('quote_harian_pool');

  logAudit('quote_harian', String(id), 'delete', ctx.user.id, 'Hapus quote');
  return { success: true, message: 'Quote berhasil dihapus.' };
}
