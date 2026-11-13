import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bestia",
  description: "Segnapunti per la Bestia: piatto, vincite, bestie e conti di fine serata.",
  appleWebApp: { capable: true, title: "Bestia", statusBarStyle: "black-translucent" },
  // Sito privato tra amici: niente motori di ricerca.
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const viewport: Viewport = {
  themeColor: "#121826",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        {/* Con la status bar "black-translucent" la pagina scorre sotto l'isola e l'orologio:
            questa fascia fissa, alta quanto l'area sicura in alto, li tiene su sfondo pieno. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-[45] h-[env(safe-area-inset-top)] bg-night-900"
        />
      </body>
    </html>
  );
}
