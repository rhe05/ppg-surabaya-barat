/**
 * Modul_MaintainKalender.gs — CRUD Kalender Akademik
 * Server-side functions untuk manajemen events (KBM, Ujian, Acara, Libur)
 *
 * RBAC:
 * - admin_ppg: Akses semua event
 * - admin_desa/kelompok: Akses event di kelompok mereka
 * - guru: View-only access
 */

/**
 * GET daftar event untuk bulan tertentu (untuk calendar view).
 * Return: [{id, tanggal, judul, tipe, pukul_mulai, kelompok_id}]
 * Cache 180dtk per (tahun, bulan, kelompokId, role, scopeId) — kalender
 * akademik jarang berubah dalam hitungan menit (audit performa 2026-08-07,
 * Sprint 2).
 */
function serverGetCalendarEvents(token, tahun, bulan, kelompokId = null) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const cacheKey = 'kalender_events_' + tahun + '_' + bulan + '_' + kelompokId + '_' + user.role + '_' + user.scopeId;
  const cached = cacheGet_(cacheKey);
  if (cached) return cached;

  let eventData = readSheetAsObjects(SHEET_NAMES.CALENDAR_EVENTS);

  // RBAC: Tentukan scope akses
  if (user.role === 'admin_desa' || user.role === 'admin_kelompok') {
    const kelompokData = readSheetAsObjects(SHEET_NAMES.KELOMPOK);
    let accessibleKelompokIds = [];

    if (user.role === 'admin_desa') {
      accessibleKelompokIds = kelompokData
        .filter(k => k.desa_id == user.scopeId)
        .map(k => k.id);
    } else {
      accessibleKelompokIds = [user.scopeId];
    }

    eventData = eventData.filter(e => accessibleKelompokIds.includes(Number(e.kelompok_id)));
  }

  // Filter by bulan/tahun
  const dateStr = `${tahun}-${String(bulan).padStart(2, '0')}`;
  eventData = eventData.filter(e => e.tanggal.startsWith(dateStr));

  // Sort by tanggal & pukul_mulai
  eventData.sort((a, b) => {
    if (a.tanggal !== b.tanggal) return a.tanggal.localeCompare(b.tanggal);
    return (a.pukul_mulai || '').localeCompare(b.pukul_mulai || '');
  });

  const result = { success: true, data: eventData };
  cachePut_(cacheKey, result, 180);
  return result;
}

/**
 * GET event detail.
 */
function serverGetCalendarEventDetail(token, eventId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const eventData = readSheetAsObjects(SHEET_NAMES.CALENDAR_EVENTS)
    .find(e => e.id == eventId);

  if (!eventData) {
    return { success: false, error: 'Event tidak ditemukan.' };
  }

  // RBAC check
  if (user.role !== 'admin_ppg') {
    if (!validateUserAccess(token, 'kelompok', eventData.kelompok_id)) {
      return { success: false, error: 'Anda tidak memiliki akses.' };
    }
  }

  return { success: true, data: eventData };
}

/**
 * CREATE event kalender baru.
 * Input: {kelompok_id, tanggal, judul_event, deskripsi, tipe_event, lokasi, pukul_mulai, pukul_selesai}
 * tipe_event: 'kbm' | 'ujian' | 'acara' | 'libur'
 */
function serverCreateCalendarEvent(token, eventData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  // Validasi data
  if (!eventData.kelompok_id || !eventData.tanggal || !eventData.judul_event) {
    return { success: false, error: 'Kelompok, tanggal, dan judul event wajib diisi.' };
  }

  if (!eventData.tanggal.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  }

  if (!['kbm', 'ujian', 'acara', 'libur'].includes(eventData.tipe_event)) {
    return { success: false, error: 'Tipe event tidak valid.' };
  }

  // RBAC check
  if (!validateUserAccess(token, 'kelompok', eventData.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  // Insert
  const id = generateId(SHEET_NAMES.CALENDAR_EVENTS);
  const now = new Date().toISOString().split('T')[0];
  appendRowToSheet(SHEET_NAMES.CALENDAR_EVENTS, [
    id,
    eventData.kelompok_id,
    eventData.tanggal,
    eventData.judul_event,
    eventData.deskripsi || '',
    eventData.tipe_event,
    eventData.lokasi || '',
    eventData.pukul_mulai || '',
    eventData.pukul_selesai || '',
    user.id,
    now,
    now,
  ]);

  logAudit(SHEET_NAMES.CALENDAR_EVENTS, id, 'create', user.id, `Event: ${eventData.judul_event} (${eventData.tipe_event})`);

  return { success: true, message: 'Event berhasil ditambahkan.', id };
}

/**
 * UPDATE event.
 */
function serverUpdateCalendarEvent(token, eventId, updates) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const eventData = readSheetAsObjects(SHEET_NAMES.CALENDAR_EVENTS)
    .find(e => e.id == eventId);

  if (!eventData) {
    return { success: false, error: 'Event tidak ditemukan.' };
  }

  // RBAC check
  if (!validateUserAccess(token, 'kelompok', eventData.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses.' };
  }

  // Validasi tipe_event jika ada update
  if (updates.tipe_event && !['kbm', 'ujian', 'acara', 'libur'].includes(updates.tipe_event)) {
    return { success: false, error: 'Tipe event tidak valid.' };
  }

  const now = new Date().toISOString().split('T')[0];

  updateRowByQuery(SHEET_NAMES.CALENDAR_EVENTS, { id: eventId }, {
    tanggal: updates.tanggal !== undefined ? updates.tanggal : eventData.tanggal,
    judul_event: updates.judul_event !== undefined ? updates.judul_event : eventData.judul_event,
    deskripsi: updates.deskripsi !== undefined ? updates.deskripsi : eventData.deskripsi,
    tipe_event: updates.tipe_event !== undefined ? updates.tipe_event : eventData.tipe_event,
    lokasi: updates.lokasi !== undefined ? updates.lokasi : eventData.lokasi,
    pukul_mulai: updates.pukul_mulai !== undefined ? updates.pukul_mulai : eventData.pukul_mulai,
    pukul_selesai: updates.pukul_selesai !== undefined ? updates.pukul_selesai : eventData.pukul_selesai,
    diupdate_pada: now,
  });

  logAudit(SHEET_NAMES.CALENDAR_EVENTS, eventId, 'update', user.id, JSON.stringify(updates));

  return { success: true, message: 'Event berhasil diperbarui.' };
}

/**
 * DELETE event.
 */
function serverDeleteCalendarEvent(token, eventId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const eventData = readSheetAsObjects(SHEET_NAMES.CALENDAR_EVENTS)
    .find(e => e.id == eventId);

  if (!eventData) {
    return { success: false, error: 'Event tidak ditemukan.' };
  }

  // RBAC check: only admin_ppg atau pembuat event
  if (user.role !== 'admin_ppg' && user.id != eventData.dibuat_oleh) {
    return { success: false, error: 'Hanya pembuat atau admin yang bisa menghapus.' };
  }

  deleteRowByQuery(SHEET_NAMES.CALENDAR_EVENTS, { id: eventId });
  logAudit(SHEET_NAMES.CALENDAR_EVENTS, eventId, 'delete', user.id, 'Event deleted');

  return { success: true, message: 'Event berhasil dihapus.' };
}

/**
 * GET event summary untuk bulan tertentu (untuk display).
 * Return: {total_events, by_type: {kbm: N, ujian: N, acara: N, libur: N}}
 */
function serverGetCalendarEventSummary(token, tahun, bulan, kelompokId = null) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const cacheKey = 'kalender_summary_' + tahun + '_' + bulan + '_' + kelompokId + '_' + user.role + '_' + user.scopeId;
  const cached = cacheGet_(cacheKey);
  if (cached) return cached;

  let eventData = readSheetAsObjects(SHEET_NAMES.CALENDAR_EVENTS);

  // RBAC
  if (user.role === 'admin_desa' || user.role === 'admin_kelompok') {
    const kelompokData = readSheetAsObjects(SHEET_NAMES.KELOMPOK);
    let accessibleKelompokIds = [];

    if (user.role === 'admin_desa') {
      accessibleKelompokIds = kelompokData
        .filter(k => k.desa_id == user.scopeId)
        .map(k => k.id);
    } else {
      accessibleKelompokIds = [user.scopeId];
    }

    eventData = eventData.filter(e => accessibleKelompokIds.includes(Number(e.kelompok_id)));
  }

  // Filter by month
  const dateStr = `${tahun}-${String(bulan).padStart(2, '0')}`;
  eventData = eventData.filter(e => e.tanggal.startsWith(dateStr));

  // Count by type
  const byType = {
    kbm: eventData.filter(e => e.tipe_event === 'kbm').length,
    ujian: eventData.filter(e => e.tipe_event === 'ujian').length,
    acara: eventData.filter(e => e.tipe_event === 'acara').length,
    libur: eventData.filter(e => e.tipe_event === 'libur').length,
  };

  const result = {
    success: true,
    data: {
      total_events: eventData.length,
      by_type: byType,
    },
  };
  cachePut_(cacheKey, result, 180);
  return result;
}
