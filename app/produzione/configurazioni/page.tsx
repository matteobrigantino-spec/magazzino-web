"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

type OptionType = "model" | "color";

type ProductionOption = {
  id: string;
  option_type: OptionType;
  name: string;
  active: boolean;
  sort_order: number;
};

const groups: Array<{
  type: OptionType;
  title: string;
  description: string;
  placeholder: string;
}> = [
  {
    type: "model",
    title: "Modelli battello",
    description: "Modelli disponibili nel menu a tendina del nuovo ordine di produzione.",
    placeholder: "Es. Selva 600",
  },
  {
    type: "color",
    title: "Colori",
    description: "Stesso archivio colori usato per Carena, Ragno/Longheroni e Coperta.",
    placeholder: "Es. Bianca",
  },
];

export default function ProductionConfigurationsPage() {
  const [options, setOptions] = useState<ProductionOption[]>([]);
  const [drafts, setDrafts] = useState<Record<OptionType, string>>({
    model: "",
    color: "",
  });
  const [savingId, setSavingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [pdfLogo, setPdfLogo] = useState("");
  const [logoLoading, setLogoLoading] = useState(true);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMessage, setLogoMessage] = useState("");
  const [logoError, setLogoError] = useState("");

  useEffect(() => {
    loadData();
    loadLogo();
  }, []);

  async function loadLogo() {
    setLogoLoading(true);

    const { data, error } = await supabase
      .from("production_settings")
      .select("pdf_logo")
      .eq("id", 1)
      .maybeSingle();

    if (!error && data) {
      setPdfLogo(data.pdf_logo || "");
    }

    setLogoLoading(false);
  }

  async function uploadLogo(file?: File) {
    if (!file) return;

    setLogoError("");
    setLogoMessage("");

    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setLogoError("Scegli un logo PNG, JPG o WebP di massimo 5 MB.");
      return;
    }

    setLogoBusy(true);
    const url = URL.createObjectURL(file);

    try {
      const image = new Image();
      image.src = url;
      await image.decode();

      const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

      const context = canvas.getContext("2d");
      if (!context) throw new Error("Impossibile leggere il logo.");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const data = canvas.toDataURL("image/png");

      const { error } = await supabase
        .from("production_settings")
        .upsert({ id: 1, pdf_logo: data });

      if (error) throw error;

      setPdfLogo(data);
      setLogoMessage("Logo salvato: da ora è disponibile su tutti i dispositivi per il PDF di produzione.");
    } catch (error) {
      setLogoError(
        error instanceof Error
          ? error.message
          : "Impossibile salvare il logo. Prova un altro file PNG o JPG."
      );
    } finally {
      URL.revokeObjectURL(url);
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    const confirmed = window.confirm("Rimuovere il logo aziendale dal PDF di produzione?");
    if (!confirmed) return;

    setLogoBusy(true);
    setLogoError("");
    setLogoMessage("");

    const { error } = await supabase
      .from("production_settings")
      .upsert({ id: 1, pdf_logo: null });

    if (error) {
      setLogoError("Errore rimozione logo: " + error.message);
      setLogoBusy(false);
      return;
    }

    setPdfLogo("");
    setLogoMessage("Logo rimosso.");
    setLogoBusy(false);
  }

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("production_options")
      .select("id,option_type,name,active,sort_order")
      .order("option_type", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      setErrorMessage("Errore caricamento configurazioni: " + error.message);
      setLoading(false);
      return;
    }

    setOptions(
      (data || []).map((row: any) => ({
        id: String(row.id),
        option_type: String(row.option_type) as OptionType,
        name: String(row.name || ""),
        active: row.active !== false,
        sort_order: Number(row.sort_order || 0),
      }))
    );

    setLoading(false);
  }

  const grouped = useMemo(() => {
    return {
      model: options.filter((option) => option.option_type === "model"),
      color: options.filter((option) => option.option_type === "color"),
    };
  }, [options]);

  async function addOption(type: OptionType) {
    const name = drafts[type].trim();

    if (!name) {
      setErrorMessage("Inserisci un valore prima di aggiungerlo.");
      return;
    }

    setMessage("");
    setErrorMessage("");

    const current = grouped[type];
    const nextSort =
      current.length === 0
        ? 10
        : Math.max(...current.map((item) => item.sort_order)) + 10;

    const { error } = await supabase.from("production_options").insert({
      option_type: type,
      name,
      active: true,
      sort_order: nextSort,
    });

    if (error) {
      if (error.message.toLowerCase().includes("unique")) {
        setErrorMessage("Questa voce esiste già.");
      } else {
        setErrorMessage("Errore salvataggio: " + error.message);
      }
      return;
    }

    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [type]: "",
    }));

    setMessage("Configurazione aggiunta.");
    await loadData();
  }

  async function toggleOption(option: ProductionOption) {
    setSavingId(option.id);
    setMessage("");
    setErrorMessage("");

    const { error } = await supabase
      .from("production_options")
      .update({ active: !option.active })
      .eq("id", option.id);

    if (error) {
      setErrorMessage("Errore aggiornamento: " + error.message);
      setSavingId("");
      return;
    }

    setSavingId("");
    await loadData();
  }

  async function renameOption(option: ProductionOption) {
    const nextName = window.prompt(
      "Nuovo nome:",
      option.name
    );

    if (nextName === null) return;

    const clean = nextName.trim();

    if (!clean || clean === option.name) return;

    setSavingId(option.id);
    setMessage("");
    setErrorMessage("");

    const { error } = await supabase
      .from("production_options")
      .update({ name: clean })
      .eq("id", option.id);

    if (error) {
      setErrorMessage("Errore modifica: " + error.message);
      setSavingId("");
      return;
    }

    setMessage("Voce modificata.");
    setSavingId("");
    await loadData();
  }

  async function deleteOption(option: ProductionOption) {
    const confirmed = window.confirm(
      `Eliminare "${option.name}" dalle configurazioni?\n\n` +
      "I battelli già registrati manterranno comunque il valore salvato."
    );

    if (!confirmed) return;

    setSavingId(option.id);
    setMessage("");
    setErrorMessage("");

    const { error } = await supabase
      .from("production_options")
      .delete()
      .eq("id", option.id);

    if (error) {
      setErrorMessage("Errore eliminazione: " + error.message);
      setSavingId("");
      return;
    }

    setMessage("Voce eliminata.");
    setSavingId("");
    await loadData();
  }

  return (
    <div className="pcfg-page">
      <section className="pcfg-hero">
        <div>
          <div className="pcfg-eyebrow">CONFIGURAZIONI PRODUZIONE</div>
          <h1>Modelli e colori</h1>
          <p>
            Inseriscili una sola volta. Nel nuovo battello compariranno
            automaticamente nei menu a tendina.
          </p>
        </div>

        <Link href="/produzione" className="pcfg-back">
          ← Produzione
        </Link>
      </section>

      {(message || errorMessage) && (
        <div className={errorMessage ? "pcfg-message error" : "pcfg-message success"}>
          {errorMessage || message}
        </div>
      )}

      <section className="pcfg-grid">
        {groups.map((group) => (
          <div className="pcfg-card" key={group.type}>
            <div className="pcfg-card-head">
              <div>
                <div className="pcfg-eyebrow">CONFIGURAZIONE</div>
                <h2>{group.title}</h2>
                <p>{group.description}</p>
              </div>

              <span>
                {grouped[group.type].filter((item) => item.active).length} attive
              </span>
            </div>

            <div className="pcfg-add">
              <input
                value={drafts[group.type]}
                placeholder={group.placeholder}
                onChange={(e) =>
                  setDrafts((current) => ({
                    ...current,
                    [group.type]: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOption(group.type);
                  }
                }}
              />

              <button type="button" onClick={() => addOption(group.type)}>
                + Aggiungi
              </button>
            </div>

            <div className="pcfg-list">
              {loading ? (
                <div className="pcfg-empty">Caricamento...</div>
              ) : grouped[group.type].length === 0 ? (
                <div className="pcfg-empty">
                  Nessuna voce. Aggiungi la prima configurazione.
                </div>
              ) : (
                grouped[group.type].map((option) => (
                  <div
                    className={`pcfg-row ${option.active ? "active" : "inactive"}`}
                    key={option.id}
                  >
                    <span className="pcfg-dot" />

                    <strong>{option.name}</strong>

                    <div className="pcfg-row-actions">
                      <button
                        type="button"
                        onClick={() => renameOption(option)}
                        disabled={savingId === option.id}
                      >
                        Modifica
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleOption(option)}
                        disabled={savingId === option.id}
                      >
                        {option.active ? "Disattiva" : "Riattiva"}
                      </button>

                      <button
                        type="button"
                        className="danger"
                        onClick={() => deleteOption(option)}
                        disabled={savingId === option.id}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="pcfg-card pcfg-logo-card">
        <div className="pcfg-card-head">
          <div>
            <div className="pcfg-eyebrow">CONFIGURAZIONE</div>
            <h2>Logo aziendale per il PDF</h2>
            <p>
              Caricalo una sola volta qui: da questo momento il PDF di
              produzione lo userà in automatico su qualunque
              dispositivo o browser, senza doverlo ricaricare ogni volta.
            </p>
          </div>

          <span>{pdfLogo ? "Configurato" : "Non configurato"}</span>
        </div>

        <div className="pcfg-logo-row">
          <div className="pcfg-logo-preview">
            {logoLoading ? (
              <span className="pcfg-logo-placeholder">Caricamento...</span>
            ) : pdfLogo ? (
              <img src={pdfLogo} alt="Logo aziendale per il PDF" />
            ) : (
              <span className="pcfg-logo-placeholder">Nessun logo</span>
            )}
          </div>

          <div className="pcfg-logo-actions">
            <label className="pcfg-logo-upload">
              {pdfLogo ? "Cambia logo" : "Carica logo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={logoBusy || logoLoading}
                onChange={(e) => {
                  void uploadLogo(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>

            {pdfLogo && (
              <button
                type="button"
                className="danger"
                disabled={logoBusy}
                onClick={removeLogo}
              >
                Rimuovi logo
              </button>
            )}
          </div>
        </div>

        {logoMessage && <div className="pcfg-message success">{logoMessage}</div>}
        {logoError && <div className="pcfg-message error">{logoError}</div>}
      </section>

      <section className="pcfg-info">
        <strong>Come vengono usati</strong>
        <span>
          Modello battello usa l&apos;elenco “Modelli battello”.
          Carena, Ragno/Longheroni e Coperta usano tutti lo stesso elenco “Colori”.
          Accessori e Note restano campi liberi.
        </span>
      </section>

      <Styles />
    </div>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      .pcfg-page {
        width: 100%;
        max-width: 1250px;
        margin: 0 auto;
        color: #f8fafc;
      }

      .pcfg-hero {
        padding: 21px 22px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        border: 1px solid rgba(59,130,246,.24);
        border-radius: 16px;
        background: linear-gradient(135deg,#0d1d31,#071321);
      }

      .pcfg-eyebrow {
        color: #60a5fa;
        font-size: 9px;
        font-weight: 950;
        letter-spacing: 1.45px;
      }

      .pcfg-hero h1 {
        margin: 5px 0 0;
        font-size: 30px;
        font-weight: 950;
      }

      .pcfg-hero p {
        max-width: 720px;
        margin: 6px 0 0;
        color: #91a4bc;
        font-size: 10px;
        line-height: 1.55;
      }

      .pcfg-back {
        min-height: 38px;
        padding: 0 12px;
        display: inline-flex;
        align-items: center;
        border: 1px solid rgba(148,163,184,.22);
        border-radius: 8px;
        background: rgba(255,255,255,.035);
        color: #e2e8f0;
        text-decoration: none;
        font-size: 9px;
        font-weight: 900;
        white-space: nowrap;
      }

      .pcfg-message {
        margin-top: 11px;
        padding: 11px 13px;
        border-radius: 9px;
        font-size: 10px;
        font-weight: 800;
      }

      .pcfg-message.success {
        border: 1px solid rgba(34,197,94,.28);
        background: rgba(34,197,94,.08);
        color: #86efac;
      }

      .pcfg-message.error {
        border: 1px solid rgba(239,68,68,.28);
        background: rgba(239,68,68,.08);
        color: #fca5a5;
      }

      .pcfg-grid {
        margin-top: 11px;
        display: grid;
        grid-template-columns: repeat(2,minmax(0,1fr));
        gap: 11px;
      }

      .pcfg-logo-card {
        margin-top: 11px;
      }

      .pcfg-logo-row {
        margin-top: 13px;
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
      }

      .pcfg-logo-preview {
        width: 140px;
        height: 60px;
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px dashed rgba(148,163,184,.28);
        border-radius: 9px;
        background: #fff;
        overflow: hidden;
      }

      .pcfg-logo-preview img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }

      .pcfg-logo-placeholder {
        color: #64748b;
        font-size: 8px;
        font-weight: 800;
        text-align: center;
        padding: 0 8px;
      }

      .pcfg-logo-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .pcfg-logo-upload {
        min-height: 38px;
        padding: 0 14px;
        display: inline-flex;
        align-items: center;
        border: 1px solid #2563eb;
        border-radius: 8px;
        background: rgba(37,99,235,.18);
        color: #93c5fd;
        cursor: pointer;
        font-size: 9px;
        font-weight: 950;
        position: relative;
      }

      .pcfg-logo-upload input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }

      .pcfg-logo-actions button.danger {
        min-height: 38px;
        padding: 0 12px;
        border: 1px solid rgba(239,68,68,.28);
        border-radius: 8px;
        background: rgba(239,68,68,.08);
        color: #fca5a5;
        cursor: pointer;
        font-size: 9px;
        font-weight: 900;
      }

      .pcfg-logo-actions button.danger:disabled {
        opacity: .5;
        cursor: wait;
      }

      .pcfg-card {
        padding: 16px;
        border: 1px solid rgba(148,163,184,.15);
        border-radius: 13px;
        background: #0b1828;
      }

      .pcfg-card-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .pcfg-card-head h2 {
        margin: 4px 0 0;
        font-size: 18px;
        font-weight: 950;
      }

      .pcfg-card-head p {
        margin: 5px 0 0;
        color: #8398b1;
        font-size: 9px;
        line-height: 1.5;
      }

      .pcfg-card-head > span {
        padding: 5px 8px;
        border: 1px solid rgba(96,165,250,.23);
        border-radius: 999px;
        background: rgba(59,130,246,.07);
        color: #93c5fd;
        font-size: 8px;
        font-weight: 950;
        white-space: nowrap;
      }

      .pcfg-add {
        margin-top: 13px;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 7px;
      }

      .pcfg-add input {
        min-height: 38px;
        padding: 0 10px;
        box-sizing: border-box;
        border: 1px solid rgba(148,163,184,.20);
        border-radius: 8px;
        outline: none;
        background: #081524;
        color: #fff;
        font-size: 10px;
      }

      .pcfg-add input:focus {
        border-color: rgba(96,165,250,.55);
      }

      .pcfg-add button {
        min-height: 38px;
        padding: 0 12px;
        border: 1px solid #2563eb;
        border-radius: 8px;
        background: rgba(37,99,235,.18);
        color: #93c5fd;
        cursor: pointer;
        font-size: 9px;
        font-weight: 950;
      }

      .pcfg-list {
        margin-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .pcfg-row {
        min-height: 42px;
        padding: 7px 8px;
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(148,163,184,.12);
        border-radius: 8px;
        background: rgba(255,255,255,.018);
      }

      .pcfg-row.inactive {
        opacity: .48;
      }

      .pcfg-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #22c55e;
        box-shadow: 0 0 0 4px rgba(34,197,94,.07);
      }

      .pcfg-row.inactive .pcfg-dot {
        background: #64748b;
        box-shadow: none;
      }

      .pcfg-row strong {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 10px;
      }

      .pcfg-row-actions {
        display: flex;
        align-items: center;
        gap: 5px;
      }

      .pcfg-row-actions button {
        min-height: 29px;
        padding: 0 8px;
        border: 1px solid rgba(148,163,184,.18);
        border-radius: 6px;
        background: rgba(255,255,255,.025);
        color: #a9bdd4;
        cursor: pointer;
        font-size: 7px;
        font-weight: 900;
      }

      .pcfg-row-actions button.danger {
        min-width: 29px;
        color: #f87171;
        border-color: rgba(239,68,68,.23);
        background: rgba(239,68,68,.06);
        font-size: 14px;
      }

      .pcfg-row-actions button:disabled {
        opacity: .45;
        cursor: wait;
      }

      .pcfg-empty {
        padding: 25px 12px;
        color: #7388a3;
        text-align: center;
        font-size: 9px;
      }

      .pcfg-info {
        margin-top: 11px;
        padding: 13px 15px;
        display: flex;
        align-items: flex-start;
        gap: 14px;
        border: 1px solid rgba(96,165,250,.14);
        border-radius: 11px;
        background: rgba(59,130,246,.035);
      }

      .pcfg-info strong {
        flex: 0 0 auto;
        color: #93c5fd;
        font-size: 9px;
      }

      .pcfg-info span {
        color: #8fa4bc;
        font-size: 9px;
        line-height: 1.55;
      }

      @media(max-width: 800px) {
        .pcfg-hero {
          align-items: stretch;
          flex-direction: column;
        }

        .pcfg-grid {
          grid-template-columns: 1fr;
        }

        .pcfg-row {
          grid-template-columns: auto 1fr;
        }

        .pcfg-row-actions {
          grid-column: 1 / -1;
          justify-content: flex-end;
        }
      }
    `}</style>
  );
}
