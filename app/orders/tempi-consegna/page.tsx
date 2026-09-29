"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

/*
  TEMPI DI CONSEGNA (STEP 59)

  Report unico su tutti i fornitori: quanto ci mette davvero ognuno a
  consegnare (tempo medio in giorni, dall'ordine all'arrivo), stesso
  calcolo gia' usato nella scheda del singolo fornitore (STEP 36) ma
  qui su tutti insieme, ordinati dal piu' lento. In piu':

  - un elenco degli ordini ancora aperti che hanno gia' superato la
    data di consegna richiesta, per vedere i ritardi PRIMA che
    diventino un problema (nessun dato nuovo necessario, gia' tutto
    in orders/order_items);
  - lo stesso tempo medio ma per singolo ARTICOLO, possibile da
    quando order_items.received_at viene registrato riga per riga
    (STEP 59): si accumula da questo momento in avanti, non c'e'
    storico prima di questo step.
*/

type OrderRow = {
  id: string;
  order_number: number | null;
  supplier_id: string;
  status: string;
  order_date: string | null;
  requested_delivery_date: string | null;
  received_at: string | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  item_id: string;
  received_at: string | null;
};

type SupplierLeadTime = {
  supplierId: string;
  supplierName: string;
  count: number;
  avgDays: number;
  minDays: number;
  maxDays: number;
};

type ItemLeadTime = {
  itemId: string;
  code: string;
  description: string;
  supplierName: string;
  count: number;
  avgDays: number;
};

type OverdueOrder = {
  id: string;
  orderNumber: number | null;
  supplierName: string;
  requestedDeliveryDate: string;
  daysLate: number;
};

export default function TempiConsegnaPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [itemSearch, setItemSearch] = useState("");

  const [overdueOrders, setOverdueOrders] = useState<OverdueOrder[]>([]);
  const [supplierLeadTimes, setSupplierLeadTimes] = useState<
    SupplierLeadTime[]
  >([]);
  const [itemLeadTimes, setItemLeadTimes] = useState<ItemLeadTime[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const [suppliersRes, ordersRes] = await Promise.all([
      supabase.from("suppliers").select("id,name"),
      supabase
        .from("orders")
        .select(
          "id,order_number,supplier_id,status,order_date,requested_delivery_date,received_at"
        ),
    ]);

    if (suppliersRes.error || ordersRes.error) {
      setErrorMessage(
        "Errore caricamento: " +
          (suppliersRes.error?.message || ordersRes.error?.message)
      );
      setLoading(false);
      return;
    }

    const supplierNameById: Record<string, string> = {};
    (suppliersRes.data || []).forEach((row: any) => {
      supplierNameById[String(row.id)] = String(row.name || "Fornitore");
    });

    const orders = (ordersRes.data || []) as OrderRow[];

    /*
      ORDINI APERTI IN RITARDO
    */
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const overdue: OverdueOrder[] = orders
      .filter(
        (order) =>
          order.status !== "received" &&
          order.status !== "cancelled" &&
          order.requested_delivery_date
      )
      .map((order) => {
        const requested = new Date(
          `${order.requested_delivery_date}T00:00:00`
        );
        if (Number.isNaN(requested.getTime())) return null;

        const daysLate = Math.floor(
          (todayStart.getTime() - requested.getTime()) / 86400000
        );

        if (daysLate <= 0) return null;

        return {
          id: order.id,
          orderNumber: order.order_number,
          supplierName:
            supplierNameById[order.supplier_id] || "Fornitore",
          requestedDeliveryDate: order.requested_delivery_date as string,
          daysLate,
        };
      })
      .filter((row): row is OverdueOrder => row !== null)
      .sort((a, b) => b.daysLate - a.daysLate);

    setOverdueOrders(overdue);

    /*
      TEMPO MEDIO DI CONSEGNA PER FORNITORE (STEP 36, qui su tutti)
    */
    const daysBySupplier: Record<string, number[]> = {};

    orders
      .filter((order) => order.status === "received")
      .forEach((order) => {
        if (!order.order_date || !order.received_at) return;

        const orderDate = new Date(order.order_date).getTime();
        const receivedDate = new Date(order.received_at).getTime();

        if (
          !Number.isFinite(orderDate) ||
          !Number.isFinite(receivedDate) ||
          receivedDate < orderDate
        ) {
          return;
        }

        const days = (receivedDate - orderDate) / 86400000;
        const list = daysBySupplier[order.supplier_id] || [];
        list.push(days);
        daysBySupplier[order.supplier_id] = list;
      });

    const supplierStats: SupplierLeadTime[] = Object.entries(
      daysBySupplier
    ).map(([supplierId, days]) => ({
      supplierId,
      supplierName: supplierNameById[supplierId] || "Fornitore",
      count: days.length,
      avgDays: days.reduce((sum, v) => sum + v, 0) / days.length,
      minDays: Math.min(...days),
      maxDays: Math.max(...days),
    }));

    supplierStats.sort((a, b) => b.avgDays - a.avgDays);
    setSupplierLeadTimes(supplierStats);

    /*
      TEMPO MEDIO DI CONSEGNA PER ARTICOLO (STEP 59)
    */
    const orderById: Record<string, OrderRow> = {};
    orders.forEach((order) => {
      orderById[order.id] = order;
    });

    const orderItemsRes = await supabase
      .from("order_items")
      .select("id,order_id,item_id,received_at")
      .not("received_at", "is", null);

    if (!orderItemsRes.error) {
      const orderItems = (orderItemsRes.data || []) as OrderItemRow[];

      const daysByItem: Record<string, number[]> = {};

      orderItems.forEach((line) => {
        const order = orderById[line.order_id];
        if (!order || !order.order_date || !line.received_at) return;

        const orderDate = new Date(order.order_date).getTime();
        const receivedDate = new Date(line.received_at).getTime();

        if (
          !Number.isFinite(orderDate) ||
          !Number.isFinite(receivedDate) ||
          receivedDate < orderDate
        ) {
          return;
        }

        const days = (receivedDate - orderDate) / 86400000;
        const list = daysByItem[line.item_id] || [];
        list.push(days);
        daysByItem[line.item_id] = list;
      });

      const itemIds = Object.keys(daysByItem);

      if (itemIds.length > 0) {
        const { data: itemRows } = await supabase
          .from("items")
          .select("id,code,supplier_code,description,supplier_id")
          .in("id", itemIds);

        const itemStats: ItemLeadTime[] = (itemRows || []).map(
          (row: any) => {
            const days = daysByItem[String(row.id)] || [];
            return {
              itemId: String(row.id),
              code: String(row.supplier_code || row.code || "-"),
              description: String(row.description || "-"),
              supplierName:
                supplierNameById[String(row.supplier_id)] || "Fornitore",
              count: days.length,
              avgDays: days.reduce((sum, v) => sum + v, 0) / days.length,
            };
          }
        );

        itemStats.sort((a, b) => b.avgDays - a.avgDays);
        setItemLeadTimes(itemStats);
      } else {
        setItemLeadTimes([]);
      }
    } else {
      // Se received_at non esiste ancora su order_items (STEP 59 non
      // ancora eseguito su Supabase), questa sezione resta vuota
      // senza bloccare il resto del report.
      setItemLeadTimes([]);
    }

    setLoading(false);
  }

  const filteredItemLeadTimes = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return itemLeadTimes;
    return itemLeadTimes.filter((row) =>
      `${row.code} ${row.description} ${row.supplierName}`
        .toLowerCase()
        .includes(q)
    );
  }, [itemLeadTimes, itemSearch]);

  if (loading) {
    return (
      <div style={{ padding: 40, opacity: 0.6, fontSize: 13 }}>
        Caricamento tempi di consegna...
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>
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
            Ordini
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 34,
              fontWeight: 850,
              letterSpacing: "-0.5px",
            }}
          >
            Tempi di consegna
          </h1>

          <div style={{ marginTop: 6, opacity: 0.6, fontSize: 14 }}>
            Quanto ci mette davvero ogni fornitore, per pianificare gli
            ordini con il giusto anticipo.
          </div>
        </div>

        <Link
          href="/orders"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 15px",
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            background: "var(--input-bg)",
            color: "var(--foreground)",
            textDecoration: "none",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          ← Torna a Ordini
        </Link>
      </div>

      {errorMessage && (
        <div
          style={{
            marginBottom: 20,
            padding: "12px 14px",
            borderRadius: 9,
            border: "1px solid rgba(239,68,68,0.45)",
            background: "rgba(239,68,68,0.08)",
            fontSize: 13,
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* ORDINI APERTI IN RITARDO */}
      <SectionTitle
        title="Ordini aperti in ritardo"
        subtitle="Hanno già superato la data di consegna richiesta e non risultano ancora arrivati del tutto."
      />

      {overdueOrders.length === 0 ? (
        <EmptyCard
          title="Nessun ritardo al momento"
          subtitle="Tutti gli ordini aperti sono ancora entro la data richiesta (o non ne hanno una)."
        />
      ) : (
        <div
          style={{
            marginBottom: 34,
            border: "1px solid rgba(239,68,68,0.28)",
            borderRadius: 12,
            overflow: "hidden",
            background: "var(--card)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>N° ordine</Th>
                <Th>Fornitore</Th>
                <Th>Consegna richiesta</Th>
                <Th align="right">Giorni di ritardo</Th>
              </tr>
            </thead>
            <tbody>
              {overdueOrders.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/orders/${row.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <Td>{row.orderNumber ?? "-"}</Td>
                  <Td>{row.supplierName}</Td>
                  <Td>{formatDate(row.requestedDeliveryDate)}</Td>
                  <Td align="right">
                    <span
                      style={{
                        display: "inline-block",
                        padding: "3px 9px",
                        borderRadius: 20,
                        fontSize: 11,
                        fontWeight: 800,
                        border: "1px solid rgba(239,68,68,0.35)",
                        background: "rgba(239,68,68,0.1)",
                        color: "#ef4444",
                      }}
                    >
                      {row.daysLate} {row.daysLate === 1 ? "giorno" : "giorni"}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TEMPO MEDIO PER FORNITORE */}
      <SectionTitle
        title="Tempo medio di consegna per fornitore"
        subtitle="Calcolato sugli ordini già arrivati del tutto: dal fornitore più lento al più veloce."
      />

      {supplierLeadTimes.length === 0 ? (
        <EmptyCard
          title="Ancora nessun dato"
          subtitle="Il tempo medio compare non appena almeno un ordine risulta ricevuto per intero."
        />
      ) : (
        <div
          style={{
            marginBottom: 34,
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            overflow: "hidden",
            background: "var(--card)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>Fornitore</Th>
                <Th align="right">Ordini</Th>
                <Th align="right">Media</Th>
                <Th align="right">Minimo</Th>
                <Th align="right">Massimo</Th>
              </tr>
            </thead>
            <tbody>
              {supplierLeadTimes.map((row) => (
                <tr
                  key={row.supplierId}
                  onClick={() =>
                    router.push(`/orders/supplier/${row.supplierId}`)
                  }
                  style={{ cursor: "pointer" }}
                >
                  <Td>{row.supplierName}</Td>
                  <Td align="right">{row.count}</Td>
                  <Td align="right">
                    <strong>{row.avgDays.toFixed(1)} giorni</strong>
                  </Td>
                  <Td align="right">{row.minDays.toFixed(1)} giorni</Td>
                  <Td align="right">{row.maxDays.toFixed(1)} giorni</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TEMPO MEDIO PER ARTICOLO */}
      <SectionTitle
        title="Tempo medio di consegna per articolo"
        subtitle="Si accumula da adesso in avanti: gli arrivi registrati prima di questo aggiornamento non hanno una data per riga."
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
          placeholder="Cerca articolo o fornitore..."
          value={itemSearch}
          onChange={(e) => setItemSearch(e.target.value)}
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

      {filteredItemLeadTimes.length === 0 ? (
        <EmptyCard
          title="Ancora nessun dato"
          subtitle="Compare qui non appena una riga d'ordine risulta completamente arrivata (anche a pezzi, in momenti diversi)."
        />
      ) : (
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
              <tr>
                <Th>Codice</Th>
                <Th>Descrizione</Th>
                <Th>Fornitore</Th>
                <Th align="right">Arrivi</Th>
                <Th align="right">Media</Th>
              </tr>
            </thead>
            <tbody>
              {filteredItemLeadTimes.map((row) => (
                <tr
                  key={row.itemId}
                  onClick={() => router.push(`/items/${row.itemId}`)}
                  style={{ cursor: "pointer" }}
                >
                  <Td>{row.code}</Td>
                  <Td>{row.description}</Td>
                  <Td>{row.supplierName}</Td>
                  <Td align="right">{row.count}</Td>
                  <Td align="right">
                    <strong>{row.avgDays.toFixed(1)} giorni</strong>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 21, fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: 3, opacity: 0.55, fontSize: 13 }}>
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
        marginBottom: 34,
        padding: 34,
        textAlign: "center",
        border: "1px solid var(--border-color)",
        borderRadius: 12,
        background: "var(--card)",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div>
      <div style={{ marginTop: 6, opacity: 0.55, fontSize: 13 }}>
        {subtitle}
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        padding: "12px 16px",
        textAlign: align,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        opacity: 0.55,
        background: "var(--table-head)",
        borderBottom: "1px solid var(--border-color)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      style={{
        padding: "12px 16px",
        textAlign: align,
        fontSize: 13,
        borderTop: "1px solid var(--border-color)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </td>
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";

  const safeValue = value.includes("T") ? value : `${value}T00:00:00`;

  return new Intl.DateTimeFormat("it-IT").format(new Date(safeValue));
}
