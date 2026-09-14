import type {
  Metadata,
  Viewport,
} from "next";

import GestionalePwaRegister from "./GestionalePwaRegister";

export const metadata: Metadata = {
  title: "Gestionale Matteo",
  description:
    "Gestionale personale completo del magazzino",
  manifest:
    "/manifest-gestionale.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Gestionale Matteo",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#07111f",
  viewportFit: "cover",
};

export default function GestionaleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <GestionalePwaRegister />
      {children}
    </>
  );
}
