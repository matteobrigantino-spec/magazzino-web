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
};

type AtomicOrderResult = {
  success?: boolean;
  order_id?: string;
  status?: string;
  articles?: number;
  pieces?: number;
  total?: number;
};

export default function SupplierOrderPage() {
  const params = useParams();
  const router = useRouter();

  const supplierId = String(params.supplierId);

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [lines, setLines] = useState<OrderLine[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showAddItems, setShowAddItems] = useState(false);
  const [search, setSearch] = useState("");

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

    /*
      FORNITORE
    */
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

    /*
      ARTICOLI DEL FORNITORE
    */
    const { data: itemsData, error: itemsError } =
      await supabase
        .from("items")
        .select(
          "id,supplier_id,code,supplier_code,description,price,stock,min_stock,on_order"
        )
        .eq("supplier_id", supplierId)
        .order("description");

    if (itemsError) {
      setMessage(
        "Errore caricamento articoli: " + itemsError.message
      );

      setMessageType("error");
      setLoading(false);
      return;
    }

    const cleanItems: Item[] = (itemsData || []).map((item) => ({
      id: String(item.id),
      supplier_id: String(item.supplier_id),
      code: String(item.code || ""),
      supplier_code: item.supplier_code
        ? String(item.supplier_code)
        : null,
      description: String(item.description || ""),
      price: Number(item.price || 0),
      stock: Number(item.stock || 0),
      min_stock: Number(item.min_stock || 0),
      on_order: Number(item.on_order || 0),
    }));

    /*
      BOZZA AUTOMATICA

      Quantità suggerita =
      scorta minima
      - giacenza
      - già in ordine
    */
    const automaticLines: OrderLine[] = cleanItems
      .map((item) => {
        const suggestedQty = Math.max(
          0,
          Number(item.min_stock || 0) -
            Number(item.stock || 0) -
            Number(item.on_order || 0)
        );

        return {
          item,
          qty: suggestedQty,
        };
      })
      .filter((line) => line.qty > 0);

    setSupplier(supplierData);
    setItems(cleanItems);
    setLines(automaticLines);
    setLoading(false);
  }

  /*
    TOTALI
  */
  const totalArticles = lines.length;

  const totalPieces = useMemo(() => {
    return lines.reduce(
      (sum, line) => sum + Number(line.qty || 0),
      0
    );
  }, [lines]);

  const totalValue = useMemo(() => {
    return lines.reduce(
      (sum, line) =>
        sum +
        Number(line.qty || 0) *
          Number(line.item.price || 0),
      0
    );
  }, [lines]);

  /*
    ARTICOLI DISPONIBILI DA AGGIUNGERE
  */
  const availableItems = useMemo(() => {
    const usedIds = new Set(
      lines.map((line) => line.item.id)
    );

    const text = search.trim().toLowerCase();

    return items
      .filter((item) => !usedIds.has(item.id))
      .filter((item) => {
        if (!text) return true;

        return (
          item.description
            .toLowerCase()
            .includes(text) ||
          item.code
            .toLowerCase()
            .includes(text) ||
          item.supplier_code
            ?.toLowerCase()
            .includes(text)
        );
      });
  }, [items, lines, search]);

  function changeQty(itemId: string, value: number) {
    const safeQty = Math.max(
      1,
      Math.floor(Number(value || 1))
    );

    setLines((current) =>
      current.map((line) =>
        line.item.id === itemId
          ? {
              ...line,
              qty: safeQty,
            }
          : line
      )
    );
  }

  function removeLine(itemId: string) {
    setLines((current) =>
      current.filter(
        (line) => line.item.id !== itemId
      )
    );
  }

  function addItem(item: Item) {
    setLines((current) => {
      const alreadyExists = current.some(
        (line) => line.item.id === item.id
      );

      if (alreadyExists) {
        return current;
      }

      return [
        ...current,
        {
          item,
          qty: 1,
        },
      ];
    });
  }

  /*
    CREA PDF ORDINE

    Il PDF è separato dalla transazione SQL.

    Se il PDF fallisce:
    - l'ordine rimane comunque corretto
    - order_items rimangono corretti
    - on_order rimane corretto
  */
  function createOrderPdf(
    orderId: string,
    orderLines: OrderLine[]
  ) {
    if (!supplier) {
      throw new Error("Fornitore non disponibile");
    }

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth =
      doc.internal.pageSize.getWidth();

    const pageHeight =
      doc.internal.pageSize.getHeight();

    const marginLeft = 14;
    const marginRight = 14;

    let y = 17;

    /*
      TITOLO
    */
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);

    doc.text(
      "ORDINE FORNITORE",
      marginLeft,
      y
    );

    y += 9;

    doc.setFontSize(12);

    doc.text(
      supplier.name,
      marginLeft,
      y
    );

    y += 7;

    doc.setFont(
      "helvetica",
      "normal"
    );

    doc.setFontSize(9);

    doc.text(
      `Data: ${formatDateForPdf(new Date())}`,
      marginLeft,
      y
    );

    y += 5;

    doc.text(
      `ID ordine: ${orderId}`,
      marginLeft,
      y
    );

    y += 8;

    doc.setDrawColor(180);

    doc.line(
      marginLeft,
      y,
      pageWidth - marginRight,
      y
    );

    y += 7;

    /*
      INTESTAZIONE TABELLA
    */
    const columns = {
      code: marginLeft,
      description: 48,
      qty: 137,
      price: 153,
      total: 177,
    };

    function drawTableHeader() {
      doc.setFont(
        "helvetica",
        "bold"
      );

      doc.setFontSize(8);

      doc.text(
        "CODICE",
        columns.code,
        y
      );

      doc.text(
        "DESCRIZIONE",
        columns.description,
        y
      );

      doc.text(
        "QTA",
        columns.qty,
        y,
        {
          align: "right",
        }
      );

      doc.text(
        "PREZZO",
        columns.price,
        y,
        {
          align: "right",
        }
      );

      doc.text(
        "TOTALE",
        columns.total,
        y,
        {
          align: "right",
        }
      );

      y += 3;

      doc.line(
        marginLeft,
        y,
        pageWidth - marginRight,
        y
      );

      y += 5;

      doc.setFont(
        "helvetica",
        "normal"
      );
    }

    drawTableHeader();

    doc.setFontSize(8);

    let totalOrder = 0;

    orderLines.forEach((line) => {
      const lineTotal =
        Number(line.qty || 0) *
        Number(line.item.price || 0);

      totalOrder += lineTotal;

      const descriptionLines =
        doc.splitTextToSize(
          line.item.description || "-",
          78
        );

      const rowHeight =
        Math.max(
          6,
          descriptionLines.length * 4
        );

      /*
        NUOVA PAGINA SE SERVE
      */
      if (
        y + rowHeight >
        pageHeight - 25
      ) {
        doc.addPage();

        y = 18;

        doc.setFont(
          "helvetica",
          "bold"
        );

        doc.setFontSize(12);

        doc.text(
          `ORDINE - ${supplier.name}`,
          marginLeft,
          y
        );

        y += 9;

        drawTableHeader();
      }

      doc.setFontSize(8);
      doc.setFont(
        "helvetica",
        "normal"
      );

      doc.text(
        line.item.supplier_code || "-",
        columns.code,
        y
      );

      doc.text(
        descriptionLines,
        columns.description,
        y
      );

      doc.text(
        String(line.qty),
        columns.qty,
        y,
        {
          align: "right",
        }
      );

      doc.text(
        formatPdfEuro(line.item.price),
        columns.price,
        y,
        {
          align: "right",
        }
      );

      doc.text(
        formatPdfEuro(lineTotal),
        columns.total,
        y,
        {
          align: "right",
        }
      );

      y += rowHeight + 2;

      doc.setDrawColor(225);

      doc.line(
        marginLeft,
        y,
        pageWidth - marginRight,
        y
      );

      y += 3;
    });

    /*
      TOTALE
    */
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 20;
    }

    y += 5;

    doc.setFont(
      "helvetica",
      "bold"
    );

    doc.setFontSize(11);

    doc.text(
      `TOTALE ORDINE: ${formatPdfEuro(totalOrder)}`,
      pageWidth - marginRight,
      y,
      {
        align: "right",
      }
    );

    return doc;
  }

  /*
    CONFERMA ORDINE ATOMICA
  */
  async function confirmOrder() {
    if (!supplier) {
      return;
    }

    if (lines.length === 0) {
      setMessage(
        "Aggiungi almeno un articolo all'ordine."
      );

      setMessageType("error");
      return;
    }

    /*
      CONTROLLO QUANTITÀ
    */
    const invalidLine =
      lines.find(
        (line) =>
          !Number.isFinite(
            Number(line.qty)
          ) ||
          Number(line.qty) <= 0
      );

    if (invalidLine) {
      setMessage(
        "Tutte le quantità devono essere maggiori di zero."
      );

      setMessageType("error");
      return;
    }

    const confirmed = confirm(
      `Confermi l'ordine a ${supplier.name}?\n\n` +
        `Articoli: ${totalArticles}\n` +
        `Pezzi: ${totalPieces}\n` +
        `Totale: ${formatEuro(totalValue)}`
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setMessage("");
    setMessageType("");

    /*
      PREPARIAMO LE RIGHE DA MANDARE
      ALLA FUNZIONE SQL
    */
    const rpcLines = lines.map(
      (line) => ({
        item_id: line.item.id,
        qty: Number(line.qty),
      })
    );

    /*
      CREAZIONE ATOMICA:

      - orders
      - order_items
      - items.on_order

      tutto insieme.
    */
    const { data, error } =
      await supabase.rpc(
        "create_order_atomic",
        {
          p_supplier_id:
            supplier.id,

          p_lines:
            rpcLines,
        }
      );

    if (error) {
      console.error(
        "Errore creazione ordine atomico:",
        error
      );

      setMessage(
        "Ordine NON creato: " +
          error.message
      );

      setMessageType("error");
      setSaving(false);

      return;
    }

    const result =
      data as AtomicOrderResult | null;

    const orderId =
      result?.order_id;

    if (!orderId) {
      setMessage(
        "Ordine creato, ma non è stato restituito l'ID ordine."
      );

      setMessageType("error");
      setSaving(false);

      return;
    }

    /*
      A QUESTO PUNTO L'ORDINE È GIÀ SICURO.

      Anche se il PDF fallisce:
      NON dobbiamo ricreare l'ordine.
    */
    try {
      const doc =
        createOrderPdf(
          orderId,
          lines
        );

      const pdfBlob =
        doc.output("blob");

      const safeSupplierName =
        supplier.name
          .trim()
          .replace(
            /[\\/:*?"<>|]/g,
            "-"
          )
          .replace(
            /\s+/g,
            "_"
          );

      const pdfPath =
        `${supplier.id}/${orderId}_${safeSupplierName}.pdf`;

      /*
        UPLOAD PDF
      */
      const {
        error: uploadError,
      } = await supabase.storage
        .from("orders-pdf")
        .upload(
          pdfPath,
          pdfBlob,
          {
            contentType:
              "application/pdf",

            upsert: false,
          }
        );

      if (uploadError) {
        throw new Error(
          uploadError.message
        );
      }

      /*
        URL PUBBLICO
      */
      const {
        data: publicUrlData,
      } = supabase.storage
        .from("orders-pdf")
        .getPublicUrl(
          pdfPath
        );

      const pdfUrl =
        publicUrlData.publicUrl;

      /*
        SALVIAMO URL E PATH NELL'ORDINE
      */
      const {
        error: pdfUpdateError,
      } = await supabase
        .from("orders")
        .update({
          pdf_path:
            pdfPath,

          pdf_url:
            pdfUrl,
        })
        .eq(
          "id",
          orderId
        );

      if (pdfUpdateError) {
        throw new Error(
          pdfUpdateError.message
        );
      }

      alert(
        "Ordine creato correttamente."
      );

      router.push(
        `/orders/${orderId}`
      );

      return;
    } catch (pdfError: any) {
      console.error(
        "Errore PDF ordine:",
        pdfError
      );

      /*
        IMPORTANTE:

        NON cancelliamo l'ordine
        e NON proviamo a ricrearlo.

        L'ordine è già stato creato
        correttamente dalla funzione atomica.
      */
      alert(
        "L'ordine è stato creato correttamente, " +
          "ma il PDF non è stato salvato.\n\n" +
          "Ordine ID:\n" +
          orderId
      );

      router.push(
        `/orders/${orderId}`
      );

      return;
    } finally {
      setSaving(false);
    }
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
        Preparazione ordine...
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
      {/* TESTATA */}

      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap: 20,
          flexWrap: "wrap",
          marginBottom: 25,
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
            Ordini / Nuovo ordine
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 34,
              fontWeight: 850,
              letterSpacing:
                "-0.5px",
            }}
          >
            {supplier.name}
          </h1>

          <div
            style={{
              marginTop: 7,
              fontSize: 14,
              opacity: 0.6,
            }}
          >
            Controlla la proposta automatica,
            modifica le quantità e conferma
            l&apos;ordine.
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            router.push(
              "/orders"
            )
          }
          disabled={saving}
          style={secondaryButtonStyle}
        >
          ← Torna agli ordini
        </button>
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
          {message}
        </div>
      )}

      {/* RIEPILOGO */}

      <div
        style={{
          display: "grid",

          gridTemplateColumns:
            "repeat(auto-fit, minmax(210px, 1fr))",

          gap: 14,
          marginBottom: 22,
        }}
      >
        <SummaryCard
          title="Articoli"
          value={String(
            totalArticles
          )}
          subtitle="Codici presenti nell'ordine"
        />

        <SummaryCard
          title="Pezzi"
          value={String(
            totalPieces
          )}
          subtitle="Quantità totale"
        />

        <SummaryCard
          title="Totale ordine"
          value={formatEuro(
            totalValue
          )}
          subtitle="Valore complessivo"
        />
      </div>

      {/* RIGHE ORDINE */}

      <div style={cardStyle}>
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

            flexWrap: "wrap",

            background:
              "var(--table-head)",

            borderBottom:
              "1px solid var(--border-color)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 850,
              }}
            >
              Articoli ordine
            </div>

            <div
              style={{
                marginTop: 3,
                fontSize: 12,
                opacity: 0.55,
              }}
            >
              La proposta automatica considera
              giacenza, scorta minima e merce
              già in ordine.
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              setShowAddItems(
                !showAddItems
              )
            }
            disabled={saving}
            style={
              secondaryButtonStyle
            }
          >
            {showAddItems
              ? "Chiudi aggiunta articoli"
              : "+ Aggiungi articolo"}
          </button>
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
                  Prezzo
                </TableHead>

                <TableHead align="right">
                  Giacenza
                </TableHead>

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

                <TableHead>
                  Azione
                </TableHead>
              </tr>
            </thead>

            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    style={{
                      padding: 40,
                      textAlign:
                        "center",
                      opacity: 0.55,
                    }}
                  >
                    Nessun articolo nella proposta.
                    Puoi aggiungerli manualmente con
                    “+ Aggiungi articolo”.
                  </td>
                </tr>
              ) : (
                lines.map((line) => (
                  <tr
                    key={line.item.id}
                    style={{
                      borderTop:
                        "1px solid var(--border-color)",
                    }}
                  >
                    <TableCell>
                      <strong>
                        {line.item
                          .supplier_code ||
                          "-"}
                      </strong>
                    </TableCell>

                    <TableCell>
                      {line.item.code ||
                        "-"}
                    </TableCell>

                    <TableCell>
                      {
                        line.item
                          .description
                      }
                    </TableCell>

                    <TableCell align="right">
                      {formatEuro(
                        line.item.price
                      )}
                    </TableCell>

                    <TableCell align="right">
                      {
                        line.item
                          .stock
                      }
                    </TableCell>

                    <TableCell align="right">
                      {
                        line.item
                          .min_stock
                      }
                    </TableCell>

                    <TableCell align="right">
                      {
                        line.item
                          .on_order
                      }
                    </TableCell>

                    <TableCell align="right">
                      <input
                        type="number"
                        min="1"
                        step="1"

                        value={
                          line.qty
                        }

                        disabled={
                          saving
                        }

                        onChange={(e) =>
                          changeQty(
                            line.item.id,
                            Number(
                              e.target
                                .value
                            )
                          )
                        }

                        style={{
                          width: 90,

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
                        }}
                      />
                    </TableCell>

                    <TableCell align="right">
                      <strong>
                        {formatEuro(
                          line.qty *
                            line.item
                              .price
                        )}
                      </strong>
                    </TableCell>

                    <TableCell>
                      <button
                        type="button"
                        disabled={
                          saving
                        }
                        onClick={() =>
                          removeLine(
                            line.item.id
                          )
                        }
                        style={{
                          padding:
                            "7px 10px",

                          borderRadius: 7,

                          border:
                            "1px solid rgba(239,68,68,0.35)",

                          background:
                            "rgba(239,68,68,0.08)",

                          color:
                            "#ef4444",

                          cursor:
                            saving
                              ? "not-allowed"
                              : "pointer",

                          fontWeight: 750,
                        }}
                      >
                        Togli
                      </button>
                    </TableCell>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AGGIUNTA ARTICOLI */}

      {showAddItems && (
        <div
          style={{
            marginTop: 18,

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
              fontSize: 18,
              fontWeight: 850,
              marginBottom: 12,
            }}
          >
            Aggiungi articolo
          </div>

          <input
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            placeholder="Cerca codice articolo, scanner o descrizione..."
            style={{
              width: "100%",
              boxSizing:
                "border-box",

              padding:
                "12px 14px",

              borderRadius: 8,

              border:
                "1px solid var(--border-color)",

              background:
                "var(--input-bg)",

              color:
                "var(--foreground)",

              outline: "none",

              fontSize: 14,

              marginBottom: 12,
            }}
          />

          <div
            style={{
              maxHeight: 350,
              overflowY: "auto",

              border:
                "1px solid var(--border-color)",

              borderRadius: 9,
            }}
          >
            {availableItems.length ===
            0 ? (
              <div
                style={{
                  padding: 25,
                  textAlign:
                    "center",
                  opacity: 0.55,
                }}
              >
                Nessun articolo disponibile.
              </div>
            ) : (
              availableItems.map(
                (item) => (
                  <div
                    key={item.id}
                    style={{
                      padding:
                        "12px 14px",

                      display: "flex",

                      justifyContent:
                        "space-between",

                      alignItems:
                        "center",

                      gap: 15,

                      borderBottom:
                        "1px solid var(--border-color)",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 850,
                        }}
                      >
                        {item.supplier_code ||
                          "-"}
                      </div>

                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 13,
                        }}
                      >
                        {item.description}
                      </div>

                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 11,
                          opacity: 0.55,
                        }}
                      >
                        Scanner:{" "}
                        {item.code ||
                          "-"}{" "}
                        · Giacenza:{" "}
                        {item.stock} ·
                        Scorta min.:{" "}
                        {
                          item.min_stock
                        }{" "}
                        · €{" "}
                        {Number(
                          item.price
                        ).toFixed(2)}
                      </div>
                    </div>

                    <button
                      type="button"

                      disabled={
                        saving
                      }

                      onClick={() =>
                        addItem(item)
                      }

                      style={
                        primarySmallButton
                      }
                    >
                      Aggiungi
                    </button>
                  </div>
                )
              )
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

          background:
            "var(--card)",

          display: "flex",

          justifyContent:
            "space-between",

          alignItems:
            "center",

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
            Conferma ordine
          </div>

          <div
            style={{
              marginTop: 5,
              fontSize: 13,
              opacity: 0.6,
            }}
          >
            L&apos;ordine, le righe e le quantità
            “in ordine” verranno registrati insieme
            in un&apos;unica operazione sicura.
          </div>
        </div>

        <button
          type="button"

          onClick={
            confirmOrder
          }

          disabled={
            saving ||
            lines.length === 0
          }

          style={primaryButtonStyle(
            saving ||
              lines.length === 0
          )}
        >
          {saving
            ? "Creazione ordine..."
            : "Conferma ordine"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- COMPONENTI ---------------- */

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
  align?: "left" | "right";
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
  align?: "left" | "right";
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

function formatPdfEuro(
  value: number
) {
  return (
    new Intl.NumberFormat(
      "it-IT",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    ).format(
      Number(value || 0)
    ) + " EUR"
  );
}

function formatDateForPdf(
  date: Date
) {
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
  minWidth: 1300,

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

const primarySmallButton = {
  padding:
    "8px 12px",

  borderRadius: 7,

  border:
    "1px solid var(--foreground)",

  background:
    "var(--foreground)",

  color:
    "var(--background)",

  cursor: "pointer",

  fontWeight: 800,
};

function primaryButtonStyle(
  disabled: boolean
) {
  return {
    padding:
      "12px 19px",

    borderRadius: 9,

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

    opacity: disabled
      ? 0.5
      : 1,
  };
}