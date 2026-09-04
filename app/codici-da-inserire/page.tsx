"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { jsPDF } from "jspdf";
import { supabase } from "../../lib/supabaseClient";

type MissingRow = {
  id: string;
  movement_date: string;
  movement_type: "CARICO" | "SCARICO";
  code: string;
  qty: number;
  created_at: string;
  resolved: boolean;
};

type GroupedCode = {
  code: string;
  totalQty: number;
  occurrences: number;
  lastDate: string;
  types: string[];
};

export default function CodiciDaInserirePage() {
  const [rows, setRows] =
    useState<MissingRow[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [message, setMessage] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [resolvingCode, setResolvingCode] =
    useState("");

  const loadMissingCodes =
    useCallback(async () => {
      setLoading(true);
      setMessage("");

      try {
        const {
          data,
          error,
        } = await supabase
          .from(
            "movement_batch_rows"
          )
          .select(
            `
              id,
              movement_date,
              movement_type,
              code,
              qty,
              created_at,
              resolved
            `
          )
          .eq(
            "result",
            "MISSING"
          )
          .eq(
            "resolved",
            false
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          );

        if (error) {
          throw new Error(
            error.message
          );
        }

        const cleanRows:
          MissingRow[] =
          (data || []).map(
            (row) => ({
              id:
                String(
                  row.id
                ),

              movement_date:
                String(
                  row.movement_date ||
                    ""
                ),

              movement_type:
                row.movement_type ===
                "SCARICO"
                  ? "SCARICO"
                  : "CARICO",

              code:
                String(
                  row.code ||
                    ""
                ),

              qty:
                Number(
                  row.qty ||
                    0
                ),

              created_at:
                String(
                  row.created_at ||
                    ""
                ),

              resolved:
                Boolean(
                  row.resolved
                ),
            })
          );

        setRows(
          cleanRows
        );
      } catch (error) {
        console.error(
          error
        );

        setMessage(
          "Errore durante il caricamento dei codici da inserire."
        );
      } finally {
        setLoading(
          false
        );
      }
    }, []);

  useEffect(() => {
    loadMissingCodes();
  }, [loadMissingCodes]);

  /*
    RAGGRUPPA LO STESSO CODICE

    Esempio:
    codice 123 trovato 3 volte
    non viene mostrato in 3 righe,
    ma in una sola riga.
  */
  const groupedCodes =
    useMemo(() => {
      const map =
        new Map<
          string,
          GroupedCode
        >();

      rows.forEach(
        (row) => {
          const cleanCode =
            row.code.trim();

          if (
            !cleanCode
          ) {
            return;
          }

          const key =
            cleanCode.toLowerCase();

          const existing =
            map.get(
              key
            );

          if (
            existing
          ) {
            existing.totalQty +=
              row.qty;

            existing.occurrences +=
              1;

            if (
              !existing.types.includes(
                row.movement_type
              )
            ) {
              existing.types.push(
                row.movement_type
              );
            }

            if (
              row.movement_date >
              existing.lastDate
            ) {
              existing.lastDate =
                row.movement_date;
            }
          } else {
            map.set(
              key,
              {
                code:
                  cleanCode,

                totalQty:
                  row.qty,

                occurrences:
                  1,

                lastDate:
                  row.movement_date,

                types: [
                  row.movement_type,
                ],
              }
            );
          }
        }
      );

      return Array.from(
        map.values()
      ).sort(
        (a, b) =>
          b.lastDate.localeCompare(
            a.lastDate
          )
      );
    }, [rows]);

  const filteredCodes =
    useMemo(() => {
      const text =
        search
          .trim()
          .toLowerCase();

      if (!text) {
        return groupedCodes;
      }

      return groupedCodes.filter(
        (item) =>
          item.code
            .toLowerCase()
            .includes(
              text
            ) ||
          item.types
            .join(" ")
            .toLowerCase()
            .includes(
              text
            )
      );
    }, [
      groupedCodes,
      search,
    ]);

  const totalPieces =
    useMemo(() => {
      return groupedCodes.reduce(
        (sum, item) =>
          sum +
          item.totalQty,
        0
      );
    }, [groupedCodes]);

  /*
    SEGNA COME RISOLTO

    Vengono risolti tutti i MISSING
    ancora aperti con lo stesso codice.
  */
  async function resolveCode(
    code: string
  ) {
    const confirmed =
      window.confirm(
        `Hai inserito nel magazzino il codice scanner:\n\n${code}\n\n` +
          `Vuoi segnarlo come risolto?`
      );

    if (
      !confirmed
    ) {
      return;
    }

    setResolvingCode(
      code
    );

    setMessage("");

    try {
      const {
        error,
      } = await supabase
        .from(
          "movement_batch_rows"
        )
        .update({
          resolved:
            true,

          resolved_at:
            new Date().toISOString(),
        })
        .eq(
          "result",
          "MISSING"
        )
        .eq(
          "resolved",
          false
        )
        .eq(
          "code",
          code
        );

      if (error) {
        throw new Error(
          error.message
        );
      }

      setMessage(
        `✓ Codice ${code} segnato come risolto.`
      );

      await loadMissingCodes();
    } catch (error) {
      console.error(
        error
      );

      setMessage(
        "Errore durante l'aggiornamento del codice."
      );
    } finally {
      setResolvingCode(
        ""
      );
    }
  }

  /*
    GENERA PDF
  */
  function generatePdf() {
    if (
      groupedCodes.length ===
      0
    ) {
      setMessage(
        "Non ci sono codici da inserire."
      );

      return;
    }

    const pdf =
      new jsPDF({
        orientation:
          "landscape",

        unit:
          "mm",

        format:
          "a4",
      });

    const pageWidth =
      pdf.internal.pageSize.getWidth();

    const pageHeight =
      pdf.internal.pageSize.getHeight();

    const margin =
      12;

    const bottomMargin =
      15;

    let y =
      18;

    pdf.setFont(
      "helvetica",
      "bold"
    );

    pdf.setFontSize(
      18
    );

    pdf.text(
      "CODICI DA INSERIRE",
      margin,
      y
    );

    y +=
      7;

    pdf.setFont(
      "helvetica",
      "normal"
    );

    pdf.setFontSize(
      9
    );

    pdf.text(
      `Generato il ${formatDateTime(
        new Date().toISOString()
      )}`,
      margin,
      y
    );

    pdf.text(
      `Codici: ${groupedCodes.length}   Quantità totale rilevata: ${totalPieces}`,
      margin,
      y + 5
    );

    y +=
      15;

    const columns = {
      marker:
        margin,

      code:
        margin + 8,

      date:
        margin + 82,

      type:
        margin + 120,

      qty:
        margin + 165,

      occurrences:
        margin + 195,
    };

    function drawHeader() {
      pdf.setFont(
        "helvetica",
        "bold"
      );

      pdf.setFontSize(
        8
      );

      pdf.text(
        "",
        columns.marker,
        y
      );

      pdf.text(
        "CODICE SCANNER",
        columns.code,
        y
      );

      pdf.text(
        "ULTIMO RILEVAMENTO",
        columns.date,
        y
      );

      pdf.text(
        "TIPO",
        columns.type,
        y
      );

      pdf.text(
        "QTA TOTALE",
        columns.qty,
        y
      );

      pdf.text(
        "RILEVAMENTI",
        columns.occurrences,
        y
      );

      y +=
        3;

      pdf.line(
        margin,
        y,
        pageWidth -
          margin,
        y
      );

      y +=
        6;
    }

    drawHeader();

    pdf.setFont(
      "helvetica",
      "normal"
    );

    pdf.setFontSize(
      9
    );

    groupedCodes.forEach(
      (item) => {
        if (
          y >
          pageHeight -
            bottomMargin
        ) {
          pdf.addPage();

          y =
            18;

          drawHeader();

          pdf.setFont(
            "helvetica",
            "normal"
          );

          pdf.setFontSize(
            9
          );
        }

        /*
          PALLINO PIENO:
          codice da inserire.
        */
        pdf.circle(
          columns.marker +
            1.5,
          y - 1.1,
          1.4,
          "F"
        );

        pdf.text(
          item.code,
          columns.code,
          y
        );

        pdf.text(
          displayDate(
            item.lastDate
          ),
          columns.date,
          y
        );

        pdf.text(
          item.types.join(
            " / "
          ),
          columns.type,
          y
        );

        pdf.text(
          String(
            item.totalQty
          ),
          columns.qty,
          y
        );

        pdf.text(
          String(
            item.occurrences
          ),
          columns.occurrences,
          y
        );

        y +=
          7;
      }
    );

    const today =
      currentLocalDate()
        .split("-")
        .reverse()
        .join("-");

    pdf.save(
      `Codici da inserire ${today}.pdf`
    );
  }

  return (
    <div
      style={{
        width:
          "100%",

        maxWidth:
          1500,

        margin:
          "0 auto",

        padding:
          "30px 22px 50px",
      }}
    >
      {/* TESTATA */}

      <div
        style={{
          display:
            "flex",

          justifyContent:
            "space-between",

          alignItems:
            "flex-start",

          gap:
            20,

          flexWrap:
            "wrap",

          marginBottom:
            24,
        }}
      >
        <div>
          <div
            style={{
              fontSize:
                12,

              fontWeight:
                850,

              letterSpacing:
                1.2,

              opacity:
                0.5,

              textTransform:
                "uppercase",

              marginBottom:
                5,
            }}
          >
            Magazzino
          </div>

          <h1
            style={{
              margin:
                0,

              fontSize:
                36,

              fontWeight:
                950,
            }}
          >
            Codici da inserire
          </h1>

          <div
            style={{
              marginTop:
                7,

              fontSize:
                14,

              opacity:
                0.6,
            }}
          >
            Codici scanner rilevati durante CARICO o SCARICO
            ma non presenti nel magazzino.
          </div>
        </div>

        <button
          type="button"
          onClick={
            generatePdf
          }
          disabled={
            groupedCodes.length ===
            0
          }
          style={{
            padding:
              "12px 18px",

            borderRadius:
              9,

            border:
              "1px solid var(--foreground)",

            background:
              groupedCodes.length ===
              0
                ? "var(--card)"
                : "var(--foreground)",

            color:
              groupedCodes.length ===
              0
                ? "var(--foreground)"
                : "var(--background)",

            opacity:
              groupedCodes.length ===
              0
                ? 0.4
                : 1,

            cursor:
              groupedCodes.length ===
              0
                ? "not-allowed"
                : "pointer",

            fontWeight:
              900,
          }}
        >
          PDF codici da inserire
        </button>
      </div>

      {/* RIEPILOGO */}

      <div
        style={{
          display:
            "grid",

          gridTemplateColumns:
            "repeat(auto-fit, minmax(200px, 1fr))",

          gap:
            12,

          marginBottom:
            20,
        }}
      >
        <SummaryCard
          title="Codici da inserire"
          value={
            groupedCodes.length
          }
        />

        <SummaryCard
          title="Quantità rilevata"
          value={
            totalPieces
          }
        />

        <SummaryCard
          title="Rilevamenti"
          value={
            rows.length
          }
        />
      </div>

      {/* RICERCA */}

      <div
        style={{
          marginBottom:
            18,

          padding:
            14,

          border:
            "1px solid var(--border-color)",

          borderRadius:
            12,

          background:
            "var(--card)",
        }}
      >
        <input
          value={
            search
          }
          onChange={(
            event
          ) =>
            setSearch(
              event.target.value
            )
          }
          placeholder="Cerca codice scanner..."
          style={{
            width:
              "100%",

            boxSizing:
              "border-box",

            padding:
              "13px 15px",

            borderRadius:
              9,

            border:
              "1px solid var(--border-color)",

            background:
              "var(--input-bg)",

            color:
              "var(--foreground)",

            fontSize:
              15,

            fontWeight:
              700,

            outline:
              "none",
          }}
        />
      </div>

      {message && (
        <div
          style={{
            marginBottom:
              18,

            padding:
              "12px 15px",

            borderRadius:
              9,

            border:
              "1px solid var(--border-color)",

            background:
              "var(--card)",

            fontSize:
              13,

            fontWeight:
              750,
          }}
        >
          {message}
        </div>
      )}

      {/* TABELLA */}

      <div
        style={{
          border:
            "1px solid var(--border-color)",

          borderRadius:
            14,

          overflow:
            "hidden",

          background:
            "var(--card)",
        }}
      >
        <div
          style={{
            padding:
              "15px 17px",

            borderBottom:
              "1px solid var(--border-color)",

            background:
              "var(--table-head)",

            fontSize:
              17,

            fontWeight:
              900,
          }}
        >
          Da sistemare
        </div>

        <div
          style={{
            overflowX:
              "auto",
          }}
        >
          <table
            style={{
              width:
                "100%",

              minWidth:
                950,

              borderCollapse:
                "collapse",
            }}
          >
            <thead>
              <tr>
                <th style={headerStyle}>
                  Codice scanner
                </th>

                <th style={headerStyle}>
                  Ultimo rilevamento
                </th>

                <th style={headerStyle}>
                  Tipo
                </th>

                <th style={headerRightStyle}>
                  Quantità
                </th>

                <th style={headerRightStyle}>
                  Rilevamenti
                </th>

                <th style={headerRightStyle}>
                  Azione
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={
                      6
                    }
                    style={
                      emptyStyle
                    }
                  >
                    Caricamento...
                  </td>
                </tr>
              ) : filteredCodes.length ===
                0 ? (
                <tr>
                  <td
                    colSpan={
                      6
                    }
                    style={
                      emptyStyle
                    }
                  >
                    Nessun codice da inserire.
                  </td>
                </tr>
              ) : (
                filteredCodes.map(
                  (
                    item
                  ) => (
                    <tr
                      key={
                        item.code
                      }
                      style={{
                        borderBottom:
                          "1px solid var(--border-color)",
                      }}
                    >
                      <td
                        style={
                          cellStyle
                        }
                      >
                        <div
                          style={{
                            display:
                              "flex",

                            alignItems:
                              "center",

                            gap:
                              10,
                          }}
                        >
                          <div
                            style={{
                              width:
                                9,

                              height:
                                9,

                              borderRadius:
                                "50%",

                              background:
                                "#ef4444",

                              flexShrink:
                                0,
                            }}
                          />

                          <strong
                            style={{
                              fontFamily:
                                "monospace",

                              fontSize:
                                15,
                            }}
                          >
                            {
                              item.code
                            }
                          </strong>
                        </div>
                      </td>

                      <td
                        style={
                          cellStyle
                        }
                      >
                        {displayDate(
                          item.lastDate
                        )}
                      </td>

                      <td
                        style={
                          cellStyle
                        }
                      >
                        {item.types.map(
                          (
                            type
                          ) => (
                            <MovementBadge
                              key={
                                type
                              }
                              type={
                                type
                              }
                            />
                          )
                        )}
                      </td>

                      <td
                        style={
                          rightCellStyle
                        }
                      >
                        <strong>
                          {
                            item.totalQty
                          }
                        </strong>
                      </td>

                      <td
                        style={
                          rightCellStyle
                        }
                      >
                        {
                          item.occurrences
                        }
                      </td>

                      <td
                        style={
                          rightCellStyle
                        }
                      >
                        <button
                          type="button"
                          disabled={
                            resolvingCode ===
                            item.code
                          }
                          onClick={() =>
                            resolveCode(
                              item.code
                            )
                          }
                          style={{
                            padding:
                              "8px 11px",

                            borderRadius:
                              8,

                            border:
                              "1px solid rgba(34,197,94,0.45)",

                            background:
                              "rgba(34,197,94,0.09)",

                            color:
                              "var(--foreground)",

                            cursor:
                              resolvingCode ===
                              item.code
                                ? "not-allowed"
                                : "pointer",

                            opacity:
                              resolvingCode ===
                              item.code
                                ? 0.5
                                : 1,

                            fontWeight:
                              850,

                            fontSize:
                              12,
                          }}
                        >
                          {resolvingCode ===
                          item.code
                            ? "Aggiornamento..."
                            : "✓ Segna risolto"}
                        </button>
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

function MovementBadge({
  type,
}: {
  type: string;
}) {
  const isCarico =
    type ===
    "CARICO";

  return (
    <span
      style={{
        display:
          "inline-block",

        marginRight:
          6,

        padding:
          "5px 8px",

        borderRadius:
          999,

        border:
          isCarico
            ? "1px solid rgba(34,197,94,0.35)"
            : "1px solid rgba(239,68,68,0.35)",

        background:
          isCarico
            ? "rgba(34,197,94,0.08)"
            : "rgba(239,68,68,0.08)",

        fontSize:
          10,

        fontWeight:
          900,
      }}
    >
      {type}
    </span>
  );
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div
      style={{
        padding:
          16,

        border:
          "1px solid var(--border-color)",

        borderRadius:
          11,

        background:
          "var(--card)",
      }}
    >
      <div
        style={{
          fontSize:
            11,

          textTransform:
            "uppercase",

          letterSpacing:
            0.7,

          opacity:
            0.55,

          fontWeight:
            800,
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop:
            5,

          fontSize:
            25,

          fontWeight:
            950,
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
      now.getMonth() +
        1
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
    value.split(
      "-"
    );

  if (
    parts.length !==
    3
  ) {
    return value;
  }

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatDateTime(
  value: string
) {
  try {
    return new Intl.DateTimeFormat(
      "it-IT",
      {
        day:
          "2-digit",

        month:
          "2-digit",

        year:
          "numeric",

        hour:
          "2-digit",

        minute:
          "2-digit",
      }
    ).format(
      new Date(
        value
      )
    );
  } catch {
    return value;
  }
}

const headerStyle = {
  padding:
    "13px 15px",

  textAlign:
    "left" as const,

  fontSize:
    11,

  fontWeight:
    850,

  textTransform:
    "uppercase" as const,

  letterSpacing:
    0.5,

  opacity:
    0.6,

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
    "13px 15px",

  fontSize:
    14,

  verticalAlign:
    "middle" as const,
};

const rightCellStyle = {
  ...cellStyle,

  textAlign:
    "right" as const,
};

const emptyStyle = {
  padding:
    45,

  textAlign:
    "center" as const,

  opacity:
    0.5,

  fontSize:
    14,
};