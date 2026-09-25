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

type ActiveBoat = {
  id: string;
  model_boat: string;
  requested_delivery_date: string | null;
  created_at: string;
};

// Ordina i battelli per priorita' di allocazione: consegna richiesta
// piu' vicina prima; chi non ha ancora una data e' meno urgente e va
// in fondo; a parita' di data vince chi e' stato inserito prima.
function sortByPriority(boats: ActiveBoat[]) {
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

export async function computeBoatBomShortages(
  boatId: string
): Promise<{ sections: MissingArticleSection[]; error: string | null }> {
  try {
    // 1. Tutti i battelli attivi: sono loro a farsi concorrenza sulla
    //    stessa giacenza. Il battello richiesto viene sempre incluso
    //    (anche se nel frattempo non risultasse piu' "active"), cosi'
    //    il PDF si puo' rigenerare anche dalla sua scheda in qualsiasi
    //    momento.
    const { data: boatsData, error: boatsError } = await supabase
      .from("production_boats")
      .select("id,model_boat,requested_delivery_date,created_at,status")
      .or(`status.eq.active,id.eq.${boatId}`);

    if (boatsError) throw boatsError;

    const activeBoats: ActiveBoat[] = (boatsData || []).map((row: any) => ({
      id: String(row.id),
      model_boat: String(row.model_boat || ""),
      requested_delivery_date: row.requested_delivery_date || null,
      created_at: String(row.created_at || ""),
    }));

    const targetBoat = activeBoats.find((b) => b.id === String(boatId));
    if (!targetBoat) {
      // Battello non trovato: nessun controllo da fare.
      return { sections: [], error: null };
    }

    const priorityOrder = sortByPriority(activeBoats);
    const boatRank = new Map(priorityOrder.map((b, i) => [b.id, i]));

    // 2. Sezioni applicabili per ciascun battello attivo: standard del
    //    modello + optional scelte per quel singolo battello.
    const models = Array.from(new Set(activeBoats.map((b) => b.model_boat).filter(Boolean)));

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

    const boatIds = activeBoats.map((b) => b.id);
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
    activeBoats.forEach((b) => {
      const modelSections = sectionsByModel.get(b.model_boat) || [];
      const optionalIds = optionalSectionIdsByBoat.get(b.id) || new Set<string>();
      const ids = modelSections
        .filter((s) => s.kind === "standard" || optionalIds.has(s.id))
        .map((s) => s.id);
      applicableSectionIdsByBoat.set(b.id, ids);
    });

    const allSectionIds = Array.from(
      new Set(Array.from(applicableSectionIdsByBoat.values()).flat())
    );

    if (allSectionIds.length === 0) {
      return { sections: [], error: null };
    }

    // 3. Righe della distinta base per tutte le sezioni coinvolte.
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

    // 4. Domanda per articolo: per ciascun battello attivo, quanti
    //    pezzi di ciascun articolo servono in totale (sommando
    //    eventuali righe ripetute tra le sue sezioni).
    type Demand = { boatId: string; qty: number };
    const demandByItem = new Map<string, Demand[]>();

    activeBoats.forEach((b) => {
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

    // 5. Simulazione: per ciascun articolo, la giacenza disponibile
    //    viene assegnata ai battelli in ordine di priorita'. Quello
    //    che resta scoperto e' "mancante" per quel battello - senza
    //    mai toccare la giacenza reale (items.stock non viene letto
    //    che qui, e mai scritto).
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

    // 6. Righe mancanti per IL battello richiesto, raggruppate per
    //    sezione. Se lo stesso articolo compare su piu' righe di
    //    questo battello, l'eventuale mancante viene ripartito tra le
    //    righe nell'ordine in cui compaiono.
    const remainingShortfallByItem = new Map<string, number>();
    shortfallByItemAndBoat.forEach((perBoat, itemId) => {
      const shortfall = perBoat.get(String(boatId)) || 0;
      if (shortfall > 0) remainingShortfallByItem.set(itemId, shortfall);
    });

    const targetSectionIds = applicableSectionIdsByBoat.get(String(boatId)) || [];
    const modelSections = sectionsByModel.get(targetBoat.model_boat) || [];
    const sectionNameById = new Map(modelSections.map((s) => [s.id, s.name]));

    const sections: MissingArticleSection[] = [];

    targetSectionIds.forEach((sId) => {
      const rows = bomItemsBySection.get(sId) || [];
      const sectionRows: MissingArticleSectionRow[] = [];

      rows.forEach((row: any) => {
        if (!row.item_id) return;
        const iId = String(row.item_id);
        const item = itemById.get(iId);
        if (!item) return;

        const requestedQty = Number(row.qty || 0);
        const remainingShortfall = remainingShortfallByItem.get(iId) || 0;
        if (remainingShortfall <= 0) return;

        const lineShortfall = Math.min(requestedQty, remainingShortfall);
        if (lineShortfall <= 0) return;

        remainingShortfallByItem.set(iId, remainingShortfall - lineShortfall);

        sectionRows.push({
          supplierName: supplierNameById.get(String(item.supplier_id || "")) || "",
          itemCode: String(item.supplier_code || item.code || ""),
          description: String(row.description || item.description || ""),
          unit: String(row.unit || "PZ"),
          requestedQty,
          missingQty: lineShortfall,
          stock: Number(item.stock || 0),
        });
      });

      if (sectionRows.length > 0) {
        sections.push({
          sectionName: sectionNameById.get(sId) || "",
          rows: sectionRows,
        });
      }
    });

    return { sections, error: null };
  } catch (err: any) {
    return { sections: [], error: err?.message || String(err) };
  }
}
