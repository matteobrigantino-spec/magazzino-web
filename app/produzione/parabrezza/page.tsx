"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

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

type MatrixRow = {
  id: string;
  model_boat: string;
  item_id: string;
  note: string | null;
};

type Kit = {
  id: string;
  item_id: string;
  matricola: string | null;
  unit_price: number | null;
  status: "stock" | "out";
  note: string | null;
  boat_id: string | null;
  boat_registration: string | null;
  received_at: string;
  out_at: string | null;
};

type Boat = {
  id: string;
  progressive_no: number | null;
  order_number: string;
  model_boat: string;
  requested_delivery_date: string | null;
};

type Requirement = {
  id: string;
  boat_id: string;
  item_id: string;
  kit_id: string | null;
  order_item_id: string | null;
};

function formatItDate(value: string | null) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatMoney(value: number | null) {
  if (value === null || value === undefined) return "";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
}

export default function ParabrezzaPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [newMappingModel, setNewMappingModel] = useState("");
  const [newMappingItemId, setNewMappingItemId] = useState("");
  const [savingMapping, setSavingMapping] = useState(false);

  const [kitItemId, setKitItemId] = useState("");
  const [kitMatricola, setKitMatricola] = useState("");
  const [kitPrice, setKitPrice] = useState("");
  const [kitNote, setKitNote] = useState("");
  const [kitFilter, setKitFilter] = useState("");
  const [savingKit, setSavingKit] = useState(false);
  const [busyKitId, setBusyKitId] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const [itemsRes, suppliersRes, optionsRes, matrixRes, kitsRes, boatsRes, reqRes] =
      await Promise.all([
        supabase
          .from("items")
          .select("id,supplier_id,code,supplier_code,description,stock")
          .order("description", { ascending: true }),
        supabase.from("suppliers").select("id,name").order("name", { ascending: true }),
        supabase
          .from("production_options")
          .select("id,option_type,name,active")
          .eq("option_type", "model")
          .eq("active", true)
          .order("name", { ascending: true }),
        supabase
          .from("production_windshield_matrix")
          .select("id,model_boat,item_id,note")
          .order("model_boat", { ascending: true }),
        supabase
          .from("windshield_kits")
          .select(
            "id,item_id,matricola,unit_price,status,note,boat_id,boat_registration,received_at,out_at"
          )
          .order("received_at", { ascending: false }),
        supabase
          .from("production_boats")
          .select("id,progressive_no,order_number,model_boat,requested_delivery_date")
          .order("requested_delivery_date", { ascending: true, nullsFirst: false }),
        supabase
          .from("production_boat_windshield")
          .select("id,boat_id,item_id,kit_id,order_item_id"),
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

    // La tabella e le funzioni dello STEP 25 potrebbero non essere ancora
    // state create sul database: in quel caso queste query falliscono da
    // sole senza bloccare il resto della pagina (mostriamo solo un avviso).
    if (matrixRes.error) {
      setErrorMessage(
        "Le tabelle del sistema parabrezza non risultano ancora create: fai girare STEP25_PARABREZZA_AUTOMATICO.sql su Supabase, poi ricarica questa pagina."
      );
      setLoading(false);
      return;
    }

    setMatrix(
      (matrixRes.data || []).map((row: any) => ({
        id: String(row.id),
        model_boat: String(row.model_boat || ""),
        item_id: String(row.item_id || ""),
        note: row.note ? String(row.note) : null,
      }))
    );

    setKits(
      (kitsRes.data || []).map((row: any) => ({
        id: String(row.id),
        item_id: String(row.item_id || ""),
        matricola: row.matricola ? String(row.matricola) : null,
        unit_price: row.unit_price === null || row.unit_price === undefined ? null : Number(row.unit_price),
        status: row.status === "out" ? "out" : "stock",
        note: row.note ? String(row.note) : null,
        boat_id: row.boat_id ? String(row.boat_id) : null,
        boat_registration: row.boat_registration ? String(row.boat_registration) : null,
        received_at: String(row.received_at || ""),
        out_at: row.out_at ? String(row.out_at) : null,
      }))
    );

    setBoats(
      (boatsRes.data || []).map((row: any) => ({
        id: String(row.id),
        progressive_no:
          row.progressive_no === null || row.progressive_no === undefined
            ? null
            : Number(row.progressive_no),
        order_number: String(row.order_number || ""),
        model_boat: String(row.model_boat || ""),
        requested_delivery_date: row.requested_delivery_date
          ? String(row.requested_delivery_date)
          : null,
      }))
    );

    setRequirements(
      (reqRes.data || []).map((row: any) => ({
        id: String(row.id),
        boat_id: String(row.boat_id || ""),
        item_id: String(row.item_id || ""),
        kit_id: row.kit_id ? String(row.kit_id) : null,
        order_item_id: row.order_item_id ? String(row.order_item_id) : null,
      }))
    );

    setLoading(false);
  }

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const supplierMap = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])),
    [suppliers]
  );
  const boatMap = useMemo(() => new Map(boats.map((boat) => [boat.id, boat])), [boats]);

  function itemLabel(itemId: string) {
    const item = itemMap.get(itemId);
    if (!item) return "Articolo non trovato";
    const supplierName = supplierMap.get(item.supplier_id) || "";
    const code = item.supplier_code || item.code;
    return `${supplierName ? supplierName + " · " : ""}${code} — ${item.description}`;
  }

  // Un modello puo' avere piu' articoli abbinati (STEP 29): non si
  // nasconde piu' dal picker un modello gia' mappato, si mostra solo
  // quanti articoli ha gia' cosi' e' chiaro che se ne sta aggiungendo
  // un altro.
  const articleCountByModel = useMemo(() => {
    const counts = new Map<string, number>();
    matrix.forEach((row) => {
      counts.set(row.model_boat, (counts.get(row.model_boat) || 0) + 1);
    });
    return counts;
  }, [matrix]);

  // Il fornitore dei parabrezza e' solo Paris Plast: i selettori di
  // articolo mostrano solo il suo catalogo, non tutto il magazzino.
  const parisPlastSupplierId = useMemo(
    () =>
      suppliers.find((supplier) => supplier.name.toUpperCase().includes("PARIS PLAST"))?.id ||
      "",
    [suppliers]
  );

  const parisPlastItems = useMemo(
    () =>
      parisPlastSupplierId
        ? items.filter((item) => item.supplier_id === parisPlastSupplierId)
        : items,
    [items, parisPlastSupplierId]
  );

  // Articoli Paris Plast gia' abbinati al modello scelto nel form: si
  // escludono dal picker per evitare di riproporre lo stesso articolo
  // due volte sullo stesso modello (bloccato comunque a livello DB).
  const alreadyMappedItemIds = useMemo(() => {
    if (!newMappingModel) return new Set<string>();
    return new Set(
      matrix.filter((row) => row.model_boat === newMappingModel).map((row) => row.item_id)
    );
  }, [matrix, newMappingModel]);

  const availableItemsForNewMapping = useMemo(
    () => parisPlastItems.filter((item) => !alreadyMappedItemIds.has(item.id)),
    [parisPlastItems, alreadyMappedItemIds]
  );

  const filteredItemsForKit = useMemo(() => {
    const term = kitFilter.trim().toLowerCase();
    if (!term) return parisPlastItems;
    return parisPlastItems.filter((item) => {
      const supplierName = (supplierMap.get(item.supplier_id) || "").toLowerCase();
      return (
        item.description.toLowerCase().includes(term) ||
        item.code.toLowerCase().includes(term) ||
        (item.supplier_code || "").toLowerCase().includes(term) ||
        supplierName.includes(term)
      );
    });
  }, [parisPlastItems, kitFilter, supplierMap]);

  async function addMapping() {
    setMessage("");
    setErrorMessage("");

    if (!newMappingModel || !newMappingItemId) {
      setErrorMessage("Scegli un modello e un articolo.");
      return;
    }

    setSavingMapping(true);

    const { error } = await supabase
      .from("production_windshield_matrix")
      .insert({ model_boat: newMappingModel, item_id: newMappingItemId });

    if (error) {
      setErrorMessage("Errore salvataggio mappatura: " + error.message);
      setSavingMapping(false);
      return;
    }

    // Aggancia subito anche i battelli di questo modello gia' in
    // produzione: senza questa chiamata resterebbero per sempre
    // senza parabrezza tracciato (la richiesta si crea solo alla
    // creazione del battello, non retroattivamente).
    const { data: backfilledCount, error: backfillError } = await supabase.rpc(
      "backfill_windshield_requirements_for_model",
      { p_model_boat: newMappingModel }
    );

    if (backfillError) {
      console.error("Errore aggancio battelli esistenti:", backfillError);
    }

    const boatsNote =
      !backfillError && backfilledCount
        ? ` Agganciati anche ${backfilledCount} battelli già in produzione di questo modello.`
        : "";

    setMessage(`Mappatura salvata: ${newMappingModel} → ${itemLabel(newMappingItemId)}.${boatsNote}`);
    setNewMappingModel("");
    setNewMappingItemId("");
    setSavingMapping(false);
    await loadData();
  }

  async function updateMappingItem(mappingId: string, itemId: string) {
    setMessage("");
    setErrorMessage("");

    const mapping = matrix.find((row) => row.id === mappingId);

    const { error } = await supabase
      .from("production_windshield_matrix")
      .update({ item_id: itemId, updated_at: new Date().toISOString() })
      .eq("id", mappingId);

    if (error) {
      setErrorMessage("Errore aggiornamento mappatura: " + error.message);
      return;
    }

    // Aggancia anche eventuali battelli di questo modello che per
    // qualche motivo fossero rimasti senza richiesta parabrezza
    // (non tocca quelli che ne hanno gia' una con l'articolo vecchio).
    if (mapping) {
      const { error: backfillError } = await supabase.rpc(
        "backfill_windshield_requirements_for_model",
        { p_model_boat: mapping.model_boat }
      );
      if (backfillError) {
        console.error("Errore aggancio battelli esistenti:", backfillError);
      }
    }

    await loadData();
  }

  async function deleteMapping(mappingId: string, modelBoat: string) {
    const ok = window.confirm(`Togliere la mappatura per "${modelBoat}"?`);
    if (!ok) return;

    setMessage("");
    setErrorMessage("");

    const { error } = await supabase
      .from("production_windshield_matrix")
      .delete()
      .eq("id", mappingId);

    if (error) {
      setErrorMessage("Errore eliminazione mappatura: " + error.message);
      return;
    }

    setMessage("Mappatura rimossa.");
    await loadData();
  }

  async function registerKit() {
    setMessage("");
    setErrorMessage("");

    if (!kitItemId) {
      setErrorMessage("Scegli l'articolo del parabrezza arrivato.");
      return;
    }

    setSavingKit(true);

    const priceNumber = kitPrice.trim() ? Number(kitPrice.trim().replace(",", ".")) : null;

    const { data: kitId, error } = await supabase.rpc("create_windshield_stock_kit", {
      p_item_id: kitItemId,
      p_matricola: kitMatricola.trim() || null,
      p_unit_price: priceNumber,
      p_note: kitNote.trim() || null,
    });

    if (error || !kitId) {
      setErrorMessage("Errore registrazione arrivo: " + (error?.message || ""));
      setSavingKit(false);
      return;
    }

    const { data: assignedReqId, error: priorityError } = await supabase.rpc(
      "assign_windshield_stock_kit_by_priority",
      { p_kit_id: kitId }
    );

    if (priorityError) {
      console.error("Errore assegnazione automatica parabrezza:", priorityError);
    }

    if (assignedReqId) {
      setMessage("Arrivo registrato e assegnato subito al battello in attesa con la consegna più vicina.");
    } else {
      setMessage("Arrivo registrato in giacenza. Nessun battello in attesa di questo articolo al momento.");
    }

    setKitMatricola("");
    setKitPrice("");
    setKitNote("");
    setSavingKit(false);
    await loadData();
  }

  async function deleteKit(kit: Kit) {
    const ok = window.confirm("Eliminare questo kit dalla giacenza?");
    if (!ok) return;

    setMessage("");
    setErrorMessage("");
    setBusyKitId(kit.id);

    const { error } = await supabase.rpc("delete_windshield_stock_kit", { p_kit_id: kit.id });

    if (error) {
      setErrorMessage("Errore eliminazione kit: " + error.message);
      setBusyKitId("");
      return;
    }

    setMessage("Kit eliminato dalla giacenza.");
    setBusyKitId("");
    await loadData();
  }

  async function releaseKit(kit: Kit) {
    const ok = window.confirm("Liberare questo parabrezza dal battello a cui è assegnato?");
    if (!ok) return;

    setMessage("");
    setErrorMessage("");
    setBusyKitId(kit.id);

    const { error } = await supabase.rpc("unassign_windshield_kit_from_boat", {
      p_kit_id: kit.id,
    });

    if (error) {
      setErrorMessage("Errore liberazione kit: " + error.message);
      setBusyKitId("");
      return;
    }

    setMessage("Kit liberato: torna in giacenza.");
    setBusyKitId("");
    await loadData();
  }

  const stockKits = useMemo(() => kits.filter((kit) => kit.status === "stock"), [kits]);
  const outKits = useMemo(() => kits.filter((kit) => kit.status === "out"), [kits]);

  const statusRows = useMemo(() => {
    return requirements
      .map((req) => {
        const boat = boatMap.get(req.boat_id);
        if (!boat) return null;
        const status = req.kit_id ? "assegnato" : req.order_item_id ? "ordine" : "da_ordinare";
        return { req, boat, status };
      })
      .filter((row): row is { req: Requirement; boat: Boat; status: string } => row !== null)
      .sort((a, b) => {
        const ad = a.boat.requested_delivery_date;
        const bd = b.boat.requested_delivery_date;
        if (ad && bd) {
          if (ad !== bd) return ad < bd ? -1 : 1;
        } else if (ad || bd) {
          return ad ? -1 : 1;
        }
        return (a.boat.progressive_no ?? Infinity) - (b.boat.progressive_no ?? Infinity);
      });
  }, [requirements, boatMap]);

  if (loading) {
    return (
      <div className="pbz-page">
        <div className="pbz-loading">Caricamento...</div>
        <Styles />
      </div>
    );
  }

  return (
    <div className="pbz-page">
      <section className="pbz-hero">
        <div>
          <div className="pbz-eyebrow">PRODUZIONE</div>
          <h1>Parabrezza</h1>
          <p>
            Ogni modello di battello ha uno o più articoli parabrezza abbinati: quando crei un
            battello, ogni pezzo si assegna da solo (in giacenza o dall'ordine aperto), dando
            la precedenza a chi consegna prima. Non devi scegliere nulla a mano.
          </p>
        </div>
        <div className="pbz-actions">
          <Link href="/produzione" className="pbz-btn secondary">
            ← Produzione
          </Link>
        </div>
      </section>

      {(message || errorMessage) && (
        <div className={errorMessage ? "pbz-message error" : "pbz-message success"}>
          {errorMessage || message}
        </div>
      )}

      <section className="pbz-card">
        <div className="pbz-eyebrow">MAPPA MODELLI</div>
        <h2>Modello battello → articolo parabrezza</h2>

        {matrix.length > 0 && (
          <div className="pbz-matrix-list">
            {matrix.map((row) => (
              <div className="pbz-matrix-row" key={row.id}>
                <strong>{row.model_boat}</strong>
                <select
                  value={row.item_id}
                  onChange={(e) => updateMappingItem(row.id, e.target.value)}
                >
                  {parisPlastItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {itemLabel(item.id)}
                    </option>
                  ))}
                </select>
                <button type="button" className="danger" onClick={() => deleteMapping(row.id, row.model_boat)}>
                  Rimuovi
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="pbz-matrix-add">
          <select value={newMappingModel} onChange={(e) => setNewMappingModel(e.target.value)}>
            <option value="">Scegli modello...</option>
            {modelOptions.map((option) => {
              const count = articleCountByModel.get(option.name) || 0;
              return (
                <option key={option.id} value={option.name}>
                  {option.name}
                  {count > 0
                    ? ` (${count} articol${count === 1 ? "o" : "i"} già abbinat${count === 1 ? "o" : "i"})`
                    : ""}
                </option>
              );
            })}
          </select>
          <select value={newMappingItemId} onChange={(e) => setNewMappingItemId(e.target.value)}>
            <option value="">Articolo parabrezza...</option>
            {availableItemsForNewMapping.map((item) => (
              <option key={item.id} value={item.id}>
                {itemLabel(item.id)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addMapping}
            disabled={savingMapping || !newMappingModel || !newMappingItemId}
          >
            {savingMapping ? "Salvataggio..." : "+ Aggiungi mappatura"}
          </button>
        </div>
        {newMappingModel && availableItemsForNewMapping.length === 0 && (
          <p className="pbz-hint">
            Tutti gli articoli Paris Plast sono già abbinati a questo modello.
          </p>
        )}
      </section>

      <section className="pbz-card">
        <div className="pbz-eyebrow">MAGAZZINO PARABREZZA</div>
        <h2>Registra un arrivo</h2>

        <div className="pbz-kit-form">
          <input
            className="pbz-kit-filter"
            value={kitFilter}
            onChange={(e) => setKitFilter(e.target.value)}
            placeholder="Cerca articolo per fornitore, codice o descrizione..."
          />
          <select value={kitItemId} onChange={(e) => setKitItemId(e.target.value)}>
            <option value="">Seleziona articolo...</option>
            {filteredItemsForKit.map((item) => (
              <option key={item.id} value={item.id}>
                {itemLabel(item.id)} (giacenza: {item.stock})
              </option>
            ))}
          </select>
          <input
            value={kitMatricola}
            onChange={(e) => setKitMatricola(e.target.value)}
            placeholder="Matricola / riferimento (facoltativo)"
          />
          <input
            value={kitPrice}
            onChange={(e) => setKitPrice(e.target.value)}
            placeholder="Prezzo (facoltativo)"
            inputMode="decimal"
          />
          <input
            value={kitNote}
            onChange={(e) => setKitNote(e.target.value)}
            placeholder="Nota (facoltativa)"
          />
          <button type="button" onClick={registerKit} disabled={savingKit || !kitItemId}>
            {savingKit ? "Registrazione..." : "Registra in giacenza"}
          </button>
        </div>
      </section>

      <section className="pbz-card">
        <div className="pbz-eyebrow">GIACENZA</div>
        <h2>Parabrezza in giacenza ({stockKits.length})</h2>

        {stockKits.length === 0 ? (
          <p className="pbz-hint">Nessun parabrezza in giacenza al momento.</p>
        ) : (
          <table className="pbz-table">
            <thead>
              <tr>
                <th>Articolo</th>
                <th>Matricola</th>
                <th>Prezzo</th>
                <th>Arrivato il</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stockKits.map((kit) => (
                <tr key={kit.id}>
                  <td>{itemLabel(kit.item_id)}</td>
                  <td>{kit.matricola || "—"}</td>
                  <td>{formatMoney(kit.unit_price) || "—"}</td>
                  <td>{kit.received_at ? formatItDate(kit.received_at.slice(0, 10)) : "—"}</td>
                  <td>{kit.note || "—"}</td>
                  <td>
                    <button
                      type="button"
                      className="danger"
                      disabled={busyKitId === kit.id}
                      onClick={() => deleteKit(kit)}
                    >
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="pbz-card">
        <div className="pbz-eyebrow">STATO BATTELLI</div>
        <h2>Parabrezza per battello ({statusRows.length})</h2>

        {statusRows.length === 0 ? (
          <p className="pbz-hint">
            Nessun battello ha ancora un parabrezza tracciato (mappa i modelli qui sopra).
          </p>
        ) : (
          <table className="pbz-table">
            <thead>
              <tr>
                <th>Consegna</th>
                <th>N. ordine</th>
                <th>Modello</th>
                <th>Articolo</th>
                <th>Stato</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {statusRows.map(({ req, boat, status }) => {
                const kit = req.kit_id ? kits.find((k) => k.id === req.kit_id) : null;
                return (
                  <tr key={req.id}>
                    <td>{formatItDate(boat.requested_delivery_date) || "—"}</td>
                    <td>{boat.order_number}</td>
                    <td>{boat.model_boat}</td>
                    <td>{itemLabel(req.item_id)}</td>
                    <td>
                      <span className={`pbz-status ${status}`}>
                        {status === "assegnato"
                          ? "ASSEGNATO"
                          : status === "ordine"
                          ? "IN ORDINE"
                          : "DA ORDINARE"}
                      </span>
                    </td>
                    <td>
                      {kit && (
                        <button
                          type="button"
                          className="danger"
                          disabled={busyKitId === kit.id}
                          onClick={() => releaseKit(kit)}
                        >
                          Libera
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {outKits.length > 0 && (
        <section className="pbz-card">
          <div className="pbz-eyebrow">STORICO</div>
          <h2>Parabrezza già assegnati ({outKits.length})</h2>
          <table className="pbz-table">
            <thead>
              <tr>
                <th>Articolo</th>
                <th>Matricola</th>
                <th>N. ordine battello</th>
                <th>Assegnato il</th>
              </tr>
            </thead>
            <tbody>
              {outKits.map((kit) => (
                <tr key={kit.id}>
                  <td>{itemLabel(kit.item_id)}</td>
                  <td>{kit.matricola || "—"}</td>
                  <td>{kit.boat_registration || "—"}</td>
                  <td>{kit.out_at ? formatItDate(kit.out_at.slice(0, 10)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Styles />
    </div>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      .pbz-page { width:100%; max-width:1200px; margin:0 auto; color:#f8fafc; }
      .pbz-loading { padding:60px; text-align:center; color:#7388a3; font-size:11px; }
      .pbz-hero { padding:21px 22px; display:flex; align-items:center; justify-content:space-between; gap:18px; flex-wrap:wrap; border:1px solid rgba(59,130,246,.24); border-radius:16px; background:linear-gradient(135deg,#0d1d31,#071321); }
      .pbz-eyebrow { color:#60a5fa; font-size:9px; font-weight:950; letter-spacing:1.45px; }
      .pbz-hero h1 { margin:5px 0 0; font-size:27px; font-weight:950; letter-spacing:-.6px; }
      .pbz-hero p { max-width:640px; margin:6px 0 0; color:#91a4bc; font-size:10px; line-height:1.55; }
      .pbz-actions { display:flex; align-items:center; gap:7px; }
      .pbz-btn { min-height:38px; padding:0 12px; display:inline-flex; align-items:center; border-radius:8px; text-decoration:none; font-size:9px; font-weight:900; cursor:pointer; border:0; }
      .pbz-btn.secondary { border:1px solid rgba(148,163,184,.22); background:rgba(255,255,255,.035); color:#e2e8f0; }
      .pbz-message { margin-top:11px; padding:11px 13px; border-radius:9px; font-size:10px; font-weight:800; }
      .pbz-message.success { border:1px solid rgba(34,197,94,.28); background:rgba(34,197,94,.08); color:#86efac; }
      .pbz-message.error { border:1px solid rgba(239,68,68,.28); background:rgba(239,68,68,.08); color:#fca5a5; }
      .pbz-card { margin-top:11px; padding:16px; border:1px solid rgba(148,163,184,.15); border-radius:13px; background:#0b1828; }
      .pbz-card h2 { margin:4px 0 0; font-size:15px; }
      .pbz-hint { margin-top:10px; color:#7388a3; font-size:9px; }
      .pbz-matrix-list { margin-top:12px; display:flex; flex-direction:column; gap:6px; }
      .pbz-matrix-row { padding:8px 10px; display:grid; grid-template-columns:140px 1fr auto; align-items:center; gap:8px; border:1px solid rgba(148,163,184,.13); border-radius:8px; background:rgba(255,255,255,.02); }
      .pbz-matrix-row strong { color:#93c5fd; font-size:10px; }
      .pbz-matrix-add { margin-top:12px; display:grid; grid-template-columns:1fr 1.6fr auto; gap:8px; }
      .pbz-kit-form { margin-top:12px; display:grid; grid-template-columns:1fr 1.6fr 0.8fr 0.6fr 1fr auto; gap:8px; }
      .pbz-kit-filter { grid-column:1; }
      .pbz-page select, .pbz-page input {
        min-height:38px; box-sizing:border-box; padding:0 10px; border:1px solid rgba(148,163,184,.19);
        border-radius:8px; outline:none; background:#081524; color:#fff; font-size:10px;
      }
      .pbz-matrix-add button, .pbz-kit-form button {
        min-height:38px; padding:0 12px; border:1px solid rgba(96,165,250,.32); border-radius:8px;
        background:rgba(59,130,246,.14); color:#bfdbfe; cursor:pointer; font-size:9px; font-weight:900; white-space:nowrap;
      }
      .pbz-matrix-add button:disabled, .pbz-kit-form button:disabled { opacity:.5; cursor:default; }
      button.danger { border:1px solid rgba(239,68,68,.28); background:rgba(239,68,68,.08); color:#fca5a5; padding:5px 9px; border-radius:6px; cursor:pointer; font-size:8px; font-weight:900; }
      button.danger:disabled { opacity:.5; cursor:wait; }
      .pbz-table { margin-top:12px; width:100%; border-collapse:collapse; font-size:9px; }
      .pbz-table th { padding:6px 8px; background:rgba(255,255,255,.03); color:#86a0bf; text-align:left; font-size:7px; font-weight:950; letter-spacing:.5px; text-transform:uppercase; }
      .pbz-table td { padding:7px 8px; border-top:1px solid rgba(148,163,184,.09); }
      .pbz-status { padding:3px 7px; border-radius:999px; font-size:8px; font-weight:900; }
      .pbz-status.assegnato { background:rgba(34,197,94,.12); color:#86efac; }
      .pbz-status.ordine { background:rgba(59,130,246,.14); color:#93c5fd; }
      .pbz-status.da_ordinare { background:rgba(249,115,22,.14); color:#fdba74; }
      @media(max-width:900px){ .pbz-matrix-add,.pbz-kit-form{grid-template-columns:1fr} .pbz-matrix-row{grid-template-columns:1fr} }
    `}</style>
  );
}
