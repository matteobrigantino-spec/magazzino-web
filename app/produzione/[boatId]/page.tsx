"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

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

type Department = {
  id: string;
  name: string;
  sort_order: number;
};

type Step = {
  id: string;
  boat_id: string;
  department_id: string;
  status: string;
  current_note: string | null;
  entered_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type History = {
  id: string;
  step_id: string;
  status: string;
  note: string | null;
  changed_by: string | null;
  changed_at: string;
};

type ProductionOption = {
  id: string;
  option_type: "model" | "color";
  name: string;
  active: boolean;
  sort_order: number;
};

const statusLabel: Record<string, string> = {
  queued: "Da iniziare",
  working: "In lavorazione",
  waiting: "In attesa",
  blocked: "Bloccato",
  completed: "Completato",
};

function days(start: string, end: string | null) {
  const a = new Date(start).getTime();
  const b = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.max(0, (b - a) / 86400000);
}

function dayLabel(value: number) {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: value < 10 ? 1 : 0,
    maximumFractionDigits: 1,
  }).format(value);
}

export default function ProductionBoatDetailPage({
  params,
}: {
  params: Promise<{ boatId: string }> | { boatId: string };
}) {
  const resolvedParams =
    typeof (params as any)?.then === "function"
      ? use(params as Promise<{ boatId: string }>)
      : (params as { boatId: string });

  const boatId = resolvedParams.boatId;

  const [boat, setBoat] = useState<Boat | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [productionOptions, setProductionOptions] = useState<ProductionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  // Editing the boat's own details (order number, model, colors, accessories,
  // note) from this page, instead of only being able to look at them.
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [formOrderNumber, setFormOrderNumber] = useState("");
  const [formModelBoat, setFormModelBoat] = useState("");
  const [formHull, setFormHull] = useState("");
  const [formStringers, setFormStringers] = useState("");
  const [formDeck, setFormDeck] = useState("");
  const [formAccessories, setFormAccessories] = useState("");
  const [formNote, setFormNote] = useState("");

  useEffect(() => {
    loadData();
  }, [boatId]);

  async function loadData() {
    setLoading(true);

    const [boatRes, depRes, stepRes, optionsRes] = await Promise.all([
      supabase
        .from("production_boats")
        .select("id,progressive_no,order_number,model_boat,hull,stringers,deck,accessories,note,status,created_at,completed_at")
        .eq("id", boatId)
        .maybeSingle(),
      supabase
        .from("production_departments")
        .select("id,name,sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("production_department_steps")
        .select("id,boat_id,department_id,status,current_note,entered_at,started_at,completed_at")
        .eq("boat_id", boatId),
      supabase
        .from("production_options")
        .select("id,option_type,name,active,sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    if (boatRes.error || !boatRes.data) {
      setErrorMessage("Battello non trovato.");
      setLoading(false);
      return;
    }

    if (depRes.error || stepRes.error) {
      setErrorMessage("Errore caricamento percorso produttivo.");
      setLoading(false);
      return;
    }

    const cleanBoat: Boat = {
      id: String(boatRes.data.id),
      progressive_no: Number(boatRes.data.progressive_no || 0),
      order_number: String(boatRes.data.order_number || ""),
      model_boat: String(boatRes.data.model_boat || ""),
      hull: String(boatRes.data.hull || ""),
      stringers: String(boatRes.data.stringers || ""),
      deck: String(boatRes.data.deck || ""),
      accessories: String(boatRes.data.accessories || ""),
      note: boatRes.data.note ? String(boatRes.data.note) : null,
      status: String(boatRes.data.status || ""),
      created_at: String(boatRes.data.created_at || ""),
      completed_at: boatRes.data.completed_at ? String(boatRes.data.completed_at) : null,
    };

    setBoat(cleanBoat);
    setFormOrderNumber(cleanBoat.order_number);
    setFormModelBoat(cleanBoat.model_boat);
    setFormHull(cleanBoat.hull);
    setFormStringers(cleanBoat.stringers);
    setFormDeck(cleanBoat.deck);
    setFormAccessories(cleanBoat.accessories);
    setFormNote(cleanBoat.note || "");

    const cleanDeps = (depRes.data || []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name || ""),
      sort_order: Number(row.sort_order || 0),
    }));

    const cleanSteps = (stepRes.data || []).map((row: any) => ({
      id: String(row.id),
      boat_id: String(row.boat_id),
      department_id: String(row.department_id),
      status: String(row.status || ""),
      current_note: row.current_note ? String(row.current_note) : null,
      entered_at: String(row.entered_at || ""),
      started_at: row.started_at ? String(row.started_at) : null,
      completed_at: row.completed_at ? String(row.completed_at) : null,
    }));

    setDepartments(cleanDeps);
    setSteps(cleanSteps);

    if (!optionsRes.error) {
      setProductionOptions(
        (optionsRes.data || []).map((row: any) => ({
          id: String(row.id),
          option_type: String(row.option_type) as "model" | "color",
          name: String(row.name || ""),
          active: row.active !== false,
          sort_order: Number(row.sort_order || 0),
        }))
      );
    }

    const stepIds = cleanSteps.map((step: Step) => step.id);

    if (stepIds.length > 0) {
      const historyRes = await supabase
        .from("production_status_history")
        .select("id,step_id,status,note,changed_by,changed_at")
        .in("step_id", stepIds)
        .order("changed_at", { ascending: false });

      if (!historyRes.error) {
        setHistory(
          (historyRes.data || []).map((row: any) => ({
            id: String(row.id),
            step_id: String(row.step_id),
            status: String(row.status || ""),
            note: row.note ? String(row.note) : null,
            changed_by: row.changed_by ? String(row.changed_by) : null,
            changed_at: String(row.changed_at || ""),
          }))
        );
      }
    }

    setLoading(false);
  }

  const depMap = useMemo(
    () => new Map(departments.map((dep) => [dep.id, dep])),
    [departments]
  );

  const stepMap = useMemo(
    () => new Map(steps.map((step) => [step.id, step])),
    [steps]
  );

  const sortedSteps = useMemo(
    () =>
      [...steps].sort(
        (a, b) =>
          (depMap.get(a.department_id)?.sort_order || 0) -
          (depMap.get(b.department_id)?.sort_order || 0)
      ),
    [steps, depMap]
  );

  const modelOptions = useMemo(
    () => productionOptions.filter((option) => option.option_type === "model"),
    [productionOptions]
  );

  const colorOptions = useMemo(
    () => productionOptions.filter((option) => option.option_type === "color"),
    [productionOptions]
  );

  // If the boat was saved with a model/color that is no longer in the active
  // list (renamed or deactivated later), keep showing it as a selectable
  // option so opening "Modifica" never silently blanks out real data.
  function withCurrentValue(options: ProductionOption[], current: string) {
    if (!current || options.some((option) => option.name === current)) return options;
    return [...options, { id: `current-${current}`, option_type: "color" as const, name: current, active: true, sort_order: -1 }];
  }

  const currentStep = sortedSteps.find((step) => step.status !== "completed");

  function startEditing() {
    if (!boat) return;
    setFormOrderNumber(boat.order_number);
    setFormModelBoat(boat.model_boat);
    setFormHull(boat.hull);
    setFormStringers(boat.stringers);
    setFormDeck(boat.deck);
    setFormAccessories(boat.accessories);
    setFormNote(boat.note || "");
    setSaveError("");
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setSaveError("");
  }

  async function saveEdits() {
    setSaveError("");

    if (!formOrderNumber.trim() || !formModelBoat.trim()) {
      setSaveError("Numero d'ordine e Modello battello sono obbligatori.");
      return;
    }

    if (!formHull || !formStringers || !formDeck) {
      setSaveError("Seleziona il colore di Carena, Ragno/Longheroni e Coperta.");
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("production_boats")
      .update({
        order_number: formOrderNumber.trim(),
        model_boat: formModelBoat.trim(),
        hull: formHull.trim(),
        stringers: formStringers.trim(),
        deck: formDeck.trim(),
        accessories: formAccessories.trim(),
        note: formNote.trim() || null,
      })
      .eq("id", boatId);

    if (error) {
      setSaveError("Errore salvataggio modifiche: " + error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setEditing(false);
    await loadData();
  }

  if (loading) {
    return (
      <div className="pbd-loading">
        Caricamento battello...
        <Styles />
      </div>
    );
  }

  if (!boat) {
    return (
      <div className="pbd-page">
        <div className="pbd-error">{errorMessage || "Battello non trovato."}</div>
        <Link href="/produzione" className="pbd-back">← Produzione</Link>
        <Styles />
      </div>
    );
  }

  const totalDays = days(boat.created_at, boat.completed_at);

  return (
    <div className="pbd-page">
      <section className="pbd-hero">
        <div>
          <div className="pbd-eyebrow">SCHEDA PRODUZIONE #{boat.progressive_no}</div>
          <h1>{boat.order_number} · {boat.model_boat}</h1>
          <p>
            {boat.status === "completed"
              ? `Produzione completata in ${dayLabel(totalDays)} giorni`
              : `In produzione da ${dayLabel(totalDays)} giorni`}
          </p>
        </div>

        <div className="pbd-actions">
          <Link href="/produzione" className="pbd-back">← Produzione</Link>
          {currentStep && (
            <Link
              href={`/produzione/reparti/${currentStep.department_id}`}
              className="pbd-current"
            >
              {depMap.get(currentStep.department_id)?.name || "Reparto attuale"}
            </Link>
          )}
          {!editing && (
            <button type="button" className="pbd-edit-btn" onClick={startEditing}>
              Modifica
            </button>
          )}
        </div>
      </section>

      {editing ? (
        <section className="pbd-card">
          <div className="pbd-head">
            <div>
              <div className="pbd-eyebrow">MODIFICA BATTELLO</div>
              <h2>Aggiorna dati e note</h2>
            </div>
          </div>

          {saveError && <div className="pbd-form-error">{saveError}</div>}

          <div className="pbd-edit-grid">
            <EditField label="Numero d'ordine *">
              <input
                value={formOrderNumber}
                onChange={(e) => setFormOrderNumber(e.target.value)}
              />
            </EditField>

            <EditField label="Modello battello *">
              <select value={formModelBoat} onChange={(e) => setFormModelBoat(e.target.value)}>
                <option value="">Seleziona modello...</option>
                {withCurrentValue(modelOptions, formModelBoat).map((option) => (
                  <option key={option.id} value={option.name}>{option.name}</option>
                ))}
              </select>
            </EditField>

            <EditField label="Carena">
              <select value={formHull} onChange={(e) => setFormHull(e.target.value)}>
                <option value="">Seleziona colore...</option>
                {withCurrentValue(colorOptions, formHull).map((option) => (
                  <option key={option.id} value={option.name}>{option.name}</option>
                ))}
              </select>
            </EditField>

            <EditField label="Ragno / Longheroni">
              <select value={formStringers} onChange={(e) => setFormStringers(e.target.value)}>
                <option value="">Seleziona colore...</option>
                {withCurrentValue(colorOptions, formStringers).map((option) => (
                  <option key={option.id} value={option.name}>{option.name}</option>
                ))}
              </select>
            </EditField>

            <EditField label="Coperta">
              <select value={formDeck} onChange={(e) => setFormDeck(e.target.value)}>
                <option value="">Seleziona colore...</option>
                {withCurrentValue(colorOptions, formDeck).map((option) => (
                  <option key={option.id} value={option.name}>{option.name}</option>
                ))}
              </select>
            </EditField>

            <EditField label="Accessori">
              <input
                value={formAccessories}
                onChange={(e) => setFormAccessories(e.target.value)}
              />
            </EditField>

            <EditField label="Note" wide>
              <textarea
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="Es. Gruppo consolle Selva"
              />
            </EditField>
          </div>

          <div className="pbd-form-actions">
            <button type="button" className="pbd-back" onClick={cancelEditing} disabled={saving}>
              Annulla
            </button>
            <button type="button" className="pbd-save-btn" onClick={saveEdits} disabled={saving}>
              {saving ? "Salvataggio..." : "Salva modifiche"}
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="pbd-specs">
            <Info label="Carena" value={boat.hull || "—"} />
            <Info label="Ragno / Longheroni" value={boat.stringers || "—"} />
            <Info label="Coperta" value={boat.deck || "—"} />
            <Info label="Accessori" value={boat.accessories || "—"} />
          </section>

          <section className="pbd-card">
            <div className="pbd-eyebrow">NOTE ORDINE</div>
            <div className="pbd-note">{boat.note || "Nessuna nota inserita."}</div>
          </section>
        </>
      )}

      <section className="pbd-card">
        <div className="pbd-head">
          <div>
            <div className="pbd-eyebrow">PERCORSO PRODUTTIVO</div>
            <h2>Tempi per reparto</h2>
          </div>
        </div>

        <div className="pbd-timeline">
          {departments.map((dep) => {
            const step = sortedSteps.find((row) => row.department_id === dep.id);

            return (
              <div
                key={dep.id}
                className={`pbd-step ${step ? step.status : "future"}`}
              >
                <div className="pbd-step-number">{dep.sort_order}</div>
                <div className="pbd-step-copy">
                  <strong>{dep.name}</strong>
                  {step ? (
                    <>
                      <span>{statusLabel[step.status] || step.status}</span>
                      <small>
                        {dayLabel(days(step.entered_at, step.completed_at))} giorni nel reparto
                      </small>
                      {step.current_note && <em>{step.current_note}</em>}
                    </>
                  ) : (
                    <span>Non ancora raggiunto</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="pbd-card">
        <div className="pbd-head">
          <div>
            <div className="pbd-eyebrow">STORICO GIORNALIERO</div>
            <h2>Tutti gli aggiornamenti</h2>
          </div>
          <span>{history.length}</span>
        </div>

        {history.length === 0 ? (
          <div className="pbd-empty">Nessun aggiornamento registrato.</div>
        ) : (
          <div className="pbd-history">
            {history.map((entry) => {
              const step = stepMap.get(entry.step_id);
              const dep = step ? depMap.get(step.department_id) : null;

              return (
                <div className="pbd-history-row" key={entry.id}>
                  <div className={`pbd-history-dot ${entry.status}`} />
                  <div className="pbd-history-copy">
                    <div>
                      <strong>{statusLabel[entry.status] || entry.status}</strong>
                      <span> · {dep?.name || "Reparto"}</span>
                    </div>
                    <small>
                      {new Intl.DateTimeFormat("it-IT", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(entry.changed_at))}
                      {entry.changed_by ? ` · ${entry.changed_by}` : ""}
                    </small>
                    {entry.note && <p>{entry.note}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Styles />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EditField({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`pbd-field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      .pbd-page { width:100%; max-width:1250px; margin:0 auto; color:#f8fafc; }
      .pbd-loading { min-height:55vh; display:grid; place-items:center; color:#dbeafe; font-weight:850; }
      .pbd-hero { padding:21px 22px; display:flex; align-items:center; justify-content:space-between; gap:18px; border:1px solid rgba(59,130,246,.24); border-radius:16px; background:linear-gradient(135deg,#0d1d31,#071321); }
      .pbd-eyebrow { color:#60a5fa; font-size:9px; font-weight:950; letter-spacing:1.45px; }
      .pbd-hero h1 { margin:5px 0 0; font-size:27px; font-weight:950; letter-spacing:-.6px; }
      .pbd-hero p { margin:6px 0 0; color:#91a4bc; font-size:10px; }
      .pbd-actions { display:flex; align-items:center; flex-wrap:wrap; gap:7px; }
      .pbd-back,.pbd-current,.pbd-edit-btn,.pbd-save-btn { min-height:38px; padding:0 12px; display:inline-flex; align-items:center; border-radius:8px; text-decoration:none; font-size:9px; font-weight:900; cursor:pointer; border:0; }
      .pbd-back { border:1px solid rgba(148,163,184,.22); background:rgba(255,255,255,.035); color:#e2e8f0; }
      .pbd-current { border:1px solid rgba(59,130,246,.30); background:rgba(59,130,246,.10); color:#93c5fd; }
      .pbd-edit-btn { border:1px solid rgba(96,165,250,.32); background:rgba(59,130,246,.14); color:#bfdbfe; }
      .pbd-save-btn { border:1px solid #2563eb; background:#2563eb; color:#fff; }
      .pbd-save-btn:disabled,.pbd-back:disabled { opacity:.55; cursor:wait; }
      .pbd-error { margin-bottom:10px; padding:11px 13px; border:1px solid rgba(239,68,68,.28); border-radius:9px; background:rgba(239,68,68,.08); color:#fca5a5; font-size:10px; font-weight:800; }
      .pbd-specs { margin-top:11px; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
      .pbd-specs > div { padding:13px; border:1px solid rgba(148,163,184,.14); border-radius:10px; background:#0b192a; }
      .pbd-specs span,.pbd-specs strong { display:block; }
      .pbd-specs span { color:#7e94af; font-size:7px; font-weight:950; letter-spacing:.6px; text-transform:uppercase; }
      .pbd-specs strong { margin-top:4px; font-size:12px; }
      .pbd-card { margin-top:11px; padding:16px; border:1px solid rgba(148,163,184,.15); border-radius:13px; background:#0b1828; }
      .pbd-note { margin-top:9px; padding:12px; border:1px solid rgba(96,165,250,.15); border-radius:9px; background:rgba(59,130,246,.04); color:#d9e6f5; font-size:11px; line-height:1.6; white-space:pre-wrap; }
      .pbd-form-error { margin-top:10px; padding:10px 12px; border:1px solid rgba(239,68,68,.28); border-radius:9px; background:rgba(239,68,68,.08); color:#fca5a5; font-size:10px; font-weight:800; }
      .pbd-edit-grid { margin-top:14px; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
      .pbd-field { min-width:0; }
      .pbd-field.wide { grid-column:span 2; }
      .pbd-field > span { margin-bottom:5px; display:block; color:#8ea2ba; font-size:8px; font-weight:900; text-transform:uppercase; letter-spacing:.6px; }
      .pbd-field input,.pbd-field textarea,.pbd-field select { width:100%; min-height:39px; box-sizing:border-box; padding:0 10px; border:1px solid rgba(148,163,184,.19); border-radius:8px; outline:none; background:#081524; color:#fff; font-size:11px; }
      .pbd-field textarea { min-height:70px; padding:10px; resize:vertical; }
      .pbd-field input:focus,.pbd-field textarea:focus,.pbd-field select:focus { border-color:rgba(96,165,250,.55); }
      .pbd-form-actions { margin-top:14px; display:flex; justify-content:flex-end; gap:8px; }
      .pbd-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
      .pbd-head h2 { margin:4px 0 0; font-size:17px; }
      .pbd-head > span { min-width:29px; min-height:29px; display:grid; place-items:center; border:1px solid rgba(96,165,250,.23); border-radius:999px; color:#93c5fd; font-size:9px; font-weight:950; }
      .pbd-timeline { margin-top:13px; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
      .pbd-step { min-height:94px; padding:12px; display:grid; grid-template-columns:auto 1fr; gap:10px; border:1px solid rgba(148,163,184,.12); border-radius:10px; background:rgba(255,255,255,.016); }
      .pbd-step.working { border-color:rgba(59,130,246,.30); background:rgba(59,130,246,.06); }
      .pbd-step.waiting { border-color:rgba(245,158,11,.27); background:rgba(245,158,11,.05); }
      .pbd-step.blocked { border-color:rgba(244,63,94,.28); background:rgba(244,63,94,.05); }
      .pbd-step.completed { border-color:rgba(34,197,94,.24); background:rgba(34,197,94,.04); }
      .pbd-step.future { opacity:.42; }
      .pbd-step-number { width:30px; height:30px; display:grid; place-items:center; border-radius:8px; background:rgba(59,130,246,.10); color:#93c5fd; font-size:8px; font-weight:950; }
      .pbd-step-copy strong,.pbd-step-copy span,.pbd-step-copy small,.pbd-step-copy em { display:block; }
      .pbd-step-copy strong { font-size:11px; }
      .pbd-step-copy span { margin-top:4px; color:#9eb0c5; font-size:8px; font-weight:800; }
      .pbd-step-copy small { margin-top:4px; color:#7187a1; font-size:8px; }
      .pbd-step-copy em { margin-top:5px; color:#c4d2e1; font-size:8px; font-style:normal; }
      .pbd-history { margin-top:12px; display:flex; flex-direction:column; }
      .pbd-history-row { padding:10px 0; display:grid; grid-template-columns:auto 1fr; gap:11px; border-top:1px solid rgba(148,163,184,.09); }
      .pbd-history-row:first-child { border-top:0; }
      .pbd-history-dot { width:9px; height:9px; margin-top:4px; border-radius:50%; background:#64748b; }
      .pbd-history-dot.working { background:#3b82f6; }
      .pbd-history-dot.waiting { background:#f59e0b; }
      .pbd-history-dot.blocked { background:#f43f5e; }
      .pbd-history-dot.completed { background:#22c55e; }
      .pbd-history-copy strong { font-size:10px; }
      .pbd-history-copy span { color:#8296af; font-size:9px; }
      .pbd-history-copy small { margin-top:3px; display:block; color:#667d99; font-size:8px; }
      .pbd-history-copy p { margin:5px 0 0; color:#bbc8d7; font-size:9px; }
      .pbd-empty { padding:30px; color:#7388a3; text-align:center; font-size:10px; }
      @media(max-width:850px){ .pbd-hero{align-items:stretch;flex-direction:column}.pbd-specs{grid-template-columns:repeat(2,minmax(0,1fr))}.pbd-timeline{grid-template-columns:1fr}.pbd-edit-grid{grid-template-columns:repeat(2,minmax(0,1fr))} }
      @media(max-width:520px){ .pbd-edit-grid{grid-template-columns:1fr}.pbd-field.wide{grid-column:span 1} }
    `}</style>
  );
}
