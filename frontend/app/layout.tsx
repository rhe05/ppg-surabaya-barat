import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/components/ui/useToast";
import AjakanPasangApp from "@/components/ui/AjakanPasangApp";

export const metadata: Metadata = {
  title: "Ruang Ngaji — Platform Manajemen Ngaji",
  description:
    "Platform manajemen ngaji PPG Surabaya Barat — absensi, kelas, dan laporan.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icon-192.png", sizes: "192x192" }],
  },
  /* iOS: "Add to Home Screen" -> buka layar penuh tanpa Safari chrome. */
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Ruang Ngaji",
  },
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
  /* viewport-fit=cover -> env(safe-area-inset-*) terisi di HP berponi,
     dipakai AdminBottomNav.tsx supaya bar bawah tidak ketutup gesture
     bar / home indicator. */
  viewportFit: "cover",
  /* Warna strip status bar saat mode standalone (PWA). Putih = menyatu
     dgn topbar aplikasi. */
  themeColor: "#FFFFFF",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <ToastProvider>
            {children}
            {/* Ajakan "Tambah ke Layar Utama" — di sini, bukan di
                RequireAuth, supaya ikut tampil di halaman login. */}
            <AjakanPasangApp />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
