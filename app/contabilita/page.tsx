"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  loadAllInvoices,
  deleteInvoiceById,
  AllInvoice,
} from "../../lib/invoices";
import {
  loadAllPlafondStatuses,
  SupplierPlafondStatus,
} from "../../lib/plafond";

export default function ContabilitaPage() {
  const [canViewPrices, setCanViewPrices] = useState(false);

  const [invoices, setInvoices] = useState<AllInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState("");
  const [search, setSearch] = useState("");

  const [plafondStatuses, setPlafondStatuses] = useState<
    SupplierPlafondStatus[]
  >([]);
  const [plafondLoading, setPlafondLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const role = localStorage.getItem("magazzino_role");
    const savedPermissions = localStorage.getItem("magazzino_permissions");

    let permissions: { view_prices?: boolean } = {};

    try {
      permissions = savedPermissions ? JSON.parse(savedPermissions) : {};
    } catch {
      permissions = {};
    }

    setCanViewPrices(role === "admin" || permissions.view_prices === true);

    setInvoicesLoading(true);
    setPlafondLoading(true);
    setInvoicesError("");

    try {
      const [loadedInvoices, loadedPlafond] = await Promise.all([
        loadAllInvoices(),
        loadAllPlafondStatuses(),
      ]);

      setInvoices(loadedInvoices);
      setPlafondStatuses(loadedPlafond);
    } catch (err) {
      setInvoicesError(
        err instanceof Error ? err.message : "Errore nel caricamento."
      );
    }

    setInvoicesLoading(false);
    setPlafondLoading(false);
  }

  async function deleteInvoice(id: string) {
    const confirmed = confirm(
      'Eliminare questa fattura? Gli articoli collegati torneranno "da fatturare". L\'operazione non si può annullare.'
    );

    if (!confirmed) return;

    const { error } = await deleteInvoiceById(id);

    if (error) {
      alert("Errore: " + error);
      return;
    }

    await loadAll();
  }

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return invoices;
    }

    return invoices.filter((invoice) => {
      const haystack = [
        invoice.supplier_name,
        invoice.invoice_number,
        invoice.archive_code || "",
        ...invoice.items.map((item) => item.order_number || ""),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [invoices, search]);

  return (
    <div style={{ padding: "28px 26px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 22 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 0.6,
            opacity: 0.55,
            textTransform: "uppercase",
          }}
        >
          Gestionale
        </div>

        <h1 style={{ fontSize: 30, fontWeight: 900, margin: "4px 0 0" }}>
          Contabilità
        </h1>

        <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>
          Fatture di tutti i fornitori e stato plafond / dichiarazioni
          d&apos;intento.
        </div>
      </div>

      {/* PLAFOND */}

      <section
        style={{
          marginBottom: 20,
          padding: "18px 20px",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          background: "var(--card)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800 }}>
          Plafond — dichiarazioni d&apos;intento
        </div>

        {plafondLoading && (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.6 }}>
            Caricamento...
          </div>
        )}

        {!plafondLoading && plafondStatuses.length === 0 && (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.6 }}>
            Nessun fornitore richiede la dichiarazione d&apos;intento.
          </div>
        )}

        {!plafondLoading && plafondStatuses.length > 0 && (
          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {plafondStatuses.map((entry) => {
              const isOver =
                entry.status.hasActiveDeclaration &&
                entry.status.available < 0;

              return (
                <Link
                  key={entry.supplier_id}
                  href={`/suppliers/${entry.supplier_id}`}
                  style={{
                    display: "block",
                    padding: 14,
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    background: "var(--input-bg)",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 800 }}>
                    {entry.supplier_name}
                  </div>

                  {!entry.status.hasActiveDeclaration ? (
                    <div
                      style={{ marginTop: 6, fontSize: 13, opacity: 0.6 }}
                    >
                      Nessuna dichiarazione attiva oggi.
                    </div>
                  ) : (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 20,
                        fontWeight: 900,
                        color: isOver ? "#ef4444" : "inherit",
                      }}
                    >
                      {formatEuro(entry.status.available)}{" "}
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        disponibile
                      </span>
                    </div>
                  )}

                  {entry.status.hasActiveDeclaration && isOver && (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#ef4444",
                      }}
                    >
                      Plafond già sforato di{" "}
                      {formatEuro(Math.abs(entry.status.available))}.
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* FATTURE */}

      <section
        style={{
          padding: "18px 20px",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          background: "var(--card)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 800 }}>
            Fatture ({invoices.length})
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per fornitore, numero fattura, ordine..."
            style={{
              padding: "9px 12px",
              borderRadius: 8,
              border: "1px solid var(--border-color)",
              background: "var(--input-bg)",
              color: "var(--foreground)",
              fontSize: 13,
              width: 300,
            }}
          />
        </div>

        {invoicesError && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#ef4444" }}>
            {invoicesError}
          </div>
        )}

        {invoicesLoading && (
          <div style={{ marginTop: 14, fontSize: 13, opacity: 0.6 }}>
            Caricamento...
          </div>
        )}

        {!invoicesLoading && filteredInvoices.length === 0 && (
          <div style={{ marginTop: 14, fontSize: 13, opacity: 0.6 }}>
            {invoices.length === 0
              ? "Nessuna fattura registrata."
              : "Nessuna fattura corrisponde alla ricerca."}
          </div>
        )}

        {filteredInvoices.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {filteredInvoices.map((invoice) => (
              <div
                key={invoice.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 0",
                  borderTop: "1px solid var(--border-color)",
                  fontSize: 13,
                }}
              >
                <div>
                  <Link
                    href={`/suppliers/${invoice.supplier_id}`}
                    style={{ color: "inherit", fontWeight: 800 }}
                  >
                    {invoice.supplier_name}
                  </Link>{" "}
                  <strong>· Fattura {invoice.invoice_number}</strong>{" "}
                  <span style={{ opacity: 0.6 }}>
                    · {formatDateIt(invoice.invoice_date)}
                    {invoice.archive_code
                      ? ` · archivio ${invoice.archive_code}`
                      : ""}
                    {canViewPrices && invoice.amount !== null
                      ? ` · ${formatEuro(invoice.amount)}`
                      : ""}
                    {invoice.note ? ` · ${invoice.note}` : ""}
                  </span>

                  {invoice.items.length > 0 && (
                    <div style={{ marginTop: 4, opacity: 0.6 }}>
                      Articoli:{" "}
                      {invoice.items
                        .map(
                          (item) =>
                            `${item.supplier_code || item.code}${
                              item.order_number
                                ? ` (ordine ${item.order_number})`
                                : ""
                            }`
                        )
                        .join(", ")}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => deleteInvoice(invoice.id)}
                  style={{
                    border: "none",
                    background: "none",
                    color: "#ef4444",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  Elimina
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
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

function formatDateIt(value: string) {
  if (!value) return "";

  const [year, month, day] = value.split("-");

  if (!year || !month || !day) return value;

  return `${day}/${month}/${year}`;
}
