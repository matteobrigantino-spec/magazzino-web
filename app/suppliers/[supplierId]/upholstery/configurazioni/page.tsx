"use client";

import {
  use,
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import { supabase } from "../../../../../lib/supabaseClient";

type OptionType =
  | "color"
  | "details_logos"
  | "stitching"
  | "quilting";

type UpholsteryOption = {
  id: string;
  supplier_id: string;
  option_type: OptionType;
  name: string;
  active: boolean;
  sort_order: number;
};

type GroupDefinition = {
  type: OptionType;
  title: string;
  subtitle: string;
  placeholder: string;
  example: string;
};

const GROUPS: GroupDefinition[] = [
  {
    type: "color",
    title: "Colori",
    subtitle:
      "Colore principale della tappezzeria.",
    placeholder:
      "Es. Nero, Beige, Rosso...",
    example:
      "Nero",
  },
  {
    type: "details_logos",
    title: "Dettagli e loghi",
    subtitle:
      "Colore o finitura di dettagli e loghi.",
    placeholder:
      "Es. Rosso, Nero, Bianco...",
    example:
      "Rosso",
  },
  {
    type: "stitching",
    title: "Cuciture",
    subtitle:
      "Colore o variante della cucitura.",
    placeholder:
      "Es. Rossa, Nera, Grigia...",
    example:
      "Rossa",
  },
  {
    type: "quilting",
    title: "Trapuntature",
    subtitle:
      "Disegno o lavorazione della trapuntatura.",
    placeholder:
      "Es. Rombo, Liscia, Esagono...",
    example:
      "Rombo",
  },
];

export default function UpholsterySupplierSettings({
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
  ] =
    useState(
      "Fornitore"
    );

  const [
    enabled,
    setEnabled,
  ] =
    useState(false);

  const [
    options,
    setOptions,
  ] =
    useState<
      UpholsteryOption[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    savingToggle,
    setSavingToggle,
  ] =
    useState(false);

  const [
    busyId,
    setBusyId,
  ] =
    useState("");

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

  const [
    newValues,
    setNewValues,
  ] =
    useState<
      Record<
        OptionType,
        string
      >
    >({
      color: "",
      details_logos: "",
      stitching: "",
      quilting: "",
    });

  const [
    editValues,
    setEditValues,
  ] =
    useState<
      Record<
        string,
        string
      >
    >({});

  useEffect(() => {
    loadData();
  }, [supplierId]);

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const {
      data: supplier,
      error: supplierError,
    } =
      await supabase
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
        .maybeSingle();

    if (
      supplierError ||
      !supplier
    ) {
      setErrorMessage(
        "Impossibile caricare il fornitore."
      );
      setLoading(false);
      return;
    }

    setSupplierName(
      String(
        supplier.name ||
          "Fornitore"
      )
    );

    setEnabled(
      supplier.upholstery_enabled ===
        true
    );

    const {
      data: optionData,
      error: optionsError,
    } =
      await supabase
        .from(
          "upholstery_options"
        )
        .select(
          "id,supplier_id,option_type,name,active,sort_order"
        )
        .eq(
          "supplier_id",
          supplierId
        )
        .order(
          "option_type"
        )
        .order(
          "sort_order",
          {
            ascending: true,
          }
        )
        .order(
          "name",
          {
            ascending: true,
          }
        );

    if (
      optionsError
    ) {
      setErrorMessage(
        "Errore caricamento opzioni: " +
          optionsError.message
      );
      setLoading(false);
      return;
    }

    const clean:
      UpholsteryOption[] =
      (
        optionData ||
        []
      ).map(
        (row) => ({
          id: String(
            row.id
          ),
          supplier_id:
            String(
              row.supplier_id
            ),
          option_type:
            row.option_type as OptionType,
          name:
            String(
              row.name ||
                ""
            ),
          active:
            row.active !==
            false,
          sort_order:
            Number(
              row.sort_order ||
                0
            ),
        })
      );

    setOptions(
      clean
    );

    setEditValues(
      Object.fromEntries(
        clean.map(
          (option) => [
            option.id,
            option.name,
          ]
        )
      )
    );

    setLoading(false);
  }

  const groupedOptions =
    useMemo(() => {
      const map:
        Record<
          OptionType,
          UpholsteryOption[]
        > = {
          color: [],
          details_logos: [],
          stitching: [],
          quilting: [],
        };

      options.forEach(
        (option) => {
          map[
            option.option_type
          ].push(
            option
          );
        }
      );

      return map;
    }, [options]);

  async function toggleModule() {
    if (savingToggle) {
      return;
    }

    const next =
      !enabled;

    setSavingToggle(
      true
    );
    clearMessages();

    const {
      error,
    } =
      await supabase
        .from(
          "suppliers"
        )
        .update({
          upholstery_enabled:
            next,
        })
        .eq(
          "id",
          supplierId
        );

    if (error) {
      setErrorMessage(
        "Errore aggiornamento: " +
          error.message
      );
      setSavingToggle(
        false
      );
      return;
    }

    setEnabled(
      next
    );

    setMessage(
      next
        ? "Gestione tappezzerie attivata."
        : "Gestione tappezzerie disattivata."
    );

    setSavingToggle(
      false
    );
  }

  async function addOption(
    type: OptionType
  ) {
    const name =
      newValues[
        type
      ].trim();

    if (!name) {
      setErrorMessage(
        "Inserisci un valore prima di aggiungerlo."
      );
      return;
    }

    setBusyId(
      `new-${type}`
    );
    clearMessages();

    const sortOrder =
      groupedOptions[
        type
      ].length;

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "upholstery_options"
        )
        .insert({
          supplier_id:
            supplierId,
          option_type:
            type,
          name,
          active: true,
          sort_order:
            sortOrder,
        })
        .select(
          "id,supplier_id,option_type,name,active,sort_order"
        )
        .single();

    if (error) {
      const duplicate =
        error.message
          .toLowerCase()
          .includes(
            "duplicate"
          ) ||
        error.message
          .toLowerCase()
          .includes(
            "unique"
          );

      setErrorMessage(
        duplicate
          ? "Questa opzione esiste già."
          : "Errore salvataggio: " +
              error.message
      );

      setBusyId("");
      return;
    }

    const clean:
      UpholsteryOption = {
      id: String(
        data.id
      ),
      supplier_id:
        String(
          data.supplier_id
        ),
      option_type:
        data.option_type as OptionType,
      name:
        String(
          data.name ||
            ""
        ),
      active:
        data.active !==
        false,
      sort_order:
        Number(
          data.sort_order ||
            0
        ),
    };

    setOptions(
      (current) => [
        ...current,
        clean,
      ]
    );

    setEditValues(
      (current) => ({
        ...current,
        [clean.id]:
          clean.name,
      })
    );

    setNewValues(
      (current) => ({
        ...current,
        [type]: "",
      })
    );

    setMessage(
      `"${clean.name}" aggiunto.`
    );

    setBusyId("");
  }

  async function saveOption(
    option:
      UpholsteryOption
  ) {
    const name =
      (
        editValues[
          option.id
        ] || ""
      ).trim();

    if (!name) {
      setErrorMessage(
        "Il nome non può essere vuoto."
      );
      return;
    }

    if (
      name ===
      option.name
    ) {
      return;
    }

    setBusyId(
      option.id
    );
    clearMessages();

    const {
      error,
    } =
      await supabase
        .from(
          "upholstery_options"
        )
        .update({
          name,
        })
        .eq(
          "id",
          option.id
        );

    if (error) {
      setErrorMessage(
        "Errore modifica: " +
          error.message
      );
      setBusyId("");
      return;
    }

    setOptions(
      (current) =>
        current.map(
          (row) =>
            row.id ===
            option.id
              ? {
                  ...row,
                  name,
                }
              : row
        )
    );

    setMessage(
      "Opzione aggiornata."
    );

    setBusyId("");
  }

  async function toggleOption(
    option:
      UpholsteryOption
  ) {
    setBusyId(
      option.id
    );
    clearMessages();

    const next =
      !option.active;

    const {
      error,
    } =
      await supabase
        .from(
          "upholstery_options"
        )
        .update({
          active:
            next,
        })
        .eq(
          "id",
          option.id
        );

    if (error) {
      setErrorMessage(
        "Errore aggiornamento: " +
          error.message
      );
      setBusyId("");
      return;
    }

    setOptions(
      (current) =>
        current.map(
          (row) =>
            row.id ===
            option.id
              ? {
                  ...row,
                  active:
                    next,
                }
              : row
        )
    );

    setMessage(
      next
        ? "Opzione riattivata."
        : "Opzione disattivata."
    );

    setBusyId("");
  }

  async function deleteOption(
    option:
      UpholsteryOption
  ) {
    const confirmed =
      window.confirm(
        `Eliminare "${option.name}"?\n\n` +
          "I kit già registrati manterranno il testo salvato."
      );

    if (
      !confirmed
    ) {
      return;
    }

    setBusyId(
      option.id
    );
    clearMessages();

    const {
      error,
    } =
      await supabase
        .from(
          "upholstery_options"
        )
        .delete()
        .eq(
          "id",
          option.id
        );

    if (error) {
      setErrorMessage(
        "Errore eliminazione: " +
          error.message
      );
      setBusyId("");
      return;
    }

    setOptions(
      (current) =>
        current.filter(
          (row) =>
            row.id !==
            option.id
        )
    );

    setEditValues(
      (current) => {
        const next = {
          ...current,
        };

        delete next[
          option.id
        ];

        return next;
      }
    );

    setMessage(
      `"${option.name}" eliminato.`
    );

    setBusyId("");
  }

  function clearMessages() {
    setMessage("");
    setErrorMessage("");
  }

  if (loading) {
    return (
      <div className="upholstery-loading">
        <div className="upholstery-spinner" />

        <strong>
          Configurazione tappezzerie
        </strong>

        <span>
          Caricamento...
        </span>

        <Styles />
      </div>
    );
  }

  return (
    <div className="upholstery-page">
      <section className="upholstery-hero">
        <div>
          <div className="upholstery-eyebrow">
            CONFIGURAZIONI TAPPEZZERIE
          </div>

          <h1>
            Scelte disponibili
          </h1>

          <p>
            Inserisci qui una sola volta le opzioni di{" "}
            <strong>
              {supplierName}
            </strong>
            . Nei nuovi kit le troverai direttamente
            nei menu a tendina.
          </p>
        </div>

        <div className="upholstery-hero-actions">
          <Link
            href={`/suppliers/${supplierId}/upholstery`}
            className="upholstery-back"
          >
            ← Kit in giacenza
          </Link>

          <button
            type="button"
            className={
              enabled
                ? "module-toggle active"
                : "module-toggle"
            }
            onClick={
              toggleModule
            }
            disabled={
              savingToggle
            }
          >
            <span className="toggle-track">
              <span className="toggle-knob" />
            </span>

            <span>
              <strong>
                {enabled
                  ? "Gestione attiva"
                  : "Gestione disattiva"}
              </strong>

              <small>
                {enabled
                  ? "Matricola Kit e configurazioni abilitate"
                  : "Attivala per questo fornitore"}
              </small>
            </span>
          </button>
        </div>
      </section>

      {(message ||
        errorMessage) && (
        <div
          className={
            errorMessage
              ? "upholstery-message error"
              : "upholstery-message success"
          }
        >
          {errorMessage ||
            message}
        </div>
      )}

      <section className="upholstery-info">
        <div className="info-number">
          1–10000
        </div>

        <div>
          <strong>
            Matricola Kit
          </strong>

          <p>
            Ogni singolo kit avrà una matricola
            univoca, anche quando codice articolo,
            colore e lavorazioni sono identici.
          </p>
        </div>

        <div className="example-kit">
          <span>
            ESEMPIO
          </span>

          <strong>
            TAP-500 · #25
          </strong>

          <small>
            Nero · Dettagli Rossi · Cucitura Rossa · Rombo
          </small>
        </div>
      </section>

      <div className="upholstery-grid">
        {GROUPS.map(
          (group) => {
            const rows =
              groupedOptions[
                group.type
              ];

            return (
              <section
                key={
                  group.type
                }
                className="option-card"
              >
                <div className="option-card-head">
                  <div>
                    <div className="option-card-kicker">
                      CONFIGURAZIONE
                    </div>

                    <h2>
                      {
                        group.title
                      }
                    </h2>

                    <p>
                      {
                        group.subtitle
                      }
                    </p>
                  </div>

                  <div className="option-count">
                    {
                      rows.filter(
                        (row) =>
                          row.active
                      ).length
                    }{" "}
                    attive
                  </div>
                </div>

                <div className="new-option-row">
                  <input
                    value={
                      newValues[
                        group.type
                      ]
                    }
                    onChange={(
                      event
                    ) =>
                      setNewValues(
                        (
                          current
                        ) => ({
                          ...current,
                          [group.type]:
                            event
                              .target
                              .value,
                        })
                      )
                    }
                    onKeyDown={(
                      event
                    ) => {
                      if (
                        event.key ===
                        "Enter"
                      ) {
                        event.preventDefault();
                        addOption(
                          group.type
                        );
                      }
                    }}
                    placeholder={
                      group.placeholder
                    }
                    autoComplete="off"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      addOption(
                        group.type
                      )
                    }
                    disabled={
                      busyId ===
                      `new-${group.type}`
                    }
                  >
                    +
                    <span>
                      Aggiungi
                    </span>
                  </button>
                </div>

                <div className="option-list">
                  {rows.length ===
                  0 ? (
                    <div className="empty-options">
                      <div className="empty-dot" />

                      <div>
                        <strong>
                          Nessuna opzione
                        </strong>

                        <span>
                          Per iniziare puoi aggiungere, ad esempio,{" "}
                          <b>
                            {
                              group.example
                            }
                          </b>
                          .
                        </span>
                      </div>
                    </div>
                  ) : (
                    rows.map(
                      (
                        option
                      ) => {
                        const changed =
                          (
                            editValues[
                              option.id
                            ] ||
                            ""
                          ).trim() !==
                          option.name;

                        const busy =
                          busyId ===
                          option.id;

                        return (
                          <div
                            key={
                              option.id
                            }
                            className={
                              option.active
                                ? "option-row"
                                : "option-row disabled"
                            }
                          >
                            <span
                              className={
                                option.active
                                  ? "option-state"
                                  : "option-state off"
                              }
                              title={
                                option.active
                                  ? "Attiva"
                                  : "Disattivata"
                              }
                            />

                            <input
                              value={
                                editValues[
                                  option.id
                                ] ??
                                option.name
                              }
                              onChange={(
                                event
                              ) =>
                                setEditValues(
                                  (
                                    current
                                  ) => ({
                                    ...current,
                                    [option.id]:
                                      event
                                        .target
                                        .value,
                                  })
                                )
                              }
                              disabled={
                                busy
                              }
                            />

                            {changed && (
                              <button
                                type="button"
                                className="save-option"
                                onClick={() =>
                                  saveOption(
                                    option
                                  )
                                }
                                disabled={
                                  busy
                                }
                              >
                                Salva
                              </button>
                            )}

                            <button
                              type="button"
                              className="toggle-option"
                              onClick={() =>
                                toggleOption(
                                  option
                                )
                              }
                              disabled={
                                busy
                              }
                            >
                              {option.active
                                ? "Disattiva"
                                : "Attiva"}
                            </button>

                            <button
                              type="button"
                              className="delete-option"
                              onClick={() =>
                                deleteOption(
                                  option
                                )
                              }
                              disabled={
                                busy
                              }
                              title="Elimina"
                            >
                              ×
                            </button>
                          </div>
                        );
                      }
                    )
                  )}
                </div>
              </section>
            );
          }
        )}
      </div>

      <Styles />
    </div>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      .upholstery-page {
        width: 100%;
        max-width: 1500px;
        margin: 0 auto;
        color: #eaf2ff !important;
      }

      .upholstery-loading {
        min-height: 55vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: #eaf2ff !important;
      }

      .upholstery-loading span {
        font-size: 12px;
        opacity: 0.55;
      }

      .upholstery-spinner {
        width: 32px;
        height: 32px;
        margin-bottom: 6px;
        border: 3px solid rgba(96, 165, 250, 0.15);
        border-top-color: #60a5fa;
        border-radius: 999px;
        animation: upholstery-spin 0.8s linear infinite;
      }

      @keyframes upholstery-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .upholstery-hero {
        position: relative;
        overflow: hidden;
        padding: 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 24px;
        border: 1px solid rgba(96, 165, 250, 0.18);
        border-radius: 18px;
        background:
          radial-gradient(
            circle at 80% 0%,
            rgba(37, 99, 235, 0.20),
            transparent 34%
          ),
          linear-gradient(
            135deg,
            rgba(12, 27, 44, 0.98),
            rgba(5, 14, 25, 0.98)
          );
        box-shadow:
          0 18px 60px rgba(0, 0, 0, 0.20);
      }

      .upholstery-eyebrow {
        margin-bottom: 7px;
        color: #75b5ff !important;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: 1.6px;
      }

      .upholstery-hero h1,
      .upholstery-next h2 {
        margin: 0;
        color: #ffffff !important;
        letter-spacing: -0.8px;
      }

      .upholstery-hero h1 {
        font-size: clamp(28px, 4vw, 42px);
        font-weight: 950;
      }

      .upholstery-hero p {
        max-width: 680px;
        margin: 10px 0 0;
        color: #d3deed !important;
        font-size: 13px;
        line-height: 1.65;
      }

      .upholstery-hero p strong {
        color: #f4f8ff;
      }

      .upholstery-hero-actions {
        min-width: 270px;
        display: flex;
        flex-direction: column;
        gap: 9px;
      }

      .upholstery-back {
        min-height: 40px;
        padding: 0 13px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(120, 157, 199, 0.18);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.025);
        color: #a9b7c9;
        text-decoration: none;
        font-size: 11px;
        font-weight: 800;
      }

      .module-toggle {
        min-height: 58px;
        padding: 9px 12px;
        display: flex;
        align-items: center;
        gap: 11px;
        border: 1px solid rgba(120, 157, 199, 0.18);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.025);
        color: #92a3b9;
        cursor: pointer;
        text-align: left;
      }

      .module-toggle.active {
        border-color: rgba(37, 211, 102, 0.30);
        background: rgba(37, 211, 102, 0.07);
        color: #f4f8ff;
      }

      .module-toggle:disabled {
        opacity: 0.55;
        cursor: wait;
      }

      .toggle-track {
        width: 42px;
        height: 24px;
        flex: 0 0 auto;
        padding: 3px;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        border-radius: 999px;
        background: #243246;
        transition: 0.15s ease;
      }

      .module-toggle.active .toggle-track {
        justify-content: flex-end;
        background: #1ea85b;
      }

      .toggle-knob {
        width: 18px;
        height: 18px;
        display: block;
        border-radius: 999px;
        background: white;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
      }

      .module-toggle strong,
      .module-toggle small {
        display: block;
      }

      .module-toggle strong {
        font-size: 11px;
      }

      .module-toggle small {
        margin-top: 3px;
        color: #70839d;
        font-size: 8px;
      }

      .module-toggle.active small {
        color: #62c990;
      }

      .upholstery-message {
        margin-top: 14px;
        padding: 12px 14px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 750;
      }

      .upholstery-message.success {
        border: 1px solid rgba(34, 197, 94, 0.28);
        background: rgba(34, 197, 94, 0.08);
        color: #70df9e;
      }

      .upholstery-message.error {
        border: 1px solid rgba(239, 68, 68, 0.30);
        background: rgba(239, 68, 68, 0.08);
        color: #ff8b8b;
      }

      .upholstery-info {
        margin-top: 14px;
        padding: 15px 18px;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 16px;
        border: 1px solid rgba(120, 157, 199, 0.15);
        border-radius: 14px;
        background: rgba(8, 20, 33, 0.72);
      }

      .info-number {
        padding: 9px 12px;
        border: 1px solid rgba(59, 130, 246, 0.34);
        border-radius: 9px;
        background: rgba(59, 130, 246, 0.10);
        color: #60a5fa;
        font-size: 14px;
        font-weight: 950;
      }

      .upholstery-info strong {
        color: #ffffff !important;
        font-size: 13px;
      }

      .upholstery-info p {
        margin: 4px 0 0;
        color: #c7d5e8 !important;
        font-size: 11px;
        line-height: 1.55;
      }

      .example-kit {
        min-width: 250px;
        padding: 10px 12px;
        border: 1px solid rgba(120, 157, 199, 0.14);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.025);
      }

      .example-kit span,
      .example-kit strong,
      .example-kit small {
        display: block;
      }

      .example-kit span {
        color: #57708f;
        font-size: 7px;
        font-weight: 950;
        letter-spacing: 1.4px;
      }

      .example-kit strong {
        margin-top: 3px;
        color: #ffffff !important;
        font-size: 12px;
      }

      .example-kit small {
        margin-top: 3px;
        color: #b9c8dc !important;
        font-size: 9px;
      }

      .upholstery-grid {
        margin-top: 14px;
        display: grid;
        grid-template-columns:
          repeat(
            2,
            minmax(0, 1fr)
          );
        gap: 14px;
      }

      .option-card {
        min-width: 0;
        padding: 17px;
        border: 1px solid rgba(120, 157, 199, 0.15);
        border-radius: 15px;
        background:
          linear-gradient(
            180deg,
            rgba(9, 21, 34, 0.90),
            rgba(6, 16, 27, 0.92)
          );
      }

      .option-card-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }

      .option-card-kicker {
        margin-bottom: 4px;
        color: #526b8a;
        font-size: 7px;
        font-weight: 950;
        letter-spacing: 1.3px;
      }

      .option-card h2 {
        margin: 0;
        color: #ffffff !important;
        font-size: 18px;
        letter-spacing: -0.25px;
      }

      .option-card p {
        margin: 5px 0 0;
        color: #b8c7da !important;
        font-size: 10px;
        line-height: 1.5;
      }

      .option-count {
        flex: 0 0 auto;
        padding: 5px 8px;
        border: 1px solid rgba(96, 165, 250, 0.18);
        border-radius: 999px;
        background: rgba(59, 130, 246, 0.07);
        color: #7db5ff;
        font-size: 8px;
        font-weight: 850;
      }

      .new-option-row {
        margin-top: 14px;
        display: grid;
        grid-template-columns:
          minmax(0, 1fr)
          auto;
        gap: 8px;
      }

      .new-option-row input,
      .option-row input {
        min-width: 0;
        outline: none;
        color: #f4f8ff;
        border: 1px solid rgba(120, 157, 199, 0.18);
        background: #071523;
      }

      .new-option-row input {
        min-height: 40px;
        padding: 0 11px;
        border-radius: 9px;
        font-size: 11px;
      }

      .new-option-row input:focus,
      .option-row input:focus {
        border-color: rgba(96, 165, 250, 0.55);
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.08);
      }

      .new-option-row button {
        min-height: 40px;
        padding: 0 13px;
        display: flex;
        align-items: center;
        gap: 5px;
        border: 1px solid rgba(59, 130, 246, 0.42);
        border-radius: 9px;
        background: rgba(37, 99, 235, 0.16);
        color: #7db5ff;
        cursor: pointer;
        font-size: 14px;
        font-weight: 950;
      }

      .new-option-row button span {
        font-size: 9px;
      }

      .option-list {
        margin-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .empty-options {
        min-height: 72px;
        padding: 12px;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 10px;
        border: 1px dashed rgba(120, 157, 199, 0.28);
        border-radius: 10px;
        color: #b8c7da !important;
      }

      .empty-dot {
        width: 8px;
        height: 8px;
        flex: 0 0 auto;
        border-radius: 999px;
        background: #33465f;
      }

      .empty-options strong,
      .empty-options span {
        display: block;
      }

      .empty-options strong {
        color: #f4f8ff !important;
        font-size: 11px;
      }

      .empty-options span {
        margin-top: 3px;
        font-size: 8px;
      }

      .option-row {
        min-height: 42px;
        padding: 5px 6px 5px 10px;
        display: grid;
        grid-template-columns:
          auto
          minmax(0, 1fr)
          auto
          auto
          auto;
        align-items: center;
        gap: 7px;
        border: 1px solid rgba(120, 157, 199, 0.13);
        border-radius: 9px;
        background: rgba(255, 255, 255, 0.018);
      }

      .option-row.disabled {
        opacity: 0.50;
      }

      .option-state {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: #25d366;
        box-shadow:
          0 0 0 4px rgba(37, 211, 102, 0.07);
      }

      .option-state.off {
        background: #63738a;
        box-shadow: none;
      }

      .option-row input {
        width: 100%;
        min-height: 30px;
        padding: 0 8px;
        border-radius: 7px;
        font-size: 10px;
      }

      .option-row button {
        min-height: 30px;
        padding: 0 8px;
        border-radius: 7px;
        cursor: pointer;
        font-size: 8px;
        font-weight: 850;
      }

      .save-option {
        border: 1px solid rgba(59, 130, 246, 0.32);
        background: rgba(59, 130, 246, 0.09);
        color: #75afff;
      }

      .toggle-option {
        border: 1px solid rgba(120, 157, 199, 0.16);
        background: rgba(255, 255, 255, 0.025);
        color: #899bb2;
      }

      .delete-option {
        width: 30px;
        padding: 0 !important;
        border: 1px solid rgba(239, 68, 68, 0.18);
        background: rgba(239, 68, 68, 0.05);
        color: #d97474;
        font-size: 14px !important;
      }

      .option-row button:disabled,
      .new-option-row button:disabled {
        opacity: 0.5;
        cursor: wait;
      }

      .upholstery-next {
        margin-top: 14px;
        padding: 18px;
        display: grid;
        grid-template-columns:
          minmax(0, 1.1fr)
          minmax(320px, 0.9fr);
        gap: 20px;
        align-items: center;
        border: 1px solid rgba(96, 165, 250, 0.18);
        border-radius: 15px;
        background:
          linear-gradient(
            135deg,
            rgba(12, 27, 44, 0.82),
            rgba(5, 14, 25, 0.88)
          );
      }

      .upholstery-next h2 {
        font-size: 17px;
      }

      .upholstery-next p {
        max-width: 690px;
        margin: 7px 0 0;
        color: #bdcce0 !important;
        font-size: 10px;
        line-height: 1.6;
      }

      .next-fields {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 6px;
      }

      .next-fields span {
        padding: 6px 8px;
        border: 1px solid rgba(120, 157, 199, 0.15);
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.025);
        color: #7f91aa;
        font-size: 8px;
        font-weight: 800;
      }

      .next-fields span.blue {
        border-color: rgba(59, 130, 246, 0.32);
        background: rgba(59, 130, 246, 0.08);
        color: #6facff;
      }

      .upholstery-page h1,
      .upholstery-page h2,
      .upholstery-page h3,
      .upholstery-page strong,
      .upholstery-page label {
        color: #f7fbff;
      }

      .upholstery-page input::placeholder {
        color: #8fa4bf;
        opacity: 1;
      }

      .upholstery-page button,
      .upholstery-page a {
        -webkit-font-smoothing: antialiased;
      }

      @media (max-width: 900px) {
        .upholstery-hero {
          align-items: stretch;
          flex-direction: column;
        }

        .upholstery-hero-actions {
          min-width: 0;
        }

        .upholstery-info {
          grid-template-columns: auto 1fr;
        }

        .example-kit {
          grid-column: 1 / -1;
          min-width: 0;
        }

        .upholstery-grid {
          grid-template-columns: 1fr;
        }

        .upholstery-next {
          grid-template-columns: 1fr;
        }

        .next-fields {
          justify-content: flex-start;
        }
      }

      @media (max-width: 580px) {
        .upholstery-hero {
          padding: 17px;
        }

        .upholstery-info {
          grid-template-columns: 1fr;
        }

        .info-number {
          width: fit-content;
        }

        .option-card {
          padding: 13px;
        }

        .option-row {
          grid-template-columns:
            auto
            minmax(0, 1fr)
            auto;
        }

        .option-row .save-option {
          grid-column: 2;
        }

        .option-row .toggle-option {
          grid-column: 2;
        }

        .delete-option {
          grid-column: 3;
          grid-row: 1;
        }
      }
    `}</style>
  );
}
