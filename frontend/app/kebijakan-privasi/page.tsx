/* Halaman Kebijakan Privasi publik (2026-09-10).

   Alasan keberadaannya: Google OAuth consent screen mewajibkan URL
   "Application privacy policy" yang bisa diakses publik sebelum app boleh
   di-Publish ke Production (ERROR_LOG #40). Halaman ini SENGAJA:
   - Server component tanpa auth / tanpa RequireAuth -> bisa dibuka siapa pun
     & di-crawl Google.
   - Tidak masuk navigasi app (bukan menu) -> hanya ditautkan dari consent
     screen + footer halaman login.
   Kalau isi/alamat berubah, perbarui juga di Google Auth Platform > Branding. */

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Kebijakan Privasi — Ruang Ngaji',
  description:
    'Kebijakan privasi aplikasi Ruang Ngaji, platform manajemen ngaji PPG Surabaya Barat.',
};

const PEMBARUAN_TERAKHIR = '10 September 2026';

export default function KebijakanPrivasi() {
  return (
    <main className="mx-auto min-h-screen max-w-[720px] bg-bg px-6 py-10 sm:px-8">
      <div className="mb-8 flex items-center gap-3">
        <Image src="/logo-ruang-ngaji.png" alt="Ruang Ngaji" width={33} height={30} />
        <span className="text-[15px] font-extrabold text-text">Ruang Ngaji</span>
      </div>

      <h1 className="text-[22px] font-extrabold leading-tight text-text">
        Kebijakan Privasi
      </h1>
      <p className="mt-1.5 text-[13px] text-text-dim">
        Pembaruan terakhir: {PEMBARUAN_TERAKHIR}
      </p>

      <div className="mt-7 space-y-6 text-[14px] leading-relaxed text-text">
        <section className="space-y-2">
          <p>
            <strong>Ruang Ngaji</strong> adalah aplikasi internal untuk
            manajemen kegiatan ngaji (Taman Pendidikan Al-Qur&rsquo;an) di
            lingkungan PPG Surabaya Barat: pendataan generus, guru, jamaah,
            absensi, jurnal pembelajaran, dan laporan. Aplikasi dikelola oleh
            pengurus PPG Surabaya Barat dan hanya diperuntukkan bagi pengguna
            yang diberi akses (pengurus dan guru).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-[16px] font-bold text-text">
            Data yang kami kumpulkan
          </h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Dari akun Google Anda saat login:</strong> nama, alamat
              email, dan foto profil. Data ini hanya dipakai untuk membuat dan
              mengenali akun Anda di aplikasi. Kami tidak meminta akses ke
              email, kontak, kalender, drive, atau data Google lainnya.
            </li>
            <li>
              <strong>Data yang diinput pengguna:</strong> informasi generus,
              guru, jamaah, kelas, kehadiran, catatan pembelajaran, tabungan,
              dan sejenisnya yang dimasukkan oleh pengurus/guru sebagai bagian
              dari tugas administrasi TPQ.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-[16px] font-bold text-text">
            Penggunaan data
          </h2>
          <p>
            Data digunakan semata-mata untuk menjalankan fungsi aplikasi:
            autentikasi akun, pengaturan hak akses per peran/wilayah, pencatatan
            kegiatan ngaji, serta penyusunan laporan bagi pengurus. Kami tidak
            menjual data, tidak membagikannya untuk iklan, dan tidak
            memindahkannya ke pihak ketiga di luar penyedia infrastruktur yang
            kami pakai.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-[16px] font-bold text-text">
            Penyimpanan &amp; keamanan
          </h2>
          <p>
            Data disimpan pada layanan basis data Supabase dan aplikasi
            di-hosting di Vercel. Akses ke setiap data dibatasi di tingkat basis
            data (Row Level Security) sesuai peran dan wilayah pengguna. Sesi
            login diamankan dengan token dan hanya berlaku di perangkat Anda.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-[16px] font-bold text-text">
            Retensi &amp; penghapusan data
          </h2>
          <p>
            Data akun dan data administrasi disimpan selama akun masih aktif dan
            selama diperlukan untuk keperluan pencatatan PPG Surabaya Barat.
            Anda dapat meminta penonaktifan akun atau penghapusan data pribadi
            Anda dengan menghubungi kami di alamat di bawah.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-[16px] font-bold text-text">Kontak</h2>
          <p>
            Pertanyaan atau permintaan terkait privasi dapat dikirim ke{' '}
            <a
              href="mailto:rheza354@gmail.com"
              className="font-semibold text-brass underline"
            >
              rheza354@gmail.com
            </a>
            .
          </p>
        </section>
      </div>

      <div className="mt-10 border-t border-border pt-5">
        <Link href="/" className="text-[13px] font-semibold text-brass no-underline">
          &larr; Kembali ke halaman utama
        </Link>
      </div>
    </main>
  );
}
