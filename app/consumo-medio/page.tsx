"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

type ItemRow = {
  id: string;
  code: string;
  supplier_code: string | null;
  description: string | null;
  stock: number;
  supplier_id: string | null;
};

type Supplier = {
  id: string;
  name: string;
};

type ConsumptionSummaryRow = {
  code: string;
  total_qty: number;
  first_movement_date: string | null;
  movement_count: number;
};

type ConsumptionRow = {
  id: string;
  code: string;
  supplierCode: string | null;
  description: string;
  stock: number;
  supplierName: string;
  totalQty: number | null;
  firstMovementDate: string | null;
  movementCount: number;
  monthsElapsed: number | null;
  monthlyAverage: number | null;
};

type SortKey =
  | "monthlyAverage"
  | "totalQty"
  | "stock"
  | "description"
  | "supplierName";

/*
  Mesi trascorsi dal primo scarico (incluso) a oggi (incluso),
  minimo 1 mese anche se il primo e unico scarico e' di questo
  stesso mese.
*/
function monthsElapsedSince(firstDateStr: string) {
  const first = new Date(firstDateStr + "T00:00:00");
  const today = new Date();

  const months =
    (today.getFullYear() - first.getFullYear()) * 12 +
    (today.getMonth() - first.getMonth()) +
    1;

  return Math.max(1, months);
}

export default function AverageConsumptionPage() {
  const [rows, setRows] = useState<ConsumptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("ALL");
  const [onlyWithHistory, setOnlyWithHistory] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("monthlyAverage");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    loadReport();
  }, []);

  async function loadReport() {
    setLoading(true);
    setErrorMessage("");

    const [itemsResult, suppliersResult, consumptionResult] =
      await Promise.all([
        supabase
          .from("items")
          .select("id,code,supplier_code,description,stock,supplier_id")
          .order("description"),
        supabase.from("suppliers").select("id,name").order("name"),
        supabase.rpc("get_item_consumption_summary"),
      ]);

    if (itemsResult.error) {
      setErrorMessage(itemsResult.error.message);
      setLoading(false);
      return;
    }

    if (suppliersResult.error) {
      setErrorMessage(suppliersResult.error.message);
      setLoading(false);
      return;
    }

    if (consumptionResult.error) {
      setErrorMessage(
        "Errore nel calcolo del consumo: " +
          consumptionResult.error.message
      );
      setLoading(false);
      return;
    }

    const items = (itemsResult.data || []) as ItemRow[];
    const suppliers = (suppliersResult.data || []) as Supplier[];

    const consumptionByCode = new Map<string, ConsumptionSummaryRow>();

    ((consumptionResult.data || []) as ConsumptionSummaryRow[]).forEach(
      (row) => {
        if (row.code) {
          consumptionByCode.set(row.code, row);
        }
      }
    );

    const supplierNameById = new Map(
      suppliers.map((supplier) => [supplier.id, supplier.name])
    );

    const builtRows: ConsumptionRow[] = items.map((item) => {
      const consumption = item.code
        ? consumptionByCode.get(item.code)
        : undefined;

      const totalQty = consumption
        ? Number(consumption.total_qty || 0)
        : null;

      const firstMovementDate = consumption
        ? consumption.first_movement_date
        : null;

      const monthsElapsed =
        totalQty !== null && firstMovementDate
          ? monthsElapsedSince(firstMovementDate)
          : null;

      const monthlyAverage =
        totalQty !== null && monthsElapsed
          ? totalQty / monthsElapsed
          : null;

      return {
        id: String(item.id),
        code: item.code || "",
        supplierCode: item.supplier_code || null,
        description: item.description || "Senza descrizione",
        stock: Number(item.stock || 0),
        supplierName: item.supplier_id
          ? supplierNameById.get(item.supplier_id) || "Fornitore sconosciuto"
          : "Fornitore sconosciuto",
        totalQty,
        firstMovementDate,
        movementCount: consumption ? consumption.movement_count : 0,
        monthsElapsed,
        monthlyAverage,
      };
    });

    setRows(builtRows);
    setLoading(false);
  }

  const suppliersInReport = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.supplierName))).sort(
      (a, b) => a.localeCompare(b)
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    const text = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch =
        !text ||
        row.description.toLowerCase().includes(text) ||
        row.code.toLowerCase().includes(text) ||
        (row.supplierCode || "").toLowerCase().includes(text) ||
        row.supplierName.toLowerCase().includes(text);

      const matchesSupplier =
        supplierFilter === "ALL" || row.supplierName === supplierFilter;

      const matchesHistory = !onlyWithHistory || row.totalQty !== null;

      return matchesSearch && matchesSupplier && matchesHistory;
    });
  }, [rows, search, supplierFilter, onlyWithHistory]);

  const sortedRows = useMemo(() => {
    const direction = sortDir === "asc" ? 1 : -1;

    /*
      Confronto scritto con rami espliciti per ogni chiave (invece di
      un accesso generico a[sortKey]) per restare su tipi semplici e
      sicuri: stringa contro stringa, numero contro numero.
    */
    function compareNullableNumbers(
      aValue: number | null,
      bValue: number | null
    ) {
      // Gli articoli senza alcun consumo registrato (null) vanno
      // sempre in fondo, indipendentemente dalla direzione scelta.
      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return 1;
      if (bValue === null) return -1;

      return direction * (aValue - bValue);
    }

    return [...filteredRows].sort((a, b) => {
      if (sortKey === "description") {
        return direction * a.description.localeCompare(b.description, "it");
      }

      if (sortKey === "supplierName") {
        return (
          direction * a.supplierName.localeCompare(b.supplierName, "it")
        );
      }

      if (sortKey === "stock") {
        return direction * (a.stock - b.stock);
      }

      if (sortKey === "totalQty") {
        return compareNullableNumbers(a.totalQty, b.totalQty);
      }

      return compareNullableNumbers(a.monthlyAverage, b.monthlyAverage);
    });
  }, [filteredRows, sortKey, sortDir]);

  const totals = useMemo(() => {
    const withHistory = rows.filter((row) => row.totalQty !== null);

    const totalScaricato = withHistory.reduce(
      (sum, row) => sum + (row.totalQty || 0),
      0
    );

    return {
      totalItems: rows.length,
      withHistory: withHistory.length,
      withoutHistory: rows.length - withHistory.length,
      totalScaricato,
    };
  }, [rows]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function formatNumber(value: number, decimals = 2) {
    return new Intl.NumberFormat("it-IT", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  function formatDate(value: string) {
    return new Date(value + "T00:00:00").toLocaleDateString("it-IT");
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1500,
        margin: "0 auto",
      }}
    >
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
            margin: 0,
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: "-0.5px",
          }}
        >
          Media consumo articoli
        </h1>

        <div
          style={{
            marginTop: 6,
            opacity: 0.6,
            fontSize: 14,
            maxWidth: 760,
          }}
        >
          Media mensile di scarico di ogni articolo, calcolata sullo
          storico dei movimenti (quantità totale scaricata diviso i mesi
          trascorsi dal primo scarico). Sono compresi anche gli articoli
          già completamente scaricati, con giacenza attuale a zero.
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <SummaryCard
          title="Articoli nel catalogo"
          value={String(totals.totalItems)}
          subtitle="Totale articoli analizzati"
        />

        <SummaryCard
          title="Con storico di consumo"
          value={String(totals.withHistory)}
          subtitle="Articoli con almeno uno scarico"
        />

        <SummaryCard
          title="Senza movimenti registrati"
          value={String(totals.withoutHistory)}
          subtitle="Nessuno scarico in archivio"
        />

        <SummaryCard
          title="Totale unità scaricate"
          value={formatNumber(totals.totalScaricato, 0)}
          subtitle="Somma di tutto lo storico scarichi"
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          padding: 14,
          marginBottom: 16,
          background: "var(--card)",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
        }}
      >
        <div
          style={{
            position: "relative",
            flex: "1 1 350px",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 13,
              top: "50%",
              transform: "translateY(-50%)",
              opacity: 0.5,
            }}
          >
            ⌕
          </span>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca fornitore, codice o descrizione..."
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "11px 14px 11px 38px",
              background: "var(--input-bg)",
              color: "var(--foreground)",
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              outline: "none",
              fontSize: 14,
            }}
          />
        </div>

        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          style={{
            minWidth: 220,
            padding: "11px 13px",
            background: "var(--input-bg)",
            color: "var(--foreground)",
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          <option value="ALL">Tutti i fornitori</option>

          {suppliersInReport.map((supplier) => (
            <option key={supplier} value={supplier}>
              {supplier}
            </option>
          ))}
        </select>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 13,
            opacity: 0.8,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={onlyWithHistory}
            onChange={(e) => setOnlyWithHistory(e.target.checked)}
          />
          Solo con storico consumo
        </label>

        <div
          style={{
            fontSize: 13,
            opacity: 0.6,
            padding: "0 5px",
          }}
        >
          {sortedRows.length} risultati
        </div>
      </div>

      {errorMessage && (
        <div
          style={{
            padding: 14,
            marginBottom: 16,
            border: "1px solid rgba(239,68,68,0.5)",
            borderRadius: 10,
            background: "rgba(239,68,68,0.08)",
          }}
        >
          Errore: {errorMessage}
        </div>
      )}

      <div
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--card)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 1250,
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--table-head)",
                }}
              >
                <SortableHeader
                  label="Fornitore"
                  sortKey="supplierName"
                  activeKey={sortKey}
                  dir={sortDir}
                  onClick={toggleSort}
                />

                <th style={headerStyle}>Codice articolo</th>
                <th style={headerStyle}>Codice scanner</th>

                <SortableHeader
                  label="Descrizione"
                  sortKey="description"
                  activeKey={sortKey}
                  dir={sortDir}
                  onClick={toggleSort}
                  align="left"
                />

                <SortableHeader
                  label="Giacenza"
                  sortKey="stock"
                  activeKey={sortKey}
                  dir={sortDir}
                  onClick={toggleSort}
                  align="center"
                />

                <SortableHeader
                  label="Tot. scaricato"
                  sortKey="totalQty"
                  activeKey={sortKey}
                  dir={sortDir}
                  onClick={toggleSort}
                  align="center"
                />

                <th style={headerCenterStyle}>Primo scarico</th>

                <SortableHeader
                  label="Media mensile"
                  sortKey="monthlyAverage"
                  activeKey={sortKey}
                  dir={sortDir}
                  onClick={toggleSort}
                  align="right"
                />
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={emptyStyle}>
                    Caricamento report...
                  </td>
                </tr>
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={emptyStyle}>
                    Nessun articolo trovato con questi criteri.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: "1px solid var(--border-color)",
                    }}
                  >
                    <td style={cellStyle}>
                      <strong>{row.supplierName}</strong>
                    </td>

                    <td style={cellStyle}>
                      <Link
                        href={`/items/${row.id}`}
                        style={{
                          color: "inherit",
                          textDecoration: "none",
                          fontWeight: 750,
                        }}
                      >
                        {row.supplierCode || "-"}
                      </Link>
                    </td>

                    <td style={cellStyle}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: 13,
                          padding: "4px 7px",
                          border: "1px solid var(--border-color)",
                          borderRadius: 5,
                          background: "var(--input-bg)",
                        }}
                      >
                        {row.code || "-"}
                      </span>
                    </td>

                    <td style={cellStyle}>
                      <Link
                        href={`/items/${row.id}`}
                        style={{
                          color: "inherit",
                          textDecoration: "none",
                        }}
                      >
                        {row.description}
                      </Link>
                    </td>

                    <td style={centerCellStyle}>{row.stock}</td>

                    <td style={centerCellStyle}>
                      {row.totalQty !== null ? (
                        formatNumber(row.totalQty, 0)
                      ) : (
                        <span style={{ opacity: 0.4 }}>—</span>
                      )}
                    </td>

                    <td style={centerCellStyle}>
                      {row.firstMovementDate ? (
                        formatDate(row.firstMovementDate)
                      ) : (
                        <span style={{ opacity: 0.4 }}>—</span>
                      )}
                    </td>

                    <td style={rightCellStyle}>
                      {row.monthlyAverage !== null ? (
                        <strong>
                          {formatNumber(row.monthlyAverage)} / mese
                        </strong>
                      ) : (
                        <span style={{ opacity: 0.4 }}>
                          Nessun consumo registrato
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          fontSize: 12,
          opacity: 0.5,
        }}
      >
        Media mensile = quantità totale scaricata (movimenti applicati) ÷
        mesi trascorsi dal primo scarico, incluso il mese in corso (minimo
        1 mese).
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: "asc" | "desc";
  onClick: (key: SortKey) => void;
  align?: "left" | "center" | "right";
}) {
  const isActive = activeKey === sortKey;

  const baseStyle =
    align === "center"
      ? headerCenterStyle
      : align === "right"
      ? headerRightStyle
      : headerStyle;

  return (
    <th
      style={{
        ...baseStyle,
        cursor: "pointer",
        userSelect: "none",
      }}
      onClick={() => onClick(sortKey)}
    >
      {label}
      {isActive ? (dir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        padding: 18,
        border: "1px solid var(--border-color)",
        borderRadius: 12,
        background: "var(--card)",
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
          letterSpacing: "-0.5px",
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

const headerStyle = {
  padding: "13px 14px",
  textAlign: "left" as const,
  fontSize: 12,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  opacity: 0.7,
  borderBottom: "1px solid var(--border-color)",
  whiteSpace: "nowrap" as const,
};

const headerCenterStyle = {
  ...headerStyle,
  textAlign: "center" as const,
};

const headerRightStyle = {
  ...headerStyle,
  textAlign: "right" as const,
};

const cellStyle = {
  padding: "12px 14px",
  fontSize: 14,
};

const centerCellStyle = {
  ...cellStyle,
  textAlign: "center" as const,
};

const rightCellStyle = {
  ...cellStyle,
  textAlign: "right" as const,
  whiteSpace: "nowrap" as const,
};

const emptyStyle = {
  padding: 45,
  textAlign: "center" as const,
  opacity: 0.55,
};
