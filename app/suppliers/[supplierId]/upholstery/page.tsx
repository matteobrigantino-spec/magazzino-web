"use client";

import {
  use,
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";

import { supabase } from "../../../../lib/supabaseClient";

type UpholsteryKit = {
  id: string;
  item_id: string;
  matricola: number;
  scanner_code: string;
  color: string;
  details_logos: string;
  stitching: string;
  quilting: string;
  unit_price: number;
  boat_registration: string | null;
  status: string;
  note: string | null;
  created_at: string;
};

type ItemLookup = {
  id: string;
  code: string;
  supplier_code: string | null;
  description: string;
};

export default function UpholsteryWarehousePage({
  params,
}: {
  params:
    | Promise<{
        supplierId: string;
      }>
    | {
        supplierId: string;
      };
}) {
  const resolvedParams =
    typeof (params as any)?.then ===
    "function"
      ? use(
          params as Promise<{
            supplierId: string;
          }>
        )
      : (params as {
          supplierId: string;
        });

  const supplierId =
    resolvedParams.supplierId;

  const router =
    useRouter();

  const [
    supplierName,
    setSupplierName,
  ] =
    useState(
      "D'AMICO ARREDAMENTI NAVALI"
    );

  const [
    kits,
    setKits,
  ] =
    useState<
      UpholsteryKit[]
    >([]);

  const [
    itemLookup,
    setItemLookup,
  ] =
    useState<
      ItemLookup[]
    >([]);

  const [
    priceDrafts,
    setPriceDrafts,
  ] =
    useState<
      Record<string, string>
    >({});

  const [
    savingPriceId,
    setSavingPriceId,
  ] =
    useState("");

  const [
    boatDrafts,
    setBoatDrafts,
  ] =
    useState<
      Record<string, string>
    >({});

  const [
    savingBoatId,
    setSavingBoatId,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  useEffect(() => {
    loadData();
  }, [supplierId]);

  const itemMap =
    useMemo(() => {
      return new Map(
        itemLookup.map(
          (item) => [
            item.id,
            item,
          ]
        )
      );
    }, [itemLookup]);

  const stockKits =
    useMemo(
      () =>
        kits.filter(
          (kit) =>
            kit.status ===
            "stock"
        ),
      [kits]
    );

  const soldKits =
    useMemo(
      () =>
        kits.filter(
          (kit) =>
            kit.status ===
              "out" &&
            Boolean(
              kit.boat_registration
            )
        ),
      [kits]
    );

  const totalValue =
    useMemo(
      () =>
        stockKits.reduce(
          (sum, kit) =>
            sum +
            Number(
              kit.unit_price ||
                0
            ),
          0
        ),
      [stockKits]
    );

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const [
      supplierResponse,
      kitsResponse,
      itemsResponse,
    ] =
      await Promise.all([
        supabase
          .from(
            "suppliers"
          )
          .select(
            "name,upholstery_enabled"
          )
          .eq(
            "id",
            supplierId
          )
          .maybeSingle(),

        supabase
          .from(
            "upholstery_kits"
          )
          .select(
            "id,item_id,matricola,scanner_code,color,details_logos,stitching,quilting,unit_price,boat_registration,status,note,created_at"
          )
          .eq(
            "supplier_id",
            supplierId
          )
          .order(
            "matricola",
            {
              ascending:
                true,
            }
          ),

        supabase
          .from(
            "items"
          )
          .select(
            "id,code,supplier_code,description"
          )
          .eq(
            "supplier_id",
            supplierId
          ),
      ]);

    if (
      supplierResponse.error ||
      !supplierResponse.data
    ) {
      setErrorMessage(
        "Fornitore non trovato."
      );
      setLoading(false);
      return;
    }

    if (
      supplierResponse.data
        .upholstery_enabled !==
      true
    ) {
      setErrorMessage(
        "La gestione tappezzerie non è attiva per questo fornitore."
      );
      setLoading(false);
      return;
    }

    setSupplierName(
      String(
        supplierResponse.data
          .name ||
          "D'AMICO ARREDAMENTI NAVALI"
      )
    );

    if (
      kitsResponse.error
    ) {
      setErrorMessage(
        "Errore caricamento kit: " +
          kitsResponse.error
            .message
      );
      setLoading(false);
      return;
    }

    const cleanKits:
      UpholsteryKit[] =
      (
        kitsResponse.data ||
        []
      ).map(
        (row) => ({
          id:
            String(
              row.id
            ),
          item_id:
            String(
              row.item_id
            ),
          matricola:
            Number(
              row.matricola ||
                0
            ),
          scanner_code:
            String(
              row.scanner_code ||
                ""
            ),
          color:
            String(
              row.color ||
                ""
            ),
          details_logos:
            String(
              row.details_logos ||
                ""
            ),
          stitching:
            String(
              row.stitching ||
                ""
            ),
          quilting:
            String(
              row.quilting ||
                ""
            ),
          unit_price:
            Number(
              row.unit_price ||
                0
            ),
          boat_registration:
            row.boat_registration
              ? String(
                  row.boat_registration
                )
              : null,
          status:
            String(
              row.status ||
                ""
            ),
          note:
            row.note
              ? String(
                  row.note
                )
              : null,
          created_at:
            String(
              row.created_at ||
                ""
            ),
        })
      );

    setKits(
      cleanKits
    );

    setPriceDrafts(
      Object.fromEntries(
        cleanKits.map(
          (kit) => [
            kit.id,
            Number(
              kit.unit_price ||
                0
            ).toFixed(
              2
            ),
          ]
        )
      )
    );

    setBoatDrafts(
      Object.fromEntries(
        cleanKits.map(
          (kit) => [
            kit.id,
            kit.boat_registration ||
              "",
          ]
        )
      )
    );

    if (
      itemsResponse.error
    ) {
      setErrorMessage(
        "Errore caricamento articoli: " +
          itemsResponse.error
            .message
      );
      setLoading(false);
      return;
    }

    setItemLookup(
      (
        itemsResponse.data ||
        []
      ).map(
        (row) => ({
          id:
            String(
              row.id
            ),
          code:
            String(
              row.code ||
                ""
            ),
          supplier_code:
            row.supplier_code
              ? String(
                  row.supplier_code
                )
              : null,
          description:
            String(
              row.description ||
                ""
            ),
        })
      )
    );

    setLoading(false);
  }

  function clearMessages() {
    setMessage("");
    setErrorMessage("");
  }

  function formatEuro(
    value: number
  ) {
    return new Intl.NumberFormat(
      "it-IT",
      {
        style: "currency",
        currency: "EUR",
      }
    ).format(
      Number(
        value ||
          0
      )
    );
  }

  async function saveKitPrice(
    kit: UpholsteryKit
  ) {
    const price =
      Number(
        (
          priceDrafts[
            kit.id
          ] || ""
        )
          .trim()
          .replace(
            ",",
            "."
          )
      );

    if (
      !Number.isFinite(
        price
      ) ||
      price <= 0
    ) {
      setErrorMessage(
        "Inserisci un prezzo maggiore di zero."
      );
      return;
    }

    setSavingPriceId(
      kit.id
    );
    clearMessages();

    const {
      error,
    } =
      await supabase.rpc(
        "update_upholstery_kit_price",
        {
          p_kit_id:
            kit.id,
          p_unit_price:
            price,
        }
      );

    if (error) {
      setErrorMessage(
        "Errore salvataggio prezzo: " +
          error.message
      );
      setSavingPriceId(
        ""
      );
      return;
    }

    setKits(
      (current) =>
        current.map(
          (row) =>
            row.id ===
            kit.id
              ? {
                  ...row,
                  unit_price:
                    price,
                }
              : row
        )
    );

    setPriceDrafts(
      (current) => ({
        ...current,
        [kit.id]:
          price.toFixed(
            2
          ),
      })
    );

    setMessage(
      `Prezzo Kit #${kit.matricola} aggiornato: ${formatEuro(price)}.`
    );

    setSavingPriceId(
      ""
    );
  }

  async function sellKit(
    kit: UpholsteryKit
  ) {
    const boatRegistration =
      (
        boatDrafts[
          kit.id
        ] || ""
      ).trim();

    if (
      !boatRegistration
    ) {
      setErrorMessage(
        "Inserisci la Matricola Battello prima di segnare il kit come venduto."
      );
      return;
    }

    const confirmed =
      window.confirm(
        `Confermi la vendita del Kit #${kit.matricola}?\n\n` +
          `Matricola Battello: ${boatRegistration}\n\n` +
          "Il kit uscirà dalla giacenza e non comparirà più nei PDF di magazzino."
      );

    if (
      !confirmed
    ) {
      return;
    }

    setSavingBoatId(
      kit.id
    );
    clearMessages();

    const {
      error,
    } =
      await supabase.rpc(
        "sell_upholstery_kit",
        {
          p_kit_id:
            kit.id,
          p_boat_registration:
            boatRegistration,
        }
      );

    if (error) {
      setErrorMessage(
        "Errore registrazione vendita: " +
          error.message
      );
      setSavingBoatId(
        ""
      );
      return;
    }

    setMessage(
      `Kit #${kit.matricola} venduto al battello ${boatRegistration}.`
    );

    setSavingBoatId(
      ""
    );

    await loadData();
  }

  async function restoreSoldKit(
    kit: UpholsteryKit
  ) {
    const confirmed =
      window.confirm(
        `Vuoi annullare la vendita del Kit #${kit.matricola}?\n\n` +
          "Il kit tornerà in giacenza e la Matricola Battello verrà rimossa."
      );

    if (
      !confirmed
    ) {
      return;
    }

    setSavingBoatId(
      kit.id
    );
    clearMessages();

    const {
      error,
    } =
      await supabase.rpc(
        "restore_upholstery_kit",
        {
          p_kit_id:
            kit.id,
        }
      );

    if (error) {
      setErrorMessage(
        "Errore annullamento vendita: " +
          error.message
      );
      setSavingBoatId(
        ""
      );
      return;
    }

    setMessage(
      `Vendita Kit #${kit.matricola} annullata. Il kit è tornato in giacenza.`
    );

    setSavingBoatId(
      ""
    );

    await loadData();
  }

  function generateKitsPdf(
    includePrices: boolean
  ) {
    if (
      stockKits.length ===
      0
    ) {
      setErrorMessage(
        "Non ci sono kit in giacenza da inserire nel PDF."
      );
      return;
    }

    clearMessages();

    const doc =
      new jsPDF({
        orientation:
          "landscape",
        unit: "mm",
        format: "a4",
      });

    const pageWidth =
      doc.internal.pageSize.getWidth();

    const pageHeight =
      doc.internal.pageSize.getHeight();

    const marginLeft = 9;
    const marginRight = 9;

    let y = 13;

    function drawHeader() {
      doc.setFont(
        "helvetica",
        "bold"
      );
      doc.setFontSize(
        16
      );

      doc.text(
        "MAGAZZINO TAPPEZZERIE",
        marginLeft,
        y
      );

      y += 6;

      doc.setFontSize(
        10
      );

      doc.text(
        supplierName,
        marginLeft,
        y
      );

      y += 5;

      doc.setFont(
        "helvetica",
        "normal"
      );
      doc.setFontSize(
        7
      );

      doc.text(
        includePrices
          ? "Kit in giacenza - CON IMPORTI"
          : "Kit in giacenza - SENZA IMPORTI",
        marginLeft,
        y
      );

      y += 4;

      doc.text(
        `Data: ${new Intl.DateTimeFormat(
          "it-IT"
        ).format(
          new Date()
        )}`,
        marginLeft,
        y
      );

      y += 5;

      doc.setDrawColor(
        190
      );
      doc.line(
        marginLeft,
        y,
        pageWidth -
          marginRight,
        y
      );

      y += 5;
    }

    const columns =
      includePrices
        ? {
            matricola: 9,
            code: 25,
            scanner: 52,
            description: 86,
            color: 137,
            details: 169,
            stitching: 207,
            quilting: 233,
            price: 285,
          }
        : {
            matricola: 9,
            code: 26,
            scanner: 56,
            description: 94,
            color: 151,
            details: 188,
            stitching: 230,
            quilting: 260,
            price: 0,
          };

    function drawTableHeader() {
      doc.setFont(
        "helvetica",
        "bold"
      );
      doc.setFontSize(
        6.5
      );

      doc.text(
        "MATR.",
        columns.matricola,
        y
      );

      doc.text(
        "COD. ARTICOLO",
        columns.code,
        y
      );

      doc.text(
        "SCANNER",
        columns.scanner,
        y
      );

      doc.text(
        "DESCRIZIONE",
        columns.description,
        y
      );

      doc.text(
        "COLORE",
        columns.color,
        y
      );

      doc.text(
        "DETTAGLI / LOGHI",
        columns.details,
        y
      );

      doc.text(
        "CUCITURA",
        columns.stitching,
        y
      );

      doc.text(
        "TRAPUNT.",
        columns.quilting,
        y
      );

      if (
        includePrices
      ) {
        doc.text(
          "PREZZO",
          columns.price,
          y,
          {
            align:
              "right",
          }
        );
      }

      y += 3;

      doc.setDrawColor(
        170
      );
      doc.line(
        marginLeft,
        y,
        pageWidth -
          marginRight,
        y
      );

      y += 4;
    }

    drawHeader();
    drawTableHeader();

    stockKits.forEach(
      (kit) => {
        const item =
          itemMap.get(
            kit.item_id
          );

        const code =
          item?.supplier_code ||
          item?.code ||
          "-";

        const description =
          item?.description ||
          "Articolo non trovato";

        const descriptionLines =
          doc.splitTextToSize(
            description,
            includePrices
              ? 46
              : 52
          );

        const rowHeight =
          Math.max(
            6,
            descriptionLines.length *
              3.2
          );

        if (
          y +
            rowHeight >
          pageHeight -
            14
        ) {
          doc.addPage();
          y = 13;
          drawHeader();
          drawTableHeader();
        }

        doc.setFont(
          "helvetica",
          "normal"
        );
        doc.setFontSize(
          6.5
        );

        doc.text(
          `#${kit.matricola}`,
          columns.matricola,
          y
        );

        doc.text(
          String(code),
          columns.code,
          y
        );

        doc.text(
          kit.scanner_code ||
            "-",
          columns.scanner,
          y
        );

        doc.text(
          descriptionLines,
          columns.description,
          y
        );

        doc.text(
          kit.color ||
            "-",
          columns.color,
          y
        );

        doc.text(
          kit.details_logos ||
            "-",
          columns.details,
          y
        );

        doc.text(
          kit.stitching ||
            "-",
          columns.stitching,
          y
        );

        doc.text(
          kit.quilting ||
            "-",
          columns.quilting,
          y
        );

        if (
          includePrices
        ) {
          doc.text(
            formatEuro(
              kit.unit_price
            ),
            columns.price,
            y,
            {
              align:
                "right",
            }
          );
        }

        y +=
          rowHeight;

        doc.setDrawColor(
          225
        );
        doc.line(
          marginLeft,
          y,
          pageWidth -
            marginRight,
          y
        );

        y += 3;
      }
    );

    if (
      includePrices
    ) {
      if (
        y >
        pageHeight -
          20
      ) {
        doc.addPage();
        y = 18;
      }

      y += 3;

      doc.setFont(
        "helvetica",
        "bold"
      );
      doc.setFontSize(
        10
      );

      doc.text(
        `TOTALE MAGAZZINO TAPPEZZERIE: ${formatEuro(totalValue)}`,
        pageWidth -
          marginRight,
        y,
        {
          align:
            "right",
        }
      );
    }

    const safeName =
      supplierName
        .replace(
          /[^a-zA-Z0-9]+/g,
          "_"
        )
        .replace(
          /^_+|_+$/g,
          ""
        );

    doc.save(
      includePrices
        ? `Tappezzerie_${safeName}_con_importi.pdf`
        : `Tappezzerie_${safeName}_senza_importi.pdf`
    );
  }

  if (loading) {
    return (
      <div className="tap-loading">
        Caricamento kit...
        <Styles />
      </div>
    );
  }

  return (
    <div className="tap-page">
      <section className="tap-hero">
        <div>
          <div className="tap-eyebrow">
            MAGAZZINO TAPPEZZERIE
          </div>

          <h1>
            Kit in giacenza
          </h1>

          <p>
            {supplierName}
          </p>
        </div>

        <div className="tap-actions">
          <Link
            href={`/suppliers/${supplierId}`}
            className="tap-button secondary"
          >
            ← Magazzino D&apos;AMICO
          </Link>

          <Link
            href={`/suppliers/${supplierId}/upholstery/configurazioni`}
            className="tap-button secondary"
          >
            ⚙ Configurazioni
          </Link>

          <Link
            href={`/suppliers/${supplierId}/upholstery/new-kit`}
            className="tap-button primary"
          >
            + Nuovo kit
          </Link>
        </div>
      </section>

      {(message ||
        errorMessage) && (
        <div
          className={
            errorMessage
              ? "tap-message error"
              : "tap-message success"
          }
        >
          {errorMessage ||
            message}
        </div>
      )}

      <section className="tap-summary">
        <div>
          <span>
            KIT IN GIACENZA
          </span>

          <strong>
            {stockKits.length}
          </strong>
        </div>

        <div>
          <span>
            VALORE TOTALE
          </span>

          <strong>
            {formatEuro(
              totalValue
            )}
          </strong>
        </div>

        <div>
          <span>
            VENDUTI
          </span>

          <strong>
            {soldKits.length}
          </strong>
        </div>

        <div className="tap-pdf-actions">
          <button
            type="button"
            onClick={() =>
              generateKitsPdf(
                false
              )
            }
            disabled={
              stockKits.length ===
              0
            }
          >
            PDF senza importi
          </button>

          <button
            type="button"
            className="primary"
            onClick={() =>
              generateKitsPdf(
                true
              )
            }
            disabled={
              stockKits.length ===
              0
            }
          >
            PDF con importi
          </button>

          <button
            type="button"
            onClick={
              loadData
            }
          >
            Aggiorna
          </button>
        </div>
      </section>

      <section className="tap-table-card">
        {stockKits.length ===
        0 ? (
          <div className="tap-empty">
            <strong>
              Nessun kit in giacenza
            </strong>

            <span>
              Premi “Nuovo kit” per inserire la prima tappezzeria.
            </span>
          </div>
        ) : (
          <div className="tap-table-wrap">
            <table className="tap-table">
              <thead>
                <tr>
                  <th>
                    Matricola
                  </th>

                  <th>
                    Codice articolo
                  </th>

                  <th>
                    Codice scanner
                  </th>

                  <th>
                    Descrizione
                  </th>

                  <th>
                    Colore
                  </th>

                  <th>
                    Dettagli e loghi
                  </th>

                  <th>
                    Cucitura
                  </th>

                  <th>
                    Trapuntatura
                  </th>

                  <th>
                    Prezzo
                  </th>

                  <th>
                    Matricola Battello
                  </th>

                  <th>
                    Stato
                  </th>
                </tr>
              </thead>

              <tbody>
                {stockKits.map(
                  (kit) => {
                    const item =
                      itemMap.get(
                        kit.item_id
                      );

                    return (
                      <tr
                        key={
                          kit.id
                        }
                        className="tap-clickable-row"
                        title="Apri scheda kit e note"
                        onClick={() =>
                          router.push(
                            `/suppliers/${supplierId}/upholstery/kit/${kit.id}`
                          )
                        }
                      >
                        <td>
                          <strong className="tap-matricola">
                            #
                            {
                              kit.matricola
                            }
                          </strong>
                        </td>

                        <td>
                          <strong>
                            {item
                              ?.supplier_code ||
                              item?.code ||
                              "—"}
                          </strong>
                        </td>

                        <td>
                          <span className="tap-scanner">
                            {
                              kit.scanner_code
                            }
                          </span>
                        </td>

                        <td className="tap-description">
                          {item
                            ?.description ||
                            "Articolo non trovato"}
                        </td>

                        <td>
                          {
                            kit.color
                          }
                        </td>

                        <td>
                          {
                            kit.details_logos
                          }
                        </td>

                        <td>
                          {
                            kit.stitching
                          }
                        </td>

                        <td>
                          {
                            kit.quilting
                          }
                        </td>

                        <td>
                          <div
                            className="tap-price-editor"
                            onClick={(
                              event
                            ) =>
                              event.stopPropagation()
                            }
                          >
                            <span>
                              €
                            </span>

                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={
                                priceDrafts[
                                  kit.id
                                ] ??
                                String(
                                  kit.unit_price ||
                                    0
                                )
                              }
                              onChange={(
                                event
                              ) =>
                                setPriceDrafts(
                                  (
                                    current
                                  ) => ({
                                    ...current,
                                    [kit.id]:
                                      event
                                        .target
                                        .value,
                                  })
                                )
                              }
                            />

                            <button
                              type="button"
                              onClick={() =>
                                saveKitPrice(
                                  kit
                                )
                              }
                              disabled={
                                savingPriceId ===
                                kit.id
                              }
                            >
                              {savingPriceId ===
                              kit.id
                                ? "..."
                                : "Salva"}
                            </button>
                          </div>
                        </td>

                        <td>
                          <div
                            className="tap-boat-editor"
                            onClick={(
                              event
                            ) =>
                              event.stopPropagation()
                            }
                          >
                            <input
                              value={
                                boatDrafts[
                                  kit.id
                                ] ||
                                ""
                              }
                              onChange={(
                                event
                              ) =>
                                setBoatDrafts(
                                  (
                                    current
                                  ) => ({
                                    ...current,
                                    [kit.id]:
                                      event
                                        .target
                                        .value,
                                  })
                                )
                              }
                              placeholder="Matricola battello"
                            />

                            <button
                              type="button"
                              onClick={() =>
                                sellKit(
                                  kit
                                )
                              }
                              disabled={
                                savingBoatId ===
                                kit.id
                              }
                            >
                              {savingBoatId ===
                              kit.id
                                ? "..."
                                : "Vendi"}
                            </button>
                          </div>
                        </td>

                        <td>
                          <span className="tap-status">
                            IN GIACENZA
                          </span>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {soldKits.length > 0 && (
        <section className="tap-sold-card">
          <div className="tap-sold-head">
            <div>
              <div className="tap-eyebrow">
                STORICO VENDITE
              </div>

              <h2>
                Kit venduti
              </h2>

              <p>
                Questi kit non fanno più parte della giacenza
                e non vengono inseriti nei PDF di magazzino.
              </p>
            </div>

            <strong>
              {soldKits.length}
            </strong>
          </div>

          <div className="tap-table-wrap">
            <table className="tap-table sold">
              <thead>
                <tr>
                  <th>
                    Matricola Kit
                  </th>

                  <th>
                    Matricola Battello
                  </th>

                  <th>
                    Codice articolo
                  </th>

                  <th>
                    Codice scanner
                  </th>

                  <th>
                    Descrizione
                  </th>

                  <th>
                    Colore
                  </th>

                  <th>
                    Dettagli e loghi
                  </th>

                  <th>
                    Cucitura
                  </th>

                  <th>
                    Trapuntatura
                  </th>

                  <th>
                    Stato
                  </th>

                  <th>
                    Azione
                  </th>
                </tr>
              </thead>

              <tbody>
                {soldKits.map(
                  (kit) => {
                    const item =
                      itemMap.get(
                        kit.item_id
                      );

                    return (
                      <tr
                        key={
                          kit.id
                        }
                        className="tap-clickable-row"
                        title="Apri scheda kit e note"
                        onClick={() =>
                          router.push(
                            `/suppliers/${supplierId}/upholstery/kit/${kit.id}`
                          )
                        }
                      >
                        <td>
                          <strong className="tap-matricola">
                            #
                            {
                              kit.matricola
                            }
                          </strong>
                        </td>

                        <td>
                          <strong className="tap-boat-chip">
                            {
                              kit.boat_registration
                            }
                          </strong>
                        </td>

                        <td>
                          <strong>
                            {item
                              ?.supplier_code ||
                              item?.code ||
                              "—"}
                          </strong>
                        </td>

                        <td>
                          <span className="tap-scanner">
                            {
                              kit.scanner_code
                            }
                          </span>
                        </td>

                        <td className="tap-description">
                          {item
                            ?.description ||
                            "Articolo non trovato"}
                        </td>

                        <td>
                          {
                            kit.color
                          }
                        </td>

                        <td>
                          {
                            kit.details_logos
                          }
                        </td>

                        <td>
                          {
                            kit.stitching
                          }
                        </td>

                        <td>
                          {
                            kit.quilting
                          }
                        </td>

                        <td>
                          <span className="tap-status sold">
                            VENDUTO
                          </span>
                        </td>

                        <td
                          onClick={(
                            event
                          ) =>
                            event.stopPropagation()
                          }
                        >
                          <button
                            type="button"
                            className="tap-restore"
                            onClick={() =>
                              restoreSoldKit(
                                kit
                              )
                            }
                            disabled={
                              savingBoatId ===
                              kit.id
                            }
                          >
                            {savingBoatId ===
                            kit.id
                              ? "..."
                              : "Annulla vendita"}
                          </button>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Styles />
    </div>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      .tap-page {
        width: 100%;
        max-width: 1500px;
        margin: 0 auto;
        color: #f8fafc;
      }

      .tap-loading {
        min-height: 45vh;
        display: grid;
        place-items: center;
        color: var(--foreground);
        font-weight: 800;
      }

      .tap-hero {
        padding: 20px 22px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        border: 1px solid rgba(96, 165, 250, 0.24);
        border-radius: 16px;
        background:
          linear-gradient(
            135deg,
            #0d1d31,
            #091525
          );
      }

      .tap-eyebrow {
        color: #60a5fa;
        font-size: 9px;
        font-weight: 950;
        letter-spacing: 1.5px;
      }

      .tap-hero h1 {
        margin: 5px 0 0;
        color: #ffffff;
        font-size: 30px;
        font-weight: 950;
        letter-spacing: -0.7px;
      }

      .tap-hero p {
        margin: 5px 0 0;
        color: #cbd5e1;
        font-size: 11px;
        font-weight: 700;
      }

      .tap-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }

      .tap-button {
        min-height: 40px;
        padding: 0 13px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 9px;
        text-decoration: none;
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
      }

      .tap-button.secondary {
        border: 1px solid rgba(148, 163, 184, 0.24);
        background: rgba(255, 255, 255, 0.035);
        color: #e2e8f0;
      }

      .tap-button.primary {
        border: 1px solid #2563eb;
        background: #2563eb;
        color: #ffffff;
      }

      .tap-message {
        margin-top: 12px;
        padding: 11px 13px;
        border-radius: 9px;
        font-size: 11px;
        font-weight: 800;
      }

      .tap-message.success {
        border: 1px solid rgba(34, 197, 94, 0.28);
        background: rgba(34, 197, 94, 0.08);
        color: #86efac;
      }

      .tap-message.error {
        border: 1px solid rgba(239, 68, 68, 0.30);
        background: rgba(239, 68, 68, 0.08);
        color: #fca5a5;
      }

      .tap-summary {
        margin-top: 12px;
        padding: 13px 15px;
        display: flex;
        align-items: center;
        gap: 28px;
        border: 1px solid rgba(148, 163, 184, 0.16);
        border-radius: 12px;
        background: #0c1a2b;
      }

      .tap-summary > div:not(.tap-pdf-actions) {
        min-width: 120px;
      }

      .tap-summary span,
      .tap-summary strong {
        display: block;
      }

      .tap-summary span {
        color: #7890ad;
        font-size: 8px;
        font-weight: 950;
        letter-spacing: 1px;
      }

      .tap-summary strong {
        margin-top: 3px;
        color: #ffffff;
        font-size: 18px;
      }

      .tap-pdf-actions {
        margin-left: auto;
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 7px;
      }

      .tap-pdf-actions button {
        min-height: 34px;
        padding: 0 10px;
        border: 1px solid rgba(96, 165, 250, 0.30);
        border-radius: 8px;
        background: rgba(59, 130, 246, 0.08);
        color: #bfdbfe;
        cursor: pointer;
        font-size: 9px;
        font-weight: 900;
      }

      .tap-pdf-actions button.primary {
        border-color: #2563eb;
        background: #2563eb;
        color: white;
      }

      .tap-pdf-actions button:disabled {
        opacity: 0.42;
        cursor: not-allowed;
      }

      .tap-table-card {
        margin-top: 12px;
        padding: 10px;
        border: 1px solid rgba(96, 165, 250, 0.20);
        border-radius: 15px;
        background: #0b1828;
      }

      .tap-table-wrap {
        width: 100%;
        overflow-x: auto;
        border: 1px solid rgba(148, 163, 184, 0.16);
        border-radius: 10px;
      }

      .tap-table {
        width: 100%;
        min-width: 1250px;
        border-collapse: collapse;
        color: #e8eef7;
        font-size: 10px;
      }

      .tap-table th {
        padding: 10px 11px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.18);
        background: rgba(255, 255, 255, 0.035);
        color: #93a9c5;
        text-align: left;
        font-size: 8px;
        font-weight: 950;
        letter-spacing: 0.65px;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .tap-table td {
        padding: 11px;
        border-top: 1px solid rgba(148, 163, 184, 0.10);
        vertical-align: middle;
        white-space: nowrap;
      }

      .tap-table tbody tr:first-child td {
        border-top: 0;
      }

      .tap-table tbody tr:hover {
        background: rgba(59, 130, 246, 0.05);
      }

      .tap-clickable-row {
        cursor: pointer;
      }

      .tap-clickable-row:hover {
        background: rgba(59, 130, 246, 0.085) !important;
      }

      .tap-description {
        max-width: 250px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .tap-matricola {
        display: inline-flex;
        padding: 5px 8px;
        border: 1px solid rgba(96, 165, 250, 0.42);
        border-radius: 7px;
        background: rgba(59, 130, 246, 0.13);
        color: #93c5fd;
      }

      .tap-scanner {
        display: inline-flex;
        padding: 4px 7px;
        border: 1px solid rgba(148, 163, 184, 0.20);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.035);
        color: #d9e3ef;
        font-family: monospace;
      }

      .tap-price-editor {
        display: grid;
        grid-template-columns:
          auto
          72px
          auto;
        align-items: center;
        gap: 4px;
      }

      .tap-price-editor > span {
        color: #93c5fd;
        font-weight: 900;
      }

      .tap-price-editor input {
        width: 72px;
        min-height: 29px;
        box-sizing: border-box;
        padding: 0 6px;
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 6px;
        outline: none;
        background: rgba(255, 255, 255, 0.04);
        color: #ffffff;
        font-size: 9px;
      }

      .tap-price-editor button {
        min-height: 29px;
        padding: 0 7px;
        border: 1px solid rgba(96, 165, 250, 0.30);
        border-radius: 6px;
        background: rgba(59, 130, 246, 0.10);
        color: #93c5fd;
        cursor: pointer;
        font-size: 8px;
        font-weight: 900;
      }

      .tap-boat-editor {
        display: grid;
        grid-template-columns:
          minmax(140px, 1fr)
          auto;
        align-items: center;
        gap: 5px;
      }

      .tap-boat-editor input {
        min-height: 30px;
        min-width: 145px;
        padding: 0 8px;
        box-sizing: border-box;
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 6px;
        outline: none;
        background: rgba(255, 255, 255, 0.04);
        color: #ffffff;
        font-size: 9px;
      }

      .tap-boat-editor input:focus {
        border-color: rgba(96, 165, 250, 0.65);
      }

      .tap-boat-editor button {
        min-height: 30px;
        padding: 0 8px;
        border: 1px solid rgba(249, 115, 22, 0.36);
        border-radius: 6px;
        background: rgba(249, 115, 22, 0.10);
        color: #fdba74;
        cursor: pointer;
        font-size: 8px;
        font-weight: 950;
      }

      .tap-sold-card {
        margin-top: 12px;
        padding: 10px;
        border: 1px solid rgba(249, 115, 22, 0.20);
        border-radius: 15px;
        background: #0b1828;
      }

      .tap-sold-head {
        padding: 4px 5px 12px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 14px;
      }

      .tap-sold-head h2 {
        margin: 4px 0 0;
        color: #ffffff;
        font-size: 18px;
        font-weight: 950;
      }

      .tap-sold-head p {
        margin: 5px 0 0;
        color: #94a3b8;
        font-size: 9px;
      }

      .tap-sold-head > strong {
        padding: 6px 9px;
        border: 1px solid rgba(249, 115, 22, 0.28);
        border-radius: 999px;
        background: rgba(249, 115, 22, 0.08);
        color: #fdba74;
        font-size: 10px;
      }

      .tap-table.sold {
        min-width: 1380px;
      }

      .tap-boat-chip {
        display: inline-flex;
        padding: 5px 8px;
        border: 1px solid rgba(249, 115, 22, 0.28);
        border-radius: 7px;
        background: rgba(249, 115, 22, 0.08);
        color: #fdba74;
      }

      .tap-status {
        display: inline-flex;
        padding: 5px 8px;
        border: 1px solid rgba(34, 197, 94, 0.30);
        border-radius: 999px;
        background: rgba(34, 197, 94, 0.09);
        color: #86efac;
        font-size: 8px;
        font-weight: 950;
      }

      .tap-status.sold {
        border-color: rgba(249, 115, 22, 0.30);
        background: rgba(249, 115, 22, 0.08);
        color: #fdba74;
      }

      .tap-restore {
        min-height: 30px;
        padding: 0 8px;
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.035);
        color: #cbd5e1;
        cursor: pointer;
        font-size: 8px;
        font-weight: 850;
      }

      .tap-restore:disabled,
      .tap-boat-editor button:disabled {
        opacity: 0.5;
        cursor: wait;
      }

      .tap-empty {
        min-height: 160px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 5px;
        color: #8da0b9;
      }

      .tap-empty strong {
        color: #ffffff;
        font-size: 13px;
      }

      .tap-empty span {
        font-size: 10px;
      }

      @media (max-width: 850px) {
        .tap-hero,
        .tap-summary {
          align-items: stretch;
          flex-direction: column;
        }

        .tap-actions,
        .tap-pdf-actions {
          margin-left: 0;
          justify-content: flex-start;
        }
      }
    `}</style>
  );
}
