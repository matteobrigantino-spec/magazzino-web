import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Magazzino",
  description: "Gestionale Magazzino",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* MENU SUPERIORE */}
        <header className="sticky top-0 z-50 border-b bg-black/80 backdrop-blur text-white">
          <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-6">
            <Link href="/" className="font-bold text-lg">
              Magazzino
            </Link>

            <nav className="flex gap-6 text-sm">
              <Link href="/movements" className="hover:underline">
                Movimenti
              </Link>
              <Link href="/suppliers" className="hover:underline">
                Fornitori
              </Link>
            </nav>
          </div>
        </header>

        {/* CONTENUTO PAGINE */}
        <main className="mx-auto max-w-5xl px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
