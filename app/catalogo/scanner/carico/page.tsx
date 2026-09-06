"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";

type CatalogItem = {
  id: string;
  supplier_id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  image_url: string | null;
};

type CatalogData = {
  suppliers: Array<{
    id: string;
    name: string;
  }>;
  items: CatalogItem[];
  updatedAt: string;
};

type ScanRow = {
  id: string;
  date: string;
  code: string;
  supplier_code: string | null;
  description: string;
  qty: number;
  found: boolean;
};

type PendingRow = {
  movement_date: string;
  movement_type: "CARICO" | "SCARICO";
  code: string;
  supplier_code: string | null;
  description: string;
  qty: number;
  found: boolean;
};

type PendingBatch = {
  id: string;
  movement_type: "CARICO" | "SCARICO";
  created_at: string;
  rows: PendingRow[];
};

type SyncResult = {
  ok?: boolean;
  already_processed?: boolean;

  batch_id?: string;
  batch_date?: string;
  batch_type?: string;

  processed?: number;
  processed_count?: number;

  missing?: unknown[];
  missing_count?: number;

  insufficient?: unknown[];
  insufficient_count?: number;
};

const CATALOG_KEY =
  "magazzino_catalogo_offline";

const PENDING_KEY =
  "magazzino_scanner_pending_batches";

export default function ScannerCaricoPage() {
  const router = useRouter();

  const scannerInputRef =
    useRef<HTMLInputElement | null>(null);

  const syncingRef =
    useRef(false);

  const [catalogItems, setCatalogItems] =
    useState<CatalogItem[]>([]);

  const [catalogLoaded, setCatalogLoaded] =
    useState(false);

  const [scanCode, setScanCode] =
    useState("");

  const [rows, setRows] =
    useState<ScanRow[]>([]);

  const [lastScan, setLastScan] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [syncing, setSyncing] =
    useState(false);

  const [
    savedPendingRows,
    setSavedPendingRows,
  ] = useState(0);

  const [
    pendingCaricoBatches,
    setPendingCaricoBatches,
  ] = useState(0);

  const [
    pendingBatchCount,
    setPendingBatchCount,
  ] = useState(0);

  useEffect(() => {
    loadOfflineCatalog();
    updatePendingCount();

    setTimeout(() => {
      scannerInputRef.current?.focus();
    }, 200);

    function handleOnline() {
      syncPendingCarichi();
    }

    window.addEventListener(
      "online",
      handleOnline
    );

    if (navigator.onLine) {
      setTimeout(() => {
        syncPendingCarichi();
      }, 800);
    }

    return () => {
      window.removeEventListener(
        "online",
        handleOnline
      );
    };
  }, []);

  function loadOfflineCatalog() {
    try {
      const saved =
        localStorage.getItem(
          CATALOG_KEY
        );

      if (!saved) {
        setCatalogLoaded(false);
        return;
      }

      const parsed: CatalogData =
        JSON.parse(saved);

      setCatalogItems(
        parsed.items || []
      );

      setCatalogLoaded(true);
    } catch (error) {
      console.error(
        "Errore lettura catalogo:",
        error
      );

      setCatalogLoaded(false);
    }
  }

  const itemByScannerCode =
    useMemo(() => {
      const map =
        new Map<
          string,
          CatalogItem
        >();

      catalogItems.forEach(
        (item) => {
          const code =
            item.code
              .trim()
              .toLowerCase();

          if (code) {
            map.set(
              code,
              item
            );
          }
        }
      );

      return map;
    }, [catalogItems]);

  const totalRows =
    rows.length;

  const totalPieces =
    useMemo(() => {
      return rows.reduce(
        (sum, row) =>
          sum + row.qty,
        0
      );
    }, [rows]);

  const missingCodes =
    useMemo(() => {
      return rows.filter(
        (row) =>
          !row.found
      ).length;
    }, [rows]);

  function handleScannerKeyDown(
    event:
      React.KeyboardEvent<HTMLInputElement>
  ) {
    if (
      event.key !== "Enter"
    ) {
      return;
    }

    event.preventDefault();
    registerScan();
  }

  function registerScan() {
    const cleanCode =
      scanCode.trim();

    if (!cleanCode) {
      return;
    }

    const normalizedCode =
      cleanCode.toLowerCase();

    const item =
      itemByScannerCode.get(
        normalizedCode
      );

    const found =
      Boolean(item);

    const existing =
      rows.find(
        (row) =>
          row.code
            .trim()
            .toLowerCase() ===
          normalizedCode
      );

    if (existing) {
      setRows(
        (current) =>
          current.map(
            (row) =>
              row.id ===
              existing.id
                ? {
                    ...row,
                    qty:
                      row.qty +
                      1,
                  }
                : row
          )
      );

      setLastScan(
        found
          ? `✓ ${cleanCode} — quantità aumentata`
          : `● ${cleanCode} — codice non trovato, quantità aumentata`
      );
    } else {
      const newRow:
        ScanRow = {
        id:
          createLocalId(),

        date:
          currentLocalDate(),

        code:
          cleanCode,

        supplier_code:
          item?.supplier_code ||
          null,

        description:
          item?.description ||
          "CODICE NON TROVATO",

        qty: 1,

        found,
      };

      setRows(
        (current) => [
          ...current,
          newRow,
        ]
      );

      setLastScan(
        found
          ? `✓ ${cleanCode} — articolo trovato`
          : `● ${cleanCode} — CODICE NON TROVATO`
      );
    }

    setScanCode("");
    setMessage("");

    setTimeout(() => {
      scannerInputRef.current?.focus();
    }, 50);
  }

  function changeQty(
    rowId: string,
    value: number
  ) {
    const safeQty =
      Math.max(
        1,
        Math.floor(
          Number(value || 1)
        )
      );

    setRows(
      (current) =>
        current.map(
          (row) =>
            row.id === rowId
              ? {
                  ...row,
                  qty: safeQty,
                }
              : row
        )
    );
  }

  function undoLastScan() {
    if (
      rows.length === 0
    ) {
      return;
    }

    const last =
      rows[
        rows.length - 1
      ];

    if (last.qty > 1) {
      setRows(
        (current) =>
          current.map(
            (row) =>
              row.id ===
              last.id
                ? {
                    ...row,
                    qty:
                      row.qty -
                      1,
                  }
                : row
          )
      );
    } else {
      setRows(
        (current) =>
          current.filter(
            (row) =>
              row.id !==
              last.id
          )
      );
    }

    setLastScan(
      "Ultima scansione annullata."
    );

    setTimeout(() => {
      scannerInputRef.current?.focus();
    }, 50);
  }

  function clearSession() {
    if (
      rows.length === 0
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        "Vuoi eliminare tutte le scansioni di questo carico?"
      );

    if (!confirmed) {
      return;
    }

    setRows([]);
    setLastScan("");
    setMessage("");

    setTimeout(() => {
      scannerInputRef.current?.focus();
    }, 50);
  }

  async function saveCarico() {
    if (
      rows.length === 0 ||
      syncing
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Confermi questo CARICO?\n\n` +
          `Articoli: ${totalRows}\n` +
          `Pezzi: ${totalPieces}\n` +
          `Codici non trovati: ${missingCodes}\n\n` +
          `Se la connessione è disponibile, ` +
          `la giacenza verrà aggiornata subito.`
      );

    if (!confirmed) {
      return;
    }

    const batch:
      PendingBatch = {
      id:
        createLocalId(),

      movement_type:
        "CARICO",

      created_at:
        new Date().toISOString(),

      rows:
        rows.map(
          (row) => ({
            movement_date:
              row.date,

            movement_type:
              "CARICO",

            code:
              row.code,

            supplier_code:
              row.supplier_code,

            description:
              row.description,

            qty:
              row.qty,

            found:
              row.found,
          })
        ),
    };

    try {
      const pending =
        readPendingBatches();

      localStorage.setItem(
        PENDING_KEY,
        JSON.stringify([
          ...pending,
          batch,
        ])
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "ERRORE: impossibile salvare il carico sul PC. " +
          "Il movimento NON è stato inviato al gestionale."
      );

      return;
    }

    setRows([]);
    setLastScan("");

    updatePendingCount();

    if (!navigator.onLine) {
      setMessage(
        "⏳ CARICO salvato sul PC. Internet non disponibile: " +
          "rimane in attesa di invio."
      );

      return;
    }

    setMessage(
      "↻ Invio CARICO in corso..."
    );

    await syncPendingCarichi(
      batch.id
    );
  }

  async function syncPendingCarichi(
    onlyBatchId?: string
  ) {
    if (
      syncingRef.current
    ) {
      return;
    }

    if (
      typeof navigator !==
        "undefined" &&
      !navigator.onLine
    ) {
      updatePendingCount();
      return;
    }

    syncingRef.current =
      true;

    setSyncing(true);

    try {
      const pending =
        readPendingBatches();

      const carichi =
        pending.filter(
          (batch) =>
            batch.movement_type ===
              "CARICO" &&
            (!onlyBatchId ||
              batch.id ===
                onlyBatchId)
        );

      if (
        carichi.length === 0
      ) {
        updatePendingCount();
        return;
      }

      let synced = 0;

      let lastResult:
        SyncResult | null =
        null;

      for (
        const batch of carichi
      ) {
        try {
          const result =
            await sendBatch(
              batch
            );

          lastResult =
            result;

          removePendingBatch(
            batch.id
          );

          synced++;
        } catch (error) {
          console.error(
            "Invio CARICO fallito:",
            error
          );
        }
      }

      updatePendingCount();

      if (
        onlyBatchId &&
        synced === 1
      ) {
        const processed =
          readProcessedCount(
            lastResult
          );

        const missing =
          readMissingCount(
            lastResult
          );

        const already =
          Boolean(
            lastResult
              ?.already_processed
          );

        setMessage(
          already
            ? `✓ CARICO già ricevuto dal gestionale. ` +
                `Nessun doppio movimento eseguito.`
            : `✓ CARICO INVIATO. ` +
                `Righe caricate: ${processed}. ` +
                `Codici non trovati: ${missing}.`
        );
      } else if (
        onlyBatchId &&
        synced === 0
      ) {
        setMessage(
          "⚠ CARICO salvato sul PC ma non ancora inviato. " +
            "Verrà ritentato automaticamente."
        );
      } else if (
        synced > 0
      ) {
        setMessage(
          `✓ Inviati ${synced} CARICHI rimasti in attesa.`
        );
      }
    } finally {
      syncingRef.current =
        false;

      setSyncing(false);

      setTimeout(() => {
        scannerInputRef.current?.focus();
      }, 100);
    }
  }

  async function sendBatch(
    batch: PendingBatch
  ): Promise<SyncResult> {
    const movements =
      batch.rows.map(
        (row) => ({
          movement_date:
            row.movement_date,

          movement_type:
            row.movement_type,

          code:
            row.code,

          qty:
            row.qty,
        })
      );

    const {
      data,
      error,
    } =
      await supabase.rpc(
        "sync_pwa_movement_batch",
        {
          p_client_batch_id:
            batch.id,

          p_movements:
            movements,
        }
      );

    if (error) {
      throw new Error(
        error.message
      );
    }

    if (!data) {
      throw new Error(
        "Nessuna risposta dal gestionale."
      );
    }

    return data as SyncResult;
  }

  function readPendingBatches():
    PendingBatch[] {
    try {
      const saved =
        localStorage.getItem(
          PENDING_KEY
        );

      if (!saved) {
        return [];
      }

      const parsed =
        JSON.parse(saved);

      return Array.isArray(
        parsed
      )
        ? parsed
        : [];
    } catch {
      return [];
    }
  }

  function removePendingBatch(
    batchId: string
  ) {
    const pending =
      readPendingBatches();

    const updated =
      pending.filter(
        (batch) =>
          batch.id !==
          batchId
      );

    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify(
        updated
      )
    );
  }

  function updatePendingCount() {
    const batches =
      readPendingBatches();

    const rowCount =
      batches.reduce(
        (sum, batch) =>
          sum +
          (Array.isArray(
            batch.rows
          )
            ? batch.rows.length
            : 0),
        0
      );

    const caricoCount =
      batches.filter(
        (batch) =>
          batch.movement_type ===
          "CARICO"
      ).length;

    setSavedPendingRows(
      rowCount
    );

    setPendingCaricoBatches(
      caricoCount
    );

    setPendingBatchCount(
      batches.length
    );
  }

  function readProcessedCount(
    result:
      SyncResult | null
  ) {
    if (!result) {
      return 0;
    }

    if (
      typeof result.processed ===
      "number"
    ) {
      return result.processed;
    }

    if (
      typeof result.processed_count ===
      "number"
    ) {
      return result.processed_count;
    }

    return 0;
  }

  function readMissingCount(
    result:
      SyncResult | null
  ) {
    if (!result) {
      return 0;
    }

    if (
      Array.isArray(
        result.missing
      )
    ) {
      return result.missing.length;
    }

    if (
      typeof result.missing_count ===
      "number"
    ) {
      return result.missing_count;
    }

    return 0;
  }

  const scanMissing =
    lastScan.includes(
      "CODICE NON TROVATO"
    ) ||
    lastScan.includes(
      "codice non trovato"
    );

  return (
    <>
      <div className="scanner-carico-page">
        {/* TORNA */}

        <button
          type="button"
          className="scanner-back-button"
          onClick={() =>
            router.push(
              "/catalogo/scanner"
            )
          }
        >
          <BackIcon />

          Torna a Scanner
        </button>

        {/* HERO */}

        <section className="carico-hero">
          <div className="carico-hero-glow carico-glow-one" />
          <div className="carico-hero-glow carico-glow-two" />

          <div className="carico-hero-copy">
            <div className="carico-eyebrow">
              <ScannerIcon />

              <span>
                SCANNER MAGAZZINO
              </span>
            </div>

            <h1>
              <span>
                CARICO
              </span>{" "}
              merce
            </h1>

            <p>
              Scansiona gli articoli in entrata.
              Ogni codice viene aggiunto automaticamente
              alla sessione corrente.
            </p>

            <div className="carico-ready-line">
              <span className="carico-ready-dot" />

              Pistola scanner pronta
            </div>
          </div>

          <div className="carico-sync-summary">
            <div className="carico-sync-row">
              <div className="carico-sync-icon">
                <ComputerIcon />
              </div>

              <div>
                <span>
                  IN ATTESA SUL PC
                </span>

                <strong>
                  {savedPendingRows}
                </strong>
              </div>
            </div>

            <div
              className={`carico-sync-state ${
                pendingBatchCount >
                0
                  ? "pending"
                  : "ok"
              }`}
            >
              <span className="carico-sync-state-dot" />

              {syncing
                ? "INVIO IN CORSO..."
                : pendingBatchCount ===
                    0
                  ? "TUTTO INVIATO"
                  : pendingBatchCount ===
                      1
                    ? "1 MOVIMENTO DA INVIARE"
                    : `${pendingBatchCount} MOVIMENTI DA INVIARE`}
            </div>
          </div>
        </section>

        {/* AVVISO CATALOGO */}

        {!catalogLoaded && (
          <div className="carico-warning">
            <div className="carico-warning-icon">
              !
            </div>

            <div>
              <strong>
                Catalogo offline non trovato
              </strong>

              <span>
                I codici scansionati verranno considerati
                “non trovati” fino al prossimo aggiornamento
                del catalogo.
              </span>
            </div>
          </div>
        )}

        {/* SCANNER */}

        <section className="carico-scanner-panel">
          <div className="carico-section-heading">
            <div>
              <div className="carico-section-label">
                SCANSIONE
              </div>

              <h2>
                Pistola scanner
              </h2>

              <p>
                Scansiona il barcode. La pistola invia
                automaticamente INVIO.
              </p>
            </div>

            <div className="carico-scanner-status">
              <span />

              PRONTO
            </div>
          </div>

          <div className="carico-input-wrap">
            <BarcodeIcon />

            <input
              ref={
                scannerInputRef
              }
              autoFocus
              value={
                scanCode
              }
              onChange={(event) =>
                setScanCode(
                  event.target.value
                )
              }
              onKeyDown={
                handleScannerKeyDown
              }
              placeholder="Pronto alla scansione..."
              autoComplete="off"
            />

            <div className="carico-enter-badge">
              INVIO
            </div>
          </div>

          {lastScan && (
            <div
              className={`carico-last-scan ${
                scanMissing
                  ? "missing"
                  : "success"
              }`}
            >
              <div className="carico-last-scan-icon">
                {scanMissing
                  ? "!"
                  : "✓"}
              </div>

              <span>
                {lastScan}
              </span>
            </div>
          )}
        </section>

        {/* RIEPILOGO */}

        <section className="carico-summary-grid">
          <SummaryCard
            title="Articoli"
            subtitle="Codici distinti"
            value={totalRows}
            icon={
              <BoxIcon />
            }
          />

          <SummaryCard
            title="Pezzi"
            subtitle="Quantità totale"
            value={totalPieces}
            icon={
              <PiecesIcon />
            }
          />

          <SummaryCard
            title="Codici non trovati"
            subtitle="Da verificare"
            value={missingCodes}
            warning={
              missingCodes > 0
            }
            icon={
              <AlertIcon />
            }
          />
        </section>

        {/* TABELLA */}

        <section className="carico-table-panel">
          <div className="carico-table-header">
            <div>
              <div className="carico-section-label">
                SESSIONE CORRENTE
              </div>

              <h2>
                Articoli scansionati
              </h2>
            </div>

            <div className="carico-table-count">
              {totalRows}{" "}
              {totalRows === 1
                ? "articolo"
                : "articoli"}
            </div>
          </div>

          <div className="carico-table-wrap">
            <table className="carico-table">
              <thead>
                <tr>
                  <th>
                    Data
                  </th>

                  <th>
                    Codice scanner
                  </th>

                  <th>
                    Codice articolo
                  </th>

                  <th>
                    Descrizione
                  </th>

                  <th className="right">
                    Quantità
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.length ===
                0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="carico-empty"
                    >
                      <div className="carico-empty-icon">
                        <BarcodeIcon />
                      </div>

                      <strong>
                        Nessun articolo scansionato
                      </strong>

                      <span>
                        La lista si riempirà automaticamente
                        alla prima scansione.
                      </span>
                    </td>
                  </tr>
                ) : (
                  rows.map(
                    (row) => (
                      <tr
                        key={
                          row.id
                        }
                        className={
                          row.found
                            ? ""
                            : "missing-row"
                        }
                      >
                        <td>
                          {displayDate(
                            row.date
                          )}
                        </td>

                        <td>
                          <span className="carico-code-scanner">
                            {
                              row.code
                            }
                          </span>
                        </td>

                        <td>
                          {row.found ? (
                            <span className="carico-article-code">
                              {row.supplier_code ||
                                "-"}
                            </span>
                          ) : (
                            <span className="carico-missing-dash">
                              —
                            </span>
                          )}
                        </td>

                        <td>
                          {row.found ? (
                            row.description
                          ) : (
                            <span className="carico-missing-text">
                              CODICE NON TROVATO
                            </span>
                          )}
                        </td>

                        <td className="right">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={
                              row.qty
                            }
                            onChange={(event) =>
                              changeQty(
                                row.id,
                                Number(
                                  event
                                    .target
                                    .value
                                )
                              )
                            }
                            className="carico-qty-input"
                          />
                        </td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* AZIONI */}

        <section className="carico-actions">
          <div className="carico-actions-left">
            <button
              type="button"
              onClick={
                undoLastScan
              }
              disabled={
                rows.length ===
                  0 ||
                syncing
              }
              className="carico-secondary-button"
            >
              <UndoIcon />

              Annulla ultima
            </button>

            <button
              type="button"
              onClick={
                clearSession
              }
              disabled={
                rows.length ===
                  0 ||
                syncing
              }
              className="carico-secondary-button carico-clear-button"
            >
              <TrashIcon />

              Pulisci
            </button>
          </div>

          <button
            type="button"
            onClick={
              saveCarico
            }
            disabled={
              rows.length ===
                0 ||
              syncing
            }
            className="carico-save-button"
          >
            <SaveIcon />

            <div>
              <strong>
                {syncing
                  ? "Invio in corso..."
                  : "Salva CARICO"}
              </strong>

              <span>
                {totalPieces}{" "}
                {totalPieces === 1
                  ? "pezzo"
                  : "pezzi"}
              </span>
            </div>
          </button>
        </section>

        {/* RETRY */}

        {pendingCaricoBatches >
          0 &&
          !syncing && (
            <button
              type="button"
              onClick={() =>
                syncPendingCarichi()
              }
              className="carico-retry-button"
            >
              <RefreshIcon />

              Riprova invio CARICHI in attesa
            </button>
          )}

        {/* MESSAGGIO */}

        {message && (
          <div className="carico-message">
            <div className="carico-message-icon">
              <InfoIcon />
            </div>

            <span>
              {message}
            </span>
          </div>
        )}
      </div>

      <style jsx global>{`
        .scanner-carico-page {
          width: 100%;
          max-width: 1500px;
          margin: 0 auto;
        }

        .scanner-back-button {
          min-height: 42px;
          margin-bottom: 16px;
          padding: 0 13px;

          display: inline-flex;
          align-items: center;
          gap: 8px;

          border:
            1px solid
            rgba(96,165,250,0.20);

          border-radius: 9px;

          background:
            rgba(59,130,246,0.055);

          color: #93c5fd;

          cursor: pointer;

          font-size: 12px;
          font-weight: 850;
        }

        /* HERO */

        .carico-hero {
          position: relative;
          overflow: hidden;

          min-height: 230px;
          margin-bottom: 22px;
          padding: 32px 34px;

          display: grid;
          grid-template-columns:
            minmax(0,1fr)
            310px;

          align-items: center;
          gap: 40px;

          box-sizing: border-box;

          border:
            1px solid
            rgba(34,197,94,0.30);

          border-radius: 18px;

          background:
            linear-gradient(
              125deg,
              rgba(10,33,37,0.98) 0%,
              #0b1826 48%,
              #08111d 100%
            );
        }

        .carico-hero-glow {
          position: absolute;
          border-radius: 999px;
          pointer-events: none;
        }

        .carico-glow-one {
          width: 620px;
          height: 620px;
          top: -535px;
          right: 230px;

          background:
            rgba(34,197,94,0.11);
        }

        .carico-glow-two {
          width: 350px;
          height: 350px;
          right: 30px;
          bottom: -300px;

          background:
            rgba(34,197,94,0.07);
        }

        .carico-hero-copy,
        .carico-sync-summary {
          position: relative;
          z-index: 2;
        }

        .carico-eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;

          color: #4ade80;

          font-size: 10px;
          font-weight: 950;

          letter-spacing: 1.6px;
        }

        .carico-hero h1 {
          margin: 13px 0 0;

          color: white;

          font-size: 46px;
          line-height: 1;

          font-weight: 950;

          letter-spacing: -1.2px;
        }

        .carico-hero h1 span {
          color: #22c55e;
        }

        .carico-hero p {
          max-width: 700px;
          margin: 13px 0 0;

          color:
            rgba(255,255,255,0.56);

          font-size: 14px;
          line-height: 1.5;
        }

        .carico-ready-line {
          margin-top: 21px;

          display: flex;
          align-items: center;
          gap: 9px;

          color:
            rgba(255,255,255,0.48);

          font-size: 11px;
        }

        .carico-ready-dot {
          width: 8px;
          height: 8px;

          border-radius: 50%;

          background: #22c55e;

          box-shadow:
            0 0 0 5px
            rgba(34,197,94,0.10);
        }

        .carico-sync-summary {
          padding: 18px;

          border:
            1px solid
            rgba(34,197,94,0.20);

          border-radius: 14px;

          background:
            rgba(3,9,17,0.46);
        }

        .carico-sync-row {
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .carico-sync-icon {
          width: 48px;
          height: 48px;

          flex-shrink: 0;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 11px;

          color: #4ade80;

          background:
            rgba(34,197,94,0.10);

          border:
            1px solid
            rgba(34,197,94,0.18);
        }

        .carico-sync-row span,
        .carico-sync-row strong {
          display: block;
        }

        .carico-sync-row span {
          color:
            rgba(255,255,255,0.36);

          font-size: 9px;
          font-weight: 850;

          letter-spacing: 0.8px;
        }

        .carico-sync-row strong {
          margin-top: 4px;

          color: white;

          font-size: 27px;
          font-weight: 950;
        }

        .carico-sync-state {
          margin-top: 14px;
          padding: 9px 10px;

          display: flex;
          align-items: center;
          gap: 7px;

          border-radius: 9px;

          font-size: 9px;
          font-weight: 900;

          letter-spacing: 0.6px;
        }

        .carico-sync-state.ok {
          color: #22c55e;

          border:
            1px solid
            rgba(34,197,94,0.18);

          background:
            rgba(34,197,94,0.055);
        }

        .carico-sync-state.pending {
          color: #f59e0b;

          border:
            1px solid
            rgba(245,158,11,0.22);

          background:
            rgba(245,158,11,0.06);
        }

        .carico-sync-state-dot {
          width: 7px;
          height: 7px;

          border-radius: 50%;

          background:
            currentColor;
        }

        /* WARNING */

        .carico-warning {
          margin-bottom: 20px;
          padding: 15px 17px;

          display: flex;
          align-items: center;
          gap: 13px;

          border:
            1px solid
            rgba(245,158,11,0.36);

          border-radius: 11px;

          background:
            rgba(245,158,11,0.075);
        }

        .carico-warning-icon {
          width: 38px;
          height: 38px;

          flex-shrink: 0;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 9px;

          background:
            rgba(245,158,11,0.10);

          color: #f59e0b;

          font-size: 19px;
          font-weight: 950;
        }

        .carico-warning strong,
        .carico-warning span {
          display: block;
        }

        .carico-warning strong {
          color: #fbbf24;

          font-size: 13px;
          font-weight: 900;
        }

        .carico-warning span {
          margin-top: 4px;

          color:
            rgba(255,255,255,0.46);

          font-size: 11px;
        }

        /* SCANNER PANEL */

        .carico-scanner-panel {
          margin-bottom: 20px;
          padding: 22px;

          border:
            1px solid
            rgba(34,197,94,0.30);

          border-radius: 15px;

          background:
            linear-gradient(
              145deg,
              rgba(12,37,40,0.80),
              rgba(9,22,35,0.94)
            );
        }

        .carico-section-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
        }

        .carico-section-label {
          color: #4ade80;

          font-size: 9px;
          font-weight: 950;

          letter-spacing: 1.5px;
        }

        .carico-section-heading h2,
        .carico-table-header h2 {
          margin: 5px 0 0;

          color: white;

          font-size: 23px;
          font-weight: 950;
        }

        .carico-section-heading p {
          margin: 5px 0 0;

          color:
            rgba(255,255,255,0.40);

          font-size: 11px;
        }

        .carico-scanner-status {
          padding: 8px 11px;

          display: flex;
          align-items: center;
          gap: 7px;

          border:
            1px solid
            rgba(34,197,94,0.20);

          border-radius: 999px;

          background:
            rgba(34,197,94,0.06);

          color: #22c55e;

          font-size: 9px;
          font-weight: 950;

          letter-spacing: 0.8px;
        }

        .carico-scanner-status span {
          width: 7px;
          height: 7px;

          border-radius: 50%;

          background: #22c55e;

          box-shadow:
            0 0 0 4px
            rgba(34,197,94,0.08);
        }

        .carico-input-wrap {
          height: 76px;
          margin-top: 17px;
          padding: 0 16px;

          display: flex;
          align-items: center;
          gap: 14px;

          border:
            2px solid
            rgba(34,197,94,0.58);

          border-radius: 13px;

          background:
            rgba(2,8,14,0.70);

          color: #22c55e;

          box-shadow:
            0 0 0 4px
            rgba(34,197,94,0.035);
        }

        .carico-input-wrap:focus-within {
          border-color: #22c55e;

          box-shadow:
            0 0 0 5px
            rgba(34,197,94,0.07);
        }

        .carico-input-wrap input {
          min-width: 0;
          flex: 1;

          border: none;
          outline: none;

          background: transparent;

          color: white;

          font: inherit;

          font-size: 22px;
          font-weight: 850;

          letter-spacing: 0.2px;
        }

        .carico-input-wrap input::placeholder {
          color:
            rgba(255,255,255,0.30);
        }

        .carico-enter-badge {
          flex-shrink: 0;

          padding: 6px 8px;

          border:
            1px solid
            rgba(255,255,255,0.12);

          border-radius: 7px;

          color:
            rgba(255,255,255,0.36);

          background:
            rgba(255,255,255,0.04);

          font-size: 8px;
          font-weight: 900;
        }

        .carico-last-scan {
          margin-top: 13px;
          padding: 12px 14px;

          display: flex;
          align-items: center;
          gap: 10px;

          border-radius: 10px;

          font-size: 13px;
          font-weight: 850;
        }

        .carico-last-scan.success {
          border:
            1px solid
            rgba(34,197,94,0.30);

          background:
            rgba(34,197,94,0.075);

          color: #86efac;
        }

        .carico-last-scan.missing {
          border:
            1px solid
            rgba(239,68,68,0.32);

          background:
            rgba(239,68,68,0.08);

          color: #fca5a5;
        }

        .carico-last-scan-icon {
          width: 29px;
          height: 29px;

          flex-shrink: 0;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 8px;

          background:
            rgba(255,255,255,0.055);

          font-weight: 950;
        }

        /* SUMMARY */

        .carico-summary-grid {
          margin-bottom: 20px;

          display: grid;
          grid-template-columns:
            repeat(3,minmax(0,1fr));

          gap: 14px;
        }

        .carico-summary-card {
          min-height: 115px;
          padding: 17px;

          display: flex;
          align-items: center;
          gap: 14px;

          border:
            1px solid
            rgba(96,165,250,0.18);

          border-radius: 13px;

          background:
            linear-gradient(
              145deg,
              rgba(16,28,47,0.94),
              rgba(10,20,35,0.96)
            );
        }

        .carico-summary-card.warning {
          border-color:
            rgba(239,68,68,0.30);

          background:
            linear-gradient(
              145deg,
              rgba(239,68,68,0.075),
              rgba(10,20,35,0.96)
            );
        }

        .carico-summary-icon {
          width: 46px;
          height: 46px;

          flex-shrink: 0;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 11px;

          color: #4ade80;

          background:
            rgba(34,197,94,0.09);

          border:
            1px solid
            rgba(34,197,94,0.16);
        }

        .carico-summary-card.warning
          .carico-summary-icon {
          color: #ef4444;

          background:
            rgba(239,68,68,0.09);

          border-color:
            rgba(239,68,68,0.18);
        }

        .carico-summary-copy {
          min-width: 0;
          flex: 1;
        }

        .carico-summary-copy span,
        .carico-summary-copy strong,
        .carico-summary-copy small {
          display: block;
        }

        .carico-summary-copy span {
          color:
            rgba(255,255,255,0.48);

          font-size: 10px;
          font-weight: 850;

          text-transform: uppercase;

          letter-spacing: 0.6px;
        }

        .carico-summary-copy strong {
          margin-top: 4px;

          color: white;

          font-size: 30px;
          font-weight: 950;
        }

        .carico-summary-copy small {
          margin-top: 2px;

          color:
            rgba(255,255,255,0.30);

          font-size: 9px;
        }

        /* TABLE */

        .carico-table-panel {
          overflow: hidden;

          border:
            1px solid
            rgba(96,165,250,0.19);

          border-radius: 14px;

          background:
            rgba(10,20,35,0.92);
        }

        .carico-table-header {
          padding: 16px 18px;

          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;

          border-bottom:
            1px solid
            rgba(96,165,250,0.14);

          background:
            rgba(255,255,255,0.018);
        }

        .carico-table-count {
          padding: 8px 11px;

          border:
            1px solid
            rgba(34,197,94,0.17);

          border-radius: 999px;

          background:
            rgba(34,197,94,0.05);

          color: #86efac;

          font-size: 10px;
          font-weight: 850;
        }

        .carico-table-wrap {
          overflow-x: auto;
        }

        .carico-table {
          width: 100%;
          min-width: 950px;

          border-collapse: collapse;
        }

        .carico-table th {
          padding: 14px 17px;

          color:
            rgba(147,197,253,0.52);

          text-align: left;

          font-size: 10px;
          font-weight: 900;

          text-transform: uppercase;

          letter-spacing: 0.7px;

          white-space: nowrap;

          background:
            rgba(255,255,255,0.012);
        }

        .carico-table th.right,
        .carico-table td.right {
          text-align: right;
        }

        .carico-table td {
          padding: 15px 17px;

          border-top:
            1px solid
            rgba(96,165,250,0.08);

          color:
            rgba(255,255,255,0.73);

          font-size: 13px;

          vertical-align: middle;
        }

        .carico-table tbody tr:hover {
          background:
            rgba(34,197,94,0.025);
        }

        .carico-table tr.missing-row {
          background:
            rgba(239,68,68,0.055);
        }

        .carico-code-scanner {
          color: white;

          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;

          font-size: 13px;
          font-weight: 850;
        }

        .carico-article-code {
          display: inline-flex;

          padding: 5px 8px;

          border:
            1px solid
            rgba(59,130,246,0.20);

          border-radius: 7px;

          background:
            rgba(59,130,246,0.07);

          color: #93c5fd;

          font-size: 12px;
          font-weight: 900;
        }

        .carico-missing-text {
          color: #ef4444;
          font-weight: 900;
        }

        .carico-missing-dash {
          color: #ef4444;
        }

        .carico-qty-input {
          width: 95px;
          padding: 10px 10px;

          box-sizing: border-box;

          border:
            1px solid
            rgba(96,165,250,0.20);

          border-radius: 8px;

          outline: none;

          background:
            rgba(3,9,17,0.60);

          color: white;

          text-align: right;

          font: inherit;
          font-size: 15px;
          font-weight: 900;
        }

        .carico-qty-input:focus {
          border-color:
            rgba(34,197,94,0.58);

          box-shadow:
            0 0 0 3px
            rgba(34,197,94,0.055);
        }

        .carico-empty {
          padding: 55px 20px !important;

          text-align: center;
        }

        .carico-empty-icon {
          width: 48px;
          height: 48px;

          margin: 0 auto 12px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 12px;

          color: #4ade80;

          background:
            rgba(34,197,94,0.07);

          border:
            1px solid
            rgba(34,197,94,0.14);
        }

        .carico-empty strong,
        .carico-empty span {
          display: block;
        }

        .carico-empty strong {
          color: white;

          font-size: 14px;
          font-weight: 900;
        }

        .carico-empty span {
          margin-top: 5px;

          color:
            rgba(255,255,255,0.35);

          font-size: 10px;
        }

        /* ACTIONS */

        .carico-actions {
          margin-top: 18px;

          display: flex;
          align-items: center;
          justify-content: space-between;

          gap: 14px;

          flex-wrap: wrap;
        }

        .carico-actions-left {
          display: flex;
          gap: 9px;
          flex-wrap: wrap;
        }

        .carico-secondary-button {
          min-height: 46px;
          padding: 0 14px;

          display: inline-flex;
          align-items: center;
          gap: 8px;

          border:
            1px solid
            rgba(96,165,250,0.20);

          border-radius: 9px;

          background:
            rgba(59,130,246,0.05);

          color:
            rgba(255,255,255,0.72);

          cursor: pointer;

          font-size: 11px;
          font-weight: 850;
        }

        .carico-clear-button {
          border-color:
            rgba(239,68,68,0.18);

          background:
            rgba(239,68,68,0.045);

          color: #fca5a5;
        }

        .carico-secondary-button:disabled {
          cursor: not-allowed;
          opacity: 0.35;
        }

        .carico-save-button {
          min-width: 210px;
          min-height: 58px;
          padding: 9px 17px;

          display: flex;
          align-items: center;
          justify-content: center;
          gap: 11px;

          border:
            1px solid #22c55e;

          border-radius: 11px;

          background:
            linear-gradient(
              135deg,
              #16a34a,
              #22c55e
            );

          color: #041109;

          cursor: pointer;

          box-shadow:
            0 10px 30px
            rgba(34,197,94,0.12);
        }

        .carico-save-button:disabled {
          border-color:
            rgba(255,255,255,0.10);

          background:
            rgba(255,255,255,0.035);

          color:
            rgba(255,255,255,0.28);

          cursor: not-allowed;

          box-shadow: none;
        }

        .carico-save-button strong,
        .carico-save-button span {
          display: block;
        }

        .carico-save-button strong {
          font-size: 13px;
          font-weight: 950;
        }

        .carico-save-button span {
          margin-top: 3px;

          font-size: 9px;
          font-weight: 800;

          opacity: 0.65;
        }

        .carico-retry-button {
          margin-top: 14px;
          min-height: 43px;
          padding: 0 13px;

          display: inline-flex;
          align-items: center;
          gap: 8px;

          border:
            1px solid
            rgba(245,158,11,0.38);

          border-radius: 9px;

          background:
            rgba(245,158,11,0.07);

          color: #fbbf24;

          cursor: pointer;

          font-size: 11px;
          font-weight: 850;
        }

        .carico-message {
          margin-top: 17px;
          padding: 14px 16px;

          display: flex;
          align-items: center;
          gap: 11px;

          border:
            1px solid
            rgba(96,165,250,0.18);

          border-radius: 11px;

          background:
            rgba(59,130,246,0.055);

          color:
            rgba(255,255,255,0.68);

          font-size: 12px;
          font-weight: 750;

          line-height: 1.45;
        }

        .carico-message-icon {
          width: 33px;
          height: 33px;

          flex-shrink: 0;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 9px;

          color: #60a5fa;

          background:
            rgba(59,130,246,0.10);
        }

        /* RESPONSIVE */

        @media (max-width: 950px) {
          .carico-hero {
            grid-template-columns: 1fr;
          }

          .carico-sync-summary {
            max-width: none;
          }
        }

        @media (max-width: 700px) {
          .carico-hero {
            padding: 24px;
          }

          .carico-hero h1 {
            font-size: 38px;
          }

          .carico-summary-grid {
            grid-template-columns: 1fr;
          }

          .carico-section-heading,
          .carico-table-header {
            align-items: flex-start;
          }

          .carico-input-wrap {
            height: 68px;
          }

          .carico-input-wrap input {
            font-size: 18px;
          }

          .carico-save-button {
            width: 100%;
          }

          .carico-actions-left {
            width: 100%;
          }

          .carico-secondary-button {
            flex: 1;
          }
        }

        @media (max-width: 470px) {
          .carico-scanner-status,
          .carico-enter-badge {
            display: none;
          }

          .carico-section-heading,
          .carico-table-header {
            flex-direction: column;
          }

          .carico-table-count {
            align-self: flex-start;
          }
        }
      `}</style>
    </>
  );
}

/* =========================================================
   COMPONENTI
========================================================= */

function SummaryCard({
  title,
  subtitle,
  value,
  warning = false,
  icon,
}: {
  title: string;
  subtitle: string;
  value: number;
  warning?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={`carico-summary-card ${
        warning
          ? "warning"
          : ""
      }`}
    >
      <div className="carico-summary-icon">
        {icon}
      </div>

      <div className="carico-summary-copy">
        <span>
          {title}
        </span>

        <strong>
          {value}
        </strong>

        <small>
          {subtitle}
        </small>
      </div>
    </div>
  );
}

/* =========================================================
   ICONE
========================================================= */

function BackIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M19 12H5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <path
        d="M10 7L5 12L10 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
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
    </svg>
  );
}

function BarcodeIcon() {
  return (
    <svg
      width="25"
      height="25"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 5V19"
        stroke="currentColor"
        strokeWidth="2"
      />

      <path
        d="M8 5V19"
        stroke="currentColor"
        strokeWidth="1.5"
      />

      <path
        d="M11 5V19"
        stroke="currentColor"
        strokeWidth="2.5"
      />

      <path
        d="M15 5V19"
        stroke="currentColor"
        strokeWidth="1.5"
      />

      <path
        d="M18 5V19"
        stroke="currentColor"
        strokeWidth="2.5"
      />
    </svg>
  );
}

function ComputerIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="5"
        width="16"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M9 20H15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <path
        d="M12 16V20"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 8L12 4L20 8V18L12 21L4 18V8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      <path
        d="M4.5 8L12 12L19.5 8"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M12 12V21"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function PiecesIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 8L12 5L18 8L12 11L6 8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      <path
        d="M6 12L12 15L18 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      <path
        d="M6 16L12 19L18 16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 4L21 20H3L12 4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      <path
        d="M12 9V14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <circle
        cx="12"
        cy="17"
        r="1"
        fill="currentColor"
      />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 7L4 12L9 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M5 12H14C17.3 12 20 14.7 20 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 7H19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <path
        d="M9 7V4H15V7"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M7 7L8 20H16L17 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 4H17L20 7V20H5V4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      <path
        d="M8 4V10H16V4"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <rect
        x="8"
        y="14"
        width="8"
        height="6"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 7V3L17.5 5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M19 6C17.5 4.5 15.3 3.5 13 3.5C8.3 3.5 4.5 7.3 4.5 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <path
        d="M4 17V21L6.5 18.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M5 18C6.5 19.5 8.7 20.5 11 20.5C15.7 20.5 19.5 16.7 19.5 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M12 11V17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <circle
        cx="12"
        cy="7.5"
        r="1"
        fill="currentColor"
      />
    </svg>
  );
}

/* =========================================================
   UTILITÀ
========================================================= */

function currentLocalDate() {
  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}

function displayDate(
  value: string
) {
  const parts =
    value.split("-");

  if (
    parts.length !== 3
  ) {
    return value;
  }

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function createLocalId() {
  if (
    typeof crypto !==
      "undefined" &&
    "randomUUID" in
      crypto
  ) {
    return crypto.randomUUID();
  }

  return (
    Date.now().toString(36) +
    "-" +
    Math.random()
      .toString(36)
      .slice(2) +
    "-" +
    Math.random()
      .toString(36)
      .slice(2)
  );
}