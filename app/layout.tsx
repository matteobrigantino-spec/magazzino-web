import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";

import "./globals.css";

import AuthGuard from "../components/AuthGuard";
import GestionaleAppChrome from "../components/GestionaleAppChrome";
import GestionaleViewportFix from "../components/GestionaleViewportFix";

const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Italboats",
  description: "Gestionale Magazzino Italboats",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body
        className={`${fraunces.variable} ${manrope.variable} antialiased`}
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
