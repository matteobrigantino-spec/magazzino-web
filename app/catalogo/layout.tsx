import type {
  Metadata,
  Viewport,
} from "next";

import PwaRegister from "./PwaRegister";
import CatalogoNav from "./CatalogoNav";

export const metadata: Metadata = {
  title: "Catalogo Magazzino",
  description:
    "Catalogo offline articoli del magazzino",
  manifest:
    "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#07101b",
};

export default function CatalogoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",

        background:
          "radial-gradient(circle at top right, rgba(37,99,235,0.10), transparent 32%), linear-gradient(180deg, #07101b 0%, #091321 45%, #08111d 100%)",

        color: "var(--foreground)",
      }}
    >
      <PwaRegister />

      <CatalogoNav />

      <main
        style={{
          width: "100%",

          boxSizing:
            "border-box",

          padding:
            "26px 20px 48px",
        }}
      >
        {children}
      </main>
    </div>
  );
}