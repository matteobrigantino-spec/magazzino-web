"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { jsPDF } from "jspdf";

type LowStockItem = {
  id: string;
  code: string | null;
  supplier_code: string | null;
  description: string | null;
  stock: number;
  min_stock: number;
  on_order: number;
  price: number;
  supplier_id: string | null;
  supplier_name: string;
};

type Supplier = {
  id: string;
  name: string;
};

export default function LowStockReportPage() {
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("ALL");

  useEffect(() => {
    loadReport();
  }, []);

  async function loadReport() {
    setLoading(true);
    setErrorMessage("");

    const { data: itemData, error: itemError } = await supabase
      .from("items")
      .select(
        "id, code, supplier_code, description, stock, min_stock, on_order, price, supplier_id"
      )
      .order("stock", { ascending: true });

    if (itemError) {
      setErrorMessage(itemError.message);
      setLoading(false);
      return;
    }

    const { data: supplierData, error: supplierError } = await supabase
      .from("suppliers")
      .select("id, name")
      .order("name");

    if (supplierError) {
      setErrorMessage(supplierError.message);
      setLoading(false);
      return;
    }

    const suppliers = (supplierData || []) as Supplier[];
    const supplierMap = new Map<string, string>();

    suppliers.forEach((supplier) => {
      supplierMap.set(supplier.id, supplier.name);
    });

    const report = (itemData || [])
      .filter((item) => {
        const stock = Number(item.stock ?? 0);
        const minStock = Number(item.min_stock ?? 0);

        return minStock > 0 && stock <= minStock;
      })
      .map((item) => ({
        ...item,
        stock: Number(item.stock ?? 0),
        min_stock: Number(item.min_stock ?? 0),
        on_order: Number(item.on_order ?? 0),
        price: Number(item.price ?? 0),
        supplier_name: item.supplier_id
          ? supplierMap.get(item.supplier_id) || "Fornitore sconosciuto"
          : "Fornitore sconosciuto",
      }));

    setItems(report);
    setLoading(false);
  }

  function getQtyToOrder(item: LowStockItem) {
    return Math.max(
      0,
      Number(item.min_stock) -
        Number(item.stock) -
        Number(item.on_order)
    );
  }

  function getValueToOrder(item: LowStockItem) {
    return getQtyToOrder(item) * Number(item.price);
  }

  const suppliersInReport = useMemo(() => {
    return Array.from(
      new Set(items.map((item) => item.supplier_name))
    ).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    const text = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesSearch =
        !text ||
        item.description?.toLowerCase().includes(text) ||
        item.code?.toLowerCase().includes(text) ||
        item.supplier_code?.toLowerCase().includes(text) ||
        item.supplier_name.toLowerCase().includes(text);

      const matchesSupplier =
        supplierFilter === "ALL" ||
        item.supplier_name === supplierFilter;

      return matchesSearch && matchesSupplier;
    });
  }, [items, search, supplierFilter]);

  const totals = useMemo(() => {
    const totalValueToOrder = items.reduce(
      (sum, item) => sum + getValueToOrder(item),
      0
    );

    const totalArticlesToOrder = items.filter(
      (item) => getQtyToOrder(item) > 0
    ).length;

    const totalArticlesOnOrder = items.filter(
      (item) => Number(item.on_order || 0) > 0
    ).length;

    return {
      totalItems: items.length,
      totalSuppliers: new Set(
        items.map((item) => item.supplier_name)
      ).size,
      totalValueToOrder,
      totalArticlesToOrder,
      totalArticlesOnOrder,
    };
  }, [items]);

  function createPdf() {
    if (filteredItems.length === 0) {
      alert("Non ci sono articoli da esportare.");
      return;
    }

    const pdf = new jsPDF({
      orientation: "landscape",
    });

    pdf.setFontSize(18);
    pdf.text("REPORT SCORTE MINIME", 14, 17);

    pdf.setFontSize(9);
    pdf.text(
      `Generato il ${new Date().toLocaleString("it-IT")}`,
      14,
      24
    );

    let y = 36;

    function printHeader() {
      pdf.setFontSize(7);

      pdf.text("Fornitore", 8, y);
      pdf.text("Cod. articolo", 45, y);
      pdf.text("Cod. scanner", 78, y);
      pdf.text("Descrizione", 112, y);
      pdf.text("Giac.", 196, y);
      pdf.text("Min.", 213, y);
      pdf.text("Ord.", 228, y);
      pdf.text("Da ordin.", 244, y);
      pdf.text("Valore", 267, y);

      y += 4;
      pdf.line(8, y, 289, y);
      y += 6;
    }

    printHeader();

    filteredItems.forEach((item) => {
      if (y > 195) {
        pdf.addPage();
        y = 15;
        printHeader();
      }

      const supplier =
        item.supplier_name.length > 18
          ? item.supplier_name.substring(0, 18)
          : item.supplier_name;

      const description = item.description
        ? item.description.length > 37
          ? item.description.substring(0, 37) + "..."
          : item.description
        : "-";

      pdf.text(supplier, 8, y);
      pdf.text(item.supplier_code || "-", 45, y);
      pdf.text(item.code || "-", 78, y);
      pdf.text(description, 112, y);
      pdf.text(String(item.stock), 196, y);
      pdf.text(String(item.min_stock), 213, y);
      pdf.text(String(item.on_order), 228, y);
      pdf.text(String(getQtyToOrder(item)), 244, y);

      pdf.text(
        `${getValueToOrder(item).toFixed(2)} EUR`,
        267,
        y
      );

      y += 6;
    });

    pdf.save("report_scorte_minime.pdf");
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
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
          marginBottom: 26,
        }}
      >
        <div>
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
            Report scorte minime
          </h1>

          <div
            style={{
              marginTop: 6,
              opacity: 0.6,
              fontSize: 14,
            }}
          >
            Articoli da controllare e quantità suggerite da riordinare.
          </div>
        </div>

        <button
          type="button"
          onClick={createPdf}
          disabled={filteredItems.length === 0}
          style={{
            padding: "11px 16px",
            borderRadius: 8,
            border: "1px solid var(--foreground)",
            background:
              filteredItems.length === 0
                ? "var(--card)"
                : "var(--foreground)",
            color:
              filteredItems.length === 0
                ? "var(--foreground)"
                : "var(--background)",
            cursor:
              filteredItems.length === 0
                ? "not-allowed"
                : "pointer",
            opacity:
              filteredItems.length === 0 ? 0.5 : 1,
            fontWeight: 750,
          }}
        >
          Scarica PDF
        </button>
      </div>

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
          title="Articoli critici"
          value={String(totals.totalItems)}
          subtitle="Alla scorta minima o sotto"
          warning={totals.totalItems > 0}
        />

        <SummaryCard
          title="Fornitori coinvolti"
          value={String(totals.totalSuppliers)}
          subtitle="Con almeno un articolo critico"
        />

        <SummaryCard
          title="Articoli da riordinare"
          value={String(totals.totalArticlesToOrder)}
          subtitle="Codici con quantità da ordinare"
          warning={totals.totalArticlesToOrder > 0}
        />

        <SummaryCard
          title="Valore da riordinare"
          value={formatEuro(totals.totalValueToOrder)}
          subtitle="Valore della quantità suggerita"
        />

        <SummaryCard
          title="Articoli in ordine"
          value={String(totals.totalArticlesOnOrder)}
          subtitle="Codici con merce già ordinata"
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
          onChange={(e) =>
            setSupplierFilter(e.target.value)
          }
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
          <option value="ALL">
            Tutti i fornitori
          </option>

          {suppliersInReport.map((supplier) => (
            <option
              key={supplier}
              value={supplier}
            >
              {supplier}
            </option>
          ))}
        </select>

        <div
          style={{
            fontSize: 13,
            opacity: 0.6,
            padding: "0 5px",
          }}
        >
          {filteredItems.length} risultati
        </div>
      </div>

      {errorMessage && (
        <div
          style={{
            padding: 14,
            marginBottom: 16,
            border:
              "1px solid rgba(239,68,68,0.5)",
            borderRadius: 10,
            background:
              "rgba(239,68,68,0.08)",
          }}
        >
          Errore: {errorMessage}
        </div>
      )}

      <div
        style={{
          border:
            "1px solid var(--border-color)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--card)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 1350,
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr
                style={{
                  background:
                    "var(--table-head)",
                }}
              >
                <th style={headerStyle}>
                  Fornitore
                </th>

                <th style={headerStyle}>
                  Codice articolo
                </th>

                <th style={headerStyle}>
                  Codice scanner
                </th>

                <th style={headerStyle}>
                  Descrizione
                </th>

                <th style={headerRightStyle}>
                  Prezzo
                </th>

                <th style={headerCenterStyle}>
                  Giacenza
                </th>

                <th style={headerCenterStyle}>
                  Scorta min.
                </th>

                <th style={headerCenterStyle}>
                  Da riordinare
                </th>

                <th style={headerCenterStyle}>
                  In ordine
                </th>

                <th style={headerRightStyle}>
                  Valore da riordinare
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={10}
                    style={emptyStyle}
                  >
                    Caricamento report...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    style={emptyStyle}
                  >
                    Nessun articolo ha raggiunto la scorta minima.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const qtyToOrder =
                    getQtyToOrder(item);

                  const valueToOrder =
                    getValueToOrder(item);

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom:
                          "1px solid var(--border-color)",
                        background:
                          qtyToOrder > 0
                            ? "rgba(239, 68, 68, 0.06)"
                            : "rgba(59, 130, 246, 0.05)",
                      }}
                    >
                      <td style={cellStyle}>
                        <strong>
                          {item.supplier_name}
                        </strong>
                      </td>

                      <td style={cellStyle}>
                        <Link
                          href={`/items/${item.id}`}
                          style={{
                            color: "inherit",
                            textDecoration: "none",
                            fontWeight: 750,
                          }}
                        >
                          {item.supplier_code ||
                            "-"}
                        </Link>
                      </td>

                      <td style={cellStyle}>
                        <span
                          style={{
                            fontFamily:
                              "monospace",
                            fontSize: 13,
                            padding: "4px 7px",
                            border:
                              "1px solid var(--border-color)",
                            borderRadius: 5,
                            background:
                              "var(--input-bg)",
                          }}
                        >
                          {item.code || "-"}
                        </span>
                      </td>

                      <td style={cellStyle}>
                        <Link
                          href={`/items/${item.id}`}
                          style={{
                            color: "inherit",
                            textDecoration: "none",
                          }}
                        >
                          {item.description ||
                            "-"}
                        </Link>
                      </td>

                      <td style={rightCellStyle}>
                        {formatEuro(item.price)}
                      </td>

                      <td style={centerCellStyle}>
                        <span
                          style={{
                            display:
                              "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "5px 10px",
                            borderRadius: 20,
                            background:
                              "rgba(239, 68, 68, 0.18)",
                            border:
                              "1px solid rgba(239, 68, 68, 0.4)",
                            fontWeight: 850,
                          }}
                        >
                          ⚠ {item.stock}
                        </span>
                      </td>

                      <td style={centerCellStyle}>
                        {item.min_stock}
                      </td>

                      <td style={centerCellStyle}>
                        {qtyToOrder > 0 ? (
                          <span
                            style={{
                              display:
                                "inline-block",
                              minWidth: 36,
                              padding:
                                "5px 10px",
                              borderRadius: 20,
                              background:
                                "rgba(245, 158, 11, 0.18)",
                              border:
                                "1px solid rgba(245, 158, 11, 0.35)",
                              fontWeight: 850,
                            }}
                          >
                            {qtyToOrder}
                          </span>
                        ) : (
                          <span
                            style={{
                              opacity: 0.45,
                            }}
                          >
                            —
                          </span>
                        )}
                      </td>

                      <td style={centerCellStyle}>
                        {item.on_order > 0 ? (
                          <span
                            style={{
                              display:
                                "inline-block",
                              minWidth: 34,
                              padding:
                                "4px 9px",
                              borderRadius: 20,
                              background:
                                "rgba(59, 130, 246, 0.15)",
                              fontWeight: 800,
                            }}
                          >
                            {item.on_order}
                          </span>
                        ) : (
                          <span
                            style={{
                              opacity: 0.4,
                            }}
                          >
                            —
                          </span>
                        )}
                      </td>

                      <td style={rightCellStyle}>
                        <strong>
                          {qtyToOrder > 0
                            ? formatEuro(
                                valueToOrder
                              )
                            : "—"}
                        </strong>
                      </td>
                    </tr>
                  );
                })
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
        Quantità suggerita = Scorta minima − Giacenza − Quantità già in ordine.
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  warning = false,
}: {
  title: string;
  value: string;
  subtitle: string;
  warning?: boolean;
}) {
  return (
    <div
      style={{
        padding: 18,
        border: warning
          ? "1px solid rgba(239, 68, 68, 0.5)"
          : "1px solid var(--border-color)",
        borderRadius: 12,
        background: warning
          ? "rgba(239, 68, 68, 0.08)"
          : "var(--card)",
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
        {warning && "⚠ "}
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

function formatEuro(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

const headerStyle = {
  padding: "13px 14px",
  textAlign: "left" as const,
  fontSize: 12,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  opacity: 0.7,
  borderBottom:
    "1px solid var(--border-color)",
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