"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

type OrderRow = {
  id: string;
  supplier_id: string;
  status: string;
  order_date: string | null;
  created_at: string | null;
  pdf_url: string | null;
  pdf_path: string | null;
};

type Supplier = {
  id: string;
  name: string;
};

type Item = {
  id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  stock: number;
  on_order: number;
};

type OrderItem = {
  id: string;
  order_id: string;
  item_id: string;
  qty: number;
  received_qty: number;
  unit_price: number;
};

type LineView = {
  id: string;
  item_id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  qty: number;
  received_qty: number;
  remaining_qty: number;
  unit_price: number;
  stock: number;
  on_order: number;
};

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();

  const orderId = String(params.orderId);

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);

  const [lines, setLines] = useState<LineView[]>([]);

  const [incomingQty, setIncomingQty] = useState<
    Record<string, number>
  >({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [message, setMessage] = useState("");

  const [messageType, setMessageType] = useState<
    "success" | "error" | ""
  >("");

  useEffect(() => {
    loadData();
  }, [orderId]);

  async function loadData() {
    setLoading(true);

    const { data: orderData, error: orderError } =
      await supabase
        .from("orders")
        .select(
          "id,supplier_id,status,order_date,created_at,pdf_url,pdf_path"
        )
        .eq("id", orderId)
        .single();

    if (orderError || !orderData) {
      setMessage(
        "Errore caricamento ordine: " +
          (orderError?.message ||
            "Ordine non trovato")
      );

      setMessageType("error");
      setLoading(false);
      return;
    }

    const { data: supplierData, error: supplierError } =
      await supabase
        .from("suppliers")
        .select("id,name")
        .eq("id", orderData.supplier_id)
        .single();

    if (supplierError || !supplierData) {
      setMessage(
        "Errore caricamento fornitore: " +
          (supplierError?.message ||
            "Fornitore non trovato")
      );

      setMessageType("error");
      setLoading(false);
      return;
    }

    const {
      data: orderItemsData,
      error: orderItemsError,
    } = await supabase
      .from("order_items")
      .select(
        "id,order_id,item_id,qty,received_qty,unit_price"
      )
      .eq("order_id", orderId);

    if (orderItemsError) {
      setMessage(
        "Errore caricamento righe ordine: " +
          orderItemsError.message
      );

      setMessageType("error");
      setLoading(false);
      return;
    }

    const orderItems =
      (orderItemsData || []) as OrderItem[];

    const itemIds =
      orderItems.map((line) => line.item_id);

    let itemsData: Item[] = [];

    if (itemIds.length > 0) {
      const { data, error } = await supabase
        .from("items")
        .select(
          "id,code,supplier_code,description,stock,on_order"
        )
        .in("id", itemIds);

      if (error) {
        setMessage(
          "Errore caricamento articoli: " +
            error.message
        );

        setMessageType("error");
        setLoading(false);
        return;
      }

      itemsData = (data || []).map((item) => ({
        ...item,
        stock: Number(item.stock || 0),
        on_order: Number(item.on_order || 0),
      }));
    }

    const itemMap = new Map<string, Item>();

    itemsData.forEach((item) => {
      itemMap.set(item.id, item);
    });

    const lineViews: LineView[] =
      orderItems.map((line) => {
        const item = itemMap.get(line.item_id);

        const qty =
          Number(line.qty || 0);

        const receivedQty =
          Number(line.received_qty || 0);

        return {
          id: line.id,
          item_id: line.item_id,

          code:
            item?.code || "-",

          supplier_code:
            item?.supplier_code || null,

          description:
            item?.description ||
            "Articolo non trovato",

          qty,

          received_qty:
            receivedQty,

          remaining_qty:
            Math.max(
              0,
              qty - receivedQty
            ),

          unit_price:
            Number(line.unit_price || 0),

          stock:
            Number(item?.stock || 0),

          on_order:
            Number(item?.on_order || 0),
        };
      });

    const initialIncoming:
      Record<string, number> = {};

    lineViews.forEach((line) => {
      initialIncoming[line.id] = 0;
    });

    setOrder(orderData);
    setSupplier(supplierData);
    setLines(lineViews);
    setIncomingQty(initialIncoming);

    setLoading(false);
  }

  const totalOrderValue = useMemo(() => {
    return lines.reduce(
      (sum, line) =>
        sum +
        line.qty *
          line.unit_price,
      0
    );
  }, [lines]);

  const totalOrderedQty = useMemo(() => {
    return lines.reduce(
      (sum, line) =>
        sum + line.qty,
      0
    );
  }, [lines]);

  const totalReceivedQty = useMemo(() => {
    return lines.reduce(
      (sum, line) =>
        sum +
        line.received_qty,
      0
    );
  }, [lines]);

  const totalRemainingQty = useMemo(() => {
    return lines.reduce(
      (sum, line) =>
        sum +
        line.remaining_qty,
      0
    );
  }, [lines]);

  function changeIncomingQty(
    lineId: string,
    value: number
  ) {
    const line =
      lines.find(
        (row) => row.id === lineId
      );

    if (!line) return;

    const safeValue =
      Math.max(
        0,
        Math.min(
          Math.floor(value || 0),
          line.remaining_qty
        )
      );

    setIncomingQty((current) => ({
      ...current,
      [lineId]: safeValue,
    }));
  }

  /*
    RICEZIONE ORDINE ATOMICA

    Non aggiorniamo più:
    - stock
    - on_order
    - received_qty
    - status

    uno alla volta dal browser.

    Facciamo UNA SOLA chiamata a Supabase.
  */
  async function registerArrival(
    mode: "partial" | "complete"
  ) {
    if (!order) return;

    if (order.status === "received") {
      setMessage(
        "Questo ordine è già stato completato."
      );

      setMessageType("error");
      return;
    }

    if (order.status === "cancelled") {
      setMessage(
        "Questo ordine è stato annullato."
      );

      setMessageType("error");
      return;
    }

    /*
      ARRIVO PARZIALE

      Prepariamo soltanto le righe
      dove hai inserito una quantità.
    */
    const receipts = lines
      .map((line) => ({
        line_id: line.id,
        qty: Number(
          incomingQty[line.id] || 0
        ),
      }))
      .filter(
        (receipt) =>
          receipt.qty > 0
      );

    if (
      mode === "partial" &&
      receipts.length === 0
    ) {
      setMessage(
        "Inserisci almeno una quantità ricevuta."
      );

      setMessageType("error");
      return;
    }

    if (
      mode === "complete" &&
      totalRemainingQty <= 0
    ) {
      setMessage(
        "Non ci sono quantità ancora da ricevere."
      );

      setMessageType("error");
      return;
    }

    const confirmationText =
      mode === "complete"
        ? "Confermi che tutto il materiale residuo dell'ordine è arrivato?"
        : "Confermi le quantità ricevute indicate?";

    const confirmed =
      confirm(confirmationText);

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setMessage("");
    setMessageType("");

    /*
      QUI AVVIENE TUTTO.

      Supabase esegue la funzione SQL
      dentro una transazione.

      Se qualcosa fallisce,
      nessuna modifica viene confermata.
    */
    const { data, error } =
      await supabase.rpc(
        "receive_order_atomic",
        {
          p_order_id: orderId,

          p_receipts:
            mode === "partial"
              ? receipts
              : [],

          p_complete:
            mode === "complete",
        }
      );

    if (error) {
      console.error(
        "Errore ricezione atomica:",
        error
      );

      setMessage(
        "Ricezione non registrata: " +
          error.message
      );

      setMessageType("error");
      setSaving(false);

      return;
    }

    console.log(
      "Ricezione completata:",
      data
    );

    /*
      Ricarichiamo tutto dal database.
    */
    await loadData();

    setSaving(false);

    const result =
      data as {
        success?: boolean;
        status?: string;
        complete?: boolean;
      } | null;

    if (
      result?.status ===
      "received"
    ) {
      setMessage(
        "Ordine completato. Giacenze e quantità in ordine aggiornate correttamente."
      );
    } else {
      setMessage(
        "Arrivo parziale registrato. Le quantità mancanti restano in ordine."
      );
    }

    setMessageType("success");
  }

  /*
    ELIMINAZIONE ORDINE

    Questa parte per ora rimane
    come prima.

    Successivamente renderemo atomica
    anche questa operazione.
  */
  async function deleteOrder() {
    if (!order || !supplier) return;

    const confirmed = confirm(
      `Eliminare definitivamente questo ordine di ${supplier.name}?\n\n` +
        `ATTENZIONE:\n` +
        `- l'ordine verrà eliminato\n` +
        `- le quantità ancora "in ordine" verranno ripristinate\n` +
        `- le quantità già ricevute NON verranno tolte dalla giacenza\n\n` +
        `Continuare?`
    );

    if (!confirmed) return;

    setDeleting(true);
    setMessage("");
    setMessageType("");

    for (const line of lines) {
      const remainingQty =
        Math.max(
          0,
          Number(line.qty || 0) -
            Number(
              line.received_qty || 0
            )
        );

      if (remainingQty <= 0) {
        continue;
      }

      const {
        data: currentItem,
        error: itemReadError,
      } = await supabase
        .from("items")
        .select("on_order")
        .eq(
          "id",
          line.item_id
        )
        .single();

      if (
        itemReadError ||
        !currentItem
      ) {
        setMessage(
          "Errore lettura articolo durante eliminazione: " +
            (
              itemReadError?.message ||
              "Articolo non trovato"
            )
        );

        setMessageType("error");
        setDeleting(false);

        return;
      }

      const newOnOrder =
        Math.max(
          0,
          Number(
            currentItem.on_order ||
              0
          ) -
            remainingQty
        );

      const {
        error: itemUpdateError,
      } = await supabase
        .from("items")
        .update({
          on_order: newOnOrder,
        })
        .eq(
          "id",
          line.item_id
        );

      if (itemUpdateError) {
        setMessage(
          "Errore aggiornamento quantità in ordine: " +
            itemUpdateError.message
        );

        setMessageType("error");
        setDeleting(false);

        return;
      }
    }

    const {
      error: linesDeleteError,
    } = await supabase
      .from("order_items")
      .delete()
      .eq(
        "order_id",
        orderId
      );

    if (linesDeleteError) {
      setMessage(
        "Errore eliminazione righe ordine: " +
          linesDeleteError.message
      );

      setMessageType("error");
      setDeleting(false);

      return;
    }

    const {
      error: orderDeleteError,
    } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId);

    if (orderDeleteError) {
      setMessage(
        "Errore eliminazione ordine: " +
          orderDeleteError.message
      );

      setMessageType("error");
      setDeleting(false);

      return;
    }

    setDeleting(false);

    alert(
      "Ordine eliminato correttamente."
    );

    router.push("/orders");
  }

  if (loading) {
    return (
      <div
        style={{
          maxWidth: 1500,
          margin: "0 auto",
          padding: 30,
          opacity: 0.6,
        }}
      >
        Caricamento ordine...
      </div>
    );
  }

  if (!order || !supplier) {
    return (
      <div
        style={{
          maxWidth: 1500,
          margin: "0 auto",
        }}
      >
        Ordine non trovato.
      </div>
    );
  }

  const isReceived =
    order.status ===
    "received";

  const isCancelled =
    order.status ===
    "cancelled";

  const canReceive =
    !isReceived &&
    !isCancelled;

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
          marginBottom: 25,

          display: "flex",

          justifyContent:
            "space-between",

          alignItems:
            "flex-start",

          gap: 20,

          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              opacity: 0.55,
              marginBottom: 4,

              textTransform:
                "uppercase",

              letterSpacing: 1.2,
              fontWeight: 700,
            }}
          >
            Ordini / {supplier.name}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: 34,
                fontWeight: 850,
              }}
            >
              Dettaglio ordine
            </h1>

            <StatusBadge
              status={order.status}
            />
          </div>

          <div
            style={{
              marginTop: 7,
              fontSize: 14,
              opacity: 0.6,
            }}
          >
            Ordine del{" "}
            {formatDate(
              order.order_date
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {order.pdf_url && (
            <a
              href={order.pdf_url}
              target="_blank"
              rel="noreferrer"
              style={
                secondaryButtonStyle
              }
            >
              Apri PDF
            </a>
          )}

          <button
            type="button"
            disabled={
              saving ||
              deleting
            }
            onClick={
              deleteOrder
            }
            style={{
              padding:
                "10px 14px",

              borderRadius: 8,

              border:
                "1px solid rgba(239,68,68,0.4)",

              background:
                "rgba(239,68,68,0.08)",

              color:
                "#ef4444",

              cursor:
                saving ||
                deleting
                  ? "not-allowed"
                  : "pointer",

              fontWeight: 800,

              opacity:
                saving ||
                deleting
                  ? 0.5
                  : 1,
            }}
          >
            {deleting
              ? "Eliminazione..."
              : "Elimina ordine"}
          </button>

          <button
            type="button"
            disabled={
              saving ||
              deleting
            }
            onClick={() =>
              router.push(
                "/orders"
              )
            }
            style={
              secondaryButtonStyle
            }
          >
            ← Torna agli ordini
          </button>
        </div>
      </div>

      {/* MESSAGGIO */}

      {message && (
        <div
          style={{
            padding:
              "13px 15px",

            marginBottom: 18,

            borderRadius: 10,

            border:
              messageType ===
              "success"
                ? "1px solid rgba(34,197,94,0.4)"
                : "1px solid rgba(239,68,68,0.45)",

            background:
              messageType ===
              "success"
                ? "rgba(34,197,94,0.08)"
                : "rgba(239,68,68,0.08)",

            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {messageType ===
            "success" &&
            "✓ "}

          {message}
        </div>
      )}

      {/* RIEPILOGO */}

      <div
        style={{
          display: "grid",

          gridTemplateColumns:
            "repeat(auto-fit, minmax(190px, 1fr))",

          gap: 14,

          marginBottom: 22,
        }}
      >
        <SummaryCard
          title="Articoli"
          value={String(
            lines.length
          )}
          subtitle="Codici presenti nell'ordine"
        />

        <SummaryCard
          title="Pezzi ordinati"
          value={String(
            totalOrderedQty
          )}
          subtitle="Quantità totale ordine"
        />

        <SummaryCard
          title="Già ricevuti"
          value={String(
            totalReceivedQty
          )}
          subtitle="Pezzi già entrati in magazzino"
        />

        <SummaryCard
          title="Da ricevere"
          value={String(
            totalRemainingQty
          )}
          subtitle="Pezzi ancora in ordine"
        />

        <SummaryCard
          title="Valore ordine"
          value={formatEuro(
            totalOrderValue
          )}
          subtitle="Valore originale"
        />
      </div>

      {/* TABELLA */}

      <div style={cardStyle}>
        <div
          style={{
            padding:
              "16px 18px",

            background:
              "var(--table-head)",

            borderBottom:
              "1px solid var(--border-color)",
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 850,
            }}
          >
            {supplier.name}
          </div>

          <div
            style={{
              fontSize: 12,
              opacity: 0.55,
              marginTop: 3,
            }}
          >
            Controlla le quantità ricevute con il DDT reale
          </div>
        </div>

        <div
          style={{
            overflowX: "auto",
          }}
        >
          <table style={tableStyle}>
            <thead>
              <tr>
                <TableHead>
                  Codice articolo
                </TableHead>

                <TableHead>
                  Codice scanner
                </TableHead>

                <TableHead>
                  Descrizione
                </TableHead>

                <TableHead align="right">
                  Ordinato
                </TableHead>

                <TableHead align="right">
                  Già ricevuto
                </TableHead>

                <TableHead align="right">
                  Da ricevere
                </TableHead>

                <TableHead align="right">
                  Giacenza
                </TableHead>

                <TableHead align="right">
                  Arrivato ora
                </TableHead>
              </tr>
            </thead>

            <tbody>
              {lines.map(
                (line) => (
                  <tr
                    key={line.id}
                    style={{
                      borderTop:
                        "1px solid var(--border-color)",
                    }}
                  >
                    <TableCell>
                      <strong>
                        {line.supplier_code ||
                          "-"}
                      </strong>
                    </TableCell>

                    <TableCell>
                      {line.code}
                    </TableCell>

                    <TableCell>
                      {line.description}
                    </TableCell>

                    <TableCell align="right">
                      {line.qty}
                    </TableCell>

                    <TableCell align="right">
                      {
                        line.received_qty
                      }
                    </TableCell>

                    <TableCell align="right">
                      <strong>
                        {
                          line.remaining_qty
                        }
                      </strong>
                    </TableCell>

                    <TableCell align="right">
                      {line.stock}
                    </TableCell>

                    <TableCell align="right">
                      {!canReceive ? (
                        <span
                          style={{
                            color:
                              isReceived
                                ? "#22c55e"
                                : "#ef4444",

                            fontWeight: 800,
                          }}
                        >
                          {isReceived
                            ? "Completo"
                            : "Annullato"}
                        </span>
                      ) : (
                        <input
                          type="number"
                          min="0"

                          max={
                            line.remaining_qty
                          }

                          step="1"

                          value={
                            incomingQty[
                              line.id
                            ] || 0
                          }

                          disabled={
                            line.remaining_qty ===
                              0 ||
                            saving
                          }

                          onChange={(
                            e
                          ) =>
                            changeIncomingQty(
                              line.id,
                              Number(
                                e.target
                                  .value
                              )
                            )
                          }

                          style={{
                            width: 95,

                            padding:
                              "8px 9px",

                            border:
                              "1px solid var(--border-color)",

                            borderRadius: 7,

                            background:
                              "var(--input-bg)",

                            color:
                              "var(--foreground)",

                            textAlign:
                              "right",

                            fontWeight: 800,

                            opacity:
                              line.remaining_qty ===
                                0 ||
                              saving
                                ? 0.5
                                : 1,
                          }}
                        />
                      )}
                    </TableCell>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RICEZIONE */}

      {canReceive && (
        <div
          style={{
            marginTop: 22,
            padding: 20,

            border:
              "1px solid var(--border-color)",

            borderRadius: 12,

            background:
              "var(--card)",

            display: "flex",

            justifyContent:
              "space-between",

            alignItems: "center",

            gap: 20,

            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 850,
              }}
            >
              Ricezione merce
            </div>

            <div
              style={{
                marginTop: 5,

                fontSize: 13,

                opacity: 0.6,

                maxWidth: 700,
              }}
            >
              Se il DDT corrisponde completamente
              all&apos;ordine usa “Ordine completo”.
              Se manca qualcosa, inserisci le quantità
              realmente arrivate e registra
              l&apos;arrivo parziale.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"

              disabled={
                saving ||
                deleting
              }

              onClick={() =>
                registerArrival(
                  "partial"
                )
              }

              style={
                secondaryButtonStyle
              }
            >
              {saving
                ? "Salvataggio..."
                : "Registra arrivo parziale"}
            </button>

            <button
              type="button"

              disabled={
                saving ||
                deleting
              }

              onClick={() =>
                registerArrival(
                  "complete"
                )
              }

              style={primaryButtonStyle(
                saving ||
                  deleting
              )}
            >
              {saving
                ? "Salvataggio..."
                : "Ordine completo"}
            </button>
          </div>
        </div>
      )}

      {/* ORDINE RICEVUTO */}

      {isReceived && (
        <div
          style={{
            marginTop: 22,

            padding: 22,

            border:
              "1px solid rgba(34,197,94,0.35)",

            borderRadius: 12,

            background:
              "rgba(34,197,94,0.08)",
          }}
        >
          <div
            style={{
              fontSize: 18,

              fontWeight: 850,

              color: "#22c55e",
            }}
          >
            ✓ Ordine completamente ricevuto
          </div>

          <div
            style={{
              marginTop: 5,
              fontSize: 13,
              opacity: 0.7,
            }}
          >
            Tutte le quantità dell&apos;ordine risultano
            entrate in magazzino.
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- COMPONENTI ---------------- */

function StatusBadge({
  status,
}: {
  status: string;
}) {
  let label = "IN ORDINE";
  let color = "#3b82f6";

  let background =
    "rgba(59,130,246,0.12)";

  let border =
    "1px solid rgba(59,130,246,0.35)";

  if (status === "draft") {
    label = "BOZZA";
    color = "#9ca3af";

    background =
      "rgba(156,163,175,0.12)";

    border =
      "1px solid rgba(156,163,175,0.35)";
  }

  if (status === "partial") {
    label = "PARZIALE";
    color = "#f59e0b";

    background =
      "rgba(245,158,11,0.12)";

    border =
      "1px solid rgba(245,158,11,0.35)";
  }

  if (status === "received") {
    label = "RICEVUTO";
    color = "#22c55e";

    background =
      "rgba(34,197,94,0.12)";

    border =
      "1px solid rgba(34,197,94,0.35)";
  }

  if (status === "cancelled") {
    label = "ANNULLATO";
    color = "#ef4444";

    background =
      "rgba(239,68,68,0.12)";

    border =
      "1px solid rgba(239,68,68,0.35)";
  }

  return (
    <span
      style={{
        padding:
          "5px 9px",

        borderRadius: 20,

        background,
        border,
        color,

        fontSize: 11,
        fontWeight: 850,
      }}
    >
      {label}
    </span>
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

        border:
          "1px solid var(--border-color)",

        borderRadius: 12,

        background:
          "var(--card)",
      }}
    >
      <div
        style={{
          fontSize: 11,

          opacity: 0.55,

          textTransform:
            "uppercase",

          letterSpacing: 0.8,

          fontWeight: 700,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: 27,
          fontWeight: 850,
          marginTop: 7,
        }}
      >
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

function TableHead({
  children,
  align = "left",
}: {
  children: React.ReactNode;

  align?:
    | "left"
    | "right";
}) {
  return (
    <th
      style={{
        padding:
          "11px 12px",

        textAlign: align,

        fontSize: 10,

        textTransform:
          "uppercase",

        letterSpacing: 0.5,

        opacity: 0.6,

        fontWeight: 800,

        whiteSpace:
          "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function TableCell({
  children,
  align = "left",
}: {
  children: React.ReactNode;

  align?:
    | "left"
    | "right";
}) {
  return (
    <td
      style={{
        padding: "12px",

        textAlign: align,

        fontSize: 13,

        verticalAlign:
          "middle",
      }}
    >
      {children}
    </td>
  );
}

/* ---------------- FORMATI ---------------- */

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

function formatDate(
  value: string | null
) {
  if (!value) return "-";

  const safeValue =
    value.includes("T")
      ? value
      : `${value}T00:00:00`;

  return new Intl.DateTimeFormat(
    "it-IT"
  ).format(
    new Date(safeValue)
  );
}

/* ---------------- STILI ---------------- */

const cardStyle = {
  border:
    "1px solid var(--border-color)",

  borderRadius: 12,

  overflow: "hidden",

  background:
    "var(--card)",
};

const tableStyle = {
  width: "100%",

  minWidth: 1100,

  borderCollapse:
    "collapse" as const,
};

const secondaryButtonStyle = {
  display: "inline-block",

  padding:
    "10px 14px",

  borderRadius: 8,

  border:
    "1px solid var(--border-color)",

  background:
    "var(--input-bg)",

  color:
    "var(--foreground)",

  cursor: "pointer",

  fontWeight: 800,

  textDecoration:
    "none",
};

function primaryButtonStyle(
  disabled: boolean
) {
  return {
    padding:
      "11px 17px",

    borderRadius: 8,

    border: disabled
      ? "1px solid var(--border-color)"
      : "1px solid var(--foreground)",

    background: disabled
      ? "var(--card-2)"
      : "var(--foreground)",

    color: disabled
      ? "var(--foreground)"
      : "var(--background)",

    cursor: disabled
      ? "not-allowed"
      : "pointer",

    fontWeight: 850,

    opacity:
      disabled
        ? 0.5
        : 1,
  };
}