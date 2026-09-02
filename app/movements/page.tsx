"use client";

import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { jsPDF } from "jspdf";

type MovementRow = {
  date: string;
  movement: "CARICO" | "SCARICO";
  code: string;
  qty: number;
};

type MissingRow = {
  date: string;
  movement: string;
  code: string;
  qty: number;
};

type InsufficientRow = {
  date: string;
  movement: string;
  code: string;
  qty: number;
  stock: number;
};

type LowStockItem = {
  id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  stock: number;
  supplier_id: string | null;
};

type Supplier = {
  id: string;
  name: string;
};

type SaveResult = {
  processed: number;
  missing: number;
  insufficient: number;
  lowStock: number;
};

function convertDate(value: string) {
  const clean = value.trim();

  const italian = clean.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );

  if (italian) {
    const day = italian[1].padStart(2, "0");
    const month = italian[2].padStart(2, "0");
    const year = italian[3];

    return `${year}-${month}-${day}`;
  }

  const iso = clean.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (iso) {
    return clean;
  }

  return null;
}

function displayDate(value: string) {
  if (!value) return "";

  const parts = value.split("-");

  if (parts.length !== 3) {
    return value;
  }

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function currentDateForFilename() {
  const now = new Date();

  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();

  return `${year}-${month}-${day}`;
}

export default function MovementsPage() {
  const [pasteText, setPasteText] = useState("");
  const [rows, setRows] = useState<MovementRow[]>([]);

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [missingCodes, setMissingCodes] =
    useState<MissingRow[]>([]);

  const [insufficientRows, setInsufficientRows] =
    useState<InsufficientRow[]>([]);

  const [lowStockItems, setLowStockItems] =
    useState<
      Array<
        LowStockItem & {
          supplier_name: string;
        }
      >
    >([]);

  const [saveResult, setSaveResult] =
    useState<SaveResult | null>(null);

  const summary = useMemo(() => {
    const carichi = rows.filter(
      (row) => row.movement === "CARICO"
    );

    const scarichi = rows.filter(
      (row) => row.movement === "SCARICO"
    );

    const quantitaCarico = carichi.reduce(
      (sum, row) => sum + row.qty,
      0
    );

    const quantitaScarico = scarichi.reduce(
      (sum, row) => sum + row.qty,
      0
    );

    return {
      total: rows.length,
      carichi: carichi.length,
      scarichi: scarichi.length,
      quantitaTotale:
        quantitaCarico + quantitaScarico,
    };
  }, [rows]);

  function parseText(text: string) {
    setMessage("");
    setSaveResult(null);

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const parsed: MovementRow[] = [];
    const errors: string[] = [];

    lines.forEach((line, index) => {
      let columns: string[];

      if (line.includes("\t")) {
        columns = line.split("\t");
      } else if (line.includes(";")) {
        columns = line.split(";");
      } else {
        columns = line.split(/\s+/);
      }

      columns = columns.map((value) => value.trim());

      if (columns.length < 4) {
        errors.push(
          `Riga ${index + 1}: servono Data, Movimento, Codice e Quantità`
        );
        return;
      }

      const rawDate = columns[0];
      const rawMovement = columns[1].toUpperCase();
      const rawCode = columns[2];

      const rawQty = columns[3]
        .replace(",", ".")
        .trim();

      if (
        rawDate.toLowerCase() === "data" ||
        rawMovement === "MOVIMENTO"
      ) {
        return;
      }

      const date = convertDate(rawDate);

      if (!date) {
        errors.push(
          `Riga ${index + 1}: data non valida (${rawDate})`
        );
        return;
      }

      if (
        rawMovement !== "CARICO" &&
        rawMovement !== "SCARICO"
      ) {
        errors.push(
          `Riga ${index + 1}: usare CARICO oppure SCARICO`
        );
        return;
      }

      if (!rawCode) {
        errors.push(
          `Riga ${index + 1}: codice mancante`
        );
        return;
      }

      const qty = Number(rawQty);

      if (!Number.isFinite(qty) || qty <= 0) {
        errors.push(
          `Riga ${index + 1}: quantità non valida`
        );
        return;
      }

      parsed.push({
        date,
        movement:
          rawMovement as "CARICO" | "SCARICO",
        code: rawCode,
        qty,
      });
    });

    setRows(parsed);

    setMissingCodes([]);
    setInsufficientRows([]);
    setLowStockItems([]);

    if (errors.length > 0) {
      setMessage(errors.join(" | "));
      return;
    }

    if (parsed.length === 0) {
      setMessage("Nessun movimento trovato.");
      return;
    }

    setMessage(
      `${parsed.length} movimenti pronti per il salvataggio.`
    );
  }

  function handlePasteChange(value: string) {
    setPasteText(value);
    parseText(value);
  }

  function clearAll() {
    setPasteText("");
    setRows([]);
    setMessage("");
    setMissingCodes([]);
    setInsufficientRows([]);
    setLowStockItems([]);
    setSaveResult(null);
  }

  function createMissingCodesPdf(
    missing: MissingRow[]
  ) {
    if (missing.length === 0) {
      return;
    }

    const pdf = new jsPDF();

    pdf.setFontSize(18);
    pdf.text("Codici scanner non esistenti", 14, 18);

    pdf.setFontSize(10);
    pdf.text(
      `Generato il ${new Date().toLocaleString("it-IT")}`,
      14,
      26
    );

    let y = 38;

    pdf.text("Data", 14, y);
    pdf.text("Movimento", 45, y);
    pdf.text("Codice scanner", 85, y);
    pdf.text("Quantita", 150, y);

    y += 6;
    pdf.line(14, y, 195, y);
    y += 7;

    const uniqueRows = Array.from(
      new Map(
        missing.map((row) => [
          `${row.code}-${row.movement}-${row.date}`,
          row,
        ])
      ).values()
    );

    uniqueRows.forEach((row) => {
      if (y > 280) {
        pdf.addPage();
        y = 20;
      }

      pdf.text(displayDate(row.date), 14, y);
      pdf.text(row.movement, 45, y);
      pdf.text(row.code, 85, y);
      pdf.text(String(row.qty), 150, y);

      y += 7;
    });

    pdf.save(
      `codici_non_esistenti_${currentDateForFilename()}.pdf`
    );
  }

  function createLowStockPdf(
    items: Array<
      LowStockItem & {
        supplier_name: string;
      }
    >
  ) {
    if (items.length === 0) {
      return;
    }

    const pdf = new jsPDF({
      orientation: "landscape",
    });

    pdf.setFontSize(18);

    pdf.text(
      "Articoli con giacenza minore o uguale a 5",
      14,
      18
    );

    pdf.setFontSize(10);

    pdf.text(
      `Generato il ${new Date().toLocaleString("it-IT")}`,
      14,
      26
    );

    let y = 38;

    pdf.text("Fornitore", 14, y);
    pdf.text("Cod. fornitore", 60, y);
    pdf.text("Cod. scanner", 105, y);
    pdf.text("Descrizione", 150, y);
    pdf.text("Giacenza", 260, y);

    y += 6;
    pdf.line(14, y, 282, y);
    y += 7;

    items.forEach((item) => {
      if (y > 190) {
        pdf.addPage();
        y = 20;
      }

      const description =
        item.description.length > 40
          ? item.description.substring(0, 40) + "..."
          : item.description;

      pdf.text(
        item.supplier_name || "-",
        14,
        y
      );

      pdf.text(
        item.supplier_code || "-",
        60,
        y
      );

      pdf.text(
        item.code || "-",
        105,
        y
      );

      pdf.text(
        description || "-",
        150,
        y
      );

      pdf.text(
        String(item.stock ?? 0),
        260,
        y
      );

      y += 7;
    });

    pdf.save(
      `scorte_basse_${currentDateForFilename()}.pdf`
    );
  }

  async function loadLowStockItems() {
    const { data: items, error: itemError } =
      await supabase
        .from("items")
        .select(
          "id, code, supplier_code, description, stock, supplier_id"
        )
        .lte("stock", 5)
        .order("stock", {
          ascending: true,
        });

    if (itemError) {
      throw new Error(
        "Errore lettura scorte basse: " +
          itemError.message
      );
    }

    const { data: suppliers, error: supplierError } =
      await supabase
        .from("suppliers")
        .select("id, name");

    if (supplierError) {
      throw new Error(
        "Errore lettura fornitori: " +
          supplierError.message
      );
    }

    const supplierMap = new Map<string, string>();

    (suppliers as Supplier[] | null)?.forEach(
      (supplier) => {
        supplierMap.set(
          supplier.id,
          supplier.name
        );
      }
    );

    const result = (
      (items as LowStockItem[] | null) || []
    ).map((item) => ({
      ...item,

      supplier_name:
        item.supplier_id
          ? supplierMap.get(item.supplier_id) ||
            "Fornitore sconosciuto"
          : "Fornitore sconosciuto",
    }));

    setLowStockItems(result);

    return result;
  }

  async function saveMovements() {
    if (rows.length === 0) {
      setMessage(
        "Non ci sono movimenti da salvare."
      );
      return;
    }

    const confirmed = window.confirm(
      `Confermi il salvataggio di ${rows.length} movimenti?`
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setMessage("");
    setSaveResult(null);

    try {
      const payload = rows.map((row) => ({
        movement_date: row.date,
        movement_type: row.movement,
        code: row.code.trim(),
        qty: row.qty,
      }));

      const { data, error } = await supabase.rpc(
        "process_warehouse_movements",
        {
          p_rows: payload,
        }
      );

      if (error) {
        setMessage(
          "ERRORE: " + error.message
        );
        return;
      }

      const result = data as {
        processed?: number;
        missing?: MissingRow[];
        insufficient?: InsufficientRow[];
      };

      const missing =
        result?.missing || [];

      const insufficient =
        result?.insufficient || [];

      setMissingCodes(missing);
      setInsufficientRows(insufficient);

      const lowStock =
        await loadLowStockItems();

      if (missing.length > 0) {
        createMissingCodesPdf(missing);
      }

      if (lowStock.length > 0) {
        setTimeout(() => {
          createLowStockPdf(lowStock);
        }, 500);
      }

      setSaveResult({
        processed: result?.processed || 0,
        missing: missing.length,
        insufficient: insufficient.length,
        lowStock: lowStock.length,
      });

      setMessage(
        `${result?.processed || 0} movimenti elaborati correttamente.`
      );

      setPasteText("");
      setRows([]);
    } catch (error) {
      if (error instanceof Error) {
        setMessage(error.message);
      } else {
        setMessage(
          "Errore durante il salvataggio."
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1500,
        margin: "0 auto",
      }}
    >
      {/* HEADER */}

      <div
        style={{
          marginBottom: 26,
        }}
      >
        <div
          style={{
            fontSize: 13,
            opacity: 0.55,
            marginBottom: 4,
            textTransform: "uppercase",
            letterSpacing: 1.2,
            fontWeight: 700,
          }}
        >
          Magazzino
        </div>

        <h1
          style={{
            fontSize: 34,
            fontWeight: 800,
            margin: 0,
            letterSpacing: "-0.5px",
          }}
        >
          Movimenti
        </h1>

        <div
          style={{
            marginTop: 6,
            opacity: 0.6,
            fontSize: 14,
          }}
        >
          Incolla i movimenti da Excel e aggiorna automaticamente le giacenze.
        </div>
      </div>

      {/* CARDS */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <SummaryCard
          title="Movimenti pronti"
          value={String(summary.total)}
          subtitle="Righe pronte al salvataggio"
        />

        <SummaryCard
          title="Carichi"
          value={String(summary.carichi)}
          subtitle="Movimenti di entrata"
          tone="success"
        />

        <SummaryCard
          title="Scarichi"
          value={String(summary.scarichi)}
          subtitle="Movimenti di uscita"
          tone="danger"
        />

        <SummaryCard
          title="Quantità totale"
          value={String(summary.quantitaTotale)}
          subtitle="Pezzi presenti nei movimenti"
        />
      </div>

      {/* AREA EXCEL */}

      <div
        style={{
          border:
            "1px solid var(--border-color)",
          background: "var(--card)",
          borderRadius: 12,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 17,
              }}
            >
              Incolla da Excel
            </div>

            <div
              style={{
                fontSize: 13,
                opacity: 0.6,
                marginTop: 4,
              }}
            >
              Ordine colonne: Data · Movimento · Codice scanner · Quantità
            </div>
          </div>

          <div
            style={{
              fontSize: 12,
              opacity: 0.55,
              padding: "6px 10px",
              border:
                "1px solid var(--border-color)",
              borderRadius: 20,
              whiteSpace: "nowrap",
            }}
          >
            CTRL + C da Excel → CTRL + V qui
          </div>
        </div>

        <textarea
          value={pasteText}
          onChange={(e) =>
            handlePasteChange(e.target.value)
          }
          placeholder={
            "02/09/2026\tCARICO\t010101\t12\n02/09/2026\tSCARICO\t020202\t3"
          }
          style={{
            width: "100%",
            minHeight: 170,
            padding: 15,
            resize: "vertical",
            boxSizing: "border-box",

            background:
              "var(--input-bg)",
            color:
              "var(--foreground)",

            border:
              "1px solid var(--border-color)",

            borderRadius: 9,

            fontFamily: "monospace",
            fontSize: 14,
            lineHeight: 1.6,
            outline: "none",
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 14,
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
              onClick={() =>
                parseText(pasteText)
              }
              style={secondaryButton}
            >
              Controlla dati
            </button>

            <button
              type="button"
              onClick={clearAll}
              style={secondaryButton}
            >
              Pulisci
            </button>
          </div>

          <button
            type="button"
            onClick={saveMovements}
            disabled={
              saving ||
              rows.length === 0
            }
            style={{
              padding: "12px 20px",
              border:
                "1px solid var(--foreground)",
              borderRadius: 8,

              background:
                rows.length === 0
                  ? "var(--card-2)"
                  : "var(--foreground)",

              color:
                rows.length === 0
                  ? "var(--foreground)"
                  : "var(--background)",

              cursor:
                saving ||
                rows.length === 0
                  ? "not-allowed"
                  : "pointer",

              opacity:
                saving ||
                rows.length === 0
                  ? 0.45
                  : 1,

              fontWeight: 800,
              fontSize: 14,
            }}
          >
            {saving
              ? "Salvataggio..."
              : `Salva movimenti (${rows.length})`}
          </button>
        </div>
      </div>

      {/* MESSAGGIO */}

      {message && (
        <div
          style={{
            border:
              message.startsWith("ERRORE")
                ? "1px solid rgba(239,68,68,0.5)"
                : "1px solid var(--border-color)",

            borderRadius: 10,
            padding: "12px 14px",
            marginBottom: 18,

            background:
              message.startsWith("ERRORE")
                ? "rgba(239,68,68,0.08)"
                : "var(--card)",

            fontSize: 14,
          }}
        >
          {message}
        </div>
      )}

      {/* RISULTATO SALVATAGGIO */}

      {saveResult && (
        <div
          style={{
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 13,
              opacity: 0.55,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            Risultato ultimo salvataggio
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            <ResultCard
              title="Eseguiti"
              value={saveResult.processed}
              tone="success"
            />

            <ResultCard
              title="Codici inesistenti"
              value={saveResult.missing}
              tone={
                saveResult.missing > 0
                  ? "danger"
                  : "normal"
              }
            />

            <ResultCard
              title="Scarichi bloccati"
              value={saveResult.insufficient}
              tone={
                saveResult.insufficient > 0
                  ? "danger"
                  : "normal"
              }
            />

            <ResultCard
              title="Giacenza ≤ 5"
              value={saveResult.lowStock}
              tone={
                saveResult.lowStock > 0
                  ? "warning"
                  : "normal"
              }
            />
          </div>
        </div>
      )}

      {/* PDF */}

      {(missingCodes.length > 0 ||
        lowStockItems.length > 0) && (
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",

            padding: 14,
            marginBottom: 20,

            background: "var(--card)",
            border:
              "1px solid var(--border-color)",
            borderRadius: 12,
          }}
        >
          <div
            style={{
              width: "100%",
              fontSize: 13,
              opacity: 0.6,
              marginBottom: 2,
            }}
          >
            Report disponibili
          </div>

          {missingCodes.length > 0 && (
            <button
              type="button"
              onClick={() =>
                createMissingCodesPdf(
                  missingCodes
                )
              }
              style={secondaryButton}
            >
              PDF codici inesistenti
            </button>
          )}

          {lowStockItems.length > 0 && (
            <button
              type="button"
              onClick={() =>
                createLowStockPdf(
                  lowStockItems
                )
              }
              style={secondaryButton}
            >
              PDF scorte ≤ 5
            </button>
          )}
        </div>
      )}

      {/* ANTEPRIMA */}

      <div
        style={{
          border:
            "1px solid var(--border-color)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--card)",
        }}
      >
        <div
          style={{
            padding: "15px 18px",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            background:
              "var(--table-head)",
            borderBottom:
              "1px solid var(--border-color)",
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 800,
              }}
            >
              Anteprima movimenti
            </div>

            <div
              style={{
                marginTop: 2,
                fontSize: 12,
                opacity: 0.55,
              }}
            >
              Controlla i dati prima del salvataggio
            </div>
          </div>

          <span
            style={{
              minWidth: 30,
              padding: "5px 9px",
              textAlign: "center",
              borderRadius: 20,
              background:
                "var(--input-bg)",
              border:
                "1px solid var(--border-color)",
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            {rows.length}
          </span>
        </div>

        <div
          style={{
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse:
                "collapse",
              minWidth: 760,
            }}
          >
            <thead>
              <tr>
                <th style={headerStyle}>
                  Data
                </th>

                <th style={headerStyle}>
                  Movimento
                </th>

                <th style={headerStyle}>
                  Codice scanner
                </th>

                <th style={headerRightStyle}>
                  Quantità
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={emptyStyle}
                  >
                    Incolla i movimenti da Excel per visualizzare l'anteprima.
                  </td>
                </tr>
              ) : (
                rows.map(
                  (row, index) => (
                    <tr
                      key={`${row.code}-${index}`}
                      style={{
                        borderBottom:
                          "1px solid var(--border-color)",
                      }}
                    >
                      <td style={cellStyle}>
                        {displayDate(
                          row.date
                        )}
                      </td>

                      <td style={cellStyle}>
                        <MovementBadge
                          movement={
                            row.movement
                          }
                        />
                      </td>

                      <td style={cellStyle}>
                        <span
                          style={{
                            display:
                              "inline-block",
                            fontFamily:
                              "monospace",
                            padding:
                              "4px 7px",
                            borderRadius: 5,
                            border:
                              "1px solid var(--border-color)",
                            background:
                              "var(--input-bg)",
                            fontSize: 13,
                          }}
                        >
                          {row.code}
                        </span>
                      </td>

                      <td
                        style={
                          rightCellStyle
                        }
                      >
                        <strong>
                          {row.qty}
                        </strong>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* COMPONENTI */

function SummaryCard({
  title,
  value,
  subtitle,
  tone = "normal",
}: {
  title: string;
  value: string;
  subtitle: string;
  tone?: "normal" | "success" | "danger";
}) {
  let background = "var(--card)";
  let border =
    "1px solid var(--border-color)";

  if (tone === "success") {
    background =
      "rgba(34,197,94,0.07)";
    border =
      "1px solid rgba(34,197,94,0.25)";
  }

  if (tone === "danger") {
    background =
      "rgba(239,68,68,0.07)";
    border =
      "1px solid rgba(239,68,68,0.25)";
  }

  return (
    <div
      style={{
        padding: 18,
        border,
        borderRadius: 12,
        background,
      }}
    >
      <div
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontWeight: 700,
          opacity: 0.55,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: 27,
          fontWeight: 850,
          marginTop: 7,
        }}
      >
        {value}
      </div>

      <div
        style={{
          fontSize: 12,
          opacity: 0.55,
          marginTop: 4,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

function ResultCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;
  tone:
    | "normal"
    | "success"
    | "danger"
    | "warning";
}) {
  let background = "var(--card)";
  let border =
    "1px solid var(--border-color)";

  if (tone === "success") {
    background =
      "rgba(34,197,94,0.08)";
    border =
      "1px solid rgba(34,197,94,0.30)";
  }

  if (tone === "danger") {
    background =
      "rgba(239,68,68,0.08)";
    border =
      "1px solid rgba(239,68,68,0.30)";
  }

  if (tone === "warning") {
    background =
      "rgba(245,158,11,0.08)";
    border =
      "1px solid rgba(245,158,11,0.30)";
  }

  return (
    <div
      style={{
        padding: 14,
        background,
        border,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 12,
          opacity: 0.55,
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: 24,
          fontWeight: 850,
          marginTop: 5,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MovementBadge({
  movement,
}: {
  movement: "CARICO" | "SCARICO";
}) {
  const isCarico =
    movement === "CARICO";

  return (
    <span
      style={{
        display: "inline-block",
        padding: "5px 10px",
        borderRadius: 20,

        background: isCarico
          ? "rgba(34,197,94,0.14)"
          : "rgba(239,68,68,0.14)",

        border: isCarico
          ? "1px solid rgba(34,197,94,0.30)"
          : "1px solid rgba(239,68,68,0.30)",

        fontSize: 12,
        fontWeight: 850,
      }}
    >
      {movement}
    </span>
  );
}

/* STILI */

const secondaryButton = {
  padding: "10px 15px",

  border:
    "1px solid var(--border-color)",

  borderRadius: 8,

  background: "var(--input-bg)",
  color: "var(--foreground)",

  cursor: "pointer",
  fontWeight: 700,
};

const headerStyle = {
  padding: "13px 16px",
  textAlign: "left" as const,

  fontSize: 12,
  textTransform:
    "uppercase" as const,
  letterSpacing: 0.5,

  opacity: 0.65,

  background:
    "var(--table-head)",

  borderBottom:
    "1px solid var(--border-color)",

  whiteSpace: "nowrap" as const,
};

const headerRightStyle = {
  ...headerStyle,
  textAlign: "right" as const,
};

const cellStyle = {
  padding: "12px 16px",
  fontSize: 14,
};

const rightCellStyle = {
  ...cellStyle,
  textAlign: "right" as const,
};

const emptyStyle = {
  padding: 42,
  textAlign: "center" as const,
  opacity: 0.5,
};