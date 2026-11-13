import { supabase } from "./supabaseClient";

/*
  DDT FORNITORE (STEP 61 + STEP 64 + STEP 65)

  Un DDT è collegato al FORNITORE (non a un singolo ordine), perché
  un DDT reale può contenere articoli di più ordini diversi dello
  stesso fornitore arrivati insieme. Si sceglie uno o più ordini e
  si spunta articolo per articolo, con la quantità arrivata. Un
  articolo può comparire in più DDT diversi nel tempo (consegne
  parziali), quindi non c'è nessun vincolo di unicità.

  Il DDT resta un registro documentale della consegna fisica: non
  tocca received_qty dell'ordine (gestito da "Ricezione merce") e
  non è lo stesso collegamento delle fatture (gestite a livello di
  articolo in order_invoice_items) — ma nel modulo fattura si può
  scegliere un DDT per spuntare automaticamente i suoi articoli.
*/

export type ShipmentLineItem = {
  id: string; // id della riga ordine (order_items.id)
  order_id: string;
  order_number: string | null;
  code: string;
  supplier_code: string | null;
  description: string;
  qty_arrived: number;
};

export type Shipment = {
  id: string;
  ddt_number: string;
  ddt_date: string;
  archive_code: string | null;
  note: string | null;
  scan_pdf_url: string | null;
  scan_pdf_path: string | null;
  items: ShipmentLineItem[];
};

export type SupplierShipmentData = {
  shipments: Shipment[];
};

type ShipmentOrderRow = {
  id: string;
  order_number: number | string | null;
};

type ShipmentOrderItemRow = {
  id: string;
  order_id: string;
  item_id: string;
};

type ShipmentArticleRow = {
  id: string;
  code: string | null;
  supplier_code: string | null;
  description: string | null;
};

type ShipmentRowDb = {
  id: string;
  ddt_number: string | null;
  ddt_date: string;
  archive_code: string | null;
  note: string | null;
  scan_pdf_url: string | null;
  scan_pdf_path: string | null;
};

type ShipmentItemLinkRow = {
  shipment_id: string;
  order_item_id: string;
  qty_arrived: number | string;
};

export async function loadSupplierShipmentData(
  supplierId: string
): Promise<SupplierShipmentData> {
  const { data: orderRows } = await supabase
    .from("orders")
    .select("id,order_number")
    .eq("supplier_id", supplierId);

  const orderNumberById = new Map<string, string>();

  ((orderRows || []) as ShipmentOrderRow[]).forEach((row) => {
    orderNumberById.set(
      String(row.id),
      row.order_number != null ? String(row.order_number) : ""
    );
  });

  const orderIds = Array.from(orderNumberById.keys());

  let orderItemRows: ShipmentOrderItemRow[] = [];

  if (orderIds.length > 0) {
    const { data } = await supabase
      .from("order_items")
      .select("id,order_id,item_id")
      .in("order_id", orderIds);

    orderItemRows = (data || []) as ShipmentOrderItemRow[];
  }

  const itemIds = orderItemRows.map((row) => String(row.item_id));

  let articleRows: ShipmentArticleRow[] = [];

  if (itemIds.length > 0) {
    const { data } = await supabase
      .from("items")
      .select("id,code,supplier_code,description")
      .in("id", itemIds);

    articleRows = (data || []) as ShipmentArticleRow[];
  }

  const articleById = new Map<string, ShipmentArticleRow>();

  articleRows.forEach((row) => {
    articleById.set(String(row.id), row);
  });

  const orderItemInfoById = new Map<
    string,
    Omit<ShipmentLineItem, "qty_arrived">
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
    });
  });

  const { data: shipmentRows, error: shipmentsError } = await supabase
    .from("order_shipments")
    .select(
      "id,ddt_number,ddt_date,archive_code,note,scan_pdf_url,scan_pdf_path"
    )
    .eq("supplier_id", supplierId)
    .order("ddt_date", { ascending: false });

  if (shipmentsError || !shipmentRows || shipmentRows.length === 0) {
    return { shipments: [] };
  }

  const shipmentIds = (shipmentRows as ShipmentRowDb[]).map((row) =>
    String(row.id)
  );

  const { data: linkRows } = await supabase
    .from("order_shipment_items")
    .select("shipment_id,order_item_id,qty_arrived")
    .in("shipment_id", shipmentIds);

  const itemsByShipment = new Map<string, ShipmentLineItem[]>();

  ((linkRows || []) as ShipmentItemLinkRow[]).forEach((row) => {
    const info = orderItemInfoById.get(String(row.order_item_id));
    const list = itemsByShipment.get(String(row.shipment_id)) || [];

    list.push({
      id: String(row.order_item_id),
      order_id: info?.order_id || "",
      order_number: info?.order_number || null,
      code: info?.code || "-",
      supplier_code: info?.supplier_code || null,
      description: info?.description || "Articolo non trovato",
      qty_arrived: Number(row.qty_arrived || 0),
    });

    itemsByShipment.set(String(row.shipment_id), list);
  });

  const shipments: Shipment[] = (shipmentRows as ShipmentRowDb[]).map(
    (row) => ({
      id: String(row.id),
      ddt_number: String(row.ddt_number || ""),
      ddt_date: String(row.ddt_date || ""),
      archive_code: row.archive_code ? String(row.archive_code) : null,
      note: row.note ? String(row.note) : null,
      scan_pdf_url: row.scan_pdf_url ? String(row.scan_pdf_url) : null,
      scan_pdf_path: row.scan_pdf_path ? String(row.scan_pdf_path) : null,
      items: itemsByShipment.get(String(row.id)) || [],
    })
  );

  return { shipments };
}

export type ShipmentDraftInput = {
  ddt_number: string;
  ddt_date: string;
  archive_code: string | null;
  note: string | null;
};

export async function createShipment(
  supplierId: string,
  draft: ShipmentDraftInput,
  itemQtyById: Record<string, number>
): Promise<{ id: string | null; error: string | null }> {
  const { data: inserted, error } = await supabase
    .from("order_shipments")
    .insert({
      supplier_id: supplierId,
      ddt_number: draft.ddt_number,
      ddt_date: draft.ddt_date,
      archive_code: draft.archive_code,
      note: draft.note,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { id: null, error: error?.message || "DDT non creato" };
  }

  const rows = Object.entries(itemQtyById)
    .filter(([, qty]) => qty > 0)
    .map(([orderItemId, qty]) => ({
      shipment_id: inserted.id,
      order_item_id: orderItemId,
      qty_arrived: qty,
    }));

  if (rows.length > 0) {
    const { error: itemsError } = await supabase
      .from("order_shipment_items")
      .insert(rows);

    if (itemsError) {
      return {
        id: String(inserted.id),
        error:
          "DDT creato, ma errore nel salvare gli articoli: " +
          itemsError.message,
      };
    }
  }

  return { id: String(inserted.id), error: null };
}

export async function uploadShipmentPdf(
  shipmentId: string,
  supplierId: string,
  file: File
): Promise<string | null> {
  const safeName = file.name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_");

  const path = `${supplierId}/${shipmentId}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("ddt-scans")
    .upload(path, file, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    return uploadError.message;
  }

  const { data: publicUrlData } = supabase.storage
    .from("ddt-scans")
    .getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("order_shipments")
    .update({
      scan_pdf_url: publicUrlData.publicUrl,
      scan_pdf_path: path,
    })
    .eq("id", shipmentId);

  return updateError ? updateError.message : null;
}

export async function deleteShipmentById(
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("order_shipments").delete().eq("id", id);

  return { error: error ? error.message : null };
}
