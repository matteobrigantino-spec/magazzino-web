import type { Metadata, Viewport } from "next";
import PwaRegister from "./PwaRegister";

export const metadata: Metadata = {
  title: "Catalogo Magazzino",
  description: "Catalogo offline articoli del magazzino",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#050505",
};

export default function CatalogoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PwaRegister />
      {children}
    </>
  );
}