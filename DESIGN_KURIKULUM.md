# Design Doc: Fitur Kurikulum (Prota/Promes/Probul + Pencapaian Santri)

**Status**: Design phase (untuk review & approval sebelum implementation)  
**Target**: Dashboard Kelompok Petemon (pilot), nanti scale ke semua kelompok  
**Scope**: Prota (tahunan) + Promes (semester) + Probul (bulanan) + Pencapaian Santri  
**Effort Est.**: 1.5-2 hari (design: done, coding: medium-high complexity)  

---

## 1. Skema Database (Google Sheet)

### 1a. Sheet `kurikulum_prota` — Program Tahunan
```
Kolom: id, kelompok_id, tahun, kategori, target, deskripsi, created_by, created_at, updated_at
Tipe:  text, text, number, text, text, text, text, datetime, datetime
PK:    id (auto-gen: "prota_<kelompok_id>_<tahun>_<kategori>")

Contoh data (Kelp Petemon 2026):
| id | kelompok_id | tahun | kategori | target | deskripsi |
|----|---|---|---|---|---|
| prota_petemon_2026_hafalan | Petemon | 2026 | Hafalan | 30 juz | Al-Quran 30 juz |
| prota_petemon_2026_doa | Petemon | 2026 | Doa-Doa | 15 doa | Doa harian + doa surat |
| prota_petemon_2026_tajwid | Petemon | 2026 | Tajwid | Dasar-Menengah | Makhraj, Panjang pendek, dll |
```

### 1b. Sheet `kurikulum_promes` — Program Semester
```
Kolom: id, kelompok_id, prota_id, semester, target, deskripsi, created_by, created_at, updated_at
Tipe:  text, text, text, number, text, text, text, datetime, datetime
PK:    id (auto-gen: "promes_<prota_id>_<semester>")
FK:    prota_id (link ke prota)

Contoh data (Hafalan 2026):
| id | kelompok_id | prota_id | semester | target | deskripsi |
|----|---|---|---|---|---|
| promes_prota_petemon_2026_hafalan_1 | Petemon | prota_petemon_2026_hafalan | 1 | 15 juz | Juz 1-15 (Jan-Jun) |
| promes_prota_petemon_2026_hafalan_2 | Petemon | prota_petemon_2026_hafalan | 2 | 15 juz | Juz 16-30 (Jul-Des) |
```

### 1c. Sheet `kurikulum_probul` — Program Bulanan
```
Kolom: id, kelompok_id, promes_id, tahun, bulan, kategori, target, deskripsi, created_by, created_at, updated_at
Tipe:  text, text, text, number, number, text, text, text, text, datetime, datetime
PK:    id (auto-gen: "probul_<promes_id>_<bulan>")
FK:    promes_id (link ke promes)

Contoh data (Agustus 2026, Hafalan):
| id | kelompok_id | promes_id | tahun | bulan | kategori | target | deskripsi |
|----|---|---|---|---|---|---|---|
| probul_promes_hafalan_8 | Petemon | promes_prota_2026_hafalan_2 | 2026 | 8 | Hafalan | 2 surat | Al-Alaq + An-Nisa ayat 1-10 |
| probul_promes_doa_8 | Petemon | promes_prota_doa_2 | 2026 | 8 | Doa | 2 doa | Doa sebelum ngaji, doa setelah ngaji |
```

### 1d. Sheet `kurikulum_pencapaian_santri` — Tracking Progress Santri
```
Kolom: id, kelompok_id, santri_id, probul_id, status, tanggal_update, catatan_guru, updated_by
Tipe:  text, text, text, text, text, datetime, text, text
PK:    id (auto-gen)
FK:    probul_id (link ke probul)

Status enum: "pending" | "in_progress" | "completed"

Contoh data (Agustus 2026, Santri xyz):
| id | kelompok_id | santri_id | probul_id | status | tanggal_update | catatan_guru |
|----|---|---|---|---|---|---|
| cap_santri_xyz_probul_hafalan_8 | Petemon | xyz | probul_promes_hafalan_8 | in_progress | 2026-08-15 | Sudah sampai Al-Alaq, lanjut An-Nisa |
| cap_santri_xyz_probul_doa_8 | Petemon | xyz | probul_promes_doa_8 | completed | 2026-08-10 | Dua doa sudah hafal |
```

---

## 2. Architecture & Pattern

### 2a. Backend (Google Apps Script)

**Modul baru**: `Modul_MaintainKurikulum.gs` (±500 baris, pola sama seperti `Modul_MaintainJadwalKBM.gs`)

**Functions (public, via `google.script.run`):**
```
// Prota CRUD
serverGetProta(token, kelompokId, tahun) → {success, data:[]}
serverAddProta(token, kelompokId, tahun, kategori, target, deskripsi) → {success, error?, id}
serverUpdateProta(token, protaId, target, deskripsi) → {success, error?}
serverDeleteProta(token, protaId) → {success, error?}

// Promes CRUD
serverGetPromes(token, protaId) → {success, data:[]}
serverAddPromes(token, protaId, semester, target, deskripsi) → {success, error?, id}
serverUpdatePromes(token, promesId, target, deskripsi) → {success, error?}
serverDeletePromes(token, promesId) → {success, error?}

// Probul CRUD
serverGetProbul(token, kelompokId, tahun, bulan) → {success, data:[]}
serverAddProbul(token, promesId, bulan, kategori, target, deskripsi) → {success, error?, id}
serverUpdateProbul(token, probulId, target, deskripsi) → {success, error?}
serverDeleteProbul(token, probulId) → {success, error?}

// Pencapaian Santri CRUD
serverGetPencapaianSantri(token, kelompokId, probulId) → {success, data:[]}
serverUpdatePencapaianSantri(token, pencapaianId, status, catatan) → {success, error?}
```

**Pattern (copy dari JadwalKBM/Pengumuman):**
- ✅ RBAC: `validateUserAccess_` (kelompok_id)
- ✅ Lock: `withScriptLock_` untuk semua mutasi (add/update/delete)
- ✅ Cache: `cacheGet_`/`cachePut_` kunci: `kurikulum_<kelompok_id>_<tahun>`
- ✅ Error: try-catch → return `{success, error}` atau `{success, data}`
- ✅ Log: `ERROR_LOG.md` jika ada bug

**Utility functions (internal):**
```
readKurikulumAsObjects_(sheetName) → array of objects
findProtaByQuery_(kelompokId, tahun, kategori) → row object
calcPencapaianStat_(pencapaianList) → {pending, in_progress, completed}
```

### 2b. Frontend (HTML/JS)

**UI Location**: Dashboard Kelompok Petemon, sidebar menu "📚 Kurikulum"

**New JS functions** (di `Script_Main.html`):
```
// Tab switching
switchKurikulumTab_(tabName) // 'prota' | 'promes' | 'probul' | 'pencapaian'

// Prota
loadProtaList_(kelompokId, tahun, onDone)
renderProtaList_(data)
openModalAddProta()
saveProta()
deleteProta(protaId)

// Promes
loadPromesListByProta_(protaId, onDone)
renderPromesList_(data, protaTitle)
openModalAddPromes(protaId)
savePromes()
deletePromes(promesId)

// Probul
loadProbulByMonth_(kelompokId, bulan, onDone)
renderProbulList_(data, monthName)
openModalAddProbul(promesId)
saveProbul()
deleteProbul(probulId)

// Pencapaian Santri
loadPencapaianSantri_(kelompokId, probulId, onDone)
renderPencapaianTable_(data, probulDesc)
updatePencapaianStatus(pencapaianId, newStatus)
editPencapaianCatatan(pencapaianId)
```

**Interaction pattern:**
1. User klik "Kurikulum" sidebar → load Prota list untuk tahun tertentu
2. Klik Prota card → expand show Promes (2 semester)
3. Klik Promes → expand show Probul per bulan (12 bulan grid)
4. Klik Probul → open "Pencapaian Santri" (tabel santri + status per materi)

---

## 3. UI Component Spec

### 3a. Layout (Dashboard Kurikulum)
```
Header:
  ┌─ Kurikulum — Kelp Petemon
  │  Tahun: [Dropdown 2025/2026/2027]
  └─ [Refresh] [+ Tambah Prota]

Content:
  Tab: [Tahunan] [Semester] [Bulanan] [Pencapaian Santri]
  
  [Tahunan] tab (default):
    Grid 2-3 kolom:
      ┌─ Prota Card (premium style, brass accent)
      │  ├─ Hafalan — 30 juz
      │  ├─ (2 semester nested)
      │  └─ [Edit] [Hapus]
      └─ ...
```

### 3b. Card Styles (reuse existing CSS)
- **Prota Card**: `.kpi-card` style (premium, brass accent, border, shadow)
- **Promes Row**: `.jadwal-sesi` style (no border, simple flex)
- **Probul Row**: `.jadwal-sesi` style (compact, no shadow)
- **Pencapaian Table**: `.data-table` style (match guru/santri table)

### 3c. Modal Dialog
- `#modalTambahProta` — form (Tahun/Kategori/Target/Deskripsi)
- `#modalTambahPromes` — form (Semester/Target/Deskripsi)
- `#modalTambahProbul` — form (Bulan/Kategori/Target/Deskripsi)
- `#modalEditPencapaian` — dropdown status (pending/in_progress/completed) + textarea catatan

**Form fields (reuse existing patterns):**
```
<input type="text" class="form-select" id="..."> (dengan validation)
<textarea class="form-input" id="..."> (catatan guru)
<select class="form-select"> (dropdown)
```

---

## 4. Data Flow Diagram

```
Admin set Prota (tahunan)
    ↓
Admin breakdown ke Promes (per semester, auto-link ke Prota)
    ↓
Guru/Admin set Probul tiap bulan (auto-link ke Promes)
    ↓
Guru update Pencapaian Santri (per santri per Probul)
    ↓
Dashboard Pencapaian:
  - Show: Santri XYZ, bulan Agustus
  - Status per materi (pending/in_progress/completed)
  - Catatan guru (progress, hambatan, next target)
```

---

## 5. Implementation Roadmap

### Phase 1: Backend CRUD (1 hari)
- [ ] Setup sheets (`setupDatabaseStructure()` update)
- [ ] `Modul_MaintainKurikulum.gs` (all functions)
- [ ] Test locally via Apps Script editor

### Phase 2: Frontend UI (0.5 hari)
- [ ] Add "Kurikulum" sidebar menu to Dashboard Kelompok
- [ ] Tab switch + lazy load per tab
- [ ] Render functions (prota/promes/probul/pencapaian)
- [ ] Modal add/edit/delete
- [ ] Error handling

### Phase 3: QA & Deploy (0.5 hari)
- [ ] Local check (`node tools/check_local.js`)
- [ ] Deploy via GitHub Actions
- [ ] Verify served output
- [ ] Browser test (add/edit/delete flow)

---

## 6. Reference Existing Patterns

**Pola yang di-reuse dari codebase:**
- Lock & Cache: `Modul_Utilities.gs` → `withScriptLock_`, `cacheGet_`, `cacheDrop_`
- RBAC: `validateUserAccess_(token, 'kelompok', kelompok_id)`
- Error return: `{success: true, data: [...]}` atau `{success: false, error: 'msg'}`
- CSS: `.guru-dash-kpi-card`, `.jadwal-sesi`, `.data-table`, `.modal-overlay`
- JS pattern: `window.loadKurikulumProta_ = function(kelompokId, onDone) { ... }`
- Date: `parseDateFlexible_`, `formatTanggalDisplay_`

**File affected:**
- `Setup_Database.gs` → add 4 sheets + migration
- `Modul_MaintainKurikulum.gs` → NEW
- `Script_Main.html` → add 15-20 functions
- `Markup_Screens.html` → add Kurikulum section + modals
- `Style_Main.html` → add CSS rules (reuse existing classes mostly)

---

## 7. Success Criteria

✅ Admin Petemon bisa set Prota 2026 (3 kategori: Hafalan/Doa/Tajwid)  
✅ Auto-breakdown ke Promes 2 semester  
✅ Guru bisa set Probul per bulan (Agustus: 2 surat + 2 doa)  
✅ Guru bisa update status santri per materi (pending/in_progress/completed)  
✅ Dashboard Pencapaian show santri mana yang tertinggal  
✅ Responsive mobile (Pencapaian tabel bisa scroll)  
✅ No white-screen bugs (guardrail lolos)  
✅ Deployed & verified (verify_served.js lolos)  

---

**Status**: Ready for review. Tunggu approval sebelum coding dimulai.
