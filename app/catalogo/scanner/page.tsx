"use client";

import { useRouter } from "next/navigation";

export default function ScannerPage() {
  const router = useRouter();

  return (
    <>
      <div className="scanner-page">
        {/* HERO */}

        <section className="scanner-hero">
          <div className="scanner-hero-glow scanner-glow-one" />
          <div className="scanner-hero-glow scanner-glow-two" />

          <div className="scanner-hero-copy">
            <div className="scanner-eyebrow">
              <ScannerIcon />

              <span>
                SCANNER MAGAZZINO
              </span>
            </div>

            <h1>
              Movimenti{" "}
              <span>
                rapidi
              </span>
            </h1>

            <p>
              Seleziona il tipo di operazione
              da registrare con la pistola scanner.
            </p>

            <div className="scanner-hero-info">
              <div className="scanner-online-dot" />

              <span>
                Salvataggio locale automatico
              </span>
            </div>
          </div>

          <div className="scanner-hero-side">
            <div className="scanner-hero-side-icon">
              <BarcodeIcon />
            </div>

            <div>
              <strong>
                Scanner pronto
              </strong>

              <span>
                Carico e scarico merci
              </span>
            </div>
          </div>
        </section>

        {/* SCELTA */}

        <section className="scanner-section">
          <div className="scanner-section-heading">
            <div className="scanner-section-label">
              OPERAZIONE
            </div>

            <h2>
              Cosa vuoi registrare?
            </h2>

            <p>
              Scegli CARICO per la merce in entrata
              oppure SCARICO per la merce in uscita.
            </p>
          </div>

          <div className="movement-grid">
            {/* CARICO */}

            <button
              type="button"
              className="movement-card movement-carico"
              onClick={() =>
                router.push(
                  "/catalogo/scanner/carico"
                )
              }
            >
              <div className="movement-card-accent" />

              <div className="movement-card-top">
                <div className="movement-icon carico-icon">
                  <ArrowDownIcon />
                </div>

                <div className="movement-status carico-status">
                  <span className="movement-status-dot" />

                  ENTRATA
                </div>
              </div>

              <div className="movement-card-content">
                <div className="movement-card-label">
                  MOVIMENTO
                </div>

                <h3>
                  CARICO
                </h3>

                <p>
                  Registra gli articoli che entrano
                  nel magazzino e aumenta la giacenza.
                </p>
              </div>

              <div className="movement-card-footer">
                <div>
                  <strong>
                    Avvia scansione
                  </strong>

                  <span>
                    Scanner pronto all&apos;uso
                  </span>
                </div>

                <div className="movement-arrow">
                  <ArrowRightIcon />
                </div>
              </div>
            </button>

            {/* SCARICO */}

            <button
              type="button"
              className="movement-card movement-scarico"
              onClick={() =>
                router.push(
                  "/catalogo/scanner/scarico"
                )
              }
            >
              <div className="movement-card-accent" />

              <div className="movement-card-top">
                <div className="movement-icon scarico-icon">
                  <ArrowUpIcon />
                </div>

                <div className="movement-status scarico-status">
                  <span className="movement-status-dot" />

                  USCITA
                </div>
              </div>

              <div className="movement-card-content">
                <div className="movement-card-label">
                  MOVIMENTO
                </div>

                <h3>
                  SCARICO
                </h3>

                <p>
                  Registra gli articoli che escono
                  dal magazzino e riduce la giacenza.
                </p>
              </div>

              <div className="movement-card-footer">
                <div>
                  <strong>
                    Avvia scansione
                  </strong>

                  <span>
                    Controllo giacenza automatico
                  </span>
                </div>

                <div className="movement-arrow">
                  <ArrowRightIcon />
                </div>
              </div>
            </button>
          </div>
        </section>

        {/* INFO */}

        <section className="scanner-info-panel">
          <div className="scanner-info-icon">
            <ShieldIcon />
          </div>

          <div className="scanner-info-copy">
            <strong>
              Movimenti protetti anche offline
            </strong>

            <span>
              Ogni movimento viene salvato prima sul PC.
              Se Internet non è disponibile, resta in attesa
              e viene sincronizzato automaticamente quando
              torna la connessione.
            </span>
          </div>

          <div className="scanner-info-status">
            <div className="scanner-info-status-dot" />

            <span>
              SISTEMA PRONTO
            </span>
          </div>
        </section>
      </div>

      <style jsx global>{`
        .scanner-page {
          width: 100%;
          max-width: 1500px;
          margin: 0 auto;
        }

        .scanner-hero {
          position: relative;
          overflow: hidden;

          min-height: 240px;

          margin-bottom: 28px;
          padding: 34px 38px;

          display: grid;
          grid-template-columns:
            minmax(0, 1fr)
            300px;

          align-items: center;
          gap: 40px;

          box-sizing: border-box;

          border: 1px solid rgba(78,112,162,0.42);
          border-radius: 18px;

          background:
            linear-gradient(
              125deg,
              #0c1728 0%,
              #0b1627 55%,
              #08111d 100%
            );
        }

        .scanner-hero-glow {
          position: absolute;
          border-radius: 999px;
          pointer-events: none;
        }

        .scanner-glow-one {
          width: 600px;
          height: 600px;

          top: -500px;
          right: 250px;

          background: rgba(37,99,235,0.15);
        }

        .scanner-glow-two {
          width: 380px;
          height: 380px;

          right: 50px;
          bottom: -320px;

          background: rgba(59,130,246,0.09);
        }

        .scanner-hero-copy,
        .scanner-hero-side {
          position: relative;
          z-index: 2;
        }

        .scanner-eyebrow {
          display: flex;
          align-items: center;
          gap: 9px;

          color: #60a5fa;

          font-size: 11px;
          font-weight: 950;

          letter-spacing: 1.7px;
        }

        .scanner-hero h1 {
          margin: 14px 0 0;

          color: white;

          font-size: 48px;
          line-height: 1;

          font-weight: 950;

          letter-spacing: -1.4px;
        }

        .scanner-hero h1 span {
          color: #3b82f6;
        }

        .scanner-hero p {
          max-width: 700px;

          margin: 14px 0 0;

          color: rgba(255,255,255,0.58);

          font-size: 15px;
          line-height: 1.55;
        }

        .scanner-hero-info {
          margin-top: 22px;

          display: flex;
          align-items: center;
          gap: 9px;

          color: rgba(255,255,255,0.50);

          font-size: 12px;
        }

        .scanner-online-dot {
          width: 9px;
          height: 9px;

          border-radius: 50%;

          background: #22c55e;

          box-shadow:
            0 0 0 5px rgba(34,197,94,0.10);
        }

        .scanner-hero-side {
          min-height: 125px;

          padding: 20px;

          display: flex;
          align-items: center;
          gap: 16px;

          border: 1px solid rgba(96,165,250,0.24);
          border-radius: 14px;

          background: rgba(3,9,17,0.45);
        }

        .scanner-hero-side-icon {
          width: 58px;
          height: 58px;

          flex-shrink: 0;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 13px;

          color: #60a5fa;

          background: rgba(59,130,246,0.11);

          border: 1px solid rgba(59,130,246,0.22);
        }

        .scanner-hero-side strong,
        .scanner-hero-side span {
          display: block;
        }

        .scanner-hero-side strong {
          color: white;

          font-size: 15px;
          font-weight: 900;
        }

        .scanner-hero-side span {
          margin-top: 5px;

          color: rgba(255,255,255,0.42);

          font-size: 11px;
        }

        .scanner-section {
          margin-bottom: 24px;
        }

        .scanner-section-heading {
          margin-bottom: 18px;
        }

        .scanner-section-label {
          color: #60a5fa;

          font-size: 10px;
          font-weight: 950;

          letter-spacing: 1.5px;
        }

        .scanner-section-heading h2 {
          margin: 6px 0 0;

          color: white;

          font-size: 28px;
          font-weight: 950;
        }

        .scanner-section-heading p {
          margin: 7px 0 0;

          color: rgba(255,255,255,0.44);

          font-size: 13px;
        }

        .movement-grid {
          display: grid;

          grid-template-columns:
            repeat(2, minmax(0,1fr));

          gap: 20px;
        }

        .movement-card {
          appearance: none;

          position: relative;

          min-height: 360px;

          padding: 28px;

          overflow: hidden;

          display: flex;
          flex-direction: column;

          border-radius: 17px;

          color: white;

          cursor: pointer;

          text-align: left;

          font-family: inherit;

          transition:
            transform 0.15s ease,
            border-color 0.15s ease,
            box-shadow 0.15s ease;
        }

        .movement-card:hover {
          transform: translateY(-4px);
        }

        .movement-card:active {
          transform: translateY(0);
        }

        .movement-card-accent {
          position: absolute;

          top: 0;
          left: 0;

          width: 100%;
          height: 4px;
        }

        .movement-carico {
          border: 1px solid rgba(34,197,94,0.28);

          background:
            linear-gradient(
              145deg,
              rgba(34,197,94,0.075),
              rgba(10,23,35,0.97)
            );
        }

        .movement-carico .movement-card-accent {
          background:
            linear-gradient(
              90deg,
              #16a34a,
              #22c55e,
              transparent
            );
        }

        .movement-carico:hover {
          border-color: rgba(34,197,94,0.62);

          box-shadow:
            0 20px 55px rgba(34,197,94,0.09);
        }

        .movement-scarico {
          border: 1px solid rgba(239,68,68,0.28);

          background:
            linear-gradient(
              145deg,
              rgba(239,68,68,0.075),
              rgba(10,23,35,0.97)
            );
        }

        .movement-scarico .movement-card-accent {
          background:
            linear-gradient(
              90deg,
              #dc2626,
              #ef4444,
              transparent
            );
        }

        .movement-scarico:hover {
          border-color: rgba(239,68,68,0.62);

          box-shadow:
            0 20px 55px rgba(239,68,68,0.09);
        }

        .movement-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;

          gap: 20px;
        }

        .movement-icon {
          width: 64px;
          height: 64px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 15px;
        }

        .carico-icon {
          color: #22c55e;

          border: 1px solid rgba(34,197,94,0.26);

          background: rgba(34,197,94,0.11);
        }

        .scarico-icon {
          color: #ef4444;

          border: 1px solid rgba(239,68,68,0.26);

          background: rgba(239,68,68,0.11);
        }

        .movement-status {
          padding: 8px 11px;

          display: flex;
          align-items: center;
          gap: 7px;

          border-radius: 999px;

          font-size: 10px;
          font-weight: 950;

          letter-spacing: 1.1px;
        }

        .movement-status-dot {
          width: 7px;
          height: 7px;

          border-radius: 50%;

          background: currentColor;
        }

        .carico-status {
          color: #22c55e;

          border: 1px solid rgba(34,197,94,0.20);

          background: rgba(34,197,94,0.08);
        }

        .scarico-status {
          color: #ef4444;

          border: 1px solid rgba(239,68,68,0.20);

          background: rgba(239,68,68,0.08);
        }

        .movement-card-content {
          margin-top: 34px;
        }

        .movement-card-label {
          color: rgba(255,255,255,0.30);

          font-size: 9px;
          font-weight: 900;

          letter-spacing: 1.5px;
        }

        .movement-card h3 {
          margin: 8px 0 0;

          font-size: 38px;
          line-height: 1;

          font-weight: 950;

          letter-spacing: -0.7px;
        }

        .movement-carico h3 {
          color: #22c55e;
        }

        .movement-scarico h3 {
          color: #ef4444;
        }

        .movement-card-content p {
          max-width: 520px;

          margin: 13px 0 0;

          color: rgba(255,255,255,0.50);

          font-size: 14px;
          line-height: 1.55;
        }

        .movement-card-footer {
          margin-top: auto;

          padding-top: 24px;

          display: flex;
          align-items: center;
          justify-content: space-between;

          gap: 15px;

          border-top: 1px solid rgba(255,255,255,0.07);
        }

        .movement-card-footer strong,
        .movement-card-footer span {
          display: block;
        }

        .movement-card-footer strong {
          font-size: 14px;
          font-weight: 900;
        }

        .movement-card-footer span {
          margin-top: 4px;

          color: rgba(255,255,255,0.34);

          font-size: 10px;
        }

        .movement-arrow {
          width: 46px;
          height: 46px;

          flex-shrink: 0;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 11px;

          transition: transform 0.15s ease;
        }

        .movement-carico .movement-arrow {
          color: #22c55e;

          background: rgba(34,197,94,0.09);

          border: 1px solid rgba(34,197,94,0.18);
        }

        .movement-scarico .movement-arrow {
          color: #ef4444;

          background: rgba(239,68,68,0.09);

          border: 1px solid rgba(239,68,68,0.18);
        }

        .movement-card:hover .movement-arrow {
          transform: translateX(4px);
        }

        .scanner-info-panel {
          min-height: 90px;

          padding: 17px 20px;

          display: flex;
          align-items: center;
          gap: 15px;

          border: 1px solid rgba(96,165,250,0.18);
          border-radius: 13px;

          background: rgba(10,20,35,0.78);
        }

        .scanner-info-icon {
          width: 48px;
          height: 48px;

          flex-shrink: 0;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 11px;

          color: #60a5fa;

          background: rgba(59,130,246,0.10);
        }

        .scanner-info-copy {
          min-width: 0;
          flex: 1;
        }

        .scanner-info-copy strong,
        .scanner-info-copy span {
          display: block;
        }

        .scanner-info-copy strong {
          color: white;

          font-size: 13px;
          font-weight: 900;
        }

        .scanner-info-copy span {
          max-width: 850px;

          margin-top: 5px;

          color: rgba(255,255,255,0.40);

          font-size: 11px;
          line-height: 1.5;
        }

        .scanner-info-status {
          flex-shrink: 0;

          padding: 8px 10px;

          display: flex;
          align-items: center;
          gap: 7px;

          border: 1px solid rgba(34,197,94,0.16);
          border-radius: 999px;

          color: #22c55e;

          background: rgba(34,197,94,0.05);

          font-size: 9px;
          font-weight: 900;

          letter-spacing: 0.8px;
        }

        .scanner-info-status-dot {
          width: 7px;
          height: 7px;

          border-radius: 50%;

          background: #22c55e;
        }

        @media (max-width: 850px) {
          .scanner-hero {
            grid-template-columns: 1fr;
          }

          .scanner-hero-side {
            min-height: auto;
          }
        }

        @media (max-width: 700px) {
          .scanner-hero {
            padding: 24px;
          }

          .scanner-hero h1 {
            font-size: 38px;
          }

          .movement-grid {
            grid-template-columns: 1fr;
          }

          .movement-card {
            min-height: 320px;
          }

          .scanner-info-status {
            display: none;
          }
        }

        @media (max-width: 470px) {
          .scanner-hero-side {
            display: none;
          }

          .scanner-info-panel {
            align-items: flex-start;
          }
        }
      `}</style>
    </>
  );
}

/* ICONE */

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
    </svg>
  );
}

function BarcodeIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M4 5V19" stroke="currentColor" strokeWidth="2" />
      <path d="M8 5V19" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 5V19" stroke="currentColor" strokeWidth="2.5" />
      <path d="M15 5V19" stroke="currentColor" strokeWidth="1.5" />
      <path d="M18 5V19" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 4V18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <path
        d="M7 13L12 18L17 13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 20V6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <path
        d="M7 11L12 6L17 11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 12H19"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <path
        d="M14 7L19 12L14 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 3L19 6V11C19 15.5 16.4 19.1 12 21C7.6 19.1 5 15.5 5 11V6L12 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      <path
        d="M9 12L11 14L15 10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}