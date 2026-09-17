"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

type Department = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
};

export default function ProductionDepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("20");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data, error } = await supabase
      .from("production_departments")
      .select("id,name,sort_order,active")
      .order("sort_order", { ascending: true });

    if (error) {
      setErrorMessage("Errore caricamento reparti: " + error.message);
      setLoading(false);
      return;
    }

    const clean = (data || []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name || ""),
      sort_order: Number(row.sort_order || 0),
      active: row.active !== false,
    }));

    setDepartments(clean);

    const next =
      clean.length === 0
        ? 10
        : Math.max(...clean.map((dep) => dep.sort_order)) + 10;

    setSortOrder(String(next));
    setLoading(false);
  }

  async function addDepartment() {
    setMessage("");
    setErrorMessage("");

    if (!name.trim()) {
      setErrorMessage("Inserisci il nome del reparto.");
      return;
    }

    const order = Number(sortOrder || 0);

    const { error } = await supabase.from("production_departments").insert({
      name: name.trim(),
      sort_order: Number.isFinite(order) && order > 0 ? order : 10,
      active: true,
    });

    if (error) {
      setErrorMessage("Errore creazione reparto: " + error.message);
      return;
    }

    setName("");
    setMessage("Reparto aggiunto.");
    await loadData();
  }

  async function toggleDepartment(dep: Department) {
    setSavingId(dep.id);
    setMessage("");
    setErrorMessage("");

    const { error } = await supabase
      .from("production_departments")
      .update({ active: !dep.active })
      .eq("id", dep.id);

    if (error) {
      setErrorMessage("Errore aggiornamento reparto: " + error.message);
      setSavingId("");
      return;
    }

    setSavingId("");
    await loadData();
  }

  async function updateOrder(dep: Department, value: string) {
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0) return;

    setSavingId(dep.id);

    const { error } = await supabase
      .from("production_departments")
      .update({ sort_order: next })
      .eq("id", dep.id);

    if (error) {
      setErrorMessage("Errore ordine reparto: " + error.message);
    }

    setSavingId("");
    await loadData();
  }

  return (
    <div className="prm-page">
      <section className="prm-hero">
        <div>
          <div className="prm-eyebrow">CONFIGURAZIONE PRODUZIONE</div>
          <h1>Reparti</h1>
          <p>
            L&apos;ordine dei reparti stabilisce il percorso automatico del battello.
            Lascia spazio tra i numeri (10, 20, 30...) per inserirne altri in futuro.
          </p>
        </div>
        <Link href="/produzione" className="prm-back">← Produzione</Link>
      </section>

      {(message || errorMessage) && (
        <div className={errorMessage ? "prm-message error" : "prm-message success"}>
          {errorMessage || message}
        </div>
      )}

      <section className="prm-card">
        <div className="prm-eyebrow">NUOVO REPARTO</div>
        <div className="prm-add-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Es. Assemblaggio"
          />
          <input
            type="number"
            min="1"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
          <button type="button" onClick={addDepartment}>+ Aggiungi reparto</button>
        </div>
      </section>

      <section className="prm-card">
        <div className="prm-list-head">
          <div>
            <div className="prm-eyebrow">PERCORSO PRODUTTIVO</div>
            <h2>Ordine dei reparti</h2>
          </div>
          <span>{departments.length}</span>
        </div>

        {loading ? (
          <div className="prm-empty">Caricamento...</div>
        ) : departments.length === 0 ? (
          <div className="prm-empty">Nessun reparto presente.</div>
        ) : (
          <div className="prm-list">
            {departments.map((dep, index) => (
              <div className="prm-row" key={dep.id}>
                <div className="prm-number">{index + 1}</div>
                <div className="prm-copy">
                  <strong>{dep.name}</strong>
                  <span>{dep.active ? "Reparto attivo" : "Reparto disattivato"}</span>
                </div>
                <label>
                  <span>Ordine</span>
                  <input
                    type="number"
                    defaultValue={dep.sort_order}
                    onBlur={(e) => updateOrder(dep, e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className={dep.active ? "deactivate" : "activate"}
                  disabled={savingId === dep.id}
                  onClick={() => toggleDepartment(dep)}
                >
                  {dep.active ? "Disattiva" : "Riattiva"}
                </button>
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
      .prm-page { width:100%; max-width:1100px; margin:0 auto; color:#f8fafc; }
      .prm-hero { padding:21px; display:flex; align-items:center; justify-content:space-between; gap:18px; border:1px solid rgba(59,130,246,.22); border-radius:16px; background:linear-gradient(135deg,#0d1d31,#071321); }
      .prm-eyebrow { color:#60a5fa; font-size:9px; font-weight:950; letter-spacing:1.4px; }
      .prm-hero h1 { margin:5px 0 0; font-size:30px; font-weight:950; }
      .prm-hero p { max-width:720px; margin:6px 0 0; color:#91a4bc; font-size:10px; line-height:1.55; }
      .prm-back { min-height:38px; padding:0 12px; display:inline-flex; align-items:center; border:1px solid rgba(148,163,184,.22); border-radius:8px; background:rgba(255,255,255,.035); color:#e2e8f0; text-decoration:none; font-size:9px; font-weight:900; white-space:nowrap; }
      .prm-message { margin-top:11px; padding:11px 13px; border-radius:9px; font-size:10px; font-weight:800; }
      .prm-message.success { border:1px solid rgba(34,197,94,.28); background:rgba(34,197,94,.08); color:#86efac; }
      .prm-message.error { border:1px solid rgba(239,68,68,.28); background:rgba(239,68,68,.08); color:#fca5a5; }
      .prm-card { margin-top:11px; padding:16px; border:1px solid rgba(148,163,184,.15); border-radius:13px; background:#0b1828; }
      .prm-add-row { margin-top:10px; display:grid; grid-template-columns:1fr 110px auto; gap:8px; }
      .prm-add-row input, .prm-row input { min-height:38px; box-sizing:border-box; padding:0 9px; border:1px solid rgba(148,163,184,.20); border-radius:8px; outline:none; background:#081524; color:white; font-size:10px; }
      .prm-add-row button { min-height:38px; padding:0 12px; border:1px solid #2563eb; border-radius:8px; background:#2563eb; color:white; cursor:pointer; font-size:9px; font-weight:900; }
      .prm-list-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
      .prm-list-head h2 { margin:4px 0 0; font-size:17px; }
      .prm-list-head > span { min-width:30px; min-height:30px; display:grid; place-items:center; border:1px solid rgba(96,165,250,.25); border-radius:999px; color:#93c5fd; font-size:9px; font-weight:950; }
      .prm-list { margin-top:12px; display:flex; flex-direction:column; gap:7px; }
      .prm-row { padding:11px; display:grid; grid-template-columns:auto 1fr 100px auto; align-items:center; gap:11px; border:1px solid rgba(148,163,184,.12); border-radius:10px; background:rgba(255,255,255,.018); }
      .prm-number { width:31px; height:31px; display:grid; place-items:center; border-radius:8px; background:rgba(59,130,246,.10); color:#93c5fd; font-size:10px; font-weight:950; }
      .prm-copy strong, .prm-copy span { display:block; }
      .prm-copy strong { font-size:12px; }
      .prm-copy span { margin-top:3px; color:#7f94ad; font-size:8px; }
      .prm-row label > span { margin-bottom:3px; display:block; color:#7187a2; font-size:7px; font-weight:900; text-transform:uppercase; }
      .prm-row input { width:100%; min-height:31px; }
      .prm-row button { min-height:31px; padding:0 9px; border-radius:7px; cursor:pointer; font-size:8px; font-weight:900; }
      .prm-row button.deactivate { border:1px solid rgba(239,68,68,.25); background:rgba(239,68,68,.07); color:#fca5a5; }
      .prm-row button.activate { border:1px solid rgba(34,197,94,.25); background:rgba(34,197,94,.07); color:#86efac; }
      .prm-empty { padding:32px; color:#7388a3; text-align:center; font-size:10px; }
      @media(max-width:700px){ .prm-hero{align-items:stretch;flex-direction:column}.prm-add-row,.prm-row{grid-template-columns:1fr}.prm-number{display:none} }
    `}</style>
  );
}
