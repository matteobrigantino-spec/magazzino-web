"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  loadMovementData,
  summarizeItem,
  type ItemMeta,
  type MovementEvent,
} from "../../lib/movementStats";

export default function StatistichePage() {
  const [items, setItems] = useState<ItemMeta[]>([]);
  const [events, setEvents] = useState<MovementEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("ALL");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const result = await loadMovementData();
    setItems(result.items);
    setEvents(result.events);
    setErrors(result.errors);
    setLoading(false);
  }

  const summaryByItemId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof summarizeItem>>();
    const itemIdsWithEvents = new Set(events.map((e) => e.itemId));
    itemIdsWithEvents.forEach((itemId) => {
      map.set(itemId, summarizeItem(events, itemId));
    });
    return map;
  }, [events]);

  const rows = useMemo(() => {
    return items
      .filter((item) => summaryByItemId.has(item.id))
      .map((item) => ({
        item,
        summary: summaryByItemId.get(item.id)!,
      }))
      .sort((a, b) => b.summary.totalUso - a.summary.totalUso);
  }, [items, summaryByItemId]);

  const suppliersInReport = useMemo(() => {
    return Array.from(
      new Set(rows.map((row) => row.item.supplierName).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const text = search.trim().toLowerCase();

    return rows.filter(({ item }) => {
      const matchesSearch =
        !text ||
        item.description.toLowerCase().includes(text) ||
        item.code.toLowerCase().includes(text) ||
        item.supplierCode.toLowerCase().includes(text) ||
        item.supplierName.toLowerCase().includes(text);

      const matchesSupplier =
        supplierFilter === "ALL" || item.supplierName === supplierFilter;

      return matchesSearch && matchesSupplier;
    });
  }, [rows, search, supplierFilter]);

  return (
    <div style={{ width: "100%", maxWidth: 1500, margin: "0 auto" }}>
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
            Statistiche articoli
          </h1>

          <div style={{ marginTop: 6, opacity: 0.6, fontSize: 14, maxWidth: 720 }}>
            Storico acquisti e uso per articolo, calcolato dagli arrivi ordine,
            dai movimenti manuali e dai consumi automatici di teak,
            tappezzeria, parabrezza e gelcoat.
          </div>
        </div>
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
        <div style={{ position: "relative", flex: "1 1 350px" }}>
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

        <div style={{ fontSize: 13, opacity: 0.6, padding: "0 5px" }}>
          {filteredRows.length} articoli con storico
        </div>
      </div>

      {errors.length > 0 && (
        <div
          style={{
            padding: 14,
            marginBottom: 16,
            border: "1px solid rgba(239,68,68,0.5)",
            borderRadius: 10,
            background: "rgba(239,68,68,0.08)",
            fontSize: 13,
          }}
        >
          {errors.map((err, i) => (
            <div key={i}>Errore: {err}</div>
          ))}
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
          <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--table-head)" }}>
                <th style={headerStyle}>Fornitore</th>
                <th style={headerStyle}>Codice articolo</th>
                <th style={headerStyle}>Descrizione</th>
                <th style={headerCenterStyle}>Giacenza</th>
                <th style={headerRightStyle}>Tot. acquistato</th>
                <th style={headerRightStyle}>Tot. usato</th>
                <th style={headerRightStyle}>Media mensile acquisti</th>
                <th style={headerRightStyle}>Media mensile uso</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={emptyStyle}>
                    Caricamento statistiche...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={emptyStyle}>
                    Nessun articolo con movimenti storici trovato.
                  </td>
                </tr>
              ) : (
                filteredRows.map(({ item, summary }) => (
                  <tr
                    key={item.id}
                    style={{ borderBottom: "1px solid var(--border-color)" }}
                  >
                    <td style={cellStyle}>
                      <strong>{item.supplierName || "-"}</strong>
                    </td>

                    <td style={cellStyle}>
                      <Link
                        href={`/statistiche/${item.id}`}
                        style={{
                          color: "inherit",
                          textDecoration: "none",
                          fontWeight: 750,
                        }}
                      >
                        {item.supplierCode || item.code || "-"}
                      </Link>
                    </td>

                    <td style={cellStyle}>
                      <Link
                        href={`/statistiche/${item.id}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {item.description || "-"}
                      </Link>
                    </td>

                    <td style={centerCellStyle}>
                      {item.stock} {item.unit}
                    </td>

                    <td style={rightCellStyle}>
                      {summary.totalAcquisti.toFixed(1)} {item.unit}
                    </td>

                    <td style={rightCellStyle}>
                      {summary.totalUso.toFixed(1)} {item.unit}
                    </td>

                    <td style={rightCellStyle}>
                      {summary.mediaMensileAcquisti.toFixed(1)} {item.unit}/mese
                    </td>

                    <td style={rightCellStyle}>
                      {summary.mediaMensileUso.toFixed(1)} {item.unit}/mese
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, opacity: 0.5, maxWidth: 820 }}>
        Media mensile calcolata sui mesi di calendario tra il primo e
        l'ultimo movimento registrato per quell'articolo. Gli arrivi
        ordine compaiono alla data in cui la riga d'ordine risulta
        completamente ricevuta: un arrivo parziale non ancora concluso
        non è ancora visibile nello storico.
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

const headerCenterStyle = { ...headerStyle, textAlign: "center" as const };
const headerRightStyle = { ...headerStyle, textAlign: "right" as const };

const cellStyle = { padding: "12px 14px", fontSize: 14 };
const centerCellStyle = { ...cellStyle, textAlign: "center" as const };
const rightCellStyle = {
  ...cellStyle,
  textAlign: "right" as const,
  whiteSpace: "nowrap" as const,
};

const emptyStyle = { padding: 45, textAlign: "center" as const, opacity: 0.55 };
