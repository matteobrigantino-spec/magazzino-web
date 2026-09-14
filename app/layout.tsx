import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

import AuthGuard from "../components/AuthGuard";
import GestionaleAppChrome from "../components/GestionaleAppChrome";
import GestionaleViewportFix from "../components/GestionaleViewportFix";

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
        <AuthGuard>
          <GestionaleViewportFix />

          <GestionaleAppChrome>
            {children}
          </GestionaleAppChrome>
        </AuthGuard>
      </body>
    </html>
  );
}
