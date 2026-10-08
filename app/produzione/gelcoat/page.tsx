"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

/*
  MAGAZZINO GELCOAT (STEP 67)

  Per ogni modello battello, colore e parte (scafo o coperta) si indica
  quale articolo gelcoat usare e quanti kg servono. Quando si inserisce
  un nuovo battello in produzione (Carena = scafo, Coperta = coperta),
  il database cerca la ricetta giusta e scarica i kg in automatico
  dalla giacenza dell'articolo gelcoat scelto qui.

  Questa pagina gestisce solo le ricette. Gli articoli gelcoat (giacenza,
  scorta minima, prezzo) restano normali articoli di magazzino e si
  modificano dalla pagina fornitore.
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
  color: string;
  gelcoat_item_id: string;
  qty_kg: number;
};

const emptyPartState = { scafo: "", coperta: "" };

export default function GelcoatPage() {
  const [gelcoatItems, setGelcoatItems] = useState<GelcoatItem[]>([]);
  const [modelOptions, setModelOptions] = useState<OptionRow[]>([]);
  const [colorOptions, setColorOptions] = useState<OptionRow[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [selectedModel, setSelectedModel] = useState("");

  const [newColor, setNewColor] = useState<Record<Part, string>>({ ...emptyPartState });
  const [newItemId, setNewItemId] = useState<Record<Part, string>>({ ...emptyPartState });
  const [newQty, setNewQty] = useState<Record<Part, string>>({ ...emptyPartState });
  const [savingPart, setSavingPart] = useState<Part | "">("");

  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const [itemsRes, optionsRes, recipesRes] = await Promise.all([
      supabase
        .from("items")
        .select("id,description,unit,stock,min_stock")
        .eq("category", "Gelcoat")
        .order("description", { ascending: true }),
      supabase
        .from("production_options")
        .select("id,option_type,name")
        .eq("active", true)
        .order("name", { ascending: true }),
      supabase
        .from("production_gelcoat_recipes")
        .select("id,model_boat,part,color,gelcoat_item_id,qty_kg")
        .order("model_boat", { ascending: true })
        .order("color", { ascending: true }),
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

    const options = optionsRes.data || [];

    setModelOptions(
      options
        .filter((row: any) => row.option_type === "model")
        .map((row: any) => ({ id: String(row.id), name: String(row.name || "") }))
    );

    setColorOptions(
      options
        .filter((row: any) => row.option_type === "color")
        .map((row: any) => ({ id: String(row.id), name: String(row.name || "") }))
    );

    // La tabella dello STEP 67 potrebbe non essere ancora stata creata sul
    // database: in quel caso questa query fallisce da sola, senza bloccare
    // il resto della pagina (si mostra solo un avviso).
    if (recipesRes.error) {
      setErrorMessage(
        "La tabella delle ricette gelcoat non risulta ancora creata: fai girare STEP67_GELCOAT_RICETTE_E_SCARICO.sql su Supabase, poi ricarica questa pagina."
      );
      setLoading(false);
      return;
    }

    setRecipes(
      (recipesRes.data || []).map((row: any) => ({
        id: String(row.id),
        model_boat: String(row.model_boat || ""),
        part: row.part === "coperta" ? "coperta" : "scafo",
        color: String(row.color || ""),
        gelcoat_item_id: String(row.gelcoat_item_id || ""),
        qty_kg: Number(row.qty_kg || 0),
      }))
    );

    setLoading(false);
  }

  const itemMap = useMemo(() => new Map(gelcoatItems.map((item) => [item.id, item])), [gelcoatItems]);

  const recipeCountByModel = useMemo(() => {
    const counts = new Map<string, number>();
    recipes.forEach((recipe) => {
      counts.set(recipe.model_boat, (counts.get(recipe.model_boat) || 0) + 1);
    });
    return counts;
  }, [recipes]);

  const recipesForModel = useMemo(
    () => ({
      scafo: recipes
        .filter((recipe) => recipe.model_boat === selectedModel && recipe.part === "scafo")
        .sort((a, b) => a.color.localeCompare(b.color, "it")),
      coperta: recipes
        .filter((recipe) => recipe.model_boat === selectedModel && recipe.part === "coperta")
        .sort((a, b) => a.color.localeCompare(b.color, "it")),
    }),
    [recipes, selectedModel]
  );

  function resetForm(part: Part) {
    setNewColor((current) => ({ ...current, [part]: "" }));
    setNewItemId((current) => ({ ...current, [part]: "" }));
    setNewQty((current) => ({ ...current, [part]: "" }));
  }

  async function addRecipe(part: Part) {
    setMessage("");
    setErrorMessage("");

    if (!selectedModel) {
      setErrorMessage("Seleziona prima un modello.");
      return;
    }

    const color = newColor[part];
    const itemId = newItemId[part];
    const qty = Number(newQty[part].replace(",", "."));

    if (!color) {
      setErrorMessage("Seleziona il colore.");
      return;
    }
    if (!itemId) {
      setErrorMessage("Seleziona l'articolo gelcoat da scaricare.");
      return;
    }
    if (!qty || qty <= 0) {
      setErrorMessage("Inserisci i kg (un numero maggiore di zero).");
      return;
    }

    setSavingPart(part);

    const { error } = await supabase.from("production_gelcoat_recipes").insert({
      model_boat: selectedModel,
      part,
      color,
      gelcoat_item_id: itemId,
      qty_kg: qty,
    });

    if (error) {
      if (error.message.toLowerCase().includes("unique")) {
        setErrorMessage(
          `Esiste già una ricetta per ${selectedModel} / ${part === "scafo" ? "Scafo" : "Coperta"} / ${color}: usa "Modifica kg" sulla riga qui sotto invece di crearne una nuova.`
        );
      } else {
        setErrorMessage("Errore salvataggio ricetta: " + error.message);
      }
      setSavingPart("");
      return;
    }

    setMessage("Ricetta aggiunta.");
    resetForm(part);
    setSavingPart("");
    await loadData();
  }

  async function editQty(recipe: Recipe) {
    const item = itemMap.get(recipe.gelcoat_item_id);
    const next = window.prompt(
      `Kg di "${item ? item.description : "gelcoat"}" per fare ${
        recipe.part === "scafo" ? "lo scafo" : "la coperta"
      } di ${recipe.model_boat} colore ${recipe.color}:`,
      String(recipe.qty_kg)
    );

    if (next === null) return;

    const qty = Number(next.replace(",", "."));
    if (!qty || qty <= 0) {
      setErrorMessage("Quantità non valida.");
      return;
    }

    setBusyId(recipe.id);
    setMessage("");
    setErrorMessage("");

    const { error } = await supabase
      .from("production_gelcoat_recipes")
      .update({ qty_kg: qty })
      .eq("id", recipe.id);

    if (error) {
      setErrorMessage("Errore modifica: " + error.message);
      setBusyId("");
      return;
    }

    setMessage("Quantità aggiornata.");
    setBusyId("");
    await loadData();
  }

  async function removeRecipe(recipe: Recipe) {
    const confirmed = window.confirm(
      `Eliminare la ricetta ${recipe.model_boat} / ${recipe.part === "scafo" ? "Scafo" : "Coperta"} / ${recipe.color}?`
    );
    if (!confirmed) return;

    setBusyId(recipe.id);
    setMessage("");
    setErrorMessage("");

    const { error } = await supabase.from("production_gelcoat_recipes").delete().eq("id", recipe.id);

    if (error) {
      setErrorMessage("Errore eliminazione: " + error.message);
      setBusyId("");
      return;
    }

    setMessage("Ricetta eliminata.");
    setBusyId("");
    await loadData();
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", opacity: 0.6 }}>
        Caricamento...
        <Styles />
      </div>
    );
  }

  function renderPartSection(part: Part) {
    const label = part === "scafo" ? "Scafo" : "Coperta";
    const rows = recipesForModel[part];

    return (
      <section className="gel-card" key={part}>
        <div className="gel-card-head">
          <h2>{label}</h2>
          <span>{rows.length} color{rows.length === 1 ? "e" : "i"} configurat{rows.length === 1 ? "o" : "i"}</span>
        </div>

        {rows.length === 0 ? (
          <div className="gel-empty">Nessuna ricetta ancora per questa parte.</div>
        ) : (
          <table className="gel-table">
            <thead>
              <tr>
                <th>Colore</th>
                <th>Gelcoat da scaricare</th>
                <th>Kg</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((recipe) => {
                const item = itemMap.get(recipe.gelcoat_item_id);
                return (
                  <tr key={recipe.id}>
                    <td>{recipe.color}</td>
                    <td>{item ? item.description : "Articolo non trovato"}</td>
                    <td>{recipe.qty_kg} kg</td>
                    <td className="gel-row-actions">
                      <button
                        type="button"
                        className="gel-link-btn"
                        onClick={() => editQty(recipe)}
                        disabled={busyId === recipe.id}
                      >
                        Modifica kg
                      </button>
                      <button
                        type="button"
                        className="gel-remove-btn"
                        onClick={() => removeRecipe(recipe)}
                        disabled={busyId === recipe.id}
                      >
                        {busyId === recipe.id ? "..." : "Rimuovi"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="gel-form-row">
          <label>
            Colore
            <select
              value={newColor[part]}
              onChange={(e) => setNewColor((current) => ({ ...current, [part]: e.target.value }))}
            >
              <option value="">Seleziona...</option>
              {colorOptions.map((option) => (
                <option key={option.id} value={option.name}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 2 }}>
            Gelcoat da scaricare
            <select
              value={newItemId[part]}
              onChange={(e) => setNewItemId((current) => ({ ...current, [part]: e.target.value }))}
            >
              <option value="">Seleziona...</option>
              {gelcoatItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.description} (giacenza {item.stock} {item.unit})
                </option>
              ))}
            </select>
          </label>
          <label>
            Kg
            <input
              type="text"
              inputMode="decimal"
              placeholder="es. 18"
              value={newQty[part]}
              onChange={(e) => setNewQty((current) => ({ ...current, [part]: e.target.value }))}
              style={{ width: 90 }}
            />
          </label>
          <button
            type="button"
            className="gel-btn primary"
            onClick={() => addRecipe(part)}
            disabled={savingPart === part}
          >
            {savingPart === part ? "Salvataggio..." : "+ Aggiungi"}
          </button>
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
            Per ogni modello, colore e parte (scafo o coperta) imposta quanti
            kg di gelcoat servono e quale articolo scaricare. Da quel momento,
            ogni volta che inserisci un battello con quel modello e quel
            colore di Carena/Coperta, i kg vengono scaricati in automatico
            dalla giacenza dell&apos;articolo gelcoat scelto qui sotto.
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
          <Link href="/suppliers" className="gel-stock-link">
            Gestisci articoli e scorta minima →
          </Link>
        </div>
        {gelcoatItems.length === 0 ? (
          <div className="gel-empty">
            Nessun articolo gelcoat trovato: fai girare STEP66_FORNITORE_GELCOAT.sql
            su Supabase, poi ricarica questa pagina.
          </div>
        ) : (
          <table className="gel-table">
            <thead>
              <tr>
                <th>Articolo</th>
                <th>Giacenza</th>
                <th>Scorta minima</th>
              </tr>
            </thead>
            <tbody>
              {gelcoatItems.map((item) => (
                <tr key={item.id} className={item.stock <= item.min_stock ? "gel-low" : ""}>
                  <td>{item.description}</td>
                  <td>
                    {item.stock} {item.unit}
                  </td>
                  <td>
                    {item.min_stock} {item.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
              {recipeCountByModel.get(option.name) ? ` (${recipeCountByModel.get(option.name)} ricette)` : ""}
            </option>
          ))}
        </select>
      </section>

      {selectedModel && (
        <>
          {renderPartSection("scafo")}
          {renderPartSection("coperta")}
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
        padding-top: 14px;
        border-top: 1px solid var(--border-color);
      }
      .gel-form-row label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
        opacity: 0.7;
        flex: 1;
        min-width: 160px;
      }
      .gel-form-row input,
      .gel-form-row select {
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
      .gel-row-actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        white-space: nowrap;
      }
      .gel-link-btn {
        border: none;
        background: transparent;
        color: #3b82f6;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }
      .gel-remove-btn {
        border: none;
        background: transparent;
        color: #dc2626;
        font-size: 13px;
        cursor: pointer;
        white-space: nowrap;
      }
      .gel-remove-btn:disabled,
      .gel-link-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `}</style>
  );
}
