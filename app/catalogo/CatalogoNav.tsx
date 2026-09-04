"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function CatalogoNav() {
  const pathname = usePathname();

  const catalogoActive =
    pathname === "/catalogo";

  const scannerActive =
    pathname.startsWith("/catalogo/scanner");

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,

        background: "#050505",

        borderBottom:
          "1px solid var(--border-color)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1500,
          margin: "0 auto",

          minHeight: 64,

          padding: "0 20px",

          display: "flex",
          alignItems: "center",

          gap: 18,

          boxSizing: "border-box",
        }}
      >
        {/* LOGO */}

        <Link
          href="/catalogo"
          style={{
            color: "var(--foreground)",

            textDecoration: "none",

            fontSize: 17,

            fontWeight: 950,

            letterSpacing: 0.2,

            whiteSpace: "nowrap",
          }}
        >
          CATALOGO MAGAZZINO
        </Link>

        {/* SEPARATORE */}

        <div
          style={{
            width: 1,
            height: 26,

            background:
              "var(--border-color)",
          }}
        />

        {/* CATALOGO */}

        <Link
          href="/catalogo"
          style={{
            padding: "9px 13px",

            borderRadius: 8,

            textDecoration: "none",

            fontSize: 13,

            fontWeight: 850,

            color: catalogoActive
              ? "var(--background)"
              : "var(--foreground)",

            background: catalogoActive
              ? "var(--foreground)"
              : "transparent",

            border: catalogoActive
              ? "1px solid var(--foreground)"
              : "1px solid transparent",
          }}
        >
          Catalogo
        </Link>

        {/* SCANNER */}

        <Link
          href="/catalogo/scanner"
          style={{
            padding: "9px 13px",

            borderRadius: 8,

            textDecoration: "none",

            fontSize: 13,

            fontWeight: 850,

            color: scannerActive
              ? "var(--background)"
              : "var(--foreground)",

            background: scannerActive
              ? "var(--foreground)"
              : "transparent",

            border: scannerActive
              ? "1px solid var(--foreground)"
              : "1px solid transparent",
          }}
        >
          Scanner
        </Link>

        {/* SPAZIO */}

        <div
          style={{
            flex: 1,
          }}
        />

        {/* INDICAZIONE PWA */}

        <div
          style={{
            fontSize: 11,

            opacity: 0.45,

            fontWeight: 750,

            whiteSpace: "nowrap",
          }}
        >
          PWA MAGAZZINO
        </div>
      </div>
    </header>
  );
}