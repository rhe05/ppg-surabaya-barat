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
 * GET quote hari ini (dipanggil dari popup sukses Simpan Absen, guru MAUPUN
 * admin override — siapa saja yang sudah login boleh lihat). Rotasi: urut
 * berdasar id lalu index = (hari sejak epoch) % jumlah quote — deterministik
 * per HARI KALENDER (sama sepanjang hari itu, ganti besok), otomatis
 * berputar ulang dari awal begitu index melebihi jumlah quote yang ada.
 */
function serverGetQuoteHariIni(token) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const quotes = readSheetAsObjects(SHEET_NAMES.QUOTE_HARIAN)
    .filter(function (q) { return String(q.teks || '').trim() !== ''; })
    .sort(function (a, b) { return (parseInt(a.id) || 0) - (parseInt(b.id) || 0); });

  if (quotes.length === 0) {
    return { success: true, data: { teks: QUOTE_HARIAN_DEFAULT_ } };
  }

  const hariKe = Math.floor(new Date().getTime() / 86400000);
  const idx = hariKe % quotes.length;
  return { success: true, data: { teks: quotes[idx].teks } };
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

  logAudit('quote_harian', String(id), 'delete', ctx.user.id, 'Hapus quote');
  return { success: true, message: 'Quote berhasil dihapus.' };
}
