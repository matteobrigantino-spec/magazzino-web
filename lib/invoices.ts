import { supabase } from "./supabaseClient";

/*
  FATTURE FORNITORE (STEP 61 + estensione multi-ordine)

  Logica condivisa tra la pagina fornitore e la pagina ordine: una
  fattura è sempre collegata al FORNITORE (mai a un singolo
  ordine), perché una fattura riepilogativa può coprire DDT di piu'
  ordini diversi dello stesso fornitore (es. ordine 1936 insieme a
  1982 e 1983). Entrambe le pagine mostrano quindi TUTTI i DDT del
  fornitore ancora da fatturare, non solo quelli dell'ordine aperto.
*/

export type InvoiceShipmentInfo = {
  id: string;
  ddt_number: string;
  order_id: string;
  order_number: string | null;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  archive_code: string | null;
  amount: number | null;
  note: string | null;
  shipments: InvoiceShipmentInfo[];
};

export type UninvoicedShipment = {
  id: string;
  ddt_number: string;
  ddt_date: string;
  order_id: string;
  order_number: string | null;
};

export type SupplierInvoiceData = {
  invoices: Invoice[];
  uninvoicedShipments: UninvoicedShipment[];
};

type InvoiceOrderRow = {
  id: string;
  order_number: number | string | null;
};

type InvoiceShipmentRow = {
  id: string;
  order_id: string;
  ddt_number: string | null;
  ddt_date: string;
};

type InvoiceLinkRow = {
  invoice_id: string;
  shipment_id: string;
};

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_date: string;
  archive_code: string | null;
  amount: number | string | null;
  note: string | null;
};

export async function loadSupplierInvoiceData(
  supplierId: string
): Promise<SupplierInvoiceData> {
  const { data: orderRows } = await supabase
    .from("orders")
    .select("id,order_number")
    .eq("supplier_id", supplierId);

  const orderNumberById = new Map<string, string>();

  ((orderRows || []) as InvoiceOrderRow[]).forEach((row) => {
    orderNumberById.set(
      String(row.id),
      row.order_number != null ? String(row.order_number) : ""
    );
  });

  const orderIds = Array.from(orderNumberById.keys());

  let shipmentRows: InvoiceShipmentRow[] = [];

  if (orderIds.length > 0) {
    const { data } = await supabase
      .from("order_shipments")
      .select("id,order_id,ddt_number,ddt_date")
      .in("order_id", orderIds)
      .order("ddt_date", { ascending: false });

    shipmentRows = (data || []) as InvoiceShipmentRow[];
  }

  const shipmentIds = shipmentRows.map((row) => String(row.id));

  let linkRows: InvoiceLinkRow[] = [];

  if (shipmentIds.length > 0) {
    const { data } = await supabase
      .from("order_invoice_shipments")
      .select("invoice_id,shipment_id")
      .in("shipment_id", shipmentIds);

    linkRows = (data || []) as InvoiceLinkRow[];
  }

  const invoicedShipmentIds = new Set(
    linkRows.map((row) => String(row.shipment_id))
  );

  const shipmentInfoById = new Map<string, InvoiceShipmentInfo>();

  shipmentRows.forEach((row) => {
    shipmentInfoById.set(String(row.id), {
      id: String(row.id),
      ddt_number: String(row.ddt_number || ""),
      order_id: String(row.order_id),
      order_number: orderNumberById.get(String(row.order_id)) || null,
    });
  });

  const uninvoicedShipments: UninvoicedShipment[] = shipmentRows
    .filter((row) => !invoicedShipmentIds.has(String(row.id)))
    .map((row) => ({
      id: String(row.id),
      ddt_number: String(row.ddt_number || ""),
      ddt_date: String(row.ddt_date || ""),
      order_id: String(row.order_id),
      order_number: orderNumberById.get(String(row.order_id)) || null,
    }));

  const { data: invoiceRows, error: invoiceError } = await supabase
    .from("order_invoices")
    .select("id,invoice_number,invoice_date,archive_code,amount,note")
    .eq("supplier_id", supplierId)
    .order("invoice_date", { ascending: false });

  let invoices: Invoice[] = [];

  if (!invoiceError) {
    const linksByInvoice = new Map<string, string[]>();

    linkRows.forEach((row) => {
      const list = linksByInvoice.get(String(row.invoice_id)) || [];
      list.push(String(row.shipment_id));
      linksByInvoice.set(String(row.invoice_id), list);
    });

    invoices = ((invoiceRows || []) as InvoiceRow[]).map((row) => ({
      id: String(row.id),
      invoice_number: String(row.invoice_number || ""),
      invoice_date: String(row.invoice_date || ""),
      archive_code: row.archive_code ? String(row.archive_code) : null,
      amount: row.amount !== null ? Number(row.amount) : null,
      note: row.note ? String(row.note) : null,
      shipments: (linksByInvoice.get(String(row.id)) || [])
        .map((shipmentId) => shipmentInfoById.get(shipmentId))
        .filter((info): info is InvoiceShipmentInfo => Boolean(info)),
    }));
  }

  return { invoices, uninvoicedShipments };
}

export type InvoiceDraftInput = {
  invoice_number: string;
  invoice_date: string;
  archive_code: string | null;
  amount: number | null;
  note: string | null;
};

export async function createInvoice(
  supplierId: string,
  draft: InvoiceDraftInput,
  shipmentIds: string[]
): Promise<{ error: string | null }> {
  const { data: inserted, error } = await supabase
    .from("order_invoices")
    .insert({
      supplier_id: supplierId,
      invoice_number: draft.invoice_number,
      invoice_date: draft.invoice_date,
      archive_code: draft.archive_code,
      amount: draft.amount,
      note: draft.note,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: error?.message || "fattura non creata" };
  }

  if (shipmentIds.length > 0) {
    const { error: linkError } = await supabase
      .from("order_invoice_shipments")
      .insert(
        shipmentIds.map((shipmentId) => ({
          invoice_id: inserted.id,
          shipment_id: shipmentId,
        }))
      );

    if (linkError) {
      return {
        error:
          "Fattura creata, ma errore nel collegare i DDT: " +
          linkError.message,
      };
    }
  }

  return { error: null };
}

export async function deleteInvoiceById(
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("order_invoices")
    .delete()
    .eq("id", id);

  return { error: error ? error.message : null };
}

export type SupplierOrderOption = {
  order_id: string;
  order_number: string | null;
};

type SupplierOrderOptionRow = {
  id: string;
  order_number: number | string | null;
};

/*
  Elenco ordini (non annullati) di un fornitore, per il menu a
  tendina "scegli ordine" in Registra fattura: a differenza di
  uninvoicedShipments, qui ci sono TUTTI gli ordini, anche quelli
  senza ancora nessun DDT registrato (si apriranno comunque, solo
  senza nulla da spuntare finché non si registra il DDT).
*/
export async function loadSupplierOrderOptions(
  supplierId: string
): Promise<SupplierOrderOption[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("id,order_number")
    .eq("supplier_id", supplierId)
    .neq("status", "cancelled")
    .order("order_number", { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as SupplierOrderOptionRow[]).map((row) => ({
    order_id: String(row.id),
    order_number: row.order_number != null ? String(row.order_number) : null,
  }));
}

/*
  Elenco di sola lettura degli articoli di un ordine, da mostrare
  come riferimento sotto i DDT di quell'ordine quando si sceglie
  cosa mettere in una fattura (niente prezzi: pagine diverse hanno
  permessi diversi, qui serve solo a confermare cosa c'è dentro).
*/
export type OrderItemReference = {
  id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  qty: number;
  received_qty: number;
};

type OrderItemReferenceRow = {
  id: string;
  item_id: string;
  qty: number | string;
  received_qty: number | string;
};

type ArticleReferenceRow = {
  id: string;
  code: string | null;
  supplier_code: string | null;
  description: string | null;
};

export async function loadOrderItemsReference(
  orderId: string
): Promise<OrderItemReference[]> {
  const { data, error } = await supabase
    .from("order_items")
    .select("id,item_id,qty,received_qty")
    .eq("order_id", orderId);

  if (error || !data || data.length === 0) {
    return [];
  }

  const orderItemRows = data as OrderItemReferenceRow[];
  const itemIds = orderItemRows.map((row) => String(row.item_id));

  const { data: articleRows, error: articlesError } = await supabase
    .from("items")
    .select("id,code,supplier_code,description")
    .in("id", itemIds);

  const articleById = new Map<
    string,
    { code: string; supplier_code: string | null; description: string }
  >();

  if (!articlesError) {
    ((articleRows || []) as ArticleReferenceRow[]).forEach((row) => {
      articleById.set(String(row.id), {
        code: row.code ? String(row.code) : "-",
        supplier_code: row.supplier_code ? String(row.supplier_code) : null,
        description: row.description
          ? String(row.description)
          : "Articolo non trovato",
      });
    });
  }

  return orderItemRows.map((row) => {
    const article = articleById.get(String(row.item_id));

    return {
      id: String(row.id),
      code: article?.code || "-",
      supplier_code: article?.supplier_code || null,
      description: article?.description || "Articolo non trovato",
      qty: Number(row.qty || 0),
      received_qty: Number(row.received_qty || 0),
    };
  });
}
