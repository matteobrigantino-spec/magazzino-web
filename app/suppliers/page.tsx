"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

type Supplier = {
  id: string;
  name: string;
};

type SupplierWithCount = Supplier & {
  item_count: number;
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<SupplierWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadSuppliers();
  }, []);

  async function loadSuppliers() {
    setLoading(true);
    setErrorMessage("");

    const { data: supplierData, error: supplierError } =
      await supabase
        .from("suppliers")
        .select("id,name")
        .order("name");

    if (supplierError) {
      setErrorMessage(supplierError.message);
      setLoading(false);
      return;
    }

    const { data: itemData, error: itemError } =
      await supabase
        .from("items")
        .select("supplier_id");

    if (itemError) {
      setErrorMessage(itemError.message);
      setLoading(false);
      return;
    }

    const countMap = new Map<string, number>();

    (itemData || []).forEach((item) => {
      if (!item.supplier_id) return;

      countMap.set(
        item.supplier_id,
        (countMap.get(item.supplier_id) || 0) + 1
      );
    });

    const result: SupplierWithCount[] = (supplierData || []).map(
      (supplier) => ({
        id: supplier.id,
        name: supplier.name,
        item_count: countMap.get(supplier.id) || 0,
      })
    );

    setSuppliers(result);
    setLoading(false);
  }

  const filteredSuppliers = useMemo(() => {
    const text = search.trim().toLowerCase();

    if (!text) {
      return suppliers;
    }

    return suppliers.filter((supplier) =>
      supplier.name.toLowerCase().includes(text)
    );
  }, [suppliers, search]);

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
            Anagrafica
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: "-0.5px",
            }}
          >
            Fornitori
          </h1>

          <div
            style={{
              marginTop: 6,
              opacity: 0.6,
              fontSize: 14,
            }}
          >
            Gestisci i fornitori e accedi rapidamente ai relativi articoli.
          </div>
        </div>

        <Link
          href="/suppliers/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "11px 16px",
            borderRadius: 8,
            border: "1px solid var(--foreground)",
            background: "var(--foreground)",
            color: "var(--background)",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          + Nuovo fornitore
        </Link>
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
            flex: "1 1 360px",
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
            placeholder="Cerca fornitore..."
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

        <div
          style={{
            fontSize: 13,
            opacity: 0.6,
            padding: "0 5px",
          }}
        >
          {filteredSuppliers.length} risultati
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
        <div
          style={{
            padding: "14px 18px",
            background: "var(--table-head)",
            borderBottom: "1px solid var(--border-color)",
            fontSize: 13,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            opacity: 0.7,
          }}
        >
          Elenco fornitori
        </div>

        {loading ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              opacity: 0.55,
            }}
          >
            Caricamento fornitori...
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              opacity: 0.55,
            }}
          >
            Nessun fornitore trovato.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 14,
              padding: 14,
            }}
          >
            {filteredSuppliers.map((supplier) => (
              <Link
                key={supplier.id}
                href={`/suppliers/${supplier.id}`}
                style={{
                  display: "block",
                  padding: 18,
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  background: "var(--input-bg)",
                  color: "var(--foreground)",
                  textDecoration: "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 17,
                        fontWeight: 850,
                        letterSpacing: "-0.2px",
                      }}
                    >
                      {supplier.name}
                    </div>

                    <div
                      style={{
                        marginTop: 5,
                        fontSize: 12,
                        opacity: 0.55,
                      }}
                    >
                      Apri magazzino fornitore
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: 20,
                      opacity: 0.4,
                    }}
                  >
                    →
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 18,
                    paddingTop: 14,
                    borderTop: "1px solid var(--border-color)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      opacity: 0.55,
                      textTransform: "uppercase",
                      fontWeight: 700,
                      letterSpacing: 0.5,
                    }}
                  >
                    Articoli
                  </span>

                  <span
                    style={{
                      display: "inline-flex",
                      minWidth: 34,
                      justifyContent: "center",
                      padding: "5px 9px",
                      borderRadius: 20,
                      background:
                        supplier.item_count > 0
                          ? "rgba(34,197,94,0.12)"
                          : "rgba(148,163,184,0.12)",
                      border:
                        supplier.item_count > 0
                          ? "1px solid rgba(34,197,94,0.28)"
                          : "1px solid var(--border-color)",
                      fontWeight: 850,
                      fontSize: 13,
                    }}
                  >
                    {supplier.item_count}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}