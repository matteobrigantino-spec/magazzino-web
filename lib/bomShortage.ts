import { supabase } from "./supabaseClient";
import type { MissingArticleSection, MissingArticleSectionRow } from "./productionPdf";

// ============================================================
// Simulazione di allocazione della giacenza tra i battelli attivi
// ============================================================
//
// Un articolo della distinta base puo' essere richiesto da piu'
// battelli contemporaneamente in produzione. Se la giacenza non
// basta per tutti, questa funzione decide - solo per la SIMULAZIONE,
// senza mai toccare items.stock - a chi va assegnata per primo: al
// battello con la consegna richiesta piu' vicina. Chi resta scoperto
// (in tutto o in parte) risulta "mancante" nel proprio PDF.
//
// E' un controllo di sola lettura, ricalcolato ogni volta da zero
// sullo stato attuale di magazzino e battelli: non crea richieste,
// non assegna kit, non aggancia ordini, non persiste nulla.
// ============================================================

type BoatInfo = {
  id: string;
  order_number: string;
  model_boat: string;
  progressive_no: number | null;
  requested_delivery_date: string | null;
  created_at: string;
};

export type BoatBomShortageSummary = {
  boatId: string;
  boatOrderNumber: string;
  boatModel: string;
  boatProgressiveNo: number | null;
  requestedDeliveryDate: string | null;
  sections: MissingArticleSection[];
  totalMissingLines: number;
  totalMissingQty: number;
};

// Ordina i battelli per priorita' di allocazione: consegna richiesta
// piu' vicina prima; chi non ha ancora una data e' meno urgente e va
// in fondo; a parita' di data vince chi e' stato inserito prima.
function sortByPriority(boats: BoatInfo[]) {
  return [...boats].sort((a, b) => {
    const da = a.requested_delivery_date;
    const db = b.requested_delivery_date;
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (da && !db) return -1;
    if (!da && db) return 1;
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return 0;
  });
}

// Nucleo della simulazione: raccoglie tutti i battelli coinvolti (di
// norma quelli attivi, piu' eventualmente un battello specifico anche
// se non piu' attivo) e calcola, articolo per articolo, quanto resta
// scoperto a ciascun battello dopo aver dato precedenza a chi consegna
// prima. extraBoatId permette di includere un battello puntuale anche
// se il suo status non e' (piu') "active", cosi' la sua scheda puo'
// sempre rigenerare il proprio PDF.
async function runShortageSimulation(extraBoatId?: string) {
  const orFilter = extraBoatId
    ? `status.eq.active,id.eq.${extraBoatId}`
    : "status.eq.active";

  const { data: boatsData, error: boatsError } = await supabase
    .from("production_boats")
    .select("id,order_number,model_boat,progressive_no,requested_delivery_date,created_at,status")
    .or(orFilter);

  if (boatsError) throw boatsError;

  const boats: BoatInfo[] = (boatsData || []).map((row: any) => ({
    id: String(row.id),
    order_number: String(row.order_number || ""),
    model_boat: String(row.model_boat || ""),
    progressive_no: row.progressive_no === null || row.progressive_no === undefined ? null : Number(row.progressive_no),
    requested_delivery_date: row.requested_delivery_date || null,
    created_at: String(row.created_at || ""),
  }));

  const priorityOrder = sortByPriority(boats);
  const boatRank = new Map(priorityOrder.map((b, i) => [b.id, i]));
  const boatById = new Map(boats.map((b) => [b.id, b]));

  // Sezioni applicabili per ciascun battello: standard del modello +
  // sezioni optional scelte per quel singolo battello.
  const models = Array.from(new Set(boats.map((b) => b.model_boat).filter(Boolean)));

  const { data: allSections, error: sectionsError } = await supabase
    .from("production_bom_sections")
    .select("id,model_boat,name,kind")
    .in("model_boat", models.length > 0 ? models : ["__nessun_modello__"]);

  if (sectionsError) throw sectionsError;

  const sectionsByModel = new Map<string, { id: string; name: string; kind: string }[]>();
  (allSections || []).forEach((row: any) => {
    const key = String(row.model_boat || "");
    const list = sectionsByModel.get(key) || [];
    list.push({ id: String(row.id), name: String(row.name || ""), kind: String(row.kind || "") });
    sectionsByModel.set(key, list);
  });

  const boatIds = boats.map((b) => b.id);
  const { data: boatOptionalRows, error: optionalError } = await supabase
    .from("production_boat_bom_sections")
    .select("boat_id,section_id")
    .in("boat_id", boatIds.length > 0 ? boatIds : ["__nessun_battello__"]);

  if (optionalError) throw optionalError;

  const optionalSectionIdsByBoat = new Map<string, Set<string>>();
  (boatOptionalRows || []).forEach((row: any) => {
    const bId = String(row.boat_id);
    const set = optionalSectionIdsByBoat.get(bId) || new Set<string>();
    set.add(String(row.section_id));
    optionalSectionIdsByBoat.set(bId, set);
  });

  const applicableSectionIdsByBoat = new Map<string, string[]>();
  boats.forEach((b) => {
    const modelSections = sectionsByModel.get(b.model_boat) || [];
    const optionalIds = optionalSectionIdsByBoat.get(b.id) || new Set<string>();
    const ids = modelSections
      .filter((s) => s.kind === "standard" || optionalIds.has(s.id))
      .map((s) => s.id);
    applicableSectionIdsByBoat.set(b.id, ids);
  });

  const allSectionIds = Array.from(new Set(Array.from(applicableSectionIdsByBoat.values()).flat()));

  const empty = {
    boats,
    boatById,
    sectionsByModel,
    applicableSectionIdsByBoat,
    bomItemsBySection: new Map<string, any[]>(),
    itemById: new Map<string, any>(),
    supplierNameById: new Map<string, string>(),
    shortfallByItemAndBoat: new Map<string, Map<string, number>>(),
  };

  if (allSectionIds.length === 0) return empty;

  // Righe della distinta base per tutte le sezioni coinvolte.
  const { data: bomRows, error: bomError } = await supabase
    .from("production_bom_items")
    .select("id,section_id,item_id,description,unit,qty")
    .in("section_id", allSectionIds);

  if (bomError) throw bomError;

  const bomItemsBySection = new Map<string, any[]>();
  (bomRows || []).forEach((row: any) => {
    const sId = String(row.section_id);
    const list = bomItemsBySection.get(sId) || [];
    list.push(row);
    bomItemsBySection.set(sId, list);
  });

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
      const { data: supplierRows, error: suppliersError } = await supabase
        .from("suppliers")
        .select("id,name")
        .in("id", supplierIds);

      if (suppliersError) throw suppliersError;

      supplierNameById = new Map(
        (supplierRows || []).map((row: any) => [String(row.id), String(row.name || "")])
      );
    }
  }

  // Domanda per articolo: per ciascun battello, quanti pezzi di
  // ciascun articolo servono in totale (sommando eventuali righe
  // ripetute tra le sue sezioni).
  type Demand = { boatId: string; qty: number };
  const demandByItem = new Map<string, Demand[]>();

  boats.forEach((b) => {
    const sectionIds = applicableSectionIdsByBoat.get(b.id) || [];
    const totalsByItem = new Map<string, number>();
    sectionIds.forEach((sId) => {
      (bomItemsBySection.get(sId) || []).forEach((row: any) => {
        if (!row.item_id) return;
        const iId = String(row.item_id);
        const qty = Number(row.qty || 0);
        totalsByItem.set(iId, (totalsByItem.get(iId) || 0) + qty);
      });
    });
    totalsByItem.forEach((qty, iId) => {
      const list = demandByItem.get(iId) || [];
      list.push({ boatId: b.id, qty });
      demandByItem.set(iId, list);
    });
  });

  // Simulazione: per ciascun articolo, la giacenza disponibile viene
  // assegnata ai battelli in ordine di priorita'. Quello che resta
  // scoperto e' "mancante" per quel battello - senza mai toccare la
  // giacenza reale (items.stock non viene letto che qui, e mai
  // scritto).
  const shortfallByItemAndBoat = new Map<string, Map<string, number>>();

  demandByItem.forEach((demands, itemId) => {
    const item = itemById.get(itemId);
    if (!item) return;

    let remaining = Number(item.stock || 0);
    const ordered = [...demands].sort(
      (a, b) => (boatRank.get(a.boatId) ?? 0) - (boatRank.get(b.boatId) ?? 0)
    );

    const perBoat = new Map<string, number>();
    ordered.forEach(({ boatId: bId, qty }) => {
      let shortfall = 0;
      if (remaining >= qty) {
        remaining -= qty;
      } else if (remaining > 0) {
        shortfall = qty - remaining;
        remaining = 0;
      } else {
        shortfall = qty;
      }
      if (shortfall > 0) perBoat.set(bId, shortfall);
    });
    shortfallByItemAndBoat.set(itemId, perBoat);
  });

  return {
    boats,
    boatById,
    sectionsByModel,
    applicableSectionIdsByBoat,
    bomItemsBySection,
    itemById,
    supplierNameById,
    shortfallByItemAndBoat,
  };
}

// Righe mancanti per UN battello, raggruppate per sezione. Se lo
// stesso articolo compare su piu' righe dello stesso battello,
// l'eventuale mancante viene ripartito tra le righe nell'ordine in
// cui compaiono.
function extractBoatSections(
  sim: Awaited<ReturnType<typeof runShortageSimulation>>,
  boatId: string
): MissingArticleSection[] {
  const boat = sim.boatById.get(boatId);
  if (!boat) return [];

  const remainingShortfallByItem = new Map<string, number>();
  sim.shortfallByItemAndBoat.forEach((perBoat, itemId) => {
    const shortfall = perBoat.get(boatId) || 0;
    if (shortfall > 0) remainingShortfallByItem.set(itemId, shortfall);
  });

  const targetSectionIds = sim.applicableSectionIdsByBoat.get(boatId) || [];
  const modelSections = sim.sectionsByModel.get(boat.model_boat) || [];
  const sectionNameById = new Map(modelSections.map((s) => [s.id, s.name]));

  const sections: MissingArticleSection[] = [];

  targetSectionIds.forEach((sId) => {
    const rows = sim.bomItemsBySection.get(sId) || [];
    const sectionRows: MissingArticleSectionRow[] = [];

    rows.forEach((row: any) => {
      if (!row.item_id) return;
      const iId = String(row.item_id);
      const item = sim.itemById.get(iId);
      if (!item) return;

      const requestedQty = Number(row.qty || 0);
      const remainingShortfall = remainingShortfallByItem.get(iId) || 0;
      if (remainingShortfall <= 0) return;

      const lineShortfall = Math.min(requestedQty, remainingShortfall);
      if (lineShortfall <= 0) return;

      remainingShortfallByItem.set(iId, remainingShortfall - lineShortfall);

      sectionRows.push({
        supplierName: sim.supplierNameById.get(String(item.supplier_id || "")) || "",
        itemCode: String(item.supplier_code || item.code || ""),
        description: String(row.description || item.description || ""),
        unit: String(row.unit || "PZ"),
        requestedQty,
        missingQty: lineShortfall,
        stock: Number(item.stock || 0),
      });
    });

    if (sectionRows.length > 0) {
      sections.push({ sectionName: sectionNameById.get(sId) || "", rows: sectionRows });
    }
  });

  return sections;
}

// Distinta base mancante per UN SOLO battello (usata dalla scheda
// battello e dalla creazione di un nuovo battello). Il battello viene
// sempre incluso nella simulazione anche se il suo status non
// risultasse (piu') "active".
export async function computeBoatBomShortages(
  boatId: string
): Promise<{ sections: MissingArticleSection[]; error: string | null }> {
  try {
    const sim = await runShortageSimulation(boatId);
    if (!sim.boatById.has(boatId)) return { sections: [], error: null };
    return { sections: extractBoatSections(sim, boatId), error: null };
  } catch (err: any) {
    return { sections: [], error: err?.message || String(err) };
  }
}

// Riepilogo su TUTTI i battelli attivi in produzione: solo quelli a
// cui manca almeno un articolo, ordinati per priorita' di consegna
// (la stessa usata per l'allocazione).
export async function computeProductionBomShortagesSummary(): Promise<{
  boats: BoatBomShortageSummary[];
  error: string | null;
}> {
  try {
    const sim = await runShortageSimulation();
    const priorityOrder = sortByPriority(sim.boats);

    const result: BoatBomShortageSummary[] = [];

    priorityOrder.forEach((boat) => {
      const sections = extractBoatSections(sim, boat.id);
      const totalMissingLines = sections.reduce((sum, s) => sum + s.rows.length, 0);
      if (totalMissingLines === 0) return;

      const totalMissingQty = sections.reduce(
        (sum, s) => sum + s.rows.reduce((rSum, r) => rSum + r.missingQty, 0),
        0
      );

      result.push({
        boatId: boat.id,
        boatOrderNumber: boat.order_number,
        boatModel: boat.model_boat,
        boatProgressiveNo: boat.progressive_no,
        requestedDeliveryDate: boat.requested_delivery_date,
        sections,
        totalMissingLines,
        totalMissingQty,
      });
    });

    return { boats: result, error: null };
  } catch (err: any) {
    return { boats: [], error: err?.message || String(err) };
  }
}
