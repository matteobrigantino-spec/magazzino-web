"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { fetchCompanyLogo } from "../../../lib/pdfLogo";
import { buildGelcoatStockPdf } from "../../../lib/productionPdf";

/*
  MAGAZZINO GELCOAT (STEP 69)

  Per ogni modello e parte (scafo o coperta) si indica un solo valore in
  kg, valido per qualsiasi colore. Quando si crea un battello, il
  database trova da solo l'articolo gelcoat giusto cercando il colore
  scelto nel battello (Carena/Coperta) tra gli articoli gelcoat: per
  questo gli articoli devono chiamarsi "Gelcoat <colore>" con <colore>
  identico al nome colore del battello (es. "Gelcoat 9005" per il
  colore "9005").

  Alla creazione del battello i kg vengono solo IMPEGNATI (prenotati):
  la Giacenza vera non si tocca ancora. Si scala davvero solo quando il
  battello viene segnato "Consegna cliente" (pagina Produzione) - come
  gia' succede per il parabrezza. Annullando la consegna, i kg tornano
  impegnati e la Giacenza torna su.
*/

type GelcoatItem = {
  id: string;
  description: string;
  unit: string;
  stock: number;
  min_stock: number;
};

type OptionRow = {
  id: string;
  name: string;
};

type Part = "scafo" | "coperta";

type Recipe = {
  id: string;
  model_boat: string;
  part: Part;
  qty_kg: number;
};

export default function GelcoatPage() {
  const [gelcoatItems, setGelcoatItems] = useState<GelcoatItem[]>([]);
  const [committedByItem, setCommittedByItem] = useState<Map<string, number>>(new Map());
  const [modelOptions, setModelOptions] = useState<OptionRow[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [selectedModel, setSelectedModel] = useState("");
  const [kgInput, setKgInput] = useState<Record<Part, string>>({ scafo: "", coperta: "" });
  const [savingPart, setSavingPart] = useState<Part | "">("");
  const [removingPart, setRemovingPart] = useState<Part | "">("");

  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const [itemsRes, optionsRes, recipesRes, pendingRes] = await Promise.all([
      supabase
        .from("items")
        .select("id,description,unit,stock,min_stock")
        .eq("category", "Gelcoat")
        .order("description", { ascending: true }),
      supabase
        .from("production_options")
        .select("id,name")
        .eq("option_type", "model")
        .eq("active", true)
        .order("name", { ascending: true }),
      supabase
        .from("production_gelcoat_recipes")
        .select("id,model_boat,part,qty_kg")
        .order("model_boat", { ascending: true }),
      supabase
        .from("production_boat_gelcoat")
        .select("gelcoat_item_id,qty_kg")
        .eq("status", "pending"),
    ]);

    if (itemsRes.error) {
      setErrorMessage("Errore caricamento articoli gelcoat: " + itemsRes.error.message);
      setLoading(false);
      return;
    }

    setGelcoatItems(
      (itemsRes.data || []).map((row: any) => ({
        id: String(row.id),
        description: String(row.description || ""),
        unit: String(row.unit || "KG"),
        stock: Number(row.stock || 0),
        min_stock: Number(row.min_stock || 0),
      }))
    );

    setModelOptions(
      (optionsRes.data || []).map((row: any) => ({ id: String(row.id), name: String(row.name || "") }))
    );

    // Le tabelle dello STEP 69 potrebbero non essere ancora state create sul
    // database: in quel caso questa query fallisce da sola, senza bloccare
    // il resto della pagina (si mostra solo un avviso).
    if (recipesRes.error) {
      setErrorMessage(
        "Le tabelle del magazzino gelcoat non risultano ancora aggiornate: fai girare STEP69_GELCOAT_SEMPLICE_E_SCARICO_ALLA_CONSEGNA.sql su Supabase, poi ricarica questa pagina."
      );
      setLoading(false);
      return;
    }

    setRecipes(
      (recipesRes.data || []).map((row: any) => ({
        id: String(row.id),
        model_boat: String(row.model_boat || ""),
        part: row.part === "coperta" ? "coperta" : "scafo",
        qty_kg: Number(row.qty_kg || 0),
      }))
    );

    const committed = new Map<string, number>();
    (pendingRes.data || []).forEach((row: any) => {
      const itemId = String(row.gelcoat_item_id || "");
      if (!itemId) return;
      committed.set(itemId, (committed.get(itemId) || 0) + Number(row.qty_kg || 0));
    });
    setCommittedByItem(committed);

    setLoading(false);
  }

  const recipesForModel = useMemo(() => {
    const map = new Map<string, Record<Part, Recipe | undefined>>();
    recipes.forEach((recipe) => {
      const current = map.get(recipe.model_boat) || { scafo: undefined, coperta: undefined };
      current[recipe.part] = recipe;
      map.set(recipe.model_boat, current);
    });
    return map;
  }, [recipes]);

  const modelsConfiguredCount = useMemo(() => {
    const models = new Set<string>();
    recipes.forEach((recipe) => models.add(recipe.model_boat));
    return models.size;
  }, [recipes]);

  useEffect(() => {
    const current = recipesForModel.get(selectedModel);
    setKgInput({
      scafo: current?.scafo ? String(current.scafo.qty_kg) : "",
      coperta: current?.coperta ? String(current.coperta.qty_kg) : "",
    });
    setMessage("");
    setErrorMessage("");
  }, [selectedModel, recipesForModel]);

  async function saveRecipe(part: Part) {
    setMessage("");
    setErrorMessage("");

    if (!selectedModel) {
      setErrorMessage("Seleziona prima un modello.");
      return;
    }

    const qty = Number(kgInput[part].replace(",", "."));
    if (!qty || qty <= 0) {
      setErrorMessage("Inserisci i kg (un numero maggiore di zero).");
      return;
    }

    setSavingPart(part);

    const existing = recipesForModel.get(selectedModel)?.[part];

    const { error } = existing
      ? await supabase
          .from("production_gelcoat_recipes")
          .update({ qty_kg: qty })
          .eq("id", existing.id)
      : await supabase
          .from("production_gelcoat_recipes")
          .insert({ model_boat: selectedModel, part, qty_kg: qty });

    if (error) {
      setErrorMessage("Errore salvataggio: " + error.message);
      setSavingPart("");
      return;
    }

    // Aggancia subito anche i battelli di questo modello già in
    // produzione: senza questa chiamata resterebbero per sempre senza
    // impegno gelcoat (l'impegno si crea solo alla creazione del
    // battello, non retroattivamente).
    const { data: backfilledCount, error: backfillError } = await supabase.rpc(
      "backfill_gelcoat_requirements_for_model",
      { p_model_boat: selectedModel }
    );

    if (backfillError) {
      console.error("Errore aggancio battelli esistenti:", backfillError);
    }

    const boatsNote =
      !backfillError && backfilledCount
        ? ` Agganciati anche ${backfilledCount} battell${backfilledCount === 1 ? "o" : "i"} già in produzione di questo modello.`
        : "";

    setMessage(`Salvato.${boatsNote}`);
    setSavingPart("");
    await loadData();
  }

  async function removeRecipe(part: Part) {
    const existing = recipesForModel.get(selectedModel)?.[part];
    if (!existing) return;

    const confirmed = window.confirm(
      `Rimuovere il valore kg per ${selectedModel} / ${part === "scafo" ? "Scafo" : "Coperta"}?`
    );
    if (!confirmed) return;

    setRemovingPart(part);
    setMessage("");
    setErrorMessage("");

    const { error } = await supabase.from("production_gelcoat_recipes").delete().eq("id", existing.id);

    if (error) {
      setErrorMessage("Errore eliminazione: " + error.message);
      setRemovingPart("");
      return;
    }

    setMessage("Rimosso.");
    setRemovingPart("");
    await loadData();
  }

  async function downloadStockPdf() {
    setPdfError("");
    setPdfBusy(true);

    try {
      const logo = await fetchCompanyLogo();
      if (!logo) {
        throw new Error("Carica il logo aziendale prima di scaricare il PDF (Produzione -> Configurazioni).");
      }

      const { doc, filename } = buildGelcoatStockPdf({
        rows: gelcoatItems.map((item) => ({
          description: item.description,
          unit: item.unit,
          stock: item.stock,
          committed: committedByItem.get(item.id) || 0,
          minStock: item.min_stock,
        })),
        logo,
        generatedDate: new Intl.DateTimeFormat("it-IT").format(new Date()),
      });

      doc.save(filename);
    } catch (err: any) {
      setPdfError(err?.message || "Errore durante la creazione del PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", opacity: 0.6 }}>
        Caricamento...
        <Styles />
      </div>
    );
  }

  function renderPartCard(part: Part) {
    const label = part === "scafo" ? "Scafo" : "Coperta";
    const existing = recipesForModel.get(selectedModel)?.[part];

    return (
      <section className="gel-card" key={part}>
        <div className="gel-card-head">
          <h2>{label}</h2>
          {existing && <span>configurato</span>}
        </div>

        <div className="gel-form-row">
          <label>
            Kg (qualsiasi colore)
            <input
              type="text"
              inputMode="decimal"
              placeholder="es. 20"
              value={kgInput[part]}
              onChange={(e) => setKgInput((current) => ({ ...current, [part]: e.target.value }))}
              style={{ width: 110 }}
            />
          </label>
          <button
            type="button"
            className="gel-btn primary"
            onClick={() => saveRecipe(part)}
            disabled={savingPart === part}
          >
            {savingPart === part ? "Salvataggio..." : existing ? "Aggiorna" : "+ Salva"}
          </button>
          {existing && (
            <button
              type="button"
              className="gel-remove-btn"
              onClick={() => removeRecipe(part)}
              disabled={removingPart === part}
            >
              {removingPart === part ? "..." : "Rimuovi"}
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="gel-page">
      <div className="gel-top">
        <div>
          <div className="gel-eyebrow">CONTROLLO PRODUZIONE</div>
          <h1>Magazzino gelcoat</h1>
          <p>
            Per ogni modello imposta quanti kg di gelcoat servono per lo
            scafo e quanti per la coperta (un valore solo, vale per
            qualsiasi colore). Quando crei un battello, i kg vengono
            impegnati in automatico in base al colore scelto; vengono
            tolti davvero dalla Giacenza solo quando il battello viene
            segnato come consegnato al cliente.
          </p>
        </div>
        <Link href="/produzione" className="gel-back">
          ← Produzione
        </Link>
      </div>

      {(message || errorMessage) && (
        <div className={errorMessage ? "gel-message error" : "gel-message success"}>
          {errorMessage || message}
        </div>
      )}

      <section className="gel-card">
        <div className="gel-card-head">
          <h2>Giacenza gelcoat</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link href="/suppliers" className="gel-stock-link">
              Gestisci articoli e scorta minima →
            </Link>
            <button
              type="button"
              className="gel-btn primary"
              onClick={downloadStockPdf}
              disabled={pdfBusy || gelcoatItems.length === 0}
            >
              {pdfBusy ? "Creazione PDF..." : "Stampa PDF"}
            </button>
          </div>
        </div>
        {pdfError && (
          <div className="gel-message error" style={{ marginTop: 12, marginBottom: 0 }}>
            {pdfError}
          </div>
        )}
        {gelcoatItems.length === 0 ? (
          <div className="gel-empty">
            Nessun articolo gelcoat trovato: fai girare STEP66_FORNITORE_GELCOAT.sql
            su Supabase, poi ricarica questa pagina.
          </div>
        ) : (
          <>
            <table className="gel-table">
              <thead>
                <tr>
                  <th>Articolo</th>
                  <th>Giacenza</th>
                  <th>Impegnati</th>
                  <th>Disponibile</th>
                  <th>Scorta minima</th>
                </tr>
              </thead>
              <tbody>
                {gelcoatItems.map((item) => {
                  const committed = committedByItem.get(item.id) || 0;
                  const available = item.stock - committed;
                  return (
                    <tr key={item.id} className={available <= item.min_stock ? "gel-low" : ""}>
                      <td>{item.description}</td>
                      <td>
                        {item.stock} {item.unit}
                      </td>
                      <td>
                        {committed > 0 ? `${committed} ${item.unit}` : "-"}
                      </td>
                      <td>
                        {available} {item.unit}
                      </td>
                      <td>
                        {item.min_stock} {item.unit}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="gel-hint">
              "Impegnati" = kg già prenotati dai battelli in produzione (non ancora
              consegnati al cliente). "Disponibile" = Giacenza − Impegnati: è il
              numero da guardare per sapere quando e quanto riordinare.
            </p>
          </>
        )}
      </section>

      <section className="gel-card">
        <div className="gel-eyebrow">MODELLO</div>
        <select
          className="gel-model-select"
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
        >
          <option value="">Seleziona modello...</option>
          {modelOptions.map((option) => (
            <option key={option.id} value={option.name}>
              {option.name}
              {recipesForModel.has(option.name) ? " (configurato)" : ""}
            </option>
          ))}
        </select>
        {modelsConfiguredCount > 0 && (
          <p className="gel-hint" style={{ marginTop: 10 }}>
            {modelsConfiguredCount} modell{modelsConfiguredCount === 1 ? "o" : "i"} con almeno un valore già configurato.
          </p>
        )}
      </section>

      {selectedModel && (
        <>
          {renderPartCard("scafo")}
          {renderPartCard("coperta")}
        </>
      )}

      <Styles />
    </div>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      .gel-page {
        max-width: 980px;
        margin: 0 auto;
        padding: 32px 20px 60px;
      }
      .gel-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 20px;
      }
      .gel-eyebrow {
        font-size: 12px;
        opacity: 0.55;
        text-transform: uppercase;
        letter-spacing: 1.2px;
        font-weight: 700;
        margin-bottom: 4px;
      }
      .gel-top h1 {
        margin: 0 0 6px;
        font-size: 26px;
        font-weight: 800;
      }
      .gel-top p {
        margin: 0;
        opacity: 0.65;
        font-size: 14px;
        max-width: 680px;
      }
      .gel-back {
        white-space: nowrap;
        font-size: 14px;
        opacity: 0.7;
        text-decoration: none;
      }
      .gel-back:hover {
        opacity: 1;
      }
      .gel-message {
        padding: 12px 16px;
        border-radius: 10px;
        margin-bottom: 20px;
        font-size: 14px;
      }
      .gel-message.success {
        background: rgba(34, 197, 94, 0.12);
        color: #16a34a;
      }
      .gel-message.error {
        background: rgba(239, 68, 68, 0.12);
        color: #dc2626;
      }
      .gel-card {
        border: 1px solid var(--border-color);
        border-radius: 14px;
        background: var(--card);
        padding: 20px;
        margin-bottom: 20px;
      }
      .gel-card-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .gel-card-head h2 {
        margin: 0;
        font-size: 17px;
        font-weight: 800;
      }
      .gel-card-head > span {
        font-size: 12px;
        opacity: 0.6;
        font-weight: 700;
        white-space: nowrap;
      }
      .gel-stock-link {
        font-size: 12.5px;
        font-weight: 700;
        text-decoration: none;
        color: #3b82f6;
        white-space: nowrap;
      }
      .gel-stock-link:hover {
        opacity: 0.8;
      }
      .gel-hint {
        margin: 10px 0 0;
        font-size: 11.5px;
        opacity: 0.55;
        line-height: 1.5;
      }
      .gel-model-select {
        margin-top: 8px;
        padding: 9px 10px;
        border-radius: 8px;
        border: 1px solid var(--border-color);
        background: #081524;
        color: #fff;
        font-size: 14px;
        min-width: 260px;
      }
      .gel-form-row {
        display: flex;
        gap: 14px;
        align-items: flex-end;
        flex-wrap: wrap;
        margin-top: 14px;
      }
      .gel-form-row label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
        opacity: 0.7;
      }
      .gel-form-row input {
        padding: 9px 10px;
        border-radius: 8px;
        border: 1px solid var(--border-color);
        background: #081524;
        color: #fff;
        font-size: 14px;
      }
      .gel-btn {
        padding: 10px 18px;
        border-radius: 8px;
        border: 1px solid var(--border-color);
        background: transparent;
        font-weight: 700;
        font-size: 13px;
        cursor: pointer;
        white-space: nowrap;
      }
      .gel-btn.primary {
        background: #111827;
        color: #fff;
        border: none;
      }
      .gel-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .gel-empty {
        margin-top: 10px;
        padding: 16px;
        text-align: center;
        opacity: 0.55;
        font-size: 14px;
      }
      .gel-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
        font-size: 13.5px;
      }
      .gel-table th {
        text-align: left;
        opacity: 0.55;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 6px 8px;
        border-bottom: 1px solid var(--border-color);
      }
      .gel-table td {
        padding: 7px 8px;
        border-bottom: 1px solid var(--border-color);
      }
      .gel-low td {
        color: #d97706;
        font-weight: 800;
      }
      .gel-remove-btn {
        border: none;
        background: transparent;
        color: #dc2626;
        font-size: 13px;
        cursor: pointer;
        white-space: nowrap;
      }
      .gel-remove-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `}</style>
  );
}
