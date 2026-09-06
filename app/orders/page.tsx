"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type Supplier = {
  id: string;
  name: string;
};

type Order = {
  id: string;
  supplier_id: string;
  status: string;
  order_date: string | null;
  created_at: string | null;
  pdf_url: string | null;
  pdf_path: string | null;
};

type OrderItem = {
  id: string;
  order_id: string;
  item_id: string;
  qty: number;
  received_qty: number;
  unit_price?: number;
};

type SupplierRow = {
  id: string;
  name: string;
  openOrders: number;
  historyOrders: number;
};

type OrderView = Order & {
  supplier_name: string;
  total: number | null;
  totalLines: number;
  totalQty: number;
  receivedQty: number;
  remainingQty: number;
};

type Permissions = {
  view_prices?: boolean;
  orders?: boolean;
  create_orders?: boolean;
};

function readPermissions() {
  const role = localStorage.getItem("magazzino_role");

  let permissions: Permissions = {};

  try {
    const saved = localStorage.getItem("magazzino_permissions");

    if (saved) {
      const parsed = JSON.parse(saved);

      if (parsed && typeof parsed === "object") {
        permissions = parsed as Permissions;
      }
    }
  } catch {
    permissions = {};
  }

  return {
    canViewPrices:
      role === "admin" || permissions.view_prices === true,
    canCreateOrders:
      role === "admin" || permissions.create_orders === true,
  };
}

export default function OrdersPage() {
  const router = useRouter();

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [canViewPrices, setCanViewPrices] = useState(false);
  const [canCreateOrders, setCanCreateOrders] = useState(false);

  useEffect(() => {
    const access = readPermissions();

    setCanViewPrices(access.canViewPrices);
    setCanCreateOrders(access.canCreateOrders);

    loadData(access.canViewPrices);
  }, []);

  async function loadData(viewPrices: boolean) {
    setLoading(true);

    const { data: suppliersData, error: suppliersError } = await supabase
      .from("suppliers")
      .select("id,name")
      .order("name");

    if (suppliersError) {
      alert("Errore fornitori: " + suppliersError.message);
      setLoading(false);
      return;
    }

    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select(
        "id,supplier_id,status,order_date,created_at,pdf_url,pdf_path"
      )
      .order("created_at", { ascending: false });

    if (ordersError) {
      alert("Errore ordini: " + ordersError.message);
      setLoading(false);
      return;
    }

    let orderItems: OrderItem[] = [];

    if (viewPrices) {
      const {
        data,
        error,
      } = await supabase
        .from("order_items")
        .select(
          "id,order_id,item_id,qty,received_qty,unit_price"
        );

      if (error) {
        alert(
          "Errore righe ordine: " +
            error.message
        );
        setLoading(false);
        return;
      }

      orderItems =
        (data || []).map(
          (row) => ({
            id: String(row.id),
            order_id:
              String(row.order_id),
            item_id:
              String(row.item_id),
            qty:
              Number(row.qty || 0),
            received_qty:
              Number(
                row.received_qty || 0
              ),
            unit_price:
              Number(
                row.unit_price || 0
              ),
          })
        );
    } else {
      const {
        data,
        error,
      } = await supabase
        .from("order_items")
        .select(
          "id,order_id,item_id,qty,received_qty"
        );

      if (error) {
        alert(
          "Errore righe ordine: " +
            error.message
        );
        setLoading(false);
        return;
      }

      orderItems =
        (data || []).map(
          (row) => ({
            id: String(row.id),
            order_id:
              String(row.order_id),
            item_id:
              String(row.item_id),
            qty:
              Number(row.qty || 0),
            received_qty:
              Number(
                row.received_qty || 0
              ),
            unit_price: 0,
          })
        );
    }

    const supplierList = (suppliersData || []) as Supplier[];
    const orderList = (ordersData || []) as Order[];

    const supplierMap = new Map<string, string>();

    supplierList.forEach((supplier) => {
      supplierMap.set(supplier.id, supplier.name);
    });

    const orderViews: OrderView[] = orderList.map((order) => {
      const lines = orderItems.filter(
        (line) => line.order_id === order.id
      );

      const total = viewPrices
        ? lines.reduce((sum, line) => {
            return (
              sum +
              Number(line.qty || 0) *
                Number(line.unit_price || 0)
            );
          }, 0)
        : null;

      const totalQty = lines.reduce((sum, line) => {
        return sum + Number(line.qty || 0);
      }, 0);

      const receivedQty = lines.reduce((sum, line) => {
        return sum + Number(line.received_qty || 0);
      }, 0);

      return {
        ...order,
        supplier_name:
          supplierMap.get(order.supplier_id) ||
          "Fornitore sconosciuto",
        total,
        totalLines: lines.length,
        totalQty,
        receivedQty,
        remainingQty: Math.max(0, totalQty - receivedQty),
      };
    });

    const supplierRows: SupplierRow[] = supplierList.map(
      (supplier) => {
        const supplierOrders = orderViews.filter(
          (order) => order.supplier_id === supplier.id
        );

        const openOrders = supplierOrders.filter((order) =>
          ["draft", "ordered", "partial"].includes(order.status)
        ).length;

        const historyOrders = supplierOrders.filter((order) =>
          ["received", "cancelled"].includes(order.status)
        ).length;

        return {
          id: supplier.id,
          name: supplier.name,
          openOrders,
          historyOrders,
        };
      }
    );

    setSuppliers(supplierRows);
    setOrders(orderViews);
    setLoading(false);
  }

  const filteredSuppliers = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return suppliers;

    return suppliers.filter((supplier) =>
      supplier.name.toLowerCase().includes(term)
    );
  }, [suppliers, search]);

  const openOrders = useMemo(() => {
    const allowedStatuses = canCreateOrders
      ? ["draft", "ordered", "partial"]
      : ["ordered", "partial"];

    return orders.filter((order) =>
      allowedStatuses.includes(order.status)
    );
  }, [orders, canCreateOrders]);

  const historyOrders = useMemo(() => {
    return orders.filter((order) =>
      ["received", "cancelled"].includes(order.status)
    );
  }, [orders]);

  if (loading) {
    return (
      <div
        style={{
          maxWidth: 1500,
          margin: "0 auto",
          padding: 30,
          opacity: 0.65,
        }}
      >
        Caricamento ordini...
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
            fontWeight: 850,
            letterSpacing: "-0.5px",
          }}
        >
          Ordini
        </h1>

        <div
          style={{
            marginTop: 6,
            opacity: 0.6,
            fontSize: 14,
          }}
        >
          {canCreateOrders
            ? "Seleziona un fornitore per preparare un nuovo ordine."
            : "Controlla la merce ordinata che deve ancora arrivare."}
        </div>
      </div>

      {canCreateOrders && (
        <div
          style={{
            marginBottom: 34,
          }}
        >
          <SectionTitle
            title="Fornitori"
            subtitle="Apri un fornitore per creare o modificare un ordine"
          />

          <div
            style={{
              marginBottom: 16,
              padding: 14,
              border: "1px solid var(--border-color)",
              borderRadius: 12,
              background: "var(--card)",
            }}
          >
            <input
              type="text"
              placeholder="Cerca fornitore..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "11px 13px",
                borderRadius: 8,
                border: "1px solid var(--border-color)",
                background: "var(--input-bg)",
                color: "var(--foreground)",
                outline: "none",
                fontSize: 14,
              }}
            />
          </div>

          {filteredSuppliers.length === 0 ? (
            <EmptyCard
              title="Nessun fornitore trovato"
              subtitle="Prova con un altro nome."
            />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 16,
              }}
            >
              {filteredSuppliers.map((supplier) => (
                <button
                  key={supplier.id}
                  type="button"
                  onClick={() =>
                    router.push(
                      `/orders/supplier/${supplier.id}`
                    )
                  }
                  style={{
                    textAlign: "left",
                    padding: 20,
                    border:
                      "1px solid var(--border-color)",
                    borderRadius: 12,
                    background: "var(--card)",
                    color: "var(--foreground)",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 19,
                          fontWeight: 850,
                        }}
                      >
                        {supplier.name}
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.55,
                          marginTop: 5,
                        }}
                      >
                        Clicca per preparare l&apos;ordine
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 24,
                        opacity: 0.4,
                      }}
                    >
                      →
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 18,
                    }}
                  >
                    {supplier.openOrders > 0 && (
                      <Badge
                        text={`${supplier.openOrders} aperti`}
                        type="warning"
                      />
                    )}

                    {supplier.historyOrders > 0 && (
                      <Badge
                        text={`${supplier.historyOrders} storico`}
                        type="neutral"
                      />
                    )}

                    {supplier.openOrders === 0 &&
                      supplier.historyOrders === 0 && (
                        <Badge
                          text="Nessun ordine"
                          type="neutral"
                        />
                      )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          marginBottom: 34,
        }}
      >
        <SectionTitle
          title={canCreateOrders ? "Ordini aperti" : "Merce in arrivo"}
          subtitle={
            canCreateOrders
              ? "Ordini inviati, bozze o parzialmente ricevuti"
              : "Ordini inviati o parzialmente ricevuti ancora da completare"
          }
        />

        {openOrders.length === 0 ? (
          <EmptyCard
            title="Nessun ordine aperto"
            subtitle="Gli ordini confermati compariranno qui."
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {openOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                canViewPrices={canViewPrices}
                onOpen={() =>
                  router.push(`/orders/${order.id}`)
                }
              />
            ))}
          </div>
        )}
      </div>

      {canCreateOrders && (
        <div>
          <SectionTitle
            title="Storico ordini"
            subtitle="Ordini ricevuti o annullati"
          />

          {historyOrders.length === 0 ? (
            <EmptyCard
              title="Storico vuoto"
              subtitle="Gli ordini completati compariranno qui."
            />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {historyOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  canViewPrices={canViewPrices}
                  onOpen={() =>
                    router.push(`/orders/${order.id}`)
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  canViewPrices,
  onOpen,
}: {
  order: OrderView;
  canViewPrices: boolean;
  onOpen: () => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: 12,
        background: "var(--card)",
        padding: 18,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 20,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 850,
            }}
          >
            {order.supplier_name}
          </div>

          <StatusBadge status={order.status} />
        </div>

        <div
          style={{
            marginTop: 7,
            fontSize: 12,
            opacity: 0.55,
          }}
        >
          Ordine del {formatDate(order.order_date)}
        </div>

        <div
          style={{
            display: "flex",
            gap: 18,
            flexWrap: "wrap",
            marginTop: 12,
            fontSize: 13,
          }}
        >
          <span>
            <strong>{order.totalLines}</strong> articoli
          </span>

          <span>
            <strong>{order.totalQty}</strong> pezzi
          </span>

          {order.status === "partial" && (
            <span>
              Ricevuti{" "}
              <strong>
                {order.receivedQty}/{order.totalQty}
              </strong>
            </span>
          )}

          {["ordered", "partial"].includes(order.status) && (
            <span>
              Da ricevere{" "}
              <strong>{order.remainingQty}</strong>
            </span>
          )}

          {canViewPrices && order.total !== null && (
            <span>
              <strong>{formatEuro(order.total)}</strong>
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        {canViewPrices && order.pdf_url && (
          <a
            href={order.pdf_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              padding: "9px 13px",
              borderRadius: 8,
              border:
                "1px solid var(--border-color)",
              color: "var(--foreground)",
              textDecoration: "none",
              fontWeight: 750,
              fontSize: 13,
            }}
          >
            PDF
          </a>
        )}

        <button
          type="button"
          onClick={onOpen}
          style={{
            padding: "10px 15px",
            borderRadius: 8,
            border: "1px solid var(--foreground)",
            background: "var(--foreground)",
            color: "var(--background)",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          Apri ordine
        </button>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  if (status === "received") {
    return <Badge text="RICEVUTO" type="success" />;
  }

  if (status === "partial") {
    return <Badge text="PARZIALE" type="warning" />;
  }

  if (status === "cancelled") {
    return <Badge text="ANNULLATO" type="danger" />;
  }

  if (status === "draft") {
    return <Badge text="BOZZA" type="neutral" />;
  }

  return <Badge text="IN ORDINE" type="info" />;
}

function Badge({
  text,
  type,
}: {
  text: string;
  type:
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "neutral";
}) {
  let background = "rgba(148,163,184,0.12)";
  let border = "1px solid rgba(148,163,184,0.3)";
  let color = "var(--foreground)";

  if (type === "success") {
    background = "rgba(34,197,94,0.12)";
    border = "1px solid rgba(34,197,94,0.35)";
    color = "#22c55e";
  }

  if (type === "warning") {
    background = "rgba(245,158,11,0.12)";
    border = "1px solid rgba(245,158,11,0.35)";
    color = "#f59e0b";
  }

  if (type === "danger") {
    background = "rgba(239,68,68,0.12)";
    border = "1px solid rgba(239,68,68,0.35)";
    color = "#ef4444";
  }

  if (type === "info") {
    background = "rgba(59,130,246,0.12)";
    border = "1px solid rgba(59,130,246,0.35)";
    color = "#3b82f6";
  }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "5px 9px",
        borderRadius: 20,
        background,
        border,
        color,
        fontSize: 11,
        fontWeight: 800,
      }}
    >
      {text}
    </span>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontSize: 21,
          fontWeight: 850,
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: 3,
          fontSize: 13,
          opacity: 0.55,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

function EmptyCard({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        padding: 34,
        textAlign: "center",
        border: "1px solid var(--border-color)",
        borderRadius: 12,
        background: "var(--card)",
      }}
    >
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: 5,
          fontSize: 13,
          opacity: 0.55,
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

function formatDate(value: string | null) {
  if (!value) return "-";

  const safeValue = value.includes("T")
    ? value
    : `${value}T00:00:00`;

  return new Intl.DateTimeFormat("it-IT").format(
    new Date(safeValue)
  );
}