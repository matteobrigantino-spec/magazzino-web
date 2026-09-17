"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";
import { supabase } from "../../../../lib/supabaseClient";

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
  hull: string;
  stringers: string;
  deck: string;
  accessories: string;
  note: string | null;
};

type Step = {
  id: string;
  boat_id: string;
  department_id: string;
  status: string;
  current_note: string | null;
  entered_at: string;
};

const statusLabel: Record<string, string> = {
  queued: "Da iniziare",
  working: "In lavorazione",
  waiting: "In attesa",
  blocked: "Bloccato",
  completed: "Completato",
};

export default function ProductionDepartmentPage({
  params,
}: {
  params:
    | Promise<{ departmentId: string }>
    | { departmentId: string };
}) {
  const resolvedParams =
    typeof (params as any)?.then === "function"
      ? use(params as Promise<{ departmentId: string }>)
      : (params as { departmentId: string });

  const departmentId = resolvedParams.departmentId;
  const router = useRouter();

  const [department, setDepartment] = useState<Department | null>(null);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadData();
  }, [departmentId]);

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const [depRes, stepRes] = await Promise.all([
      supabase
        .from("production_departments")
        .select("id,name,sort_order")
        .eq("id", departmentId)
        .maybeSingle(),
      supabase
        .from("production_department_steps")
        .select("id,boat_id,department_id,status,current_note,entered_at")
        .eq("department_id", departmentId)
        .neq("status", "completed")
        .order("entered_at", { ascending: true }),
    ]);

    if (depRes.error || !depRes.data) {
      setErrorMessage("Reparto non trovato.");
      setLoading(false);
      return;
    }

    if (stepRes.error) {
      setErrorMessage("Errore caricamento reparto: " + stepRes.error.message);
      setLoading(false);
      return;
    }

    const cleanSteps: Step[] = (stepRes.data || []).map((row: any) => ({
      id: String(row.id),
      boat_id: String(row.boat_id),
      department_id: String(row.department_id),
      status: String(row.status || "queued"),
      current_note: row.current_note ? String(row.current_note) : null,
      entered_at: String(row.entered_at || ""),
    }));

    setDepartment({
      id: String(depRes.data.id),
      name: String(depRes.data.name || ""),
      sort_order: Number(depRes.data.sort_order || 0),
    });

    setSteps(cleanSteps);

    setStatusDrafts(
      Object.fromEntries(cleanSteps.map((step) => [step.id, step.status]))
    );

    setNoteDrafts(
      Object.fromEntries(
        cleanSteps.map((step) => [step.id, step.current_note || ""])
      )
    );

    const boatIds = Array.from(new Set(cleanSteps.map((step) => step.boat_id)));

    if (boatIds.length === 0) {
      setBoats([]);
      setLoading(false);
      return;
    }

    const boatRes = await supabase
      .from("production_boats")
      .select("id,progressive_no,order_number,model_boat,hull,stringers,deck,accessories,note")
      .in("id", boatIds)
      .order("progressive_no", { ascending: true });

    if (boatRes.error) {
      setErrorMessage("Errore caricamento battelli: " + boatRes.error.message);
      setLoading(false);
      return;
    }

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
      }))
    );

    setLoading(false);
  }

  const boatMap = useMemo(
    () => new Map(boats.map((boat) => [boat.id, boat])),
    [boats]
  );

  async function saveStatus(step: Step) {
    const nextStatus = statusDrafts[step.id] || step.status;
    const nextNote = (noteDrafts[step.id] || "").trim();

    if (nextStatus === "blocked" && !nextNote) {
      setErrorMessage("Quando un battello è BLOCCATO inserisci il motivo nelle note.");
      return;
    }

    const completionWarning =
      nextStatus === "completed"
        ? window.confirm(
            "Confermi COMPLETATO?\n\nIl battello uscirà da questo reparto e passerà automaticamente al reparto successivo."
          )
        : true;

    if (!completionWarning) return;

    setSavingId(step.id);
    setMessage("");
    setErrorMessage("");

    const operator =
      localStorage.getItem("magazzino_display_name") ||
      localStorage.getItem("magazzino_user") ||
      "Matteo";

    const { error } = await supabase.rpc("update_production_step_status", {
      p_step_id: step.id,
      p_status: nextStatus,
      p_note: nextNote || null,
      p_changed_by: operator,
    });

    if (error) {
      setErrorMessage("Errore aggiornamento stato: " + error.message);
      setSavingId("");
      return;
    }

    const boat = boatMap.get(step.boat_id);
    setMessage(
      `Ordine ${boat?.order_number || ""}: stato aggiornato a ${statusLabel[nextStatus] || nextStatus}.`
    );
    setSavingId("");
    await loadData();
  }

  function generatePdf() {
    if (!department) return;

    const rows = steps
      .map((step) => ({ step, boat: boatMap.get(step.boat_id) }))
      .filter((row) => row.boat)
      .sort((a, b) => (a.boat!.progressive_no - b.boat!.progressive_no));

    if (rows.length === 0) {
      setErrorMessage("Non ci sono battelli da inserire nel programma del reparto.");
      return;
    }

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const operator =
      localStorage.getItem("magazzino_display_name") ||
      localStorage.getItem("magazzino_user") ||
      "Matteo";

    const today = new Intl.DateTimeFormat("it-IT").format(new Date());

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("OPERATORE", 9, 10);
    doc.text(operator.toUpperCase(), 54, 10);
    doc.text("DATA PROGRAMMA", 9, 15);
    doc.text(today, 54, 15);
    doc.text("REPARTO", 9, 20);
    doc.text(department.name.toUpperCase(), 54, 20);

    const columns = [
      { x: 9, title: "Prog.", w: 15 },
      { x: 24, title: "N. ordine", w: 22 },
      { x: 46, title: "Modello battello", w: 38 },
      { x: 84, title: "Carena", w: 28 },
      { x: 112, title: "Ragno/Longheroni", w: 38 },
      { x: 150, title: "Coperta", w: 28 },
      { x: 178, title: "Accessori", w: 39 },
      { x: 217, title: "Stato", w: 30 },
      { x: 247, title: "Note", w: 41 },
    ];

    let y = 29;

    doc.setFontSize(6.4);
    doc.setFont("helvetica", "bold");

    for (const col of columns) {
      doc.rect(col.x, y - 4, col.w, 8);
      doc.text(col.title, col.x + 1.2, y + 1);
    }

    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);

    for (const row of rows) {
      const boat = row.boat!;
      const values = [
        String(boat.progressive_no),
        boat.order_number,
        boat.model_boat,
        boat.hull,
        boat.stringers,
        boat.deck,
        boat.accessories,
        statusLabel[row.step.status] || row.step.status,
        row.step.current_note || boat.note || "",
      ];

      const noteLines = doc.splitTextToSize(values[8], columns[8].w - 2);
      const modelLines = doc.splitTextToSize(values[2], columns[2].w - 2);
      const rowH = Math.max(8, noteLines.length * 3 + 3, modelLines.length * 3 + 3);

      if (y + rowH > 198) {
        doc.addPage();
        y = 12;
      }

      values.forEach((value, index) => {
        const col = columns[index];
        doc.rect(col.x, y, col.w, rowH);
        const content =
          index === 8
            ? noteLines
            : index === 2
              ? modelLines
              : doc.splitTextToSize(value, col.w - 2);

        doc.text(content, col.x + 1.2, y + 4);
      });

      y += rowH;
    }

    const safeName = department.name
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    doc.save(`Produzione_${safeName}_${today.replace(/\//g, "-")}.pdf`);
  }

  if (loading) {
    return (
      <div className="pdep-loading">
        Caricamento reparto...
        <Styles />
      </div>
    );
  }

  if (!department) {
    return (
      <div className="pdep-page">
        <div className="pdep-error">{errorMessage || "Reparto non trovato."}</div>
        <Link href="/produzione" className="pdep-btn secondary">
          ← Produzione
        </Link>
        <Styles />
      </div>
    );
  }

  return (
    <div className="pdep-page">
      <section className="pdep-hero">
        <div>
          <div className="pdep-eyebrow">PROGRAMMA REPARTO</div>
          <h1>{department.name}</h1>
          <p>
            Aggiorna lo stato ogni giorno. Lo storico resta salvato e alimenta
            automaticamente le medie di produzione.
          </p>
        </div>

        <div className="pdep-actions">
          <Link href="/produzione" className="pdep-btn secondary">
            ← Produzione
          </Link>
          <button type="button" className="pdep-btn secondary" onClick={loadData}>
            Aggiorna
          </button>
          <button type="button" className="pdep-btn primary" onClick={generatePdf}>
            Genera PDF reparto
          </button>
        </div>
      </section>

      {(message || errorMessage) && (
        <div className={errorMessage ? "pdep-message error" : "pdep-message success"}>
          {errorMessage || message}
        </div>
      )}

      <section className="pdep-summary">
        <div>
          <span>BATTELLI NEL REPARTO</span>
          <strong>{steps.length}</strong>
        </div>
        <div>
          <span>IN LAVORAZIONE</span>
          <strong>{steps.filter((step) => step.status === "working").length}</strong>
        </div>
        <div>
          <span>IN ATTESA</span>
          <strong>{steps.filter((step) => step.status === "waiting").length}</strong>
        </div>
        <div>
          <span>BLOCCATI</span>
          <strong>{steps.filter((step) => step.status === "blocked").length}</strong>
        </div>
      </section>

      <section className="pdep-card">
        <div className="pdep-table-wrap">
          <table className="pdep-table">
            <thead>
              <tr>
                <th>Prog.</th>
                <th>N° ordine</th>
                <th>Modello battello</th>
                <th>Carena</th>
                <th>Ragno/Longheroni</th>
                <th>Coperta</th>
                <th>Accessori</th>
                <th>Stato giornaliero</th>
                <th>Note / motivo attesa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {steps.length === 0 ? (
                <tr>
                  <td colSpan={10} className="pdep-empty">
                    Nessun battello attualmente in questo reparto.
                  </td>
                </tr>
              ) : (
                steps.map((step) => {
                  const boat = boatMap.get(step.boat_id);
                  if (!boat) return null;

                  return (
                    <tr
                      key={step.id}
                      className="pdep-row"
                      onDoubleClick={() => router.push(`/produzione/${boat.id}`)}
                    >
                      <td><strong>{boat.progressive_no}</strong></td>
                      <td>
                        <button
                          type="button"
                          className="pdep-order"
                          onClick={() => router.push(`/produzione/${boat.id}`)}
                        >
                          {boat.order_number}
                        </button>
                      </td>
                      <td>{boat.model_boat}</td>
                      <td>{boat.hull || "—"}</td>
                      <td>{boat.stringers || "—"}</td>
                      <td>{boat.deck || "—"}</td>
                      <td>{boat.accessories || "—"}</td>
                      <td>
                        <select
                          value={statusDrafts[step.id] || step.status}
                          onChange={(e) =>
                            setStatusDrafts((current) => ({
                              ...current,
                              [step.id]: e.target.value,
                            }))
                          }
                          className={`pdep-status-select ${
                            statusDrafts[step.id] || step.status
                          }`}
                        >
                          <option value="queued">Da iniziare</option>
                          <option value="working">In lavorazione</option>
                          <option value="waiting">In attesa</option>
                          <option value="blocked">Bloccato</option>
                          <option value="completed">Completato</option>
                        </select>
                      </td>
                      <td>
                        <input
                          className="pdep-note"
                          value={noteDrafts[step.id] ?? step.current_note ?? ""}
                          onChange={(e) =>
                            setNoteDrafts((current) => ({
                              ...current,
                              [step.id]: e.target.value,
                            }))
                          }
                          placeholder="Nota giornaliera..."
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="pdep-save"
                          disabled={savingId === step.id}
                          onClick={() => saveStatus(step)}
                        >
                          {savingId === step.id ? "..." : "Salva"}
                        </button>
                      </td>
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

function Styles() {
  return (
    <style jsx global>{`
      .pdep-page {
        width: 100%;
        max-width: 1550px;
        margin: 0 auto;
        color: #f8fafc;
      }

      .pdep-loading {
        min-height: 55vh;
        display: grid;
        place-items: center;
        color: #dbeafe;
        font-weight: 850;
      }

      .pdep-hero {
        padding: 21px 22px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        border: 1px solid rgba(59,130,246,.25);
        border-radius: 16px;
        background: linear-gradient(135deg,#0d1d31,#071321);
      }

      .pdep-eyebrow {
        color: #60a5fa;
        font-size: 9px;
        font-weight: 950;
        letter-spacing: 1.5px;
      }

      .pdep-hero h1 {
        margin: 5px 0 0;
        font-size: 30px;
        font-weight: 950;
        letter-spacing: -.7px;
      }

      .pdep-hero p {
        max-width: 730px;
        margin: 6px 0 0;
        color: #90a3ba;
        font-size: 10px;
        line-height: 1.55;
      }

      .pdep-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 7px;
      }

      .pdep-btn {
        min-height: 38px;
        padding: 0 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        cursor: pointer;
        text-decoration: none;
        font-size: 9px;
        font-weight: 900;
      }

      .pdep-btn.primary {
        border: 1px solid #2563eb;
        background: #2563eb;
        color: #fff;
      }

      .pdep-btn.secondary {
        border: 1px solid rgba(148,163,184,.22);
        background: rgba(255,255,255,.035);
        color: #e2e8f0;
      }

      .pdep-message,
      .pdep-error {
        margin-top: 11px;
        padding: 11px 13px;
        border-radius: 9px;
        font-size: 10px;
        font-weight: 800;
      }

      .pdep-message.success {
        border: 1px solid rgba(34,197,94,.28);
        background: rgba(34,197,94,.08);
        color: #86efac;
      }

      .pdep-message.error,
      .pdep-error {
        border: 1px solid rgba(239,68,68,.28);
        background: rgba(239,68,68,.08);
        color: #fca5a5;
      }

      .pdep-summary {
        margin-top: 11px;
        display: grid;
        grid-template-columns: repeat(4,minmax(0,1fr));
        gap: 8px;
      }

      .pdep-summary > div {
        padding: 12px 14px;
        border: 1px solid rgba(148,163,184,.14);
        border-radius: 10px;
        background: #0b192a;
      }

      .pdep-summary span,
      .pdep-summary strong {
        display: block;
      }

      .pdep-summary span {
        color: #8095af;
        font-size: 7px;
        font-weight: 950;
        letter-spacing: .7px;
      }

      .pdep-summary strong {
        margin-top: 4px;
        font-size: 21px;
      }

      .pdep-card {
        margin-top: 11px;
        padding: 9px;
        border: 1px solid rgba(96,165,250,.18);
        border-radius: 14px;
        background: #0a1727;
      }

      .pdep-table-wrap {
        overflow-x: auto;
        border: 1px solid rgba(148,163,184,.13);
        border-radius: 9px;
      }

      .pdep-table {
        width: 100%;
        min-width: 1440px;
        border-collapse: collapse;
        font-size: 9px;
      }

      .pdep-table th {
        padding: 9px;
        background: rgba(255,255,255,.03);
        color: #86a0bf;
        text-align: left;
        font-size: 7px;
        font-weight: 950;
        letter-spacing: .55px;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .pdep-table td {
        padding: 9px;
        border-top: 1px solid rgba(148,163,184,.09);
        white-space: nowrap;
        vertical-align: middle;
      }

      .pdep-row:hover {
        background: rgba(59,130,246,.045);
      }

      .pdep-order {
        padding: 5px 7px;
        border: 1px solid rgba(96,165,250,.24);
        border-radius: 6px;
        background: rgba(59,130,246,.08);
        color: #93c5fd;
        cursor: pointer;
        font-size: 9px;
        font-weight: 950;
      }

      .pdep-status-select,
      .pdep-note {
        min-height: 31px;
        box-sizing: border-box;
        border: 1px solid rgba(148,163,184,.20);
        border-radius: 6px;
        outline: none;
        background: #081524;
        color: #fff;
        font-size: 9px;
      }

      .pdep-status-select {
        min-width: 135px;
        padding: 0 7px;
        font-weight: 850;
      }

      .pdep-status-select.working { color: #93c5fd; }
      .pdep-status-select.waiting { color: #fbbf24; }
      .pdep-status-select.blocked { color: #fb7185; }
      .pdep-status-select.completed { color: #86efac; }

      .pdep-note {
        width: 220px;
        padding: 0 8px;
      }

      .pdep-save {
        min-height: 31px;
        padding: 0 9px;
        border: 1px solid rgba(59,130,246,.32);
        border-radius: 6px;
        background: rgba(59,130,246,.10);
        color: #93c5fd;
        cursor: pointer;
        font-size: 8px;
        font-weight: 950;
      }

      .pdep-save:disabled {
        opacity: .5;
        cursor: wait;
      }

      .pdep-empty {
        padding: 38px !important;
        color: #7388a3;
        text-align: center;
      }

      @media (max-width: 800px) {
        .pdep-hero {
          align-items: stretch;
          flex-direction: column;
        }

        .pdep-actions {
          justify-content: flex-start;
        }

        .pdep-summary {
          grid-template-columns: repeat(2,minmax(0,1fr));
        }
      }
    `}</style>
  );
}
