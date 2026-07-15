# API DESIGN
## Tahap 18 dari 23

Mengikuti REST best practice: resource-based URL, HTTP method sesuai aksi, response konsisten.

---

## 1. Konvensi Umum

| Aspek | Aturan |
|---|---|
| Format | JSON |
| Auth | Bearer token (JWT) di header `Authorization` |
| Response sukses | `{ "success": true, "data": {...} }` |
| Response error | `{ "success": false, "error": { "code": "...", "message": "..." } }` |
| Pagination | `?page=1&limit=20`, response sertakan `meta: { total, page, limit }` |
| Filter | Query param, mis. `?kelompok_id=3&status=aktif` |

## 2. Endpoint Inti (Ringkas per Modul)

### Autentikasi
```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
```

### Organisasi
```
GET    /api/ppg
GET    /api/desa?ppg_id=
GET    /api/kelompok?desa_id=
PATCH  /api/kelompok/:id/status      -- BR-02, hanya role=admin_ppg
```

### Santri
```
GET    /api/santri?kelompok_id=&search=
GET    /api/santri/:id
POST   /api/santri
PUT    /api/santri/:id
DELETE /api/santri/:id               -- hanya role=admin_kelompok, scope match
POST   /api/santri/import            -- impor massal (FR-10)
POST   /api/santri/:id/jenjang       -- catat kenaikan jenjang (BR-14)
GET    /api/santri/:id/jenjang       -- riwayat jenjang
```

### Guru
```
GET    /api/guru?kelompok_id=&search=
POST   /api/guru
PUT    /api/guru/:id
```

### Absensi
```
GET    /api/absensi?santri_id=&bulan=&tahun=
POST   /api/absensi/batch            -- simpan 1 batch kehadiran harian (Wireframe §3)
GET    /api/absensi/rekap?kelompok_id=&periode=
```

### Munaqosah
```
GET    /api/munaqosah/periode
POST   /api/munaqosah/periode        -- buka periode, role=admin_desa|admin_ppg
PATCH  /api/munaqosah/periode/:id    -- tutup periode, wajib field estimasi_buka_kembali
GET    /api/munaqosah?periode_id=&kelompok_id=
POST   /api/munaqosah/:santri_id     -- input nilai, role=admin_kelompok
```

### Modul Kurikulum
```
GET    /api/kurikulum?santri_id=&semester=
POST   /api/kurikulum                -- input nilai Akhlaq + catatan
```

### Bimbingan Konseling
```
GET    /api/konseling?santri_id=&kategori=&status=&tanggal_mulai=&tanggal_akhir=
POST   /api/konseling
PATCH  /api/konseling/:id
```

### Dokumen (Pusat Unduhan)
```
GET    /api/dokumen/folder?parent_id=
POST   /api/dokumen/folder
GET    /api/dokumen/file?folder_id=
POST   /api/dokumen/file/upload
```

### Kalender & Laporan
```
GET    /api/kalender?bulan=&tahun=
POST   /api/kalender
GET    /api/laporan-kbm?bulan=&tahun=&kelompok_id=
GET    /api/peringkat?semester=&scope=
```

### Perbandingan (Fitur Baru — Tahap 10)
```
GET    /api/perbandingan/kelompok?desa_id=&metrik=
GET    /api/perbandingan/desa?metrik=
```

### Dashboard
```
GET    /api/dashboard/summary        -- otomatis scope sesuai role dari token
```

## 3. Contoh Kontrak: POST /api/absensi/batch

**Request:**
```json
{
  "tanggal": "2026-07-15",
  "kelompok_id": 1,
  "data": [
    { "santri_id": 101, "status": "hadir" },
    { "santri_id": 102, "status": "alpa" }
  ]
}
```

**Response (sukses):**
```json
{
  "success": true,
  "data": { "tersimpan": 2, "tanggal": "2026-07-15" }
}
```

**Response (error — scope tidak cocok):**
```json
{
  "success": false,
  "error": { "code": "FORBIDDEN_SCOPE", "message": "Anda tidak berwenang mengelola Kelompok ini." }
}
```

## 4. Middleware Wajib per Request

```
1. Verify JWT → tolak jika invalid/expired
2. Load user role + scope
3. Cek endpoint membutuhkan scope match? → validasi resource.kelompok_id/desa_id sesuai scope user
4. Jalankan handler
5. Log ke audit_log jika aksi = create/update/delete
```

---

## Quality Control — Tahap 18

**Selesai:** Konvensi umum, endpoint inti untuk seluruh 13 modul, 1 contoh kontrak detail, middleware RBAC wajib dijabarkan.
**Kurang:** Skema request/response detail per endpoint belum lengkap semua (hanya 1 contoh) — akan diperkaya saat implementasi Tahap 21 sesuai kebutuhan nyata.
**Risiko:** Rendah.
**Lanjut ke Tahap 19 — Development Roadmap.**

| Versi | Perubahan |
|---|---|
| 1.0 | Endpoint inti REST untuk seluruh modul |
