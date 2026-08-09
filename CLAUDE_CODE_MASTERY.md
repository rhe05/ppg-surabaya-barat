# CLAUDE CODE MASTERY — Resep Rahasia & Advanced Patterns
**Versi: 1.0 | Tanggal: Juli 2026 | Author: Scientific Advisor**

---

## **BAGIAN 1: RESEP RAHASIA (Solid Foundation)**

### **1. Prompt Structure — Jangan Berbelit**

**Anti-pattern:**
```
"Tolong lihatin file saya, ada yang error, fix semuanya, buat lebih baik, optimize"
```

**Pattern Benar:**
```
File: Modul_Dashboard.gs (baris 45-62)
Error: TypeError: Cannot read property 'length' of undefined
Konteks: getDashboardBEPSummary() dipanggil pada outlet dengan data outlier
Task: 
  1. Identifikasi root cause
  2. Fix dengan guard clause
  3. Return struktur data konsisten
Constraint: Jangan ubah signature fungsi
```

**Alasan hemat token:** Model tidak perlu regenerate spekulasi. Anda sudah mapping problem.

---

### **2. Atomic Requests — Satu Tujuan Per Prompt**

**Salah (waste):** "Buat fitur HPP, validate input, buat UI, test"

**Benar (hemat):**
1. "Validate input HPP — struktur sudah fix?"
2. "UI HPP card — sesuai layout Figma?"
3. "Test edge case: outlet tanpa transaksi"

**Benefit:** Context digunakan untuk satu problem. Token langsung ke solusi.

---

### **3. Pre-Specification — Jangan Bikin Model Nanya**

Sebelum prompt, tentukan:
- **File path lengkap** (tidak "file saya")
- **Line range** (bukan seluruh 500 baris)
- **Expected output format** (JSON? String? Function signature?)
- **Constraints** (jangan ubah apa?)
- **Success criteria** (bagaimana tahu sukses?)

**Contoh:**
```
File: C:\Users\user\Documents\Kalkulator-Laundry-Versi-002-FINAL\Modul_Dashboard.gs
Baris: 120-145
Task: Extract outlet filter logic ke function terpisah
Output format: Function dengan signature:
  function filterOutletByPill(selectedOutletId, allOutletData) → Array
Expected: Bisa di-call dari line 200
Test case: selectedOutletId = "Outlet_001"
```

**Alasan:** Zero back-and-forth = hemat token & waktu.

---

### **4. State Management — Carry Context**

**Salah:**
```
Prompt 1: "Fix bug di line 45"
Prompt 2: "Sekarang ubah line 60" (tanpa konteks)
```

**Benar:**
```
Prompt 1: "Fix bug di line 45. Ini affect line 60 karena variable X diubah."
Prompt 2: "Sekarang update line 60 (terkait fix sebelumnya)"
```

**Praktik Claude Code:** 
- Copy-paste hasil sebelumnya kalau relevan
- Tulis: "Berdasarkan hasil sebelumnya, sekarang lakukan X"
- Model sudah punya context window — gunakan

---

### **5. Output Format Explicit — Parsing Hemat**

**Salah:**
```
"Kasih solusi untuk bug ini" → Dapat: paragraf + code + penjelasan + disclaimer (waste)
```

**Benar:**
```
"Bug di line 45. Berikan:
1. Root cause (1 baris)
2. Fix (code snippet)
Format: #ROOT CAUSE\n#FIX
Jangan: Penjelasan panjang"
```

**Benefit:** Output structured = token hanya untuk yang penting.

---

### **6. Bug Analysis — Trigger Kata Kunci Benar**

**Salah:**
```
"Programnya error"
```

**Benar:**
```
Error type: Syntax/Runtime/Logic?

Syntax: node --check file.gs ✓
Runtime: 
  Stack trace: at line 87
  TypeError: Cannot read property...
Logic: 
  Expected: output HPP array
  Actual: null

Kondisi trigger: Outlet kosong atau filter tertentu?
```

**Alasan:** Model bekerja efisien kalau error sudah kategorisasi. Tidak perlu nebak-nebak.

---

### **7. Confidence Calibration — Verify Sebelum Deploy**

**Salah workflow:**
```
Prompt → Code → Deploy
```

**Benar workflow:**
```
Prompt → Code → Verify (edge cases) → Deploy
```

**Praktiknya:**
```
"Fix line 45. Setelah itu test dengan:
1. Outlet dengan 0 transaksi
2. Outlet dengan 1000+ transaksi
Apakah hasil konsisten?"
```

**Alasan:** Token untuk verify << token untuk redo fix yang salah.

---

### **8. Leverage Node.js v24 — Verifikasi Lokal**

**Sebelum prompt:**
```powershell
node --check C:\path\file.gs
```

**Jika syntax error:**
```powershell
$lines = Get-Content file.gs
$lines[(44)..(64)] | ForEach-Object { "$($lines.IndexOf($_)): $_" }
```

**Prompt dengan evidence:**
```
File: Modul_Dashboard.gs
node --check output: [error message]
Lines 45-65: [paste lines]
Task: Fix syntax error
```

**Hemat:** Model tidak scan seluruh file. Anda sudah locate + provide evidence.

---

### **9. PowerShell Patching Pattern (Proven)**

```powershell
# Read
$lines = Get-Content "C:\path\file.gs"

# Modify
$lines[44] = 'new code here'  # Index 44 = Line 45

# Write
Set-Content -Path "C:\path\file.gs" -Value $lines -Encoding UTF8
```

**Prompt template:**
```
File: Modul_Dashboard.gs
Action: Replace line 45
Current: [paste current line]
New: [new line]
Why: [konteks]

Output format: PowerShell command ready to run
No explanation needed
```

**Benefit:** Anda tidak perlu correct approach. Model tahu pattern yang proven.

---

### **10. Token Budget Awareness — Explicit Constraint**

Setiap prompt mention:
```
Task: [apa]
Token budget: Hemat maksimal
Output format: [spesifik, minimal prose]
Jangan: [apa yang tidak usah]
```

**Contoh:**
```
Task: Analyze why getDashboardBEPSummary() return null
File: Modul_Dashboard.gs (87-120)
Token budget: Very low
Output format: List only (no explanation):
  - Possible cause 1
  - Possible cause 2
```

**Hasil:** Model mengkalibrasi response length. Lebih efisien.

---

## **BAGIAN 2: PATTERN LEBIH POWERFUL (Advanced)**

### **Pattern A: Hypothesis-First Analysis**

**Kapan pakai:** Bug analysis, performance issue, ambiguous error

**Workflow:**
```
Bug reported
  ↓
Generate 3-5 hypotheses dengan probability
  ↓
Rank by likelihood
  ↓
Test hypothesis #1
  ↓
Validate / Pivot ke #2
  ↓
Fix based on proven hypothesis
```

**Contoh prompt:**
```
Bug: getDashboardBEPSummary() return null pada 30% outlet

Generate hypotheses dengan probability:
1. [hypothesis] → prob 60% karena [reason]
2. [hypothesis] → prob 25% karena [reason]
3. [hypothesis] → prob 15% karena [reason]

Rank & suggest test untuk hypothesis #1 first
```

**Token cost:** +10% di awal, hemat total (no back-and-forth)  
**Speed:** 30-40% faster bug resolution

---

### **Pattern B: Custom System Instructions**

**Setup once, apply selamanya.**

**Di Claude Code settings, add:**
```
---RHEZA'S CLAUDE CODE STYLE---

Core Rules:
1. Atomic task focus — jangan batch multiple issues
2. Explicit state management — carry context dari prompt sebelumnya
3. Always require: File path + line range
4. Output format: minimal prose + code only
5. Verify dengan: node --check sebelum deliver
6. Token efficiency adalah priority
7. Scientific Advisor mode untuk code analysis
8. Jangan berbelit — straight to point

Constraint:
- Jangan ubah signature function tanpa explicit approval
- Jangan refactor beyond scope
- Jangan add dependency baru tanpa ask

Format Output Default:
#ISSUE
#FIX
#VERIFY (test case)
---
```

**Benefit:** Setiap prompt otomatis apply 10+ rule. Anda tinggal tulis task.

---

### **Pattern C: Structured Output + Auto-Execution**

**Setup PowerShell parser untuk JSON response.**

**Claude output JSON:**
```json
{
  "action": "replace",
  "file": "Modul_Dashboard.gs",
  "line_number": 45,
  "old_code": "problematic line",
  "new_code": "fixed line",
  "reason": "explanation",
  "verify_with": "node --check"
}
```

**PowerShell script execute:**
```powershell
$json = @"
{json from Claude}
"@ | ConvertFrom-Json

$lines = Get-Content $json.file
$lines[$json.line_number - 1] = $json.new_code
Set-Content -Path $json.file -Value $lines

Write-Host "✓ Updated $($json.file) line $($json.line_number)"
```

**Benefit:** Zero copy-paste errors. Faster iteration.  
**Setup effort:** 2-3 jam (sekali).

---

### **Pattern D: Decision Tree for Bug Triage**

**Bukan langsung "analyze bug".**

```
Step 1: Categorize Error Type
├─ Syntax? → node --check
├─ Runtime? → Stack trace analysis
├─ Logic? → Expected vs Actual output
└─ Performance? → Profiling needed

Step 2: Scope Isolation
├─ File? ✓
├─ Function? ✓
├─ Variable? ✓
└─ Dependency? ✓

Step 3: Hypothesis Generation
├─ Top 3 likely causes
├─ Probability ranking
└─ Evidence untuk setiap

Step 4: Evidence Collection
├─ Data yang support hypothesis 1?
├─ Data yang tolak hypothesis 1?
└─ Missing data?

Step 5: Execute Fix
└─ Only after Step 1-4 clear
```

**Prompt template:**
```
Bug: [describe]
Step 1 ✓ Error type: [categorized]
Step 2 ✓ Scope: [file, function, variable]
Step 3 ✓ Top 3 hypotheses with probability

Now proceed to Step 4: Collect evidence
Focus on hypothesis #1 first
```

**Benefit:** Mengurangi "shotgun debugging". Model bekerja seperti engineer.

---

### **Pattern E: Context Window as Knowledge Base**

**Maintain persistent context file di project folder.**

**File: `_CONTEXT.md` di root project**
```markdown
# Project Context — Kalkulator Laundry v002

## Current State
- Version: 002 FINAL
- Node.js: v24 (verified)
- GAS clasp: active

## Architecture
- Main modules: [list dengan line numbers]
- Key functions: [critical functions]
- Data flow: [diagram or text]

## Recent Changes
- 2026-07-20: Fixed getBEPSummary dashboard card
- 2026-07-18: HPP breakdown per-layanan added

## Known Edge Cases
- Outlet dengan 0 transaksi → return empty array (line 87)
- Filtered outlet yang hilang dari filter → localStorage bug (line 200)
- Multiple currency handling → belum implemented (scope v003)

## Anti-Patterns (Jangan Repeat)
- Jangan gunakan Add-Content di PowerShell untuk CSS (buat malformed)
- Jangan hardcode outlet ID (gunakan filter context)
```

**Praktik:**
```
Prompt ke Claude: "Refer ke _CONTEXT.md — Recent Changes section
Fix bug di [function], pastikan tidak repeat anti-pattern di section [X]"
```

**Benefit:** Model tidak re-read context. Context window untuk problem-solving.

---

## **BAGIAN 3: DECISION MATRIX — KAPAN PAKAI PATTERN APA**

| Situasi | Pattern yang Cocok | Token Cost | Setup |
|---------|-------------------|-----------|-------|
| Simple feature add | Atomic Requests (1-10) | Rendah | ✓ Apply now |
| Bug investigation | Hypothesis-First (A) | Sedang | ✓ 1-2 hari |
| Repetitive tasks | Custom Instructions (B) | Rendah | ✓ 30 menit |
| High-iteration dev | Structured Output (C) | Tinggi | ⏰ Week 2 |
| Complex root cause | Decision Tree (D) | Sedang | ✓ 1 hari |
| Long-term project | Context KB (E) | Rendah | ✓ Maintain |

---

## **BAGIAN 4: PROMPT TEMPLATES — SIAP PAKAI**

### **Template 1: Simple Fix**
```
File: [path] (line [start]-[end])
Error: [error message or symptom]
Context: [trigger condition]
Task: Fix dengan guard clause
Constraint: Jangan ubah signature

Output format:
#ISSUE
#FIX
#VERIFY
```

### **Template 2: Bug Analysis**
```
Bug: [describe]

Error categorization:
☐ Syntax  ☐ Runtime  ☐ Logic  ☐ Performance

Scope isolation:
- File: [X]
- Function: [X]
- Variable: [X]

Generate 3 hypotheses with probability.
Focus on #1 first.

Output: Hypothesis ranking + evidence needed
```

### **Template 3: Feature Implementation**
```
Feature: [name]
Scope: [file + functions affected]
Input: [data structure]
Output: [expected result]
Success criteria:
  1. [test case 1]
  2. [test case 2]

Output format: [expected format]
Constraint: [don't change X]
```

### **Template 4: Performance Optimization**
```
Function: [name] (file [path], line [X])
Current behavior: [describe + numbers]
Target: [what to optimize]
Constraint: [must maintain output format]

Analyze:
1. Bottleneck identification
2. Optimization approach (no refactor out-of-scope)
3. Impact estimate

Output: Code + explanation of improvement
```

---

## **BAGIAN 5: CHECKLIST PRE-PROMPT**

Sebelum Anda type prompt, verify:

### **Clarity**
- [ ] Specific file path (bukan "file saya")
- [ ] Line range jelas (bukan seluruh file)
- [ ] Error message atau expected output (jangan ambigu)
- [ ] Success criteria tertulis

### **Efficiency**
- [ ] Task adalah atomic (satu goal)?
- [ ] Refer ke _CONTEXT.md jika available?
- [ ] Sudah verify lokal dengan `node --check`?
- [ ] Format output sudah spesifik?

### **Context**
- [ ] State dari prompt sebelumnya di-carry?
- [ ] Constraint sudah tertulis?
- [ ] Anti-pattern sudah di-avoid?

### **Execution**
- [ ] Token budget awareness di-mention?
- [ ] Jangan perlu model nanya balik?

---

## **BAGIAN 6: CONFIDENCE LEVELS & LIMITATIONS**

**Tingkat Kepastian: Tinggi**

**Berdasarkan:**
- LLM architecture principles (context management, input specificity)
- Behavioral economics & decision science (clearer input = faster resolution)
- Operations management (atomic tasks > batch tasks)
- Praktik dari engineering teams (OpenAI, Anthropic guidelines)

**Trade-Off Penting:**

| Pattern | Power | Setup Cost | Consistency Needed |
|---------|-------|-----------|-------------------|
| Atomic Requests | 2/5 | Rendah | Langsung |
| Hypothesis-First | 3.5/5 | Sedang | Medium |
| Custom Instructions | 3.5/5 | Rendah | Medium |
| Structured Output | 4/5 | Tinggi | High |
| Decision Tree | 4.5/5 | Sedang | Medium |
| Context KB | 3/5 | Sedang | High |

**Risiko jika tidak konsisten:** ROI hilang. Disiplin adalah key.

---

## **BAGIAN 7: IMPLEMENTATION ROADMAP**

### **Week 1 (Immediate)**
- [ ] **Read** file ini (30 min)
- [ ] **Apply** Resep 1-10 di 3 prompt berikutnya
- [ ] **Verify** node --check sebelum setiap prompt
- [ ] **Track** token usage (estimate improvement)

### **Week 2 (Medium-term)**
- [ ] **Setup** Custom System Instructions di Claude Code settings
- [ ] **Pilot** Hypothesis-First Analysis untuk 1 bug
- [ ] **Create** _CONTEXT.md di project folder
- [ ] **Review** apakah template 1-4 bisa langsung pakai

### **Week 3 (Advanced)**
- [ ] **Design** Structured Output JSON schema (kalau mau implement)
- [ ] **Build** PowerShell parser (optional, tapi ROI tinggi)
- [ ] **Document** project-specific anti-patterns

### **Ongoing**
- [ ] **Maintain** _CONTEXT.md setiap major fix
- [ ] **Iterate** template prompt based on learnings
- [ ] **Measure** token usage & resolution time

---

## **BAGIAN 8: FAQ**

**Q: Mana yang paling penting untuk dimulai?**  
A: Resep 1-10 (atomic requests + pre-specification). Ini fondasi. Apply selama 1 minggu sebelum advanced pattern.

**Q: Berapa token bisa irit dengan ini?**  
A: Estimate 40-60% reduction kalau Anda konsisten dengan Resep 1-10. Lebih hemat lagi dengan Pattern A-E (60-70%).

**Q: Bagaimana tracking improvement?**  
A: Compare 10 prompts (before) vs 10 prompts (after). Hitung: token used + time to resolution.

**Q: Apakah semua pattern perlu di-apply?**  
A: Tidak. Prioritas: Resep 1-10 → Custom Instructions → Hypothesis-First. Sisanya optional.

**Q: Berapa lama setup Custom Instructions?**  
A: 30 menit (copas dari file ini ke Claude Code settings).

---

## **VERSION HISTORY**

- **v1.0** (2026-07-26): Initial comprehensive guide dengan 10 resep + 5 pattern + implementation roadmap

---

**Last updated: 2026-07-26**  
**For: Rheza's Kalkulator Laundry v002 & PPG Surabaya Barat App**
