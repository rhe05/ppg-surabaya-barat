# PPG Surabaya Barat — Project Documentation

> Aplikasi Manajemen TPQ (Taman Pendidikan Quran) untuk organisasi PPG Surabaya Barat.
> Built dengan Google Apps Script + HTML/CSS/JavaScript. Production-ready.

## Quick Summary

**Project**: PPG Surabaya Barat TPQ Management App  
**Status**: ✅ Complete (4 phases delivered)  
**Stack**: Google Apps Script + Google Sheets + HTML/CSS/JS  
**Repo**: https://github.com/rhe05/ppg-surabaya-barat (private, akun rhe05)  
**Deployment**: Auto via GitHub Actions → Apps Script Web App  
**Last Updated**: 2026-07-15  

---

## Architecture Overview

### Frontend
- **7 Screens**: Login, Dashboard, Santri, Guru, Absensi, Laporan, Statistik, User Management
- **Tech**: Vanilla HTML/CSS/JavaScript (no framework)
- **Responsive**: 5 breakpoints (xs:320px, sm:480px, md:768px, lg:1024px, xl:1280px)
- **Charts**: Google Charts API (LineChart, BarChart, PieChart, ColumnChart)
- **Pattern**: `google.script.run()` for async server calls

### Backend
- **Language**: Google Apps Script (~2000 lines)
- **Modules**: 8 modules (Utilities, Dashboard, Statistics, Laporan, UserManagement, MaintainSantri/Guru/Absensi)
- **Functions**: 35+ server functions with RBAC enforcement
- **Auth**: Custom auth + SHA-256 password hashing
- **RBAC**: 4 roles (admin_ppg, admin_desa, admin_kelompok, guru)

### Database
- **Storage**: Google Sheets (12 sheets/tables)
- **Schema**: Organizasi, Pengguna, Santri, Guru, Absensi, Evaluasi, Kurikulum, Audit
- **Key Tables**: ppg, desa, kelompok, users (12 cols), santri, guru, absensi

---

## Features by Phase

### Phase 1: Laporan & Export ✅
- CSV export untuk Santri, Guru, Absensi
- Ringkasan kehadiran per kelompok
- Print-friendly reports
- **Backend**: Modul_Laporan.gs

### Phase 2: Statistik & Analytics ✅
- **4 Analytics Tabs**:
  - Kehadiran: Line chart trend + Bar chart per kelompok
  - Demografi: Pie chart gender + Column chart santri per jenjang
  - Ranking: Top 10 & Bottom 10 santri
  - Growth: Column chart santri/guru + KPI cards
- **Backend**: Modul_Statistics.gs

### Phase 3: User Management ✅
- Create/Edit/Delete users
- Reset password (generate temp)
- Toggle status (active/inactive)
- Change own password
- **Backend**: Modul_UserManagement.gs

### Phase 4: Mobile Optimization ✅
- Responsive design (5 breakpoints)
- Touch-friendly UI (44×44px buttons)
- Mobile overlay navigation
- Full-screen modals pada mobile
- Responsive charts with dynamic sizing

---

## Key Files

```
13_AppsScript/
├── Index.html (1500+ lines)
│   ├── 7 complete screens
│   ├── 40+ JavaScript functions
│   └── Responsive CSS (5 breakpoints + touch)
├── Setup_Database.gs — Schema + seeding
├── Modul_Utilities.gs — Auth, RBAC, helpers
├── Modul_Dashboard.gs — KPI aggregation
├── Modul_Statistics.gs — Analytics (6 functions)
├── Modul_Laporan.gs — Export/reports (4 functions)
├── Modul_SeedData.gs — Demo data
├── Modul_MaintainSantri.gs — Santri CRUD
├── Modul_MaintainGuru.gs — Guru CRUD
└── Modul_MaintainAbsensi.gs — Absensi CRUD

.github/workflows/
└── deploy-appsscript.yml — CI/CD pipeline
```

---

## Development Guide

### Setup
1. Clone repo: `git clone https://github.com/rhe05/ppg-surabaya-barat.git`
2. Open Google Sheet (ID in `.clasp.json`)
3. Apps Script editor: Extensions > Apps Script
4. Push code: `clasp push` (or via GitHub Actions)

### Adding Features
1. **Backend**: Add function to appropriate Modul_*.gs
2. **Frontend**: Add JavaScript function + UI element in Index.html
3. **Database**: Update Setup_Database.gs if schema changes needed
4. **Test**: Run function in Apps Script editor
5. **Commit**: `git add -A && git commit -m "feat: ..."`
6. **Deploy**: `git push origin main` (auto-deploys via CI/CD)

### Testing
- Test locally in Apps Script editor
- Test in web app (run deployed version)
- Check browser console for JS errors
- Verify RBAC: test with different user roles

### Database
- Run `setupDatabaseStructure()` to initialize (safe to re-run)
- Run `seedTestData()` for demo data
- Check Google Sheet for data integrity

---

## Login & RBAC

### Default Credentials (CHANGE BEFORE PRODUCTION)
- **Username**: `admin`
- **Password**: `admin123`
- **Role**: `admin_ppg`

### Roles
- `admin_ppg` — Access everything (7 screens + user management)
- `admin_desa` — Access own desa's data (5 screens)
- `admin_kelompok` — Access own kelompok's data (5 screens)
- `guru` — View-only access (dashboard, view santri/guru/absensi)

### RBAC Enforcement
- All backend functions check user role/scope
- Frontend conditionally shows User Management menu (admin only)
- Users see only data they have access to

---

## Deployment & CI/CD

### GitHub Setup
1. **Repository**: https://github.com/rhe05/ppg-surabaya-barat (private)
2. **GitHub Account**: rhe05
3. **SSH Key**: Added to GitHub
4. **Secrets**:
   - `CLASPRC_JSON` — Contents of `~/.clasprc.json`
   - `APPSSCRIPT_DEPLOYMENT_ID` — Web App deployment ID
5. **Workflow**: `.github/workflows/deploy-appsscript.yml`

### Deployment Flow
```
Local change → git push → GitHub Actions
→ clasp push (update code) → clasp deploy (same deployment ID)
→ Web App URL stays same, code updated ✅
```

### Web App URL
After deployment, app accessible at Apps Script deployment URL (stable URL, same even after updates).

---

## Performance & Limitations

### Performance
- Dashboard load: ~2-3s first load (with charts) → <1s cached
- Charts: Renders within 1-2s
- Network: Requires stable internet (no offline support)

### Current Limitations
- ❌ No offline sync (requires internet)
- ❌ No bulk Excel import (CSV export only)
- ❌ No push/email notifications
- ❌ No dark mode
- ❌ No PWA support

### Future Improvements
- [ ] Offline capability (IndexedDB + sync)
- [ ] Bulk Excel import
- [ ] Email notifications
- [ ] Dark mode toggle
- [ ] PWA wrapper
- [ ] Advanced analytics
- [ ] Mobile app (Capacitor)

---

## Troubleshooting

### App not loading?
1. Check network connection (requires internet)
2. Clear browser cache (Ctrl+Shift+Delete)
3. Check Apps Script logs: Extensions > Apps Script > Logs
4. Verify Google Sheet is accessible

### Charts not rendering?
1. Check that data exists (run `loadDashboard()` first)
2. Verify Google Charts library loaded (`google.charts.load()`)
3. Check browser console for errors
4. Mobile? Charts smaller but should still render

### Login failing?
1. Verify credentials in users sheet
2. Check password hash (should be SHA-256)
3. Clear sessionStorage: F12 > Application > Session Storage > Clear All
4. Check Apps Script logs

### User can't see data?
1. Check user's role and scope_id in users sheet
2. Verify RBAC logic in backend function
3. Check kelompok_id matches user's scope_id
4. Clear cache and re-login

---

## Code Standards

- **Git Messages**: Descriptive, use `feat:`, `fix:`, `refactor:`
- **Naming**: camelCase for JS/functions, snake_case for sheet columns
- **Comments**: Only for non-obvious logic (why, not what)
- **Modules**: Group by feature (Laporan, Statistics, etc.)
- **RBAC**: Always enforce in backend, never trust frontend

---

## Important Notes

⚠️ **Before Production**:
1. Change default admin password
2. Test with real data
3. Verify all sheets have headers
4. Backup Google Sheet
5. Train users
6. Monitor Apps Script quotas

⚠️ **Security**:
- Passwords: SHA-256 hashed (sufficient for internal org)
- No HTTPS worries: Google Apps Script provides HTTPS
- Data: In Google Sheets (encrypted at rest)
- Auth: Session token in sessionStorage (HTTPS only)

⚠️ **Quotas**:
- Apps Script: 20k/day (execution units)
- Google Sheets: API quota shared with Apps Script
- Monitor: Extensions > Apps Script > Overview

---

## Git History

```
81347b4 feat: mobile optimization — responsive design + touch-friendly UX
bf6de5c feat: user management — CRUD + RBAC + password management
1c75b1a feat: statistik & analytics — Google Charts + advanced metrics
03c4a11 feat: laporan & export CSV — santri, guru, absensi + ringkasan kehadiran
9cf1756 fix: replace hamburger icon dengan chevron SVG button (like kalkulator laundry)
9c73ddf fix: sidebar alignment + collapsible toggle
474e602 feat: sidebar navigation + 5 complete screens (dashboard, santri, guru, absensi)
```

---

## Contact & References

**Owner**: rheza354@gmail.com  
**GitHub**: rhe05  
**Created**: 2026-07 (approximately)  
**Last Updated**: 2026-07-15  

**Related Docs**:
- Memory: `~/.claude/projects/PPG_Surabaya_Barat/memory/ppg-project-status.md`
- CI/CD Details: `memory/appsscript-github-cicd.md`

---

**Status**: ✅ Production Ready  
**Next Step**: Deploy to team, gather feedback, iterate on Phase 5 improvements
