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

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1500,
        margin: "0 auto",
      }}
    >
      <button
        type="button"
        onClick={() =>
          router.push(
            "/catalogo/scanner"
          )
        }
        style={{
          padding: 0,
          border: 0,
          background:
            "transparent",
          color:
            "var(--foreground)",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 800,
          marginBottom: 15,
        }}
      >
        ← Torna a Scanner
      </button>

      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap: 20,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 850,
              letterSpacing: 1.2,
              opacity: 0.5,
              textTransform:
                "uppercase",
              marginBottom: 5,
            }}
          >
            Scanner Magazzino
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 36,
              fontWeight: 950,
              color: "#22c55e",
            }}
          >
            CARICO
          </h1>

          <div
            style={{
              marginTop: 6,
              fontSize: 14,
              opacity: 0.6,
            }}
          >
            Scansiona gli articoli in entrata.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 9,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              padding:
                "10px 14px",
              borderRadius: 10,
              border:
                "1px solid var(--border-color)",
              background:
                "var(--card)",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            In attesa sul PC:{" "}
            {savedPendingRows}
          </div>

          <div
            style={{
              padding:
                "10px 14px",
              borderRadius: 10,

              border:
                pendingBatchCount >
                0
                  ? "1px solid rgba(245,158,11,0.50)"
                  : "1px solid rgba(34,197,94,0.40)",

              background:
                pendingBatchCount >
                0
                  ? "rgba(245,158,11,0.09)"
                  : "rgba(34,197,94,0.08)",

              fontSize: 12,
              fontWeight: 900,
            }}
          >
            {syncing
              ? "↻ Invio in corso..."
              : pendingBatchCount ===
                  0
                ? "✓ Tutto inviato"
                : pendingBatchCount ===
                    1
                  ? "⚠ 1 movimento da inviare"
                  : `⚠ ${pendingBatchCount} movimenti da inviare`}
          </div>
        </div>
      </div>

      {!catalogLoaded && (
        <div
          style={{
            marginBottom: 18,
            padding:
              "13px 15px",
            borderRadius: 10,
            border:
              "1px solid rgba(245,158,11,0.4)",
            background:
              "rgba(245,158,11,0.08)",
            fontSize: 13,
            fontWeight: 750,
          }}
        >
          Attenzione: catalogo offline non trovato.
          I codici scansionati verranno considerati
          “non trovati”.
        </div>
      )}

      <div
        style={{
          padding: 18,
          border:
            "1px solid rgba(34,197,94,0.35)",
          background:
            "rgba(34,197,94,0.06)",
          borderRadius: 14,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 850,
            marginBottom: 8,
          }}
        >
          Pistola scanner
        </div>

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
          style={{
            width: "100%",
            boxSizing:
              "border-box",
            padding:
              "16px 18px",
            borderRadius: 10,
            border:
              "2px solid rgba(34,197,94,0.55)",
            background:
              "var(--input-bg)",
            color:
              "var(--foreground)",
            fontSize: 20,
            fontWeight: 850,
            outline: "none",
          }}
        />

        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            opacity: 0.55,
          }}
        >
          La pistola scrive il codice e invia automaticamente INVIO.
        </div>

        {lastScan && (
          <div
            style={{
              marginTop: 12,
              padding:
                "11px 13px",
              borderRadius: 8,

              background:
                lastScan.includes(
                  "CODICE NON TROVATO"
                ) ||
                lastScan.includes(
                  "codice non trovato"
                )
                  ? "rgba(239,68,68,0.10)"
                  : "rgba(34,197,94,0.10)",

              border:
                lastScan.includes(
                  "CODICE NON TROVATO"
                ) ||
                lastScan.includes(
                  "codice non trovato"
                )
                  ? "1px solid rgba(239,68,68,0.35)"
                  : "1px solid rgba(34,197,94,0.35)",

              fontSize: 14,
              fontWeight: 850,
            }}
          >
            {lastScan}
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <SummaryCard
          title="Articoli"
          value={totalRows}
        />

        <SummaryCard
          title="Pezzi"
          value={totalPieces}
        />

        <SummaryCard
          title="Codici non trovati"
          value={missingCodes}
          warning={
            missingCodes > 0
          }
        />
      </div>

      <div
        style={{
          border:
            "1px solid var(--border-color)",
          borderRadius: 14,
          overflow: "hidden",
          background:
            "var(--card)",
        }}
      >
        <div
          style={{
            padding:
              "15px 17px",
            background:
              "var(--table-head)",
            borderBottom:
              "1px solid var(--border-color)",
            fontWeight: 900,
            fontSize: 17,
          }}
        >
          Articoli scansionati
        </div>

        <div
          style={{
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              minWidth: 950,
              borderCollapse:
                "collapse",
            }}
          >
            <thead>
              <tr>
                <th style={headerStyle}>
                  Data
                </th>

                <th style={headerStyle}>
                  Codice scanner
                </th>

                <th style={headerStyle}>
                  Codice articolo
                </th>

                <th style={headerStyle}>
                  Descrizione
                </th>

                <th style={headerRightStyle}>
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
                    style={{
                      padding: 45,
                      textAlign:
                        "center",
                      opacity: 0.5,
                      fontSize: 14,
                    }}
                  >
                    Nessun articolo scansionato.
                  </td>
                </tr>
              ) : (
                rows.map(
                  (row) => (
                    <tr
                      key={
                        row.id
                      }
                      style={{
                        borderBottom:
                          "1px solid var(--border-color)",

                        background:
                          row.found
                            ? "transparent"
                            : "rgba(239,68,68,0.06)",
                      }}
                    >
                      <td
                        style={
                          cellStyle
                        }
                      >
                        {displayDate(
                          row.date
                        )}
                      </td>

                      <td
                        style={
                          cellStyle
                        }
                      >
                        <strong
                          style={{
                            fontFamily:
                              "monospace",
                            fontSize: 15,
                          }}
                        >
                          {
                            row.code
                          }
                        </strong>
                      </td>

                      <td
                        style={
                          cellStyle
                        }
                      >
                        {row.found
                          ? row.supplier_code ||
                            "-"
                          : "—"}
                      </td>

                      <td
                        style={
                          cellStyle
                        }
                      >
                        {row.found ? (
                          row.description
                        ) : (
                          <strong
                            style={{
                              color:
                                "#ef4444",
                            }}
                          >
                            CODICE NON TROVATO
                          </strong>
                        )}
                      </td>

                      <td
                        style={
                          rightCellStyle
                        }
                      >
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
                          style={{
                            width: 90,
                            padding:
                              "8px 9px",
                            borderRadius: 7,
                            border:
                              "1px solid var(--border-color)",
                            background:
                              "var(--input-bg)",
                            color:
                              "var(--foreground)",
                            textAlign:
                              "right",
                            fontWeight: 900,
                            fontSize: 15,
                          }}
                        />
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          display: "flex",
          justifyContent:
            "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={
              undoLastScan
            }
            disabled={
              rows.length === 0 ||
              syncing
            }
            style={
              secondaryButtonStyle
            }
          >
            ↶ Annulla ultima scansione
          </button>

          <button
            type="button"
            onClick={
              clearSession
            }
            disabled={
              rows.length === 0 ||
              syncing
            }
            style={
              secondaryButtonStyle
            }
          >
            Pulisci
          </button>
        </div>

        <button
          type="button"
          onClick={
            saveCarico
          }
          disabled={
            rows.length === 0 ||
            syncing
          }
          style={{
            padding:
              "12px 20px",
            borderRadius: 9,
            border:
              "1px solid #22c55e",

            background:
              rows.length === 0 ||
              syncing
                ? "var(--card)"
                : "#22c55e",

            color:
              rows.length === 0 ||
              syncing
                ? "var(--foreground)"
                : "#050505",

            cursor:
              rows.length === 0 ||
              syncing
                ? "not-allowed"
                : "pointer",

            opacity:
              rows.length === 0 ||
              syncing
                ? 0.4
                : 1,

            fontWeight: 900,
            fontSize: 14,
          }}
        >
          {syncing
            ? "Invio in corso..."
            : "Salva CARICO"}
        </button>
      </div>

      {pendingCaricoBatches >
        0 &&
        !syncing && (
          <div
            style={{
              marginTop: 14,
            }}
          >
            <button
              type="button"
              onClick={() =>
                syncPendingCarichi()
              }
              style={{
                padding:
                  "9px 13px",
                borderRadius: 8,
                border:
                  "1px solid rgba(245,158,11,0.45)",
                background:
                  "rgba(245,158,11,0.08)",
                color:
                  "var(--foreground)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 850,
              }}
            >
              ↻ Riprova invio CARICHI in attesa
            </button>
          </div>
        )}

      {message && (
        <div
          style={{
            marginTop: 18,
            padding:
              "13px 15px",
            border:
              "1px solid var(--border-color)",
            borderRadius: 10,
            background:
              "var(--card)",
            fontSize: 13,
            fontWeight: 750,
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  warning = false,
}: {
  title: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div
      style={{
        padding: 16,

        border:
          warning
            ? "1px solid rgba(239,68,68,0.35)"
            : "1px solid var(--border-color)",

        borderRadius: 11,

        background:
          warning
            ? "rgba(239,68,68,0.07)"
            : "var(--card)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform:
            "uppercase",
          letterSpacing: 0.7,
          opacity: 0.55,
          fontWeight: 800,
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: 5,
          fontSize: 25,
          fontWeight: 950,
        }}
      >
        {value}
      </div>
    </div>
  );
}

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

const headerStyle = {
  padding:
    "13px 15px",

  textAlign:
    "left" as const,

  fontSize: 11,

  fontWeight: 850,

  textTransform:
    "uppercase" as const,

  letterSpacing: 0.5,

  opacity: 0.6,

  background:
    "var(--table-head)",

  whiteSpace:
    "nowrap" as const,
};

const headerRightStyle = {
  ...headerStyle,

  textAlign:
    "right" as const,
};

const cellStyle = {
  padding:
    "12px 15px",

  fontSize: 14,

  verticalAlign:
    "middle" as const,
};

const rightCellStyle = {
  ...cellStyle,

  textAlign:
    "right" as const,
};

const secondaryButtonStyle = {
  padding:
    "10px 14px",

  borderRadius: 8,

  border:
    "1px solid var(--border-color)",

  background:
    "var(--input-bg)",

  color:
    "var(--foreground)",

  cursor: "pointer",

  fontWeight: 800,
};