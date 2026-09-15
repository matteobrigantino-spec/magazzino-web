"use client";

import {
  use,
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import { supabase } from "../../../../../lib/supabaseClient";

type Item = {
  id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  stock: number;
};

type OptionType =
  | "color"
  | "details_logos"
  | "stitching"
  | "quilting";

type UpholsteryOption = {
  id: string;
  option_type: OptionType;
  name: string;
};

type OptionGroups = {
  color: UpholsteryOption[];
  details_logos: UpholsteryOption[];
  stitching: UpholsteryOption[];
  quilting: UpholsteryOption[];
};

const EMPTY_GROUPS: OptionGroups = {
  color: [],
  details_logos: [],
  stitching: [],
  quilting: [],
};

export default function NewUpholsteryKitPage({
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

  const [
    supplierName,
    setSupplierName,
  ] = useState(
    "D'AMICO ARREDAMENTI NAVALI"
  );

  const [
    items,
    setItems,
  ] =
    useState<Item[]>([]);

  const [
    optionGroups,
    setOptionGroups,
  ] =
    useState<OptionGroups>(
      EMPTY_GROUPS
    );

  const [
    selectedItemId,
    setSelectedItemId,
  ] =
    useState("");

  const [
    scannerCode,
    setScannerCode,
  ] =
    useState("");

  const [
    matricola,
    setMatricola,
  ] =
    useState("");

  const [
    unitPrice,
    setUnitPrice,
  ] =
    useState("");

  const [
    color,
    setColor,
  ] =
    useState("");

  const [
    detailsLogos,
    setDetailsLogos,
  ] =
    useState("");

  const [
    stitching,
    setStitching,
  ] =
    useState("");

  const [
    quilting,
    setQuilting,
  ] =
    useState("");

  const [
    note,
    setNote,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

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

  const selectedItem =
    useMemo(
      () =>
        items.find(
          (item) =>
            item.id ===
            selectedItemId
        ) || null,
      [
        items,
        selectedItemId,
      ]
    );

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const [
      supplierResponse,
      itemsResponse,
      optionsResponse,
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
            "items"
          )
          .select(
            "id,code,supplier_code,description,stock"
          )
          .eq(
            "supplier_id",
            supplierId
          )
          .order(
            "supplier_code",
            {
              ascending:
                true,
            }
          )
          .order(
            "description",
            {
              ascending:
                true,
            }
          ),

        supabase
          .from(
            "upholstery_options"
          )
          .select(
            "id,option_type,name"
          )
          .eq(
            "supplier_id",
            supplierId
          )
          .eq(
            "active",
            true
          )
          .order(
            "sort_order",
            {
              ascending:
                true,
            }
          )
          .order(
            "name",
            {
              ascending:
                true,
            }
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

    const cleanItems:
      Item[] =
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
          stock:
            Number(
              row.stock ||
                0
            ),
        })
      );

    setItems(
      cleanItems
    );

    if (
      optionsResponse.error
    ) {
      setErrorMessage(
        "Errore caricamento configurazioni: " +
          optionsResponse.error
            .message
      );
      setLoading(false);
      return;
    }

    const groups:
      OptionGroups = {
      color: [],
      details_logos: [],
      stitching: [],
      quilting: [],
    };

    (
      optionsResponse.data ||
      []
    ).forEach(
      (row) => {
        const type =
          row.option_type as OptionType;

        if (
          !groups[type]
        ) {
          return;
        }

        groups[
          type
        ].push({
          id:
            String(
              row.id
            ),
          option_type:
            type,
          name:
            String(
              row.name ||
                ""
            ),
        });
      }
    );

    setOptionGroups(
      groups
    );

    if (
      cleanItems.length >
      0
    ) {
      const first =
        cleanItems[0];

      setSelectedItemId(
        first.id
      );

      setScannerCode(
        first.code
      );
    }

    setColor(
      groups.color[0]
        ?.name || ""
    );

    setDetailsLogos(
      groups
        .details_logos[0]
        ?.name || ""
    );

    setStitching(
      groups.stitching[0]
        ?.name || ""
    );

    setQuilting(
      groups.quilting[0]
        ?.name || ""
    );

    await loadNextMatricola();

    setLoading(false);
  }

  async function loadNextMatricola() {
    const {
      data,
      error,
    } =
      await supabase.rpc(
        "next_upholstery_matricola",
        {
          p_supplier_id:
            supplierId,
        }
      );

    if (error) {
      setErrorMessage(
        "Errore calcolo Matricola Kit: " +
          error.message
      );
      return;
    }

    if (
      data === null ||
      data === undefined
    ) {
      setErrorMessage(
        "Non ci sono più Matricole Kit disponibili tra 1 e 10000."
      );
      return;
    }

    setMatricola(
      String(data)
    );
  }

  function changeItem(
    itemId: string
  ) {
    setSelectedItemId(
      itemId
    );

    const item =
      items.find(
        (row) =>
          row.id ===
          itemId
      );

    setScannerCode(
      item?.code ||
        ""
    );

    setMessage("");
    setErrorMessage("");
  }

  function hasAllChoices() {
    return (
      optionGroups
        .color.length >
        0 &&
      optionGroups
        .details_logos
        .length >
        0 &&
      optionGroups
        .stitching.length >
        0 &&
      optionGroups
        .quilting.length >
        0
    );
  }

  async function saveKit() {
    setMessage("");
    setErrorMessage("");

    if (
      !selectedItem
    ) {
      setErrorMessage(
        "Seleziona il Codice articolo."
      );
      return;
    }

    const matricolaNumber =
      Number(
        matricola
      );

    if (
      !Number.isInteger(
        matricolaNumber
      ) ||
      matricolaNumber <
        1 ||
      matricolaNumber >
        10000
    ) {
      setErrorMessage(
        "La Matricola Kit deve essere un numero da 1 a 10000."
      );
      return;
    }

    if (
      !scannerCode.trim()
    ) {
      setErrorMessage(
        "Inserisci il Codice scanner."
      );
      return;
    }

    const priceNumber =
      Number(
        unitPrice
          .trim()
          .replace(
            ",",
            "."
          )
      );

    if (
      !Number.isFinite(
        priceNumber
      ) ||
      priceNumber <= 0
    ) {
      setErrorMessage(
        "Inserisci il prezzo del kit, maggiore di zero."
      );
      return;
    }

    if (
      !color ||
      !detailsLogos ||
      !stitching ||
      !quilting
    ) {
      setErrorMessage(
        "Seleziona Colore, Dettagli e loghi, Cucitura e Trapuntatura."
      );
      return;
    }

    setSaving(
      true
    );

    const {
      data,
      error,
    } =
      await supabase.rpc(
        "create_upholstery_stock_kit",
        {
          p_supplier_id:
            supplierId,
          p_item_id:
            selectedItem.id,
          p_matricola:
            matricolaNumber,
          p_scanner_code:
            scannerCode.trim(),
          p_unit_price:
            priceNumber,
          p_color:
            color,
          p_details_logos:
            detailsLogos,
          p_stitching:
            stitching,
          p_quilting:
            quilting,
          p_note:
            note.trim() ||
            null,
        }
      );

    if (error) {
      const lower =
        error.message.toLowerCase();

      if (
        lower.includes(
          "matricola"
        ) ||
        lower.includes(
          "duplicate"
        ) ||
        lower.includes(
          "unique"
        )
      ) {
        setErrorMessage(
          "Questa Matricola Kit è già utilizzata. Premi «Prossima libera» oppure scegli un altro numero."
        );
      } else {
        setErrorMessage(
          "Errore inserimento kit: " +
            error.message
        );
      }

      setSaving(
        false
      );
      return;
    }

    const savedMatricola =
      matricolaNumber;

    setMessage(
      `Kit #${savedMatricola} inserito in giacenza al prezzo di ${new Intl.NumberFormat(
        "it-IT",
        {
          style:
            "currency",
          currency:
            "EUR",
        }
      ).format(
        priceNumber
      )}. La giacenza dell'articolo è stata aumentata di 1.`
    );

    setNote("");
    setUnitPrice("");

    const {
      data:
        nextMatricola,
    } =
      await supabase.rpc(
        "next_upholstery_matricola",
        {
          p_supplier_id:
            supplierId,
        }
      );

    if (
      nextMatricola !==
        null &&
      nextMatricola !==
        undefined
    ) {
      setMatricola(
        String(
          nextMatricola
        )
      );
    }

    setSaving(
      false
    );
  }

  const missingConfiguration =
    !hasAllChoices();

  if (loading) {
    return (
      <div className="kit-loading">
        <div className="kit-spinner" />

        <strong>
          Nuovo Kit Tappezzeria
        </strong>

        <span>
          Caricamento...
        </span>

        <Styles />
      </div>
    );
  }

  return (
    <div className="kit-page">
      <section className="kit-hero">
        <div>
          <div className="kit-eyebrow">
            D&apos;AMICO · GIACENZA MANUALE
          </div>

          <h1>
            Nuovo Kit Tappezzeria
          </h1>

          <p>
            Seleziona le opzioni dai menu a tendina.
            Non devi riscrivere ogni volta colori,
            cuciture o trapuntature.
          </p>
        </div>

        <div className="kit-hero-actions">
          <Link
            href={`/suppliers/${supplierId}/upholstery`}
            className="kit-secondary-button"
          >
            ← Configurazione
          </Link>

          <Link
            href={`/suppliers/${supplierId}`}
            className="kit-secondary-button"
          >
            Magazzino D&apos;AMICO
          </Link>
        </div>
      </section>

      {errorMessage && (
        <div className="kit-message error">
          {errorMessage}
        </div>
      )}

      {message && (
        <div className="kit-message success">
          {message}
        </div>
      )}

      {missingConfiguration && (
        <section className="kit-warning">
          <strong>
            Prima completa le configurazioni
          </strong>

          <span>
            Per usare il form devono esserci almeno
            un Colore, un valore in Dettagli e loghi,
            una Cucitura e una Trapuntatura attivi.
          </span>

          <Link
            href={`/suppliers/${supplierId}/upholstery`}
          >
            Vai alla configurazione →
          </Link>
        </section>
      )}

      <section className="kit-form-card">
        <div className="kit-section-head">
          <div>
            <div className="kit-eyebrow">
              IDENTIFICAZIONE KIT
            </div>

            <h2>
              Articolo e matricola
            </h2>
          </div>

          {selectedItem && (
            <div className="kit-stock">
              Giacenza articolo
              <strong>
                {selectedItem.stock}
              </strong>
            </div>
          )}
        </div>

        <div className="kit-grid identification">
          <Field
            label="Codice articolo"
            hint="Scegli un articolo già presente nel magazzino D'AMICO."
          >
            <select
              value={
                selectedItemId
              }
              onChange={(
                event
              ) =>
                changeItem(
                  event.target
                    .value
                )
              }
            >
              {items.length ===
              0 ? (
                <option value="">
                  Nessun articolo disponibile
                </option>
              ) : (
                items.map(
                  (item) => (
                    <option
                      key={
                        item.id
                      }
                      value={
                        item.id
                      }
                    >
                      {item.supplier_code ||
                        item.code}{" "}
                      —{" "}
                      {
                        item.description
                      }
                    </option>
                  )
                )
              )}
            </select>
          </Field>

          <Field
            label="Codice scanner"
            hint="Viene proposto quello dell'articolo. Puoi cambiarlo se questo kit ha un codice diverso."
          >
            <input
              value={
                scannerCode
              }
              onChange={(
                event
              ) =>
                setScannerCode(
                  event.target
                    .value
                )
              }
              placeholder="Codice scanner"
              autoComplete="off"
            />
          </Field>

          <Field
            label="Matricola Kit"
            hint="Il sistema propone automaticamente il primo numero libero da 1 a 10000."
          >
            <div className="matricola-row">
              <input
                type="number"
                min="1"
                max="10000"
                step="1"
                value={
                  matricola
                }
                onChange={(
                  event
                ) =>
                  setMatricola(
                    event.target
                      .value
                  )
                }
              />

              <button
                type="button"
                className="free-matricola"
                onClick={
                  loadNextMatricola
                }
                disabled={
                  saving
                }
              >
                Prossima libera
              </button>
            </div>
          </Field>

          <Field
            label="Prezzo kit"
            hint="Prezzo del singolo kit. Sarà usato nel PDF con importi."
          >
            <div className="price-field-row">
              <span>
                €
              </span>

              <input
                type="number"
                min="0.01"
                step="0.01"
                value={
                  unitPrice
                }
                onChange={(
                  event
                ) =>
                  setUnitPrice(
                    event.target
                      .value
                  )
                }
                placeholder="0,00"
              />
            </div>
          </Field>
        </div>
      </section>

      <section className="kit-form-card">
        <div className="kit-section-head">
          <div>
            <div className="kit-eyebrow">
              CONFIGURAZIONE
            </div>

            <h2>
              Scegli le caratteristiche
            </h2>

            <p>
              Le voci dei menu arrivano direttamente
              dalla configurazione Tappezzerie di
              {` ${supplierName}`}.
            </p>
          </div>
        </div>

        <div className="kit-grid configuration">
          <SelectField
            label="Colore"
            value={
              color
            }
            onChange={
              setColor
            }
            options={
              optionGroups.color
            }
          />

          <SelectField
            label="Dettagli e loghi"
            value={
              detailsLogos
            }
            onChange={
              setDetailsLogos
            }
            options={
              optionGroups
                .details_logos
            }
          />

          <SelectField
            label="Cucitura"
            value={
              stitching
            }
            onChange={
              setStitching
            }
            options={
              optionGroups
                .stitching
            }
          />

          <SelectField
            label="Trapuntatura"
            value={
              quilting
            }
            onChange={
              setQuilting
            }
            options={
              optionGroups
                .quilting
            }
          />
        </div>
      </section>

      <section className="kit-form-card">
        <div className="kit-section-head">
          <div>
            <div className="kit-eyebrow">
              NOTE
            </div>

            <h2>
              Nota facoltativa
            </h2>
          </div>
        </div>

        <textarea
          className="kit-note"
          value={
            note
          }
          onChange={(
            event
          ) =>
            setNote(
              event.target
                .value
            )
          }
          placeholder="Es. kit destinato a ..., variante speciale, indicazioni del cliente..."
          rows={3}
        />
      </section>

      <section className="kit-summary">
        <div className="summary-main">
          <span>
            ANTEPRIMA KIT
          </span>

          <strong>
            {selectedItem
              ? selectedItem
                  .supplier_code ||
                selectedItem
                  .code
              : "—"}
            {matricola
              ? ` · #${matricola}`
              : ""}
          </strong>

          <small>
            {color ||
              "Colore"}{" "}
            ·{" "}
            {detailsLogos ||
              "Dettagli e loghi"}{" "}
            ·{" "}
            {stitching ||
              "Cucitura"}{" "}
            ·{" "}
            {quilting ||
              "Trapuntatura"}
            {unitPrice
              ? ` · € ${Number(
                  unitPrice
                ).toLocaleString(
                  "it-IT",
                  {
                    minimumFractionDigits:
                      2,
                    maximumFractionDigits:
                      2,
                  }
                )}`
              : ""}
          </small>
        </div>

        <button
          type="button"
          className="save-kit"
          onClick={
            saveKit
          }
          disabled={
            saving ||
            missingConfiguration ||
            !selectedItem
          }
        >
          {saving
            ? "Salvataggio..."
            : "Inserisci in giacenza"}
        </button>
      </section>

      <Styles />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange:
    (
      value:
        string
    ) => void;
  options:
    UpholsteryOption[];
}) {
  return (
    <Field
      label={label}
      hint="Scegli una delle opzioni configurate."
    >
      <select
        value={
          value
        }
        onChange={(
          event
        ) =>
          onChange(
            event.target
              .value
          )
        }
        disabled={
          options.length ===
          0
        }
      >
        {options.length ===
        0 ? (
          <option value="">
            Nessuna opzione configurata
          </option>
        ) : (
          options.map(
            (option) => (
              <option
                key={
                  option.id
                }
                value={
                  option.name
                }
              >
                {
                  option.name
                }
              </option>
            )
          )
        )}
      </select>
    </Field>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label:
    string;
  hint:
    string;
  children:
    React.ReactNode;
}) {
  return (
    <label className="kit-field">
      <span className="kit-field-label">
        {label}
      </span>

      <span className="kit-field-hint">
        {hint}
      </span>

      <div className="kit-control">
        {children}
      </div>
    </label>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      .kit-page {
        width: 100%;
        max-width: 1450px;
        margin: 0 auto;
        color: var(--foreground);
      }

      .kit-loading {
        min-height: 55vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: var(--foreground);
      }

      .kit-loading span {
        opacity: 0.65;
        font-size: 12px;
      }

      .kit-spinner {
        width: 34px;
        height: 34px;
        margin-bottom: 6px;
        border: 3px solid rgba(37, 99, 235, 0.14);
        border-top-color: #2563eb;
        border-radius: 999px;
        animation: kit-spin 0.75s linear infinite;
      }

      @keyframes kit-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .kit-hero {
        padding: 22px 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 20px;
        border: 1px solid #d9e2ef;
        border-radius: 16px;
        background:
          linear-gradient(
            135deg,
            #f8fbff,
            #eef5ff
          );
      }

      .kit-eyebrow {
        margin-bottom: 6px;
        color: #2563eb;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: 1.5px;
      }

      .kit-hero h1 {
        margin: 0;
        color: #0f172a;
        font-size: clamp(27px, 4vw, 39px);
        font-weight: 950;
        letter-spacing: -0.8px;
      }

      .kit-hero p {
        max-width: 700px;
        margin: 9px 0 0;
        color: #475569;
        font-size: 13px;
        line-height: 1.6;
      }

      .kit-hero-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }

      .kit-secondary-button {
        min-height: 42px;
        padding: 0 13px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #cbd5e1;
        border-radius: 9px;
        background: #ffffff;
        color: #0f172a;
        text-decoration: none;
        font-size: 11px;
        font-weight: 850;
      }

      .kit-message,
      .kit-warning {
        margin-top: 14px;
        border-radius: 11px;
      }

      .kit-message {
        padding: 12px 14px;
        font-size: 12px;
        font-weight: 750;
      }

      .kit-message.success {
        border: 1px solid #86efac;
        background: #f0fdf4;
        color: #166534;
      }

      .kit-message.error {
        border: 1px solid #fca5a5;
        background: #fef2f2;
        color: #991b1b;
      }

      .kit-warning {
        padding: 14px 16px;
        display: flex;
        align-items: center;
        gap: 10px 14px;
        flex-wrap: wrap;
        border: 1px solid #facc15;
        background: #fefce8;
        color: #713f12;
      }

      .kit-warning strong {
        font-size: 12px;
      }

      .kit-warning span {
        flex: 1 1 400px;
        font-size: 10px;
        line-height: 1.5;
      }

      .kit-warning a {
        color: #854d0e;
        font-size: 10px;
        font-weight: 900;
      }

      .kit-form-card {
        margin-top: 14px;
        padding: 19px;
        border: 1px solid #dbe3ee;
        border-radius: 14px;
        background: #ffffff;
        color: #0f172a;
      }

      .kit-section-head {
        margin-bottom: 15px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }

      .kit-section-head h2 {
        margin: 0;
        color: #0f172a;
        font-size: 18px;
        font-weight: 900;
      }

      .kit-section-head p {
        margin: 5px 0 0;
        color: #64748b;
        font-size: 10px;
      }

      .kit-stock {
        padding: 8px 10px;
        border: 1px solid #dbeafe;
        border-radius: 9px;
        background: #eff6ff;
        color: #475569;
        font-size: 9px;
      }

      .kit-stock strong {
        margin-left: 8px;
        color: #1d4ed8;
        font-size: 14px;
      }

      .kit-grid {
        display: grid;
        gap: 13px;
      }

      .kit-grid.identification {
        grid-template-columns:
          minmax(250px, 1.35fr)
          minmax(205px, 0.9fr)
          minmax(215px, 0.85fr)
          minmax(170px, 0.7fr);
      }

      .kit-grid.configuration {
        grid-template-columns:
          repeat(
            4,
            minmax(0, 1fr)
          );
      }

      .kit-field {
        min-width: 0;
        display: block;
      }

      .kit-field-label {
        display: block;
        color: #0f172a;
        font-size: 11px;
        font-weight: 900;
      }

      .kit-field-hint {
        min-height: 30px;
        margin-top: 4px;
        display: block;
        color: #64748b;
        font-size: 8px;
        line-height: 1.4;
      }

      .kit-control {
        margin-top: 5px;
      }

      .kit-control select,
      .kit-control input,
      .kit-note {
        width: 100%;
        box-sizing: border-box;
        outline: none;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #0f172a;
      }

      .kit-control select,
      .kit-control input {
        min-height: 46px;
        padding: 0 12px;
        border-radius: 9px;
        font-size: 13px;
      }

      .kit-control select {
        cursor: pointer;
      }

      .kit-control select:focus,
      .kit-control input:focus,
      .kit-note:focus {
        border-color: #60a5fa;
        box-shadow:
          0 0 0 3px
          rgba(59, 130, 246, 0.10);
      }

      .kit-control select:disabled {
        color: #94a3b8;
        cursor: not-allowed;
        background: #f8fafc;
      }

      .matricola-row {
        display: grid;
        grid-template-columns:
          minmax(90px, 0.6fr)
          minmax(120px, 1fr);
        gap: 7px;
      }

      .free-matricola {
        min-height: 46px;
        padding: 0 10px;
        border: 1px solid #bfdbfe;
        border-radius: 9px;
        background: #eff6ff;
        color: #1d4ed8;
        cursor: pointer;
        font-size: 9px;
        font-weight: 900;
      }

      .free-matricola:disabled {
        opacity: 0.5;
        cursor: wait;
      }

      .price-field-row {
        min-height: 46px;
        display: grid;
        grid-template-columns:
          auto
          minmax(0, 1fr);
        align-items: center;
        gap: 7px;
        padding-left: 11px;
        box-sizing: border-box;
        border: 1px solid #cbd5e1;
        border-radius: 9px;
        background: #ffffff;
      }

      .price-field-row > span {
        color: #2563eb;
        font-size: 14px;
        font-weight: 950;
      }

      .price-field-row input {
        min-height: 44px !important;
        border: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
      }

      .kit-note {
        min-height: 86px;
        padding: 11px 12px;
        resize: vertical;
        border-radius: 9px;
        font: inherit;
        font-size: 12px;
        line-height: 1.5;
      }

      .kit-summary {
        margin-top: 14px;
        padding: 16px 18px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 18px;
        border: 1px solid #bfdbfe;
        border-radius: 14px;
        background:
          linear-gradient(
            135deg,
            #eff6ff,
            #f8fbff
          );
      }

      .summary-main {
        min-width: 0;
      }

      .summary-main span,
      .summary-main strong,
      .summary-main small {
        display: block;
      }

      .summary-main span {
        color: #2563eb;
        font-size: 8px;
        font-weight: 950;
        letter-spacing: 1.4px;
      }

      .summary-main strong {
        margin-top: 4px;
        color: #0f172a;
        font-size: 18px;
      }

      .summary-main small {
        margin-top: 4px;
        color: #475569;
        font-size: 10px;
      }

      .save-kit {
        min-height: 48px;
        padding: 0 18px;
        flex: 0 0 auto;
        border: 1px solid #1d4ed8;
        border-radius: 10px;
        background: #2563eb;
        color: white;
        cursor: pointer;
        font-size: 12px;
        font-weight: 950;
        box-shadow:
          0 9px 20px
          rgba(37, 99, 235, 0.20);
      }

      .save-kit:hover {
        background: #1d4ed8;
      }

      .save-kit:disabled {
        opacity: 0.45;
        cursor: not-allowed;
        box-shadow: none;
      }

      @media (
        max-width: 1050px
      ) {
        .kit-grid.identification {
          grid-template-columns:
            1fr
            1fr;
        }

        .kit-grid.configuration {
          grid-template-columns:
            1fr
            1fr;
        }
      }

      @media (
        max-width: 720px
      ) {
        .kit-hero,
        .kit-summary {
          align-items: stretch;
          flex-direction: column;
        }

        .kit-hero-actions {
          justify-content: flex-start;
        }

        .kit-grid.identification,
        .kit-grid.configuration {
          grid-template-columns:
            1fr;
        }

        .kit-field-hint {
          min-height: 0;
        }

        .save-kit {
          width: 100%;
        }
      }
    `}</style>
  );
}
