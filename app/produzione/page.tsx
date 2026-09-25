"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { fetchCompanyLogo } from "../../lib/pdfLogo";

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

function isTubolariName(name: string) {
  return name.trim().toLowerCase() === "tubolari";
}

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

  // Battelli che hanno almeno una richiesta di tappezzeria inserita
  // (indipendentemente da assegnata/in ordine/da ordinare): serve solo a
  // vedere subito in tabella a chi manca ancora l'inserimento.
  const [upholsteryBoatIds, setUpholsteryBoatIds] = useState<Set<string>>(
    new Set()
  );

  const [upholsteryPdfBusy, setUpholsteryPdfBusy] = useState(false);
  const [upholsteryPdfError, setUpholsteryPdfError] = useState("");

  // Pannello "stampa programma reparto": stessa logica gia' usata dentro
  // Verniciatura/Tubolari, richiamabile pero' direttamente da qui. Il
  // battello per il PDF si spunta uno per uno (mai un intervallo di
  // progressivi: in pratica servono sempre numeri sparsi tipo 30/35/38).
  const [printPanel, setPrintPanel] = useState<"verniciatura" | "tubolari" | null>(null);
  const [printSelected, setPrintSelected] = useState<Record<string, boolean>>({});
  const [printBusy, setPrintBusy] = useState(false);
  const [printError, setPrintError] = useState("");

  // Battelli Tubolari gia' messi in un PDF: spariscono dalla lista di
  // quelli selezionabili per il prossimo, cosi' non si ristampa per
  // sbaglio chi e' gia' stato consegnato al reparto. Mappa boat_id ->
  // data/ora di stampa; vuota (e la spunta resta invariata) finche' la
  // colonna printed_at non esiste ancora su production_tubolari.
  const [tubolariPrinted, setTubolariPrinted] = useState<Record<string, string>>({});

  // Stessa cosa ma per Verniciatura (e in generale qualunque reparto che
  // usi il pannello rapido): qui il "passaggio" e' il singolo step in
  // production_department_steps, quindi la mappa e' step_id -> data/ora
  // di stampa, non boat_id (un battello puo' rifare lo stesso reparto).
  const [stepsPrinted, setStepsPrinted] = useState<Record<string, string>>({});

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
          "id,item_id,color,details_logos,stitching,quilting,kit_id,created_at,production_boats(order_number,model_boat,requested_delivery_date),upholstery_kits(matricola),order_items(qty,received_qty,requested_delivery_date)"
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
          // Al massimo una riga d'ordine collegata per richiesta
          // (production_boat_upholstery.order_item_id): piu' richieste
          // possono condividere la stessa riga se la sua quantita' copre
          // piu' battelli (STEP 23).
          const orderLine = row.order_items || null;
          const isOpen =
            orderLine &&
            Number(orderLine.qty || 0) > Number(orderLine.received_qty || 0);

          const kitMatricola = row.upholstery_kits
            ? Number(row.upholstery_kits.matricola)
            : null;

          const status: "assegnata" | "ordine" | "da_ordinare" = row.kit_id
            ? "assegnata"
            : isOpen
              ? "ordine"
              : "da_ordinare";

          const statusInfo =
            status === "assegnata"
              ? kitMatricola
                ? `Kit N. ${kitMatricola}`
                : "Kit assegnato"
              : status === "ordine"
                ? orderLine.requested_delivery_date
                  ? `Consegna richiesta: ${formatItDate(String(orderLine.requested_delivery_date))}`
                  : "In ordine dal fornitore"
                : "-";

          return {
            boatOrderNumber: String(row.production_boats?.order_number || "-"),
            boatModel: String(row.production_boats?.model_boat || "-"),
            boatDeliveryDate: row.production_boats?.requested_delivery_date
              ? String(row.production_boats.requested_delivery_date)
              : null,
            itemDescription: itemDescriptionById[String(row.item_id)] || "-",
            color: String(row.color || ""),
            detailsLogos: String(row.details_logos || ""),
            stitching: String(row.stitching || ""),
            quilting: String(row.quilting || ""),
            status,
            statusInfo,
          };
        })
        // Ordine di stampa: prima le consegne piu' vicine (chi non ha una
        // data di consegna richiesta va in fondo), poi per N. ordine.
        .sort((a, b) => {
          if (a.boatDeliveryDate && b.boatDeliveryDate) {
            if (a.boatDeliveryDate !== b.boatDeliveryDate) {
              return a.boatDeliveryDate < b.boatDeliveryDate ? -1 : 1;
            }
          } else if (a.boatDeliveryDate || b.boatDeliveryDate) {
            return a.boatDeliveryDate ? -1 : 1;
          }
          return collator.compare(a.boatOrderNumber, b.boatOrderNumber);
        });

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

  // Distinta base (STEP 38): sezioni OPTIONAL disponibili per il modello
  // appena scelto nel form, e quelle spuntate per questo battello. Le
  // sezioni STANDARD non si scelgono: fanno sempre parte del modello.
  const [optionalBomSections, setOptionalBomSections] = useState<
    { id: string; name: string }[]
  >([]);
  const [selectedOptionalSectionIds, setSelectedOptionalSectionIds] = useState<Set<string>>(
    new Set()
  );
  const [loadingOptionalSections, setLoadingOptionalSections] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadOptionalSections() {
      if (!modelBoat) {
        setOptionalBomSections([]);
        setSelectedOptionalSectionIds(new Set());
        return;
      }

      setLoadingOptionalSections(true);

      const { data, error } = await supabase
        .from("production_bom_sections")
        .select("id,name")
        .eq("model_boat", modelBoat)
        .eq("kind", "optional")
        .order("sort_order", { ascending: true });

      if (cancelled) return;

      setOptionalBomSections(
        !error && data
          ? data.map((row: any) => ({ id: String(row.id), name: String(row.name || "") }))
          : []
      );
      setSelectedOptionalSectionIds(new Set());
      setLoadingOptionalSections(false);
    }

    loadOptionalSections();

    return () => {
      cancelled = true;
    };
  }, [modelBoat]);

  function toggleOptionalSection(sectionId: string) {
    setSelectedOptionalSectionIds((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }

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

    const [depRes, boatRes, stepRes, optionsRes, upholsteryRes] = await Promise.all([
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
      supabase.from("production_boat_upholstery").select("boat_id"),
    ]);

    // Separate dalle altre: finche' su Supabase non esistono ancora le
    // colonne printed_at (vanno aggiunte a mano una volta sola), queste
    // query falliscono da sole senza bloccare il resto della pagina - le
    // liste "gia' stampati" restano semplicemente vuote fino ad allora.
    const [tubPrintedRes, stepPrintedRes] = await Promise.all([
      supabase.from("production_tubolari").select("boat_id,printed_at"),
      supabase.from("production_department_steps").select("id,printed_at"),
    ]);
    setTubolariPrinted(
      tubPrintedRes.error
        ? {}
        : Object.fromEntries(
            (tubPrintedRes.data || [])
              .filter((row: any) => row.printed_at)
              .map((row: any) => [String(row.boat_id), String(row.printed_at)])
          )
    );
    setStepsPrinted(
      stepPrintedRes.error
        ? {}
        : Object.fromEntries(
            (stepPrintedRes.data || [])
              .filter((row: any) => row.printed_at)
              .map((row: any) => [String(row.id), String(row.printed_at)])
          )
    );

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

    setUpholsteryBoatIds(
      new Set(
        (upholsteryRes.data || []).map((row: any) => String(row.boat_id))
      )
    );

    setLoading(false);
  }

  const modelOptions = useMemo(
    () => productionOptions.filter((option) => option.option_type === "model"),
    [productionOptions]
  );

  const colorOptions = useMemo(
    () => productionOptions.filter((option) => option.option_type === "color"),
    [productionOptions]
  );

  const activeBoats = useMemo(
    () => boats.filter((boat) => boat.status === "active"),
    [boats]
  );

  /*
    URGENZA CONSEGNA
    Non e' piu' legata allo "stato" del battello (concetto eliminato),
    solo alla data di consegna richiesta rispetto a oggi: serve per dare
    un colpo d'occhio immediato in tabella e nella striscia di riepilogo
    dell'intestazione.
  */
  function deliveryUrgency(value: string | null): "overdue" | "soon" | null {
    if (!value) return null;
    const target = new Date(value);
    if (Number.isNaN(target.getTime())) return null;
    target.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target.getTime() - now.getTime()) / 86400000);
    if (diffDays < 0) return "overdue";
    if (diffDays <= 7) return "soon";
    return null;
  }

  const heroStats = activeBoats.reduce(
    (acc, boat) => {
      const urgency = deliveryUrgency(boat.requested_delivery_date);
      if (urgency === "overdue") acc.overdue += 1;
      else if (urgency === "soon") acc.soon += 1;
      return acc;
    },
    { overdue: 0, soon: 0 }
  );

  // C'e' piu' di un reparto il cui nome contiene "verniciatura" (es. il
  // vecchio "Verniciatura", disattivato, e quello davvero usato oggi,
  // "Verniciatura resina") - va preso quello ATTIVO, altrimenti "find"
  // si fermava al primo per ordine e restava sempre su quello disattivato
  // e vuoto, anche se i battelli passavano regolarmente da quello vero.
  const verniciaturaDept = useMemo(() => {
    const matches = departments.filter((dep) =>
      dep.name.trim().toLowerCase().includes("verniciatura")
    );
    return matches.find((dep) => dep.active) || matches[0] || null;
  }, [departments]);

  const tubolariDept = useMemo(
    () => departments.find((dep) => isTubolariName(dep.name)) || null,
    [departments]
  );

  // Battelli selezionabili per il pannello di stampa aperto (Tubolari o
  // Verniciatura). Stessa logica di filtro gia' usata per costruire il
  // PDF, ma calcolata qui cosi' la lista si puo' spuntare a mano.
  const printCandidateRows = useMemo(() => {
    if (!printPanel) return [];
    const dept = printPanel === "tubolari" ? tubolariDept : verniciaturaDept;
    if (!dept) return [];

    const list = printPanel === "tubolari"
      ? activeBoats
          .filter((boat) => !tubolariPrinted[boat.id])
          .map((boat) => ({
            boat,
            step: steps.find((s) => s.boat_id === boat.id && s.department_id === dept.id) || null,
          }))
      : // Qui li vuole vedere davvero tutti, senza nessuna esclusione: ne'
        // per stato del passaggio in reparto, ne' per gia' stampato (a
        // differenza di Tubolari, dove l'esclusione dei gia' stampati resta).
        activeBoats.map((boat) => ({
          boat,
          step:
            steps.find(
              (s) => s.boat_id === boat.id && s.department_id === dept.id
            ) || null,
        }));

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
  }, [
    printPanel,
    tubolariDept,
    verniciaturaDept,
    activeBoats,
    steps,
    boats,
    tubolariPrinted,
    stepsPrinted,
  ]);

  // Ogni apertura del pannello riparte con tutti spuntati (cosi' "tutti i
  // battelli" resta a zero click), poi l'utente toglie la spunta a chi
  // non gli serve.
  useEffect(() => {
    setPrintSelected(
      Object.fromEntries(printCandidateRows.map((row) => [row.boat.id, true]))
    );
  }, [printCandidateRows]);

  function openPrintPanel(kind: "verniciatura" | "tubolari") {
    setPrintError("");
    setPrintPanel((current) => (current === kind ? null : kind));
  }

  async function generateDeptPdf() {
    if (!printPanel) return;

    setPrintError("");

    const dept = printPanel === "tubolari" ? tubolariDept : verniciaturaDept;

    if (!dept) {
      setPrintError(
        `Reparto ${printPanel === "tubolari" ? "Tubolari" : "Verniciatura"} non trovato. Crealo da "Gestisci reparti".`
      );
      return;
    }

    const rows = printCandidateRows.filter((row) => printSelected[row.boat.id]);

    if (rows.length === 0) {
      setPrintError("Seleziona almeno un battello prima di generare il PDF.");
      return;
    }

    setPrintBusy(true);

    try {
      const isTub = printPanel === "tubolari";
      let tubMap: Record<
        string,
        { tube_color: string; tube_done: boolean; tube_mount_done: boolean }
      > = {};

      if (isTub) {
        const { data } = await supabase
          .from("production_tubolari")
          .select("boat_id,tube_color,tube_done,tube_mount_done");

        tubMap = Object.fromEntries(
          (data || []).map((row: any) => [
            String(row.boat_id),
            {
              tube_color: String(row.tube_color || ""),
              tube_done: Boolean(row.tube_done),
              tube_mount_done: Boolean(row.tube_mount_done),
            },
          ])
        );
      }

      const companyLogo = await fetchCompanyLogo();
      const operator =
        localStorage.getItem("magazzino_display_name") ||
        localStorage.getItem("magazzino_user") ||
        "Matteo";

      const { buildDepartmentProgramPdf } = await import("../../lib/productionPdf");

      const { doc, filename } = buildDepartmentProgramPdf({
        departmentName: dept.name,
        isTubolari: isTub,
        rows,
        tubolariMap: tubMap,
        companyLogo,
        operator,
      });

      await doc.save(filename, { returnPromise: true });

      // Tubolari: segna i battelli appena stampati cosi' spariscono dalla
      // lista di quelli selezionabili per il prossimo PDF. Se la colonna
      // printed_at non esiste ancora su Supabase l'upsert fallisce da solo
      // e il PDF resta comunque generato - semplicemente non sparisce.
      if (isTub) {
        const now = new Date().toISOString();
        const upsertRows = rows.map((row) => ({
          boat_id: row.boat.id,
          tube_color: tubMap[row.boat.id]?.tube_color || "",
          tube_done: tubMap[row.boat.id]?.tube_done || false,
          tube_mount_done: tubMap[row.boat.id]?.tube_mount_done || false,
          printed_at: now,
        }));
        const { error: markError } = await supabase
          .from("production_tubolari")
          .upsert(upsertRows, { onConflict: "boat_id" });

        if (!markError) {
          setTubolariPrinted((current) => {
            const next = { ...current };
            rows.forEach((row) => {
              next[row.boat.id] = now;
            });
            return next;
          });
        }
      } else {
        // Verniciatura (e in generale gli altri reparti col pannello
        // rapido): stessa idea, ma la spunta va sullo step in reparto, non
        // sul battello - un passaggio gia' stampato non si ripropone.
        const now = new Date().toISOString();
        const stepIds = rows.map((row) => row.step?.id).filter(Boolean) as string[];
        if (stepIds.length > 0) {
          const { error: markError } = await supabase
            .from("production_department_steps")
            .update({ printed_at: now })
            .in("id", stepIds);

          if (!markError) {
            setStepsPrinted((current) => {
              const next = { ...current };
              stepIds.forEach((id) => {
                next[id] = now;
              });
              return next;
            });
          }
        }
      }

      setPrintPanel(null);
    } catch (error) {
      setPrintError(
        error instanceof Error ? error.message : "Impossibile creare il PDF. Riprova."
      );
    } finally {
      setPrintBusy(false);
    }
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
      articolo, colore, dettagli, cucitura, trapuntatura), o se c'e'
      gia' una riga d'ordine aperta per lo stesso fornitore/articolo,
      va assegnato in automatico per priorita' di consegna tra TUTTI i
      battelli in attesa (non necessariamente questo appena creato:
      un altro battello con consegna piu' vicina puo' avere la
      precedenza, come dalla scheda del singolo battello).
    */
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
            // Kit identico gia' in giacenza: va al battello con la
            // consegna richiesta piu' vicina tra tutti quelli in attesa
            // dello stesso articolo (non necessariamente questo appena
            // inserito).
            try {
              await supabase.rpc("assign_stock_kit_by_priority", {
                p_kit_id: stockMatch.id,
              });
            } catch (priorityError) {
              console.error(
                "Errore assegnazione automatica kit in giacenza:",
                priorityError
              );
            }
          } else {
            // Nessun kit identico in giacenza: prova ad abbinare in
            // automatico una riga d'ordine gia' aperta per lo stesso
            // fornitore + articolo, per priorita' di consegna.
            try {
              await supabase.rpc("sync_upholstery_order_links", {
                p_supplier_id: row.supplierId,
                p_item_id: row.itemId,
              });
            } catch (syncError) {
              console.error(
                "Errore abbinamento automatico tappezzeria:",
                syncError
              );
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
        ? ` Tappezzeria: collegamento automatico per priorita' di consegna tentato su ${validTappezzeriaRows.length} richiest${validTappezzeriaRows.length === 1 ? "a" : "e"} (vedi scheda battello per lo stato).`
        : "";

    /*
      DISTINTA BASE - SEZIONI OPTIONAL SCELTE (STEP 38)

      Si salvano subito le sezioni optional spuntate nel form, cosi'
      restano collegate a questo battello (le sezioni standard del
      modello si applicano sempre, non serve salvarle).
    */
    if (newBoatId && selectedOptionalSectionIds.size > 0) {
      try {
        await supabase.from("production_boat_bom_sections").insert(
          Array.from(selectedOptionalSectionIds).map((sectionId) => ({
            boat_id: newBoatId,
            section_id: sectionId,
          }))
        );
      } catch (bomSectionsError) {
        console.error("Errore salvataggio sezioni optional:", bomSectionsError);
      }
    }

    /*
      ARTICOLI MANCANTI (STEP 38)

      Si controlla subito la distinta base del battello (sezioni
      standard del modello + sezioni optional appena scelte): per
      ogni articolo a catalogo la cui giacenza e' inferiore alla
      quantita' richiesta, si scarica un PDF. E' un controllo di
      sola lettura su items.stock: non crea nessuna richiesta, non
      assegna nulla, non tocca mai la giacenza. Se qualcosa va storto
      qui il battello resta comunque creato regolarmente (si puo'
      sempre ristampare lo stesso PDF dalla scheda del battello).
    */
    let missingArticlesSuffix = "";
    if (newBoatId) {
      try {
        const applicableSectionIds = Array.from(selectedOptionalSectionIds);

        const { data: sectionRows, error: sectionsError } = await supabase
          .from("production_bom_sections")
          .select("id,name,kind")
          .eq("model_boat", modelBoat.trim());

        if (!sectionsError && sectionRows) {
          const sections = sectionRows.filter(
            (row: any) => row.kind === "standard" || applicableSectionIds.includes(String(row.id))
          );

          if (sections.length > 0) {
            const sectionIds = sections.map((row: any) => String(row.id));

            const { data: bomRows } = await supabase
              .from("production_bom_items")
              .select("id,section_id,item_id,description,unit,qty")
              .in("section_id", sectionIds);

            const itemIds = Array.from(
              new Set(
                (bomRows || [])
                  .map((row: any) => (row.item_id ? String(row.item_id) : null))
                  .filter((id: any): id is string => !!id)
              )
            );

            let itemById = new Map<string, any>();
            let supplierNameById = new Map<string, string>();

            if (itemIds.length > 0) {
              const { data: itemRows } = await supabase
                .from("items")
                .select("id,supplier_id,code,supplier_code,description,stock")
                .in("id", itemIds);

              itemById = new Map((itemRows || []).map((row: any) => [String(row.id), row]));

              const supplierIds = Array.from(
                new Set((itemRows || []).map((row: any) => String(row.supplier_id || "")).filter(Boolean))
              );

              if (supplierIds.length > 0) {
                const { data: supplierRows } = await supabase
                  .from("suppliers")
                  .select("id,name")
                  .in("id", supplierIds);

                supplierNameById = new Map(
                  (supplierRows || []).map((row: any) => [String(row.id), String(row.name || "")])
                );
              }
            }

            const sectionNameById = new Map(
              sections.map((row: any) => [String(row.id), String(row.name || "")])
            );

            const missingBySection = new Map<
              string,
              { itemCode: string; supplierName: string; description: string; unit: string; qty: number; stock: number }[]
            >();

            (bomRows || []).forEach((row: any) => {
              if (!row.item_id) return;
              const item = itemById.get(String(row.item_id));
              if (!item) return;

              const stock = Number(item.stock || 0);
              const qty = Number(row.qty || 0);
              if (stock >= qty) return;

              const sectionName = sectionNameById.get(String(row.section_id)) || "";
              const list = missingBySection.get(sectionName) || [];
              list.push({
                itemCode: String(item.supplier_code || item.code || ""),
                supplierName: supplierNameById.get(String(item.supplier_id || "")) || "",
                description: String(row.description || item.description || ""),
                unit: String(row.unit || "PZ"),
                qty,
                stock,
              });
              missingBySection.set(sectionName, list);
            });

            const totalMissing = Array.from(missingBySection.values()).reduce(
              (sum, rows) => sum + rows.length,
              0
            );

            if (totalMissing > 0) {
              const { buildMissingArticlesPdf } = await import("../../lib/productionPdf");
              const { doc, filename } = buildMissingArticlesPdf({
                boatOrderNumber: orderNumber.trim(),
                boatModel: modelBoat.trim(),
                boatProgressiveNo: null,
                requestedDeliveryDate: formatItDate(requestedDeliveryDate),
                sections: Array.from(missingBySection.entries()).map(([sectionName, rows]) => ({
                  sectionName,
                  rows,
                })),
                logo: pdfLogo,
                generatedDate: formatItDate(todayInputValue()),
              });
              doc.save(filename);
              missingArticlesSuffix = ` Attenzione: ${totalMissing} articol${
                totalMissing === 1 ? "o" : "i"
              } della distinta base risult${
                totalMissing === 1 ? "a" : "ano"
              } senza giacenza sufficiente (PDF scaricato).`;
            }
          }
        }
      } catch (missingArticlesError) {
        console.error("Errore controllo articoli mancanti:", missingArticlesError);
      }
    }

    setMessage(
      `Ordine ${orderNumber.trim()} inserito in produzione.${tappezzeriaSuffix}${missingArticlesSuffix}`
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
        <div className="prod-hero-top">
          <div>
            <div className="prod-eyebrow">CONTROLLO PRODUZIONE</div>
            <h1>Produzione</h1>
            <p>
              Segui ogni battello con lo stesso Numero d&apos;Ordine dal primo
              reparto fino al completamento.
            </p>
          </div>

          <div className="prod-actions">
            <Link href="/produzione/configurazioni" className="prod-btn secondary">
              Configurazioni
            </Link>
            <Link href="/produzione/consegne" className="prod-btn secondary">
              Consegne
            </Link>
            <Link href="/produzione/distinta-base" className="prod-btn secondary">
              Distinta base
            </Link>
            <button
              type="button"
              className="prod-btn primary"
              onClick={() => setShowNew((value) => !value)}
            >
              + Nuovo battello
            </button>
          </div>
        </div>

        <div className="prod-hero-stats">
          <div className="prod-hero-stat">
            <span className="prod-hero-stat-value">{activeBoats.length}</span>
            <span className="prod-hero-stat-label">Battelli in produzione</span>
          </div>
          <div className="prod-hero-stat-divider" />
          <div className={`prod-hero-stat ${heroStats.overdue > 0 ? "danger" : ""}`}>
            <span className="prod-hero-stat-value">{heroStats.overdue}</span>
            <span className="prod-hero-stat-label">Consegne in ritardo</span>
          </div>
          <div className="prod-hero-stat-divider" />
          <div className={`prod-hero-stat ${heroStats.soon > 0 ? "warn" : ""}`}>
            <span className="prod-hero-stat-value">{heroStats.soon}</span>
            <span className="prod-hero-stat-label">Consegne entro 7 giorni</span>
          </div>
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

            {modelBoat && optionalBomSections.length > 0 && (
              <div className="prod-optional-sections">
                <div className="prod-optional-sections-label">
                  Optional di questo battello (dalla distinta base di {modelBoat})
                </div>
                {optionalBomSections.map((section) => (
                  <label key={section.id} className="prod-optional-section-row">
                    <input
                      type="checkbox"
                      checked={selectedOptionalSectionIds.has(section.id)}
                      onChange={() => toggleOptionalSection(section.id)}
                    />
                    {section.name}
                  </label>
                ))}
              </div>
            )}
            {modelBoat && !loadingOptionalSections && optionalBomSections.length === 0 && (
              <div className="prod-optional-sections-empty">
                Nessuna sezione optional in distinta base per {modelBoat} (solo dotazioni
                di serie, se presenti).
              </div>
            )}

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

      <section className="prod-main">
        <div className="prod-main-top">
          <div>
            <h2>Battelli in produzione</h2>
            <p>{activeBoats.length} battelli attivi, ordinati per consegna cliente.</p>
          </div>

          <div className="prod-print-actions">
            <Link href="/produzione/reparti" className="prod-btn secondary">
              Reparti
            </Link>
            <button
              type="button"
              className={`prod-btn secondary ${printPanel === "verniciatura" ? "active" : ""}`}
              onClick={() => openPrintPanel("verniciatura")}
            >
              Stampa programma verniciatura
            </button>
            <button
              type="button"
              className={`prod-btn secondary ${printPanel === "tubolari" ? "active" : ""}`}
              onClick={() => openPrintPanel("tubolari")}
            >
              Stampa programma tubolari
            </button>
            <button
              type="button"
              className="prod-btn primary"
              onClick={downloadUpholsteryStatusPdf}
              disabled={upholsteryPdfBusy || pdfLogoLoading || !pdfLogo}
            >
              {upholsteryPdfBusy ? "Creazione PDF..." : "Stato tappezzerie"}
            </button>
          </div>
        </div>

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

        {printPanel && (
          <div className="prod-print-panel">
            <strong>
              Programma{" "}
              {printPanel === "tubolari"
                ? "Tubolari"
                : verniciaturaDept?.name || "Verniciatura"}
            </strong>
            <p>
              Spunta i battelli da mettere nel PDF (in qualsiasi combinazione,
              non serve che siano di fila).
              {printPanel === "tubolari" &&
                (() => {
                  const printedCount = activeBoats.filter(
                    (boat) => tubolariPrinted[boat.id]
                  ).length;
                  return printedCount > 0 ? (
                    <>
                      {" "}
                      {printedCount} gia' stampat{printedCount === 1 ? "o" : "i"} non
                      compaiono piu' qui.
                    </>
                  ) : null;
                })()}
            </p>

            {printCandidateRows.length === 0 ? (
              <p className="prod-print-empty">
                {(() => {
                  const dept = printPanel === "tubolari" ? tubolariDept : verniciaturaDept;
                  if (!dept) {
                    return printPanel === "tubolari"
                      ? 'Reparto "Tubolari" non trovato tra i reparti configurati.'
                      : 'Reparto "Verniciatura" non trovato tra i reparti configurati.';
                  }
                  if (activeBoats.length === 0) {
                    return "Nessun battello attivo in produzione.";
                  }
                  // Verniciatura mostra sempre tutti i battelli attivi senza
                  // esclusioni, quindi puo' arrivare a zero solo se non ce
                  // ne sono. Tubolari invece esclude i gia' stampati.
                  return "Tutti i battelli sono gia' stati stampati.";
                })()}
              </p>
            ) : (
              <div className="prod-print-boatlist">
                {printCandidateRows.map((row) => (
                  <label key={row.boat.id} className="prod-print-boat-row">
                    <input
                      type="checkbox"
                      checked={Boolean(printSelected[row.boat.id])}
                      onChange={(e) =>
                        setPrintSelected((current) => ({
                          ...current,
                          [row.boat.id]: e.target.checked,
                        }))
                      }
                    />
                    <span className="prod-print-boat-prog">
                      {row.boat.progressive_no ?? "—"}
                    </span>
                    <span className="prod-print-boat-order">{row.boat.order_number}</span>
                    <span className="prod-print-boat-model">{row.boat.model_boat}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="prod-print-panel-controls">
              <span className="prod-print-count">
                {printCandidateRows.filter((row) => printSelected[row.boat.id]).length} di{" "}
                {printCandidateRows.length} selezionati
              </span>
              <button
                type="button"
                className="prod-btn secondary"
                onClick={() =>
                  setPrintSelected(
                    Object.fromEntries(printCandidateRows.map((row) => [row.boat.id, true]))
                  )
                }
              >
                Seleziona tutti
              </button>
              <button
                type="button"
                className="prod-btn secondary"
                onClick={() =>
                  setPrintSelected(
                    Object.fromEntries(printCandidateRows.map((row) => [row.boat.id, false]))
                  )
                }
              >
                Deseleziona tutti
              </button>
              <button
                type="button"
                className="prod-btn secondary"
                onClick={() => setPrintPanel(null)}
                disabled={printBusy}
              >
                Annulla
              </button>
              <button
                type="button"
                className="prod-btn primary"
                onClick={generateDeptPdf}
                disabled={printBusy}
              >
                {printBusy ? "Creazione PDF..." : "Genera PDF"}
              </button>
            </div>
            {printError && (
              <div role="alert" className="prod-message error">
                {printError}
              </div>
            )}
          </div>
        )}

        <div className="prod-table-wrap">
          <table className="prod-table">
            <thead>
              <tr>
                <th>Prog.</th>
                <th>N° ordine</th>
                <th>Battello</th>
                <th>Consegna richiesta</th>
                <th>Tappezzeria</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {activeBoats.length === 0 ? (
                <tr>
                  <td colSpan={6} className="prod-empty-cell">
                    Nessun battello attualmente in produzione.
                  </td>
                </tr>
              ) : (
                activeBoats.map((boat) => {
                  const urgency = deliveryUrgency(boat.requested_delivery_date);

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
                      <td>
                        <div className="prod-boat-cell">
                          <span className="prod-boat-model">{boat.model_boat}</span>
                          <span className="prod-boat-meta">
                            Carena {boat.hull || "—"} · Ragno/Longh. {boat.stringers || "—"} · Coperta {boat.deck || "—"}
                          </span>
                        </div>
                      </td>
                      <td
                        className={`prod-date-cell ${urgency === "overdue" ? "overdue" : urgency === "soon" ? "soon" : ""}`}
                      >
                        {boat.requested_delivery_date
                          ? formatItDate(boat.requested_delivery_date)
                          : "—"}
                      </td>
                      <td>
                        {upholsteryBoatIds.has(boat.id) ? (
                          <span className="prod-tap-pill yes">Inserita</span>
                        ) : (
                          <span className="prod-tap-pill no">Da inserire</span>
                        )}
                      </td>
                      <td className="prod-note-cell">{boat.note || "—"}</td>
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

function Styles() {
  return (
    <style jsx global>{`
      .prod-pdf-logo-missing { margin: 8px 0 0; font-size: 11px; color: #fbbf24; }
      .prod-pdf-logo-missing a { color: #7cf2c4; font-weight: 800; }

      .prod-main {
        position: relative;
        margin-top: 18px;
        min-width: 0;
        padding: 28px;
        border: 1px solid rgba(51,224,234,.14);
        border-radius: 20px;
        background:
          radial-gradient(circle at 100% 0%, rgba(51,224,234,.09), transparent 42%),
          linear-gradient(180deg, #0c1a2c, #08131f);
        box-shadow: 0 24px 48px -28px rgba(0,0,0,.65);
      }

      .prod-main-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 18px;
        padding-bottom: 18px;
        border-bottom: 1px solid rgba(148,163,184,.12);
      }

      .prod-main-top h2 {
        margin: 0;
        font-size: 21px;
        font-weight: 950;
        letter-spacing: -.4px;
      }

      .prod-main-top p {
        margin: 5px 0 0;
        color: #8ea2ba;
        font-size: 11px;
      }

      .prod-print-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }

      .prod-btn.secondary.active {
        border-color: rgba(51,224,234,.55);
        background: rgba(51,224,234,.14);
        color: #bdf5e6;
      }

      .prod-print-panel {
        margin-top: 16px;
        padding: 15px 16px;
        border: 1px solid rgba(51,224,234,.22);
        border-radius: 12px;
        background: rgba(51,224,234,.05);
      }

      .prod-print-panel strong {
        display: block;
        font-size: 11px;
        font-weight: 950;
        letter-spacing: .3px;
      }

      .prod-print-panel p {
        margin: 6px 0 0;
        color: #91a4bc;
        font-size: 10.5px;
        line-height: 1.5;
        max-width: 640px;
      }

      .prod-print-panel-controls {
        margin-top: 12px;
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: 10px;
      }

      .prod-print-count {
        margin-right: 4px;
        padding: 8px 12px;
        border: 1px solid rgba(148,163,184,.20);
        border-radius: 8px;
        background: rgba(51,224,234,.08);
        color: #dbeafe;
        font-size: 11px;
        font-weight: 850;
        white-space: nowrap;
      }

      .prod-print-empty {
        margin: 12px 0 0;
        color: #8ea2ba;
        font-size: 11px;
      }

      .prod-print-boatlist {
        margin-top: 12px;
        max-height: 240px;
        overflow-y: auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
        gap: 4px;
        padding: 10px;
        border: 1px solid rgba(148,163,184,.16);
        border-radius: 10px;
        background: rgba(4,20,32,.4);
      }

      .prod-print-boat-row {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 6px 8px;
        border-radius: 7px;
        cursor: pointer;
        font-size: 11px;
      }

      .prod-print-boat-row:hover {
        background: rgba(51,224,234,.08);
      }

      .prod-print-boat-row input[type="checkbox"] {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
        cursor: pointer;
        accent-color: #33e0ea;
      }

      .prod-print-boat-prog {
        flex-shrink: 0;
        min-width: 24px;
        font-family: var(--font-geist-mono), ui-monospace, monospace;
        color: #7cf2c4;
        font-weight: 800;
      }

      .prod-print-boat-order {
        flex-shrink: 0;
        color: #dbeafe;
        font-weight: 750;
      }

      .prod-print-boat-model {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #8ea2ba;
      }

      .prod-prog-cell {
        padding: 6px 8px !important;
      }

      .prod-prog-input {
        width: 58px;
        min-height: 32px;
        padding: 0 7px;
        background: #081524;
        color: #e9c98a;
        border: 1px solid rgba(148,163,184,.22);
        border-radius: 7px;
        font-family: var(--font-geist-mono), ui-monospace, monospace;
        font-variant-numeric: tabular-nums;
        font-size: 12px;
        font-weight: 700;
        text-align: center;
      }

      .prod-prog-input:focus {
        outline: none;
        border-color: rgba(51,224,234,.55);
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
        position: relative;
        overflow: hidden;
        padding: 26px 26px 22px;
        display: flex;
        flex-direction: column;
        gap: 20px;
        border: 1px solid rgba(51,224,234,.22);
        border-radius: 19px;
        background:
          radial-gradient(circle at 88% -10%, rgba(51,224,234,.22), transparent 36%),
          linear-gradient(140deg,#0e2036,#060f1b 68%);
        box-shadow: 0 26px 54px -30px rgba(0,0,0,.7);
      }

      .prod-hero::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, #33e0ea, #0891b2 55%, transparent);
        opacity: .85;
      }

      .prod-hero-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
      }

      .prod-eyebrow {
        color: #33e0ea;
        font-size: 9px;
        font-weight: 950;
        letter-spacing: 2.2px;
      }

      .prod-hero h1 {
        margin: 7px 0 0;
        font-size: 36px;
        line-height: 1;
        font-weight: 950;
        letter-spacing: -1.2px;
      }

      .prod-hero p,
      .prod-section-head p {
        max-width: 760px;
        margin: 9px 0 0;
        color: #91a4bc;
        font-size: 11px;
        line-height: 1.55;
      }

      .prod-hero-stats {
        display: flex;
        align-items: stretch;
        gap: 22px;
        padding-top: 18px;
        border-top: 1px solid rgba(148,163,184,.14);
      }

      .prod-hero-stat {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .prod-hero-stat-value {
        font-family: var(--font-geist-mono), ui-monospace, monospace;
        font-variant-numeric: tabular-nums;
        font-size: 26px;
        font-weight: 800;
        line-height: 1;
        color: #f8fafc;
      }

      .prod-hero-stat.danger .prod-hero-stat-value {
        color: #f87171;
      }

      .prod-hero-stat.warn .prod-hero-stat-value {
        color: #e9c98a;
      }

      .prod-hero-stat-label {
        color: #8ea2ba;
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .7px;
      }

      .prod-hero-stat-divider {
        width: 1px;
        background: rgba(148,163,184,.16);
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
        border: 1px solid #0891b2;
        background: #0891b2;
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
        border: 1px solid rgba(51,224,234,.25);
        border-radius: 999px;
        background: rgba(51,224,234,.08);
        color: #7cf2c4;
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

      .prod-optional-sections {
        grid-column: 1 / -1;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 12px;
        border: 1px solid rgba(148,163,184,.22);
        border-radius: 9px;
        background: rgba(255,255,255,.02);
      }
      .prod-optional-sections-label {
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .5px;
        opacity: .6;
        margin-bottom: 2px;
      }
      .prod-optional-section-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12.5px;
        cursor: pointer;
      }
      .prod-optional-sections-empty {
        grid-column: 1 / -1;
        font-size: 11.5px;
        opacity: .5;
        padding: 2px 2px 4px;
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
        border-color: rgba(51,224,234,.55);
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
        min-width: 900px;
        border-collapse: collapse;
        font-size: 10px;
      }

      .prod-table th {
        padding: 12px 10px;
        background: rgba(255,255,255,.03);
        color: #8299b6;
        text-align: left;
        font-size: 8px;
        font-weight: 950;
        letter-spacing: .8px;
        text-transform: uppercase;
        white-space: nowrap;
        border-bottom: 1px solid rgba(51,224,234,.22);
      }

      .prod-table td {
        padding: 13px 10px;
        border-top: 1px solid rgba(148,163,184,.08);
        vertical-align: middle;
      }

      .prod-click-row {
        cursor: pointer;
        transition: background-color .12s ease, box-shadow .12s ease;
      }

      .prod-click-row:hover {
        background: rgba(51,224,234,.06);
        box-shadow: inset 3px 0 0 #33e0ea;
      }

      .prod-order {
        color: #7cf2c4;
        font-family: var(--font-geist-mono), ui-monospace, monospace;
        font-weight: 700;
        letter-spacing: .2px;
      }

      .prod-boat-cell {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .prod-boat-model {
        font-size: 12px;
        font-weight: 800;
        color: #f1f5f9;
      }

      .prod-boat-meta {
        font-size: 9.5px;
        color: #7d90a8;
        letter-spacing: .1px;
      }

      .prod-date-cell {
        font-family: var(--font-geist-mono), ui-monospace, monospace;
        font-variant-numeric: tabular-nums;
        color: #c3d2e3;
        font-weight: 700;
        white-space: nowrap;
      }

      .prod-date-cell.overdue {
        color: #f87171;
      }

      .prod-date-cell.soon {
        color: #e9c98a;
      }

      .prod-tap-pill {
        display: inline-flex;
        align-items: center;
        padding: 4px 9px;
        border-radius: 999px;
        font-size: 9px;
        font-weight: 800;
        white-space: nowrap;
      }

      .prod-tap-pill.yes {
        border: 1px solid rgba(34,197,94,.28);
        background: rgba(34,197,94,.08);
        color: #86efac;
      }

      .prod-tap-pill.no {
        border: 1px solid rgba(148,163,184,.22);
        background: rgba(255,255,255,.03);
        color: #8ea2ba;
      }

      .prod-note-cell {
        max-width: 260px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #a9b7c9;
      }

      .prod-empty,
      .prod-empty-cell {
        padding: 30px;
        color: #7388a3;
        text-align: center;
        font-size: 10px;
      }

      @media (max-width: 1000px) {
        .prod-form-grid {
          grid-template-columns: repeat(2,minmax(0,1fr));
        }
      }

      @media (max-width: 700px) {
        .prod-hero-top {
          align-items: stretch;
          flex-direction: column;
        }

        .prod-hero-stats {
          flex-wrap: wrap;
          row-gap: 14px;
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

        .prod-main-top {
          flex-direction: column;
          align-items: stretch;
        }

        .prod-print-actions {
          justify-content: flex-start;
        }
      }
    `}</style>
  );
}
