"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import {
  loadSupplierInvoiceData,
  createInvoice,
  deleteInvoiceById,
  loadOrderItemsReference,
  loadSupplierOrderOptions,
  Invoice,
  OrderItemReference,
  SupplierOrderOption,
} from "../../../lib/invoices";
import {
  loadSupplierShipmentData,
  createShipment,
  uploadShipmentPdf,
  deleteShipmentById,
  Shipment,
} from "../../../lib/shipments";

type OrderRow = {
  id: string;
  order_number: number | null;
  supplier_id: string;
  status: string;
  order_date: string | null;
  requested_delivery_date: string | null;
  created_at: string | null;
  pdf_url: string | null;
  pdf_path: string | null;
};

type Supplier = {
  id: string;
  name: string;
};

type Item = {
  id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  stock: number;
  on_order: number;
};

type OrderItem = {
  id: string;
  order_id: string;
  item_id: string;
  qty: number;
  received_qty: number;
  unit_price: number;
  requested_delivery_date: string | null;
};

type LineView = {
  id: string;
  item_id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  qty: number;
  received_qty: number;
  remaining_qty: number;
  unit_price: number;
  stock: number;
  on_order: number;
  requested_delivery_date: string | null;
};

type UpholsteryCandidate = {
  requirementId: string;
  boatId: string;
  boatMatricola: string;
  color: string;
  detailsLogos: string;
  stitching: string;
  quilting: string;
  requestedDeliveryDate: string | null;
};

type KitAssignmentSlot = {
  key: string;
  lineId: string;
  itemId: string;
  itemDescription: string;
  requirement: UpholsteryCandidate;
  matricola: string;
  scannerCode: string;
  unitPrice: string;
};

type ShipmentDraft = {
  ddt_number: string;
  ddt_date: string;
  archive_code: string;
  note: string;
};

const EMPTY_SHIPMENT_DRAFT: ShipmentDraft = {
  ddt_number: "",
  ddt_date: "",
  archive_code: "",
  note: "",
};

type InvoiceDraft = {
  invoice_number: string;
  invoice_date: string;
  archive_code: string;
  amount: string;
  note: string;
};

const EMPTY_INVOICE_DRAFT: InvoiceDraft = {
  invoice_number: "",
  invoice_date: "",
  archive_code: "",
  amount: "",
  note: "",
};

type UpholsteryRequirementRow = {
  id: string;
  order_item_id: string | null;
  boat_id: string | null;
  color: string | null;
  details_logos: string | null;
  stitching: string | null;
  quilting: string | null;
  production_boats:
    | {
        order_number: string | null;
        requested_delivery_date: string | null;
      }[]
    | null;
};

type Permissions = {
  orders?: boolean;
  create_orders?: boolean;
  view_prices?: boolean;
};

function readLocalPermissions(): {
  role: string | null;
  permissions: Permissions;
} {
  const role =
    localStorage.getItem(
      "magazzino_role"
    );

  const saved =
    localStorage.getItem(
      "magazzino_permissions"
    );

  if (!saved) {
    return {
      role,
      permissions: {},
    };
  }

  try {
    const parsed =
      JSON.parse(saved);

    if (
      parsed &&
      typeof parsed === "object"
    ) {
      return {
        role,
        permissions:
          parsed as Permissions,
      };
    }
  } catch {
    // Dato locale non valido:
    // nessun permesso aggiuntivo.
  }

  return {
    role,
    permissions: {},
  };
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();

  const orderId = String(params.orderId);

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);

  const [lines, setLines] = useState<LineView[]>([]);

  const [incomingQty, setIncomingQty] = useState<
    Record<string, number>
  >({});

  const [upholsteryCandidatesByLine, setUpholsteryCandidatesByLine] =
    useState<Record<string, UpholsteryCandidate[]>>({});

  const [kitAssignmentSlots, setKitAssignmentSlots] = useState<
    KitAssignmentSlot[]
  >([]);

  const [assigningKits, setAssigningKits] = useState(false);

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [showAddShipment, setShowAddShipment] = useState(false);
  const [shipmentDraft, setShipmentDraft] = useState<ShipmentDraft>(
    EMPTY_SHIPMENT_DRAFT
  );
  const [shipmentSaving, setShipmentSaving] = useState(false);
  const [shipmentMessage, setShipmentMessage] = useState("");
  const [shipmentAddedOrderIds, setShipmentAddedOrderIds] = useState<
    string[]
  >([]);
  const [shipmentItemQty, setShipmentItemQty] = useState<
    Record<string, string>
  >({});
  const [shipmentPdfFile, setShipmentPdfFile] = useState<File | null>(null);
  const [shipmentUploadingId, setShipmentUploadingId] = useState<
    string | null
  >(null);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>(
    EMPTY_INVOICE_DRAFT
  );
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceMessage, setInvoiceMessage] = useState("");

  const [addedOrderIds, setAddedOrderIds] = useState<string[]>([]);
  const [supplierOrderOptions, setSupplierOrderOptions] = useState<
    SupplierOrderOption[]
  >([]);
  const [orderItemsCache, setOrderItemsCache] = useState<
    Record<string, OrderItemReference[]>
  >({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [message, setMessage] = useState("");

  const [messageType, setMessageType] = useState<
    "success" | "error" | ""
  >("");

  const [canViewPrices, setCanViewPrices] =
    useState(false);

  const [canManageOrders, setCanManageOrders] =
    useState(false);

  useEffect(() => {
    const {
      role,
      permissions,
    } = readLocalPermissions();

    const admin =
      role === "admin";

    const allowPrices =
      admin ||
      permissions.view_prices === true;

    const allowManage =
      admin ||
      permissions.create_orders === true;

    setCanViewPrices(
      allowPrices
    );

    setCanManageOrders(
      allowManage
    );

    loadData(
      allowPrices,
      allowManage
    );
  }, [orderId]);

  /*
    DDT (STEP 61 + STEP 64 + STEP 65)

    Collegato al fornitore, come le fatture: puo' coprire articoli
    di piu' ordini diversi insieme. Il selettore mostra TUTTI i DDT
    del fornitore (non solo quelli di questo ordine), ma l'ordine
    corrente viene pre-aggiunto per comodita' quando si apre il
    modulo da qui. E' un registro documentale della consegna fisica
    (numero, data, codice archivio, articoli con quantita'
    arrivata, PDF della scansione originale): non tocca
    received_qty dell'ordine, gestito da "Ricezione merce".
  */
  const loadShipmentData = useCallback(async () => {
    if (!order?.supplier_id) return;

    setShipmentsLoading(true);

    const { shipments: loadedShipments } = await loadSupplierShipmentData(
      order.supplier_id
    );

    setShipments(loadedShipments);
    setShipmentsLoading(false);
  }, [order?.supplier_id]);

  useEffect(() => {
    loadShipmentData();
  }, [loadShipmentData]);

  async function openAddShipment() {
    if (showAddShipment) {
      setShowAddShipment(false);
      return;
    }

    if (!orderItemsCache[orderId]) {
      const items = await loadOrderItemsReference(orderId);
      setOrderItemsCache((prev) => ({ ...prev, [orderId]: items }));
    }

    setShipmentAddedOrderIds([orderId]);
    setShipmentItemQty({});
    setShipmentPdfFile(null);
    setShowAddShipment(true);
  }

  async function addOrderToShipmentDraft(orderIdToAdd: string) {
    setShipmentAddedOrderIds((prev) =>
      prev.includes(orderIdToAdd) ? prev : [...prev, orderIdToAdd]
    );

    if (!orderItemsCache[orderIdToAdd]) {
      const items = await loadOrderItemsReference(orderIdToAdd);
      setOrderItemsCache((prev) => ({ ...prev, [orderIdToAdd]: items }));
    }
  }

  function removeOrderFromShipmentDraft(orderIdToRemove: string) {
    setShipmentAddedOrderIds((prev) =>
      prev.filter((id) => id !== orderIdToRemove)
    );

    const itemsOfOrder = orderItemsCache[orderIdToRemove] || [];
    const idsToRemove = new Set(itemsOfOrder.map((item) => item.id));

    setShipmentItemQty((prev) => {
      const next = { ...prev };
      idsToRemove.forEach((id) => delete next[id]);
      return next;
    });
  }

  async function addShipment() {
    if (!order?.supplier_id) return;

    const number = shipmentDraft.ddt_number.trim();
    const date = shipmentDraft.ddt_date.trim();

    if (!number) {
      setShipmentMessage("Inserisci il numero del DDT.");
      return;
    }

    if (!date) {
      setShipmentMessage("Inserisci la data del DDT.");
      return;
    }

    setShipmentSaving(true);
    setShipmentMessage("");

    const itemQtyById: Record<string, number> = {};

    Object.entries(shipmentItemQty).forEach(([id, value]) => {
      const qty = Number(value) || 0;
      if (qty > 0) itemQtyById[id] = qty;
    });

    const { id: newId, error } = await createShipment(
      order.supplier_id,
      {
        ddt_number: number,
        ddt_date: date,
        archive_code: shipmentDraft.archive_code.trim() || null,
        note: shipmentDraft.note.trim() || null,
      },
      itemQtyById
    );

    if (error && !newId) {
      setShipmentMessage("Errore: " + error);
      setShipmentSaving(false);
      return;
    }

    let warning = error || "";

    if (newId && shipmentPdfFile) {
      const uploadErrorMessage = await uploadShipmentPdf(
        newId,
        order.supplier_id,
        shipmentPdfFile
      );

      if (uploadErrorMessage) {
        warning =
          (warning ? warning + " " : "") +
          "Errore nel caricare il PDF: " +
          uploadErrorMessage;
      }
    }

    setShipmentMessage(warning);
    setShipmentDraft(EMPTY_SHIPMENT_DRAFT);
    setShipmentAddedOrderIds([]);
    setShipmentItemQty({});
    setShipmentPdfFile(null);
    setShowAddShipment(false);
    setShipmentSaving(false);
    await loadShipmentData();
  }

  async function addPdfToShipment(shipmentId: string, file: File) {
    if (!order?.supplier_id) return;

    setShipmentUploadingId(shipmentId);

    const errorMessage = await uploadShipmentPdf(
      shipmentId,
      order.supplier_id,
      file
    );

    setShipmentUploadingId(null);

    if (errorMessage) {
      alert("Errore nel caricare il PDF: " + errorMessage);
      return;
    }

    await loadShipmentData();
  }

  async function deleteShipment(id: string) {
    const confirmed = confirm(
      "Eliminare questo DDT? L'operazione non si può annullare."
    );

    if (!confirmed) return;

    const { error } = await deleteShipmentById(id);

    if (error) {
      alert("Errore: " + error);
      return;
    }

    await loadShipmentData();
  }

  /*
    FATTURE (STEP 61 + estensione multi-ordine)

    Una fattura è collegata al fornitore, non a questo singolo
    ordine: puo' coprire DDT di ordini diversi dello stesso
    fornitore insieme (fattura riepilogativa). Per questo il
    selettore mostra TUTTI i DDT ancora da fatturare del
    fornitore, non solo quelli di questo ordine - ma quelli di
    questo ordine vengono pre-selezionati per comodità quando si
    apre il modulo da qui.
  */
  const loadInvoiceData = useCallback(async () => {
    if (!order?.supplier_id) return;

    setInvoicesLoading(true);

    const [{ invoices: loadedInvoices }, loadedOrderOptions] =
      await Promise.all([
        loadSupplierInvoiceData(order.supplier_id),
        loadSupplierOrderOptions(order.supplier_id),
      ]);

    setInvoices(loadedInvoices);
    setSupplierOrderOptions(loadedOrderOptions);
    setInvoicesLoading(false);
  }, [order?.supplier_id]);

  useEffect(() => {
    loadInvoiceData();
  }, [loadInvoiceData]);

  function toggleItemSelection(id: string) {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function openAddInvoice() {
    if (showAddInvoice) {
      setShowAddInvoice(false);
      return;
    }

    let items = orderItemsCache[orderId];

    if (!items) {
      items = await loadOrderItemsReference(orderId);
      setOrderItemsCache((prev) => ({ ...prev, [orderId]: items as OrderItemReference[] }));
    }

    const notYetInvoicedIds = items
      .filter((item) => !item.invoiced)
      .map((item) => item.id);

    setAddedOrderIds([orderId]);
    setSelectedItemIds(notYetInvoicedIds);
    setShowAddInvoice(true);
  }

  async function addOrderToInvoiceDraft(orderIdToAdd: string) {
    setAddedOrderIds((prev) =>
      prev.includes(orderIdToAdd) ? prev : [...prev, orderIdToAdd]
    );

    if (!orderItemsCache[orderIdToAdd]) {
      const items = await loadOrderItemsReference(orderIdToAdd);
      setOrderItemsCache((prev) => ({ ...prev, [orderIdToAdd]: items }));
    }
  }

  function removeOrderFromInvoiceDraft(orderIdToRemove: string) {
    setAddedOrderIds((prev) => prev.filter((id) => id !== orderIdToRemove));

    const itemsOfOrder = orderItemsCache[orderIdToRemove] || [];
    const idsToRemove = new Set(itemsOfOrder.map((item) => item.id));

    setSelectedItemIds((prev) => prev.filter((id) => !idsToRemove.has(id)));
  }

  async function loadInvoiceFromShipment(shipmentId: string) {
    const shipment = shipments.find((item) => item.id === shipmentId);

    if (!shipment || shipment.items.length === 0) return;

    const neededOrderIds = Array.from(
      new Set(shipment.items.map((item) => item.order_id))
    );

    setAddedOrderIds((prev) =>
      Array.from(new Set([...prev, ...neededOrderIds]))
    );

    await Promise.all(
      neededOrderIds
        .filter((oid) => !orderItemsCache[oid])
        .map(async (oid) => {
          const items = await loadOrderItemsReference(oid);
          setOrderItemsCache((prev) => ({ ...prev, [oid]: items }));
        })
    );

    const newIds = shipment.items.map((item) => item.id);

    setSelectedItemIds((prev) => Array.from(new Set([...prev, ...newIds])));
  }

  async function addInvoice() {
    if (!order?.supplier_id) return;

    const number = invoiceDraft.invoice_number.trim();
    const date = invoiceDraft.invoice_date.trim();

    if (!number) {
      setInvoiceMessage("Inserisci il numero della fattura.");
      return;
    }

    if (!date) {
      setInvoiceMessage("Inserisci la data della fattura.");
      return;
    }

    setInvoiceSaving(true);
    setInvoiceMessage("");

    const amountValue = invoiceDraft.amount.trim()
      ? Number(invoiceDraft.amount)
      : null;

    const { error } = await createInvoice(
      order.supplier_id,
      {
        invoice_number: number,
        invoice_date: date,
        archive_code: invoiceDraft.archive_code.trim() || null,
        amount: amountValue,
        note: invoiceDraft.note.trim() || null,
      },
      selectedItemIds
    );

    if (error) {
      setInvoiceMessage("Errore: " + error);
      setInvoiceSaving(false);
      await loadInvoiceData();
      return;
    }

    setInvoiceDraft(EMPTY_INVOICE_DRAFT);
    setSelectedItemIds([]);
    setAddedOrderIds([]);
    setShowAddInvoice(false);
    setInvoiceSaving(false);
    // La cache degli articoli ha il flag "invoiced" ormai vecchio
    // per gli articoli appena fatturati: la svuoto cosi' la prossima
    // volta che si apre un ordine viene ricaricata aggiornata.
    setOrderItemsCache({});
    await loadInvoiceData();
  }

  async function deleteInvoice(id: string) {
    const confirmed = confirm(
      "Eliminare questa fattura? Gli articoli collegati torneranno \"da fatturare\". L'operazione non si può annullare."
    );

    if (!confirmed) return;

    const { error } = await deleteInvoiceById(id);

    if (error) {
      alert("Errore: " + error);
      return;
    }

    /*
      Gli articoli della fattura eliminata tornano "da fatturare",
      ma la cache locale (usata per il flag "invoiced" nei checkbox)
      non lo sa ancora. Se il modulo e' aperto con ordini gia'
      aggiunti li ricarico subito, cosi' lo sblocco si vede senza
      dover riaprire il modulo; altrimenti svuoto la cache e si
      ricarica da sola alla prossima apertura.
    */
    if (addedOrderIds.length > 0) {
      const refreshedEntries = await Promise.all(
        addedOrderIds.map(
          async (oid) => [oid, await loadOrderItemsReference(oid)] as const
        )
      );

      setOrderItemsCache(Object.fromEntries(refreshedEntries));
    } else {
      setOrderItemsCache({});
    }

    await loadInvoiceData();
  }

  async function loadData(
    allowPrices = canViewPrices,
    allowManage = canManageOrders
  ) {
    setLoading(true);

    const { data: orderData, error: orderError } =
      await supabase
        .from("orders")
        .select(
          "id,order_number,supplier_id,status,order_date,requested_delivery_date,created_at,pdf_url,pdf_path"
        )
        .eq("id", orderId)
        .single();

    if (orderError || !orderData) {
      setMessage(
        "Errore caricamento ordine: " +
          (orderError?.message ||
            "Ordine non trovato")
      );

      setMessageType("error");
      setLoading(false);
      return;
    }

    /*
      Un utente che può solo consultare
      la merce in arrivo vede esclusivamente
      ordini IN ORDINE o PARZIALI.

      Bozze, ricevuti e annullati restano
      nella gestione completa.
    */
    if (
      !allowManage &&
      !["ordered", "partial"].includes(
        String(orderData.status || "")
      )
    ) {
      setMessage(
        "Questo ordine non fa parte della merce attualmente in arrivo."
      );

      setMessageType("error");
      setLoading(false);
      return;
    }

    const { data: supplierData, error: supplierError } =
      await supabase
        .from("suppliers")
        .select("id,name")
        .eq("id", orderData.supplier_id)
        .single();

    if (supplierError || !supplierData) {
      setMessage(
        "Errore caricamento fornitore: " +
          (supplierError?.message ||
            "Fornitore non trovato")
      );

      setMessageType("error");
      setLoading(false);
      return;
    }

    /*
      Se l'utente non può vedere i prezzi
      NON chiediamo unit_price a Supabase.

      Usiamo due select letterali separate:
      evita l'errore di tipizzazione Supabase
      durante il build TypeScript su Vercel.
    */
    let orderItems: OrderItem[] = [];

    if (allowPrices) {
      const {
        data,
        error,
      } = await supabase
        .from("order_items")
        .select(
          "id,order_id,item_id,qty,received_qty,unit_price,requested_delivery_date"
        )
        .eq("order_id", orderId);

      if (error) {
        setMessage(
          "Errore caricamento righe ordine: " +
            error.message
        );

        setMessageType("error");
        setLoading(false);
        return;
      }

      orderItems =
        (data || []).map(
          (row) => ({
            id:
              String(row.id),
            order_id:
              String(row.order_id),
            item_id:
              String(row.item_id),
            qty:
              Number(row.qty || 0),
            received_qty:
              Number(
                row.received_qty || 0
              ),
            unit_price:
              Number(
                row.unit_price || 0
              ),
            requested_delivery_date:
              row.requested_delivery_date
                ? String(row.requested_delivery_date)
                : null,
          })
        );
    } else {
      const {
        data,
        error,
      } = await supabase
        .from("order_items")
        .select(
          "id,order_id,item_id,qty,received_qty,requested_delivery_date"
        )
        .eq("order_id", orderId);

      if (error) {
        setMessage(
          "Errore caricamento righe ordine: " +
            error.message
        );

        setMessageType("error");
        setLoading(false);
        return;
      }

      orderItems =
        (data || []).map(
          (row) => ({
            id:
              String(row.id),
            order_id:
              String(row.order_id),
            item_id:
              String(row.item_id),
            qty:
              Number(row.qty || 0),
            received_qty:
              Number(
                row.received_qty || 0
              ),
            unit_price: 0,
            requested_delivery_date:
              row.requested_delivery_date
                ? String(row.requested_delivery_date)
                : null,
          })
        );
    }

    const itemIds =
      orderItems.map((line) => line.item_id);

    let itemsData: Item[] = [];

    if (itemIds.length > 0) {
      const { data, error } = await supabase
        .from("items")
        .select(
          "id,code,supplier_code,description,stock,on_order"
        )
        .in("id", itemIds);

      if (error) {
        setMessage(
          "Errore caricamento articoli: " +
            error.message
        );

        setMessageType("error");
        setLoading(false);
        return;
      }

      itemsData = (data || []).map((item) => ({
        ...item,
        stock: Number(item.stock || 0),
        on_order: Number(item.on_order || 0),
      }));
    }

    const itemMap = new Map<string, Item>();

    itemsData.forEach((item) => {
      itemMap.set(item.id, item);
    });

    const lineViews: LineView[] =
      orderItems.map((line) => {
        const item = itemMap.get(line.item_id);

        const qty =
          Number(line.qty || 0);

        const receivedQty =
          Number(line.received_qty || 0);

        return {
          id: line.id,
          item_id: line.item_id,

          code:
            item?.code || "-",

          supplier_code:
            item?.supplier_code || null,

          description:
            item?.description ||
            "Articolo non trovato",

          qty,

          received_qty:
            receivedQty,

          remaining_qty:
            Math.max(
              0,
              qty - receivedQty
            ),

          unit_price:
            allowPrices
              ? Number(
                  line.unit_price || 0
                )
              : 0,

          stock:
            Number(item?.stock || 0),

          on_order:
            Number(item?.on_order || 0),

          requested_delivery_date:
            line.requested_delivery_date,
        };
      });

    const initialIncoming:
      Record<string, number> = {};

    lineViews.forEach((line) => {
      initialIncoming[line.id] = 0;
    });

    /*
      Richieste tappezzeria di battelli ancora "IN ORDINE" collegate
      alle righe di questo ordine (kit_id ancora vuoto). Servono per
      proporre, appena registri l'arrivo, a quale battello assegnare
      ciascun kit appena arrivato.
    */
    const lineIds = orderItems.map((line) => line.id);

    const candidatesByLine: Record<string, UpholsteryCandidate[]> = {};

    if (lineIds.length > 0) {
      const { data: reqRows } = await supabase
        .from("production_boat_upholstery")
        .select(
          "id,order_item_id,boat_id,color,details_logos,stitching,quilting,production_boats(order_number,requested_delivery_date)"
        )
        .in("order_item_id", lineIds)
        .is("kit_id", null);

      ((reqRows || []) as UpholsteryRequirementRow[]).forEach((row) => {
        const lineId = String(row.order_item_id || "");

        if (!lineId) return;

        const boat = (row.production_boats && row.production_boats[0]) || {
          order_number: null,
          requested_delivery_date: null,
        };

        const candidate: UpholsteryCandidate = {
          requirementId: String(row.id),
          boatId: String(row.boat_id || ""),
          boatMatricola: String(boat.order_number || "-"),
          color: String(row.color || ""),
          detailsLogos: String(row.details_logos || ""),
          stitching: String(row.stitching || ""),
          quilting: String(row.quilting || ""),
          requestedDeliveryDate: boat.requested_delivery_date
            ? String(boat.requested_delivery_date)
            : null,
        };

        const list = candidatesByLine[lineId] || [];
        list.push(candidate);
        candidatesByLine[lineId] = list;
      });

      Object.keys(candidatesByLine).forEach((lineId) => {
        candidatesByLine[lineId].sort((a, b) => {
          if (a.requestedDeliveryDate && b.requestedDeliveryDate) {
            return a.requestedDeliveryDate.localeCompare(
              b.requestedDeliveryDate
            );
          }

          if (a.requestedDeliveryDate) return -1;
          if (b.requestedDeliveryDate) return 1;
          return 0;
        });
      });
    }

    setOrder(orderData);
    setSupplier(supplierData);
    setLines(lineViews);
    setIncomingQty(initialIncoming);
    setUpholsteryCandidatesByLine(candidatesByLine);

    setLoading(false);
  }

  const totalOrderValue = useMemo(() => {
    if (!canViewPrices) {
      return 0;
    }

    return lines.reduce(
      (sum, line) =>
        sum +
        line.qty *
          line.unit_price,
      0
    );
  }, [lines, canViewPrices]);

  const deliveredValue = useMemo(() => {
    if (!canViewPrices) {
      return 0;
    }

    return lines.reduce(
      (sum, line) =>
        sum +
        line.received_qty *
          line.unit_price,
      0
    );
  }, [lines, canViewPrices]);

  const remainingValue = useMemo(() => {
    if (!canViewPrices) {
      return 0;
    }

    return lines.reduce(
      (sum, line) =>
        sum +
        line.remaining_qty *
          line.unit_price,
      0
    );
  }, [lines, canViewPrices]);

  /*
    Solo le fatture che coprono almeno un articolo di QUESTO ordine
    (una fattura puo' comunque coprirne altri di ordini diversi:
    la riga sotto lo segnala, lo storico completo per fornitore
    resta nella pagina fornitore).
  */
  const relevantInvoices = useMemo(() => {
    return invoices.filter((invoice) =>
      invoice.items.some((item) => item.order_id === orderId)
    );
  }, [invoices, orderId]);

  const relevantShipments = useMemo(() => {
    return shipments.filter((shipment) =>
      shipment.items.some((item) => item.order_id === orderId)
    );
  }, [shipments, orderId]);

  const totalOrderedQty = useMemo(() => {
    return lines.reduce(
      (sum, line) =>
        sum + line.qty,
      0
    );
  }, [lines]);

  const totalReceivedQty = useMemo(() => {
    return lines.reduce(
      (sum, line) =>
        sum +
        line.received_qty,
      0
    );
  }, [lines]);

  const totalRemainingQty = useMemo(() => {
    return lines.reduce(
      (sum, line) =>
        sum +
        line.remaining_qty,
      0
    );
  }, [lines]);

  function changeIncomingQty(
    lineId: string,
    value: number
  ) {
    const line =
      lines.find(
        (row) => row.id === lineId
      );

    if (!line) return;

    const safeValue =
      Math.max(
        0,
        Math.min(
          Math.floor(value || 0),
          line.remaining_qty
        )
      );

    setIncomingQty((current) => ({
      ...current,
      [lineId]: safeValue,
    }));
  }

  /*
    RICEZIONE ORDINE ATOMICA

    Non aggiorniamo più:
    - stock
    - on_order
    - received_qty
    - status

    uno alla volta dal browser.

    Facciamo UNA SOLA chiamata a Supabase.
  */
  async function registerArrival(
    mode: "partial" | "complete"
  ) {
    if (!order) return;

    if (order.status === "received") {
      setMessage(
        "Questo ordine è già stato completato."
      );

      setMessageType("error");
      return;
    }

    if (order.status === "cancelled") {
      setMessage(
        "Questo ordine è stato annullato."
      );

      setMessageType("error");
      return;
    }

    /*
      ARRIVO PARZIALE

      Prepariamo soltanto le righe
      dove hai inserito una quantità.
    */
    const receipts = lines
      .map((line) => ({
        line_id: line.id,
        qty: Number(
          incomingQty[line.id] || 0
        ),
      }))
      .filter(
        (receipt) =>
          receipt.qty > 0
      );

    if (
      mode === "partial" &&
      receipts.length === 0
    ) {
      setMessage(
        "Inserisci almeno una quantità ricevuta."
      );

      setMessageType("error");
      return;
    }

    if (
      mode === "complete" &&
      totalRemainingQty <= 0
    ) {
      setMessage(
        "Non ci sono quantità ancora da ricevere."
      );

      setMessageType("error");
      return;
    }

    const confirmationText =
      mode === "complete"
        ? "Confermi che tutto il materiale residuo dell'ordine è arrivato?"
        : "Confermi le quantità ricevute indicate?";

    const confirmed =
      confirm(confirmationText);

    if (!confirmed) {
      return;
    }

    /*
      Quanti pezzi di ogni riga stanno per essere segnati come
      arrivati con QUESTA chiamata: serve dopo, per proporre
      l'assegnazione a un battello "IN ORDINE".
    */
    const arrivedQtyByLine: Record<string, number> = {};

    if (mode === "partial") {
      receipts.forEach((receipt) => {
        arrivedQtyByLine[receipt.line_id] = receipt.qty;
      });
    } else {
      lines.forEach((line) => {
        if (line.remaining_qty > 0) {
          arrivedQtyByLine[line.id] = line.remaining_qty;
        }
      });
    }

    setSaving(true);
    setMessage("");
    setMessageType("");

    /*
      QUI AVVIENE TUTTO.

      Supabase esegue la funzione SQL
      dentro una transazione.

      Se qualcosa fallisce,
      nessuna modifica viene confermata.
    */
    const { data, error } =
      await supabase.rpc(
        "receive_order_atomic",
        {
          p_order_id: orderId,

          p_receipts:
            mode === "partial"
              ? receipts
              : [],

          p_complete:
            mode === "complete",
        }
      );

    if (error) {
      console.error(
        "Errore ricezione atomica:",
        error
      );

      setMessage(
        "Ricezione non registrata: " +
          error.message
      );

      setMessageType("error");
      setSaving(false);

      return;
    }

    console.log(
      "Ricezione completata:",
      data
    );

    /*
      Per ogni pezzo appena arrivato che corrisponde a un battello
      ancora "IN ORDINE" (nessun kit assegnato), proponiamo subito
      di creare il kit fisico e assegnarlo: cosi' passa ad
      "ASSEGNATA" nello stesso momento in cui segni l'arrivo.

      I pezzi arrivati in piu' rispetto ai battelli in attesa
      restano semplicemente in giacenza generica, come prima.
    */
    let nextMatricola = 1;

    const { data: matricolaData } = await supabase.rpc(
      "next_upholstery_matricola",
      { p_supplier_id: order.supplier_id }
    );

    if (matricolaData !== null && matricolaData !== undefined) {
      nextMatricola = Number(matricolaData);
    }

    const newSlots: KitAssignmentSlot[] = [];

    Object.entries(arrivedQtyByLine).forEach(([lineId, qty]) => {
      const candidates = upholsteryCandidatesByLine[lineId] || [];
      const line = lines.find((row) => row.id === lineId);

      if (!line) return;

      const slotsForLine = Math.min(qty, candidates.length);

      for (let i = 0; i < slotsForLine; i++) {
        const requirement = candidates[i];

        newSlots.push({
          key: lineId + "-" + requirement.requirementId,
          lineId,
          itemId: line.item_id,
          itemDescription: line.description,
          requirement,
          matricola: String(nextMatricola),
          scannerCode: "",
          unitPrice:
            line.unit_price > 0 ? String(line.unit_price) : "",
        });

        nextMatricola += 1;
      }
    });

    setKitAssignmentSlots(newSlots);

    /*
      Ricarichiamo tutto dal database.
    */
    await loadData();

    setSaving(false);

    const result =
      data as {
        success?: boolean;
        status?: string;
        complete?: boolean;
      } | null;

    if (
      result?.status ===
      "received"
    ) {
      setMessage(
        "Ordine completato. Giacenze e quantità in ordine aggiornate correttamente."
      );
    } else {
      setMessage(
        "Arrivo parziale registrato. Le quantità mancanti restano in ordine."
      );
    }

    setMessageType("success");
  }

  /*
    ASSEGNAZIONE KIT TAPPEZZERIA APPENA ARRIVATI

    Per ogni "slot" proposto: crea il kit fisico in giacenza
    (create_upholstery_stock_kit) e lo assegna subito al battello
    in attesa (assign_upholstery_kit_to_boat). Le due RPC esistenti
    si bilanciano da sole sulla giacenza (+1 alla creazione, -1
    all'assegnazione): l'unico incremento reale resta quello gia'
    fatto da receive_order_atomic all'arrivo, nessun doppio conteggio.
  */
  function updateKitSlot(
    key: string,
    field: "matricola" | "scannerCode" | "unitPrice",
    value: string
  ) {
    setKitAssignmentSlots((current) =>
      current.map((slot) =>
        slot.key === key ? { ...slot, [field]: value } : slot
      )
    );
  }

  function dismissKitSlot(key: string) {
    setKitAssignmentSlots((current) =>
      current.filter((slot) => slot.key !== key)
    );
  }

  function dismissAllKitSlots() {
    setKitAssignmentSlots([]);
  }

  async function confirmKitAssignments() {
    if (!order || kitAssignmentSlots.length === 0) return;

    setAssigningKits(true);

    const remaining: KitAssignmentSlot[] = [];
    let okCount = 0;
    let firstError = "";

    for (const slot of kitAssignmentSlots) {
      const matricolaNumber = Number(slot.matricola);
      const priceNumber = Number(slot.unitPrice);

      if (
        !Number.isFinite(matricolaNumber) ||
        matricolaNumber < 1 ||
        matricolaNumber > 10000
      ) {
        remaining.push(slot);
        if (!firstError) {
          firstError =
            "Matricola Kit non valida per il battello " +
            slot.requirement.boatMatricola +
            ".";
        }
        continue;
      }

      if (!slot.scannerCode.trim()) {
        remaining.push(slot);
        if (!firstError) {
          firstError =
            "Codice scanner mancante per il battello " +
            slot.requirement.boatMatricola +
            ".";
        }
        continue;
      }

      if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
        remaining.push(slot);
        if (!firstError) {
          firstError =
            "Prezzo kit mancante per il battello " +
            slot.requirement.boatMatricola +
            ".";
        }
        continue;
      }

      const { data: newKitId, error: createError } = await supabase.rpc(
        "create_upholstery_stock_kit",
        {
          p_supplier_id: order.supplier_id,
          p_item_id: slot.itemId,
          p_matricola: matricolaNumber,
          p_scanner_code: slot.scannerCode.trim(),
          p_unit_price: priceNumber,
          p_color: slot.requirement.color,
          p_details_logos: slot.requirement.detailsLogos,
          p_stitching: slot.requirement.stitching,
          p_quilting: slot.requirement.quilting,
          p_note: null,
        }
      );

      if (createError || !newKitId) {
        remaining.push(slot);
        if (!firstError) {
          firstError =
            "Kit per il battello " +
            slot.requirement.boatMatricola +
            ": " +
            (createError?.message || "errore sconosciuto");
        }
        continue;
      }

      const { error: assignError } = await supabase.rpc(
        "assign_upholstery_kit_to_boat",
        {
          p_kit_id: newKitId,
          p_boat_upholstery_id: slot.requirement.requirementId,
        }
      );

      if (assignError) {
        remaining.push(slot);
        if (!firstError) {
          firstError =
            "Kit creato ma assegnazione al battello " +
            slot.requirement.boatMatricola +
            " fallita: " +
            assignError.message +
            ". Assegnalo a mano dalla scheda del kit.";
        }
        continue;
      }

      okCount += 1;
    }

    setKitAssignmentSlots(remaining);
    setAssigningKits(false);

    if (okCount > 0) {
      setMessage(
        firstError
          ? okCount + " kit assegnati. " + firstError
          : okCount + " kit creati e assegnati correttamente."
      );
      setMessageType(firstError ? "error" : "success");
    } else if (firstError) {
      setMessage(firstError);
      setMessageType("error");
    }

    await loadData();
  }

  /*
    ELIMINAZIONE ORDINE

    Questa parte per ora rimane
    come prima.

    Successivamente renderemo atomica
    anche questa operazione.
  */
  async function deleteOrder() {
    if (!order || !supplier) return;

    const confirmed = confirm(
      `Eliminare definitivamente questo ordine di ${supplier.name}?\n\n` +
        `ATTENZIONE:\n` +
        `- l'ordine verrà eliminato\n` +
        `- le quantità ancora "in ordine" verranno ripristinate\n` +
        `- le quantità già ricevute NON verranno tolte dalla giacenza\n\n` +
        `Continuare?`
    );

    if (!confirmed) return;

    setDeleting(true);
    setMessage("");
    setMessageType("");

    for (const line of lines) {
      const remainingQty =
        Math.max(
          0,
          Number(line.qty || 0) -
            Number(
              line.received_qty || 0
            )
        );

      if (remainingQty <= 0) {
        continue;
      }

      const {
        data: currentItem,
        error: itemReadError,
      } = await supabase
        .from("items")
        .select("on_order")
        .eq(
          "id",
          line.item_id
        )
        .single();

      if (
        itemReadError ||
        !currentItem
      ) {
        setMessage(
          "Errore lettura articolo durante eliminazione: " +
            (
              itemReadError?.message ||
              "Articolo non trovato"
            )
        );

        setMessageType("error");
        setDeleting(false);

        return;
      }

      const newOnOrder =
        Math.max(
          0,
          Number(
            currentItem.on_order ||
              0
          ) -
            remainingQty
        );

      const {
        error: itemUpdateError,
      } = await supabase
        .from("items")
        .update({
          on_order: newOnOrder,
        })
        .eq(
          "id",
          line.item_id
        );

      if (itemUpdateError) {
        setMessage(
          "Errore aggiornamento quantità in ordine: " +
            itemUpdateError.message
        );

        setMessageType("error");
        setDeleting(false);

        return;
      }
    }

    const {
      error: linesDeleteError,
    } = await supabase
      .from("order_items")
      .delete()
      .eq(
        "order_id",
        orderId
      );

    if (linesDeleteError) {
      setMessage(
        "Errore eliminazione righe ordine: " +
          linesDeleteError.message
      );

      setMessageType("error");
      setDeleting(false);

      return;
    }

    const {
      error: orderDeleteError,
    } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId);

    if (orderDeleteError) {
      setMessage(
        "Errore eliminazione ordine: " +
          orderDeleteError.message
      );

      setMessageType("error");
      setDeleting(false);

      return;
    }

    setDeleting(false);

    alert(
      "Ordine eliminato correttamente."
    );

    router.push("/orders");
  }

  if (loading) {
    return (
      <div
        style={{
          maxWidth: 1500,
          margin: "0 auto",
          padding: 30,
          opacity: 0.6,
        }}
      >
        Caricamento ordine...
      </div>
    );
  }

  if (!order || !supplier) {
    return (
      <div
        style={{
          maxWidth: 1500,
          margin: "0 auto",
        }}
      >
        Ordine non trovato.
      </div>
    );
  }

  const isReceived =
    order.status ===
    "received";

  const isCancelled =
    order.status ===
    "cancelled";

  const canReceive =
    canManageOrders &&
    !isReceived &&
    !isCancelled;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1500,
        margin: "0 auto",
      }}
    >
      {/* TESTATA */}

      <div
        style={{
          marginBottom: 25,

          display: "flex",

          justifyContent:
            "space-between",

          alignItems:
            "flex-start",

          gap: 20,

          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              opacity: 0.55,
              marginBottom: 4,

              textTransform:
                "uppercase",

              letterSpacing: 1.2,
              fontWeight: 700,
            }}
          >
            Ordini / {supplier.name}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: 34,
                fontWeight: 850,
              }}
            >
              {order.order_number
                ? `Ordine N. ${order.order_number}`
                : "Dettaglio ordine"}
            </h1>

            <StatusBadge
              status={order.status}
            />
          </div>

          <div
            style={{
              marginTop: 7,
              fontSize: 14,
              opacity: 0.6,
            }}
          >
            Ordine del{" "}
            {formatDate(
              order.order_date
            )}
            {order.requested_delivery_date && (
              <>
                {" "}
                · Consegna richiesta:{" "}
                {formatDate(order.requested_delivery_date)}
              </>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {canViewPrices && order.pdf_url && (
            <a
              href={order.pdf_url}
              target="_blank"
              rel="noreferrer"
              style={
                secondaryButtonStyle
              }
            >
              Apri PDF
            </a>
          )}

          {canManageOrders && (
            <button
              type="button"
              disabled={
                saving ||
                deleting
              }
              onClick={
                deleteOrder
              }
              style={{
                padding:
                  "10px 14px",

                borderRadius: 8,

                border:
                  "1px solid rgba(239,68,68,0.4)",

                background:
                  "rgba(239,68,68,0.08)",

                color:
                  "#ef4444",

                cursor:
                  saving ||
                  deleting
                    ? "not-allowed"
                    : "pointer",

                fontWeight: 800,

                opacity:
                  saving ||
                  deleting
                    ? 0.5
                    : 1,
              }}
            >
              {deleting
                ? "Eliminazione..."
                : "Elimina ordine"}
            </button>
          )}

          <button
            type="button"
            disabled={
              saving ||
              deleting
            }
            onClick={() =>
              router.push(
                "/orders"
              )
            }
            style={
              secondaryButtonStyle
            }
          >
            ← Torna agli ordini
          </button>
        </div>
      </div>

      {/* MESSAGGIO */}

      {message && (
        <div
          style={{
            padding:
              "13px 15px",

            marginBottom: 18,

            borderRadius: 10,

            border:
              messageType ===
              "success"
                ? "1px solid rgba(34,197,94,0.4)"
                : "1px solid rgba(239,68,68,0.45)",

            background:
              messageType ===
              "success"
                ? "rgba(34,197,94,0.08)"
                : "rgba(239,68,68,0.08)",

            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {messageType ===
            "success" &&
            "✓ "}

          {message}
        </div>
      )}

      {/* RIEPILOGO */}

      <div
        style={{
          display: "grid",

          gridTemplateColumns:
            "repeat(auto-fit, minmax(190px, 1fr))",

          gap: 14,

          marginBottom: 22,
        }}
      >
        <SummaryCard
          title="Articoli"
          value={String(
            lines.length
          )}
          subtitle="Codici presenti nell'ordine"
        />

        <SummaryCard
          title="Pezzi ordinati"
          value={String(
            totalOrderedQty
          )}
          subtitle="Quantità totale ordine"
        />

        <SummaryCard
          title="Già ricevuti"
          value={String(
            totalReceivedQty
          )}
          subtitle="Pezzi già entrati in magazzino"
        />

        <SummaryCard
          title="Da ricevere"
          value={String(
            totalRemainingQty
          )}
          subtitle="Pezzi ancora in ordine"
        />

        {canViewPrices && (
          <SummaryCard
            title="Valore ordine"
            value={formatEuro(
              totalOrderValue
            )}
            subtitle="Valore originale"
          />
        )}

        {canViewPrices && (
          <SummaryCard
            title="Valore consegnato"
            value={formatEuro(
              deliveredValue
            )}
            subtitle="Merce già ricevuta"
          />
        )}

        {canViewPrices && (
          <SummaryCard
            title="Valore da consegnare"
            value={formatEuro(
              remainingValue
            )}
            subtitle="Merce ancora in arrivo"
          />
        )}
      </div>

      {/* TABELLA */}

      <div style={cardStyle}>
        <div
          style={{
            padding:
              "16px 18px",

            background:
              "var(--table-head)",

            borderBottom:
              "1px solid var(--border-color)",
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 850,
            }}
          >
            {supplier.name}
          </div>

          <div
            style={{
              fontSize: 12,
              opacity: 0.55,
              marginTop: 3,
            }}
          >
            {canManageOrders
              ? "Controlla le quantità ricevute con il DDT reale"
              : "Articoli e quantità ancora in arrivo"}
          </div>
        </div>

        <div
          style={{
            overflowX: "auto",
          }}
        >
          <table style={tableStyle}>
            <thead>
              <tr>
                <TableHead>
                  Codice articolo
                </TableHead>

                <TableHead>
                  Codice scanner
                </TableHead>

                <TableHead>
                  Descrizione
                </TableHead>

                <TableHead align="right">
                  Ordinato
                </TableHead>

                <TableHead align="right">
                  Già ricevuto
                </TableHead>

                <TableHead align="right">
                  Da ricevere
                </TableHead>

                <TableHead align="right">
                  Giacenza
                </TableHead>

                {canViewPrices && (
                  <TableHead align="right">
                    Prezzo
                  </TableHead>
                )}

                {canManageOrders && (
                  <TableHead align="right">
                    Arrivato ora
                  </TableHead>
                )}
              </tr>
            </thead>

            <tbody>
              {lines.map(
                (line) => (
                  <tr
                    key={line.id}
                    style={{
                      borderTop:
                        "1px solid var(--border-color)",
                    }}
                  >
                    <TableCell>
                      <strong>
                        {line.supplier_code ||
                          "-"}
                      </strong>
                    </TableCell>

                    <TableCell>
                      {line.code}
                    </TableCell>

                    <TableCell>
                      {line.description}
                      {line.requested_delivery_date && (
                        <div
                          style={{
                            marginTop: 3,
                            fontSize: 11,
                            opacity: 0.55,
                          }}
                        >
                          Consegna richiesta:{" "}
                          {formatDate(
                            line.requested_delivery_date
                          )}
                        </div>
                      )}
                    </TableCell>

                    <TableCell align="right">
                      {line.qty}
                    </TableCell>

                    <TableCell align="right">
                      {
                        line.received_qty
                      }
                    </TableCell>

                    <TableCell align="right">
                      <strong>
                        {
                          line.remaining_qty
                        }
                      </strong>
                    </TableCell>

                    <TableCell align="right">
                      {line.stock}
                    </TableCell>

                    {canViewPrices && (
                      <TableCell align="right">
                        {formatEuro(
                          line.unit_price
                        )}
                      </TableCell>
                    )}

                    {canManageOrders && (
                      <TableCell align="right">
                        {!canReceive ? (
                          <span
                            style={{
                              color:
                                isReceived
                                  ? "#22c55e"
                                  : "#ef4444",

                              fontWeight: 800,
                            }}
                          >
                            {isReceived
                              ? "Completo"
                              : "Annullato"}
                          </span>
                        ) : (
                          <input
                            type="number"
                            min="0"

                            max={
                              line.remaining_qty
                            }

                            step="1"

                            value={
                              incomingQty[
                                line.id
                              ] || 0
                            }

                            disabled={
                              line.remaining_qty ===
                                0 ||
                              saving
                            }

                            onChange={(
                              e
                            ) =>
                              changeIncomingQty(
                                line.id,
                                Number(
                                  e.target
                                    .value
                                )
                              )
                            }

                            style={{
                              width: 95,

                              padding:
                                "8px 9px",

                              border:
                                "1px solid var(--border-color)",

                              borderRadius: 7,

                              background:
                                "var(--input-bg)",

                              color:
                                "var(--foreground)",

                              textAlign:
                                "right",

                              fontWeight: 800,

                              opacity:
                                line.remaining_qty ===
                                  0 ||
                                saving
                                  ? 0.5
                                  : 1,
                            }}
                          />
                        )}
                      </TableCell>
                    )}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RICEZIONE */}

      {canReceive && (
        <div
          style={{
            marginTop: 22,
            padding: 20,

            border:
              "1px solid var(--border-color)",

            borderRadius: 12,

            background:
              "var(--card)",

            display: "flex",

            justifyContent:
              "space-between",

            alignItems: "center",

            gap: 20,

            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 850,
              }}
            >
              Ricezione merce
            </div>

            <div
              style={{
                marginTop: 5,

                fontSize: 13,

                opacity: 0.6,

                maxWidth: 700,
              }}
            >
              Se il DDT corrisponde completamente
              all&apos;ordine usa “Ordine completo”.
              Se manca qualcosa, inserisci le quantità
              realmente arrivate e registra
              l&apos;arrivo parziale.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"

              disabled={
                saving ||
                deleting
              }

              onClick={() =>
                registerArrival(
                  "partial"
                )
              }

              style={
                secondaryButtonStyle
              }
            >
              {saving
                ? "Salvataggio..."
                : "Registra arrivo parziale"}
            </button>

            <button
              type="button"

              disabled={
                saving ||
                deleting
              }

              onClick={() =>
                registerArrival(
                  "complete"
                )
              }

              style={primaryButtonStyle(
                saving ||
                  deleting
              )}
            >
              {saving
                ? "Salvataggio..."
                : "Ordine completo"}
            </button>
          </div>
        </div>
      )}

      {kitAssignmentSlots.length > 0 && (
        <div
          style={{
            marginTop: 22,
            padding: 20,
            border: "1px solid rgba(199,154,93,0.45)",
            borderRadius: 12,
            background: "rgba(199,154,93,0.08)",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 850 }}>
            Kit tappezzeria appena arrivati da assegnare
          </div>

          <div
            style={{
              marginTop: 5,
              fontSize: 13,
              opacity: 0.65,
              maxWidth: 820,
              lineHeight: 1.5,
            }}
          >
            Questi pezzi risultano arrivati e corrispondono a battelli
            ancora &quot;IN ORDINE&quot;. Inserisci matricola, codice
            scanner e prezzo di ciascun kit per segnarlo come consegnato:
            la richiesta del battello diventerà &quot;ASSEGNATA&quot;.
            Puoi anche ignorare un pezzo: resta in giacenza generica,
            assegnabile più tardi dalla scheda Tappezzeria.
          </div>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {kitAssignmentSlots.map((slot) => (
              <div
                key={slot.key}
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  padding: 14,
                  background: "var(--card)",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 14,
                  alignItems: "flex-end",
                }}
              >
                <div style={{ minWidth: 220 }}>
                  <div
                    style={{
                      fontSize: 11,
                      opacity: 0.55,
                      fontWeight: 700,
                    }}
                  >
                    BATTELLO
                  </div>

                  <div style={{ fontWeight: 850, fontSize: 15 }}>
                    {slot.requirement.boatMatricola}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.65,
                      marginTop: 2,
                    }}
                  >
                    {slot.requirement.color} ·{" "}
                    {slot.requirement.detailsLogos} ·{" "}
                    {slot.requirement.stitching} ·{" "}
                    {slot.requirement.quilting}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 11,
                      opacity: 0.55,
                      fontWeight: 700,
                      marginBottom: 4,
                    }}
                  >
                    MATRICOLA KIT
                  </div>

                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={slot.matricola}
                    disabled={assigningKits}
                    onChange={(e) =>
                      updateKitSlot(slot.key, "matricola", e.target.value)
                    }
                    style={smallInputStyle}
                  />
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 11,
                      opacity: 0.55,
                      fontWeight: 700,
                      marginBottom: 4,
                    }}
                  >
                    CODICE SCANNER
                  </div>

                  <input
                    type="text"
                    value={slot.scannerCode}
                    disabled={assigningKits}
                    onChange={(e) =>
                      updateKitSlot(slot.key, "scannerCode", e.target.value)
                    }
                    style={smallInputStyle}
                  />
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 11,
                      opacity: 0.55,
                      fontWeight: 700,
                      marginBottom: 4,
                    }}
                  >
                    PREZZO €
                  </div>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={slot.unitPrice}
                    disabled={assigningKits}
                    onChange={(e) =>
                      updateKitSlot(slot.key, "unitPrice", e.target.value)
                    }
                    style={smallInputStyle}
                  />
                </div>

                <button
                  type="button"
                  disabled={assigningKits}
                  onClick={() => dismissKitSlot(slot.key)}
                  style={{
                    ...secondaryButtonStyle,
                    padding: "9px 12px",
                    fontSize: 12,
                    opacity: assigningKits ? 0.5 : 1,
                  }}
                >
                  Ignora
                </button>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              disabled={assigningKits}
              onClick={dismissAllKitSlots}
              style={secondaryButtonStyle}
            >
              Ignora tutti
            </button>

            <button
              type="button"
              disabled={assigningKits}
              onClick={confirmKitAssignments}
              style={primaryButtonStyle(assigningKits)}
            >
              {assigningKits ? "Salvataggio..." : "Crea e assegna kit"}
            </button>
          </div>
        </div>
      )}

      {canManageOrders && (
        <div
          style={{
            marginTop: 22,
            padding: 20,
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            background: "var(--card)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 850 }}>DDT</div>

            <button
              type="button"
              onClick={openAddShipment}
              style={secondaryButtonStyle}
            >
              {showAddShipment ? "Chiudi" : "+ Aggiungi DDT"}
            </button>
          </div>

          {showAddShipment && (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 10,
                background: "var(--input-bg)",
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "flex-end",
              }}
            >
              <div>
                <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
                  Numero DDT
                </div>
                <input
                  value={shipmentDraft.ddt_number}
                  onChange={(e) =>
                    setShipmentDraft((prev) => ({
                      ...prev,
                      ddt_number: e.target.value,
                    }))
                  }
                  style={smallInputStyle}
                />
              </div>

              <div>
                <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
                  Data DDT
                </div>
                <input
                  type="date"
                  value={shipmentDraft.ddt_date}
                  onChange={(e) =>
                    setShipmentDraft((prev) => ({
                      ...prev,
                      ddt_date: e.target.value,
                    }))
                  }
                  style={smallInputStyle}
                />
              </div>

              <div>
                <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
                  Codice archivio
                </div>
                <input
                  value={shipmentDraft.archive_code}
                  onChange={(e) =>
                    setShipmentDraft((prev) => ({
                      ...prev,
                      archive_code: e.target.value,
                    }))
                  }
                  style={smallInputStyle}
                />
              </div>

              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
                  Nota (opzionale)
                </div>
                <input
                  value={shipmentDraft.note}
                  onChange={(e) =>
                    setShipmentDraft((prev) => ({
                      ...prev,
                      note: e.target.value,
                    }))
                  }
                  style={{ ...smallInputStyle, width: "100%" }}
                />
              </div>

              <div style={{ width: "100%", marginTop: 6 }}>
                <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>
                  Aggiungi un altro ordine allo stesso DDT
                </div>

                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      addOrderToShipmentDraft(e.target.value);
                    }
                  }}
                  style={{ ...smallInputStyle, width: 240 }}
                >
                  <option value="">-- Seleziona ordine --</option>
                  {supplierOrderOptions
                    .filter(
                      (option) =>
                        !shipmentAddedOrderIds.includes(option.order_id)
                    )
                    .map((option) => (
                      <option key={option.order_id} value={option.order_id}>
                        Ordine N. {option.order_number || "-"}
                      </option>
                    ))}
                </select>

                {shipmentAddedOrderIds.map((orderIdInDraft) => {
                  const orderOption = supplierOrderOptions.find(
                    (option) => option.order_id === orderIdInDraft
                  );
                  const orderNumber = orderOption?.order_number || null;
                  const orderItems = orderItemsCache[orderIdInDraft] || [];

                  return (
                    <div
                      key={orderIdInDraft}
                      style={{
                        marginTop: 12,
                        padding: 10,
                        borderRadius: 8,
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 800 }}>
                          Ordine N. {orderNumber || "-"}
                          {orderIdInDraft === orderId ? " (questo ordine)" : ""}
                        </div>

                        {orderIdInDraft !== orderId && (
                          <button
                            type="button"
                            onClick={() =>
                              removeOrderFromShipmentDraft(orderIdInDraft)
                            }
                            style={{
                              border: "none",
                              background: "none",
                              color: "#ef4444",
                              cursor: "pointer",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            Rimuovi
                          </button>
                        )}
                      </div>

                      <div style={{ marginTop: 8 }}>
                        {orderItems.length === 0 && (
                          <div style={{ fontSize: 13, opacity: 0.6 }}>
                            Nessun articolo in questo ordine.
                          </div>
                        )}

                        {orderItems.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              fontSize: 13,
                              padding: "4px 0",
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              {item.supplier_code || item.code} ·{" "}
                              {item.description} · ricevuti{" "}
                              {item.received_qty}/{item.qty}
                            </div>

                            <input
                              type="number"
                              min="0"
                              value={shipmentItemQty[item.id] ?? ""}
                              onChange={(e) =>
                                setShipmentItemQty((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              placeholder="0"
                              style={{ ...smallInputStyle, width: 80 }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ width: "100%", marginTop: 6 }}>
                <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>
                  PDF scansione DDT originale (opzionale)
                </div>

                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) =>
                    setShipmentPdfFile(e.target.files?.[0] || null)
                  }
                  style={{ fontSize: 13 }}
                />
              </div>

              <button
                type="button"
                onClick={addShipment}
                disabled={shipmentSaving}
                style={primaryButtonStyle(shipmentSaving)}
              >
                {shipmentSaving ? "Salvo..." : "Salva"}
              </button>

              {shipmentMessage && (
                <div style={{ width: "100%", fontSize: 13, color: "#ef4444" }}>
                  {shipmentMessage}
                </div>
              )}
            </div>
          )}

          {!shipmentsLoading && relevantShipments.length === 0 && (
            <div style={{ marginTop: 12, fontSize: 13, opacity: 0.6 }}>
              Nessun DDT registrato per questo ordine.
            </div>
          )}

          {relevantShipments.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {relevantShipments.map((shipment) => (
                <div
                  key={shipment.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "10px 0",
                    borderTop: "1px solid var(--border-color)",
                    fontSize: 13,
                  }}
                >
                  <div>
                    <strong>DDT {shipment.ddt_number}</strong>{" "}
                    <span style={{ opacity: 0.6 }}>
                      · {shipment.ddt_date}
                      {shipment.archive_code
                        ? ` · archivio ${shipment.archive_code}`
                        : ""}
                      {shipment.note ? ` · ${shipment.note}` : ""}
                    </span>

                    {shipment.items.length > 0 && (
                      <div style={{ marginTop: 4, opacity: 0.6 }}>
                        Articoli:{" "}
                        {shipment.items
                          .map(
                            (item) =>
                              `${item.supplier_code || item.code}${
                                item.order_number &&
                                item.order_id !== orderId
                                  ? ` (ordine ${item.order_number})`
                                  : ""
                              } · ${item.qty_arrived}`
                          )
                          .join(", ")}
                      </div>
                    )}

                    <div style={{ marginTop: 6 }}>
                      {shipment.scan_pdf_url ? (
                        <a
                          href={shipment.scan_pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "inherit", fontWeight: 700 }}
                        >
                          📄 Vedi PDF scansione
                        </a>
                      ) : (
                        <label style={{ cursor: "pointer", opacity: 0.75 }}>
                          {shipmentUploadingId === shipment.id
                            ? "Carico..."
                            : "+ Aggiungi PDF scansione"}
                          <input
                            type="file"
                            accept="application/pdf"
                            style={{ display: "none" }}
                            disabled={shipmentUploadingId === shipment.id}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) addPdfToShipment(shipment.id, file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteShipment(shipment.id)}
                    style={{
                      border: "none",
                      background: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    Elimina
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {canManageOrders && (
        <div
          style={{
            marginTop: 22,
            padding: 20,
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            background: "var(--card)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 850 }}>Fatture</div>

            <button
              type="button"
              onClick={openAddInvoice}
              style={secondaryButtonStyle}
            >
              {showAddInvoice ? "Chiudi" : "+ Registra fattura"}
            </button>
          </div>

          <div style={{ marginTop: 5, fontSize: 13, opacity: 0.6, maxWidth: 700 }}>
            Una fattura è collegata al fornitore e può coprire DDT di
            più ordini insieme: qui sotto trovi tutti i DDT del
            fornitore ancora da fatturare, non solo quelli di questo
            ordine.
          </div>

          {showAddInvoice && (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 10,
                background: "var(--input-bg)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  alignItems: "flex-end",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
                    Numero fattura
                  </div>
                  <input
                    value={invoiceDraft.invoice_number}
                    onChange={(e) =>
                      setInvoiceDraft((prev) => ({
                        ...prev,
                        invoice_number: e.target.value,
                      }))
                    }
                    style={smallInputStyle}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
                    Data fattura
                  </div>
                  <input
                    type="date"
                    value={invoiceDraft.invoice_date}
                    onChange={(e) =>
                      setInvoiceDraft((prev) => ({
                        ...prev,
                        invoice_date: e.target.value,
                      }))
                    }
                    style={smallInputStyle}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
                    Codice archivio
                  </div>
                  <input
                    value={invoiceDraft.archive_code}
                    onChange={(e) =>
                      setInvoiceDraft((prev) => ({
                        ...prev,
                        archive_code: e.target.value,
                      }))
                    }
                    style={smallInputStyle}
                  />
                </div>

                {canViewPrices && (
                  <div>
                    <div
                      style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}
                    >
                      Importo € (opzionale)
                    </div>
                    <input
                      type="number"
                      value={invoiceDraft.amount}
                      onChange={(e) =>
                        setInvoiceDraft((prev) => ({
                          ...prev,
                          amount: e.target.value,
                        }))
                      }
                      style={smallInputStyle}
                    />
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
                    Nota (opzionale)
                  </div>
                  <input
                    value={invoiceDraft.note}
                    onChange={(e) =>
                      setInvoiceDraft((prev) => ({
                        ...prev,
                        note: e.target.value,
                      }))
                    }
                    style={{ ...smallInputStyle, width: "100%" }}
                  />
                </div>
              </div>

              {shipments.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>
                    Carica da un DDT (opzionale)
                  </div>

                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        loadInvoiceFromShipment(e.target.value);
                      }
                    }}
                    style={{ ...smallInputStyle, width: 240 }}
                  >
                    <option value="">-- Seleziona DDT --</option>
                    {shipments.map((shipment) => (
                      <option key={shipment.id} value={shipment.id}>
                        DDT {shipment.ddt_number} · {shipment.ddt_date}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>
                  Aggiungi un altro ordine alla stessa fattura
                </div>

                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      addOrderToInvoiceDraft(e.target.value);
                    }
                  }}
                  style={{ ...smallInputStyle, width: 240 }}
                >
                  <option value="">-- Seleziona ordine --</option>
                  {supplierOrderOptions
                    .filter((order) => !addedOrderIds.includes(order.order_id))
                    .map((order) => (
                      <option key={order.order_id} value={order.order_id}>
                        Ordine N. {order.order_number || "-"}
                      </option>
                    ))}
                </select>

                {addedOrderIds.length === 0 && (
                  <div style={{ marginTop: 10, fontSize: 13, opacity: 0.6 }}>
                    Nessun ordine trovato per questo fornitore.
                  </div>
                )}

                {addedOrderIds.map((orderIdInDraft) => {
                  const orderOption = supplierOrderOptions.find(
                    (option) => option.order_id === orderIdInDraft
                  );
                  const orderNumber = orderOption?.order_number || null;
                  const orderItems = orderItemsCache[orderIdInDraft] || [];

                  return (
                    <div
                      key={orderIdInDraft}
                      style={{
                        marginTop: 12,
                        padding: 10,
                        borderRadius: 8,
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 800 }}>
                          Ordine N. {orderNumber || "-"}
                          {orderIdInDraft === orderId
                            ? " (questo ordine)"
                            : ""}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            removeOrderFromInvoiceDraft(orderIdInDraft)
                          }
                          style={{
                            border: "none",
                            background: "none",
                            color: "#ef4444",
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          Rimuovi
                        </button>
                      </div>

                      <div style={{ marginTop: 8 }}>
                        {orderItems.length === 0 && (
                          <div style={{ fontSize: 13, opacity: 0.6 }}>
                            Nessun articolo in questo ordine.
                          </div>
                        )}

                        {orderItems.map((item) => (
                          <label
                            key={item.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              fontSize: 13,
                              padding: "4px 0",
                              cursor: item.invoiced ? "default" : "pointer",
                              opacity: item.invoiced ? 0.45 : 1,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedItemIds.includes(item.id)}
                              disabled={item.invoiced}
                              onChange={() => toggleItemSelection(item.id)}
                            />
                            {item.supplier_code || item.code} ·{" "}
                            {item.description} · ricevuti{" "}
                            {item.received_qty}/{item.qty}
                            {item.invoiced
                              ? " (già in un'altra fattura)"
                              : ""}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  onClick={addInvoice}
                  disabled={invoiceSaving}
                  style={primaryButtonStyle(invoiceSaving)}
                >
                  {invoiceSaving ? "Salvo..." : "Salva"}
                </button>

                {invoiceMessage && (
                  <div
                    style={{ marginTop: 8, fontSize: 13, color: "#ef4444" }}
                  >
                    {invoiceMessage}
                  </div>
                )}
              </div>
            </div>
          )}

          {!invoicesLoading && relevantInvoices.length === 0 && (
            <div style={{ marginTop: 12, fontSize: 13, opacity: 0.6 }}>
              Nessuna fattura registrata per questo ordine.
            </div>
          )}

          {relevantInvoices.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {relevantInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "8px 0",
                    borderTop: "1px solid var(--border-color)",
                    fontSize: 13,
                  }}
                >
                  <div>
                    <strong>Fattura {invoice.invoice_number}</strong>{" "}
                    <span style={{ opacity: 0.6 }}>
                      · {invoice.invoice_date}
                      {invoice.archive_code
                        ? ` · archivio ${invoice.archive_code}`
                        : ""}
                      {canViewPrices && invoice.amount !== null
                        ? ` · ${invoice.amount.toFixed(2)} €`
                        : ""}
                    </span>

                    {invoice.items.length > 0 && (
                      <div style={{ marginTop: 4, opacity: 0.6 }}>
                        Articoli:{" "}
                        {invoice.items
                          .map(
                            (item) =>
                              `${item.supplier_code || item.code}${
                                item.order_number
                                  ? ` (ordine ${item.order_number})`
                                  : ""
                              }`
                          )
                          .join(", ")}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteInvoice(invoice.id)}
                    style={{
                      border: "none",
                      background: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    Elimina
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!canManageOrders && (
        <div
          style={{
            marginTop: 22,
            padding: 18,
            border:
              "1px solid rgba(59,130,246,0.30)",
            borderRadius: 12,
            background:
              "rgba(59,130,246,0.08)",
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          <strong>
            Vista merce in arrivo
          </strong>

          <div
            style={{
              marginTop: 4,
              opacity: 0.7,
            }}
          >
            Puoi consultare articoli e quantità
            ancora da ricevere. La registrazione
            degli arrivi e la gestione
            dell&apos;ordine sono riservate agli
            utenti autorizzati.
          </div>
        </div>
      )}

      {/* ORDINE RICEVUTO */}

      {isReceived && (
        <div
          style={{
            marginTop: 22,

            padding: 22,

            border:
              "1px solid rgba(34,197,94,0.35)",

            borderRadius: 12,

            background:
              "rgba(34,197,94,0.08)",
          }}
        >
          <div
            style={{
              fontSize: 18,

              fontWeight: 850,

              color: "#22c55e",
            }}
          >
            ✓ Ordine completamente ricevuto
          </div>

          <div
            style={{
              marginTop: 5,
              fontSize: 13,
              opacity: 0.7,
            }}
          >
            Tutte le quantità dell&apos;ordine risultano
            entrate in magazzino.
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- COMPONENTI ---------------- */

function StatusBadge({
  status,
}: {
  status: string;
}) {
  let label = "IN ORDINE";
  let color = "#3b82f6";

  let background =
    "rgba(59,130,246,0.12)";

  let border =
    "1px solid rgba(59,130,246,0.35)";

  if (status === "draft") {
    label = "BOZZA";
    color = "#9ca3af";

    background =
      "rgba(156,163,175,0.12)";

    border =
      "1px solid rgba(156,163,175,0.35)";
  }

  if (status === "partial") {
    label = "PARZIALE";
    color = "#f59e0b";

    background =
      "rgba(245,158,11,0.12)";

    border =
      "1px solid rgba(245,158,11,0.35)";
  }

  if (status === "received") {
    label = "RICEVUTO";
    color = "#22c55e";

    background =
      "rgba(34,197,94,0.12)";

    border =
      "1px solid rgba(34,197,94,0.35)";
  }

  if (status === "cancelled") {
    label = "ANNULLATO";
    color = "#ef4444";

    background =
      "rgba(239,68,68,0.12)";

    border =
      "1px solid rgba(239,68,68,0.35)";
  }

  return (
    <span
      style={{
        padding:
          "5px 9px",

        borderRadius: 20,

        background,
        border,
        color,

        fontSize: 11,
        fontWeight: 850,
      }}
    >
      {label}
    </span>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        padding: 18,

        border:
          "1px solid var(--border-color)",

        borderRadius: 12,

        background:
          "var(--card)",
      }}
    >
      <div
        style={{
          fontSize: 11,

          opacity: 0.55,

          textTransform:
            "uppercase",

          letterSpacing: 0.8,

          fontWeight: 700,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: 27,
          fontWeight: 850,
          marginTop: 7,
        }}
      >
        {value}
      </div>

      <div
        style={{
          fontSize: 12,
          opacity: 0.55,
          marginTop: 4,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

function TableHead({
  children,
  align = "left",
}: {
  children: React.ReactNode;

  align?:
    | "left"
    | "right";
}) {
  return (
    <th
      style={{
        padding:
          "11px 12px",

        textAlign: align,

        fontSize: 10,

        textTransform:
          "uppercase",

        letterSpacing: 0.5,

        opacity: 0.6,

        fontWeight: 800,

        whiteSpace:
          "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function TableCell({
  children,
  align = "left",
}: {
  children: React.ReactNode;

  align?:
    | "left"
    | "right";
}) {
  return (
    <td
      style={{
        padding: "12px",

        textAlign: align,

        fontSize: 13,

        verticalAlign:
          "middle",
      }}
    >
      {children}
    </td>
  );
}

/* ---------------- FORMATI ---------------- */

function formatEuro(
  value: number
) {
  return new Intl.NumberFormat(
    "it-IT",
    {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }
  ).format(
    Number(value || 0)
  );
}

function formatDate(
  value: string | null
) {
  if (!value) return "-";

  const safeValue =
    value.includes("T")
      ? value
      : `${value}T00:00:00`;

  return new Intl.DateTimeFormat(
    "it-IT"
  ).format(
    new Date(safeValue)
  );
}

/* ---------------- STILI ---------------- */

const cardStyle = {
  border:
    "1px solid var(--border-color)",

  borderRadius: 12,

  overflow: "hidden",

  background:
    "var(--card)",
};

const tableStyle = {
  width: "100%",

  minWidth: 1100,

  borderCollapse:
    "collapse" as const,
};

const secondaryButtonStyle = {
  display: "inline-block",

  padding:
    "10px 14px",

  borderRadius: 8,

  border:
    "1px solid var(--border-color)",

  background:
    "var(--input-bg)",

  color:
    "var(--foreground)",

  cursor: "pointer",

  fontWeight: 800,

  textDecoration:
    "none",
};

const smallInputStyle = {
  width: 120,

  padding:
    "8px 9px",

  border:
    "1px solid var(--border-color)",

  borderRadius: 7,

  background:
    "var(--input-bg)",

  color:
    "var(--foreground)",

  fontWeight: 700,
};

function primaryButtonStyle(
  disabled: boolean
) {
  return {
    padding:
      "11px 17px",

    borderRadius: 8,

    border: disabled
      ? "1px solid var(--border-color)"
      : "1px solid var(--foreground)",

    background: disabled
      ? "var(--card-2)"
      : "var(--foreground)",

    color: disabled
      ? "var(--foreground)"
      : "var(--background)",

    cursor: disabled
      ? "not-allowed"
      : "pointer",

    fontWeight: 850,

    opacity:
      disabled
        ? 0.5
        : 1,
  };
}