"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { fetchCompanyLogo } from "../../../../lib/pdfLogo";
import { buildDepartmentProgramPdf } from "../../../../lib/productionPdf";

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
  requested_delivery_date: string | null;
};

type Step = {
  id: string;
  boat_id: string;
  department_id: string;
  status: string;
  current_note: string | null;
  entered_at: string;
  printed_at: string | null;
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
  printed_at: string | null;
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
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Stampa PDF: il battello va scelto uno per uno con la spunta, non
  // con un intervallo di progressivi (mai contigui in pratica). Tutti
  // selezionati di default, cosi' "tutti i battelli" resta a zero click.
  const [pdfSelected, setPdfSelected] = useState<Record<string, boolean>>({});

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
        .select("id,progressive_no,order_number,model_boat,hull,stringers,deck,accessories,note,requested_delivery_date")
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
        requested_delivery_date: row.requested_delivery_date
          ? String(row.requested_delivery_date)
          : null,
      }));

      setBoats(cleanBoats);

      const boatIds = cleanBoats.map((boat) => boat.id);

      if (boatIds.length === 0) {
        setSteps([]);
        setNoteDrafts({});
        setTubolariMap({});
        setTubeColorDrafts({});
        setTubeDoneDrafts({});
        setTubeMountDrafts({});
        setColorOptions([]);
        setLoading(false);
        return;
      }

      const [stepRes, tubRes, optionsRes, printedRes] = await Promise.all([
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
        // Query separata e "silenziosa": finche' su Supabase non esiste
        // ancora la colonna printed_at, questa fallisce da sola senza far
        // sparire colore/spunte tubolari gia' salvati (vedi tubRes sopra).
        supabase.from("production_tubolari").select("boat_id,printed_at").in("boat_id", boatIds),
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
        printed_at: null,
      }));

      setSteps(cleanSteps);
      setNoteDrafts(
        Object.fromEntries(cleanSteps.map((step) => [step.id, step.current_note || ""]))
      );

      const printedMap: Record<string, string> = {};
      if (!printedRes.error) {
        (printedRes.data || []).forEach((row: any) => {
          if (row.printed_at) printedMap[String(row.boat_id)] = String(row.printed_at);
        });
      }

      const cleanTub: Tubolare[] = (tubRes.data || []).map((row: any) => ({
        id: String(row.id),
        boat_id: String(row.boat_id),
        tube_color: String(row.tube_color || ""),
        tube_done: Boolean(row.tube_done),
        tube_mount_done: Boolean(row.tube_mount_done),
        printed_at: printedMap[String(row.boat_id)] || null,
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

    // Query separata e "silenziosa" come per Tubolari: finche' printed_at
    // non esiste ancora su production_department_steps, fallisce da sola
    // senza intaccare il resto (nessuno step risultera' gia' stampato).
    const stepIds = (stepRes.data || []).map((row: any) => String(row.id));
    let stepPrintedMap: Record<string, string> = {};
    if (stepIds.length > 0) {
      const stepPrintedRes = await supabase
        .from("production_department_steps")
        .select("id,printed_at")
        .in("id", stepIds);
      if (!stepPrintedRes.error) {
        stepPrintedMap = Object.fromEntries(
          (stepPrintedRes.data || [])
            .filter((row: any) => row.printed_at)
            .map((row: any) => [String(row.id), String(row.printed_at)])
        );
      }
    }

    const cleanSteps: Step[] = (stepRes.data || []).map((row: any) => ({
      id: String(row.id),
      boat_id: String(row.boat_id),
      department_id: String(row.department_id),
      status: String(row.status || "queued"),
      current_note: row.current_note ? String(row.current_note) : null,
      entered_at: String(row.entered_at || ""),
      printed_at: stepPrintedMap[String(row.id)] || null,
    }));

    setSteps(cleanSteps);
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
      .select(
        "id,progressive_no,order_number,model_boat,hull,stringers,deck,accessories,note,requested_delivery_date"
      )
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
        requested_delivery_date: row.requested_delivery_date
          ? String(row.requested_delivery_date)
          : null,
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
    const list = isTubolariDept
      ? boats.map((boat) => ({
          key: `boat-${boat.id}`,
          boat,
          step: steps.find((s) => s.boat_id === boat.id) || null,
        }))
      : steps
          .map((step) => ({ key: `step-${step.id}`, step, boat: boatMap.get(step.boat_id) }))
          .filter(
            (row): row is { key: string; step: Step; boat: Boat } => Boolean(row.boat)
          );

    // Ordinati per data di consegna richiesta (come nel PDF): prima le
    // consegne piu' vicine, chi non ha una data va in fondo; a parita'
    // di data (o assenza), per progressivo.
    return [...list].sort((a, b) => {
      const ad = a.boat.requested_delivery_date;
      const bd = b.boat.requested_delivery_date;
      if (ad && bd) {
        if (ad !== bd) return ad < bd ? -1 : 1;
      } else if (ad || bd) {
        return ad ? -1 : 1;
      }
      return (a.boat.progressive_no ?? Infinity) - (b.boat.progressive_no ?? Infinity);
    });
  }, [isTubolariDept, boats, steps, boatMap]);

  // Nuovo battello arrivato in reparto -> selezionato di default. Un
  // battello che sceglie di deselezionare resta deselezionato anche
  // dopo un salvataggio/ricarica, finche' non lo tocca di nuovo lui.
  useEffect(() => {
    setPdfSelected((current) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const row of rows) {
        const id = row.boat.id;
        // Un battello/passaggio gia' stampato parte deselezionato (cosi'
        // non finisce per sbaglio nel prossimo PDF), ma resta comunque in
        // tabella per poter lavorarci sopra; l'operatore puo' comunque
        // rispuntarlo se vuole ristamparlo apposta.
        const defaultChecked = isTubolariDept
          ? !tubolariMap[id]?.printed_at
          : !row.step?.printed_at;
        next[id] = id in current ? current[id] : defaultChecked;
        if (next[id] !== current[id]) changed = true;
      }
      if (!changed && Object.keys(current).length === Object.keys(next).length) {
        return current;
      }
      return next;
    });
  }, [rows, isTubolariDept, tubolariMap]);

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

  async function saveNote(step: Step) {
    const nextNote = (noteDrafts[step.id] || "").trim();

    setSavingId(step.id);
    setMessage("");
    setErrorMessage("");

    const operator =
      localStorage.getItem("magazzino_display_name") ||
      localStorage.getItem("magazzino_user") ||
      "Matteo";

    const { error } = await supabase.rpc("update_production_step_status", {
      p_step_id: step.id,
      p_status: step.status,
      p_note: nextNote || null,
      p_changed_by: operator,
    });

    if (error) {
      setErrorMessage("Errore salvataggio nota: " + error.message);
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
    setMessage(`Ordine ${boat?.order_number || ""}: nota salvata.`);
    setSavingId("");
    await loadData();
  }

  async function completeStep(step: Step) {
    const nextNote = (noteDrafts[step.id] || "").trim();

    const confirmed = window.confirm(
      "Confermi il completamento di questo reparto?\n\nIl battello uscirà da questo reparto e passerà automaticamente al reparto successivo."
    );

    if (!confirmed) return;

    setSavingId(step.id);
    setMessage("");
    setErrorMessage("");

    const operator =
      localStorage.getItem("magazzino_display_name") ||
      localStorage.getItem("magazzino_user") ||
      "Matteo";

    const { error } = await supabase.rpc("update_production_step_status", {
      p_step_id: step.id,
      p_status: "completed",
      p_note: nextNote || null,
      p_changed_by: operator,
    });

    if (error) {
      setErrorMessage("Errore completamento reparto: " + error.message);
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
    setMessage(`Ordine ${boat?.order_number || ""}: reparto completato.`);
    setSavingId("");
    await loadData();
  }

  async function generatePdf() {
    if (!department) return;

    setErrorMessage("");

    const operator =
      localStorage.getItem("magazzino_display_name") ||
      localStorage.getItem("magazzino_user") ||
      "Matteo";

    const selectedRows = rows.filter((row) => pdfSelected[row.boat.id]);

    if (selectedRows.length === 0) {
      setErrorMessage("Seleziona almeno un battello prima di generare il PDF.");
      return;
    }

    try {
      const companyLogo = await fetchCompanyLogo();

      const { doc, filename } = buildDepartmentProgramPdf({
        departmentName: department.name,
        isTubolari: isTubolariDept,
        rows: selectedRows,
        tubolariMap,
        companyLogo,
        operator,
      });

      doc.save(filename);

      // Tubolari: segna i battelli appena stampati (stessa logica della
      // pagina principale) cosi' partono deselezionati nel prossimo giro.
      // Se printed_at non esiste ancora su Supabase l'upsert fallisce da
      // solo, senza intaccare il PDF gia' generato.
      if (isTubolariDept) {
        const now = new Date().toISOString();
        const upsertRows = selectedRows.map((row) => ({
          boat_id: row.boat.id,
          tube_color: tubolariMap[row.boat.id]?.tube_color || "",
          tube_done: tubolariMap[row.boat.id]?.tube_done || false,
          tube_mount_done: tubolariMap[row.boat.id]?.tube_mount_done || false,
          printed_at: now,
        }));
        const { error: markError } = await supabase
          .from("production_tubolari")
          .upsert(upsertRows, { onConflict: "boat_id" });

        if (!markError) {
          setTubolariMap((current) => {
            const next = { ...current };
            selectedRows.forEach((row) => {
              const id = row.boat.id;
              next[id] = {
                id: current[id]?.id || "",
                boat_id: id,
                tube_color: current[id]?.tube_color || "",
                tube_done: current[id]?.tube_done || false,
                tube_mount_done: current[id]?.tube_mount_done || false,
                printed_at: now,
              };
            });
            return next;
          });
        }
      } else {
        // Reparti normali (es. Verniciatura): stesso segno, ma sullo step
        // in reparto - se printed_at non esiste ancora su Supabase l'update
        // fallisce da solo, senza intaccare il PDF gia' generato.
        const now = new Date().toISOString();
        const stepIds = selectedRows.map((row) => row.step?.id).filter(Boolean) as string[];
        if (stepIds.length > 0) {
          const { error: markError } = await supabase
            .from("production_department_steps")
            .update({ printed_at: now })
            .in("id", stepIds);

          if (!markError) {
            setSteps((current) =>
              current.map((step) =>
                stepIds.includes(step.id) ? { ...step, printed_at: now } : step
              )
            );
          }
        }
      }
    } catch (pdfError) {
      setErrorMessage(
        pdfError instanceof Error ? pdfError.message : "Impossibile creare il PDF. Riprova."
      );
    }
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
            Segna una nota se serve, poi completa il reparto quando il
            battello è pronto per passare al successivo.
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
          Spunta nella tabella qui sotto i battelli da mettere nel programma
          (in qualsiasi combinazione, non serve che siano di fila) e genera
          il PDF.
        </p>
        <div className="pdep-pdf-controls">
          <span className="pdep-pdf-count">
            {rows.filter((row) => pdfSelected[row.boat.id]).length} di {rows.length} selezionati
          </span>
          <button
            type="button"
            className="pdep-btn secondary"
            onClick={() =>
              setPdfSelected(
                Object.fromEntries(rows.map((row) => [row.boat.id, true]))
              )
            }
          >
            Seleziona tutti
          </button>
          <button
            type="button"
            className="pdep-btn secondary"
            onClick={() =>
              setPdfSelected(
                Object.fromEntries(rows.map((row) => [row.boat.id, false]))
              )
            }
          >
            Deseleziona tutti
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
      </section>

      <section className="pdep-card">
        <div className="pdep-table-wrap">
          <table className="pdep-table">
            <thead>
              <tr>
                <th className="pdep-pdf-check-col">
                  <input
                    type="checkbox"
                    title="Seleziona/deseleziona tutti per il PDF"
                    checked={rows.length > 0 && rows.every((row) => pdfSelected[row.boat.id])}
                    onChange={(e) =>
                      setPdfSelected(
                        Object.fromEntries(rows.map((row) => [row.boat.id, e.target.checked]))
                      )
                    }
                  />
                </th>
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
                <th>Note</th>
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
                      <td className="pdep-pdf-check-col" onDoubleClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={Boolean(pdfSelected[boat.id])}
                          onChange={(e) =>
                            setPdfSelected((current) => ({
                              ...current,
                              [boat.id]: e.target.checked,
                            }))
                          }
                        />
                      </td>
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
                          <input
                            className="pdep-note"
                            value={noteDrafts[step.id] ?? step.current_note ?? ""}
                            onChange={(e) =>
                              setNoteDrafts((current) => ({
                                ...current,
                                [step.id]: e.target.value,
                              }))
                            }
                            placeholder="Nota (facoltativa)..."
                          />
                        ) : (
                          <span className="pdep-not-arrived">
                            Non ancora arrivato{boat.note ? ` · ${boat.note}` : ""}
                          </span>
                        )}
                      </td>
                      <td className="pdep-actions-cell">
                        {step ? (
                          <>
                            <button
                              type="button"
                              className="pdep-save"
                              disabled={savingId === step.id}
                              onClick={() => saveNote(step)}
                            >
                              {savingId === step.id ? "..." : "Salva nota"}
                            </button>
                            <button
                              type="button"
                              className="pdep-complete"
                              disabled={savingId === step.id}
                              onClick={() => completeStep(step)}
                            >
                              Completa reparto →
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="pdep-save"
                            disabled={savingId === boat.id}
                            onClick={() => saveTubeOnly(boat.id)}
                          >
                            {savingId === boat.id ? "..." : "Salva"}
                          </button>
                        )}
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

      .pdep-pdf-count {
        margin-right: 4px;
        padding: 8px 12px;
        border: 1px solid rgba(148,163,184,.20);
        border-radius: 8px;
        background: rgba(59,130,246,.08);
        color: #dbeafe;
        font-size: 11px;
        font-weight: 850;
        white-space: nowrap;
      }

      .pdep-pdf-check-col {
        width: 32px;
        text-align: center;
      }

      .pdep-pdf-check-col input[type="checkbox"] {
        width: 15px;
        height: 15px;
        cursor: pointer;
        accent-color: #2563eb;
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

      .pdep-actions-cell {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
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
        white-space: nowrap;
      }

      .pdep-complete {
        min-height: 31px;
        padding: 0 10px;
        border: 1px solid rgba(34,197,94,.35);
        border-radius: 6px;
        background: rgba(34,197,94,.12);
        color: #86efac;
        cursor: pointer;
        font-size: 8px;
        font-weight: 950;
        white-space: nowrap;
      }

      .pdep-save:disabled,
      .pdep-complete:disabled {
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
