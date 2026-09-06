"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function CatalogoNav() {
  const pathname = usePathname();

  const catalogoActive =
    pathname === "/catalogo";

  const scannerActive =
    pathname.startsWith(
      "/catalogo/scanner"
    );

  return (
    <>
      <header className="catalogo-nav">
        <div className="catalogo-nav-inner">
          {/* LOGO */}

          <Link
            href="/catalogo"
            className="catalogo-nav-logo"
          >
            <div className="catalogo-nav-logo-icon">
              <WarehouseIcon />
            </div>

            <div className="catalogo-nav-logo-copy">
              <strong>
                MAGAZZINO
              </strong>

              <span>
                PWA
              </span>
            </div>
          </Link>

          {/* SEPARATORE */}

          <div className="catalogo-nav-separator" />

          {/* NAVIGAZIONE */}

          <nav className="catalogo-nav-links">
            <Link
              href="/catalogo"
              className={`catalogo-nav-pill ${
                catalogoActive
                  ? "active"
                  : ""
              }`}
            >
              <CatalogIcon />

              <span>
                Catalogo
              </span>
            </Link>

            <Link
              href="/catalogo/scanner"
              className={`catalogo-nav-pill ${
                scannerActive
                  ? "active"
                  : ""
              }`}
            >
              <ScannerIcon />

              <span>
                Scanner
              </span>
            </Link>
          </nav>

          {/* SPAZIO */}

          <div className="catalogo-nav-spacer" />

          {/* STATO PWA */}

          <div className="catalogo-nav-status">
            <div className="catalogo-nav-status-dot" />

            <div>
              <strong>
                PWA MAGAZZINO
              </strong>

              <span>
                pronta all&apos;uso
              </span>
            </div>
          </div>
        </div>
      </header>

      <style jsx global>{`
        .catalogo-nav {
          position: sticky;
          top: 0;
          z-index: 1000;
          width: 100%;
          border-bottom: 1px solid rgba(77, 113, 164, 0.36);
          background: rgba(7, 15, 27, 0.96);
          backdrop-filter: blur(16px);
          box-shadow:
            0 8px 30px
            rgba(0, 0, 0, 0.18);
        }

        .catalogo-nav-inner {
          width: 100%;
          max-width: 1500px;
          min-height: 68px;
          margin: 0 auto;
          padding: 9px 20px;

          display: flex;
          align-items: center;
          gap: 10px;

          box-sizing: border-box;
        }

        .catalogo-nav-logo {
          flex-shrink: 0;

          display: flex;
          align-items: center;
          gap: 10px;

          color: white;
          text-decoration: none;
        }

        .catalogo-nav-logo-icon {
          width: 38px;
          height: 38px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 11px;

          color: white;

          background:
            linear-gradient(
              135deg,
              #2563eb,
              #3b82f6
            );

          box-shadow:
            0 7px 20px
            rgba(37, 99, 235, 0.28);
        }

        .catalogo-nav-logo-copy {
          display: flex;
          flex-direction: column;
        }

        .catalogo-nav-logo-copy strong {
          color: white;

          font-size: 12px;
          font-weight: 950;

          letter-spacing: 1.3px;
        }

        .catalogo-nav-logo-copy span {
          margin-top: 2px;

          color: #60a5fa;

          font-size: 7px;
          font-weight: 900;

          letter-spacing: 1.8px;
        }

        .catalogo-nav-separator {
          width: 1px;
          height: 30px;

          margin: 0 5px;

          flex-shrink: 0;

          background:
            rgba(
              96,
              165,
              250,
              0.18
            );
        }

        .catalogo-nav-links {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .catalogo-nav-pill {
          height: 40px;
          padding: 0 14px;

          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;

          border:
            1px solid
            rgba(
              111,
              145,
              194,
              0.22
            );

          border-radius: 999px;

          background:
            rgba(
              255,
              255,
              255,
              0.025
            );

          color:
            rgba(
              255,
              255,
              255,
              0.78
            );

          text-decoration: none;

          font-size: 11px;
          font-weight: 850;

          white-space: nowrap;

          transition:
            border-color 0.15s ease,
            color 0.15s ease,
            background 0.15s ease,
            box-shadow 0.15s ease;
        }

        .catalogo-nav-pill:hover {
          color: white;

          border-color:
            rgba(
              96,
              165,
              250,
              0.42
            );

          background:
            rgba(
              59,
              130,
              246,
              0.09
            );
        }

        .catalogo-nav-pill.active {
          color: white;

          border-color:
            rgba(
              96,
              165,
              250,
              0.65
            );

          background:
            linear-gradient(
              135deg,
              rgba(
                37,
                99,
                235,
                0.95
              ),
              rgba(
                59,
                130,
                246,
                0.84
              )
            );

          box-shadow:
            0 6px 18px
            rgba(
              37,
              99,
              235,
              0.24
            );
        }

        .catalogo-nav-spacer {
          flex: 1;
        }

        .catalogo-nav-status {
          flex-shrink: 0;

          padding: 7px 11px;

          display: flex;
          align-items: center;
          gap: 8px;

          border:
            1px solid
            rgba(
              34,
              197,
              94,
              0.18
            );

          border-radius: 10px;

          background:
            rgba(
              34,
              197,
              94,
              0.045
            );
        }

        .catalogo-nav-status-dot {
          width: 7px;
          height: 7px;

          flex-shrink: 0;

          border-radius: 50%;

          background:
            #22c55e;

          box-shadow:
            0 0 0 4px
            rgba(
              34,
              197,
              94,
              0.10
            );
        }

        .catalogo-nav-status strong,
        .catalogo-nav-status span {
          display: block;
        }

        .catalogo-nav-status strong {
          color:
            rgba(
              255,
              255,
              255,
              0.78
            );

          font-size: 8px;
          font-weight: 900;

          letter-spacing: 0.8px;
        }

        .catalogo-nav-status span {
          margin-top: 2px;

          color:
            rgba(
              255,
              255,
              255,
              0.34
            );

          font-size: 7px;
        }

        @media (
          max-width: 700px
        ) {
          .catalogo-nav-inner {
            min-height: 62px;
            padding:
              8px 12px;
          }

          .catalogo-nav-logo-copy {
            display: none;
          }

          .catalogo-nav-separator {
            display: none;
          }

          .catalogo-nav-pill {
            height: 38px;
            padding:
              0 12px;

            font-size: 10px;
          }

          .catalogo-nav-status {
            padding:
              7px 9px;
          }

          .catalogo-nav-status span {
            display: none;
          }
        }

        @media (
          max-width: 470px
        ) {
          .catalogo-nav-inner {
            gap: 6px;
          }

          .catalogo-nav-logo-icon {
            width: 36px;
            height: 36px;
          }

          .catalogo-nav-pill {
            width: 38px;
            padding: 0;
          }

          .catalogo-nav-pill span {
            display: none;
          }

          .catalogo-nav-status {
            border: none;
            background:
              transparent;
            padding: 6px;
          }

          .catalogo-nav-status strong {
            display: none;
          }
        }
      `}</style>
    </>
  );
}

/* =========================================================
   ICONE
========================================================= */

function WarehouseIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 8.5L12 4L20 8.5V18.5L12 22L4 18.5V8.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      <path
        d="M4.5 8.5L12 12.5L19.5 8.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M12 12.5V21.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CatalogIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="4"
        width="6"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <rect
        x="14"
        y="4"
        width="6"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <rect
        x="4"
        y="14"
        width="6"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <rect
        x="14"
        y="14"
        width="6"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ScannerIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 7V4H7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <path
        d="M17 4H20V7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <path
        d="M20 17V20H17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <path
        d="M7 20H4V17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <path
        d="M7 9V15"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M10 8V16"
        stroke="currentColor"
        strokeWidth="1.3"
      />

      <path
        d="M13 9V15"
        stroke="currentColor"
        strokeWidth="2.1"
      />

      <path
        d="M17 8V16"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}