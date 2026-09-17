"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

type Department = {
  id: string;
  name: string;
  sort_order: number;
};

type Boat = {
  id: string;
  progressive_no: number;
  order_number: string;
  model_boat: string;
  created_at: string;
  completed_at: string | null;
  status: string;
};

type Step = {
  id: string;
  boat_id: string;
  department_id: string;
  entered_at: string;
  completed_at: string | null;
  status: string;
};

function diffDays(start: string, end: string | null) {
  if (!end) return 0;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.max(0, (b - a) / 86400000);
}

function avg(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function oneDecimal(value: number) {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

export default function ProductionAnalyticsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const [depRes, boatRes, stepRes] = await Promise.all([
      supabase
        .from("production_departments")
        .select("id,name,sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("production_boats")
        .select("id,progressive_no,order_number,model_boat,created_at,completed_at,status")
        .order("completed_at", { ascending: false }),
      supabase
        .from("production_department_steps")
        .select("id,boat_id,department_id,entered_at,completed_at,status"),
    ]);

    const error = depRes.error || boatRes.error || stepRes.error;

    if (error) {
      setErrorMessage("Errore caricamento statistiche: " + error.message);
      setLoading(false);
      return;
    }

    setDepartments(
      (depRes.data || []).map((row: any) => ({
        id: String(row.id),
        name: String(row.name || ""),
        sort_order: Number(row.sort_order || 0),
      }))
    );

    setBoats(
      (boatRes.data || []).map((row: any) => ({
        id: String(row.id),
        progressive_no: Number(row.progressive_no || 0),
        order_number: String(row.order_number || ""),
        model_boat: String(row.model_boat || ""),
        created_at: String(row.created_at || ""),
        completed_at: row.completed_at ? String(row.completed_at) : null,
        status: String(row.status || ""),
      }))
    );

    setSteps(
      (stepRes.data || []).map((row: any) => ({
        id: String(row.id),
        boat_id: String(row.boat_id),
        department_id: String(row.department_id),
        entered_at: String(row.entered_at || ""),
        completed_at: row.completed_at ? String(row.completed_at) : null,
        status: String(row.status || ""),
      }))
    );

    setLoading(false);
  }

  const completedBoats = useMemo(
    () =>
      boats.filter(
        (boat) =>
          boat.status === "completed" &&
          boat.completed_at &&
          boat.completed_at.slice(0, 7) === month
      ),
    [boats, month]
  );

  const stepMap = useMemo(() => {
    const result = new Map<string, Step[]>();
    for (const step of steps) {
      const list = result.get(step.boat_id) || [];
      list.push(step);
      result.set(step.boat_id, list);
    }
    return result;
  }, [steps]);

  const modelRows = useMemo(() => {
    const groups = new Map<string, Boat[]>();

    for (const boat of completedBoats) {
      const list = groups.get(boat.model_boat) || [];
      list.push(boat);
      groups.set(boat.model_boat, list);
    }

    return Array.from(groups.entries())
      .map(([model, modelBoats]) => {
        const totalDays = modelBoats.map((boat) =>
          diffDays(boat.created_at, boat.completed_at)
        );

        const depAverages = new Map<string, number>();

        for (const dep of departments) {
          const durations: number[] = [];

          for (const boat of modelBoats) {
            const step = (stepMap.get(boat.id) || []).find(
              (row) =>
                row.department_id === dep.id &&
                row.status === "completed" &&
                row.completed_at
            );

            if (step) {
              durations.push(diffDays(step.entered_at, step.completed_at));
            }
          }

          depAverages.set(dep.id, avg(durations));
        }

        return {
          model,
          count: modelBoats.length,
          avgTotal: avg(totalDays),
          depAverages,
        };
      })
      .sort((a, b) => a.model.localeCompare(b.model));
  }, [completedBoats, departments, stepMap]);

  const overallAvg = avg(
    completedBoats.map((boat) => diffDays(boat.created_at, boat.completed_at))
  );

  return (
    <div className="pa-page">
      <section className="pa-hero">
        <div>
          <div className="pa-eyebrow">ANALISI PRODUZIONE</div>
          <h1>Medie mensili</h1>
          <p>
            Le medie vengono calcolate sui battelli realmente completati nel mese
            selezionato e sui tempi registrati in ogni reparto.
          </p>
        </div>

        <div className="pa-actions">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <Link href="/produzione" className="pa-back">← Produzione</Link>
        </div>
      </section>

      {errorMessage && <div className="pa-error">{errorMessage}</div>}

      <section className="pa-kpis">
        <div>
          <span>BATTELLI COMPLETATI</span>
          <strong>{completedBoats.length}</strong>
        </div>
        <div>
          <span>MODELLI DIVERSI</span>
          <strong>{modelRows.length}</strong>
        </div>
        <div>
          <span>MEDIA TOTALE PRODUZIONE</span>
          <strong>{completedBoats.length ? `${oneDecimal(overallAvg)} gg` : "—"}</strong>
        </div>
      </section>

      <section className="pa-card">
        <div className="pa-head">
          <div>
            <div className="pa-eyebrow">PER MODELLO</div>
            <h2>Media mensile per battello / modello</h2>
          </div>
        </div>

        {loading ? (
          <div className="pa-empty">Caricamento...</div>
        ) : modelRows.length === 0 ? (
          <div className="pa-empty">
            Nessun battello completato nel mese selezionato. Le medie appariranno
            automaticamente appena inizieremo a chiudere gli ordini.
          </div>
        ) : (
          <div className="pa-table-wrap">
            <table className="pa-table">
              <thead>
                <tr>
                  <th>Modello</th>
                  <th>Battelli completati</th>
                  <th>Media totale</th>
                  {departments.map((dep) => (
                    <th key={dep.id}>{dep.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modelRows.map((row) => (
                  <tr key={row.model}>
                    <td><strong>{row.model}</strong></td>
                    <td>{row.count}</td>
                    <td><span className="pa-total">{oneDecimal(row.avgTotal)} gg</span></td>
                    {departments.map((dep) => {
                      const value = row.depAverages.get(dep.id) || 0;
                      return <td key={dep.id}>{value ? `${oneDecimal(value)} gg` : "—"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="pa-card">
        <div className="pa-head">
          <div>
            <div className="pa-eyebrow">DETTAGLIO</div>
            <h2>Singoli battelli completati</h2>
          </div>
        </div>

        <div className="pa-table-wrap">
          <table className="pa-table detail">
            <thead>
              <tr>
                <th>Prog.</th>
                <th>N° ordine</th>
                <th>Modello</th>
                <th>Inizio produzione</th>
                <th>Fine produzione</th>
                <th>Tempo totale</th>
              </tr>
            </thead>
            <tbody>
              {completedBoats.length === 0 ? (
                <tr>
                  <td colSpan={6} className="pa-empty-cell">Nessun dato per questo mese.</td>
                </tr>
              ) : (
                completedBoats.map((boat) => (
                  <tr key={boat.id}>
                    <td>{boat.progressive_no}</td>
                    <td><Link href={`/produzione/${boat.id}`}>{boat.order_number}</Link></td>
                    <td>{boat.model_boat}</td>
                    <td>{new Intl.DateTimeFormat("it-IT").format(new Date(boat.created_at))}</td>
                    <td>{boat.completed_at ? new Intl.DateTimeFormat("it-IT").format(new Date(boat.completed_at)) : "—"}</td>
                    <td><strong>{oneDecimal(diffDays(boat.created_at, boat.completed_at))} gg</strong></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Styles />
    </div>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      .pa-page { width:100%; max-width:1500px; margin:0 auto; color:#f8fafc; }
      .pa-hero { padding:21px 22px; display:flex; align-items:center; justify-content:space-between; gap:18px; border:1px solid rgba(59,130,246,.24); border-radius:16px; background:linear-gradient(135deg,#0d1d31,#071321); }
      .pa-eyebrow { color:#60a5fa; font-size:9px; font-weight:950; letter-spacing:1.5px; }
      .pa-hero h1 { margin:5px 0 0; font-size:30px; font-weight:950; }
      .pa-hero p { max-width:760px; margin:6px 0 0; color:#91a4bc; font-size:10px; line-height:1.55; }
      .pa-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
      .pa-actions input { min-height:38px; padding:0 10px; border:1px solid rgba(148,163,184,.22); border-radius:8px; outline:none; background:#081524; color:#fff; font-size:10px; }
      .pa-back { min-height:38px; padding:0 12px; display:inline-flex; align-items:center; border:1px solid rgba(148,163,184,.22); border-radius:8px; background:rgba(255,255,255,.035); color:#e2e8f0; text-decoration:none; font-size:9px; font-weight:900; }
      .pa-error { margin-top:11px; padding:11px 13px; border:1px solid rgba(239,68,68,.28); border-radius:9px; background:rgba(239,68,68,.08); color:#fca5a5; font-size:10px; font-weight:800; }
      .pa-kpis { margin-top:11px; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:9px; }
      .pa-kpis > div { padding:14px; border:1px solid rgba(148,163,184,.14); border-radius:11px; background:#0b192a; }
      .pa-kpis span,.pa-kpis strong { display:block; }
      .pa-kpis span { color:#8297b0; font-size:7px; font-weight:950; letter-spacing:.7px; }
      .pa-kpis strong { margin-top:5px; font-size:23px; }
      .pa-card { margin-top:11px; padding:15px; border:1px solid rgba(148,163,184,.15); border-radius:13px; background:#0b1828; }
      .pa-head h2 { margin:4px 0 0; font-size:17px; }
      .pa-table-wrap { margin-top:12px; overflow-x:auto; border:1px solid rgba(148,163,184,.13); border-radius:9px; }
      .pa-table { width:100%; min-width:850px; border-collapse:collapse; font-size:9px; }
      .pa-table th { padding:9px; background:rgba(255,255,255,.025); color:#849cba; text-align:left; font-size:7px; font-weight:950; letter-spacing:.5px; text-transform:uppercase; white-space:nowrap; }
      .pa-table td { padding:10px 9px; border-top:1px solid rgba(148,163,184,.09); }
      .pa-table a { color:#93c5fd; font-weight:950; text-decoration:none; }
      .pa-total { color:#86efac; font-weight:950; }
      .pa-empty,.pa-empty-cell { padding:35px!important; color:#7388a3; text-align:center; font-size:10px; line-height:1.6; }
      @media(max-width:700px){ .pa-hero{align-items:stretch;flex-direction:column}.pa-kpis{grid-template-columns:1fr} }
    `}</style>
  );
}
