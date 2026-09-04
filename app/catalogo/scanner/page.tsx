"use client";

import { useRouter } from "next/navigation";

export default function ScannerPage() {
  const router = useRouter();

  return (
    <div className="scanner-page">
      <div className="scanner-heading">
        <div className="eyebrow">
          SCANNER MAGAZZINO
        </div>

        <h1>Movimenti</h1>

        <p>
          Seleziona il tipo di operazione da registrare
          con la pistola scanner.
        </p>
      </div>

      <div className="movement-grid">
        {/* CARICO */}

        <button
          type="button"
          className="movement-card carico"
          onClick={() =>
            router.push(
              "/catalogo/scanner/carico"
            )
          }
        >
          <div className="card-top">
            <div className="movement-icon carico-icon">
              <span>+</span>
            </div>

            <div className="status-pill carico-pill">
              ENTRATA
            </div>
          </div>

          <div className="card-content">
            <div className="movement-title">
              CARICO
            </div>

            <div className="movement-description">
              Registra gli articoli che entrano
              nel magazzino.
            </div>
          </div>

          <div className="card-footer">
            <span>
              Avvia scansione
            </span>

            <span className="arrow">
              →
            </span>
          </div>
        </button>

        {/* SCARICO */}

        <button
          type="button"
          className="movement-card scarico"
          onClick={() =>
            router.push(
              "/catalogo/scanner/scarico"
            )
          }
        >
          <div className="card-top">
            <div className="movement-icon scarico-icon">
              <span>−</span>
            </div>

            <div className="status-pill scarico-pill">
              USCITA
            </div>
          </div>

          <div className="card-content">
            <div className="movement-title">
              SCARICO
            </div>

            <div className="movement-description">
              Registra gli articoli che escono
              dal magazzino.
            </div>
          </div>

          <div className="card-footer">
            <span>
              Avvia scansione
            </span>

            <span className="arrow">
              →
            </span>
          </div>
        </button>
      </div>

      <div className="scanner-info">
        <div className="info-dot" />

        <div>
          I movimenti vengono prima salvati sul PC.
          La sincronizzazione con il gestionale verrà
          gestita separatamente.
        </div>
      </div>

      <style jsx>{`
        .scanner-page {
          width: 100%;
          max-width: 1180px;
          margin: 0 auto;
          padding-top: 14px;
        }

        .scanner-heading {
          margin-bottom: 32px;
        }

        .eyebrow {
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 1.5px;
          opacity: 0.45;
          margin-bottom: 7px;
        }

        h1 {
          margin: 0;
          font-size: 38px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: -1px;
        }

        p {
          margin: 11px 0 0;
          font-size: 14px;
          line-height: 1.5;
          opacity: 0.6;
        }

        .movement-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 20px;
        }

        .movement-card {
          appearance: none;
          position: relative;
          min-height: 285px;
          padding: 25px;
          border-radius: 18px;
          color: var(--foreground);
          cursor: pointer;
          text-align: left;
          font-family: inherit;

          display: flex;
          flex-direction: column;

          transition:
            transform 160ms ease,
            border-color 160ms ease,
            background 160ms ease;
        }

        .movement-card:hover {
          transform: translateY(-3px);
        }

        .movement-card:active {
          transform: translateY(0);
        }

        .carico {
          border: 1px solid rgba(34, 197, 94, 0.28);
          background:
            linear-gradient(
              145deg,
              rgba(34, 197, 94, 0.075),
              rgba(34, 197, 94, 0.018)
            ),
            var(--card);
        }

        .carico:hover {
          border-color: rgba(34, 197, 94, 0.65);
          background:
            linear-gradient(
              145deg,
              rgba(34, 197, 94, 0.12),
              rgba(34, 197, 94, 0.025)
            ),
            var(--card);
        }

        .scarico {
          border: 1px solid rgba(239, 68, 68, 0.28);
          background:
            linear-gradient(
              145deg,
              rgba(239, 68, 68, 0.075),
              rgba(239, 68, 68, 0.018)
            ),
            var(--card);
        }

        .scarico:hover {
          border-color: rgba(239, 68, 68, 0.65);
          background:
            linear-gradient(
              145deg,
              rgba(239, 68, 68, 0.12),
              rgba(239, 68, 68, 0.025)
            ),
            var(--card);
        }

        .card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
        }

        .movement-icon {
          width: 54px;
          height: 54px;
          border-radius: 14px;

          display: flex;
          align-items: center;
          justify-content: center;

          font-size: 32px;
          line-height: 1;
          font-weight: 500;
        }

        .carico-icon {
          color: #22c55e;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.22);
        }

        .scarico-icon {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.22);
        }

        .status-pill {
          padding: 6px 9px;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 1.1px;
        }

        .carico-pill {
          color: #22c55e;
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.2);
        }

        .scarico-pill {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .card-content {
          margin-top: 29px;
        }

        .movement-title {
          font-size: 28px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: -0.4px;
        }

        .carico .movement-title {
          color: #22c55e;
        }

        .scarico .movement-title {
          color: #ef4444;
        }

        .movement-description {
          margin-top: 10px;
          max-width: 390px;
          font-size: 13px;
          line-height: 1.5;
          opacity: 0.62;
        }

        .card-footer {
          margin-top: auto;
          padding-top: 25px;

          display: flex;
          align-items: center;
          justify-content: space-between;

          font-size: 13px;
          font-weight: 850;

          border-top: 1px solid rgba(255, 255, 255, 0.065);
        }

        .arrow {
          font-size: 21px;
          line-height: 1;
          transition: transform 160ms ease;
        }

        .movement-card:hover .arrow {
          transform: translateX(4px);
        }

        .scanner-info {
          margin-top: 20px;
          min-height: 46px;
          padding: 0 15px;

          display: flex;
          align-items: center;
          gap: 10px;

          border: 1px solid var(--border-color);
          border-radius: 10px;
          background: var(--card);

          font-size: 11px;
          line-height: 1.4;
          opacity: 0.7;
        }

        .info-dot {
          width: 7px;
          height: 7px;
          min-width: 7px;
          border-radius: 50%;
          background: #22c55e;
        }

        @media (max-width: 760px) {
          .scanner-page {
            padding-top: 5px;
          }

          .movement-grid {
            grid-template-columns: 1fr;
          }

          .movement-card {
            min-height: 245px;
          }

          h1 {
            font-size: 33px;
          }
        }
      `}</style>
    </div>
  );
}