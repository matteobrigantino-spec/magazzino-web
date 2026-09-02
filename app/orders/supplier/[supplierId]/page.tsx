"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import jsPDF from "jspdf";

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

type OrderLine = {
  item: Item;
  qty: number;
  automatic: boolean;
};

export default function SupplierOrderPage() {
  const params = useParams();
  const router = useRouter();

  const supplierId = String(params.supplierId);

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [showAddItems, setShowAddItems] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "success" | "error" | ""
  >("");

  useEffect(() => {
    loadData();
  }, [supplierId]);

  async function loadData() {
    setLoading(true);
    setMessage("");
    setMessageType("");

    const { data: supplierData, error: supplierError } =
      await supabase
        .from("suppliers")
        .select("id,name")
        .eq("id", supplierId)
        .single();

    if (supplierError || !supplierData) {
      setMessage(
        "Errore caricamento fornitore: " +
          (supplierError?.message || "Fornitore non trovato")
      );
      setMessageType("error");
      setLoading(false);
      return;
    }

    const { data: itemsData, error: itemsError } =
      await supabase
        .from("items")
        .select(
          "id,supplier_id,code,supplier_code,description,price,stock,min_stock,on_order"
        )
        .eq("supplier_id", supplierId)
        .order("description");

    if (itemsError) {
      setMessage("Errore articoli: " + itemsError.message);
      setMessageType("error");
      setLoading(false);
      return;
    }

    const cleanItems: Item[] = (itemsData || []).map((item) => ({
      ...item,
      price: Number(item.price || 0),
      stock: Number(item.stock || 0),
      min_stock: Number(item.min_stock || 0),
      on_order: Number(item.on_order || 0),
    }));

    /*
      PROPOSTA AUTOMATICA

      Quantità suggerita =
      scorta minima - giacenza - quantità già in ordine

      Esempio:
      scorta minima 10
      giacenza 3
      già in ordine 2

      suggerito = 5
    */

    const automaticLines: OrderLine[] = cleanItems
      .map((item) => {
        const suggestedQty = Math.max(
          0,
          item.min_stock - item.stock - item.on_order
        );

        return {
          item,
          qty: suggestedQty,
          automatic: true,
        };
      })
      .filter((line) => line.qty > 0);

    setSupplier(supplierData);
    setItems(cleanItems);
    setOrderLines(automaticLines);
    setLoading(false);
  }

  const availableItems = useMemo(() => {
    const selectedIds = new Set(
      orderLines.map((line) => line.item.id)
    );

    const term = search.trim().toLowerCase();

    return items.filter((item) => {
      if (selectedIds.has(item.id)) {
        return false;
      }

      if (!term) {
        return true;
      }

      return (
        item.description.toLowerCase().includes(term) ||
        item.code.toLowerCase().includes(term) ||
        (item.supplier_code || "")
          .toLowerCase()
          .includes(term)
      );
    });
  }, [items, orderLines, search]);

  const totalValue = useMemo(() => {
    return orderLines.reduce((sum, line) => {
      return sum + line.qty * line.item.price;
    }, 0);
  }, [orderLines]);

  const totalPieces = useMemo(() => {
    return orderLines.reduce((sum, line) => {
      return sum + Number(line.qty || 0);
    }, 0);
  }, [orderLines]);

  function changeQuantity(itemId: string, qty: number) {
    setOrderLines((current) =>
      current.map((line) =>
        line.item.id === itemId
          ? {
              ...line,
              qty: Math.max(0, Math.floor(qty || 0)),
            }
          : line
      )
    );
  }

  function removeItem(itemId: string) {
    setOrderLines((current) =>
      current.filter((line) => line.item.id !== itemId)
    );
  }

  function addItem(item: Item) {
    setOrderLines((current) => [
      ...current,
      {
        item,
        qty: 1,
        automatic: false,
      },
    ]);
  }

  function generatePdfBlob(
    orderId: string,
    supplierName: string,
    lines: OrderLine[]
  ) {
    const doc = new jsPDF();

    const today = new Intl.DateTimeFormat("it-IT").format(
      new Date()
    );

    doc.setFontSize(20);
    doc.text("ORDINE FORNITORE", 14, 18);

    doc.setFontSize(12);
    doc.text(`Fornitore: ${supplierName}`, 14, 29);
    doc.text(`Data: ${today}`, 14, 36);

    doc.setFontSize(8);
    doc.text(`ID ordine: ${orderId}`, 14, 43);

    let y = 56;

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");

    doc.text("Cod. articolo", 14, y);
    doc.text("Descrizione", 50, y);
    doc.text("Qta", 145, y, { align: "right" });
    doc.text("Prezzo", 170, y, { align: "right" });
    doc.text("Totale", 198, y, { align: "right" });

    doc.line(14, y + 3, 198, y + 3);

    doc.setFont("helvetica", "normal");

    y += 10;

    lines.forEach((line) => {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }

      const supplierCode =
        line.item.supplier_code || line.item.code || "-";

      const description =
        line.item.description.length > 48
          ? line.item.description.substring(0, 45) + "..."
          : line.item.description;

      const lineTotal =
        Number(line.qty) * Number(line.item.price);

      doc.text(supplierCode.substring(0, 20), 14, y);

      doc.text(description, 50, y);

      doc.text(String(line.qty), 145, y, {
        align: "right",
      });

      doc.text(formatNumber(line.item.price), 170, y, {
        align: "right",
      });

      doc.text(formatNumber(lineTotal), 198, y, {
        align: "right",
      });

      y += 8;
    });

    doc.line(14, y, 198, y);

    y += 9;

    const total = lines.reduce(
      (sum, line) =>
        sum +
        Number(line.qty) * Number(line.item.price),
      0
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);

    doc.text(
      `TOTALE ORDINE: EUR ${formatNumber(total)}`,
      198,
      y,
      {
        align: "right",
      }
    );

    return doc.output("blob");
  }

  async function confirmOrder() {
    setMessage("");
    setMessageType("");

    const validLines = orderLines.filter(
      (line) => Number(line.qty) > 0
    );

    if (!supplier) {
      return;
    }

    if (validLines.length === 0) {
      setMessage(
        "L'ordine è vuoto. Aggiungi almeno un articolo."
      );
      setMessageType("error");
      return;
    }

    const confirmed = confirm(
      `Confermare l'ordine per ${supplier.name}?\n\n` +
        `${validLines.length} articoli\n` +
        `${totalPieces} pezzi\n` +
        `Totale ${formatEuro(totalValue)}`
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);

    /*
      1. CREAZIONE TESTATA ORDINE
    */

    const { data: orderData, error: orderError } =
      await supabase
        .from("orders")
        .insert({
          supplier_id: supplier.id,
          status: "ordered",
        })
        .select("id")
        .single();

    if (orderError || !orderData) {
      setMessage(
        "Errore creazione ordine: " +
          (orderError?.message || "ID ordine non disponibile")
      );
      setMessageType("error");
      setSaving(false);
      return;
    }

    const orderId = orderData.id;

    /*
      2. SALVATAGGIO RIGHE
    */

    const rowsToInsert = validLines.map((line) => ({
      order_id: orderId,
      item_id: line.item.id,
      qty: Number(line.qty),
      received_qty: 0,
      unit_price: Number(line.item.price || 0),
    }));

    const { error: linesError } = await supabase
      .from("order_items")
      .insert(rowsToInsert);

    if (linesError) {
      await supabase
        .from("orders")
        .delete()
        .eq("id", orderId);

      setMessage(
        "Errore salvataggio righe ordine: " +
          linesError.message
      );
      setMessageType("error");
      setSaving(false);
      return;
    }

    /*
      3. GENERAZIONE PDF
    */

    const pdfBlob = generatePdfBlob(
      orderId,
      supplier.name,
      validLines
    );

    const safeSupplierName = supplier.name
      .replace(/[^a-zA-Z0-9]/g, "_")
      .toLowerCase();

    const fileName =
      `${safeSupplierName}_${Date.now()}_${orderId}.pdf`;

    const pdfPath =
      `${supplier.id}/${fileName}`;

    /*
      4. UPLOAD PDF SU SUPABASE STORAGE
    */

    const { error: uploadError } = await supabase.storage
      .from("orders-pdf")
      .upload(pdfPath, pdfBlob, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      /*
        L'ordine rimane comunque salvato.
        Mostriamo l'errore PDF.
      */

      setMessage(
        "Ordine salvato, ma il PDF non è stato caricato: " +
          uploadError.message
      );
      setMessageType("error");
      setSaving(false);
      return;
    }

    /*
      5. OTTENIAMO URL PUBBLICO PDF
    */

    const { data: publicUrlData } = supabase.storage
      .from("orders-pdf")
      .getPublicUrl(pdfPath);

    const pdfUrl =
      publicUrlData?.publicUrl || null;

    /*
      6. SALVIAMO PDF NELL'ORDINE
    */

    const { error: pdfUpdateError } = await supabase
      .from("orders")
      .update({
        pdf_path: pdfPath,
        pdf_url: pdfUrl,
      })
      .eq("id", orderId);

    if (pdfUpdateError) {
      setMessage(
        "Ordine e PDF creati, ma errore collegamento PDF: " +
          pdfUpdateError.message
      );
      setMessageType("error");
      setSaving(false);
      return;
    }

    /*
      7. AGGIORNIAMO LE QUANTITÀ IN ORDINE
    */

    for (const line of validLines) {
      const { data: currentItem, error: readError } =
        await supabase
          .from("items")
          .select("on_order")
          .eq("id", line.item.id)
          .single();

      if (readError || !currentItem) {
        setMessage(
          "Ordine creato, ma errore aggiornamento quantità in ordine."
        );
        setMessageType("error");
        setSaving(false);
        return;
      }

      const currentOnOrder = Number(
        currentItem.on_order || 0
      );

      const newOnOrder =
        currentOnOrder + Number(line.qty);

      const { error: updateError } = await supabase
        .from("items")
        .update({
          on_order: newOnOrder,
        })
        .eq("id", line.item.id);

      if (updateError) {
        setMessage(
          "Ordine creato, ma errore aggiornamento articolo: " +
            updateError.message
        );
        setMessageType("error");
        setSaving(false);
        return;
      }
    }

    setSaving(false);

    alert(
      `Ordine ${supplier.name} creato correttamente.\n\n` +
        `Il PDF è stato salvato nello storico ordini.`
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

  if (!supplier) {
    return (
      <div
        style={{
          maxWidth: 1500,
          margin: "0 auto",
        }}
      >
        Fornitore non trovato.
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
      {/* HEADER */}

      <div
        style={{
          marginBottom: 25,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
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
              textTransform: "uppercase",
              letterSpacing: 1.2,
              fontWeight: 700,
            }}
          >
            Ordini / {supplier.name}
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 34,
              fontWeight: 850,
            }}
          >
            Nuovo ordine
          </h1>

          <div
            style={{
              marginTop: 6,
              fontSize: 14,
              opacity: 0.6,
            }}
          >
            Il gestionale ha preparato automaticamente gli
            articoli da riordinare. Puoi modificare liberamente
            l&apos;ordine prima di confermarlo.
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push("/orders")}
          style={secondaryButtonStyle}
        >
          ← Torna agli ordini
        </button>
      </div>

      {message && (
        <div
          style={{
            padding: "13px 15px",
            marginBottom: 18,
            borderRadius: 10,
            border:
              messageType === "success"
                ? "1px solid rgba(34,197,94,0.4)"
                : "1px solid rgba(239,68,68,0.45)",
            background:
              messageType === "success"
                ? "rgba(34,197,94,0.08)"
                : "rgba(239,68,68,0.08)",
            fontWeight: 650,
            fontSize: 13,
          }}
        >
          {message}
        </div>
      )}

      {/* RIASSUNTO */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <SummaryCard
          title="Articoli"
          value={String(orderLines.length)}
          subtitle="Codici presenti nell'ordine"
        />

        <SummaryCard
          title="Pezzi"
          value={String(totalPieces)}
          subtitle="Quantità totale"
        />

        <SummaryCard
          title="Totale ordine"
          value={formatEuro(totalValue)}
          subtitle="Valore previsto"
        />
      </div>

      {/* ORDINE */}

      <div style={cardStyle}>
        <div
          style={{
            padding: "16px 18px",
            borderBottom:
              "1px solid var(--border-color)",
            background: "var(--table-head)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 15,
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
              {supplier.name}
            </div>

            <div
              style={{
                fontSize: 12,
                opacity: 0.55,
                marginTop: 3,
              }}
            >
              Bozza ordine
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              setShowAddItems((current) => !current)
            }
            style={secondaryButtonStyle}
          >
            + Aggiungi articolo
          </button>
        </div>

        {orderLines.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
              }}
            >
              Nessun articolo da ordinare
            </div>

            <div
              style={{
                marginTop: 6,
                opacity: 0.55,
                fontSize: 13,
              }}
            >
              Puoi comunque aggiungere manualmente degli
              articoli.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <TableHead>Codice articolo</TableHead>
                  <TableHead>Codice scanner</TableHead>
                  <TableHead>Descrizione</TableHead>
                  <TableHead align="right">Prezzo</TableHead>
                  <TableHead align="right">Giacenza</TableHead>
                  <TableHead align="right">
                    Scorta min.
                  </TableHead>
                  <TableHead align="right">
                    Già in ordine
                  </TableHead>
                  <TableHead align="right">
                    Quantità
                  </TableHead>
                  <TableHead align="right">
                    Totale
                  </TableHead>
                  <TableHead />
                </tr>
              </thead>

              <tbody>
                {orderLines.map((line) => (
                  <tr
                    key={line.item.id}
                    style={{
                      borderTop:
                        "1px solid var(--border-color)",
                    }}
                  >
                    <TableCell>
                      <div
                        style={{
                          display: "flex",
                          gap: 7,
                          alignItems: "center",
                        }}
                      >
                        <strong>
                          {line.item.supplier_code || "-"}
                        </strong>

                        {line.automatic && (
                          <span
                            style={{
                              fontSize: 9,
                              padding: "3px 5px",
                              borderRadius: 10,
                              background:
                                "rgba(245,158,11,0.12)",
                              color: "#f59e0b",
                              fontWeight: 800,
                            }}
                          >
                            AUTO
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {line.item.code}
                    </TableCell>

                    <TableCell>
                      {line.item.description}
                    </TableCell>

                    <TableCell align="right">
                      {formatEuro(line.item.price)}
                    </TableCell>

                    <TableCell align="right">
                      {line.item.stock}
                    </TableCell>

                    <TableCell align="right">
                      {line.item.min_stock}
                    </TableCell>

                    <TableCell align="right">
                      {line.item.on_order}
                    </TableCell>

                    <TableCell align="right">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={line.qty}
                        onChange={(e) =>
                          changeQuantity(
                            line.item.id,
                            Number(e.target.value)
                          )
                        }
                        style={{
                          width: 90,
                          padding: "8px 9px",
                          border:
                            "1px solid var(--border-color)",
                          borderRadius: 7,
                          background:
                            "var(--input-bg)",
                          color:
                            "var(--foreground)",
                          textAlign: "right",
                          fontWeight: 800,
                        }}
                      />
                    </TableCell>

                    <TableCell align="right">
                      <strong>
                        {formatEuro(
                          line.qty * line.item.price
                        )}
                      </strong>
                    </TableCell>

                    <TableCell align="right">
                      <button
                        type="button"
                        onClick={() =>
                          removeItem(line.item.id)
                        }
                        style={{
                          border:
                            "1px solid rgba(239,68,68,0.35)",
                          background:
                            "rgba(239,68,68,0.08)",
                          color: "#ef4444",
                          borderRadius: 7,
                          padding: "6px 9px",
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                      >
                        Togli
                      </button>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AGGIUNGI ARTICOLI */}

      {showAddItems && (
        <div
          style={{
            ...cardStyle,
            marginTop: 18,
          }}
        >
          <div
            style={{
              padding: 17,
              borderBottom:
                "1px solid var(--border-color)",
              background: "var(--table-head)",
            }}
          >
            <div
              style={{
                fontSize: 17,
                fontWeight: 850,
              }}
            >
              Aggiungi articolo
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                opacity: 0.55,
              }}
            >
              Puoi aggiungere qualsiasi articolo di{" "}
              {supplier.name}.
            </div>

            <input
              type="text"
              placeholder="Cerca codice o descrizione..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              style={{
                width: "100%",
                marginTop: 13,
                padding: "10px 12px",
                borderRadius: 8,
                border:
                  "1px solid var(--border-color)",
                background: "var(--input-bg)",
                color: "var(--foreground)",
                outline: "none",
              }}
            />
          </div>

          <div
            style={{
              maxHeight: 380,
              overflowY: "auto",
            }}
          >
            {availableItems.length === 0 ? (
              <div
                style={{
                  padding: 30,
                  textAlign: "center",
                  opacity: 0.55,
                }}
              >
                Nessun altro articolo disponibile.
              </div>
            ) : (
              availableItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: "12px 16px",
                    borderBottom:
                      "1px solid var(--border-color)",
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems: "center",
                    gap: 15,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 800,
                      }}
                    >
                      {item.supplier_code ||
                        item.code}
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        marginTop: 3,
                      }}
                    >
                      {item.description}
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.5,
                        marginTop: 3,
                      }}
                    >
                      Giacenza {item.stock} ·
                      Scorta min. {item.min_stock} ·{" "}
                      {formatEuro(item.price)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => addItem(item)}
                    style={secondaryButtonStyle}
                  >
                    + Aggiungi
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* CONFERMA */}

      <div
        style={{
          marginTop: 22,
          padding: 20,
          border:
            "1px solid var(--border-color)",
          borderRadius: 12,
          background: "var(--card)",
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
              fontSize: 12,
              opacity: 0.55,
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            Totale ordine
          </div>

          <div
            style={{
              fontSize: 27,
              fontWeight: 900,
              marginTop: 4,
            }}
          >
            {formatEuro(totalValue)}
          </div>

          <div
            style={{
              fontSize: 12,
              opacity: 0.55,
              marginTop: 3,
            }}
          >
            {orderLines.length} articoli ·{" "}
            {totalPieces} pezzi
          </div>
        </div>

        <button
          type="button"
          disabled={
            saving || orderLines.length === 0
          }
          onClick={confirmOrder}
          style={primaryButtonStyle(
            saving || orderLines.length === 0
          )}
        >
          {saving
            ? "Creazione ordine..."
            : "Conferma ordine e genera PDF"}
        </button>
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
        border:
          "1px solid var(--border-color)",
        borderRadius: 12,
        background: "var(--card)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          opacity: 0.55,
          textTransform: "uppercase",
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
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        padding: "11px 12px",
        textAlign: align,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        opacity: 0.6,
        fontWeight: 800,
        whiteSpace: "nowrap",
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
  align?: "left" | "right";
}) {
  return (
    <td
      style={{
        padding: "11px 12px",
        textAlign: align,
        fontSize: 13,
        verticalAlign: "middle",
      }}
    >
      {children}
    </td>
  );
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatNumber(value: number) {
  return Number(value || 0)
    .toFixed(2)
    .replace(".", ",");
}

const cardStyle = {
  border: "1px solid var(--border-color)",
  borderRadius: 12,
  overflow: "hidden",
  background: "var(--card)",
};

const tableStyle = {
  width: "100%",
  minWidth: 1100,
  borderCollapse: "collapse" as const,
};

const secondaryButtonStyle = {
  padding: "9px 13px",
  borderRadius: 8,
  border: "1px solid var(--border-color)",
  background: "var(--input-bg)",
  color: "var(--foreground)",
  cursor: "pointer",
  fontWeight: 750,
};

function primaryButtonStyle(
  disabled: boolean
) {
  return {
    padding: "12px 18px",
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
    opacity: disabled ? 0.5 : 1,
  };
}