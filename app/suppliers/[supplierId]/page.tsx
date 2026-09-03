"use client";

import React, { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import jsPDF from "jspdf";
import { supabase } from "../../../lib/supabaseClient";

type Item = {
  id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  stock: number;
  min_stock: number;
  price: number;
  on_order: number;
  image_url: string | null;
};

export default function SupplierDetail({
  params,
}: {
  params: Promise<{ supplierId: string }> | { supplierId: string };
}) {
  const resolvedParams =
    typeof (params as any)?.then === "function"
      ? use(params as Promise<{ supplierId: string }>)
      : (params as { supplierId: string });

  const supplierId = resolvedParams.supplierId;

  const [supplierName, setSupplierName] = useState("Fornitore");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      const { data: supplier } = await supabase
        .from("suppliers")
        .select("name")
        .eq("id", supplierId)
        .maybeSingle();

      if (supplier?.name) {
        setSupplierName(supplier.name);
      }

      const { data: itemsData, error } = await supabase
        .from("items")
        .select(
          "id, code, supplier_code, description, stock, min_stock, price, on_order, image_url"
        )
        .eq("supplier_id", supplierId)
        .order("description");

      if (!error && itemsData) {
        setItems(
          itemsData.map((item) => ({
            ...item,
            stock: Number(item.stock ?? 0),
            min_stock: Number(item.min_stock ?? 0),
            price: Number(item.price ?? 0),
            on_order: Number(item.on_order ?? 0),
          }))
        );
      }

      setLoading(false);
    }

    loadData();
  }, [supplierId]);

  function isLowStock(item: Item) {
    return item.min_stock > 0 && item.stock <= item.min_stock;
  }

  const totals = useMemo(() => {
    const totalMagazzino = items.reduce(
      (sum, item) => sum + item.stock * item.price,
      0
    );

    const totalOrdine = items.reduce(
      (sum, item) => sum + item.on_order * item.price,
      0
    );

    const lowStock = items.filter(isLowStock).length;

    return {
      totalMagazzino,
      totalOrdine,
      lowStock,
      totalItems: items.length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const text = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesSearch =
        !text ||
        item.description?.toLowerCase().includes(text) ||
        item.code?.toLowerCase().includes(text) ||
        item.supplier_code?.toLowerCase().includes(text);

      const matchesLowStock =
        !onlyLowStock || isLowStock(item);

      return matchesSearch && matchesLowStock;
    });
  }, [items, search, onlyLowStock]);

  function getPdfDate() {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date());
  }

  function safeFileName(value: string) {
    return value
      .trim()
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "_");
  }

  function formatPdfEuro(value: number) {
    return new Intl.NumberFormat("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0)) + " EUR";
  }

  function drawPdfHeader(
    doc: jsPDF,
    title: string,
    subtitle: string
  ) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);

    doc.text(title, 14, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    doc.text(subtitle, 14, 23);
    doc.text(`Data: ${getPdfDate()}`, 14, 28);

    doc.setDrawColor(180);
    doc.line(14, 32, 283, 32);
  }

  function generateDetailedPdf() {
    if (items.length === 0) {
      alert("Non ci sono articoli da stampare.");
      return;
    }

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const marginLeft = 10;
    const marginRight = 10;

    const columns = [
      { label: "Codice articolo", width: 30 },
      { label: "Codice scanner", width: 34 },
      { label: "Descrizione", width: 78 },
      { label: "Prezzo", width: 27 },
      { label: "Giacenza", width: 23 },
      { label: "Scorta min.", width: 24 },
      { label: "In ordine", width: 23 },
      { label: "Valore", width: 31 },
    ];

    const totalTableWidth = columns.reduce(
      (sum, column) => sum + column.width,
      0
    );

    let y = 38;

    function drawHeader() {
      drawPdfHeader(
        doc,
        `MAGAZZINO - ${supplierName.toUpperCase()}`,
        "Report dettagliato con valori economici"
      );

      y = 38;

      doc.setFillColor(235, 235, 235);
      doc.rect(
        marginLeft,
        y,
        totalTableWidth,
        9,
        "F"
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);

      let x = marginLeft;

      columns.forEach((column) => {
        doc.text(
          column.label,
          x + 1.5,
          y + 5.7
        );

        x += column.width;
      });

      y += 9;
    }

    function newPage() {
      doc.addPage();
      drawHeader();
    }

    drawHeader();

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);

    items.forEach((item) => {
      const descriptionLines = doc.splitTextToSize(
        item.description || "-",
        columns[2].width - 3
      );

      const rowHeight = Math.max(
        8,
        descriptionLines.length * 4 + 3
      );

      if (y + rowHeight > pageHeight - 20) {
        newPage();
      }

      if (isLowStock(item)) {
        doc.setFillColor(255, 242, 242);

        doc.rect(
          marginLeft,
          y,
          totalTableWidth,
          rowHeight,
          "F"
        );
      }

      doc.setDrawColor(215);
      doc.line(
        marginLeft,
        y + rowHeight,
        marginLeft + totalTableWidth,
        y + rowHeight
      );

      const values: Array<string | string[]> = [
        item.supplier_code || "-",
        item.code || "-",
        descriptionLines,
        formatPdfEuro(item.price),
        String(item.stock),
        item.min_stock > 0
          ? String(item.min_stock)
          : "-",
        item.on_order > 0
          ? String(item.on_order)
          : "-",
        formatPdfEuro(item.stock * item.price),
      ];

      let x = marginLeft;

      values.forEach((value, index) => {
        if (Array.isArray(value)) {
          doc.text(
            value,
            x + 1.5,
            y + 4.7
          );
        } else {
          doc.text(
            value,
            x + 1.5,
            y + 4.7
          );
        }

        x += columns[index].width;
      });

      y += rowHeight;
    });

    if (y + 30 > pageHeight - 10) {
      doc.addPage();

      drawPdfHeader(
        doc,
        `MAGAZZINO - ${supplierName.toUpperCase()}`,
        "Riepilogo"
      );

      y = 42;
    } else {
      y += 8;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);

    doc.text(
      `Articoli totali: ${items.length}`,
      marginLeft,
      y
    );

    y += 6;

    doc.text(
      `Valore totale magazzino: ${formatPdfEuro(
        totals.totalMagazzino
      )}`,
      marginLeft,
      y
    );

    y += 6;

    doc.text(
      `Valore totale merce in ordine: ${formatPdfEuro(
        totals.totalOrdine
      )}`,
      marginLeft,
      y
    );

    addPageNumbers(doc);

    doc.save(
      `Magazzino_${safeFileName(
        supplierName
      )}_dettagliato.pdf`
    );
  }

  function generateWarehousePdf() {
    if (items.length === 0) {
      alert("Non ci sono articoli da stampare.");
      return;
    }

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageHeight = doc.internal.pageSize.getHeight();

    const marginLeft = 14;

    const columns = [
      { label: "Codice articolo", width: 38 },
      { label: "Codice scanner", width: 44 },
      { label: "Descrizione", width: 112 },
      { label: "Giacenza", width: 28 },
      { label: "Scorta min.", width: 30 },
      { label: "In ordine", width: 29 },
    ];

    const totalTableWidth = columns.reduce(
      (sum, column) => sum + column.width,
      0
    );

    let y = 38;

    function drawHeader() {
      drawPdfHeader(
        doc,
        `MAGAZZINO - ${supplierName.toUpperCase()}`,
        "Lista operativa magazziniere"
      );

      y = 38;

      doc.setFillColor(235, 235, 235);

      doc.rect(
        marginLeft,
        y,
        totalTableWidth,
        10,
        "F"
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);

      let x = marginLeft;

      columns.forEach((column) => {
        doc.text(
          column.label,
          x + 2,
          y + 6.3
        );

        x += column.width;
      });

      y += 10;
    }

    function newPage() {
      doc.addPage();
      drawHeader();
    }

    drawHeader();

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);

    items.forEach((item) => {
      const descriptionLines = doc.splitTextToSize(
        item.description || "-",
        columns[2].width - 4
      );

      const rowHeight = Math.max(
        9,
        descriptionLines.length * 4.3 + 3
      );

      if (y + rowHeight > pageHeight - 18) {
        newPage();
      }

      if (isLowStock(item)) {
        doc.setFillColor(255, 242, 242);

        doc.rect(
          marginLeft,
          y,
          totalTableWidth,
          rowHeight,
          "F"
        );
      }

      doc.setDrawColor(215);

      doc.line(
        marginLeft,
        y + rowHeight,
        marginLeft + totalTableWidth,
        y + rowHeight
      );

      const values: Array<string | string[]> = [
        item.supplier_code || "-",
        item.code || "-",
        descriptionLines,
        String(item.stock),
        item.min_stock > 0
          ? String(item.min_stock)
          : "-",
        item.on_order > 0
          ? String(item.on_order)
          : "-",
      ];

      let x = marginLeft;

      values.forEach((value, index) => {
        if (Array.isArray(value)) {
          doc.text(
            value,
            x + 2,
            y + 5.2
          );
        } else {
          doc.text(
            value,
            x + 2,
            y + 5.2
          );
        }

        x += columns[index].width;
      });

      y += rowHeight;
    });

    if (y + 15 > pageHeight - 10) {
      doc.addPage();

      drawPdfHeader(
        doc,
        `MAGAZZINO - ${supplierName.toUpperCase()}`,
        "Riepilogo"
      );

      y = 42;
    } else {
      y += 8;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);

    doc.text(
      `Articoli totali: ${items.length}`,
      marginLeft,
      y
    );

    addPageNumbers(doc);

    doc.save(
      `Magazzino_${safeFileName(
        supplierName
      )}_magazziniere.pdf`
    );
  }

  function addPageNumbers(doc: jsPDF) {
    const pages = doc.getNumberOfPages();

    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);

      const pageWidth =
        doc.internal.pageSize.getWidth();

      const pageHeight =
        doc.internal.pageSize.getHeight();

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);

      doc.text(
        `Pagina ${i} di ${pages}`,
        pageWidth - 14,
        pageHeight - 7,
        {
          align: "right",
        }
      );
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
      {/* INTESTAZIONE */}

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
            Magazzino fornitore
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: "-0.5px",
            }}
          >
            {supplierName}
          </h1>

          <div
            style={{
              marginTop: 6,
              opacity: 0.6,
              fontSize: 14,
            }}
          >
            {totals.totalItems} articoli presenti
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/suppliers"
            style={secondaryButton}
          >
            ← Fornitori
          </Link>

          <button
            type="button"
            onClick={generateWarehousePdf}
            disabled={loading}
            style={warehousePdfButton}
          >
            PDF magazziniere
          </button>

          <button
            type="button"
            onClick={generateDetailedPdf}
            disabled={loading}
            style={detailedPdfButton}
          >
            PDF dettagliato
          </button>

          <Link
            href={`/suppliers/${supplierId}/new-item`}
            style={primaryButton}
          >
            + Nuovo articolo
          </Link>
        </div>
      </div>

      {/* RIQUADRI RIEPILOGO */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <SummaryCard
          title="Valore magazzino"
          value={formatEuro(totals.totalMagazzino)}
          subtitle="Valore della giacenza attuale"
        />

        <SummaryCard
          title="Valore in ordine"
          value={formatEuro(totals.totalOrdine)}
          subtitle="Merce attualmente in ordine"
        />

        <SummaryCard
          title="Scorte da controllare"
          value={String(totals.lowStock)}
          subtitle={
            totals.lowStock === 0
              ? "Nessuna criticità"
              : "Articoli alla scorta minima"
          }
          warning={totals.lowStock > 0}
        />
      </div>

      {/* RICERCA E FILTRI */}

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
            placeholder="Cerca codice, scanner o descrizione..."
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

        <button
          type="button"
          onClick={() => setOnlyLowStock(!onlyLowStock)}
          style={{
            padding: "11px 15px",
            borderRadius: 8,

            border: onlyLowStock
              ? "1px solid #ef4444"
              : "1px solid var(--border-color)",

            background: onlyLowStock
              ? "rgba(239, 68, 68, 0.15)"
              : "var(--input-bg)",

            color: "var(--foreground)",
            cursor: "pointer",
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {onlyLowStock ? "✓ " : ""}
          Solo scorte basse
        </button>

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

      {/* TABELLA */}

      <div
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--card)",
        }}
      >
        <div
          style={{
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              minWidth: 1200,
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--table-head)",
                }}
              >
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
                  In ordine
                </th>

                <th style={headerRightStyle}>
                  Valore
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    style={emptyStyle}
                  >
                    Caricamento articoli...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={emptyStyle}
                  >
                    Nessun articolo trovato.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const lowStock = isLowStock(item);

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom:
                          "1px solid var(--border-color)",

                        background: lowStock
                          ? "rgba(239, 68, 68, 0.08)"
                          : "transparent",
                      }}
                    >
                      <td style={cellStyle}>
                        <Link
                          href={`/items/${item.id}`}
                          style={{
                            color: "inherit",
                            textDecoration: "none",
                            fontWeight: 750,
                          }}
                        >
                          {item.supplier_code || "-"}
                        </Link>
                      </td>

                      <td style={cellStyle}>
                        <span
                          style={{
                            fontFamily: "monospace",
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
                          {item.description || "-"}
                        </Link>
                      </td>

                      <td style={rightCellStyle}>
                        {formatEuro(item.price)}
                      </td>

                      <td style={centerCellStyle}>
                        <StockBadge
                          stock={item.stock}
                          minStock={item.min_stock}
                        />
                      </td>

                      <td style={centerCellStyle}>
                        {item.min_stock > 0
                          ? item.min_stock
                          : "—"}
                      </td>

                      <td style={centerCellStyle}>
                        {item.on_order > 0 ? (
                          <span
                            style={{
                              display: "inline-block",
                              minWidth: 34,
                              padding: "4px 9px",
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
                          {formatEuro(
                            item.stock * item.price
                          )}
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
        Clicca sul codice articolo o sulla descrizione per aprire
        la scheda completa.
      </div>
    </div>
  );
}

/* ---------------- COMPONENTI ---------------- */

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

function StockBadge({
  stock,
  minStock,
}: {
  stock: number;
  minStock: number;
}) {
  const low =
    minStock > 0 &&
    stock <= minStock;

  if (low) {
    return (
      <span
        title={`Scorta minima: ${minStock}`}
        style={{
          display: "inline-flex",
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
        ⚠ {stock}
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-block",
        minWidth: 34,
        padding: "5px 10px",

        borderRadius: 20,

        background:
          "rgba(34, 197, 94, 0.12)",

        fontWeight: 800,
      }}
    >
      {stock}
    </span>
  );
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

/* ---------------- STILI ---------------- */

const primaryButton = {
  display: "inline-block",
  padding: "11px 16px",
  borderRadius: 8,
  border: "1px solid var(--foreground)",
  background: "var(--foreground)",
  color: "var(--background)",
  textDecoration: "none",
  fontWeight: 750,
};

const secondaryButton = {
  display: "inline-block",
  padding: "11px 16px",
  borderRadius: 8,
  border: "1px solid var(--border-color)",
  background: "var(--card)",
  color: "var(--foreground)",
  textDecoration: "none",
  fontWeight: 650,
};

const warehousePdfButton = {
  display: "inline-block",
  padding: "11px 16px",
  borderRadius: 8,
  border: "1px solid var(--border-color)",
  background: "var(--card)",
  color: "var(--foreground)",
  cursor: "pointer",
  fontWeight: 750,
};

const detailedPdfButton = {
  display: "inline-block",
  padding: "11px 16px",
  borderRadius: 8,
  border: "1px solid rgba(59,130,246,0.45)",
  background: "rgba(59,130,246,0.12)",
  color: "var(--foreground)",
  cursor: "pointer",
  fontWeight: 750,
};

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