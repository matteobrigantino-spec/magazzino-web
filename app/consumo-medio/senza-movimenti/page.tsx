"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { fetchCompanyLogo } from "../../../lib/pdfLogo";
import { buildNoMovementItemsPdf } from "../../../lib/productionPdf";

/*
  ARTICOLI SENZA MOVIMENTI (STEP 60)

  Dettaglio della card "Senza movimenti registrati" della pagina
  Consumo medio: stessa identica definizione (codice articolo assente
  da get_item_consumption_summary, cioe' nessuno scarico mai
  registrato), cosi' il conteggio qui dentro torna sempre uguale a
  quello della card che porta qui.

  In piu', per chi ha il permesso di vedere i prezzi, il valore fermo
  in magazzino (giacenza x prezzo, sommato su tutti questi articoli):
  soldi investiti in articoli che non si muovono mai. Chi non ha il
  permesso vede comunque l'elenco e i conteggi, ma non prezzi o
  valore (stesso trattamento della pagina Consumo medio).
*/

type Row = {
  id: string;
  code: string;
  supplierCode: string | null;
  description: string;
  supplierName: string;
  stock: number;
  price: number | null; // null quando non si ha il permesso di vedere i prezzi
};

export default function NoMovementItemsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [search, setSearch] = useState("");
  const [canViewPrices, setCanViewPrices] = useState(false);

  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const role = localStorage.getItem("magazzino_role");
    const savedPermissions = localStorage.getItem("magazzino_permissions");

    let permissions: { view_prices?: boolean } = {};
    try {
      permissions = savedPermissions ? JSON.parse(savedPermissions) : {};
    } catch {
      permissions = {};
    }

    const canSeePrices = role === "admin" || permissions.view_prices === true;
    setCanViewPrices(canSeePrices);

    const [itemsResult, suppliersResult, consumptionResult] = await Promise.all([
      supabase
        .from("items")
        .select("id,code,supplier_code,description,stock,supplier_id,price")
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
        "Errore nel calcolo del consumo: " + consumptionResult.error.message
      );
      setLoading(false);
      return;
    }

    const items = (itemsResult.data || []) as {
      id: string;
      code: string | null;
      supplier_code: string | null;
      description: string | null;
      stock: number | string | null;
      supplier_id: string | null;
      price: number | string | null;
    }[];
    const suppliers = (suppliersResult.data || []) as { id: string; name: string }[];

    // Stessa logica della pagina Consumo medio: un codice presente
    // nel riepilogo (anche con movement_count a 0 per qualche motivo)
    // conta comunque come "con movimenti" - qui basta sapere se il
    // codice compare o no.
    const codesWithMovement = new Set<string>();
    ((consumptionResult.data || []) as { code: string | null }[]).forEach(
      (row) => {
        if (row.code) codesWithMovement.add(row.code);
      }
    );

    const supplierNameById = new Map(
      suppliers.map((supplier) => [supplier.id, supplier.name])
    );

    const built: Row[] = items
      .filter((item) => !item.code || !codesWithMovement.has(item.code))
      .map((item) => ({
        id: String(item.id),
        code: item.code || "",
        supplierCode: item.supplier_code || null,
        description: item.description || "Senza descrizione",
        supplierName: item.supplier_id
          ? supplierNameById.get(item.supplier_id) || "Fornitore sconosciuto"
          : "Fornitore sconosciuto",
        stock: Number(item.stock || 0),
        price:
          canSeePrices && item.price !== null && item.price !== undefined
            ? Number(item.price)
            : null,
      }));

    setRows(built);
    setLoading(false);
  }

  const filteredRows = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return rows;

    return rows.filter((row) =>
      [row.code, row.supplierCode || "", row.description, row.supplierName]
        .join(" ")
        .toLowerCase()
        .includes(text)
    );
  }, [rows, search]);

  const totalStock = useMemo(
    () => rows.reduce((sum, row) => sum + row.stock, 0),
    [rows]
  );

  const totalValue = useMemo(() => {
    if (!canViewPrices) return null;
    return rows.reduce((sum, row) => sum + row.stock * (row.price || 0), 0);
  }, [rows, canViewPrices]);

  function formatNumber(value: number, decimals = 0) {
    return new Intl.NumberFormat("it-IT", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  function formatEuro(value: number) {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  async function downloadPdf() {
    setPdfError("");
    setPdfBusy(true);

    try {
      const logo = await fetchCompanyLogo();
      if (!logo) {
        throw new Error(
          "Carica il logo aziendale prima di scaricare il PDF (Produzione -> Configurazioni)."
        );
      }

      const { doc, filename } = buildNoMovementItemsPdf({
        rows: rows.map((row) => ({
          code: row.code,
          supplierCode: row.supplierCode,
          description: row.description,
          supplierName: row.supplierName,
          stock: row.stock,
          price: row.price,
        })),
        totalValue,
        logo,
        generatedDate: new Intl.DateTimeFormat("it-IT").format(new Date()),
      });

      doc.save(filename);
    } catch (err) {
      setPdfError(
        err instanceof Error ? err.message : "Errore durante la creazione del PDF."
      );
    } finally {
      setPdfBusy(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: "center", opacity: 0.6, fontSize: 13 }}>
        Caricamento...
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 26 }}>
        <Link
          href="/consumo-medio"
          style={{
            fontSize: 13,
            opacity: 0.6,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          ← Consumo medio
        </Link>

        <h1
          style={{
            margin: "8px 0 0",
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: "-0.5px",
          }}
        >
          Articoli senza movimenti
        </h1>

        <div style={{ marginTop: 6, opacity: 0.6, fontSize: 14, maxWidth: 760 }}>
          Articoli a catalogo che non hanno mai avuto nemmeno uno scarico
          registrato: la giacenza ferma qui dentro è denaro investito che
          non si muove.
        </div>
      </div>

      {errorMessage && (
        <div
          style={{
            marginBottom: 16,
            padding: "11px 14px",
            borderRadius: 9,
            background: "rgba(239,68,68,.08)",
            border: "1px solid rgba(239,68,68,.28)",
            color: "#ef4444",
            fontSize: 13,
          }}
        >
          {errorMessage}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <SummaryCard
          title="Articoli senza movimenti"
          value={String(rows.length)}
          subtitle="Nessuno scarico in archivio"
        />

        <SummaryCard
          title="Giacenza ferma"
          value={formatNumber(totalStock)}
          subtitle="Pezzi totali di questi articoli"
        />

        {canViewPrices ? (
          <SummaryCard
            title="Valore fermo in magazzino"
            value={formatEuro(totalValue || 0)}
            subtitle="Giacenza × prezzo"
          />
        ) : (
          <SummaryCard
            title="Valore fermo in magazzino"
            value="—"
            subtitle="Non hai il permesso di vedere i prezzi"
          />
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 320px" }}>
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

        <button
          type="button"
          onClick={downloadPdf}
          disabled={pdfBusy || rows.length === 0}
          style={{
            padding: "11px 16px",
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            background: "var(--input-bg)",
            color: "var(--foreground)",
            fontSize: 13,
            fontWeight: 750,
            cursor: pdfBusy || rows.length === 0 ? "default" : "pointer",
            opacity: pdfBusy || rows.length === 0 ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {pdfBusy ? "Genero il PDF..." : "Genera PDF"}
        </button>
      </div>

      {pdfError && (
        <div style={{ marginBottom: 16, fontSize: 13, color: "#ef4444" }}>
          {pdfError}
        </div>
      )}

      <div
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headerStyle}>Fornitore</th>
                <th style={headerStyle}>Codice</th>
                <th style={headerStyle}>Descrizione</th>
                <th style={headerCenterStyle}>Giacenza</th>
                {canViewPrices && <th style={headerRightStyle}>Prezzo</th>}
                {canViewPrices && <th style={headerRightStyle}>Valore</th>}
              </tr>
            </thead>

            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={canViewPrices ? 6 : 4}
                    style={{ ...cellStyle, textAlign: "center", opacity: 0.55, padding: 30 }}
                  >
                    {rows.length === 0
                      ? "Nessun articolo senza movimenti: tutto il catalogo ha almeno uno scarico."
                      : "Nessun risultato per questa ricerca."}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} style={{ borderTop: "1px solid var(--border-color)" }}>
                    <td style={cellStyle}>{row.supplierName}</td>

                    <td style={cellStyle}>
                      <Link
                        href={`/items/${row.id}`}
                        style={{ color: "inherit", textDecoration: "none", fontWeight: 750 }}
                      >
                        {row.supplierCode || row.code || "-"}
                      </Link>
                    </td>

                    <td style={cellStyle}>
                      <Link
                        href={`/items/${row.id}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {row.description}
                      </Link>
                    </td>

                    <td style={centerCellStyle}>{row.stock}</td>

                    {canViewPrices && (
                      <td style={rightCellStyle}>
                        {row.price ? formatEuro(row.price) : "-"}
                      </td>
                    )}

                    {canViewPrices && (
                      <td style={rightCellStyle}>
                        {row.price ? formatEuro(row.stock * row.price) : "-"}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
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

      <div style={{ fontSize: 12, opacity: 0.55, marginTop: 4 }}>{subtitle}</div>
    </div>
  );
}

const headerStyle = {
  padding: "11px 14px",
  textAlign: "left" as const,
  fontSize: 11,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  opacity: 0.6,
  borderBottom: "1px solid var(--border-color)",
  whiteSpace: "nowrap" as const,
};

const headerCenterStyle = { ...headerStyle, textAlign: "center" as const };
const headerRightStyle = { ...headerStyle, textAlign: "right" as const };

const cellStyle = { padding: "11px 14px", fontSize: 14 };
const centerCellStyle = { ...cellStyle, textAlign: "center" as const };
const rightCellStyle = { ...cellStyle, textAlign: "right" as const, whiteSpace: "nowrap" as const };
