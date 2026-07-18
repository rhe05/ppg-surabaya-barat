/**
 * Modul_Export.gs — Ekspor Excel (.xlsx asli, dibangun manual via Utilities.zip,
 * tanpa membuat file di Google Drive) untuk Data Guru & Data Generus di Dashboard Kelompok.
 */

/**
 * Bangun file .xlsx dari headers + rows yang SUDAH disiapkan klien.
 * Klien membangun matrix sesuai kolom yang dipilih (column picker), lalu server
 * hanya menyusunnya jadi .xlsx asli. Data yang diekspor = data yang sudah sah
 * dipegang klien (hasil serverGetGuruList/serverGetSantriList ber-RBAC), jadi
 * di sini cukup validasi sesi.
 */
function serverBuildXlsxFromData(token, sheetName, headers, rows) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    return { success: false, error: 'Data ekspor tidak valid.' };
  }

  const safeSheet = String(sheetName || 'Data').substring(0, 31);
  const base64 = buildXlsxBase64_(safeSheet, headers, rows);

  return {
    success: true,
    base64: base64,
    filename: `${String(sheetName || 'Data').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`,
  };
}

/**
 * Bangun file .xlsx asli (OOXML minimal) langsung sebagai ZIP in-memory via Utilities.zip —
 * tidak menyentuh Google Drive/SpreadsheetApp sama sekali, jadi tidak perlu izin baru.
 * Semua cell ditulis sebagai inlineStr (teks) supaya nilai seperti NIS berawalan 0 tidak hilang.
 */
function buildXlsxBase64_(sheetName, headers, rows) {
  const allRows = [headers].concat(rows);

  let sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  sheetXml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';

  allRows.forEach((rowValues, rIdx) => {
    const rowNum = rIdx + 1;
    sheetXml += `<row r="${rowNum}">`;
    rowValues.forEach((val, cIdx) => {
      const cellRef = xlsxColLetter_(cIdx + 1) + rowNum;
      sheetXml += `<c r="${cellRef}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape_(val)}</t></is></c>`;
    });
    sheetXml += '</row>';
  });

  sheetXml += '</sheetData></worksheet>';

  const contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>';

  const rootRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${xmlEscape_(sheetName).substring(0, 31)}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>';

  const workbookRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>';

  const blobs = [
    Utilities.newBlob(contentTypesXml, 'application/xml', '[Content_Types].xml'),
    Utilities.newBlob(rootRelsXml, 'application/xml', '_rels/.rels'),
    Utilities.newBlob(workbookXml, 'application/xml', 'xl/workbook.xml'),
    Utilities.newBlob(workbookRelsXml, 'application/xml', 'xl/_rels/workbook.xml.rels'),
    Utilities.newBlob(sheetXml, 'application/xml', 'xl/worksheets/sheet1.xml'),
  ];

  const zipBlob = Utilities.zip(blobs, 'export.xlsx');
  return Utilities.base64Encode(zipBlob.getBytes());
}

function xlsxColLetter_(n) {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function xmlEscape_(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
