"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

/*
  DISTINTA BASE PER MODELLO (STEP 38)

  Ogni modello ha una distinta base fatta di sezioni (es. "Dotazioni
  di serie", "Consolle con parabrezza, corrimano e volante"), ognuna
  con le sue righe articolo (fornitore/codice/descrizione/UM/qta).

  Una sezione e' STANDARD (fa sempre parte del modello, nessuna
  scelta) oppure OPTIONAL (si sceglie battello per battello, quando
  si inserisce l'ordine o in un secondo momento dalla sua scheda).

  Questa pagina gestisce solo la distinta per modello. E' un elenco
  di sola lettura verso la giacenza (items.stock): non crea nessuna
  richiesta, non assegna nulla, non tocca mai la giacenza.
*/

type Item = {
  id: string;
  supplier_id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  stock: number;
};

type Supplier = {
  id: string;
  name: string;
};

type ModelOption = {
  id: string;
  name: string;
};

type Section = {
  id: string;
  model_boat: string;
  name: string;
  kind: "standard" | "optional";
  sort_order: number;
};

type BomItem = {
  id: string;
  section_id: string;
  item_id: string | null;
  description: string;
  unit: string;
  qty: number;
  note: string | null;
};

export default function DistintaBasePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [bomItems, setBomItems] = useState<BomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [selectedModel, setSelectedModel] = useState("");

  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionKind, setNewSectionKind] = useState<"standard" | "optional">("standard");
  const [savingSection, setSavingSection] = useState(false);

  // Form "aggiungi articolo": una sola riga aperta per volta, per
  // la sezione il cui id e' salvato qui.
  const [addingToSection, setAddingToSection] = useState<string>("");
  const [itemMode, setItemMode] = useState<"catalogo" | "libero">("catalogo");
  const [itemSearch, setItemSearch] = useState("");
  const [pickedItemId, setPickedItemId] = useState("");
  const [freeDescription, setFreeDescription] = useState("");
  const [rowUnit, setRowUnit] = useState("PZ");
  const [rowQty, setRowQty] = useState("1");
  const [savingItem, setSavingItem] = useState(false);

  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const [itemsRes, suppliersRes, optionsRes, sectionsRes, bomItemsRes] = await Promise.all([
      supabase
        .from("items")
        .select("id,supplier_id,code,supplier_code,description,stock")
        .order("description", { ascending: true }),
      supabase.from("suppliers").select("id,name").order("name", { ascending: true }),
      supabase
        .from("production_options")
        .select("id,name")
        .eq("option_type", "model")
        .eq("active", true)
        .order("name", { ascending: true }),
      supabase
        .from("production_bom_sections")
        .select("id,model_boat,name,kind,sort_order")
        .order("model_boat", { ascending: true })
        .order("sort_order", { ascending: true }),
      supabase
        .from("production_bom_items")
        .select("id,section_id,item_id,description,unit,qty,note")
        .order("sort_order", { ascending: true }),
    ]);

    if (itemsRes.error) {
      setErrorMessage("Errore caricamento articoli: " + itemsRes.error.message);
      setLoading(false);
      return;
    }

    setItems(
      (itemsRes.data || []).map((row: any) => ({
        id: String(row.id),
        supplier_id: String(row.supplier_id || ""),
        code: String(row.code || ""),
        supplier_code: row.supplier_code ? String(row.supplier_code) : null,
        description: String(row.description || ""),
        stock: Number(row.stock || 0),
      }))
    );

    setSuppliers(
      (suppliersRes.data || []).map((row: any) => ({
        id: String(row.id),
        name: String(row.name || ""),
      }))
    );

    setModelOptions(
      (optionsRes.data || []).map((row: any) => ({
        id: String(row.id),
        name: String(row.name || ""),
      }))
    );

    // Le tabelle dello STEP 38 potrebbero non essere ancora state create
    // sul database: in quel caso questa query fallisce da sola, senza
    // bloccare il resto della pagina (si mostra solo un avviso).
    if (sectionsRes.error) {
      setErrorMessage(
        "Le tabelle della distinta base non risultano ancora create: fai girare STEP38_DISTINTA_BASE_BATTELLI.sql su Supabase, poi ricarica questa pagina."
      );
      setLoading(false);
      return;
    }

    setSections(
      (sectionsRes.data || []).map((row: any) => ({
        id: String(row.id),
        model_boat: String(row.model_boat || ""),
        name: String(row.name || ""),
        kind: row.kind === "optional" ? "optional" : "standard",
        sort_order: Number(row.sort_order || 10),
      }))
    );

    setBomItems(
      (bomItemsRes.data || []).map((row: any) => ({
        id: String(row.id),
        section_id: String(row.section_id || ""),
        item_id: row.item_id ? String(row.item_id) : null,
        description: String(row.description || ""),
        unit: String(row.unit || "PZ"),
        qty: Number(row.qty || 0),
        note: row.note ? String(row.note) : null,
      }))
    );

    setLoading(false);
  }

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const supplierMap = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])),
    [suppliers]
  );

  function supplierNameFor(item: Item | undefined) {
    if (!item || !item.supplier_id) return "";
    return supplierMap.get(item.supplier_id) || "";
  }

  const sectionsForModel = useMemo(
    () =>
      sections
        .filter((section) => section.model_boat === selectedModel)
        .sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === "standard" ? -1 : 1;
          return a.sort_order - b.sort_order || a.name.localeCompare(b.name, "it");
        }),
    [sections, selectedModel]
  );

  const itemsBySection = useMemo(() => {
    const map = new Map<string, BomItem[]>();
    bomItems.forEach((row) => {
      const list = map.get(row.section_id) || [];
      list.push(row);
      map.set(row.section_id, list);
    });
    return map;
  }, [bomItems]);

  const sectionCountByModel = useMemo(() => {
    const counts = new Map<string, number>();
    sections.forEach((section) => {
      counts.set(section.model_boat, (counts.get(section.model_boat) || 0) + 1);
    });
    return counts;
  }, [sections]);

  const filteredItemsForPicker = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    if (!query) return items.slice(0, 150);
    return items
      .filter((item) => {
        const haystack = `${item.code} ${item.supplier_code || ""} ${item.description}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 150);
  }, [items, itemSearch]);

  async function addSection() {
    setMessage("");
    setErrorMessage("");

    if (!selectedModel) {
      setErrorMessage("Seleziona prima un modello.");
      return;
    }
    if (!newSectionName.trim()) {
      setErrorMessage("Inserisci il nome della sezione.");
      return;
    }

    setSavingSection(true);

    const { error } = await supabase.from("production_bom_sections").insert({
      model_boat: selectedModel,
      name: newSectionName.trim(),
      kind: newSectionKind,
      sort_order: sectionsForModel.length * 10 + 10,
    });

    if (error) {
      setErrorMessage("Errore salvataggio sezione: " + error.message);
      setSavingSection(false);
      return;
    }

    setMessage("Sezione aggiunta.");
    setNewSectionName("");
    setNewSectionKind("standard");
    setSavingSection(false);
    await loadData();
  }

  async function removeSection(section: Section) {
    setMessage("");
    setErrorMessage("");
    setBusyId(section.id);

    const { error } = await supabase.from("production_bom_sections").delete().eq("id", section.id);

    if (error) {
      setErrorMessage("Errore rimozione sezione: " + error.message);
      setBusyId("");
      return;
    }

    setBusyId("");
    await loadData();
  }

  function startAddingItem(sectionId: string) {
    setAddingToSection(sectionId);
    setItemMode("catalogo");
    setItemSearch("");
    setPickedItemId("");
    setFreeDescription("");
    setRowUnit("PZ");
    setRowQty("1");
    setMessage("");
    setErrorMessage("");
  }

  async function addItemToSection() {
    setMessage("");
    setErrorMessage("");

    if (!addingToSection) return;

    const qtyNumber = Number(rowQty.replace(",", "."));
    if (!qtyNumber || qtyNumber <= 0) {
      setErrorMessage("Inserisci una quantità valida.");
      return;
    }

    let description = "";
    let itemId: string | null = null;

    if (itemMode === "catalogo") {
      if (!pickedItemId) {
        setErrorMessage("Seleziona un articolo dal catalogo.");
        return;
      }
      const item = itemMap.get(pickedItemId);
      if (!item) {
        setErrorMessage("Articolo non trovato.");
        return;
      }
      itemId = item.id;
      description = item.description;
    } else {
      if (!freeDescription.trim()) {
        setErrorMessage("Inserisci una descrizione.");
        return;
      }
      description = freeDescription.trim();
    }

    setSavingItem(true);

    const currentRows = itemsBySection.get(addingToSection) || [];

    const { error } = await supabase.from("production_bom_items").insert({
      section_id: addingToSection,
      item_id: itemId,
      description,
      unit: rowUnit.trim() || "PZ",
      qty: qtyNumber,
      sort_order: currentRows.length * 10 + 10,
    });

    if (error) {
      setErrorMessage("Errore salvataggio articolo: " + error.message);
      setSavingItem(false);
      return;
    }

    setSavingItem(false);
    setAddingToSection("");
    await loadData();
  }

  async function removeItem(row: BomItem) {
    setMessage("");
    setErrorMessage("");
    setBusyId(row.id);

    const { error } = await supabase.from("production_bom_items").delete().eq("id", row.id);

    if (error) {
      setErrorMessage("Errore rimozione articolo: " + error.message);
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

  return (
    <div className="dbb-page">
      <div className="dbb-top">
        <div>
          <div className="dbb-eyebrow">CONTROLLO PRODUZIONE</div>
          <h1>Distinta base per modello</h1>
          <p>
            Definisci per ogni modello le sezioni (es. Dotazioni di serie,
            Consolle...) e gli articoli che contengono, con quantità e unità
            di misura. Le sezioni <strong>standard</strong> fanno sempre
            parte del modello; le sezioni <strong>optional</strong> si
            scelgono battello per battello, quando lo crei o dalla sua
            scheda. Non tocca mai la giacenza: e&apos; solo un controllo.
          </p>
        </div>
        <Link href="/produzione" className="dbb-back">
          ← Produzione
        </Link>
      </div>

      {(message || errorMessage) && (
        <div className={errorMessage ? "dbb-message error" : "dbb-message success"}>
          {errorMessage || message}
        </div>
      )}

      <section className="dbb-card">
        <div className="dbb-eyebrow">MODELLO</div>
        <select
          className="dbb-model-select"
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
        >
          <option value="">Seleziona modello...</option>
          {modelOptions.map((option) => (
            <option key={option.id} value={option.name}>
              {option.name}
              {sectionCountByModel.get(option.name)
                ? ` (${sectionCountByModel.get(option.name)} sezioni)`
                : ""}
            </option>
          ))}
        </select>
      </section>

      {selectedModel && (
        <>
          <section className="dbb-card">
            <div className="dbb-card-head">
              <div className="dbb-eyebrow">NUOVA SEZIONE</div>
              <h2>Aggiungi una sezione a {selectedModel}</h2>
            </div>

            <div className="dbb-form-row">
              <label>
                Nome sezione
                <input
                  type="text"
                  placeholder='es. "Consolle con parabrezza, corrimano e volante"'
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                />
              </label>
              <label>
                Tipo
                <select
                  value={newSectionKind}
                  onChange={(e) => setNewSectionKind(e.target.value as "standard" | "optional")}
                >
                  <option value="standard">Standard (sempre inclusa)</option>
                  <option value="optional">Optional (a scelta per battello)</option>
                </select>
              </label>
              <button
                type="button"
                className="dbb-btn primary"
                onClick={addSection}
                disabled={savingSection || !newSectionName.trim()}
              >
                {savingSection ? "Salvataggio..." : "+ Aggiungi sezione"}
              </button>
            </div>
          </section>

          {sectionsForModel.length === 0 ? (
            <div className="dbb-empty">Nessuna sezione ancora inserita per questo modello.</div>
          ) : (
            sectionsForModel.map((section) => {
              const rows = itemsBySection.get(section.id) || [];
              return (
                <section key={section.id} className="dbb-card">
                  <div className="dbb-section-head">
                    <div>
                      <span className={`dbb-kind-badge ${section.kind}`}>
                        {section.kind === "standard" ? "STANDARD" : "OPTIONAL"}
                      </span>
                      <h2>{section.name}</h2>
                    </div>
                    <button
                      type="button"
                      className="dbb-remove-btn"
                      onClick={() => removeSection(section)}
                      disabled={busyId === section.id}
                    >
                      {busyId === section.id ? "..." : "Rimuovi sezione"}
                    </button>
                  </div>

                  {rows.length === 0 ? (
                    <div className="dbb-empty">Nessun articolo in questa sezione.</div>
                  ) : (
                    <table className="dbb-table">
                      <thead>
                        <tr>
                          <th>Fornitore</th>
                          <th>Cod. articolo</th>
                          <th>Descrizione</th>
                          <th>Um</th>
                          <th>Q.tà</th>
                          <th>Giacenza</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const item = row.item_id ? itemMap.get(row.item_id) : undefined;
                          const stockKnown = !!item;
                          const short = stockKnown && item!.stock < row.qty;
                          return (
                            <tr key={row.id}>
                              <td>{item ? supplierNameFor(item) || "-" : "-"}</td>
                              <td>{item ? item.supplier_code || item.code || "-" : "-"}</td>
                              <td>{row.description}</td>
                              <td>{row.unit}</td>
                              <td>{row.qty}</td>
                              <td className={short ? "dbb-short" : ""}>
                                {stockKnown ? item!.stock : "n/d"}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="dbb-remove-btn"
                                  onClick={() => removeItem(row)}
                                  disabled={busyId === row.id}
                                >
                                  {busyId === row.id ? "..." : "Rimuovi"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {addingToSection === section.id ? (
                    <div className="dbb-add-item-form">
                      <div className="dbb-mode-toggle">
                        <button
                          type="button"
                          className={itemMode === "catalogo" ? "active" : ""}
                          onClick={() => setItemMode("catalogo")}
                        >
                          Da catalogo
                        </button>
                        <button
                          type="button"
                          className={itemMode === "libero" ? "active" : ""}
                          onClick={() => setItemMode("libero")}
                        >
                          Testo libero
                        </button>
                      </div>

                      {itemMode === "catalogo" ? (
                        <div className="dbb-form-row">
                          <label style={{ flex: 2 }}>
                            Cerca articolo
                            <input
                              type="text"
                              placeholder="Codice o descrizione..."
                              value={itemSearch}
                              onChange={(e) => setItemSearch(e.target.value)}
                            />
                          </label>
                          <label style={{ flex: 2 }}>
                            Articolo
                            <select value={pickedItemId} onChange={(e) => setPickedItemId(e.target.value)}>
                              <option value="">Seleziona...</option>
                              {filteredItemsForPicker.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {(item.supplier_code || item.code) + " — " + item.description}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : (
                        <div className="dbb-form-row">
                          <label style={{ flex: 3 }}>
                            Descrizione
                            <input
                              type="text"
                              placeholder="es. Targa dati Italboats CE 106x100mm"
                              value={freeDescription}
                              onChange={(e) => setFreeDescription(e.target.value)}
                            />
                          </label>
                        </div>
                      )}

                      <div className="dbb-form-row">
                        <label>
                          Um
                          <input
                            type="text"
                            value={rowUnit}
                            onChange={(e) => setRowUnit(e.target.value)}
                            style={{ width: 70 }}
                          />
                        </label>
                        <label>
                          Q.tà
                          <input
                            type="text"
                            inputMode="decimal"
                            value={rowQty}
                            onChange={(e) => setRowQty(e.target.value)}
                            style={{ width: 90 }}
                          />
                        </label>
                        <button
                          type="button"
                          className="dbb-btn primary"
                          onClick={addItemToSection}
                          disabled={savingItem}
                        >
                          {savingItem ? "Salvataggio..." : "+ Aggiungi articolo"}
                        </button>
                        <button
                          type="button"
                          className="dbb-btn"
                          onClick={() => setAddingToSection("")}
                          disabled={savingItem}
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="dbb-btn"
                      onClick={() => startAddingItem(section.id)}
                    >
                      + Aggiungi articolo
                    </button>
                  )}
                </section>
              );
            })
          )}
        </>
      )}

      <Styles />
    </div>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      .dbb-page {
        max-width: 980px;
        margin: 0 auto;
        padding: 32px 20px 60px;
      }
      .dbb-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 20px;
      }
      .dbb-eyebrow {
        font-size: 12px;
        opacity: 0.55;
        text-transform: uppercase;
        letter-spacing: 1.2px;
        font-weight: 700;
        margin-bottom: 4px;
      }
      .dbb-top h1 {
        margin: 0 0 6px;
        font-size: 26px;
        font-weight: 800;
      }
      .dbb-top p {
        margin: 0;
        opacity: 0.65;
        font-size: 14px;
        max-width: 680px;
      }
      .dbb-back {
        white-space: nowrap;
        font-size: 14px;
        opacity: 0.7;
        text-decoration: none;
      }
      .dbb-back:hover {
        opacity: 1;
      }
      .dbb-message {
        padding: 12px 16px;
        border-radius: 10px;
        margin-bottom: 20px;
        font-size: 14px;
      }
      .dbb-message.success {
        background: rgba(34, 197, 94, 0.12);
        color: #16a34a;
      }
      .dbb-message.error {
        background: rgba(239, 68, 68, 0.12);
        color: #dc2626;
      }
      .dbb-card {
        border: 1px solid var(--border-color);
        border-radius: 14px;
        background: var(--card);
        padding: 20px;
        margin-bottom: 20px;
      }
      .dbb-card-head h2 {
        margin: 0;
        font-size: 17px;
        font-weight: 800;
      }
      .dbb-model-select {
        margin-top: 8px;
        padding: 9px 10px;
        border-radius: 8px;
        border: 1px solid var(--border-color);
        background: #081524;
        color: #fff;
        font-size: 14px;
        min-width: 260px;
      }
      .dbb-form-row {
        display: flex;
        gap: 14px;
        align-items: flex-end;
        flex-wrap: wrap;
        margin-top: 14px;
      }
      .dbb-form-row label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
        opacity: 0.7;
        flex: 1;
        min-width: 160px;
      }
      .dbb-form-row input,
      .dbb-form-row select {
        padding: 9px 10px;
        border-radius: 8px;
        border: 1px solid var(--border-color);
        background: #081524;
        color: #fff;
        font-size: 14px;
      }
      .dbb-btn {
        padding: 10px 18px;
        border-radius: 8px;
        border: 1px solid var(--border-color);
        background: transparent;
        font-weight: 700;
        font-size: 13px;
        cursor: pointer;
        white-space: nowrap;
      }
      .dbb-btn.primary {
        background: #111827;
        color: #fff;
        border: none;
      }
      .dbb-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .dbb-empty {
        margin-top: 10px;
        padding: 16px;
        text-align: center;
        opacity: 0.55;
        font-size: 14px;
      }
      .dbb-section-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 8px;
      }
      .dbb-kind-badge {
        display: inline-block;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.6px;
        padding: 2px 8px;
        border-radius: 999px;
        margin-bottom: 6px;
      }
      .dbb-kind-badge.standard {
        background: rgba(59, 130, 246, 0.14);
        color: #3b82f6;
      }
      .dbb-kind-badge.optional {
        background: rgba(217, 119, 6, 0.14);
        color: #d97706;
      }
      .dbb-section-head h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 800;
      }
      .dbb-remove-btn {
        border: none;
        background: transparent;
        color: #dc2626;
        font-size: 13px;
        cursor: pointer;
        white-space: nowrap;
      }
      .dbb-remove-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .dbb-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
        font-size: 13.5px;
      }
      .dbb-table th {
        text-align: left;
        opacity: 0.55;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 6px 8px;
        border-bottom: 1px solid var(--border-color);
      }
      .dbb-table td {
        padding: 7px 8px;
        border-bottom: 1px solid var(--border-color);
      }
      .dbb-short {
        color: #d97706;
        font-weight: 800;
      }
      .dbb-add-item-form {
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid var(--border-color);
      }
      .dbb-mode-toggle {
        display: inline-flex;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        overflow: hidden;
        margin-bottom: 4px;
      }
      .dbb-mode-toggle button {
        border: none;
        background: transparent;
        padding: 7px 14px;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
        opacity: 0.6;
      }
      .dbb-mode-toggle button.active {
        background: #111827;
        color: #fff;
        opacity: 1;
      }
    `}</style>
  );
}
