import { supabase } from "./supabaseClient";

/*
  ============================================================
  STORICO MOVIMENTI PER ARTICOLO (statistiche acquisti/uso)
  ============================================================

  Non esiste, nel gestionale, un unico registro di tutti i movimenti
  di magazzino: ogni modulo scrive la giacenza a modo suo. Questo
  file mette insieme, da fonti diverse, ogni evento datato che fa
  salire ("acquisto") o scendere ("uso") la giacenza di un articolo,
  cosi' da poter calcolare statistiche mensili/trimestrali/annuali
  per ogni articolo senza aggiungere nessuna tabella nuova.

  FONTI ACQUISTI (la giacenza sale):
  - order_items.received_at/received_qty: arrivi ordine fornitore.
    received_at si valorizza solo quando la riga risulta COMPLETAMENTE
    ricevuta (vedi receive_order_atomic): un arrivo parziale non
    ancora concluso non compare finche' non si completa - e' l'unica
    data disponibile, non esiste un log per-singolo-arrivo.
  - movement_batch_rows (CARICO, PROCESSED): carichi inseriti a mano
    dalla pagina Movimenti, abbinati per "code" (codice scanner).

  FONTI USO (la giacenza scende):
  - movement_batch_rows (SCARICO, PROCESSED): scarichi manuali.
  - teak_kits / upholstery_kits (status = 'out', data out_at): per
    questi due moduli la giacenza scende subito all'assegnazione o
    alla vendita diretta del kit (STEP 71 / STEP 18).
  - windshield_kits (delivered_at non nullo): per il parabrezza la
    giacenza scende solo alla consegna cliente, non all'assegnazione
    (STEP 55) - per questo qui usiamo delivered_at e non out_at.
  - production_boat_gelcoat unito a production_boats.delivered_at:
    il gelcoat e' impegnato (kg) alla creazione del battello ma
    scaricato davvero solo alla consegna cliente (STEP 69), stessa
    logica del parabrezza.

  Niente di tutto questo richiede una nuova tabella o funzione SQL:
  e' tutta lettura di dati gia' esistenti.
*/

export type MovementKind = "acquisto" | "uso";

export type MovementEvent = {
  itemId: string;
  date: string; // YYYY-MM-DD
  qty: number;
  kind: MovementKind;
  source: string;
};

export type ItemMeta = {
  id: string;
  code: string;
  supplierCode: string;
  description: string;
  unit: string;
  supplierId: string;
  supplierName: string;
  stock: number;
};

function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.includes("T") ? value.split("T")[0] : value;
}

/*
  Carica articoli + fornitori (per le descrizioni) e tutti gli eventi
  datati da ogni fonte, in parallelo. Pensata per essere chiamata una
  sola volta per pagina: sia la lista sia il dettaglio lavorano poi
  sugli stessi dati gia' in memoria.
*/
export async function loadMovementData(): Promise<{
  items: ItemMeta[];
  events: MovementEvent[];
  errors: string[];
}> {
  const errors: string[] = [];

  const [
    itemsRes,
    suppliersRes,
    orderItemsRes,
    movementRowsRes,
    teakKitsRes,
    upholsteryKitsRes,
    windshieldKitsRes,
    gelcoatRes,
  ] = await Promise.all([
    supabase
      .from("items")
      .select("id,code,supplier_code,description,unit,supplier_id,stock"),
    supabase.from("suppliers").select("id,name"),
    supabase
      .from("order_items")
      .select("item_id,received_qty,received_at")
      .not("received_at", "is", null),
    supabase
      .from("movement_batch_rows")
      .select("code,qty,movement_date,movement_type")
      .eq("result", "PROCESSED"),
    supabase.from("teak_kits").select("item_id,out_at").eq("status", "out"),
    supabase
      .from("upholstery_kits")
      .select("item_id,out_at")
      .eq("status", "out"),
    supabase
      .from("windshield_kits")
      .select("item_id,delivered_at")
      .not("delivered_at", "is", null),
    supabase
      .from("production_boat_gelcoat")
      .select("gelcoat_item_id,qty_kg,production_boats(delivered_at)"),
  ]);

  if (itemsRes.error) {
    errors.push("Articoli: " + itemsRes.error.message);
  }

  if (suppliersRes.error) {
    errors.push("Fornitori: " + suppliersRes.error.message);
  }

  const supplierNameById = new Map<string, string>();
  (suppliersRes.data || []).forEach((row: any) => {
    supplierNameById.set(String(row.id), String(row.name || ""));
  });

  const items: ItemMeta[] = (itemsRes.data || []).map((row: any) => ({
    id: String(row.id),
    code: String(row.code || ""),
    supplierCode: String(row.supplier_code || ""),
    description: String(row.description || ""),
    unit: String(row.unit || "pz"),
    supplierId: row.supplier_id ? String(row.supplier_id) : "",
    supplierName: row.supplier_id
      ? supplierNameById.get(String(row.supplier_id)) || ""
      : "",
    stock: Number(row.stock || 0),
  }));

  const itemIdByCode = new Map<string, string>();
  items.forEach((item) => {
    if (item.code) itemIdByCode.set(item.code, item.id);
  });

  const events: MovementEvent[] = [];

  // ---------- Acquisti: arrivi ordine ----------
  if (orderItemsRes.error) {
    errors.push("Arrivi ordine: " + orderItemsRes.error.message);
  } else {
    (orderItemsRes.data || []).forEach((row: any) => {
      const itemId = row.item_id ? String(row.item_id) : "";
      const date = toDateOnly(row.received_at);
      const qty = Number(row.received_qty || 0);
      if (!itemId || !date || qty <= 0) return;

      events.push({
        itemId,
        date,
        qty,
        kind: "acquisto",
        source: "ordine",
      });
    });
  }

  // ---------- Movimenti manuali (carico/scarico) ----------
  if (movementRowsRes.error) {
    errors.push("Movimenti manuali: " + movementRowsRes.error.message);
  } else {
    (movementRowsRes.data || []).forEach((row: any) => {
      const code = String(row.code || "").trim();
      const itemId = itemIdByCode.get(code);
      const date = toDateOnly(row.movement_date);
      const qty = Number(row.qty || 0);
      if (!itemId || !date || qty <= 0) return;

      events.push({
        itemId,
        date,
        qty,
        kind: row.movement_type === "CARICO" ? "acquisto" : "uso",
        source: "movimento manuale",
      });
    });
  }

  // ---------- Uso: kit teak venduti/assegnati ----------
  if (teakKitsRes.error) {
    errors.push("Kit teak: " + teakKitsRes.error.message);
  } else {
    (teakKitsRes.data || []).forEach((row: any) => {
      const itemId = row.item_id ? String(row.item_id) : "";
      const date = toDateOnly(row.out_at);
      if (!itemId || !date) return;

      events.push({
        itemId,
        date,
        qty: 1,
        kind: "uso",
        source: "kit teak",
      });
    });
  }

  // ---------- Uso: kit tappezzeria venduti/assegnati ----------
  if (upholsteryKitsRes.error) {
    errors.push("Kit tappezzeria: " + upholsteryKitsRes.error.message);
  } else {
    (upholsteryKitsRes.data || []).forEach((row: any) => {
      const itemId = row.item_id ? String(row.item_id) : "";
      const date = toDateOnly(row.out_at);
      if (!itemId || !date) return;

      events.push({
        itemId,
        date,
        qty: 1,
        kind: "uso",
        source: "kit tappezzeria",
      });
    });
  }

  // ---------- Uso: kit parabrezza, solo alla consegna cliente ----------
  if (windshieldKitsRes.error) {
    errors.push("Kit parabrezza: " + windshieldKitsRes.error.message);
  } else {
    (windshieldKitsRes.data || []).forEach((row: any) => {
      const itemId = row.item_id ? String(row.item_id) : "";
      const date = toDateOnly(row.delivered_at);
      if (!itemId || !date) return;

      events.push({
        itemId,
        date,
        qty: 1,
        kind: "uso",
        source: "parabrezza",
      });
    });
  }

  // ---------- Uso: gelcoat, solo alla consegna cliente ----------
  if (gelcoatRes.error) {
    errors.push("Gelcoat: " + gelcoatRes.error.message);
  } else {
    (gelcoatRes.data || []).forEach((row: any) => {
      const itemId = row.gelcoat_item_id
        ? String(row.gelcoat_item_id)
        : "";
      const boat = row.production_boats as
        | { delivered_at: string | null }
        | { delivered_at: string | null }[]
        | null;
      const deliveredAt = Array.isArray(boat)
        ? boat[0]?.delivered_at
        : boat?.delivered_at;
      const date = toDateOnly(deliveredAt || null);
      const qty = Number(row.qty_kg || 0);
      if (!itemId || !date || qty <= 0) return;

      events.push({
        itemId,
        date,
        qty,
        kind: "uso",
        source: "gelcoat",
      });
    });
  }

  return { items, events, errors };
}

/*
  ============================================================
  AGGREGAZIONE PER PERIODO
  ============================================================
*/

export type PeriodGranularity = "month" | "quarter" | "year";

export type PeriodBucket = {
  key: string; // ordinabile, es. "2026-03", "2026-Q1", "2026"
  label: string; // es. "Marzo 2026", "Gen-Mar 2026", "2026"
  acquisti: number;
  uso: number;
};

const MONTH_NAMES_IT = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

const MONTH_SHORT_IT = [
  "Gen",
  "Feb",
  "Mar",
  "Apr",
  "Mag",
  "Giu",
  "Lug",
  "Ago",
  "Set",
  "Ott",
  "Nov",
  "Dic",
];

function periodKeyAndLabel(
  date: string,
  granularity: PeriodGranularity
): { key: string; label: string } {
  const [yearStr, monthStr] = date.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;

  if (granularity === "year") {
    return { key: String(year), label: String(year) };
  }

  if (granularity === "quarter") {
    const quarter = Math.floor(monthIndex / 3) + 1;
    const startMonth = (quarter - 1) * 3;
    const label = `${MONTH_SHORT_IT[startMonth]}-${MONTH_SHORT_IT[startMonth + 2]} ${year}`;
    return { key: `${year}-Q${quarter}`, label };
  }

  return {
    key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    label: `${MONTH_NAMES_IT[monthIndex]} ${year}`,
  };
}

/*
  Raggruppa gli eventi di UN articolo per periodo, includendo i
  periodi senza movimenti (valore 0) tra il primo e l'ultimo evento,
  cosi' le medie riflettono anche i mesi "vuoti".
*/
export function aggregateItemByPeriod(
  events: MovementEvent[],
  itemId: string,
  granularity: PeriodGranularity
): PeriodBucket[] {
  const itemEvents = events.filter((event) => event.itemId === itemId);
  if (itemEvents.length === 0) return [];

  const byKey = new Map<string, PeriodBucket>();

  itemEvents.forEach((event) => {
    const { key, label } = periodKeyAndLabel(event.date, granularity);
    const bucket = byKey.get(key) || { key, label, acquisti: 0, uso: 0 };
    if (event.kind === "acquisto") bucket.acquisti += event.qty;
    else bucket.uso += event.qty;
    byKey.set(key, bucket);
  });

  // Riempie i periodi vuoti nel mezzo (non prima del primo ne' dopo
  // l'ultimo evento), cosi' la media sul periodo e' corretta.
  if (granularity === "month" || granularity === "quarter") {
    const sortedDates = itemEvents.map((e) => e.date).sort();
    const first = sortedDates[0];
    const last = sortedDates[sortedDates.length - 1];

    const step = granularity === "month" ? 1 : 3;
    const [fy, fm] = first.split("-").map(Number);
    const [ly, lm] = last.split("-").map(Number);

    let cursorYear = fy;
    let cursorMonth = fm - 1; // 0-based

    const lastMonthIndex = ly * 12 + (lm - 1);

    while (cursorYear * 12 + cursorMonth <= lastMonthIndex) {
      const monthDate = `${cursorYear}-${String(cursorMonth + 1).padStart(2, "0")}-01`;
      const { key, label } = periodKeyAndLabel(monthDate, granularity);
      if (!byKey.has(key)) {
        byKey.set(key, { key, label, acquisti: 0, uso: 0 });
      }
      cursorMonth += step;
      while (cursorMonth >= 12) {
        cursorMonth -= 12;
        cursorYear += 1;
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.key.localeCompare(b.key)
  );
}

export type ItemSummary = {
  itemId: string;
  totalAcquisti: number;
  totalUso: number;
  mediaMensileAcquisti: number;
  mediaMensileUso: number;
  firstDate: string | null;
  lastDate: string | null;
};

/*
  Riepilogo per UN articolo: totali e media mensile calcolata sui
  mesi di calendario dal primo all'ultimo evento di quell'articolo
  (compresi i mesi senza movimenti), non sugli ultimi 12 mesi fissi -
  cosi' un articolo con poco storico non viene penalizzato.
*/
export function summarizeItem(
  events: MovementEvent[],
  itemId: string
): ItemSummary {
  const itemEvents = events.filter((event) => event.itemId === itemId);

  if (itemEvents.length === 0) {
    return {
      itemId,
      totalAcquisti: 0,
      totalUso: 0,
      mediaMensileAcquisti: 0,
      mediaMensileUso: 0,
      firstDate: null,
      lastDate: null,
    };
  }

  const totalAcquisti = itemEvents
    .filter((e) => e.kind === "acquisto")
    .reduce((sum, e) => sum + e.qty, 0);

  const totalUso = itemEvents
    .filter((e) => e.kind === "uso")
    .reduce((sum, e) => sum + e.qty, 0);

  const sortedDates = itemEvents.map((e) => e.date).sort();
  const firstDate = sortedDates[0];
  const lastDate = sortedDates[sortedDates.length - 1];

  const [fy, fm] = firstDate.split("-").map(Number);
  const [ly, lm] = lastDate.split("-").map(Number);
  const monthSpan = (ly * 12 + (lm - 1)) - (fy * 12 + (fm - 1)) + 1;

  return {
    itemId,
    totalAcquisti,
    totalUso,
    mediaMensileAcquisti: totalAcquisti / monthSpan,
    mediaMensileUso: totalUso / monthSpan,
    firstDate,
    lastDate,
  };
}
