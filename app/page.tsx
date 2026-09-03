"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

type Supplier = {
  id: string;
  name: string;
};

type Item = {
  id: string;
  supplier_id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  price: number;
  stock: number;
  min_stock: number;
  on_order: number;
};

type Order = {
  id: string;
  supplier_id: string;
  status: string;
  order_date: string | null;
  created_at: string | null;
};

type LowStockItem = Item & {
  qty_to_order: number;
};

export default function Home() {
  const router = useRouter();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setErrorMessage("");

    /*
      FORNITORI
    */
    const { data: suppliersData, error: suppliersError } =
      await supabase
        .from("suppliers")
        .select("id,name")
        .order("name");

    if (suppliersError) {
      setErrorMessage(
        "Errore caricamento fornitori: " +
          suppliersError.message
      );

      setLoading(false);
      return;
    }

    /*
      ARTICOLI
    */
    const { data: itemsData, error: itemsError } =
      await supabase
        .from("items")
        .select(
          "id,supplier_id,code,supplier_code,description,price,stock,min_stock,on_order"
        );

    if (itemsError) {
      setErrorMessage(
        "Errore caricamento articoli: " +
          itemsError.message
      );

      setLoading(false);
      return;
    }

    /*
      ORDINI
    */
    const { data: ordersData, error: ordersError } =
      await supabase
        .from("orders")
        .select(
          "id,supplier_id,status,order_date,created_at"
        )
        .order("order_date", {
          ascending: false,
        });

    if (ordersError) {
      setErrorMessage(
        "Errore caricamento ordini: " +
          ordersError.message
      );

      setLoading(false);
      return;
    }

    const cleanSuppliers: Supplier[] =
      (suppliersData || []).map((row) => ({
        id: String(row.id),
        name: String(row.name || ""),
      }));

    const cleanItems: Item[] =
      (itemsData || []).map((row) => ({
        id: String(row.id),

        supplier_id:
          String(row.supplier_id),

        code:
          String(row.code || ""),

        supplier_code:
          row.supplier_code
            ? String(row.supplier_code)
            : null,

        description:
          String(row.description || ""),

        price:
          Number(row.price || 0),

        stock:
          Number(row.stock || 0),

        min_stock:
          Number(row.min_stock || 0),

        on_order:
          Number(row.on_order || 0),
      }));

    const cleanOrders: Order[] =
      (ordersData || []).map((row) => ({
        id: String(row.id),

        supplier_id:
          String(row.supplier_id),

        status:
          String(row.status || ""),

        order_date:
          row.order_date
            ? String(row.order_date)
            : null,

        created_at:
          row.created_at
            ? String(row.created_at)
            : null,
      }));

    setSuppliers(cleanSuppliers);
    setItems(cleanItems);
    setOrders(cleanOrders);

    setLoading(false);
  }

  /*
    MAPPA FORNITORI
  */
  const supplierMap = useMemo(() => {
    const map = new Map<string, string>();

    suppliers.forEach((supplier) => {
      map.set(
        supplier.id,
        supplier.name
      );
    });

    return map;
  }, [suppliers]);

  /*
    ARTICOLI DA RIORDINARE

    Scorta minima
    - Giacenza
    - Già in ordine
  */
  const lowStockItems =
    useMemo<LowStockItem[]>(() => {
      return items
        .map((item) => ({
          ...item,

          qty_to_order: Math.max(
            0,
            item.min_stock -
              item.stock -
              item.on_order
          ),
        }))
        .filter(
          (item) =>
            item.qty_to_order > 0
        )
        .sort(
          (a, b) =>
            b.qty_to_order -
            a.qty_to_order
        );
    }, [items]);

  /*
    ORDINI APERTI
  */
  const openOrders =
    useMemo(() => {
      return orders.filter(
        (order) =>
          order.status === "ordered" ||
          order.status === "partial"
      );
    }, [orders]);

  /*
    MERCE IN ARRIVO
  */
  const totalOnOrder =
    useMemo(() => {
      return items.reduce(
        (sum, item) =>
          sum + item.on_order,
        0
      );
    }, [items]);

  /*
    VALORE MAGAZZINO
  */
  const warehouseValue =
    useMemo(() => {
      return items.reduce(
        (sum, item) =>
          sum +
          item.stock *
            item.price,
        0
      );
    }, [items]);

  /*
    PEZZI TOTALI IN MAGAZZINO
  */
  const totalStockPieces =
    useMemo(() => {
      return items.reduce(
        (sum, item) =>
          sum + item.stock,
        0
      );
    }, [items]);

  if (loading) {
    return (
      <div
        style={{
          maxWidth: 1500,
          margin: "0 auto",
          padding: "35px 20px",
          opacity: 0.6,
        }}
      >
        Caricamento Dashboard...
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1500,
        margin: "0 auto",
      }}
    >
      {/* TESTATA */}

      <div
        style={{
          marginBottom: 26,
        }}
      >
        <div
          style={{
            fontSize: 13,
            opacity: 0.55,
            textTransform: "uppercase",
            letterSpacing: 1.2,
            fontWeight: 800,
            marginBottom: 5,
          }}
        >
          Panoramica generale
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: 34,
            fontWeight: 900,
            letterSpacing: "-0.5px",
          }}
        >
          Dashboard Magazzino
        </h1>

        <div
          style={{
            marginTop: 7,
            fontSize: 14,
            opacity: 0.6,
          }}
        >
          Situazione aggiornata di magazzino,
          scorte e ordini.
        </div>
      </div>

      {/* ERRORE */}

      {errorMessage && (
        <div
          style={{
            marginBottom: 20,

            padding:
              "14px 16px",

            borderRadius: 10,

            border:
              "1px solid rgba(239,68,68,0.4)",

            background:
              "rgba(239,68,68,0.08)",

            color: "#ef4444",

            fontWeight: 700,
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* CARTE PRINCIPALI */}

      <div
        style={{
          display: "grid",

          gridTemplateColumns:
            "repeat(auto-fit, minmax(230px, 1fr))",

          gap: 15,

          marginBottom: 18,
        }}
      >
        <DashboardCard
          title="Da riordinare"
          value={String(
            lowStockItems.length
          )}
          subtitle="Codici sotto scorta"
          icon="⚠"
          onClick={() =>
            router.push(
              "/low-stock-report"
            )
          }
        />

        <DashboardCard
          title="Merce in arrivo"
          value={`${formatNumber(
            totalOnOrder
          )} pz`}
          subtitle="Quantità già ordinate"
          icon="↓"
          onClick={() =>
            router.push(
              "/orders"
            )
          }
        />

        <DashboardCard
          title="Ordini aperti"
          value={String(
            openOrders.length
          )}
          subtitle="In ordine o parziali"
          icon="□"
          onClick={() =>
            router.push(
              "/orders"
            )
          }
        />

        <DashboardCard
          title="Valore magazzino"
          value={formatEuro(
            warehouseValue
          )}
          subtitle="Giacenza × prezzo"
          icon="€"
        />
      </div>

      {/* DATI SECONDARI */}

      <div
        style={{
          display: "grid",

          gridTemplateColumns:
            "repeat(auto-fit, minmax(180px, 1fr))",

          gap: 12,

          marginBottom: 25,
        }}
      >
        <SmallInfoCard
          label="Articoli totali"
          value={formatNumber(
            items.length
          )}
        />

        <SmallInfoCard
          label="Pezzi in magazzino"
          value={formatNumber(
            totalStockPieces
          )}
        />

        <SmallInfoCard
          label="Fornitori"
          value={formatNumber(
            suppliers.length
          )}
        />
      </div>

      {/* DUE COLONNE */}

      <div
        style={{
          display: "grid",

          gridTemplateColumns:
            "repeat(auto-fit, minmax(470px, 1fr))",

          gap: 18,

          alignItems: "start",
        }}
      >
        {/* ARTICOLI DA RIORDINARE */}

        <div style={panelStyle}>
          <PanelHeader
            title="Articoli da riordinare"
            subtitle="Le priorità attuali del magazzino"
            buttonText="Vedi tutti"
            onClick={() =>
              router.push(
                "/low-stock-report"
              )
            }
          />

          {lowStockItems.length === 0 ? (
            <EmptyBox
              text="Nessun articolo da riordinare."
            />
          ) : (
            <div>
              {lowStockItems
                .slice(0, 6)
                .map((item) => (
                  <div
                    key={item.id}
                    style={rowStyle}
                  >
                    <div
                      style={{
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 850,
                        }}
                      >
                        {item.supplier_code ||
                          item.code ||
                          "-"}
                      </div>

                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 12,
                          opacity: 0.65,
                          overflow: "hidden",
                          textOverflow:
                            "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.description}
                      </div>

                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 11,
                          opacity: 0.45,
                        }}
                      >
                        {supplierMap.get(
                          item.supplier_id
                        ) ||
                          "Fornitore"}
                      </div>
                    </div>

                    <div
                      style={{
                        textAlign: "right",
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 900,
                          color: "#f59e0b",
                        }}
                      >
                        +
                        {
                          item.qty_to_order
                        }
                      </div>

                      <div
                        style={{
                          fontSize: 10,
                          opacity: 0.5,
                        }}
                      >
                        da ordinare
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* ORDINI APERTI */}

        <div style={panelStyle}>
          <PanelHeader
            title="Ordini da ricevere"
            subtitle="Ordini ancora aperti"
            buttonText="Tutti gli ordini"
            onClick={() =>
              router.push(
                "/orders"
              )
            }
          />

          {openOrders.length === 0 ? (
            <EmptyBox
              text="Nessun ordine aperto."
            />
          ) : (
            <div>
              {openOrders
                .slice(0, 6)
                .map((order) => (
                  <button
                    type="button"
                    key={order.id}
                    onClick={() =>
                      router.push(
                        `/orders/${order.id}`
                      )
                    }
                    style={{
                      ...rowButtonStyle,
                      width: "100%",
                    }}
                  >
                    <div
                      style={{
                        textAlign: "left",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 850,
                        }}
                      >
                        {supplierMap.get(
                          order.supplier_id
                        ) ||
                          "Fornitore"}
                      </div>

                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 11,
                          opacity: 0.5,
                        }}
                      >
                        {formatDate(
                          order.order_date ||
                            order.created_at
                        )}
                      </div>
                    </div>

                    <StatusBadge
                      status={
                        order.status
                      }
                    />
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- COMPONENTI ---------------- */

function DashboardCard({
  title,
  value,
  subtitle,
  icon,
  onClick,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{
        padding: 20,

        border:
          "1px solid var(--border-color)",

        borderRadius: 14,

        background:
          "var(--card)",

        color:
          "var(--foreground)",

        textAlign: "left",

        cursor: onClick
          ? "pointer"
          : "default",

        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",

          justifyContent:
            "space-between",

          alignItems:
            "flex-start",

          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,

            opacity: 0.55,

            textTransform:
              "uppercase",

            letterSpacing: 0.9,

            fontWeight: 800,
          }}
        >
          {title}
        </div>

        <div
          style={{
            width: 36,
            height: 36,

            borderRadius: 10,

            border:
              "1px solid var(--border-color)",

            display: "flex",

            alignItems: "center",

            justifyContent:
              "center",

            fontSize: 17,

            fontWeight: 900,

            background:
              "var(--input-bg)",
          }}
        >
          {icon}
        </div>
      </div>

      <div
        style={{
          marginTop: 12,

          fontSize: 28,

          fontWeight: 900,

          letterSpacing:
            "-0.4px",
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop: 5,

          fontSize: 12,

          opacity: 0.5,
        }}
      >
        {subtitle}
      </div>
    </button>
  );
}

function SmallInfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        padding:
          "13px 16px",

        border:
          "1px solid var(--border-color)",

        borderRadius: 10,

        background:
          "var(--card)",

        display: "flex",

        justifyContent:
          "space-between",

        alignItems:
          "center",

        gap: 15,
      }}
    >
      <div
        style={{
          fontSize: 12,
          opacity: 0.55,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 17,
          fontWeight: 850,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
  buttonText,
  onClick,
}: {
  title: string;
  subtitle: string;
  buttonText: string;
  onClick: () => void;
}) {
  return (
    <div
      style={{
        padding:
          "16px 18px",

        display: "flex",

        justifyContent:
          "space-between",

        alignItems:
          "center",

        gap: 15,

        borderBottom:
          "1px solid var(--border-color)",

        background:
          "var(--table-head)",
      }}
    >
      <div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 850,
          }}
        >
          {title}
        </div>

        <div
          style={{
            marginTop: 3,

            fontSize: 11,

            opacity: 0.5,
          }}
        >
          {subtitle}
        </div>
      </div>

      <button
        type="button"
        onClick={onClick}
        style={{
          padding:
            "8px 11px",

          borderRadius: 7,

          border:
            "1px solid var(--border-color)",

          background:
            "var(--input-bg)",

          color:
            "var(--foreground)",

          cursor: "pointer",

          fontSize: 11,

          fontWeight: 800,
        }}
      >
        {buttonText}
      </button>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  if (
    status === "partial"
  ) {
    return (
      <span
        style={{
          ...badgeStyle,

          color: "#f59e0b",

          border:
            "1px solid rgba(245,158,11,0.35)",

          background:
            "rgba(245,158,11,0.10)",
        }}
      >
        PARZIALE
      </span>
    );
  }

  return (
    <span
      style={{
        ...badgeStyle,

        color: "#3b82f6",

        border:
          "1px solid rgba(59,130,246,0.35)",

        background:
          "rgba(59,130,246,0.10)",
      }}
    >
      IN ORDINE
    </span>
  );
}

function EmptyBox({
  text,
}: {
  text: string;
}) {
  return (
    <div
      style={{
        padding: 35,

        textAlign:
          "center",

        opacity: 0.5,

        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}

/* ---------------- FORMATTAZIONE ---------------- */

function formatEuro(
  value: number
) {
  return new Intl.NumberFormat(
    "it-IT",
    {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }
  ).format(
    Number(value || 0)
  );
}

function formatNumber(
  value: number
) {
  return new Intl.NumberFormat(
    "it-IT"
  ).format(
    Number(value || 0)
  );
}

function formatDate(
  value: string | null
) {
  if (!value) {
    return "-";
  }

  const safeValue =
    value.includes("T")
      ? value
      : `${value}T00:00:00`;

  const date =
    new Date(safeValue);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "it-IT",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  ).format(date);
}

/* ---------------- STILI ---------------- */

const panelStyle = {
  border:
    "1px solid var(--border-color)",

  borderRadius: 13,

  overflow: "hidden",

  background:
    "var(--card)",
};

const rowStyle = {
  padding:
    "13px 16px",

  display: "flex",

  justifyContent:
    "space-between",

  alignItems:
    "center",

  gap: 18,

  borderTop:
    "1px solid var(--border-color)",
};

const rowButtonStyle = {
  padding:
    "13px 16px",

  display: "flex",

  justifyContent:
    "space-between",

  alignItems:
    "center",

  gap: 18,

  border: "none",

  borderTop:
    "1px solid var(--border-color)",

  background:
    "transparent",

  color:
    "var(--foreground)",

  cursor: "pointer",
};

const badgeStyle = {
  display:
    "inline-block",

  padding:
    "5px 8px",

  borderRadius: 999,

  fontSize: 10,

  fontWeight: 850,

  whiteSpace:
    "nowrap" as const,
};