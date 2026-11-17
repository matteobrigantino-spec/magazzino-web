import { supabase } from "./supabaseClient";

/*
  FATTURE FORNITORE (STEP 61 + STEP 63)

  Una fattura è sempre collegata al FORNITORE (mai a un singolo
  ordine), perché una fattura riepilogativa può coprire articoli di
  più ordini diversi dello stesso fornitore (es. ordine 1936 insieme
  a 1982 e 1983). Il collegamento è diretto con le righe ordine
  (order_items): si sceglie un ordine e si spunta articolo per
  articolo cosa c'è nella fattura, indipendentemente dal DDT. Un
  articolo (riga ordine) può finire in una sola fattura.

  Il DDT (order_shipments, sezione "DDT" sulla pagina ordine) resta
  solo per tracciare l'arrivo fisico della merce: non c'entra più
  con la fatturazione.
*/

export type InvoiceLineItem = {
  id: string; // id della riga ordine (order_items.id)
  order_id: string;
  order_number: string | null;
  code: string;
  supplier_code: string | null;
  description: string;
  qty: number;
  received_qty: number;
  qty_invoiced: number;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  archive_code: string | null;
  amount: number | null;
  note: string | null;
  items: InvoiceLineItem[];
};

export type SupplierInvoiceData = {
  invoices: Invoice[];
};

type InvoiceOrderRow = {
  id: string;
  order_number: number | string | null;
};

type InvoiceOrderItemRow = {
  id: string;
  order_id: string;
  item_id: string;
  qty: number | string;
  received_qty: number | string;
};

type InvoiceArticleRow = {
  id: string;
  code: string | null;
  supplier_code: string | null;
  description: string | null;
};

type InvoiceItemLinkRow = {
  invoice_id: string;
  order_item_id: string;
  qty_invoiced: number | string;
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

  let orderItemRows: InvoiceOrderItemRow[] = [];

  if (orderIds.length > 0) {
    const { data } = await supabase
      .from("order_items")
      .select("id,order_id,item_id,qty,received_qty")
      .in("order_id", orderIds);

    orderItemRows = (data || []) as InvoiceOrderItemRow[];
  }

  const itemIds = orderItemRows.map((row) => String(row.item_id));

  let articleRows: InvoiceArticleRow[] = [];

  if (itemIds.length > 0) {
    const { data } = await supabase
      .from("items")
      .select("id,code,supplier_code,description")
      .in("id", itemIds);

    articleRows = (data || []) as InvoiceArticleRow[];
  }

  const articleById = new Map<string, InvoiceArticleRow>();

  articleRows.forEach((row) => {
    articleById.set(String(row.id), row);
  });

  const orderItemInfoById = new Map<
    string,
    Omit<InvoiceLineItem, "qty_invoiced">
  >();

  orderItemRows.forEach((row) => {
    const article = articleById.get(String(row.item_id));

    orderItemInfoById.set(String(row.id), {
      id: String(row.id),
      order_id: String(row.order_id),
      order_number: orderNumberById.get(String(row.order_id)) || null,
      code: article?.code ? String(article.code) : "-",
      supplier_code: article?.supplier_code
        ? String(article.supplier_code)
        : null,
      description: article?.description
        ? String(article.description)
        : "Articolo non trovato",
      qty: Number(row.qty || 0),
      received_qty: Number(row.received_qty || 0),
    });
  });

  const { data: invoiceRows, error: invoiceError } = await supabase
    .from("order_invoices")
    .select("id,invoice_number,invoice_date,archive_code,amount,note")
    .eq("supplier_id", supplierId)
    .order("invoice_date", { ascending: false });

  if (invoiceError || !invoiceRows || invoiceRows.length === 0) {
    return { invoices: [] };
  }

  const invoiceIds = (invoiceRows as InvoiceRow[]).map((row) =>
    String(row.id)
  );

  const { data: linkRows } = await supabase
    .from("order_invoice_items")
    .select("invoice_id,order_item_id,qty_invoiced")
    .in("invoice_id", invoiceIds);

  const itemsByInvoice = new Map<
    string,
    { order_item_id: string; qty_invoiced: number }[]
  >();

  ((linkRows || []) as InvoiceItemLinkRow[]).forEach((row) => {
    const list = itemsByInvoice.get(String(row.invoice_id)) || [];
    list.push({
      order_item_id: String(row.order_item_id),
      qty_invoiced: Number(row.qty_invoiced || 0),
    });
    itemsByInvoice.set(String(row.invoice_id), list);
  });

  const invoices: Invoice[] = (invoiceRows as InvoiceRow[]).map((row) => ({
    id: String(row.id),
    invoice_number: String(row.invoice_number || ""),
    invoice_date: String(row.invoice_date || ""),
    archive_code: row.archive_code ? String(row.archive_code) : null,
    amount: row.amount !== null ? Number(row.amount) : null,
    note: row.note ? String(row.note) : null,
    items: (itemsByInvoice.get(String(row.id)) || [])
      .map((link) => {
        const info = orderItemInfoById.get(link.order_item_id);
        if (!info) {
          return null;
        }
        return { ...info, qty_invoiced: link.qty_invoiced };
      })
      .filter((info): info is InvoiceLineItem => Boolean(info)),
  }));

  return { invoices };
}

export type AllInvoice = Invoice & {
  supplier_id: string;
  supplier_name: string;
};

type InvoiceSupplierRow = {
  id: string;
  name: string;
};

type AllInvoiceRow = {
  id: string;
  supplier_id: string;
  invoice_number: string | null;
  invoice_date: string;
  archive_code: string | null;
  amount: number | string | null;
  note: string | null;
};

/*
  Tutte le fatture di TUTTI i fornitori, per la pagina Contabilità.
  Stessa logica di loadSupplierInvoiceData ma senza filtrare per
  fornitore, con in più il nome del fornitore su ogni fattura.
*/
export async function loadAllInvoices(): Promise<AllInvoice[]> {
  const { data: supplierRows } = await supabase
    .from("suppliers")
    .select("id,name");

  const supplierNameById = new Map<string, string>();

  ((supplierRows || []) as InvoiceSupplierRow[]).forEach((row) => {
    supplierNameById.set(String(row.id), String(row.name || ""));
  });

  const { data: orderRows } = await supabase
    .from("orders")
    .select("id,order_number");

  const orderNumberById = new Map<string, string>();

  ((orderRows || []) as InvoiceOrderRow[]).forEach((row) => {
    orderNumberById.set(
      String(row.id),
      row.order_number != null ? String(row.order_number) : ""
    );
  });

  const { data: orderItemRows } = await supabase
    .from("order_items")
    .select("id,order_id,item_id,qty,received_qty");

  const { data: articleRows } = await supabase
    .from("items")
    .select("id,code,supplier_code,description");

  const articleById = new Map<string, InvoiceArticleRow>();

  ((articleRows || []) as InvoiceArticleRow[]).forEach((row) => {
    articleById.set(String(row.id), row);
  });

  const orderItemInfoById = new Map<
    string,
    Omit<InvoiceLineItem, "qty_invoiced">
  >();

  ((orderItemRows || []) as InvoiceOrderItemRow[]).forEach((row) => {
    const article = articleById.get(String(row.item_id));

    orderItemInfoById.set(String(row.id), {
      id: String(row.id),
      order_id: String(row.order_id),
      order_number: orderNumberById.get(String(row.order_id)) || null,
      code: article?.code ? String(article.code) : "-",
      supplier_code: article?.supplier_code
        ? String(article.supplier_code)
        : null,
      description: article?.description
        ? String(article.description)
        : "Articolo non trovato",
      qty: Number(row.qty || 0),
      received_qty: Number(row.received_qty || 0),
    });
  });

  const { data: invoiceRows, error: invoiceError } = await supabase
    .from("order_invoices")
    .select(
      "id,supplier_id,invoice_number,invoice_date,archive_code,amount,note"
    )
    .order("invoice_date", { ascending: false });

  if (invoiceError || !invoiceRows || invoiceRows.length === 0) {
    return [];
  }

  const invoiceIds = (invoiceRows as AllInvoiceRow[]).map((row) =>
    String(row.id)
  );

  const { data: linkRows } = await supabase
    .from("order_invoice_items")
    .select("invoice_id,order_item_id,qty_invoiced")
    .in("invoice_id", invoiceIds);

  const itemsByInvoice = new Map<
    string,
    { order_item_id: string; qty_invoiced: number }[]
  >();

  ((linkRows || []) as InvoiceItemLinkRow[]).forEach((row) => {
    const list = itemsByInvoice.get(String(row.invoice_id)) || [];
    list.push({
      order_item_id: String(row.order_item_id),
      qty_invoiced: Number(row.qty_invoiced || 0),
    });
    itemsByInvoice.set(String(row.invoice_id), list);
  });

  return (invoiceRows as AllInvoiceRow[]).map((row) => ({
    id: String(row.id),
    supplier_id: String(row.supplier_id),
    supplier_name: supplierNameById.get(String(row.supplier_id)) || "",
    invoice_number: String(row.invoice_number || ""),
    invoice_date: String(row.invoice_date || ""),
    archive_code: row.archive_code ? String(row.archive_code) : null,
    amount: row.amount !== null ? Number(row.amount) : null,
    note: row.note ? String(row.note) : null,
    items: (itemsByInvoice.get(String(row.id)) || [])
      .map((link) => {
        const info = orderItemInfoById.get(link.order_item_id);
        if (!info) {
          return null;
        }
        return { ...info, qty_invoiced: link.qty_invoiced };
      })
      .filter((info): info is InvoiceLineItem => Boolean(info)),
  }));
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
  itemQtyById: Record<string, number>
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

  const rows = Object.entries(itemQtyById)
    .filter(([, qty]) => qty > 0)
    .map(([orderItemId, qty]) => ({
      invoice_id: inserted.id,
      order_item_id: orderItemId,
      qty_invoiced: qty,
    }));

  if (rows.length > 0) {
    const { error: linkError } = await supabase
      .from("order_invoice_items")
      .insert(rows);

    if (linkError) {
      return {
        error:
          "Fattura creata, ma errore nel collegare gli articoli: " +
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
  tendina "scegli ordine" in Registra fattura: compaiono TUTTI gli
  ordini, anche quelli senza nessun articolo ancora fatturato.
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
  Articoli (righe ordine) di un ordine, da indicare con una quantità
  quando si registra una fattura: ogni riga dice anche quanto è già
  stato fatturato finora (qty_invoiced), su tutte le fatture insieme,
  cosi' si può ancora fatturare la parte rimasta anche se una parte
  e' gia' in un'altra fattura (fatturazione parziale, come il DDT).
*/
export type OrderItemReference = {
  id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  qty: number;
  received_qty: number;
  qty_invoiced: number;
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
  const orderItemIds = orderItemRows.map((row) => String(row.id));
  const itemIds = orderItemRows.map((row) => String(row.item_id));

  const [
    { data: articleRows, error: articlesError },
    { data: linkRows },
  ] = await Promise.all([
    supabase
      .from("items")
      .select("id,code,supplier_code,description")
      .in("id", itemIds),
    supabase
      .from("order_invoice_items")
      .select("order_item_id,qty_invoiced")
      .in("order_item_id", orderItemIds),
  ]);

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

  const invoicedQtyByOrderItemId = new Map<string, number>();

  ((linkRows || []) as { order_item_id: string; qty_invoiced: number | string }[]).forEach(
    (row) => {
      const key = String(row.order_item_id);
      const prev = invoicedQtyByOrderItemId.get(key) || 0;
      invoicedQtyByOrderItemId.set(key, prev + Number(row.qty_invoiced || 0));
    }
  );

  return orderItemRows.map((row) => {
    const article = articleById.get(String(row.item_id));

    return {
      id: String(row.id),
      code: article?.code || "-",
      supplier_code: article?.supplier_code || null,
      description: article?.description || "Articolo non trovato",
      qty: Number(row.qty || 0),
      received_qty: Number(row.received_qty || 0),
      qty_invoiced: invoicedQtyByOrderItemId.get(String(row.id)) || 0,
    };
  });
}
