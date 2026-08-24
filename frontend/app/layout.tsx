import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "Ruang Ngaji — Platform Manajemen Ngaji",
  description:
    "Platform manajemen ngaji PPG Surabaya Barat — absensi, kelas, dan laporan.",
};

/* WAJIB eksplisit (2026-08-24) -- Next.js 16.3 di proyek ini TERNYATA
   TIDAK menyisipkan <meta name="viewport"> otomatis walau dokumentasinya
   bilang "usually unnecessary as the default is sufficient" (lihat
   node_modules/next/dist/docs/.../generate-viewport.md) -- dibuktikan
   `document.querySelector('meta[name="viewport"]')` mengembalikan null
   di halaman sungguhan. Tanpa tag ini browser mobile merender di
   "layout viewport" default ~980px lalu baru menyesuaikan skala ke lebar
   layar sungguhan begitu terdeteksi -- persis gejala yg dilaporkan owner
   ("hard refresh dashboard membesar dulu, kayak aplikasi murahan"), krn
   app ini memang dikunci ke lebar HP (RequireAuth.tsx max-w-[430px]). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
