"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

/*
  ARTICOLI RICHIESTI PER MODELLO (STEP 37)

  Ogni modello di battello puo' avere una lista di articoli che gli
  servono sempre (es. pompa sentina, autoclave, parabrezza...).
  Questa pagina gestisce SOLO la mappa modello -> articoli.

  A differenza del sistema parabrezza (Produzione -> Parabrezza),
  qui non viene creata nessuna richiesta per il singolo battello, non
  si assegna nessun kit e non si tocca mai la giacenza: e' solo un
  elenco di "cosa serve per fare questo modello", usato per generare
  il PDF degli articoli mancanti alla creazione del battello (o dalla
  sua scheda, in qualsiasi momento).
*/

type Item = {
  id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  stock: number;
};

type ModelOption = {
  id: string;
  name: string;
};

type RequiredItemRow = {
  id: string;
  model_boat: string;
  item_id: string;
  note: string | null;
};

export default function ArticoliRichiestiPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [required, setRequired] = useState<RequiredItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [newModel, setNewModel] = useState("");
  const [newItemId, setNewItemId] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const [itemsRes, optionsRes, requiredRes] = await Promise.all([
      supabase
        .from("items")
        .select("id,code,supplier_code,description,stock")
        .order("description", { ascending: true }),
      supabase
        .from("production_options")
        .select("id,name")
        .eq("option_type", "model")
        .eq("active", true)
        .order("name", { ascending: true }),
      supabase
        .from("production_model_required_items")
        .select("id,model_boat,item_id,note")
        .order("model_boat", { ascending: true }),
    ]);

    if (itemsRes.error) {
      setErrorMessage("Errore caricamento articoli: " + itemsRes.error.message);
      setLoading(false);
      return;
    }

    setItems(
      (itemsRes.data || []).map((row: any) => ({
        id: String(row.id),
        code: String(row.code || ""),
        supplier_code: row.supplier_code ? String(row.supplier_code) : null,
        description: String(row.description || ""),
        stock: Number(row.stock || 0),
      }))
    );

    setModelOptions(
      (optionsRes.data || []).map((row: any) => ({
        id: String(row.id),
        name: String(row.name || ""),
      }))
    );

    // La tabella dello STEP 37 potrebbe non essere ancora stata creata sul
    // database: in quel caso questa query fallisce da sola, senza bloccare
    // il resto della pagina (si mostra solo un avviso).
    if (requiredRes.error) {
      setErrorMessage(
        "La tabella degli articoli richiesti non risulta ancora creata: fai girare STEP37_ARTICOLI_RICHIESTI_PER_MODELLO.sql su Supabase, poi ricarica questa pagina."
      );
      setLoading(false);
      return;
    }

    setRequired(
      (requiredRes.data || []).map((row: any) => ({
        id: String(row.id),
        model_boat: String(row.model_boat || ""),
        item_id: String(row.item_id || ""),
        note: row.note ? String(row.note) : null,
      }))
    );

    setLoading(false);
  }

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  function itemLabel(itemId: string) {
    const item = itemMap.get(itemId);
    if (!item) return "Articolo non trovato";
    const code = item.supplier_code || item.code;
    return `${code} — ${item.description}`;
  }

  const requiredByModel = useMemo(() => {
    const map = new Map<string, RequiredItemRow[]>();
    required.forEach((row) => {
      const list = map.get(row.model_boat) || [];
      list.push(row);
      map.set(row.model_boat, list);
    });
    return map;
  }, [required]);

  const alreadyMappedItemIds = useMemo(() => {
    if (!newModel) return new Set<string>();
    return new Set(
      required.filter((row) => row.model_boat === newModel).map((row) => row.item_id)
    );
  }, [required, newModel]);

  const availableItemsForNewMapping = useMemo(
    () => items.filter((item) => !alreadyMappedItemIds.has(item.id)),
    [items, alreadyMappedItemIds]
  );

  async function addRequiredItem() {
    setMessage("");
    setErrorMessage("");

    if (!newModel || !newItemId) {
      setErrorMessage("Seleziona un modello e un articolo.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("production_model_required_items").insert({
      model_boat: newModel,
      item_id: newItemId,
    });

    if (error) {
      setErrorMessage("Errore salvataggio: " + error.message);
      setSaving(false);
      return;
    }

    setMessage("Articolo aggiunto alla lista del modello.");
    setNewItemId("");
    setSaving(false);
    await loadData();
  }

  async function removeRequiredItem(row: RequiredItemRow) {
    setMessage("");
    setErrorMessage("");
    setBusyId(row.id);

    const { error } = await supabase
      .from("production_model_required_items")
      .delete()
      .eq("id", row.id);

    if (error) {
      setErrorMessage("Errore rimozione: " + error.message);
      setBusyId("");
      return;
    }

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

  const modelKeys = Array.from(requiredByModel.keys()).sort((a, b) =>
    a.localeCompare(b, "it", { sensitivity: "base" })
  );

  return (
    <div className="ari-page">
      <div className="ari-top">
        <div>
          <div className="ari-eyebrow">CONTROLLO PRODUZIONE</div>
          <h1>Articoli richiesti per modello</h1>
          <p>
            Definisci quali articoli servono sempre per costruire ogni modello
            (es. pompa sentina, autoclave, parabrezza). Alla creazione di un
            battello, e in qualsiasi momento dalla sua scheda, si genera un
            PDF con quelli ancora senza giacenza. Non tocca mai la giacenza:
            e&apos; solo un controllo.
          </p>
        </div>
        <Link href="/produzione" className="ari-back">
          ← Produzione
        </Link>
      </div>

      {(message || errorMessage) && (
        <div className={errorMessage ? "ari-message error" : "ari-message success"}>
          {errorMessage || message}
        </div>
      )}

      <section className="ari-card">
        <div className="ari-card-head">
          <div className="ari-eyebrow">NUOVA MAPPATURA</div>
          <h2>Aggiungi un articolo richiesto</h2>
        </div>

        <div className="ari-form-row">
          <label>
            Modello
            <select value={newModel} onChange={(e) => setNewModel(e.target.value)}>
              <option value="">Seleziona modello...</option>
              {modelOptions.map((option) => (
                <option key={option.id} value={option.name}>
                  {option.name}
                  {requiredByModel.get(option.name)
                    ? ` (${requiredByModel.get(option.name)!.length} già in lista)`
                    : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            Articolo
            <select
              value={newItemId}
              onChange={(e) => setNewItemId(e.target.value)}
              disabled={!newModel}
            >
              <option value="">Seleziona articolo...</option>
              {availableItemsForNewMapping.map((item) => (
                <option key={item.id} value={item.id}>
                  {(item.supplier_code || item.code) + " — " + item.description}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="ari-btn primary"
            onClick={addRequiredItem}
            disabled={saving || !newModel || !newItemId}
          >
            {saving ? "Salvataggio..." : "+ Aggiungi"}
          </button>
        </div>
      </section>

      <section className="ari-card">
        <div className="ari-card-head">
          <div className="ari-eyebrow">MAPPATURE ATTUALI</div>
          <h2>Articoli richiesti per modello</h2>
        </div>

        {modelKeys.length === 0 ? (
          <div className="ari-empty">Nessuna mappatura ancora inserita.</div>
        ) : (
          <div className="ari-model-list">
            {modelKeys.map((model) => (
              <div key={model} className="ari-model-group">
                <div className="ari-model-name">{model}</div>
                <div className="ari-model-items">
                  {(requiredByModel.get(model) || []).map((row) => {
                    const item = itemMap.get(row.item_id);
                    const outOfStock = item ? item.stock <= 0 : false;
                    return (
                      <div key={row.id} className="ari-model-item">
                        <span className={outOfStock ? "ari-item-label out" : "ari-item-label"}>
                          {itemLabel(row.item_id)}
                          {item && (
                            <span className="ari-stock">
                              {" "}
                              · giacenza {item.stock}
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          className="ari-remove-btn"
                          onClick={() => removeRequiredItem(row)}
                          disabled={busyId === row.id}
                        >
                          {busyId === row.id ? "..." : "Rimuovi"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Styles />
    </div>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      .ari-page {
        max-width: 920px;
        margin: 0 auto;
        padding: 32px 20px 60px;
      }
      .ari-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 20px;
      }
      .ari-eyebrow {
        font-size: 12px;
        opacity: 0.55;
        text-transform: uppercase;
        letter-spacing: 1.2px;
        font-weight: 700;
        margin-bottom: 4px;
      }
      .ari-top h1 {
        margin: 0 0 6px;
        font-size: 26px;
        font-weight: 800;
      }
      .ari-top p {
        margin: 0;
        opacity: 0.65;
        font-size: 14px;
        max-width: 640px;
      }
      .ari-back {
        white-space: nowrap;
        font-size: 14px;
        opacity: 0.7;
        text-decoration: none;
      }
      .ari-back:hover {
        opacity: 1;
      }
      .ari-message {
        padding: 12px 16px;
        border-radius: 10px;
        margin-bottom: 20px;
        font-size: 14px;
      }
      .ari-message.success {
        background: rgba(34, 197, 94, 0.12);
        color: #16a34a;
      }
      .ari-message.error {
        background: rgba(239, 68, 68, 0.12);
        color: #dc2626;
      }
      .ari-card {
        border: 1px solid var(--border-color);
        border-radius: 14px;
        background: var(--card);
        padding: 20px;
        margin-bottom: 20px;
      }
      .ari-card-head h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 800;
      }
      .ari-form-row {
        display: flex;
        gap: 14px;
        align-items: flex-end;
        flex-wrap: wrap;
        margin-top: 14px;
      }
      .ari-form-row label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
        opacity: 0.7;
        flex: 1;
        min-width: 220px;
      }
      .ari-form-row select {
        padding: 9px 10px;
        border-radius: 8px;
        border: 1px solid var(--border-color);
        background: var(--card);
        font-size: 14px;
      }
      .ari-btn {
        padding: 10px 18px;
        border-radius: 8px;
        border: none;
        font-weight: 700;
        font-size: 14px;
        cursor: pointer;
      }
      .ari-btn.primary {
        background: #111827;
        color: #fff;
      }
      .ari-btn.primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .ari-empty {
        margin-top: 14px;
        padding: 20px;
        text-align: center;
        opacity: 0.55;
        font-size: 14px;
      }
      .ari-model-list {
        margin-top: 14px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .ari-model-group {
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 12px 14px;
      }
      .ari-model-name {
        font-weight: 800;
        font-size: 15px;
        margin-bottom: 8px;
      }
      .ari-model-items {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .ari-model-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        font-size: 13.5px;
        border-top: 1px solid var(--border-color);
        padding-top: 6px;
      }
      .ari-model-item:first-child {
        border-top: none;
        padding-top: 0;
      }
      .ari-item-label.out {
        color: #d97706;
        font-weight: 700;
      }
      .ari-stock {
        opacity: 0.55;
        font-weight: 400;
      }
      .ari-remove-btn {
        border: none;
        background: transparent;
        color: #dc2626;
        font-size: 13px;
        cursor: pointer;
        white-space: nowrap;
      }
      .ari-remove-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `}</style>
  );
}
