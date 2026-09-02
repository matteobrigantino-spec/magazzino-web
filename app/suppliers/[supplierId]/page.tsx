"use client";

import React, { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
          value={`${formatEuro(totals.totalMagazzino)}`}
          subtitle="Valore della giacenza attuale"
        />

        <SummaryCard
          title="Valore in ordine"
          value={`${formatEuro(totals.totalOrdine)}`}
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
                      {/* CODICE ARTICOLO */}

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

                      {/* SCANNER */}

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

                      {/* DESCRIZIONE */}

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

                      {/* PREZZO */}

                      <td style={rightCellStyle}>
                        {formatEuro(item.price)}
                      </td>

                      {/* GIACENZA */}

                      <td style={centerCellStyle}>
                        <StockBadge
                          stock={item.stock}
                          minStock={item.min_stock}
                        />
                      </td>

                      {/* MIN STOCK */}

                      <td style={centerCellStyle}>
                        {item.min_stock > 0
                          ? item.min_stock
                          : "—"}
                      </td>

                      {/* IN ORDINE */}

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

                      {/* VALORE */}

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