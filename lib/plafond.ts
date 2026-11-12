import { supabase } from "./supabaseClient";

/*
  PLAFOND / DICHIARAZIONE D'INTENTO (STEP 61)

  Calcolo condiviso tra la pagina fornitore (per mostrare lo stato)
  e la creazione di un nuovo ordine (per avvisare prima di sforare).

  "Plafond disponibile ad oggi" per un fornitore = somma degli
  importi delle dichiarazioni ATTIVE oggi (valid_from <= oggi <=
  valid_to, o senza scadenza) meno il totale ORDINATO (qty * prezzo
  di riga, ordini non annullati) dalla prima valid_from tra quelle
  attive fino ad oggi.

  E' una stima operativa pensata per avvisare PRIMA di creare un
  ordine che sforerebbe: il dato fiscalmente ufficiale resta quello
  delle fatture, da verificare col commercialista.
*/

export type PlafondStatus = {
  hasActiveDeclaration: boolean;
  ceiling: number;
  used: number;
  available: number;
  periodStart: string | null;
  periodEnd: string | null; // null = senza scadenza (almeno una dichiarazione attiva è aperta)
};

const EMPTY_STATUS: PlafondStatus = {
  hasActiveDeclaration: false,
  ceiling: 0,
  used: 0,
  available: 0,
  periodStart: null,
  periodEnd: null,
};

export async function computePlafondStatus(
  supplierId: string
): Promise<PlafondStatus> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: declarations, error: declarationsError } = await supabase
    .from("supplier_intent_declarations")
    .select("valid_from,valid_to,plafond_amount")
    .eq("supplier_id", supplierId);

  if (declarationsError) {
    return EMPTY_STATUS;
  }

  const active = (
    (declarations || []) as {
      valid_from: string;
      valid_to: string | null;
      plafond_amount: number | string;
    }[]
  ).filter((row) => {
    if (row.valid_from > today) return false;
    if (row.valid_to && row.valid_to < today) return false;
    return true;
  });

  if (active.length === 0) {
    return EMPTY_STATUS;
  }

  const ceiling = active.reduce(
    (sum, row) => sum + Number(row.plafond_amount || 0),
    0
  );

  const periodStart = active.reduce<string | null>(
    (min, row) => (!min || row.valid_from < min ? row.valid_from : min),
    null
  );

  const hasOpenEnded = active.some((row) => !row.valid_to);

  const periodEnd = hasOpenEnded
    ? null
    : active.reduce<string | null>((max, row) => {
        if (!row.valid_to) return max;
        return !max || row.valid_to > max ? row.valid_to : max;
      }, null);

  const { data: periodOrders, error: ordersError } = await supabase
    .from("orders")
    .select("id")
    .eq("supplier_id", supplierId)
    .neq("status", "cancelled")
    .gte("order_date", periodStart as string)
    .lte("order_date", today);

  if (ordersError) {
    return {
      hasActiveDeclaration: true,
      ceiling,
      used: 0,
      available: ceiling,
      periodStart,
      periodEnd,
    };
  }

  const orderIds = (periodOrders || []).map((row) => String(row.id));

  let used = 0;

  if (orderIds.length > 0) {
    const { data: lineItems, error: itemsError } = await supabase
      .from("order_items")
      .select("qty,unit_price")
      .in("order_id", orderIds);

    if (!itemsError) {
      used = (
        (lineItems || []) as { qty: number | string; unit_price: number | string }[]
      ).reduce(
        (sum, row) => sum + Number(row.qty || 0) * Number(row.unit_price || 0),
        0
      );
    }
  }

  return {
    hasActiveDeclaration: true,
    ceiling,
    used,
    available: ceiling - used,
    periodStart,
    periodEnd,
  };
}
export type SupplierPlafondStatus = {
  supplier_id: string;
  supplier_name: string;
  status: PlafondStatus;
};

type PlafondSupplierRow = {
  id: string;
  name: string;
};

/*
  Stato plafond di TUTTI i fornitori che richiedono la dichiarazione
  d'intento, per la pagina Contabilità.
*/
export async function loadAllPlafondStatuses(): Promise<
  SupplierPlafondStatus[]
> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id,name")
    .eq("requires_intent_declaration", true)
    .order("name", { ascending: true });

  if (error || !data) {
    return [];
  }

  const suppliers = data as PlafondSupplierRow[];

  const results = await Promise.all(
    suppliers.map(async (supplier) => ({
      supplier_id: String(supplier.id),
      supplier_name: String(supplier.name || ""),
      status: await computePlafondStatus(String(supplier.id)),
    }))
  );

  return results;
}
