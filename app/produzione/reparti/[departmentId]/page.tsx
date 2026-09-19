"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";
import { supabase } from "../../../../lib/supabaseClient";
import { fetchCompanyLogo, drawCompanyLogoTopRight } from "../../../../lib/pdfLogo";

type Department = {
  id: string;
  name: string;
  sort_order: number;
};

type Boat = {
  id: string;
  progressive_no: number | null;
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

type ProductionOption = {
  id: string;
  option_type: "model" | "color";
  name: string;
};

type Tubolare = {
  id: string;
  boat_id: string;
  tube_color: string;
  tube_done: boolean;
  tube_mount_done: boolean;
};

const statusLabel: Record<string, string> = {
  queued: "Da iniziare",
  working: "In lavorazione",
  waiting: "In attesa",
  blocked: "Bloccato",
  completed: "Completato",
};

function isTubolariName(name: string) {
  return name.trim().toLowerCase() === "tubolari";
}

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

  // Stampa PDF solo di un intervallo di battelli, scelto con il vero
  // numero progressivo (quello nella colonna "Prog."), non con la
  // posizione in tabella. Vuoti = stampa tutti i battelli del reparto.
  const [pdfFromProg, setPdfFromProg] = useState("");
  const [pdfToProg, setPdfToProg] = useState("");

  // Scheda Tubolari: colore + i due passaggi da spuntare. Caricata e
  // mostrata SOLO quando questo reparto e' "Tubolari" - gli altri reparti
  // non fanno nemmeno la query, quindi non la vedono mai.
  const [colorOptions, setColorOptions] = useState<ProductionOption[]>([]);
  const [tubolariMap, setTubolariMap] = useState<Record<string, Tubolare>>({});
  const [tubeColorDrafts, setTubeColorDrafts] = useState<Record<string, string>>({});
  const [tubeDoneDrafts, setTubeDoneDrafts] = useState<Record<string, boolean>>({});
  const [tubeMountDrafts, setTubeMountDrafts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadData();
  }, [departmentId]);

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const depRes = await supabase
      .from("production_departments")
      .select("id,name,sort_order")
      .eq("id", departmentId)
      .maybeSingle();

    if (depRes.error || !depRes.data) {
      setErrorMessage("Reparto non trovato.");
      setLoading(false);
      return;
    }

    const cleanDepartment = {
      id: String(depRes.data.id),
      name: String(depRes.data.name || ""),
      sort_order: Number(depRes.data.sort_order || 0),
    };

    setDepartment(cleanDepartment);

    const tubolariDept = isTubolariName(cleanDepartment.name);

    if (tubolariDept) {
      // Tubolari: mostra TUTTI gli ordini attivi, non solo quelli il cui
      // passaggio è già arrivato qui - così si può preparare/stampare la
      // scheda tubolare in anticipo, indipendentemente da dove si trova
      // davvero oggi il battello nel percorso produttivo.
      const boatRes = await supabase
        .from("production_boats")
        .select("id,progressive_no,order_number,model_boat,hull,stringers,deck,accessories,note")
        .eq("status", "active")
        .order("progressive_no", { ascending: true });

      if (boatRes.error) {
        setErrorMessage("Errore caricamento battelli: " + boatRes.error.message);
        setLoading(false);
        return;
      }

      const cleanBoats: Boat[] = (boatRes.data || []).map((row: any) => ({
        id: String(row.id),
        progressive_no:
          row.progressive_no === null || row.progressive_no === undefined
            ? null
            : Number(row.progressive_no),
        order_number: String(row.order_number || ""),
        model_boat: String(row.model_boat || ""),
        hull: String(row.hull || ""),
        stringers: String(row.stringers || ""),
        deck: String(row.deck || ""),
        accessories: String(row.accessories || ""),
        note: row.note ? String(row.note) : null,
      }));

      setBoats(cleanBoats);

      const boatIds = cleanBoats.map((boat) => boat.id);

      if (boatIds.length === 0) {
        setSteps([]);
        setStatusDrafts({});
        setNoteDrafts({});
        setTubolariMap({});
        setTubeColorDrafts({});
        setTubeDoneDrafts({});
        setTubeMountDrafts({});
        setColorOptions([]);
        setLoading(false);
        return;
      }

      const [stepRes, tubRes, optionsRes] = await Promise.all([
        supabase
          .from("production_department_steps")
          .select("id,boat_id,department_id,status,current_note,entered_at")
          .eq("department_id", departmentId)
          .in("boat_id", boatIds),
        supabase
          .from("production_tubolari")
          .select("id,boat_id,tube_color,tube_done,tube_mount_done")
          .in("boat_id", boatIds),
        supabase
          .from("production_options")
          .select("id,option_type,name")
          .eq("option_type", "color")
          .eq("active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      ]);

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

      setSteps(cleanSteps);
      setStatusDrafts(Object.fromEntries(cleanSteps.map((step) => [step.id, step.status])));
      setNoteDrafts(
        Object.fromEntries(cleanSteps.map((step) => [step.id, step.current_note || ""]))
      );

      const cleanTub: Tubolare[] = (tubRes.data || []).map((row: any) => ({
        id: String(row.id),
        boat_id: String(row.boat_id),
        tube_color: String(row.tube_color || ""),
        tube_done: Boolean(row.tube_done),
        tube_mount_done: Boolean(row.tube_mount_done),
      }));

      const tubMap = Object.fromEntries(cleanTub.map((t) => [t.boat_id, t]));
      setTubolariMap(tubMap);
      setTubeColorDrafts(
        Object.fromEntries(boatIds.map((id) => [id, tubMap[id]?.tube_color || ""]))
      );
      setTubeDoneDrafts(
        Object.fromEntries(boatIds.map((id) => [id, tubMap[id]?.tube_done || false]))
      );
      setTubeMountDrafts(
        Object.fromEntries(boatIds.map((id) => [id, tubMap[id]?.tube_mount_done || false]))
      );
      setColorOptions(
        (optionsRes.data || []).map((row: any) => ({
          id: String(row.id),
          option_type: "color" as const,
          name: String(row.name || ""),
        }))
      );

      setLoading(false);
      return;
    }

    // Reparti normali: comportamento invariato - solo i battelli il cui
    // passaggio in QUESTO reparto è ancora aperto (sequenziale).
    const stepRes = await supabase
      .from("production_department_steps")
      .select("id,boat_id,department_id,status,current_note,entered_at")
      .eq("department_id", departmentId)
      .neq("status", "completed")
      .order("entered_at", { ascending: true });

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

    setSteps(cleanSteps);
    setStatusDrafts(
      Object.fromEntries(cleanSteps.map((step) => [step.id, step.status]))
    );
    setNoteDrafts(
      Object.fromEntries(cleanSteps.map((step) => [step.id, step.current_note || ""]))
    );
    setTubolariMap({});
    setTubeColorDrafts({});
    setTubeDoneDrafts({});
    setTubeMountDrafts({});
    setColorOptions([]);

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
        progressive_no:
          row.progressive_no === null || row.progressive_no === undefined
            ? null
            : Number(row.progressive_no),
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

  const isTubolariDept = Boolean(department && isTubolariName(department.name));

  // Righe della tabella: per Tubolari è un battello per ogni ordine attivo
  // (il passaggio reparto, se esiste già, è opzionale); per gli altri
  // reparti resta un battello per ogni passaggio ancora aperto qui.
  const rows = useMemo(() => {
    if (isTubolariDept) {
      return boats.map((boat) => ({
        key: `boat-${boat.id}`,
        boat,
        step: steps.find((s) => s.boat_id === boat.id) || null,
      }));
    }

    return steps
      .map((step) => ({ key: `step-${step.id}`, step, boat: boatMap.get(step.boat_id) }))
      .filter(
        (row): row is { key: string; step: Step; boat: Boat } => Boolean(row.boat)
      );
  }, [isTubolariDept, boats, steps, boatMap]);

  // Numero progressivo: non e' piu' assegnato in automatico, si inserisce
  // a mano qui (o dalla pagina principale) solo quando serve per stampare
  // il programma di reparto in PDF.
  function editProgressiveDraft(boatId: string, value: string) {
    const parsed = value.trim() === "" ? null : Number(value);
    setBoats((current) =>
      current.map((boat) =>
        boat.id === boatId ? { ...boat, progressive_no: parsed } : boat
      )
    );
  }

  async function saveProgressive(boatId: string, value: string) {
    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);

    if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)) {
      return;
    }

    await supabase
      .from("production_boats")
      .update({ progressive_no: parsed })
      .eq("id", boatId);
  }

  async function saveTubeOnly(boatId: string) {
    setSavingId(boatId);
    setMessage("");
    setErrorMessage("");

    const tubError = await supabase.from("production_tubolari").upsert(
      {
        boat_id: boatId,
        tube_color: (tubeColorDrafts[boatId] || "").trim(),
        tube_done: Boolean(tubeDoneDrafts[boatId]),
        tube_mount_done: Boolean(tubeMountDrafts[boatId]),
      },
      { onConflict: "boat_id" }
    );

    if (tubError.error) {
      setErrorMessage("Errore salvataggio scheda tubolari: " + tubError.error.message);
      setSavingId("");
      return;
    }

    const boat = boatMap.get(boatId);
    setMessage(`Ordine ${boat?.order_number || ""}: scheda tubolari aggiornata.`);
    setSavingId("");
    await loadData();
  }

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

    if (isTubolariDept) {
      const tubError = await supabase.from("production_tubolari").upsert(
        {
          boat_id: step.boat_id,
          tube_color: (tubeColorDrafts[step.boat_id] || "").trim(),
          tube_done: Boolean(tubeDoneDrafts[step.boat_id]),
          tube_mount_done: Boolean(tubeMountDrafts[step.boat_id]),
        },
        { onConflict: "boat_id" }
      );

      if (tubError.error) {
        setErrorMessage("Errore salvataggio scheda tubolari: " + tubError.error.message);
        setSavingId("");
        return;
      }
    }

    const boat = boatMap.get(step.boat_id);
    setMessage(
      `Ordine ${boat?.order_number || ""}: stato aggiornato a ${statusLabel[nextStatus] || nextStatus}.`
    );
    setSavingId("");
    await loadData();
  }

  async function generatePdf() {
    if (!department) return;

    setErrorMessage("");

    const sortedRows = [...rows].sort(
      (a, b) =>
        (a.boat.progressive_no ?? Infinity) - (b.boat.progressive_no ?? Infinity)
    );

    const fromText = pdfFromProg.trim();
    const toText = pdfToProg.trim();

    let fromNumber = fromText ? Number(fromText) : null;
    let toNumber = toText ? Number(toText) : null;

    if (fromText && (!Number.isFinite(fromNumber) || Number(fromNumber) <= 0)) {
      setErrorMessage("Il progressivo \"Da\" non è valido.");
      return;
    }

    if (toText && (!Number.isFinite(toNumber) || Number(toNumber) <= 0)) {
      setErrorMessage("Il progressivo \"A\" non è valido.");
      return;
    }

    if (fromNumber !== null && toNumber !== null && fromNumber > toNumber) {
      setErrorMessage("Il progressivo \"Da\" deve essere minore o uguale a \"A\".");
      return;
    }

    const pdfRows = sortedRows.filter((row) => {
      const prog = row.boat.progressive_no;
      if (fromNumber !== null || toNumber !== null) {
        // Con un intervallo impostato, i battelli senza progressivo
        // assegnato non possono rientrarci: li si esclude.
        if (prog === null) return false;
        if (fromNumber !== null && prog < fromNumber) return false;
        if (toNumber !== null && prog > toNumber) return false;
      }
      return true;
    });

    if (pdfRows.length === 0) {
      setErrorMessage(
        fromText || toText
          ? "Nessun battello del reparto rientra nell'intervallo di progressivi indicato."
          : "Non ci sono battelli da inserire nel programma del reparto."
      );
      return;
    }

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const companyLogo = await fetchCompanyLogo();
    drawCompanyLogoTopRight(doc, companyLogo, { maxWidth: 34, maxHeight: 16 });

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

    const columns = isTubolariDept
      ? [
          { x: 9, title: "Prog.", w: 14 },
          { x: 23, title: "N. ordine", w: 20 },
          { x: 43, title: "Modello battello", w: 34 },
          { x: 77, title: "Carena", w: 24 },
          { x: 101, title: "Colore tubolare", w: 30 },
          { x: 131, title: "Tubo", w: 18 },
          { x: 149, title: "Montaggio tubo", w: 28 },
          { x: 177, title: "Stato", w: 26 },
          { x: 203, title: "Note", w: 33 },
        ]
      : [
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

    for (const row of pdfRows) {
      const boat = row.boat;
      const tub = tubolariMap[boat.id];
      const stepStatusText = row.step
        ? statusLabel[row.step.status] || row.step.status
        : "Non ancora arrivato";
      const noteText = row.step?.current_note || boat.note || "";

      const values = isTubolariDept
        ? [
            boat.progressive_no !== null ? String(boat.progressive_no) : "-",
            boat.order_number,
            boat.model_boat,
            boat.hull,
            tub?.tube_color || "-",
            tub?.tube_done ? "Fatto" : "-",
            tub?.tube_mount_done ? "Fatto" : "-",
            stepStatusText,
            noteText,
          ]
        : [
            boat.progressive_no !== null ? String(boat.progressive_no) : "-",
            boat.order_number,
            boat.model_boat,
            boat.hull,
            boat.stringers,
            boat.deck,
            boat.accessories,
            stepStatusText,
            noteText,
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

    const rangeSuffix =
      fromNumber !== null || toNumber !== null
        ? `_prog_${fromNumber ?? "inizio"}-${toNumber ?? "fine"}`
        : "";

    doc.save(
      `Produzione_${safeName}${rangeSuffix}_${today.replace(/\//g, "-")}.pdf`
    );
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
        </div>
      </section>

      {(message || errorMessage) && (
        <div className={errorMessage ? "pdep-message error" : "pdep-message success"}>
          {errorMessage || message}
        </div>
      )}

      <section className="pdep-pdf-panel">
        <strong>Stampa PDF reparto</strong>
        <p>
          Lascia vuoto per stampare tutti i battelli, oppure scegli un
          intervallo di numeri progressivi (quelli della colonna “Prog.”).
        </p>
        <div className="pdep-pdf-controls">
          <label>
            Da progressivo
            <input
              type="number"
              min="1"
              step="1"
              placeholder="Es. 1900"
              value={pdfFromProg}
              onChange={(e) => setPdfFromProg(e.target.value)}
            />
          </label>
          <label>
            A progressivo
            <input
              type="number"
              min="1"
              step="1"
              placeholder="Es. 1920"
              value={pdfToProg}
              onChange={(e) => setPdfToProg(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="pdep-btn secondary"
            onClick={() => {
              setPdfFromProg("");
              setPdfToProg("");
            }}
          >
            Tutti i battelli
          </button>
          <button type="button" className="pdep-btn primary" onClick={generatePdf}>
            Genera PDF reparto
          </button>
        </div>
      </section>

      <section className="pdep-summary">
        <div>
          <span>{isTubolariDept ? "ORDINI ATTIVI" : "BATTELLI NEL REPARTO"}</span>
          <strong>{rows.length}</strong>
        </div>
        <div>
          <span>IN LAVORAZIONE</span>
          <strong>{rows.filter((row) => row.step?.status === "working").length}</strong>
        </div>
        <div>
          <span>IN ATTESA</span>
          <strong>{rows.filter((row) => row.step?.status === "waiting").length}</strong>
        </div>
        <div>
          <span>BLOCCATI</span>
          <strong>{rows.filter((row) => row.step?.status === "blocked").length}</strong>
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
                {isTubolariDept ? (
                  <>
                    <th>Colore tubolare</th>
                    <th>Tubo</th>
                    <th>Montaggio tubo</th>
                  </>
                ) : (
                  <>
                    <th>Ragno/Longheroni</th>
                    <th>Coperta</th>
                    <th>Accessori</th>
                  </>
                )}
                <th>Stato giornaliero</th>
                <th>Note / motivo attesa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="pdep-empty">
                    {isTubolariDept
                      ? "Nessun ordine attivo in produzione."
                      : "Nessun battello attualmente in questo reparto."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const boat = row.boat;
                  const step = row.step;

                  return (
                    <tr
                      key={row.key}
                      className="pdep-row"
                      onDoubleClick={() => router.push(`/produzione/${boat.id}`)}
                    >
                      <td className="pdep-prog-cell" onDoubleClick={(e) => e.stopPropagation()}>
                        <input
                          type="number"
                          min="1"
                          className="pdep-prog-input"
                          placeholder="—"
                          value={boat.progressive_no ?? ""}
                          onChange={(e) => editProgressiveDraft(boat.id, e.target.value)}
                          onBlur={(e) => saveProgressive(boat.id, e.target.value)}
                        />
                      </td>
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
                      {isTubolariDept ? (
                        <>
                          <td>
                            <select
                              className="pdep-tube-select"
                              value={tubeColorDrafts[boat.id] ?? ""}
                              onChange={(e) =>
                                setTubeColorDrafts((current) => ({
                                  ...current,
                                  [boat.id]: e.target.value,
                                }))
                              }
                            >
                              <option value="">Seleziona colore...</option>
                              {colorOptions.map((option) => (
                                <option key={option.id} value={option.name}>
                                  {option.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <label className="pdep-tube-check">
                              <input
                                type="checkbox"
                                checked={Boolean(tubeDoneDrafts[boat.id])}
                                onChange={(e) =>
                                  setTubeDoneDrafts((current) => ({
                                    ...current,
                                    [boat.id]: e.target.checked,
                                  }))
                                }
                              />
                              Fatto
                            </label>
                          </td>
                          <td>
                            <label className="pdep-tube-check">
                              <input
                                type="checkbox"
                                checked={Boolean(tubeMountDrafts[boat.id])}
                                onChange={(e) =>
                                  setTubeMountDrafts((current) => ({
                                    ...current,
                                    [boat.id]: e.target.checked,
                                  }))
                                }
                              />
                              Fatto
                            </label>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{boat.stringers || "—"}</td>
                          <td>{boat.deck || "—"}</td>
                          <td>{boat.accessories || "—"}</td>
                        </>
                      )}
                      <td>
                        {step ? (
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
                        ) : (
                          <span className="pdep-not-arrived">Non ancora arrivato</span>
                        )}
                      </td>
                      <td>
                        {step ? (
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
                        ) : (
                          <span className="pdep-note-readonly">{boat.note || "—"}</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="pdep-save"
                          disabled={savingId === (step ? step.id : boat.id)}
                          onClick={() => (step ? saveStatus(step) : saveTubeOnly(boat.id))}
                        >
                          {savingId === (step ? step.id : boat.id) ? "..." : "Salva"}
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

      .pdep-pdf-panel {
        margin-top: 11px;
        padding: 15px 16px;
        border: 1px solid rgba(96,165,250,.18);
        border-radius: 13px;
        background: #0a1727;
      }

      .pdep-pdf-panel > strong {
        display: block;
        font-size: 13px;
        font-weight: 900;
      }

      .pdep-pdf-panel > p {
        margin: 5px 0 0;
        max-width: 640px;
        color: #90a3ba;
        font-size: 10px;
        line-height: 1.5;
      }

      .pdep-pdf-controls {
        margin-top: 11px;
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: 9px;
      }

      .pdep-pdf-controls label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        color: #8095af;
        font-size: 8px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: .4px;
      }

      .pdep-pdf-controls input {
        min-height: 36px;
        width: 120px;
        box-sizing: border-box;
        padding: 0 9px;
        border: 1px solid rgba(148,163,184,.20);
        border-radius: 8px;
        outline: none;
        background: #081524;
        color: #fff;
        font-size: 11px;
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

      .pdep-prog-cell {
        padding: 6px !important;
      }

      .pdep-prog-input {
        width: 52px;
        min-height: 28px;
        padding: 0 6px;
        background: #081524;
        color: #fff;
        border: 1px solid rgba(148,163,184,.22);
        border-radius: 6px;
        font-size: 10.5px;
        font-weight: 800;
        text-align: center;
      }

      .pdep-prog-input:focus {
        outline: none;
        border-color: rgba(96,165,250,.55);
      }

      .pdep-status-select,
      .pdep-note,
      .pdep-tube-select {
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

      .pdep-tube-select {
        min-width: 130px;
        padding: 0 7px;
      }

      .pdep-tube-check {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #cbd5e1;
        font-size: 9px;
        font-weight: 800;
        cursor: pointer;
      }

      .pdep-tube-check input {
        width: 15px;
        height: 15px;
        accent-color: #2563eb;
        cursor: pointer;
      }

      .pdep-note {
        width: 220px;
        padding: 0 8px;
      }

      .pdep-not-arrived {
        color: #7388a3;
        font-size: 8px;
        font-weight: 800;
        font-style: italic;
      }

      .pdep-note-readonly {
        color: #9eb0c5;
        font-size: 9px;
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
