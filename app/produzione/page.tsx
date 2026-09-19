"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type Department = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
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
  status: string;
  created_at: string;
  completed_at: string | null;
  requested_delivery_date: string | null;
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

type UpholsterySupplier = {
  id: string;
  name: string;
};

type UpholsteryItemLookup = {
  id: string;
  supplierId: string;
  description: string;
};

type UpholsteryOptionRow = {
  id: string;
  supplierId: string;
  option_type: "color" | "details_logos" | "stitching" | "quilting";
  name: string;
};

type BoatUpholsteryDraftRow = {
  key: string;
  supplierId: string;
  itemId: string;
  color: string;
  detailsLogos: string;
  stitching: string;
  quilting: string;
  note: string;
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

  const [pdfLogo, setPdfLogo] = useState("");
  const [pdfLogoLoading, setPdfLogoLoading] = useState(true);

  const [upholsteryPdfBusy, setUpholsteryPdfBusy] = useState(false);
  const [upholsteryPdfError, setUpholsteryPdfError] = useState("");

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

  /*
    STATO TAPPEZZERIE BATTELLI

    Una riga per ogni "richiesta" di tappezzeria di ogni battello
    (un battello puo' averne piu' di una). Lo stato (ASSEGNATA /
    IN ORDINE / DA ORDINARE) viene calcolato qui, allo stesso modo
    della scheda del singolo battello, guardando kit_id e le righe
    ordine collegate - non e' mai salvato in una colonna a parte.
  */
  async function downloadUpholsteryStatusPdf() {
    setUpholsteryPdfError("");
    setUpholsteryPdfBusy(true);

    try {
      if (!pdfLogo) {
        throw new Error("Carica il logo aziendale prima di scaricare il PDF.");
      }

      const { data, error } = await supabase
        .from("production_boat_upholstery")
        .select(
          "id,item_id,color,details_logos,stitching,quilting,kit_id,created_at,production_boats(order_number,model_boat),upholstery_kits(matricola),order_items(qty,received_qty,requested_delivery_date)"
        )
        .order("created_at", { ascending: true });

      if (error) throw error;

      const requirementRows = (data || []) as any[];

      if (requirementRows.length === 0) {
        throw new Error("Non ci sono ancora richieste di tappezzeria collegate a nessun battello.");
      }

      const itemIds = Array.from(
        new Set(requirementRows.map((row) => String(row.item_id)))
      );

      let itemDescriptionById: Record<string, string> = {};

      if (itemIds.length > 0) {
        const { data: itemRows } = await supabase
          .from("items")
          .select("id,description")
          .in("id", itemIds);

        (itemRows || []).forEach((item: any) => {
          itemDescriptionById[String(item.id)] = String(item.description || "");
        });
      }

      const collator = new Intl.Collator("it", { numeric: true, sensitivity: "base" });

      const { buildUpholsteryStatusPdf } = await import("../../lib/productionPdf");

      const rows = requirementRows
        .map((row) => {
          const openLines = (row.order_items || []).filter(
            (line: any) => Number(line.qty || 0) > Number(line.received_qty || 0)
          );

          const deliveryDates = openLines
            .map((line: any) => line.requested_delivery_date)
            .filter((value: any) => Boolean(value))
            .sort();

          const kitMatricola = row.upholstery_kits
            ? Number(row.upholstery_kits.matricola)
            : null;

          const status: "assegnata" | "ordine" | "da_ordinare" = row.kit_id
            ? "assegnata"
            : openLines.length > 0
              ? "ordine"
              : "da_ordinare";

          const statusInfo =
            status === "assegnata"
              ? kitMatricola
                ? `Kit N. ${kitMatricola}`
                : "Kit assegnato"
              : status === "ordine"
                ? deliveryDates[0]
                  ? `Consegna richiesta: ${formatItDate(String(deliveryDates[0]))}`
                  : "In ordine dal fornitore"
                : "-";

          return {
            boatOrderNumber: String(row.production_boats?.order_number || "-"),
            boatModel: String(row.production_boats?.model_boat || "-"),
            itemDescription: itemDescriptionById[String(row.item_id)] || "-",
            color: String(row.color || ""),
            detailsLogos: String(row.details_logos || ""),
            stitching: String(row.stitching || ""),
            quilting: String(row.quilting || ""),
            status,
            statusInfo,
          };
        })
        .sort((a, b) => collator.compare(a.boatOrderNumber, b.boatOrderNumber));

      const doc = buildUpholsteryStatusPdf(rows, pdfLogo, formatItDate(todayInputValue()));

      await doc.save("stato_tappezzerie_battelli.pdf", { returnPromise: true });
    } catch (error) {
      setUpholsteryPdfError(
        error instanceof Error ? error.message : "Impossibile creare il PDF. Riprova."
      );
    } finally {
      setUpholsteryPdfBusy(false);
    }
  }

  const [orderNumber, setOrderNumber] = useState("");
  const [modelBoat, setModelBoat] = useState("");
  const [hull, setHull] = useState("");
  const [stringers, setStringers] = useState("");
  const [deck, setDeck] = useState("");
  const [accessories, setAccessories] = useState("Standard");
  const [note, setNote] = useState("");
  const [tubeColor, setTubeColor] = useState("");
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState("");

  const [upholsterySuppliers, setUpholsterySuppliers] = useState<
    UpholsterySupplier[]
  >([]);
  const [upholsteryItemLookup, setUpholsteryItemLookup] = useState<
    UpholsteryItemLookup[]
  >([]);
  const [upholsteryOptionRows, setUpholsteryOptionRows] = useState<
    UpholsteryOptionRow[]
  >([]);
  const [tappezzeriaRows, setTappezzeriaRows] = useState<
    BoatUpholsteryDraftRow[]
  >([]);

  useEffect(() => {
    loadData();
    loadUpholsteryCatalog();
  }, []);

  async function loadUpholsteryCatalog() {
    const { data: supplierRows, error: supplierError } = await supabase
      .from("suppliers")
      .select("id,name")
      .eq("upholstery_enabled", true)
      .order("name", { ascending: true });

    if (supplierError || !supplierRows || supplierRows.length === 0) {
      setUpholsterySuppliers([]);
      setUpholsteryItemLookup([]);
      setUpholsteryOptionRows([]);
      return;
    }

    const suppliers: UpholsterySupplier[] = supplierRows.map((row: any) => ({
      id: String(row.id),
      name: String(row.name || ""),
    }));

    setUpholsterySuppliers(suppliers);

    const supplierIds = suppliers.map((supplier) => supplier.id);

    const [itemsRes, optionsRes] = await Promise.all([
      supabase
        .from("items")
        .select("id,supplier_id,description")
        .in("supplier_id", supplierIds)
        .order("description", { ascending: true }),
      supabase
        .from("upholstery_options")
        .select("id,supplier_id,option_type,name")
        .in("supplier_id", supplierIds)
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    setUpholsteryItemLookup(
      (itemsRes.data || []).map((row: any) => ({
        id: String(row.id),
        supplierId: String(row.supplier_id),
        description: String(row.description || ""),
      }))
    );

    setUpholsteryOptionRows(
      (optionsRes.data || []).map((row: any) => ({
        id: String(row.id),
        supplierId: String(row.supplier_id),
        option_type: String(
          row.option_type
        ) as UpholsteryOptionRow["option_type"],
        name: String(row.name || ""),
      }))
    );
  }

  function upholsteryItemsFor(supplierId: string) {
    return upholsteryItemLookup.filter(
      (item) => item.supplierId === supplierId
    );
  }

  function upholsteryOptionsFor(
    supplierId: string,
    type: UpholsteryOptionRow["option_type"]
  ) {
    return upholsteryOptionRows.filter(
      (option) =>
        option.supplierId === supplierId && option.option_type === type
    );
  }

  function addTappezzeriaRow() {
    setTappezzeriaRows((current) => [
      ...current,
      {
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        supplierId: upholsterySuppliers[0]?.id || "",
        itemId: "",
        color: "",
        detailsLogos: "",
        stitching: "",
        quilting: "",
        note: "",
      },
    ]);
  }

  function removeTappezzeriaRow(key: string) {
    setTappezzeriaRows((current) =>
      current.filter((row) => row.key !== key)
    );
  }

  function updateTappezzeriaRow(
    key: string,
    patch: Partial<BoatUpholsteryDraftRow>
  ) {
    setTappezzeriaRows((current) =>
      current.map((row) =>
        row.key === key ? { ...row, ...patch } : row
      )
    );
  }

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const [depRes, boatRes, stepRes, optionsRes] = await Promise.all([
      supabase
        .from("production_departments")
        .select("id,name,sort_order,active")
        .order("sort_order", { ascending: true }),
      supabase
        .from("production_boats")
        .select("id,progressive_no,order_number,model_boat,hull,stringers,deck,accessories,note,status,created_at,completed_at,requested_delivery_date")
        .order("requested_delivery_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
      supabase
        .from("production_department_steps")
        .select("id,boat_id,department_id,status,entered_at,started_at,completed_at,current_note"),
      supabase
        .from("production_options")
        .select("id,option_type,name,active,sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    const firstError =
      depRes.error || boatRes.error || stepRes.error || optionsRes.error;

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
        status: String(row.status || ""),
        created_at: String(row.created_at || ""),
        completed_at: row.completed_at ? String(row.completed_at) : null,
        requested_delivery_date: row.requested_delivery_date
          ? String(row.requested_delivery_date)
          : null,
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

  // Numero progressivo: non e' piu' assegnato in automatico, si inserisce
  // a mano (qui o dentro il reparto) solo quando serve per stampare il
  // programma di reparto in PDF.
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

    const { data: newBoatId, error } = await supabase.rpc("create_production_boat", {
      p_progressive_no: null,
      p_order_number: orderNumber.trim(),
      p_model_boat: modelBoat.trim(),
      p_hull: hull.trim(),
      p_stringers: stringers.trim(),
      p_deck: deck.trim(),
      p_accessories: accessories.trim(),
      p_note: note.trim() || null,
      p_created_by: operator,
      p_requested_delivery_date: requestedDeliveryDate || null,
    });

    if (error) {
      setErrorMessage("Errore creazione battello: " + error.message);
      setSaving(false);
      return;
    }

    // Colore tubolare opzionale: se indicato subito, crea gia' la scheda
    // che vedra' solo il reparto Tubolari (gli altri reparti non la vedono).
    if (tubeColor.trim() && newBoatId) {
      await supabase
        .from("production_tubolari")
        .upsert(
          { boat_id: newBoatId, tube_color: tubeColor.trim() },
          { onConflict: "boat_id" }
        );
    }

    /*
      TAPPEZZERIA (facoltativa)

      Il battello e' gia' sicuro (creato sopra). Ogni riga tappezzeria
      compilata diventa una "richiesta" collegata al battello: se in
      giacenza c'e' gia' un kit che corrisponde ESATTAMENTE (stesso
      articolo, colore, dettagli, cucitura, trapuntatura) lo assegniamo
      subito. Altrimenti resta "da ordinare": si puo' cercare in
      giacenza a mano dalla scheda del battello, anche con un match
      non esatto.
    */
    let assignedCount = 0;

    const validTappezzeriaRows = tappezzeriaRows.filter(
      (row) =>
        row.supplierId &&
        row.itemId &&
        row.color &&
        row.detailsLogos &&
        row.stitching &&
        row.quilting
    );

    if (validTappezzeriaRows.length > 0 && newBoatId) {
      for (const row of validTappezzeriaRows) {
        try {
          const { data: inserted, error: insertError } = await supabase
            .from("production_boat_upholstery")
            .insert({
              boat_id: newBoatId,
              supplier_id: row.supplierId,
              item_id: row.itemId,
              color: row.color,
              details_logos: row.detailsLogos,
              stitching: row.stitching,
              quilting: row.quilting,
              note: row.note.trim() || null,
            })
            .select("id")
            .single();

          if (insertError || !inserted) continue;

          const { data: stockMatch } = await supabase
            .from("upholstery_kits")
            .select("id")
            .eq("supplier_id", row.supplierId)
            .eq("item_id", row.itemId)
            .eq("status", "stock")
            .eq("color", row.color)
            .eq("details_logos", row.detailsLogos)
            .eq("stitching", row.stitching)
            .eq("quilting", row.quilting)
            .limit(1)
            .maybeSingle();

          if (stockMatch?.id) {
            const { error: assignError } = await supabase.rpc(
              "assign_upholstery_kit_to_boat",
              {
                p_kit_id: stockMatch.id,
                p_boat_upholstery_id: inserted.id,
              }
            );

            if (!assignError) {
              assignedCount += 1;
            }
          }
        } catch (tappezzeriaError) {
          console.error(
            "Errore collegamento tappezzeria battello:",
            tappezzeriaError
          );
        }
      }
    }

    const tappezzeriaSuffix =
      validTappezzeriaRows.length > 0
        ? assignedCount > 0
          ? ` Tappezzeria: ${assignedCount} di ${validTappezzeriaRows.length} assegnata subito dalla giacenza.`
          : " Tappezzeria da ordinare (nessun kit compatibile in giacenza)."
        : "";

    setMessage(
      `Ordine ${orderNumber.trim()} inserito in produzione.${tappezzeriaSuffix}`
    );
    setOrderNumber("");
    setModelBoat("");
    setHull("");
    setStringers("");
    setDeck("");
    setAccessories("Standard");
    setNote("");
    setTubeColor("");
    setTappezzeriaRows([]);
    setRequestedDeliveryDate("");
    setShowNew(false);
    setSaving(false);
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
          <Link href="/produzione/consegne" className="prod-btn secondary">
            Consegne
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
            <Field label="Data di consegna richiesta">
              <input
                type="date"
                value={requestedDeliveryDate}
                onChange={(e) => setRequestedDeliveryDate(e.target.value)}
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

            <Field label="Colore tubolare (opzionale)">
              <select
                value={tubeColor}
                onChange={(e) => setTubeColor(e.target.value)}
              >
                <option value="">Nessuno / non è un gommone...</option>
                {colorOptions.map((option) => (
                  <option key={option.id} value={option.name}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Note" wide>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Es. Gruppo consolle Selva"
              />
            </Field>
          </div>

          <div className="prod-section-head" style={{ marginTop: 22 }}>
            <div>
              <div className="prod-eyebrow">TAPPEZZERIA (FACOLTATIVA)</div>
              <h2 style={{ fontSize: 17 }}>
                Cosa serve a questo battello
              </h2>
            </div>

            <button
              type="button"
              className="prod-btn secondary"
              onClick={addTappezzeriaRow}
              disabled={upholsterySuppliers.length === 0}
            >
              + Aggiungi tappezzeria
            </button>
          </div>

          {upholsterySuppliers.length === 0 && (
            <div className="prod-config-warning">
              Nessun fornitore con tappezzeria attiva (si attiva dalla
              scheda del fornitore).
            </div>
          )}

          {tappezzeriaRows.map((row) => (
            <div key={row.key} className="prod-form-grid" style={{ marginTop: 10 }}>
              <Field label="Fornitore">
                <select
                  value={row.supplierId}
                  onChange={(e) =>
                    updateTappezzeriaRow(row.key, {
                      supplierId: e.target.value,
                      itemId: "",
                      color: "",
                      detailsLogos: "",
                      stitching: "",
                      quilting: "",
                    })
                  }
                >
                  {upholsterySuppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Articolo">
                <select
                  value={row.itemId}
                  onChange={(e) =>
                    updateTappezzeriaRow(row.key, {
                      itemId: e.target.value,
                    })
                  }
                >
                  <option value="">Seleziona articolo...</option>
                  {upholsteryItemsFor(row.supplierId).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.description}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Colore">
                <select
                  value={row.color}
                  onChange={(e) =>
                    updateTappezzeriaRow(row.key, {
                      color: e.target.value,
                    })
                  }
                >
                  <option value="">Seleziona...</option>
                  {upholsteryOptionsFor(row.supplierId, "color").map(
                    (option) => (
                      <option key={option.id} value={option.name}>
                        {option.name}
                      </option>
                    )
                  )}
                </select>
              </Field>

              <Field label="Dettagli e loghi">
                <select
                  value={row.detailsLogos}
                  onChange={(e) =>
                    updateTappezzeriaRow(row.key, {
                      detailsLogos: e.target.value,
                    })
                  }
                >
                  <option value="">Seleziona...</option>
                  {upholsteryOptionsFor(
                    row.supplierId,
                    "details_logos"
                  ).map((option) => (
                    <option key={option.id} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Cucitura">
                <select
                  value={row.stitching}
                  onChange={(e) =>
                    updateTappezzeriaRow(row.key, {
                      stitching: e.target.value,
                    })
                  }
                >
                  <option value="">Seleziona...</option>
                  {upholsteryOptionsFor(row.supplierId, "stitching").map(
                    (option) => (
                      <option key={option.id} value={option.name}>
                        {option.name}
                      </option>
                    )
                  )}
                </select>
              </Field>

              <Field label="Trapuntatura">
                <select
                  value={row.quilting}
                  onChange={(e) =>
                    updateTappezzeriaRow(row.key, {
                      quilting: e.target.value,
                    })
                  }
                >
                  <option value="">Seleziona...</option>
                  {upholsteryOptionsFor(row.supplierId, "quilting").map(
                    (option) => (
                      <option key={option.id} value={option.name}>
                        {option.name}
                      </option>
                    )
                  )}
                </select>
              </Field>

              <Field label="Nota">
                <input
                  value={row.note}
                  onChange={(e) =>
                    updateTappezzeriaRow(row.key, {
                      note: e.target.value,
                    })
                  }
                  placeholder="Facoltativa"
                />
              </Field>

              <Field label=" ">
                <button
                  type="button"
                  className="prod-btn secondary"
                  onClick={() => removeTappezzeriaRow(row.key)}
                >
                  Rimuovi
                </button>
              </Field>
            </div>
          ))}

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

      <section className="prod-dashboard">
        <div className="prod-rail">
          <div className="prod-rail-card">
            <h3>Riepilogo</h3>
            <div className="prod-stat-list">
              <div>
                <span>In produzione</span>
                <strong>{activeBoats.length}</strong>
              </div>
              <div>
                <span>In attesa</span>
                <strong className="waiting">{waitingCount}</strong>
              </div>
              <div>
                <span>Bloccati</span>
                <strong className="blocked">{blockedCount}</strong>
              </div>
              <div>
                <span>Completati (mese)</span>
                <strong className="done">{completedThisMonth}</strong>
              </div>
            </div>
          </div>

          <div className="prod-rail-card">
            <h3>Reparti</h3>
            <div className="prod-dept-list">
              {departments.filter((dep) => dep.active).map((dep) => (
                <button
                  type="button"
                  key={dep.id}
                  className="prod-dept-item"
                  onClick={() => router.push(`/produzione/reparti/${dep.id}`)}
                >
                  <div className="name">
                    <small>Reparto {dep.sort_order}</small>
                    {dep.name}
                  </div>
                  <span className="count">{departmentCounts.get(dep.id) || 0}</span>
                </button>
              ))}

              {departments.filter((dep) => dep.active).length === 0 && (
                <div className="prod-empty">
                  Nessun reparto attivo. Apri “Gestisci reparti”.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="prod-main">
          <div className="prod-main-top">
            <div>
              <h2>Battelli in produzione</h2>
              <p>{activeBoats.length} battelli attivi, ordinati per consegna cliente.</p>
            </div>

            <div className="prod-print-action">
              <button
                type="button"
                className="prod-btn primary"
                onClick={downloadUpholsteryStatusPdf}
                disabled={upholsteryPdfBusy || pdfLogoLoading || !pdfLogo}
              >
                {upholsteryPdfBusy ? "Creazione PDF..." : "Stampa stato tappezzerie"}
              </button>
              {upholsteryPdfError && (
                <div role="alert" className="prod-message error">
                  {upholsteryPdfError}
                </div>
              )}
              {!pdfLogoLoading && !pdfLogo && (
                <p role="status" className="prod-pdf-logo-missing">
                  Nessun logo configurato —{" "}
                  <Link href="/produzione/configurazioni">
                    caricalo una volta in Configurazioni
                  </Link>
                  .
                </p>
              )}
            </div>
          </div>

          <p className="prod-print-hint">
            Il programma di reparto (con Carena, Ragno/Longheroni, Coperta e Accessori da
            spuntare a mano) si stampa da dentro ogni reparto — Verniciatura resina, Tubolari
            — scegliendo lì l&apos;intervallo di numeri progressivi da inserire a mano prima
            di stampare.
          </p>

          <div className="prod-table-wrap">
            <table className="prod-table">
              <thead>
                <tr>
                  <th>Prog.</th>
                  <th>N° ordine</th>
                  <th>Modello</th>
                  <th>Reparto attuale</th>
                  <th>Stato</th>
                  <th>Consegna richiesta</th>
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
                  activeBoats.map((boat) => {
                    const step = currentStepMap.get(boat.id);
                    const dep = step ? depMap.get(step.department_id) : null;

                    return (
                      <tr
                        key={boat.id}
                        onClick={() => router.push(`/produzione/${boat.id}`)}
                        className="prod-click-row"
                      >
                        <td className="prod-prog-cell" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="number"
                            min="1"
                            className="prod-prog-input"
                            placeholder="—"
                            value={boat.progressive_no ?? ""}
                            onChange={(e) => editProgressiveDraft(boat.id, e.target.value)}
                            onBlur={(e) => saveProgressive(boat.id, e.target.value)}
                          />
                        </td>
                        <td><span className="prod-order">{boat.order_number}</span></td>
                        <td>{boat.model_boat}</td>
                        <td>{dep?.name || "—"}</td>
                        <td>
                          <StatusBadge status={step?.status || "queued"} />
                        </td>
                        <td className="prod-note-cell">
                          {boat.requested_delivery_date
                            ? formatItDate(boat.requested_delivery_date)
                            : "—"}
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
        </div>
      </section>

      <Styles />
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

function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatItDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`prod-status ${status}`}>
      <em className={`prod-status-dot ${status}`} />
      {statusLabel[status] || status.toUpperCase()}
    </span>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      .prod-pdf-logo-missing { margin: 8px 0 0; font-size: 11px; color: #fbbf24; }
      .prod-pdf-logo-missing a { color: #93c5fd; font-weight: 800; }
      .prod-print-hint { margin: -4px 0 12px; font-size: 11px; color: #8398b1; line-height: 1.55; max-width: 720px; }

      /* --- DASHBOARD: barra laterale (riepilogo + reparti) + tabella --- */
      .prod-dashboard {
        margin-top: 14px;
        display: grid;
        grid-template-columns: 260px 1fr;
        gap: 14px;
        align-items: start;
      }

      .prod-rail {
        display: flex;
        flex-direction: column;
        gap: 12px;
        position: sticky;
        top: 14px;
      }

      .prod-rail-card {
        padding: 16px;
        border: 1px solid rgba(148,163,184,.15);
        border-radius: 14px;
        background: #0b1828;
      }

      .prod-rail-card h3 {
        margin: 0 0 12px;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: .9px;
        text-transform: uppercase;
        color: #8195ae;
      }

      .prod-stat-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .prod-stat-list > div {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
      }

      .prod-stat-list span {
        color: #91a4bc;
        font-size: 11px;
      }

      .prod-stat-list strong {
        font-size: 18px;
        font-weight: 950;
      }

      .prod-stat-list strong.waiting { color: #fbbf24; }
      .prod-stat-list strong.blocked { color: #fb7185; }
      .prod-stat-list strong.done { color: #4ade80; }

      .prod-dept-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .prod-dept-item {
        width: 100%;
        padding: 11px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        border: 1px solid rgba(96,165,250,.15);
        border-radius: 10px;
        background: rgba(255,255,255,.015);
        color: #fff;
        cursor: pointer;
        text-align: left;
        font-size: 12.5px;
        font-weight: 700;
      }

      .prod-dept-item:hover {
        border-color: rgba(96,165,250,.40);
      }

      .prod-dept-item .name small {
        display: block;
        margin-bottom: 2px;
        color: #60a5fa;
        font-size: 8.5px;
        font-weight: 950;
        letter-spacing: .6px;
        text-transform: uppercase;
      }

      .prod-dept-item .count {
        min-width: 26px;
        padding: 3px 9px;
        border-radius: 999px;
        background: rgba(59,130,246,.12);
        color: #93c5fd;
        font-size: 11px;
        font-weight: 950;
        text-align: center;
      }

      .prod-main {
        min-width: 0;
        padding: 17px;
        border: 1px solid rgba(148,163,184,.15);
        border-radius: 14px;
        background: #0b1828;
      }

      .prod-main-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }

      .prod-main-top h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 950;
      }

      .prod-main-top p {
        margin: 4px 0 0;
        color: #91a4bc;
        font-size: 11px;
      }

      .prod-print-action {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
      }

      .prod-prog-cell {
        padding: 6px 8px !important;
      }

      .prod-prog-input {
        width: 56px;
        min-height: 30px;
        padding: 0 7px;
        background: #081524;
        color: #fff;
        border: 1px solid rgba(148,163,184,.22);
        border-radius: 7px;
        font-size: 11.5px;
        font-weight: 800;
        text-align: center;
      }

      .prod-prog-input:focus {
        outline: none;
        border-color: rgba(96,165,250,.55);
      }

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
        align-items: center;
        gap: 5px;
        padding: 6px 9px;
        border-radius: 999px;
        font-size: 8px;
        font-weight: 950;
        letter-spacing: .2px;
        white-space: nowrap;
      }

      .prod-status-dot {
        width: 6px;
        height: 6px;
        flex: 0 0 auto;
        border-radius: 50%;
        font-style: normal;
      }

      .prod-status.queued {
        border: 1px solid rgba(148,163,184,.30);
        background: rgba(148,163,184,.10);
        color: #dbe3ed;
      }
      .prod-status-dot.queued { background: #94a3b8; }

      .prod-status.working {
        border: 1px solid rgba(59,130,246,.45);
        background: rgba(59,130,246,.16);
        color: #bfdbfe;
        box-shadow: 0 0 0 3px rgba(59,130,246,.08);
      }
      .prod-status-dot.working { background: #3b82f6; }

      .prod-status.waiting {
        border: 1px solid rgba(245,158,11,.45);
        background: rgba(245,158,11,.14);
        color: #fde68a;
        box-shadow: 0 0 0 3px rgba(245,158,11,.08);
      }
      .prod-status-dot.waiting { background: #f59e0b; }

      .prod-status.blocked {
        border: 1px solid rgba(244,63,94,.48);
        background: rgba(244,63,94,.16);
        color: #fecdd3;
        box-shadow: 0 0 0 3px rgba(244,63,94,.08);
      }
      .prod-status-dot.blocked { background: #f43f5e; }

      .prod-status.completed {
        border: 1px solid rgba(34,197,94,.45);
        background: rgba(34,197,94,.16);
        color: #bbf7d0;
      }
      .prod-status-dot.completed { background: #22c55e; }

      .prod-empty,
      .prod-empty-cell {
        padding: 26px;
        color: #7388a3;
        text-align: center;
        font-size: 10px;
      }

      @media (max-width: 1000px) {
        .prod-form-grid {
          grid-template-columns: repeat(2,minmax(0,1fr));
        }

        .prod-dashboard {
          grid-template-columns: 210px 1fr;
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

        .prod-form-grid {
          grid-template-columns: 1fr;
        }

        .prod-field.wide {
          grid-column: span 1;
        }

        .prod-dashboard {
          grid-template-columns: 1fr;
        }

        .prod-rail {
          position: static;
        }

        .prod-main-top {
          flex-direction: column;
          align-items: stretch;
        }

        .prod-print-action {
          align-items: flex-start;
        }
      }
    `}</style>
  );
}
