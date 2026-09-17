"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { selectProductionRows } from "../../lib/productionPdf";
import { supabase } from "../../lib/supabaseClient";

type Department = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
};

type Boat = {
  id: string;
  progressive_no: number;
  order_number: string;
  model_boat: string;
  hull: string;
  stringers: string;
  deck: string;
  accessories: string;
  note: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
};

type Step = {
  id: string;
  boat_id: string;
  department_id: string;
  status: string;
  entered_at: string;
  started_at: string | null;
  completed_at: string | null;
  current_note: string | null;
};

type ProductionOption = {
  id: string;
  option_type: "model" | "color";
  name: string;
  active: boolean;
  sort_order: number;
};

const statusLabel: Record<string, string> = {
  queued: "DA INIZIARE",
  working: "IN LAVORAZIONE",
  waiting: "IN ATTESA",
  blocked: "BLOCCATO",
  completed: "COMPLETATO",
};

export default function ProductionPage() {
  const router = useRouter();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [productionOptions, setProductionOptions] = useState<ProductionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [pdfFrom, setPdfFrom] = useState("1");
  const [pdfTo, setPdfTo] = useState("");
  const [pdfLogo, setPdfLogo] = useState("");
  const [pdfLogoLoading, setPdfLogoLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");

  useEffect(() => {
    async function loadPdfLogo() {
      const { data, error } = await supabase
        .from("production_settings")
        .select("pdf_logo")
        .eq("id", 1)
        .maybeSingle();

      if (!error && data) {
        setPdfLogo(data.pdf_logo || "");
      }

      setPdfLogoLoading(false);
    }

    loadPdfLogo();
  }, []);

  async function downloadProductionPdf() {
    setPdfError("");
    setPdfBusy(true);
    try {
      const selected = selectProductionRows(activeBoats, pdfFrom, pdfTo);
      if (!pdfLogo) throw new Error("Carica il logo aziendale prima di scaricare il PDF.");
      const { buildProductionPdf } = await import("../../lib/productionPdf");
      const rows = selected.map((boat, index) => {
        const step = currentStepMap.get(boat.id);
        const department = step ? depMap.get(step.department_id) : null;
        const notes = [boat.note, step?.current_note && step.current_note !== boat.note
          ? `Nota reparto: ${step.current_note}` : null].filter(Boolean).join("\n");
        return {
          row: Number(pdfFrom) + index, progressive: boat.progressive_no,
          order: boat.order_number, model: boat.model_boat, hull: boat.hull,
          stringers: boat.stringers, deck: boat.deck, accessories: boat.accessories,
          department: department?.name || "-", status: statusLabel[step?.status || "queued"] || step?.status || "-",
          departmentDays: step ? daysFrom(step.entered_at) : 0,
          totalDays: daysFrom(boat.created_at), note: notes,
        };
      });
      const doc = buildProductionPdf(rows, pdfLogo);
      await doc.save(`produzione_righe_${Number(pdfFrom)}-${Number(pdfTo)}.pdf`, { returnPromise: true });
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "Impossibile creare il PDF. Riprova.");
    } finally { setPdfBusy(false); }
  }

  const [progressive, setProgressive] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [modelBoat, setModelBoat] = useState("");
  const [hull, setHull] = useState("");
  const [stringers, setStringers] = useState("");
  const [deck, setDeck] = useState("");
  const [accessories, setAccessories] = useState("Standard");
  const [note, setNote] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const [depRes, boatRes, stepRes, nextRes, optionsRes] = await Promise.all([
      supabase
        .from("production_departments")
        .select("id,name,sort_order,active")
        .order("sort_order", { ascending: true }),
      supabase
        .from("production_boats")
        .select("id,progressive_no,order_number,model_boat,hull,stringers,deck,accessories,note,status,created_at,completed_at")
        .order("progressive_no", { ascending: false }),
      supabase
        .from("production_department_steps")
        .select("id,boat_id,department_id,status,entered_at,started_at,completed_at,current_note"),
      supabase.rpc("next_production_progressive"),
      supabase
        .from("production_options")
        .select("id,option_type,name,active,sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    const firstError =
      depRes.error || boatRes.error || stepRes.error || nextRes.error || optionsRes.error;

    if (firstError) {
      setErrorMessage("Errore caricamento produzione: " + firstError.message);
      setLoading(false);
      return;
    }

    setDepartments(
      (depRes.data || []).map((row: any) => ({
        id: String(row.id),
        name: String(row.name || ""),
        sort_order: Number(row.sort_order || 0),
        active: row.active !== false,
      }))
    );

    setBoats(
      (boatRes.data || []).map((row: any) => ({
        id: String(row.id),
        progressive_no: Number(row.progressive_no || 0),
        order_number: String(row.order_number || ""),
        model_boat: String(row.model_boat || ""),
        hull: String(row.hull || ""),
        stringers: String(row.stringers || ""),
        deck: String(row.deck || ""),
        accessories: String(row.accessories || ""),
        note: row.note ? String(row.note) : null,
        status: String(row.status || ""),
        created_at: String(row.created_at || ""),
        completed_at: row.completed_at ? String(row.completed_at) : null,
      }))
    );

    setSteps(
      (stepRes.data || []).map((row: any) => ({
        id: String(row.id),
        boat_id: String(row.boat_id),
        department_id: String(row.department_id),
        status: String(row.status || ""),
        entered_at: String(row.entered_at || ""),
        started_at: row.started_at ? String(row.started_at) : null,
        completed_at: row.completed_at ? String(row.completed_at) : null,
        current_note: row.current_note ? String(row.current_note) : null,
      }))
    );

    setProductionOptions(
      (optionsRes.data || []).map((row: any) => ({
        id: String(row.id),
        option_type: String(row.option_type) as "model" | "color",
        name: String(row.name || ""),
        active: row.active !== false,
        sort_order: Number(row.sort_order || 0),
      }))
    );

    if (!progressive) {
      setProgressive(String(Number(nextRes.data || 1)));
    }

    setLoading(false);
  }

  const depMap = useMemo(
    () => new Map(departments.map((dep) => [dep.id, dep])),
    [departments]
  );

  const modelOptions = useMemo(
    () => productionOptions.filter((option) => option.option_type === "model"),
    [productionOptions]
  );

  const colorOptions = useMemo(
    () => productionOptions.filter((option) => option.option_type === "color"),
    [productionOptions]
  );

  const currentStepMap = useMemo(() => {
    const result = new Map<string, Step>();

    for (const step of steps) {
      if (step.status === "completed") continue;

      const current = result.get(step.boat_id);

      if (!current) {
        result.set(step.boat_id, step);
        continue;
      }

      const currentOrder = depMap.get(current.department_id)?.sort_order ?? -1;
      const nextOrder = depMap.get(step.department_id)?.sort_order ?? -1;

      if (nextOrder > currentOrder) {
        result.set(step.boat_id, step);
      }
    }

    return result;
  }, [steps, depMap]);

  const activeBoats = boats.filter((boat) => boat.status === "active");
  const blockedCount = activeBoats.filter(
    (boat) => currentStepMap.get(boat.id)?.status === "blocked"
  ).length;
  const waitingCount = activeBoats.filter(
    (boat) => currentStepMap.get(boat.id)?.status === "waiting"
  ).length;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const completedThisMonth = boats.filter(
    (boat) =>
      boat.status === "completed" &&
      boat.completed_at?.slice(0, 7) === currentMonth
  ).length;

  const departmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const step of steps) {
      if (step.status !== "completed") {
        counts.set(step.department_id, (counts.get(step.department_id) || 0) + 1);
      }
    }
    return counts;
  }, [steps]);

  function daysFrom(value: string) {
    const start = new Date(value).getTime();
    if (!Number.isFinite(start)) return 0;
    return Math.max(0, Math.floor((Date.now() - start) / 86400000));
  }

  async function createBoat() {
    setMessage("");
    setErrorMessage("");

    if (!orderNumber.trim() || !modelBoat.trim()) {
      setErrorMessage("Numero d'ordine e Modello battello sono obbligatori.");
      return;
    }

    if (!hull || !stringers || !deck) {
      setErrorMessage("Seleziona il colore di Carena, Ragno/Longheroni e Coperta.");
      return;
    }

    setSaving(true);

    const operator =
      localStorage.getItem("magazzino_display_name") ||
      localStorage.getItem("magazzino_user") ||
      "Matteo";

    const { error } = await supabase.rpc("create_production_boat", {
      p_progressive_no: Number(progressive || 0),
      p_order_number: orderNumber.trim(),
      p_model_boat: modelBoat.trim(),
      p_hull: hull.trim(),
      p_stringers: stringers.trim(),
      p_deck: deck.trim(),
      p_accessories: accessories.trim(),
      p_note: note.trim() || null,
      p_created_by: operator,
    });

    if (error) {
      setErrorMessage("Errore creazione battello: " + error.message);
      setSaving(false);
      return;
    }

    setMessage(`Ordine ${orderNumber.trim()} inserito in produzione.`);
    setOrderNumber("");
    setModelBoat("");
    setHull("");
    setStringers("");
    setDeck("");
    setAccessories("Standard");
    setNote("");
    setShowNew(false);
    setSaving(false);
    setProgressive("");
    await loadData();
  }

  if (loading) {
    return (
      <div className="prod-loading">
        Caricamento Produzione...
        <Styles />
      </div>
    );
  }

  return (
    <div className="prod-page">
      <section className="prod-hero">
        <div>
          <div className="prod-eyebrow">CONTROLLO PRODUZIONE</div>
          <h1>Produzione</h1>
          <p>
            Segui ogni battello con lo stesso Numero d&apos;Ordine dal primo
            reparto fino al completamento.
          </p>
        </div>

        <div className="prod-actions">
          <Link href="/produzione/analisi" className="prod-btn secondary">
            Medie mensili
          </Link>
          <Link href="/produzione/configurazioni" className="prod-btn secondary">
            Configurazioni
          </Link>
          <Link href="/produzione/reparti" className="prod-btn secondary">
            Gestisci reparti
          </Link>
          <button
            type="button"
            className="prod-btn primary"
            onClick={() => setShowNew((value) => !value)}
          >
            + Nuovo battello
          </button>
        </div>
      </section>

      {(message || errorMessage) && (
        <div className={errorMessage ? "prod-message error" : "prod-message success"}>
          {errorMessage || message}
        </div>
      )}

      <section className="prod-kpis">
        <Kpi label="In produzione" value={activeBoats.length} />
        <Kpi label="In attesa" value={waitingCount} tone="waiting" />
        <Kpi label="Bloccati" value={blockedCount} tone="blocked" />
        <Kpi label="Completati questo mese" value={completedThisMonth} tone="done" />
      </section>

      {showNew && (
        <section className="prod-new-card">
          <div className="prod-section-head">
            <div>
              <div className="prod-eyebrow">NUOVO ORDINE DI PRODUZIONE</div>
              <h2>Inserisci il battello</h2>
            </div>
          </div>

          {(modelOptions.length === 0 || colorOptions.length === 0) && (
            <div className="prod-config-warning">
              Prima di inserire il battello, aggiungi almeno un Modello e un Colore in
              <Link href="/produzione/configurazioni"> Configurazioni Produzione</Link>.
            </div>
          )}

          <div className="prod-form-grid">
            <Field label="Ordine progressivo">
              <input
                type="number"
                min="1"
                value={progressive}
                onChange={(e) => setProgressive(e.target.value)}
              />
            </Field>

            <Field label="Numero d'ordine *">
              <input
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="Es. S2264"
              />
            </Field>

            <Field label="Modello battello *">
              <select
                value={modelBoat}
                onChange={(e) => setModelBoat(e.target.value)}
              >
                <option value="">Seleziona modello...</option>
                {modelOptions.map((option) => (
                  <option key={option.id} value={option.name}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Carena">
              <select
                value={hull}
                onChange={(e) => setHull(e.target.value)}
              >
                <option value="">Seleziona colore...</option>
                {colorOptions.map((option) => (
                  <option key={option.id} value={option.name}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Ragno / Longheroni">
              <select
                value={stringers}
                onChange={(e) => setStringers(e.target.value)}
              >
                <option value="">Seleziona colore...</option>
                {colorOptions.map((option) => (
                  <option key={option.id} value={option.name}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Coperta">
              <select
                value={deck}
                onChange={(e) => setDeck(e.target.value)}
              >
                <option value="">Seleziona colore...</option>
                {colorOptions.map((option) => (
                  <option key={option.id} value={option.name}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Accessori">
              <input
                value={accessories}
                onChange={(e) => setAccessories(e.target.value)}
              />
            </Field>

            <Field label="Note" wide>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Es. Gruppo consolle Selva"
              />
            </Field>
          </div>

          <div className="prod-form-actions">
            <button
              type="button"
              className="prod-btn secondary"
              onClick={() => setShowNew(false)}
              disabled={saving}
            >
              Annulla
            </button>
            <button
              type="button"
              className="prod-btn primary"
              onClick={createBoat}
              disabled={
                saving ||
                modelOptions.length === 0 ||
                colorOptions.length === 0
              }
            >
              {saving ? "Salvataggio..." : "Inserisci in produzione"}
            </button>
          </div>
        </section>
      )}

      <section className="prod-section">
        <div className="prod-section-head">
          <div>
            <div className="prod-eyebrow">REPARTI</div>
            <h2>Programmi di reparto</h2>
            <p>
              Ogni reparto vede solo i battelli che deve lavorare. Quando termina,
              il battello passa automaticamente al reparto successivo.
            </p>
          </div>
        </div>

        <div className="prod-departments">
          {departments.filter((dep) => dep.active).map((dep) => (
            <button
              type="button"
              key={dep.id}
              className="prod-department-card"
              onClick={() => router.push(`/produzione/reparti/${dep.id}`)}
            >
              <div className="prod-department-icon">P</div>
              <div className="prod-department-copy">
                <span>REPARTO {dep.sort_order}</span>
                <strong>{dep.name}</strong>
                <small>{departmentCounts.get(dep.id) || 0} battelli da gestire</small>
              </div>
              <div className="prod-arrow">→</div>
            </button>
          ))}

          {departments.filter((dep) => dep.active).length === 0 && (
            <div className="prod-empty">
              Nessun reparto attivo. Apri “Gestisci reparti”.
            </div>
          )}
        </div>
      </section>

      <section className="prod-section">
        <div className="prod-section-head horizontal">
          <div>
            <div className="prod-eyebrow">AVANZAMENTO</div>
            <h2>Battelli in produzione</h2>
          </div>
          <span className="prod-count">{activeBoats.length}</span>
        </div>

        <div className="prod-pdf-panel">
          <strong>Scarica le righe in PDF</strong>
          <p id="pdf-range-help">Usa i numeri della colonna “Riga” della tabella qui sotto, non quelli di “Prog.”. Gli estremi sono inclusi.</p>
          <div className="prod-pdf-controls">
            <label>Da riga
              <input type="number" min="1" max={activeBoats.length} step="1" value={pdfFrom}
                aria-describedby="pdf-range-help" disabled={pdfBusy} onChange={(e) => setPdfFrom(e.target.value)} />
            </label>
            <label>A riga
              <input type="number" min="1" max={activeBoats.length} step="1" value={pdfTo}
                aria-describedby="pdf-range-help" placeholder={String(activeBoats.length)} disabled={pdfBusy} onChange={(e) => setPdfTo(e.target.value)} />
            </label>
            <button type="button" className="prod-btn secondary" disabled={pdfBusy || !activeBoats.length}
              onClick={() => { setPdfFrom("1"); setPdfTo(String(activeBoats.length)); }}>Tutte le righe</button>
            {pdfLogo && <img src={pdfLogo} alt="Logo aziendale per il PDF" className="prod-pdf-logo" />}
            <button type="button" className="prod-btn primary" onClick={downloadProductionPdf}
              disabled={pdfBusy || pdfLogoLoading || !pdfLogo || !activeBoats.length}>
              {pdfBusy ? "Creazione PDF..." : "Scarica PDF"}
            </button>
          </div>
          {!pdfLogoLoading && !pdfLogo && (
            <p role="status" className="prod-pdf-logo-missing">
              Nessun logo configurato — <Link href="/produzione/configurazioni">caricalo una volta in Configurazioni</Link> e resterà attivo su ogni dispositivo.
            </p>
          )}
          {pdfError && <div role="alert" className="prod-message error">{pdfError}</div>}
        </div>

        <div className="prod-table-wrap">
          <table className="prod-table">
            <thead>
              <tr>
                <th>Riga</th>
                <th>Prog.</th>
                <th>N° ordine</th>
                <th>Modello</th>
                <th>Reparto attuale</th>
                <th>Stato</th>
                <th>Giorni reparto</th>
                <th>Giorni totali</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {activeBoats.length === 0 ? (
                <tr>
                  <td colSpan={9} className="prod-empty-cell">
                    Nessun battello attualmente in produzione.
                  </td>
                </tr>
              ) : (
                activeBoats.map((boat, rowIndex) => {
                  const step = currentStepMap.get(boat.id);
                  const dep = step ? depMap.get(step.department_id) : null;

                  return (
                    <tr
                      key={boat.id}
                      onClick={() => router.push(`/produzione/${boat.id}`)}
                      className="prod-click-row"
                    >
                      <td>{rowIndex + 1}</td>
                      <td><strong>{boat.progressive_no}</strong></td>
                      <td><span className="prod-order">{boat.order_number}</span></td>
                      <td>{boat.model_boat}</td>
                      <td>{dep?.name || "—"}</td>
                      <td>
                        <StatusBadge status={step?.status || "queued"} />
                      </td>
                      <td>{step ? daysFrom(step.entered_at) : 0} gg</td>
                      <td>{daysFrom(boat.created_at)} gg</td>
                      <td className="prod-note-cell">{step?.current_note || boat.note || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Styles />
    </div>
  );
}

function Kpi({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className={`prod-kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`prod-field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`prod-status ${status}`}>
      {statusLabel[status] || status.toUpperCase()}
    </span>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      .prod-pdf-panel { margin: 12px 0; padding: 16px; border: 1px solid #31445c; border-radius: 12px; background: #0b192a; }
      .prod-pdf-panel p { font-size: 12px; color: #b7c7d9; margin: 8px 0; }
      .prod-pdf-controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; }
      .prod-pdf-controls label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
      .prod-pdf-controls input[type="number"] { width: 100px; padding: 10px; background: #14283f; color: white; border: 1px solid #51637a; border-radius: 8px; }
      .prod-pdf-logo { width: 100px; height: 45px; object-fit: contain; background: white; border-radius: 6px; }
      .prod-pdf-logo-missing { color: #fbbf24; }
      .prod-pdf-logo-missing a { color: #93c5fd; font-weight: 800; }
      .prod-page {
        width: 100%;
        max-width: 1500px;
        margin: 0 auto;
        color: #f8fafc;
      }

      .prod-loading {
        min-height: 55vh;
        display: grid;
        place-items: center;
        color: #dbeafe;
        font-weight: 850;
      }

      .prod-hero {
        padding: 22px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        border: 1px solid rgba(59,130,246,.25);
        border-radius: 17px;
        background:
          radial-gradient(circle at 85% 0%, rgba(37,99,235,.20), transparent 32%),
          linear-gradient(135deg,#0d1d31,#071321);
      }

      .prod-eyebrow {
        color: #60a5fa;
        font-size: 9px;
        font-weight: 950;
        letter-spacing: 1.55px;
      }

      .prod-hero h1 {
        margin: 6px 0 0;
        font-size: 34px;
        line-height: 1;
        font-weight: 950;
        letter-spacing: -1px;
      }

      .prod-hero p,
      .prod-section-head p {
        max-width: 760px;
        margin: 8px 0 0;
        color: #91a4bc;
        font-size: 11px;
        line-height: 1.55;
      }

      .prod-actions,
      .prod-form-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }

      .prod-btn {
        min-height: 39px;
        padding: 0 13px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 9px;
        cursor: pointer;
        text-decoration: none;
        font-size: 10px;
        font-weight: 900;
      }

      .prod-btn.primary {
        border: 1px solid #2563eb;
        background: #2563eb;
        color: white;
      }

      .prod-btn.secondary {
        border: 1px solid rgba(148,163,184,.22);
        background: rgba(255,255,255,.035);
        color: #dce8f5;
      }

      .prod-btn:disabled {
        opacity: .5;
        cursor: wait;
      }

      .prod-message {
        margin-top: 12px;
        padding: 11px 13px;
        border-radius: 9px;
        font-size: 11px;
        font-weight: 800;
      }

      .prod-message.success {
        border: 1px solid rgba(34,197,94,.28);
        background: rgba(34,197,94,.08);
        color: #86efac;
      }

      .prod-message.error {
        border: 1px solid rgba(239,68,68,.28);
        background: rgba(239,68,68,.08);
        color: #fca5a5;
      }

      .prod-kpis {
        margin-top: 12px;
        display: grid;
        grid-template-columns: repeat(4,minmax(0,1fr));
        gap: 10px;
      }

      .prod-kpi {
        padding: 15px;
        border: 1px solid rgba(148,163,184,.15);
        border-radius: 12px;
        background: #0b192a;
      }

      .prod-kpi span,
      .prod-kpi strong {
        display: block;
      }

      .prod-kpi span {
        color: #8195ae;
        font-size: 8px;
        font-weight: 950;
        letter-spacing: .8px;
        text-transform: uppercase;
      }

      .prod-kpi strong {
        margin-top: 5px;
        font-size: 25px;
        font-weight: 950;
      }

      .prod-kpi.waiting strong { color: #fbbf24; }
      .prod-kpi.blocked strong { color: #fb7185; }
      .prod-kpi.done strong { color: #4ade80; }

      .prod-new-card,
      .prod-section {
        margin-top: 12px;
        padding: 17px;
        border: 1px solid rgba(148,163,184,.15);
        border-radius: 14px;
        background: #0b1828;
      }

      .prod-section-head.horizontal {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .prod-section-head h2 {
        margin: 5px 0 0;
        font-size: 18px;
        font-weight: 950;
      }

      .prod-count {
        min-width: 30px;
        min-height: 30px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(96,165,250,.25);
        border-radius: 999px;
        background: rgba(59,130,246,.08);
        color: #93c5fd;
        font-size: 10px;
        font-weight: 950;
      }

      .prod-config-warning {
        margin-top: 13px;
        padding: 10px 12px;
        border: 1px solid rgba(245,158,11,.26);
        border-radius: 8px;
        background: rgba(245,158,11,.07);
        color: #fcd34d;
        font-size: 9px;
        font-weight: 800;
      }

      .prod-config-warning a {
        color: #fde68a;
        font-weight: 950;
        text-decoration: underline;
      }

      .prod-form-grid {
        margin-top: 15px;
        display: grid;
        grid-template-columns: repeat(4,minmax(0,1fr));
        gap: 10px;
      }

      .prod-field {
        min-width: 0;
      }

      .prod-field.wide {
        grid-column: span 2;
      }

      .prod-field > span {
        margin-bottom: 5px;
        display: block;
        color: #8ea2ba;
        font-size: 8px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: .6px;
      }

      .prod-field input,
      .prod-field textarea,
      .prod-field select {
        width: 100%;
        min-height: 39px;
        box-sizing: border-box;
        padding: 0 10px;
        border: 1px solid rgba(148,163,184,.19);
        border-radius: 8px;
        outline: none;
        background: #081524;
        color: #fff;
        font-size: 11px;
      }

      .prod-field textarea {
        min-height: 70px;
        padding: 10px;
        resize: vertical;
      }

      .prod-field input:focus,
      .prod-field textarea:focus,
      .prod-field select:focus {
        border-color: rgba(96,165,250,.55);
      }

      .prod-form-actions {
        margin-top: 13px;
      }

      .prod-departments {
        margin-top: 14px;
        display: grid;
        grid-template-columns: repeat(3,minmax(0,1fr));
        gap: 10px;
      }

      .prod-department-card {
        min-width: 0;
        min-height: 92px;
        padding: 14px;
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 12px;
        border: 1px solid rgba(96,165,250,.17);
        border-radius: 12px;
        background:
          linear-gradient(135deg,rgba(59,130,246,.07),rgba(255,255,255,.015));
        color: #fff;
        cursor: pointer;
        text-align: left;
      }

      .prod-department-card:hover {
        border-color: rgba(96,165,250,.40);
        transform: translateY(-1px);
      }

      .prod-department-icon {
        width: 42px;
        height: 42px;
        display: grid;
        place-items: center;
        border-radius: 10px;
        background: linear-gradient(135deg,#2563eb,#60a5fa);
        color: white;
        font-weight: 950;
      }

      .prod-department-copy span,
      .prod-department-copy strong,
      .prod-department-copy small {
        display: block;
      }

      .prod-department-copy span {
        color: #6682a5;
        font-size: 7px;
        font-weight: 950;
        letter-spacing: .8px;
      }

      .prod-department-copy strong {
        margin-top: 3px;
        font-size: 13px;
      }

      .prod-department-copy small {
        margin-top: 4px;
        color: #8498b0;
        font-size: 9px;
      }

      .prod-arrow {
        color: #60a5fa;
        font-size: 18px;
        font-weight: 900;
      }

      .prod-table-wrap {
        margin-top: 13px;
        overflow-x: auto;
        border: 1px solid rgba(148,163,184,.13);
        border-radius: 10px;
      }

      .prod-table {
        width: 100%;
        min-width: 1050px;
        border-collapse: collapse;
        font-size: 10px;
      }

      .prod-table th {
        padding: 10px;
        background: rgba(255,255,255,.025);
        color: #8299b6;
        text-align: left;
        font-size: 8px;
        font-weight: 950;
        letter-spacing: .55px;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .prod-table td {
        padding: 11px 10px;
        border-top: 1px solid rgba(148,163,184,.09);
        vertical-align: middle;
      }

      .prod-click-row {
        cursor: pointer;
      }

      .prod-click-row:hover {
        background: rgba(59,130,246,.055);
      }

      .prod-order {
        color: #93c5fd;
        font-weight: 950;
      }

      .prod-note-cell {
        max-width: 260px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #a9b7c9;
      }

      .prod-status {
        display: inline-flex;
        padding: 5px 7px;
        border-radius: 999px;
        font-size: 7px;
        font-weight: 950;
        white-space: nowrap;
      }

      .prod-status.queued {
        border: 1px solid rgba(148,163,184,.22);
        background: rgba(148,163,184,.07);
        color: #cbd5e1;
      }

      .prod-status.working {
        border: 1px solid rgba(59,130,246,.30);
        background: rgba(59,130,246,.10);
        color: #93c5fd;
      }

      .prod-status.waiting {
        border: 1px solid rgba(245,158,11,.30);
        background: rgba(245,158,11,.08);
        color: #fbbf24;
      }

      .prod-status.blocked {
        border: 1px solid rgba(244,63,94,.32);
        background: rgba(244,63,94,.08);
        color: #fb7185;
      }

      .prod-status.completed {
        border: 1px solid rgba(34,197,94,.30);
        background: rgba(34,197,94,.08);
        color: #86efac;
      }

      .prod-empty,
      .prod-empty-cell {
        padding: 26px;
        color: #7388a3;
        text-align: center;
        font-size: 10px;
      }

      @media (max-width: 1000px) {
        .prod-kpis,
        .prod-form-grid {
          grid-template-columns: repeat(2,minmax(0,1fr));
        }

        .prod-departments {
          grid-template-columns: repeat(2,minmax(0,1fr));
        }
      }

      @media (max-width: 700px) {
        .prod-hero {
          align-items: stretch;
          flex-direction: column;
        }

        .prod-actions,
        .prod-form-actions {
          justify-content: flex-start;
        }

        .prod-kpis,
        .prod-form-grid,
        .prod-departments {
          grid-template-columns: 1fr;
        }

        .prod-field.wide {
          grid-column: span 1;
        }
      }
    `}</style>
  );
}
