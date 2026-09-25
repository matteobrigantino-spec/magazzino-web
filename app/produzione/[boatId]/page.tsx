"use client";

import Link from "next/link";
import { Fragment, use, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { fetchCompanyLogo } from "../../../lib/pdfLogo";

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

type Department = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
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

type BoatUpholsteryRequirement = {
  id: string;
  supplierId: string;
  itemId: string;
  color: string;
  detailsLogos: string;
  stitching: string;
  quilting: string;
  note: string | null;
  kitId: string | null;
  kitMatricola: number | null;
  openOrderQty: number;
  requestedDelivery: string | null;
};

type UpholsteryStockCandidate = {
  id: string;
  matricola: number;
  color: string;
  detailsLogos: string;
  stitching: string;
  quilting: string;
};

// Solo per lo storico: le voci passate possono ancora avere uno stato
// intermedio (da quando esisteva), qui mostrato in modo leggibile senza
// riproporre la scelta manuale nel resto della pagina.
const historyLabel: Record<string, string> = {
  queued: "Arrivato nel reparto",
  working: "In lavorazione",
  waiting: "In attesa",
  blocked: "Bloccato",
  completed: "Reparto completato",
};

function formatItDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

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

function formatDate(value: string | null) {
  if (!value) return "-";

  const safeValue = value.includes("T") ? value : `${value}T00:00:00`;

  return new Intl.DateTimeFormat("it-IT").format(new Date(safeValue));
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

  // "Stampa articoli mancanti" (STEP 38): rigenera in qualsiasi momento il
  // PDF con gli articoli della distinta base (sezioni standard del
  // modello + sezioni optional scelte per questo battello) che
  // risultano con giacenza insufficiente. Sola lettura su items.stock,
  // non tocca mai la giacenza.
  const [missingPdfBusy, setMissingPdfBusy] = useState(false);
  const [missingPdfError, setMissingPdfError] = useState("");

  // Sezioni OPTIONAL della distinta base del modello di questo
  // battello, e quali risultano gia' scelte per lui (production_
  // boat_bom_sections). Le sezioni STANDARD non compaiono qui: fanno
  // sempre parte del modello, non si scelgono.
  const [optionalBomSections, setOptionalBomSections] = useState<
    { id: string; name: string }[]
  >([]);
  const [selectedBomSectionIds, setSelectedBomSectionIds] = useState<Set<string>>(new Set());
  const [bomSectionsLoaded, setBomSectionsLoaded] = useState(false);
  const [bomSectionBusyId, setBomSectionBusyId] = useState("");
  const [formOrderNumber, setFormOrderNumber] = useState("");
  const [formModelBoat, setFormModelBoat] = useState("");
  const [formHull, setFormHull] = useState("");
  const [formStringers, setFormStringers] = useState("");
  const [formDeck, setFormDeck] = useState("");
  const [formAccessories, setFormAccessories] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formTubeColor, setFormTubeColor] = useState("");
  const [formProgressive, setFormProgressive] = useState("");
  const [formRequestedDeliveryDate, setFormRequestedDeliveryDate] = useState("");

  // Colore tubolare: si può impostare anche qui, sulla scheda del
  // battello, non solo alla creazione o dal reparto Tubolari - utile
  // per i battelli inseriti prima di arrivare a quel reparto.
  const [tubeColorCurrent, setTubeColorCurrent] = useState("");

  // Tappezzeria collegata a questo battello: una o più richieste, ognuna
  // ASSEGNATA (kit fisico), IN ORDINE (una riga d'ordine la aspetta) o
  // DA ORDINARE.
  const [upholsteryRequirements, setUpholsteryRequirements] = useState<
    BoatUpholsteryRequirement[]
  >([]);
  const [itemDescriptionById, setItemDescriptionById] = useState<
    Record<string, string>
  >({});
  const [supplierNameById, setSupplierNameById] = useState<
    Record<string, string>
  >({});

  const [upholsterySuppliers, setUpholsterySuppliers] = useState<
    { id: string; name: string }[]
  >([]);
  const [upholsteryItemLookup, setUpholsteryItemLookup] = useState<
    { id: string; supplierId: string; description: string }[]
  >([]);
  const [upholsteryOptionRows, setUpholsteryOptionRows] = useState<
    { id: string; supplierId: string; option_type: string; name: string }[]
  >([]);

  const [showAddUpholstery, setShowAddUpholstery] = useState(false);
  const [newReqSupplierId, setNewReqSupplierId] = useState("");
  const [newReqItemId, setNewReqItemId] = useState("");
  const [newReqColor, setNewReqColor] = useState("");
  const [newReqDetails, setNewReqDetails] = useState("");
  const [newReqStitching, setNewReqStitching] = useState("");
  const [newReqQuilting, setNewReqQuilting] = useState("");
  const [newReqNote, setNewReqNote] = useState("");
  const [reqSaving, setReqSaving] = useState(false);
  const [reqError, setReqError] = useState("");

  const [searchingReqId, setSearchingReqId] = useState("");
  const [stockCandidates, setStockCandidates] = useState<
    UpholsteryStockCandidate[]
  >([]);
  const [assigningKitId, setAssigningKitId] = useState("");

  async function loadUpholsteryRequirements() {
    const { data, error } = await supabase
      .from("production_boat_upholstery")
      .select(
        "id,supplier_id,item_id,color,details_logos,stitching,quilting,note,kit_id,created_at,upholstery_kits(matricola,status),order_items(id,qty,received_qty,requested_delivery_date)"
      )
      .eq("boat_id", boatId)
      .order("created_at", { ascending: true });

    if (error || !data) {
      setUpholsteryRequirements([]);
      return;
    }

    const rows: BoatUpholsteryRequirement[] = (data as any[]).map((row) => {
      // La richiesta ha al massimo UNA riga d'ordine collegata
      // (production_boat_upholstery.order_item_id): piu' richieste
      // possono pero' condividere la stessa riga d'ordine se la sua
      // quantita' copre piu' battelli (vedi STEP 23).
      const orderLine = row.order_items || null;
      const isOpen =
        orderLine &&
        Number(orderLine.qty || 0) > Number(orderLine.received_qty || 0);

      return {
        id: String(row.id),
        supplierId: String(row.supplier_id),
        itemId: String(row.item_id),
        color: String(row.color || ""),
        detailsLogos: String(row.details_logos || ""),
        stitching: String(row.stitching || ""),
        quilting: String(row.quilting || ""),
        note: row.note ? String(row.note) : null,
        kitId: row.kit_id ? String(row.kit_id) : null,
        kitMatricola: row.upholstery_kits
          ? Number(row.upholstery_kits.matricola)
          : null,
        openOrderQty: isOpen
          ? Number(orderLine.qty || 0) - Number(orderLine.received_qty || 0)
          : 0,
        requestedDelivery: isOpen
          ? orderLine.requested_delivery_date || null
          : null,
      };
    });

    setUpholsteryRequirements(rows);

    const itemIds = Array.from(new Set(rows.map((row) => row.itemId)));
    const supplierIds = Array.from(
      new Set(rows.map((row) => row.supplierId))
    );

    if (itemIds.length > 0) {
      const { data: itemRows } = await supabase
        .from("items")
        .select("id,description")
        .in("id", itemIds);

      const map: Record<string, string> = {};
      (itemRows || []).forEach((item: any) => {
        map[String(item.id)] = String(item.description || "");
      });
      setItemDescriptionById(map);
    }

    if (supplierIds.length > 0) {
      const { data: supplierRows } = await supabase
        .from("suppliers")
        .select("id,name")
        .in("id", supplierIds);

      const map: Record<string, string> = {};
      (supplierRows || []).forEach((row: any) => {
        map[String(row.id)] = String(row.name || "");
      });
      setSupplierNameById(map);
    }
  }

  async function loadUpholsteryCatalog() {
    const { data: supplierRows } = await supabase
      .from("suppliers")
      .select("id,name")
      .eq("upholstery_enabled", true)
      .order("name", { ascending: true });

    const suppliers = (supplierRows || []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name || ""),
    }));

    setUpholsterySuppliers(suppliers);

    const supplierIds = suppliers.map((supplier) => supplier.id);

    if (supplierIds.length === 0) {
      setUpholsteryItemLookup([]);
      setUpholsteryOptionRows([]);
      return;
    }

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
        option_type: String(row.option_type),
        name: String(row.name || ""),
      }))
    );
  }

  function upholsteryItemsFor(supplierId: string) {
    return upholsteryItemLookup.filter(
      (item) => item.supplierId === supplierId
    );
  }

  function upholsteryOptionsFor(supplierId: string, type: string) {
    return upholsteryOptionRows.filter(
      (option) =>
        option.supplierId === supplierId && option.option_type === type
    );
  }

  function openAddUpholstery() {
    setReqError("");
    setNewReqSupplierId(upholsterySuppliers[0]?.id || "");
    setNewReqItemId("");
    setNewReqColor("");
    setNewReqDetails("");
    setNewReqStitching("");
    setNewReqQuilting("");
    setNewReqNote("");
    setShowAddUpholstery(true);
  }

  async function addUpholsteryRequirement() {
    setReqError("");

    if (
      !newReqSupplierId ||
      !newReqItemId ||
      !newReqColor ||
      !newReqDetails ||
      !newReqStitching ||
      !newReqQuilting
    ) {
      setReqError(
        "Compila fornitore, articolo, colore, dettagli, cucitura e trapuntatura."
      );
      return;
    }

    setReqSaving(true);

    const { data: inserted, error } = await supabase
      .from("production_boat_upholstery")
      .insert({
        boat_id: boatId,
        supplier_id: newReqSupplierId,
        item_id: newReqItemId,
        color: newReqColor,
        details_logos: newReqDetails,
        stitching: newReqStitching,
        quilting: newReqQuilting,
        note: newReqNote.trim() || null,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      setReqError("Errore salvataggio: " + (error?.message || ""));
      setReqSaving(false);
      return;
    }

    const { data: stockMatch } = await supabase
      .from("upholstery_kits")
      .select("id")
      .eq("supplier_id", newReqSupplierId)
      .eq("item_id", newReqItemId)
      .eq("status", "stock")
      .eq("color", newReqColor)
      .eq("details_logos", newReqDetails)
      .eq("stitching", newReqStitching)
      .eq("quilting", newReqQuilting)
      .limit(1)
      .maybeSingle();

    if (stockMatch?.id) {
      // Un kit identico è già in giacenza: va al battello con la
      // consegna richiesta più vicina tra tutti quelli in attesa
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
      // Nessun kit identico già in giacenza: prova ad abbinare in
      // automatico una riga d'ordine già aperta per lo stesso
      // fornitore + articolo (in base alla consegna richiesta più
      // vicina tra tutti i battelli in attesa).
      try {
        await supabase.rpc("sync_upholstery_order_links", {
          p_supplier_id: newReqSupplierId,
          p_item_id: newReqItemId,
        });
      } catch (syncError) {
        console.error("Errore abbinamento automatico tappezzeria:", syncError);
      }
    }

    setShowAddUpholstery(false);
    setReqSaving(false);
    await loadUpholsteryRequirements();
  }

  async function deleteUpholsteryRequirement(requirementId: string) {
    const confirmed = confirm(
      "Eliminare questa richiesta tappezzeria?"
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("production_boat_upholstery")
      .delete()
      .eq("id", requirementId);

    if (!error) {
      await loadUpholsteryRequirements();
    }
  }

  async function searchStockFor(requirement: BoatUpholsteryRequirement) {
    setSearchingReqId(requirement.id);
    setStockCandidates([]);

    const { data } = await supabase
      .from("upholstery_kits")
      .select("id,matricola,color,details_logos,stitching,quilting")
      .eq("supplier_id", requirement.supplierId)
      .eq("item_id", requirement.itemId)
      .eq("status", "stock")
      .order("matricola", { ascending: true });

    setStockCandidates(
      (data || []).map((row: any) => ({
        id: String(row.id),
        matricola: Number(row.matricola),
        color: String(row.color || ""),
        detailsLogos: String(row.details_logos || ""),
        stitching: String(row.stitching || ""),
        quilting: String(row.quilting || ""),
      }))
    );
  }

  function closeStockSearch() {
    setSearchingReqId("");
    setStockCandidates([]);
  }

  async function assignCandidate(requirementId: string, kitId: string) {
    setAssigningKitId(kitId);

    const { error } = await supabase.rpc(
      "assign_upholstery_kit_to_boat",
      {
        p_kit_id: kitId,
        p_boat_upholstery_id: requirementId,
      }
    );

    setAssigningKitId("");

    if (!error) {
      closeStockSearch();
      await loadUpholsteryRequirements();
    }
  }

  async function unassignRequirement(kitId: string) {
    const confirmed = confirm(
      "Annullare l'assegnazione? Il kit torna in giacenza."
    );

    if (!confirmed) return;

    const { error } = await supabase.rpc(
      "unassign_upholstery_kit_from_boat",
      { p_kit_id: kitId }
    );

    if (!error) {
      await loadUpholsteryRequirements();
    }
  }

  // Barra di avanzamento a step: un tap sul reparto attuale apre questo
  // pannellino per aggiungere una nota o completare il reparto, senza
  // uscire dalla scheda.
  const [stepEditing, setStepEditing] = useState(false);
  const [stepNoteDraft, setStepNoteDraft] = useState("");
  const [stepSaving, setStepSaving] = useState(false);
  const [stepError, setStepError] = useState("");

  useEffect(() => {
    loadData();
    loadUpholsteryRequirements();
    loadUpholsteryCatalog();
    loadBomSections();
  }, [boatId]);

  async function loadBomSections() {
    const { data: boatRow } = await supabase
      .from("production_boats")
      .select("model_boat")
      .eq("id", boatId)
      .maybeSingle();

    const modelBoatValue = boatRow?.model_boat ? String(boatRow.model_boat) : "";

    if (!modelBoatValue) {
      setOptionalBomSections([]);
      setSelectedBomSectionIds(new Set());
      setBomSectionsLoaded(true);
      return;
    }

    const [sectionsRes, boatSectionsRes] = await Promise.all([
      supabase
        .from("production_bom_sections")
        .select("id,name")
        .eq("model_boat", modelBoatValue)
        .eq("kind", "optional")
        .order("sort_order", { ascending: true }),
      supabase.from("production_boat_bom_sections").select("section_id").eq("boat_id", boatId),
    ]);

    setOptionalBomSections(
      !sectionsRes.error && sectionsRes.data
        ? sectionsRes.data.map((row: any) => ({ id: String(row.id), name: String(row.name || "") }))
        : []
    );

    setSelectedBomSectionIds(
      new Set(
        !boatSectionsRes.error && boatSectionsRes.data
          ? boatSectionsRes.data.map((row: any) => String(row.section_id))
          : []
      )
    );

    setBomSectionsLoaded(true);
  }

  async function toggleBomSection(sectionId: string) {
    setBomSectionBusyId(sectionId);

    const isSelected = selectedBomSectionIds.has(sectionId);

    if (isSelected) {
      await supabase
        .from("production_boat_bom_sections")
        .delete()
        .eq("boat_id", boatId)
        .eq("section_id", sectionId);
    } else {
      await supabase.from("production_boat_bom_sections").insert({
        boat_id: boatId,
        section_id: sectionId,
      });
    }

    setSelectedBomSectionIds((current) => {
      const next = new Set(current);
      if (isSelected) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });

    setBomSectionBusyId("");
  }

  async function loadData() {
    setLoading(true);

    const [boatRes, depRes, stepRes, optionsRes, tubRes] = await Promise.all([
      supabase
        .from("production_boats")
        .select("id,progressive_no,order_number,model_boat,hull,stringers,deck,accessories,note,status,created_at,completed_at,requested_delivery_date")
        .eq("id", boatId)
        .maybeSingle(),
      supabase
        .from("production_departments")
        .select("id,name,sort_order,active")
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
      supabase
        .from("production_tubolari")
        .select("boat_id,tube_color")
        .eq("boat_id", boatId)
        .maybeSingle(),
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
      progressive_no:
        boatRes.data.progressive_no === null || boatRes.data.progressive_no === undefined
          ? null
          : Number(boatRes.data.progressive_no),
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
      requested_delivery_date: boatRes.data.requested_delivery_date
        ? String(boatRes.data.requested_delivery_date)
        : null,
    };

    setBoat(cleanBoat);
    setFormOrderNumber(cleanBoat.order_number);
    setFormModelBoat(cleanBoat.model_boat);
    setFormHull(cleanBoat.hull);
    setFormStringers(cleanBoat.stringers);
    setFormDeck(cleanBoat.deck);
    setFormAccessories(cleanBoat.accessories);
    setFormNote(cleanBoat.note || "");
    setFormProgressive(cleanBoat.progressive_no === null ? "" : String(cleanBoat.progressive_no));
    setFormRequestedDeliveryDate(cleanBoat.requested_delivery_date || "");

    const cleanTubeColor =
      !tubRes.error && tubRes.data ? String((tubRes.data as any).tube_color || "") : "";
    setTubeColorCurrent(cleanTubeColor);
    setFormTubeColor(cleanTubeColor);

    const cleanDeps = (depRes.data || []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name || ""),
      sort_order: Number(row.sort_order || 0),
      active: row.active !== false,
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

  // La barra a step mostra solo i reparti ATTUALMENTE attivi: quelli
  // disattivati (rinominati/sostituiti) restano nello storico ma non
  // devono più comparire come tappe del percorso.
  const activeDepartments = useMemo(
    () => departments.filter((dep) => dep.active),
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

  function openStepEditor() {
    if (!currentStep) return;
    setStepNoteDraft(currentStep.current_note || "");
    setStepError("");
    setStepEditing(true);
  }

  function closeStepEditor() {
    setStepEditing(false);
    setStepError("");
  }

  async function saveStepNote() {
    if (!currentStep) return;
    setStepError("");
    setStepSaving(true);

    const operator =
      localStorage.getItem("magazzino_display_name") ||
      localStorage.getItem("magazzino_user") ||
      "Matteo";

    const { error } = await supabase.rpc("update_production_step_status", {
      p_step_id: currentStep.id,
      p_status: currentStep.status,
      p_note: stepNoteDraft.trim() || null,
      p_changed_by: operator,
    });

    if (error) {
      setStepError("Errore salvataggio nota: " + error.message);
      setStepSaving(false);
      return;
    }

    setStepSaving(false);
    setStepEditing(false);
    await loadData();
  }

  async function completeCurrentStep() {
    if (!currentStep) return;
    setStepError("");

    const confirmed = window.confirm(
      "Confermi il completamento di questo reparto?\n\nIl battello uscirà da questo reparto e passerà automaticamente al reparto successivo."
    );

    if (!confirmed) return;

    setStepSaving(true);

    const operator =
      localStorage.getItem("magazzino_display_name") ||
      localStorage.getItem("magazzino_user") ||
      "Matteo";

    const { error } = await supabase.rpc("update_production_step_status", {
      p_step_id: currentStep.id,
      p_status: "completed",
      p_note: stepNoteDraft.trim() || null,
      p_changed_by: operator,
    });

    if (error) {
      setStepError("Errore completamento reparto: " + error.message);
      setStepSaving(false);
      return;
    }

    setStepSaving(false);
    setStepEditing(false);
    await loadData();
  }

  function startEditing() {
    if (!boat) return;
    setFormOrderNumber(boat.order_number);
    setFormModelBoat(boat.model_boat);
    setFormHull(boat.hull);
    setFormStringers(boat.stringers);
    setFormDeck(boat.deck);
    setFormAccessories(boat.accessories);
    setFormNote(boat.note || "");
    setFormTubeColor(tubeColorCurrent);
    setSaveError("");
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setSaveError("");
  }

  async function downloadMissingArticlesPdf() {
    if (!boat) return;

    setMissingPdfError("");
    setMissingPdfBusy(true);

    try {
      const { data: sectionRows, error: sectionsError } = await supabase
        .from("production_bom_sections")
        .select("id,name,kind")
        .eq("model_boat", boat.model_boat);

      if (sectionsError) throw sectionsError;

      const sections = (sectionRows || []).filter(
        (row: any) => row.kind === "standard" || selectedBomSectionIds.has(String(row.id))
      );

      if (sections.length === 0) {
        throw new Error(
          "Questo modello non ha ancora una distinta base (vedi Produzione -> Distinta base)."
        );
      }

      const sectionIds = sections.map((row: any) => String(row.id));

      const { data: bomRows, error: bomError } = await supabase
        .from("production_bom_items")
        .select("id,section_id,item_id,description,unit,qty")
        .in("section_id", sectionIds);

      if (bomError) throw bomError;

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
        const { data: itemRows, error: itemsError } = await supabase
          .from("items")
          .select("id,supplier_id,code,supplier_code,description,stock")
          .in("id", itemIds);

        if (itemsError) throw itemsError;

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

      const logo = await fetchCompanyLogo();
      const { buildMissingArticlesPdf } = await import("../../../lib/productionPdf");
      const { doc, filename } = buildMissingArticlesPdf({
        boatOrderNumber: boat.order_number,
        boatModel: boat.model_boat,
        boatProgressiveNo: boat.progressive_no,
        requestedDeliveryDate: formatItDate(boat.requested_delivery_date || ""),
        sections: Array.from(missingBySection.entries()).map(([sectionName, rows]) => ({
          sectionName,
          rows,
        })),
        logo,
        generatedDate: formatItDate(new Date().toISOString().slice(0, 10)),
      });

      doc.save(filename);
    } catch (err: any) {
      setMissingPdfError(err?.message || "Errore generazione PDF.");
    } finally {
      setMissingPdfBusy(false);
    }
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

    const progressiveTrimmed = formProgressive.trim();
    const progressiveValue = progressiveTrimmed === "" ? null : Number(progressiveTrimmed);

    if (
      progressiveValue !== null &&
      (!Number.isFinite(progressiveValue) || progressiveValue <= 0)
    ) {
      setSaveError("Il numero progressivo non è valido.");
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
        progressive_no: progressiveValue,
        requested_delivery_date: formRequestedDeliveryDate || null,
      })
      .eq("id", boatId);

    if (error) {
      setSaveError("Errore salvataggio modifiche: " + error.message);
      setSaving(false);
      return;
    }

    const tubError = await supabase
      .from("production_tubolari")
      .upsert(
        { boat_id: boatId, tube_color: formTubeColor.trim() },
        { onConflict: "boat_id" }
      );

    if (tubError.error) {
      setSaveError("Errore salvataggio colore tubolare: " + tubError.error.message);
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
          <div className="pbd-eyebrow">
            SCHEDA PRODUZIONE{boat.progressive_no ? ` · PROG. ${boat.progressive_no}` : ""}
          </div>
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
          <button
            type="button"
            className="pbd-edit-btn"
            onClick={downloadMissingArticlesPdf}
            disabled={missingPdfBusy}
          >
            {missingPdfBusy ? "Generazione..." : "Stampa articoli mancanti"}
          </button>
          {!editing && (
            <button type="button" className="pbd-edit-btn" onClick={startEditing}>
              Modifica
            </button>
          )}
        </div>
      </section>

      {missingPdfError && <div className="pbd-error">{missingPdfError}</div>}

      {bomSectionsLoaded && optionalBomSections.length > 0 && (
        <section className="pbd-card">
          <div className="pbd-head">
            <div>
              <div className="pbd-eyebrow">DISTINTA BASE</div>
              <h2>Optional di questo battello</h2>
            </div>
          </div>
          <div className="pbd-bom-hint">
            Le dotazioni di serie del modello sono sempre incluse. Spunta qui gli
            optional che ha questo battello: cambia solo cosa conta come
            &quot;mancante&quot; nel PDF, non tocca la giacenza.
          </div>
          <div className="pbd-bom-list">
            {optionalBomSections.map((section) => (
              <label key={section.id} className="pbd-bom-row">
                <input
                  type="checkbox"
                  checked={selectedBomSectionIds.has(section.id)}
                  disabled={bomSectionBusyId === section.id}
                  onChange={() => toggleBomSection(section.id)}
                />
                {section.name}
              </label>
            ))}
          </div>
        </section>
      )}

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

            <EditField label="Numero progressivo (per la stampa PDF)">
              <input
                type="number"
                min="1"
                placeholder="—"
                value={formProgressive}
                onChange={(e) => setFormProgressive(e.target.value)}
              />
            </EditField>

            <EditField label="Data di consegna richiesta">
              <input
                type="date"
                value={formRequestedDeliveryDate}
                onChange={(e) => setFormRequestedDeliveryDate(e.target.value)}
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

            <EditField label="Colore tubolare (facoltativo)">
              <select value={formTubeColor} onChange={(e) => setFormTubeColor(e.target.value)}>
                <option value="">Nessuno / non è un gommone...</option>
                {withCurrentValue(colorOptions, formTubeColor).map((option) => (
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
            <Info label="Colore tubolare" value={tubeColorCurrent || "—"} />
            <Info
              label="Consegna richiesta"
              value={
                boat.requested_delivery_date
                  ? formatItDate(boat.requested_delivery_date)
                  : "—"
              }
            />
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
            <div className="pbd-eyebrow">TAPPEZZERIA</div>
            <h2>Stato tappezzeria</h2>
          </div>

          <button
            type="button"
            className="pbd-edit-btn"
            onClick={openAddUpholstery}
            disabled={upholsterySuppliers.length === 0}
          >
            + Aggiungi tappezzeria
          </button>
        </div>

        {upholsteryRequirements.length === 0 && !showAddUpholstery && (
          <div className="pbd-note">
            Nessuna tappezzeria collegata a questo battello.
          </div>
        )}

        {upholsteryRequirements.map((requirement) => {
          const statusLabelText = requirement.kitId
            ? "ASSEGNATA"
            : requirement.openOrderQty > 0
            ? "IN ORDINE"
            : "DA ORDINARE";

          const statusClass = requirement.kitId
            ? "assigned"
            : requirement.openOrderQty > 0
            ? "ordered"
            : "toorder";

          return (
            <div key={requirement.id} className="pbd-upholstery-row">
              <div className="pbd-upholstery-main">
                <div>
                  <strong>
                    {itemDescriptionById[requirement.itemId] ||
                      "Articolo"}
                  </strong>
                  <span className="pbd-upholstery-supplier">
                    {supplierNameById[requirement.supplierId] || ""}
                  </span>
                </div>

                <div className="pbd-upholstery-details">
                  {requirement.color} · {requirement.detailsLogos} ·{" "}
                  {requirement.stitching} · {requirement.quilting}
                </div>

                {requirement.note && (
                  <div className="pbd-upholstery-note">
                    {requirement.note}
                  </div>
                )}
              </div>

              <div className="pbd-upholstery-status">
                <span className={`pbd-uph-badge ${statusClass}`}>
                  {statusLabelText}
                </span>

                {requirement.kitId && (
                  <>
                    <span className="pbd-upholstery-info">
                      Matricola #{requirement.kitMatricola}
                    </span>
                    <button
                      type="button"
                      className="pbd-btn-link"
                      onClick={() =>
                        unassignRequirement(requirement.kitId as string)
                      }
                    >
                      Annulla assegnazione
                    </button>
                  </>
                )}

                {!requirement.kitId && requirement.openOrderQty > 0 && (
                  <span className="pbd-upholstery-info">
                    {requirement.requestedDelivery
                      ? `Consegna richiesta: ${formatDate(
                          requirement.requestedDelivery
                        )}`
                      : "Nessuna data di consegna indicata"}
                  </span>
                )}

                {!requirement.kitId && requirement.openOrderQty === 0 && (
                  <div className="pbd-upholstery-actions">
                    <button
                      type="button"
                      className="pbd-btn-link"
                      onClick={() => searchStockFor(requirement)}
                    >
                      Cerca in giacenza
                    </button>
                    <button
                      type="button"
                      className="pbd-btn-link danger"
                      onClick={() =>
                        deleteUpholsteryRequirement(requirement.id)
                      }
                    >
                      Elimina
                    </button>
                  </div>
                )}
              </div>

              {searchingReqId === requirement.id && (
                <div className="pbd-upholstery-search">
                  {stockCandidates.length === 0 ? (
                    <div className="pbd-upholstery-note">
                      Nessun kit di questo articolo in giacenza.
                    </div>
                  ) : (
                    stockCandidates.map((candidate) => (
                      <div
                        key={candidate.id}
                        className="pbd-upholstery-candidate"
                      >
                        <span>
                          #{candidate.matricola} — {candidate.color} ·{" "}
                          {candidate.detailsLogos} · {candidate.stitching}{" "}
                          · {candidate.quilting}
                        </span>
                        <button
                          type="button"
                          className="pbd-btn-link"
                          disabled={assigningKitId === candidate.id}
                          onClick={() =>
                            assignCandidate(requirement.id, candidate.id)
                          }
                        >
                          {assigningKitId === candidate.id
                            ? "Assegno..."
                            : "Assegna"}
                        </button>
                      </div>
                    ))
                  )}

                  <button
                    type="button"
                    className="pbd-btn-link"
                    onClick={closeStockSearch}
                  >
                    Chiudi
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {showAddUpholstery && (
          <div className="pbd-upholstery-add">
            {reqError && (
              <div className="pbd-form-error">{reqError}</div>
            )}

            <div className="pbd-form-grid">
              <EditField label="Fornitore">
                <select
                  value={newReqSupplierId}
                  onChange={(e) => {
                    setNewReqSupplierId(e.target.value);
                    setNewReqItemId("");
                    setNewReqColor("");
                    setNewReqDetails("");
                    setNewReqStitching("");
                    setNewReqQuilting("");
                  }}
                >
                  {upholsterySuppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </EditField>

              <EditField label="Articolo">
                <select
                  value={newReqItemId}
                  onChange={(e) => setNewReqItemId(e.target.value)}
                >
                  <option value="">Seleziona articolo...</option>
                  {upholsteryItemsFor(newReqSupplierId).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.description}
                    </option>
                  ))}
                </select>
              </EditField>

              <EditField label="Colore">
                <select
                  value={newReqColor}
                  onChange={(e) => setNewReqColor(e.target.value)}
                >
                  <option value="">Seleziona...</option>
                  {upholsteryOptionsFor(newReqSupplierId, "color").map(
                    (option) => (
                      <option key={option.id} value={option.name}>
                        {option.name}
                      </option>
                    )
                  )}
                </select>
              </EditField>

              <EditField label="Dettagli e loghi">
                <select
                  value={newReqDetails}
                  onChange={(e) => setNewReqDetails(e.target.value)}
                >
                  <option value="">Seleziona...</option>
                  {upholsteryOptionsFor(
                    newReqSupplierId,
                    "details_logos"
                  ).map((option) => (
                    <option key={option.id} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </EditField>

              <EditField label="Cucitura">
                <select
                  value={newReqStitching}
                  onChange={(e) => setNewReqStitching(e.target.value)}
                >
                  <option value="">Seleziona...</option>
                  {upholsteryOptionsFor(newReqSupplierId, "stitching").map(
                    (option) => (
                      <option key={option.id} value={option.name}>
                        {option.name}
                      </option>
                    )
                  )}
                </select>
              </EditField>

              <EditField label="Trapuntatura">
                <select
                  value={newReqQuilting}
                  onChange={(e) => setNewReqQuilting(e.target.value)}
                >
                  <option value="">Seleziona...</option>
                  {upholsteryOptionsFor(newReqSupplierId, "quilting").map(
                    (option) => (
                      <option key={option.id} value={option.name}>
                        {option.name}
                      </option>
                    )
                  )}
                </select>
              </EditField>

              <EditField label="Nota" wide>
                <input
                  value={newReqNote}
                  onChange={(e) => setNewReqNote(e.target.value)}
                  placeholder="Facoltativa"
                />
              </EditField>
            </div>

            <div className="pbd-form-actions">
              <button
                type="button"
                className="pbd-back"
                onClick={() => setShowAddUpholstery(false)}
                disabled={reqSaving}
              >
                Annulla
              </button>
              <button
                type="button"
                className="pbd-save-btn"
                onClick={addUpholsteryRequirement}
                disabled={reqSaving}
              >
                {reqSaving ? "Salvataggio..." : "Salva tappezzeria"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="pbd-card">
        <div className="pbd-head">
          <div>
            <div className="pbd-eyebrow">PERCORSO PRODUTTIVO</div>
            <h2>Avanzamento lavoro</h2>
            <p className="pbd-stepper-hint">
              Tocca il reparto attuale (quello acceso) per cambiarne lo stato.
            </p>
          </div>
        </div>

        <div className="pbd-stepper">
          <div className="pbd-stepper-row">
            {activeDepartments.map((dep, index) => {
              const step = sortedSteps.find((row) => row.department_id === dep.id);
              const status = step ? step.status : "future";
              const isCurrent = currentStep?.department_id === dep.id;

              return (
                <Fragment key={dep.id}>
                  <div className="pbd-stepper-dot-wrap">
                    <button
                      type="button"
                      className={`pbd-dot ${status}`}
                      disabled={!isCurrent}
                      onClick={openStepEditor}
                      title={dep.name}
                    >
                      {status === "completed" ? "✓" : dep.sort_order}
                    </button>
                    <div className="pbd-stepper-label">
                      <strong>{dep.name}</strong>
                      <span>
                        {!step
                          ? "Non raggiunto"
                          : status === "completed"
                            ? "Completato"
                            : "In reparto"}
                      </span>
                      {step?.current_note && <em>{step.current_note}</em>}
                    </div>
                  </div>
                  {index < activeDepartments.length - 1 && (
                    <div className={`pbd-stepper-line ${status === "completed" ? "done" : ""}`} />
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>

        {stepEditing && currentStep && (
          <div className="pbd-step-editor">
            {stepError && <div className="pbd-form-error">{stepError}</div>}
            <div className="pbd-step-editor-row">
              <label className="pbd-field wide">
                <span>Nota · {depMap.get(currentStep.department_id)?.name}</span>
                <input
                  value={stepNoteDraft}
                  onChange={(e) => setStepNoteDraft(e.target.value)}
                  placeholder="Nota (facoltativa)..."
                />
              </label>
            </div>
            <div className="pbd-form-actions">
              <button type="button" className="pbd-back" onClick={closeStepEditor} disabled={stepSaving}>
                Annulla
              </button>
              <button type="button" className="pbd-save-btn secondary" onClick={saveStepNote} disabled={stepSaving}>
                {stepSaving ? "Salvataggio..." : "Salva nota"}
              </button>
              <button type="button" className="pbd-save-btn" onClick={completeCurrentStep} disabled={stepSaving}>
                {stepSaving ? "Salvataggio..." : "Completa reparto →"}
              </button>
            </div>
          </div>
        )}
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
                      <strong>{historyLabel[entry.status] || entry.status}</strong>
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
      .pbd-upholstery-row { padding:14px 0; border-top:1px solid rgba(148,163,184,.14); display:flex; flex-wrap:wrap; gap:14px; align-items:flex-start; justify-content:space-between; }
      .pbd-upholstery-row:first-of-type { border-top:0; }
      .pbd-upholstery-main strong { font-size:13px; }
      .pbd-upholstery-supplier { margin-left:8px; font-size:10px; color:#7d90a8; font-weight:800; }
      .pbd-upholstery-details { margin-top:3px; font-size:11px; color:#a9b8cc; }
      .pbd-upholstery-note { margin-top:3px; font-size:11px; color:#7d90a8; font-style:italic; }
      .pbd-upholstery-status { display:flex; flex-direction:column; align-items:flex-end; gap:5px; min-width:160px; }
      .pbd-uph-badge { padding:4px 10px; border-radius:20px; font-size:9px; font-weight:950; letter-spacing:.6px; }
      .pbd-uph-badge.assigned { background:rgba(34,197,94,.16); color:#4ade80; border:1px solid rgba(34,197,94,.3); }
      .pbd-uph-badge.ordered { background:rgba(59,130,246,.16); color:#60a5fa; border:1px solid rgba(59,130,246,.3); }
      .pbd-uph-badge.toorder { background:rgba(239,68,68,.14); color:#f87171; border:1px solid rgba(239,68,68,.3); }
      .pbd-upholstery-info { font-size:10px; color:#91a4bc; text-align:right; }
      .pbd-upholstery-actions { display:flex; gap:10px; }
      .pbd-btn-link { background:none; border:0; padding:0; color:#60a5fa; font-size:10px; font-weight:850; cursor:pointer; }
      .pbd-btn-link.danger { color:#f87171; }
      .pbd-upholstery-search { width:100%; margin-top:6px; padding:10px; border-radius:10px; background:rgba(59,130,246,.08); border:1px solid rgba(59,130,246,.18); display:flex; flex-direction:column; gap:8px; }
      .pbd-upholstery-candidate { display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:11px; }
      .pbd-upholstery-add { margin-top:16px; padding-top:16px; border-top:1px dashed rgba(148,163,184,.24); }
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
      .pbd-save-btn.secondary { border:1px solid rgba(148,163,184,.28); background:rgba(255,255,255,.035); color:#dce8f5; }
      .pbd-save-btn:disabled,.pbd-back:disabled { opacity:.55; cursor:wait; }
      .pbd-error { margin-bottom:10px; padding:11px 13px; border:1px solid rgba(239,68,68,.28); border-radius:9px; background:rgba(239,68,68,.08); color:#fca5a5; font-size:10px; font-weight:800; }
      .pbd-bom-hint { font-size:10.5px; opacity:.6; margin:6px 0 12px; max-width:640px; }
      .pbd-bom-list { display:flex; flex-direction:column; gap:8px; }
      .pbd-bom-row { display:flex; align-items:center; gap:9px; font-size:12px; cursor:pointer; }
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
      .pbd-stepper-hint { margin:5px 0 0; color:#7187a1; font-size:9px; font-weight:700; }
      .pbd-stepper { margin-top:16px; overflow-x:auto; padding-bottom:4px; }
      .pbd-stepper-row { min-width:min-content; display:flex; align-items:flex-start; }
      .pbd-stepper-dot-wrap { flex:0 0 auto; width:118px; display:flex; flex-direction:column; align-items:center; text-align:center; }
      .pbd-dot { width:38px; height:38px; flex:0 0 auto; display:grid; place-items:center; border-radius:50%; border:2px solid rgba(148,163,184,.30); background:#0b1828; color:#9eb0c5; font-size:12px; font-weight:950; cursor:default; }
      .pbd-dot.future { opacity:.45; }
      .pbd-dot.queued { border-color:rgba(148,163,184,.45); color:#cbd5e1; }
      .pbd-dot.working { border-color:#3b82f6; background:rgba(59,130,246,.16); color:#bfdbfe; box-shadow:0 0 0 4px rgba(59,130,246,.12); }
      .pbd-dot.waiting { border-color:#f59e0b; background:rgba(245,158,11,.14); color:#fde68a; box-shadow:0 0 0 4px rgba(245,158,11,.10); }
      .pbd-dot.blocked { border-color:#f43f5e; background:rgba(244,63,94,.16); color:#fecdd3; box-shadow:0 0 0 4px rgba(244,63,94,.10); }
      .pbd-dot.completed { border-color:#22c55e; background:rgba(34,197,94,.18); color:#bbf7d0; }
      .pbd-dot:not(:disabled) { cursor:pointer; }
      .pbd-dot:not(:disabled):hover { filter:brightness(1.15); }
      .pbd-stepper-label { margin-top:8px; display:flex; flex-direction:column; gap:2px; }
      .pbd-stepper-label strong { font-size:9px; font-weight:900; }
      .pbd-stepper-label span { color:#8ea2ba; font-size:8px; font-weight:800; text-transform:uppercase; letter-spacing:.4px; }
      .pbd-stepper-label em { margin-top:2px; color:#c4d2e1; font-size:8px; font-style:normal; }
      .pbd-stepper-line { flex:1 1 auto; min-width:18px; height:2px; margin-top:19px; background:rgba(148,163,184,.22); }
      .pbd-stepper-line.done { background:#22c55e; }
      .pbd-step-editor { margin-top:18px; padding:14px; border:1px solid rgba(96,165,250,.22); border-radius:10px; background:rgba(59,130,246,.05); }
      .pbd-step-editor-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
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
      @media(max-width:850px){ .pbd-hero{align-items:stretch;flex-direction:column}.pbd-specs{grid-template-columns:repeat(2,minmax(0,1fr))}.pbd-edit-grid{grid-template-columns:repeat(2,minmax(0,1fr))} }
      @media(max-width:520px){ .pbd-edit-grid{grid-template-columns:1fr}.pbd-field.wide{grid-column:span 1}.pbd-step-editor-row{grid-template-columns:1fr} }
    `}</style>
  );
}
