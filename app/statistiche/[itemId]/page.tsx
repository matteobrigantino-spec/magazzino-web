"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  loadMovementData,
  aggregateItemByPeriod,
  summarizeItem,
  type ItemMeta,
  type MovementEvent,
  type PeriodGranularity,
} from "../../../lib/movementStats";

const TABS: { value: PeriodGranularity; label: string }[] = [
  { value: "month", label: "Mensile" },
  { value: "quarter", label: "Trimestrale" },
  { value: "year", label: "Annuale" },
];

export default function StatisticheArticoloPage({
  params,
}: {
  params: Promise<{ itemId: string }> | { itemId: string };
}) {
  const resolvedParams =
    typeof (params as any)?.then === "function"
      ? use(params as Promise<{ itemId: string }>)
      : (params as { itemId: string });

  const itemId = resolvedParams.itemId;

  const [item, setItem] = useState<ItemMeta | null>(null);
  const [events, setEvents] = useState<MovementEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<PeriodGranularity>("month");

  useEffect(() => {
    load();
  }, [itemId]);

  async function load() {
    setLoading(true);
    const result = await loadMovementData();
    setItem(result.items.find((i) => i.id === itemId) || null);
    setEvents(result.events);
    setErrors(result.errors);
    setLoading(false);
  }

  const summary = useMemo(() => summarizeItem(events, itemId), [events, itemId]);

  const buckets = useMemo(
    () => aggregateItemByPeriod(events, itemId, granularity),
    [events, itemId, granularity]
  );

  const unit = item?.unit || "pz";

  return (
    <div style={{ width: "100%", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <Link
          href="/statistiche"
          style={{ fontSize: 13, opacity: 0.6, textDecoration: "none", color: "inherit" }}
        >
          ← Torna alle statistiche
        </Link>
      </div>

      <div style={{ marginBottom: 26 }}>
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
          {item?.supplierName || "Magazzino"}
        </div>

        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px" }}>
          {loading ? "Caricamento..." : item?.description || "Articolo non trovato"}
        </h1>

        {item && (
          <div style={{ marginTop: 6, opacity: 0.6, fontSize: 14 }}>
            Cod. articolo {item.supplierCode || "-"} · Cod. scanner {item.code || "-"} ·
            Giacenza attuale {item.stock} {unit}
          </div>
        )}
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

      {!loading && item && buckets.length === 0 && (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            opacity: 0.55,
            fontSize: 14,
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            background: "var(--card)",
            marginBottom: 20,
          }}
        >
          Nessun movimento storico trovato per questo articolo.
        </div>
      )}

      {!loading && item && buckets.length > 0 && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 14,
              marginBottom: 24,
            }}
          >
            <SummaryCard
              title="Totale acquistato"
              value={`${summary.totalAcquisti.toFixed(1)} ${unit}`}
              subtitle={`Dal ${formatItDate(summary.firstDate)} al ${formatItDate(summary.lastDate)}`}
            />
            <SummaryCard
              title="Totale usato"
              value={`${summary.totalUso.toFixed(1)} ${unit}`}
              subtitle="Kit assegnati, venduti o consegnati"
            />
            <SummaryCard
              title="Media mensile acquisti"
              value={`${summary.mediaMensileAcquisti.toFixed(1)} ${unit}/mese`}
              subtitle="Sui mesi di calendario con storico"
            />
            <SummaryCard
              title="Media mensile uso"
              value={`${summary.mediaMensileUso.toFixed(1)} ${unit}/mese`}
              subtitle="Sui mesi di calendario con storico"
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 16,
              borderBottom: "1px solid var(--border-color)",
            }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setGranularity(tab.value)}
                style={{
                  padding: "10px 16px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 750,
                  color: "var(--foreground)",
                  opacity: granularity === tab.value ? 1 : 0.5,
                  borderBottom:
                    granularity === tab.value
                      ? "2px solid var(--foreground)"
                      : "2px solid transparent",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 12,
              overflow: "hidden",
              background: "var(--card)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--table-head)" }}>
                  <th style={headerStyle}>Periodo</th>
                  <th style={headerRightStyle}>Acquistato</th>
                  <th style={headerRightStyle}>Usato</th>
                </tr>
              </thead>

              <tbody>
                {buckets.map((bucket) => (
                  <tr key={bucket.key} style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <td style={cellStyle}>
                      <strong>{bucket.label}</strong>
                    </td>
                    <td style={rightCellStyle}>
                      {bucket.acquisti > 0 ? (
                        <span>{bucket.acquisti.toFixed(1)} {unit}</span>
                      ) : (
                        <span style={{ opacity: 0.4 }}>—</span>
                      )}
                    </td>
                    <td style={rightCellStyle}>
                      {bucket.uso > 0 ? (
                        <span>{bucket.uso.toFixed(1)} {unit}</span>
                      ) : (
                        <span style={{ opacity: 0.4 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ marginTop: 16, fontSize: 12, opacity: 0.5, maxWidth: 820 }}>
        Acquisti = arrivi ordine fornitore e carichi manuali. Uso = scarichi
        manuali, kit teak/tappezzeria assegnati o venduti, parabrezza e
        gelcoat alla consegna cliente.
      </div>
    </div>
  );
}

function formatItDate(date: string | null) {
  if (!date) return "-";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
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

      <div style={{ fontSize: 24, fontWeight: 850, marginTop: 7, letterSpacing: "-0.5px" }}>
        {value}
      </div>

      <div style={{ fontSize: 12, opacity: 0.55, marginTop: 4 }}>{subtitle}</div>
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

const headerRightStyle = { ...headerStyle, textAlign: "right" as const };
const cellStyle = { padding: "12px 14px", fontSize: 14 };
const rightCellStyle = { ...cellStyle, textAlign: "right" as const, whiteSpace: "nowrap" as const };
