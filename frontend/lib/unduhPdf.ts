/* Unduh Data Generus sebagai PDF — tabel ber-brand "Ruang Ngaji".

   jspdf + jspdf-autotable di-import DINAMIS (dynamic import) supaya ±350 KB
   pustaka ini TIDAK ikut bundel awal halaman; baru diunduh peramban saat
   guru benar-benar menekan "Unduh PDF". Semua pembuatan 100% di sisi
   peramban — nol permintaan ke Supabase.

   Data tabel diberikan sudah jadi (headers + rows string) oleh pemanggil;
   modul ini murni presentasi. */

const HIJAU: [number, number, number] = [21, 101, 52]; // #156534 — header brand
const HIJAU_MUDA: [number, number, number] = [240, 253, 244]; // #F0FDF4 — baris zebra
const ABU: [number, number, number] = [100, 116, 139]; // #64748B — teks sekunder

/* Logo Ruang Ngaji — 149×135 px (public/logo-ruang-ngaji.png). Rasio
   dipakai apa adanya supaya tidak gepeng. */
const LOGO_URL = '/logo-ruang-ngaji.png';
const LOGO_RASIO = 149 / 135;

/* Ambil logo sekali sebagai data URL untuk doc.addImage. Aset statis
   satu-origin (±9 KB) — nol Supabase. Kalau gagal, kop tetap dibuat
   tanpa logo. */
async function ambilLogo(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export type OpsiUnduhPdf = {
  /* Nama berkas tanpa ekstensi. */
  namaBerkas: string;
  /* Judul di kanan-atas, mis. "Data Generus". */
  judul: string;
  /* Baris kecil di bawah judul, mis. "Kelas 1 & 2 · 12 generus". */
  subjudul: string;
  /* Nama kelompok (tanpa awalan "Kelp"), mis. "Petemon" — dipakai di
     keterangan kanan-atas "Data Generus - Kelp Petemon". */
  kelompok?: string;
  headers: string[];
  rows: string[][];
};

export async function unduhPdf({
  namaBerkas,
  judul,
  subjudul,
  kelompok,
  headers,
  rows,
}: OpsiUnduhPdf) {
  const [{ jsPDF }, autoTableMod, logo] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    ambilLogo(),
  ]);
  const autoTable = autoTableMod.default;
  /* Jaga-jaga kalau pemanggil terlanjur mengirim "Kelp Petemon" — buang
     awalan "Kelp" berulang supaya tidak jadi "Kelp Kelp Petemon". */
  const kelompokBersih = (kelompok ?? '').replace(/^(?:[\s ]*kelp\b[.\s ]*)+/i, '').trim();
  const keteranganKanan = kelompokBersih ? `${judul} - Kelp ${kelompokBersih}` : judul;

  /* > 5 kolom → lanskap supaya kolom tidak remuk. */
  const lanskap = headers.length > 5;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: lanskap ? 'landscape' : 'portrait' });
  const lebarHal = doc.internal.pageSize.getWidth();
  const tinggiHal = doc.internal.pageSize.getHeight();
  const M = 12; // margin kiri/kanan

  const tglCetak = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  /* --- Kepala halaman ber-brand --- */
  const BAND = 24; // tinggi pita hijau (mm)
  function gambarKepala() {
    doc.setFillColor(...HIJAU);
    doc.rect(0, 0, lebarHal, BAND, 'F');

    /* Kiri: logo + wordmark. Logo tegak di tengah pita, rasio asli. */
    let xTeks = M;
    if (logo) {
      const hLogo = 13;
      const wLogo = hLogo * LOGO_RASIO;
      doc.addImage(logo, 'PNG', M, (BAND - hLogo) / 2, wLogo, hLogo);
      xTeks = M + wLogo + 4;
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Ruang Ngaji', xTeks, 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Platform Manajemen Ngaji', xTeks, 16.5);

    /* Kanan: keterangan + konteks kelas + tanggal unduh. */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(keteranganKanan, lebarHal - M, 10, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(subjudul, lebarHal - M, 15, { align: 'right' });
    doc.text(`Diunduh ${tglCetak}`, lebarHal - M, 19, { align: 'right' });
  }

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 28,
    margin: { top: 28, left: M, right: M, bottom: 16 },
    theme: 'striped',
    styles: {
      font: 'helvetica',
      fontSize: lanskap ? 7.5 : 8.5,
      cellPadding: 2,
      overflow: 'linebreak',
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: HIJAU,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: lanskap ? 7.5 : 8.5,
    },
    alternateRowStyles: { fillColor: HIJAU_MUDA },
    didDrawPage: () => gambarKepala(),
  });

  /* Kaki halaman digambar setelah tabel selesai supaya "Halaman X dari Y"
     tahu total halaman yang benar. */
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...ABU);
    doc.setLineWidth(0.1);
    doc.line(M, tinggiHal - 11, lebarHal - M, tinggiHal - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...ABU);
    doc.text('Ruang Ngaji · Data Generus', M, tinggiHal - 6.5);
    doc.text(`Halaman ${i} dari ${total}`, lebarHal - M, tinggiHal - 6.5, { align: 'right' });
  }

  doc.save(`${namaBerkas.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`);
}
