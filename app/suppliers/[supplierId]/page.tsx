"use client";

import React, { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import jsPDF from "jspdf";
import { supabase } from "../../../lib/supabaseClient";
import { fetchCompanyLogo, drawCompanyLogoTopRight } from "../../../lib/pdfLogo";

type Item = {
  id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  stock: number;
  min_stock: number;
  price: number;
  on_order: number;
  image_url: string | null;
};

type WarehouseSort =
  | "supplier_code"
  | "description"
  | "stock";

type UserPermissions = {
  view_prices?: boolean;
  view_inventory_value?: boolean;
  [key: string]: boolean | undefined;
};

type UpholsteryOptionType =
  | "color"
  | "details_logos"
  | "stitching"
  | "quilting";

type UpholsteryOption = {
  id: string;
  option_type: UpholsteryOptionType;
  name: string;
};

type UpholsteryOptionGroups = {
  color: UpholsteryOption[];
  details_logos: UpholsteryOption[];
  stitching: UpholsteryOption[];
  quilting: UpholsteryOption[];
};

type KitDraft = {
  matricola: string;
  scannerCode: string;
  unitPrice: string;
  color: string;
  detailsLogos: string;
  stitching: string;
  quilting: string;
  note: string;
  boatUpholsteryId: string;
};

type OpenBoatRequest = {
  id: string;
  itemId: string;
  boatOrderNumber: string;
  boatModel: string;
  color: string;
};

const EMPTY_UPHOLSTERY_GROUPS: UpholsteryOptionGroups = {
  color: [],
  details_logos: [],
  stitching: [],
  quilting: [],
};

const EMPTY_KIT_DRAFT: KitDraft = {
  matricola: "",
  scannerCode: "",
  unitPrice: "",
  color: "",
  detailsLogos: "",
  stitching: "",
  quilting: "",
  note: "",
  boatUpholsteryId: "",
};

export default function SupplierDetail({
  params,
}: {
  params: Promise<{ supplierId: string }> | { supplierId: string };
}) {
  const resolvedParams =
    typeof (params as any)?.then === "function"
      ? use(params as Promise<{ supplierId: string }>)
      : (params as { supplierId: string });

  const supplierId = resolvedParams.supplierId;

  const [supplierName, setSupplierName] = useState("Fornitore");
  const [upholsteryEnabled, setUpholsteryEnabled] =
    useState(false);
  const [windshieldEnabled, setWindshieldEnabled] =
    useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  const [warehouseSort, setWarehouseSort] =
    useState<WarehouseSort>("supplier_code");

  const [canViewPrices, setCanViewPrices] =
    useState(false);

  const [
    canViewInventoryValue,
    setCanViewInventoryValue,
  ] = useState(false);

  const [permissionsReady, setPermissionsReady] =
    useState(false);

  const [upholsteryOptions, setUpholsteryOptions] =
    useState<UpholsteryOptionGroups>(EMPTY_UPHOLSTERY_GROUPS);

  const [openKitItemId, setOpenKitItemId] = useState("");
  const [kitDraft, setKitDraft] = useState<KitDraft>(EMPTY_KIT_DRAFT);
  const [kitSaving, setKitSaving] = useState(false);
  const [kitMessage, setKitMessage] = useState("");
  const [kitError, setKitError] = useState("");

  const [openBoatRequests, setOpenBoatRequests] = useState<
    OpenBoatRequest[]
  >([]);

  const [companyLogo, setCompanyLogo] = useState("");

  const [leadTimeStats, setLeadTimeStats] =
    useState<{ avgDays: number; count: number } | null>(null);

  useEffect(() => {
    fetchCompanyLogo().then(setCompanyLogo);
  }, []);

  /*
    PERMESSI ECONOMICI

    - view_prices:
      mostra il prezzo unitario.

    - view_inventory_value:
      mostra i valori economici della giacenza
      e della merce in ordine.

    L'account admin mantiene accesso completo.
  */
  useEffect(() => {
    const role =
      localStorage.getItem("magazzino_role");

    let permissions: UserPermissions = {};

    try {
      const saved =
        localStorage.getItem("magazzino_permissions");

      permissions = saved
        ? JSON.parse(saved)
        : {};
    } catch {
      permissions = {};
    }

    const isAdmin = role === "admin";

    setCanViewPrices(
      isAdmin ||
        permissions.view_prices === true
    );

    setCanViewInventoryValue(
      isAdmin ||
        permissions.view_inventory_value === true
    );

    setPermissionsReady(true);
  }, []);

  useEffect(() => {
    if (!permissionsReady) {
      return;
    }

    async function loadData() {
      setLoading(true);

      const { data: supplier } = await supabase
        .from("suppliers")
        .select("name,upholstery_enabled")
        .eq("id", supplierId)
        .maybeSingle();

      if (supplier?.name) {
        setSupplierName(supplier.name);
      }

      setUpholsteryEnabled(
        supplier?.upholstery_enabled === true
      );

      // Query separata e isolata: se la colonna windshield_enabled non
      // esiste ancora (STEP26 non ancora eseguito su Supabase), fallisce
      // da sola senza bloccare il resto della pagina.
      const { data: windshieldRow, error: windshieldError } =
        await supabase
          .from("suppliers")
          .select("windshield_enabled")
          .eq("id", supplierId)
          .maybeSingle();

      setWindshieldEnabled(
        !windshieldError &&
          windshieldRow?.windshield_enabled === true
      );

      /*
        TEMPI DI CONSEGNA (STEP 36)

        Query separata e isolata come quella sopra per
        windshield_enabled: se received_at non esiste ancora
        (STEP36 non ancora eseguito su Supabase) fallisce da sola
        senza bloccare il resto della pagina, e il pannello con i
        tempi di consegna semplicemente non compare.
      */
      const { data: deliveredOrders, error: deliveredOrdersError } =
        await supabase
          .from("orders")
          .select("order_date,received_at")
          .eq("supplier_id", supplierId)
          .eq("status", "received");

      if (!deliveredOrdersError && deliveredOrders) {
        const leadTimes = deliveredOrders
          .map((row: any) => {
            if (!row.order_date || !row.received_at) {
              return null;
            }

            const orderDate = new Date(row.order_date).getTime();
            const receivedDate = new Date(row.received_at).getTime();

            if (
              !Number.isFinite(orderDate) ||
              !Number.isFinite(receivedDate) ||
              receivedDate < orderDate
            ) {
              return null;
            }

            return (receivedDate - orderDate) / 86400000;
          })
          .filter((value): value is number => value !== null);

        setLeadTimeStats(
          leadTimes.length > 0
            ? {
                avgDays:
                  leadTimes.reduce((sum, value) => sum + value, 0) /
                  leadTimes.length,
                count: leadTimes.length,
              }
            : null
        );
      } else {
        setLeadTimeStats(null);
      }

      const shouldLoadPrice =
        canViewPrices ||
        canViewInventoryValue;

      let itemsData: Item[] = [];
      let itemsError:
        { message: string } | null = null;

      if (shouldLoadPrice) {
        const response = await supabase
          .from("items")
          .select(
            "id,code,supplier_code,description,stock,min_stock,price,on_order,image_url"
          )
          .eq(
            "supplier_id",
            supplierId
          )
          .order("description");

        itemsError = response.error;

        itemsData =
          (response.data || []).map(
            (item) => ({
              id:
                String(item.id),
              code:
                String(
                  item.code || ""
                ),
              supplier_code:
                item.supplier_code
                  ? String(
                      item.supplier_code
                    )
                  : null,
              description:
                String(
                  item.description || ""
                ),
              stock:
                Number(
                  item.stock || 0
                ),
              min_stock:
                Number(
                  item.min_stock || 0
                ),
              price:
                Number(
                  item.price || 0
                ),
              on_order:
                Number(
                  item.on_order || 0
                ),
              image_url:
                item.image_url
                  ? String(
                      item.image_url
                    )
                  : null,
            })
          );
      } else {
        const response = await supabase
          .from("items")
          .select(
            "id,code,supplier_code,description,stock,min_stock,on_order,image_url"
          )
          .eq(
            "supplier_id",
            supplierId
          )
          .order("description");

        itemsError = response.error;

        itemsData =
          (response.data || []).map(
            (item) => ({
              id:
                String(item.id),
              code:
                String(
                  item.code || ""
                ),
              supplier_code:
                item.supplier_code
                  ? String(
                      item.supplier_code
                    )
                  : null,
              description:
                String(
                  item.description || ""
                ),
              stock:
                Number(
                  item.stock || 0
                ),
              min_stock:
                Number(
                  item.min_stock || 0
                ),
              price: 0,
              on_order:
                Number(
                  item.on_order || 0
                ),
              image_url:
                item.image_url
                  ? String(
                      item.image_url
                    )
                  : null,
            })
          );
      }

      if (itemsError) {
        console.error(
          "Errore caricamento articoli:",
          itemsError.message
        );
      } else {
        setItems(itemsData);
      }

      setLoading(false);
    }

    loadData();
  }, [
    supplierId,
    permissionsReady,
    canViewPrices,
    canViewInventoryValue,
  ]);

  /*
    OPZIONI TAPPEZZERIA (colore, dettagli e loghi, cucitura,
    trapuntatura) per il "+ Registra kit" rapido da questa
    schermata, senza dover aprire Gestione Tappezzerie.
  */
  useEffect(() => {
    if (!upholsteryEnabled) {
      setUpholsteryOptions(EMPTY_UPHOLSTERY_GROUPS);
      return;
    }

    async function loadUpholsteryOptions() {
      const { data, error } = await supabase
        .from("upholstery_options")
        .select("id,option_type,name")
        .eq("supplier_id", supplierId)
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) return;

      const groups: UpholsteryOptionGroups = {
        color: [],
        details_logos: [],
        stitching: [],
        quilting: [],
      };

      for (const row of data || []) {
        const type = String((row as any).option_type) as UpholsteryOptionType;
        if (!groups[type]) continue;
        groups[type].push({
          id: String((row as any).id),
          option_type: type,
          name: String((row as any).name || ""),
        });
      }

      setUpholsteryOptions(groups);
    }

    loadUpholsteryOptions();
  }, [supplierId, upholsteryEnabled]);

  /*
    RICHIESTE APERTE DEI BATTELLI (tappezzeria ancora senza
    kit assegnato): usate nel "+ Registra kit" per collegare
    subito il kit appena creato a un battello in attesa,
    invece di lasciarlo semplicemente in giacenza.
  */
  useEffect(() => {
    if (!upholsteryEnabled) {
      setOpenBoatRequests([]);
      return;
    }

    async function loadOpenBoatRequests() {
      const { data, error } = await supabase
        .from("production_boat_upholstery")
        .select("id,item_id,color,production_boats(order_number,model_boat)")
        .eq("supplier_id", supplierId)
        .is("kit_id", null);

      if (error) return;

      setOpenBoatRequests(
        (data || []).map((row: any) => ({
          id: String(row.id),
          itemId: String(row.item_id),
          boatOrderNumber: String(row.production_boats?.order_number || "?"),
          boatModel: String(row.production_boats?.model_boat || ""),
          color: String(row.color || ""),
        }))
      );
    }

    loadOpenBoatRequests();
  }, [supplierId, upholsteryEnabled]);

  function boatRequestsFor(itemId: string) {
    return openBoatRequests.filter(
      (request) => request.itemId === itemId
    );
  }

  async function openKitEditor(item: Item) {
    setOpenKitItemId(item.id);
    setKitMessage("");
    setKitError("");
    setKitDraft({
      matricola: "",
      scannerCode: item.code,
      unitPrice: item.price > 0 ? String(item.price) : "",
      color: upholsteryOptions.color[0]?.name || "",
      detailsLogos: upholsteryOptions.details_logos[0]?.name || "",
      stitching: upholsteryOptions.stitching[0]?.name || "",
      quilting: upholsteryOptions.quilting[0]?.name || "",
      note: "",
      boatUpholsteryId: "",
    });

    const { data, error } = await supabase.rpc(
      "next_upholstery_matricola",
      { p_supplier_id: supplierId }
    );

    if (!error && data !== null && data !== undefined) {
      setKitDraft((current) => ({ ...current, matricola: String(data) }));
    }
  }

  function closeKitEditor() {
    setOpenKitItemId("");
    setKitMessage("");
    setKitError("");
  }

  function hasUpholsteryChoices() {
    return (
      upholsteryOptions.color.length > 0 &&
      upholsteryOptions.details_logos.length > 0 &&
      upholsteryOptions.stitching.length > 0 &&
      upholsteryOptions.quilting.length > 0
    );
  }

  async function saveKit(item: Item) {
    setKitMessage("");
    setKitError("");

    const matricolaNumber = Number(kitDraft.matricola);

    if (
      !Number.isInteger(matricolaNumber) ||
      matricolaNumber < 1 ||
      matricolaNumber > 10000
    ) {
      setKitError("La Matricola Kit deve essere un numero da 1 a 10000.");
      return;
    }

    if (!kitDraft.scannerCode.trim()) {
      setKitError("Inserisci il Codice scanner.");
      return;
    }

    const priceNumber = Number(
      kitDraft.unitPrice.trim().replace(",", ".")
    );

    if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
      setKitError("Inserisci il prezzo del kit, maggiore di zero.");
      return;
    }

    if (
      !kitDraft.color ||
      !kitDraft.detailsLogos ||
      !kitDraft.stitching ||
      !kitDraft.quilting
    ) {
      setKitError("Seleziona Colore, Dettagli e loghi, Cucitura e Trapuntatura.");
      return;
    }

    setKitSaving(true);

    const { error } = await supabase.rpc("create_upholstery_stock_kit", {
      p_supplier_id: supplierId,
      p_item_id: item.id,
      p_matricola: matricolaNumber,
      p_scanner_code: kitDraft.scannerCode.trim(),
      p_unit_price: priceNumber,
      p_color: kitDraft.color,
      p_details_logos: kitDraft.detailsLogos,
      p_stitching: kitDraft.stitching,
      p_quilting: kitDraft.quilting,
      p_note: kitDraft.note.trim() || null,
    });

    if (error) {
      const lower = error.message.toLowerCase();

      if (
        lower.includes("matricola") ||
        lower.includes("duplicate") ||
        lower.includes("unique")
      ) {
        setKitError(
          "Questa Matricola Kit è già utilizzata. Verrà proposto un altro numero."
        );
      } else {
        setKitError("Errore inserimento kit: " + error.message);
      }

      const { data: retryMatricola } = await supabase.rpc(
        "next_upholstery_matricola",
        { p_supplier_id: supplierId }
      );

      if (retryMatricola !== null && retryMatricola !== undefined) {
        setKitDraft((current) => ({
          ...current,
          matricola: String(retryMatricola),
        }));
      }

      setKitSaving(false);
      return;
    }

    setItems((current) =>
      current.map((row) =>
        row.id === item.id ? { ...row, stock: row.stock + 1 } : row
      )
    );

    let assignedBoatLabel = "";

    if (kitDraft.boatUpholsteryId) {
      const { data: createdKit } = await supabase
        .from("upholstery_kits")
        .select("id")
        .eq("supplier_id", supplierId)
        .eq("matricola", matricolaNumber)
        .maybeSingle();

      if (createdKit?.id) {
        const { error: assignError } = await supabase.rpc(
          "assign_upholstery_kit_to_boat",
          {
            p_kit_id: createdKit.id,
            p_boat_upholstery_id: kitDraft.boatUpholsteryId,
          }
        );

        if (!assignError) {
          setItems((current) =>
            current.map((row) =>
              row.id === item.id
                ? { ...row, stock: row.stock - 1 }
                : row
            )
          );

          const matchedRequest = openBoatRequests.find(
            (request) => request.id === kitDraft.boatUpholsteryId
          );

          assignedBoatLabel = matchedRequest
            ? ` Assegnato subito al battello N. ${matchedRequest.boatOrderNumber}.`
            : " Assegnato subito al battello selezionato.";

          setOpenBoatRequests((current) =>
            current.filter(
              (request) => request.id !== kitDraft.boatUpholsteryId
            )
          );
        } else {
          assignedBoatLabel =
            " Il kit è stato creato ma l'assegnazione al battello non è riuscita: puoi assegnarlo manualmente dalla scheda del battello.";
        }
      }
    } else {
      // Nessuna scelta manuale: assegna in automatico al battello in
      // attesa con la consegna richiesta più vicina (se ce n'è uno),
      // liberando un'eventuale riga d'ordine già prenotata per quel
      // battello e ridandola in automatico al battello successivo.
      const { data: createdKit } = await supabase
        .from("upholstery_kits")
        .select("id")
        .eq("supplier_id", supplierId)
        .eq("matricola", matricolaNumber)
        .maybeSingle();

      if (createdKit?.id) {
        const { data: assignedRequestId, error: priorityError } =
          await supabase.rpc("assign_stock_kit_by_priority", {
            p_kit_id: createdKit.id,
          });

        if (!priorityError && assignedRequestId) {
          setItems((current) =>
            current.map((row) =>
              row.id === item.id
                ? { ...row, stock: row.stock - 1 }
                : row
            )
          );

          const matchedRequest = openBoatRequests.find(
            (request) => request.id === assignedRequestId
          );

          assignedBoatLabel = matchedRequest
            ? ` Assegnato in automatico al battello N. ${matchedRequest.boatOrderNumber} (consegna più vicina).`
            : " Assegnato in automatico al battello con la consegna più vicina.";

          setOpenBoatRequests((current) =>
            current.filter(
              (request) => request.id !== assignedRequestId
            )
          );
        }
      }
    }

    setKitMessage(
      `Kit #${matricolaNumber} inserito in giacenza. Giacenza articolo aumentata di 1.${assignedBoatLabel}`
    );

    setKitDraft((current) => ({
      ...current,
      unitPrice: "",
      note: "",
      boatUpholsteryId: "",
    }));

    const { data: nextMatricola } = await supabase.rpc(
      "next_upholstery_matricola",
      { p_supplier_id: supplierId }
    );

    if (nextMatricola !== null && nextMatricola !== undefined) {
      setKitDraft((current) => ({
        ...current,
        matricola: String(nextMatricola),
      }));
    }

    setKitSaving(false);
  }

  function isLowStock(item: Item) {
    return item.min_stock > 0 && item.stock <= item.min_stock;
  }

  const totals = useMemo(() => {
    const totalMagazzino = items.reduce(
      (sum, item) => sum + item.stock * item.price,
      0
    );

    const totalOrdine = items.reduce(
      (sum, item) => sum + item.on_order * item.price,
      0
    );

    const lowStock = items.filter(isLowStock).length;

    return {
      totalMagazzino,
      totalOrdine,
      lowStock,
      totalItems: items.length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const text = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesSearch =
        !text ||
        item.description?.toLowerCase().includes(text) ||
        item.code?.toLowerCase().includes(text) ||
        item.supplier_code?.toLowerCase().includes(text);

      const matchesLowStock =
        !onlyLowStock || isLowStock(item);

      return matchesSearch && matchesLowStock;
    });
  }, [items, search, onlyLowStock]);

  const tableColumnCount =
    6 +
    (canViewPrices ? 1 : 0) +
    (canViewInventoryValue ? 1 : 0) +
    (upholsteryEnabled ? 1 : 0);

  function getPdfDate() {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date());
  }

  function safeFileName(value: string) {
    return value
      .trim()
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "_");
  }

  function formatPdfEuro(value: number) {
    return (
      new Intl.NumberFormat("it-IT", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(value || 0)) + " EUR"
    );
  }

  function drawPdfHeader(
    doc: jsPDF,
    title: string,
    subtitle: string
  ) {
    drawCompanyLogoTopRight(doc, companyLogo);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);

    doc.text(title, 14, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    doc.text(subtitle, 14, 23);
    doc.text(`Data: ${getPdfDate()}`, 14, 28);

    doc.setDrawColor(180);
    doc.line(14, 32, 283, 32);
  }

  /*
    ORDINAMENTO NATURALE.

    Serve per evitare ordinamenti tipo:

    1
    10
    100
    2
    20

    e ottenere invece:

    1
    2
    10
    20
    100
  */
  const naturalCollator = new Intl.Collator("it", {
    numeric: true,
    sensitivity: "base",
  });

  function compareSupplierCode(a: Item, b: Item) {
    const codeA = (a.supplier_code || "").trim();
    const codeB = (b.supplier_code || "").trim();

    /*
      Se manca il codice articolo,
      lo mettiamo alla fine.
    */
    if (!codeA && codeB) return 1;
    if (codeA && !codeB) return -1;

    const comparison = naturalCollator.compare(
      codeA,
      codeB
    );

    if (comparison !== 0) {
      return comparison;
    }

    return naturalCollator.compare(
      a.description || "",
      b.description || ""
    );
  }

  function getWarehouseSortedItems() {
    const sorted = [...items];

    if (warehouseSort === "supplier_code") {
      sorted.sort(compareSupplierCode);
    }

    if (warehouseSort === "description") {
      sorted.sort((a, b) => {
        const comparison = naturalCollator.compare(
          a.description || "",
          b.description || ""
        );

        if (comparison !== 0) {
          return comparison;
        }

        return compareSupplierCode(a, b);
      });
    }

    if (warehouseSort === "stock") {
      sorted.sort((a, b) => {
        const stockComparison =
          Number(a.stock || 0) - Number(b.stock || 0);

        if (stockComparison !== 0) {
          return stockComparison;
        }

        return compareSupplierCode(a, b);
      });
    }

    return sorted;
  }

  function getWarehouseSortLabel() {
    if (warehouseSort === "description") {
      return "Descrizione A-Z";
    }

    if (warehouseSort === "stock") {
      return "Giacenza crescente";
    }

    return "Codice articolo crescente";
  }

  function generateDetailedPdf() {
    if (
      !canViewPrices &&
      !canViewInventoryValue
    ) {
      alert(
        "Il tuo account non ha accesso ai dati economici."
      );
      return;
    }

    if (items.length === 0) {
      alert("Non ci sono articoli da stampare.");
      return;
    }

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 10;

    const columns = [
      { label: "Codice articolo", width: 30 },
      { label: "Codice scanner", width: 34 },
      { label: "Descrizione", width: 78 },

      ...(canViewPrices
        ? [{ label: "Prezzo", width: 27 }]
        : []),

      { label: "Giacenza", width: 23 },
      { label: "Scorta min.", width: 24 },
      { label: "In ordine", width: 23 },

      ...(canViewInventoryValue
        ? [{ label: "Valore", width: 31 }]
        : []),
    ];

    const totalTableWidth = columns.reduce(
      (sum, column) => sum + column.width,
      0
    );

    let y = 38;

    const reportSubtitle =
      canViewPrices &&
      canViewInventoryValue
        ? "Report dettagliato con prezzi e valori economici"
        : canViewPrices
          ? "Report dettagliato con prezzi"
          : "Report dettagliato con valori economici";

    function drawHeader() {
      drawPdfHeader(
        doc,
        `MAGAZZINO - ${supplierName.toUpperCase()}`,
        reportSubtitle
      );

      y = 38;

      doc.setFillColor(235, 235, 235);

      doc.rect(
        marginLeft,
        y,
        totalTableWidth,
        9,
        "F"
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);

      let x = marginLeft;

      columns.forEach((column) => {
        doc.text(
          column.label,
          x + 1.5,
          y + 5.7
        );

        x += column.width;
      });

      y += 9;
    }

    function newPage() {
      doc.addPage();
      drawHeader();
    }

    drawHeader();

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);

    items.forEach((item) => {
      const descriptionLines = doc.splitTextToSize(
        item.description || "-",
        columns[2].width - 3
      );

      const rowHeight = Math.max(
        8,
        descriptionLines.length * 4 + 3
      );

      if (y + rowHeight > pageHeight - 20) {
        newPage();
      }

      if (isLowStock(item)) {
        doc.setFillColor(255, 242, 242);

        doc.rect(
          marginLeft,
          y,
          totalTableWidth,
          rowHeight,
          "F"
        );
      }

      doc.setDrawColor(215);

      doc.line(
        marginLeft,
        y + rowHeight,
        marginLeft + totalTableWidth,
        y + rowHeight
      );

      const values: Array<string | string[]> = [
        item.supplier_code || "-",
        item.code || "-",
        descriptionLines,

        ...(canViewPrices
          ? [formatPdfEuro(item.price)]
          : []),

        String(item.stock),

        item.min_stock > 0
          ? String(item.min_stock)
          : "-",

        item.on_order > 0
          ? String(item.on_order)
          : "-",

        ...(canViewInventoryValue
          ? [
              formatPdfEuro(
                item.stock * item.price
              ),
            ]
          : []),
      ];

      let x = marginLeft;

      values.forEach((value, index) => {
        if (Array.isArray(value)) {
          doc.text(
            value,
            x + 1.5,
            y + 4.7
          );
        } else {
          doc.text(
            value,
            x + 1.5,
            y + 4.7
          );
        }

        x += columns[index].width;
      });

      y += rowHeight;
    });

    if (y + 30 > pageHeight - 10) {
      doc.addPage();

      drawPdfHeader(
        doc,
        `MAGAZZINO - ${supplierName.toUpperCase()}`,
        "Riepilogo"
      );

      y = 42;
    } else {
      y += 8;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);

    doc.text(
      `Articoli totali: ${items.length}`,
      marginLeft,
      y
    );

    if (canViewInventoryValue) {
      y += 6;

      doc.text(
        `Valore totale magazzino: ${formatPdfEuro(
          totals.totalMagazzino
        )}`,
        marginLeft,
        y
      );

      y += 6;

      doc.text(
        `Valore totale merce in ordine: ${formatPdfEuro(
          totals.totalOrdine
        )}`,
        marginLeft,
        y
      );
    }

    addPageNumbers(doc);

    doc.save(
      `Magazzino_${safeFileName(
        supplierName
      )}_dettagliato.pdf`
    );
  }

  function generateWarehousePdf() {
    if (items.length === 0) {
      alert("Non ci sono articoli da stampare.");
      return;
    }

    /*
      Qui applichiamo l'ordinamento scelto
      dall'utente prima di creare il PDF.
    */
    const warehouseItems =
      getWarehouseSortedItems();

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageHeight =
      doc.internal.pageSize.getHeight();

    const marginLeft = 14;

    const columns = [
      { label: "Codice articolo", width: 38 },
      { label: "Codice scanner", width: 44 },
      { label: "Descrizione", width: 112 },
      { label: "Giacenza", width: 28 },
      { label: "Scorta min.", width: 30 },
      { label: "In ordine", width: 29 },
    ];

    const totalTableWidth = columns.reduce(
      (sum, column) => sum + column.width,
      0
    );

    let y = 38;

    function drawHeader() {
      drawPdfHeader(
        doc,
        `MAGAZZINO - ${supplierName.toUpperCase()}`,
        `Lista operativa magazziniere - Ordine: ${getWarehouseSortLabel()}`
      );

      y = 38;

      doc.setFillColor(235, 235, 235);

      doc.rect(
        marginLeft,
        y,
        totalTableWidth,
        10,
        "F"
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);

      let x = marginLeft;

      columns.forEach((column) => {
        doc.text(
          column.label,
          x + 2,
          y + 6.3
        );

        x += column.width;
      });

      y += 10;
    }

    function newPage() {
      doc.addPage();
      drawHeader();
    }

    drawHeader();

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);

    warehouseItems.forEach((item) => {
      const descriptionLines =
        doc.splitTextToSize(
          item.description || "-",
          columns[2].width - 4
        );

      const rowHeight = Math.max(
        9,
        descriptionLines.length * 4.3 + 3
      );

      if (
        y + rowHeight >
        pageHeight - 18
      ) {
        newPage();
      }

      if (isLowStock(item)) {
        doc.setFillColor(255, 242, 242);

        doc.rect(
          marginLeft,
          y,
          totalTableWidth,
          rowHeight,
          "F"
        );
      }

      doc.setDrawColor(215);

      doc.line(
        marginLeft,
        y + rowHeight,
        marginLeft + totalTableWidth,
        y + rowHeight
      );

      const values: Array<
        string | string[]
      > = [
        item.supplier_code || "-",
        item.code || "-",
        descriptionLines,
        String(item.stock),
        item.min_stock > 0
          ? String(item.min_stock)
          : "-",
        item.on_order > 0
          ? String(item.on_order)
          : "-",
      ];

      let x = marginLeft;

      values.forEach((value, index) => {
        if (Array.isArray(value)) {
          doc.text(
            value,
            x + 2,
            y + 5.2
          );
        } else {
          doc.text(
            value,
            x + 2,
            y + 5.2
          );
        }

        x += columns[index].width;
      });

      y += rowHeight;
    });

    if (
      y + 15 >
      pageHeight - 10
    ) {
      doc.addPage();

      drawPdfHeader(
        doc,
        `MAGAZZINO - ${supplierName.toUpperCase()}`,
        "Riepilogo"
      );

      y = 42;
    } else {
      y += 8;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);

    doc.text(
      `Articoli totali: ${warehouseItems.length}`,
      marginLeft,
      y
    );

    addPageNumbers(doc);

    let sortFileName = "codice";

    if (warehouseSort === "description") {
      sortFileName = "descrizione";
    }

    if (warehouseSort === "stock") {
      sortFileName = "giacenza";
    }

    doc.save(
      `Magazzino_${safeFileName(
        supplierName
      )}_magazziniere_${sortFileName}.pdf`
    );
  }

  function addPageNumbers(doc: jsPDF) {
    const pages = doc.getNumberOfPages();

    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);

      const pageWidth =
        doc.internal.pageSize.getWidth();

      const pageHeight =
        doc.internal.pageSize.getHeight();

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);

      doc.text(
        `Pagina ${i} di ${pages}`,
        pageWidth - 14,
        pageHeight - 7,
        {
          align: "right",
        }
      );
    }
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1500,
        margin: "0 auto",
      }}
    >
      {/* INTESTAZIONE */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
          marginBottom: 26,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              opacity: 0.55,
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: 1.2,
              fontWeight: 700,
            }}
          >
            Magazzino fornitore
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: "-0.5px",
            }}
          >
            {supplierName}
          </h1>

          <div
            style={{
              marginTop: 6,
              opacity: 0.6,
              fontSize: 14,
            }}
          >
            {totals.totalItems} articoli presenti
            {leadTimeStats && (
              <>
                {" "}
                · consegna media {leadTimeStats.avgDays.toFixed(1)} giorni
                {" "}
                (su {leadTimeStats.count}{" "}
                {leadTimeStats.count === 1 ? "ordine" : "ordini"})
              </>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Link
            href="/suppliers"
            style={secondaryButton}
          >
            ← Fornitori
          </Link>

          {/* ORDINAMENTO PDF MAGAZZINIERE */}

          <select
            value={warehouseSort}
            onChange={(e) =>
              setWarehouseSort(
                e.target.value as WarehouseSort
              )
            }
            disabled={loading}
            title="Scegli come ordinare il PDF magazziniere"
            style={{
              padding: "11px 12px",
              borderRadius: 8,
              border:
                "1px solid var(--border-color)",
              background:
                "var(--input-bg)",
              color:
                "var(--foreground)",
              fontWeight: 700,
              cursor: loading
                ? "not-allowed"
                : "pointer",
              outline: "none",
            }}
          >
            <option value="supplier_code">
              Codice articolo crescente
            </option>

            <option value="description">
              Descrizione A → Z
            </option>

            <option value="stock">
              Giacenza crescente
            </option>
          </select>

          <button
            type="button"
            onClick={generateWarehousePdf}
            disabled={loading}
            style={{
              ...warehousePdfButton,
              opacity: loading ? 0.5 : 1,
              cursor: loading
                ? "not-allowed"
                : "pointer",
            }}
          >
            PDF magazziniere
          </button>

          {(canViewPrices ||
            canViewInventoryValue) && (
            <button
              type="button"
              onClick={generateDetailedPdf}
              disabled={loading}
              style={{
                ...detailedPdfButton,
                opacity: loading ? 0.5 : 1,
                cursor: loading
                  ? "not-allowed"
                  : "pointer",
              }}
            >
              PDF dettagliato
            </button>
          )}

          <Link
            href={`/suppliers/${supplierId}/new-item`}
            style={primaryButton}
          >
            + Nuovo articolo
          </Link>
        </div>
      </div>

      {upholsteryEnabled && (
        <section
          style={{
            marginBottom: 20,
            padding: "18px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
            border:
              "1px solid rgba(37,99,235,0.28)",
            borderRadius: 14,
            background:
              "linear-gradient(135deg, rgba(37,99,235,0.10), rgba(59,130,246,0.035))",
            boxShadow:
              "0 10px 28px rgba(37,99,235,0.07)",
          }}
        >
          <div
            style={{
              minWidth: 0,
            }}
          >
            <div
              style={{
                marginBottom: 5,
                color: "#2563eb",
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: 1.1,
                textTransform: "uppercase",
              }}
            >
              Fornitore tappezzerie
            </div>

            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
                lineHeight: 1.2,
              }}
            >
              Gestione Tappezzerie
            </div>

            <div
              style={{
                marginTop: 6,
                maxWidth: 720,
                color: "var(--muted-foreground, #64748b)",
                fontSize: 13,
                lineHeight: 1.55,
              }}
            >
              Gestisci Matricola Kit, colori, dettagli e
              loghi, cuciture e trapuntature senza
              modificare il normale magazzino di
              D&apos;AMICO.
            </div>
          </div>

          <Link
            href={`/suppliers/${supplierId}/upholstery`}
            style={{
              minHeight: 44,
              padding: "0 17px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border:
                "1px solid rgba(37,99,235,0.40)",
              borderRadius: 10,
              background: "#2563eb",
              color: "#ffffff",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 900,
              whiteSpace: "nowrap",
              boxShadow:
                "0 8px 18px rgba(37,99,235,0.20)",
            }}
          >
            Apri gestione tappezzerie →
          </Link>
        </section>
      )}

      {windshieldEnabled && (
        <section
          style={{
            marginBottom: 20,
            padding: "18px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
            border:
              "1px solid rgba(37,99,235,0.28)",
            borderRadius: 14,
            background:
              "linear-gradient(135deg, rgba(37,99,235,0.10), rgba(59,130,246,0.035))",
            boxShadow:
              "0 10px 28px rgba(37,99,235,0.07)",
          }}
        >
          <div
            style={{
              minWidth: 0,
            }}
          >
            <div
              style={{
                marginBottom: 5,
                color: "#2563eb",
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: 1.1,
                textTransform: "uppercase",
              }}
            >
              Fornitore parabrezza
            </div>

            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
                lineHeight: 1.2,
              }}
            >
              Gestione Parabrezza
            </div>

            <div
              style={{
                marginTop: 6,
                maxWidth: 720,
                color: "var(--muted-foreground, #64748b)",
                fontSize: 13,
                lineHeight: 1.55,
              }}
            >
              Mappa i modelli battello agli articoli parabrezza,
              registra gli arrivi in giacenza e vedi lo stato di
              assegnazione per ogni battello.
            </div>
          </div>

          <Link
            href="/produzione/parabrezza"
            style={{
              minHeight: 44,
              padding: "0 17px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border:
                "1px solid rgba(37,99,235,0.40)",
              borderRadius: 10,
              background: "#2563eb",
              color: "#ffffff",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 900,
              whiteSpace: "nowrap",
              boxShadow:
                "0 8px 18px rgba(37,99,235,0.20)",
            }}
          >
            Apri gestione parabrezza →
          </Link>
        </section>
      )}

      {/* RIQUADRI RIEPILOGO */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        {canViewInventoryValue && (
          <>
            <SummaryCard
              title="Valore magazzino"
              value={formatEuro(totals.totalMagazzino)}
              subtitle="Valore della giacenza attuale"
            />

            <SummaryCard
              title="Valore in ordine"
              value={formatEuro(totals.totalOrdine)}
              subtitle="Merce attualmente in ordine"
            />
          </>
        )}

        <SummaryCard
          title="Scorte da controllare"
          value={String(totals.lowStock)}
          subtitle={
            totals.lowStock === 0
              ? "Nessuna criticità"
              : "Articoli alla scorta minima"
          }
          warning={totals.lowStock > 0}
        />
      </div>

      {/* RICERCA E FILTRI */}

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          padding: 14,
          marginBottom: 16,
          background: "var(--card)",
          border:
            "1px solid var(--border-color)",
          borderRadius: 12,
        }}
      >
        <div
          style={{
            position: "relative",
            flex: "1 1 350px",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 13,
              top: "50%",
              transform: "translateY(-50%)",
              opacity: 0.5,
            }}
          >
            ⌕
          </span>

          <input
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder="Cerca codice, scanner o descrizione..."
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding:
                "11px 14px 11px 38px",
              background:
                "var(--input-bg)",
              color:
                "var(--foreground)",
              border:
                "1px solid var(--border-color)",
              borderRadius: 8,
              outline: "none",
              fontSize: 14,
            }}
          />
        </div>

        <button
          type="button"
          onClick={() =>
            setOnlyLowStock(!onlyLowStock)
          }
          style={{
            padding: "11px 15px",
            borderRadius: 8,

            border: onlyLowStock
              ? "1px solid #ef4444"
              : "1px solid var(--border-color)",

            background: onlyLowStock
              ? "rgba(239, 68, 68, 0.15)"
              : "var(--input-bg)",

            color:
              "var(--foreground)",
            cursor: "pointer",
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {onlyLowStock ? "✓ " : ""}
          Solo scorte basse
        </button>

        <div
          style={{
            fontSize: 13,
            opacity: 0.6,
            padding: "0 5px",
          }}
        >
          {filteredItems.length} risultati
        </div>
      </div>

      {/* TABELLA */}

      <div
        style={{
          border:
            "1px solid var(--border-color)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--card)",
        }}
      >
        <div
          style={{
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              minWidth:
                canViewPrices ||
                canViewInventoryValue
                  ? 1200
                  : 900,
              borderCollapse:
                "collapse",
            }}
          >
            <thead>
              <tr
                style={{
                  background:
                    "var(--table-head)",
                }}
              >
                <th style={headerStyle}>
                  Codice articolo
                </th>

                <th style={headerStyle}>
                  Codice scanner
                </th>

                <th style={headerStyle}>
                  Descrizione
                </th>

                {canViewPrices && (
                  <th style={headerRightStyle}>
                    Prezzo
                  </th>
                )}

                <th style={headerCenterStyle}>
                  Giacenza
                </th>

                <th style={headerCenterStyle}>
                  Scorta min.
                </th>

                <th style={headerCenterStyle}>
                  In ordine
                </th>

                {canViewInventoryValue && (
                  <th style={headerRightStyle}>
                    Valore
                  </th>
                )}

                {upholsteryEnabled && (
                  <th style={headerStyle}>
                    Azioni
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={tableColumnCount}
                    style={emptyStyle}
                  >
                    Caricamento articoli...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={tableColumnCount}
                    style={emptyStyle}
                  >
                    Nessun articolo trovato.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const lowStock =
                    isLowStock(item);

                  const kitOpen =
                    openKitItemId === item.id;

                  return (
                    <React.Fragment key={item.id}>
                    <tr
                      style={{
                        borderBottom:
                          "1px solid var(--border-color)",

                        background:
                          lowStock
                            ? "rgba(239, 68, 68, 0.08)"
                            : "transparent",
                      }}
                    >
                      <td style={cellStyle}>
                        <Link
                          href={`/items/${item.id}`}
                          style={{
                            color: "inherit",
                            textDecoration:
                              "none",
                            fontWeight: 750,
                          }}
                        >
                          {item.supplier_code ||
                            "-"}
                        </Link>
                      </td>

                      <td style={cellStyle}>
                        <span
                          style={{
                            fontFamily:
                              "monospace",
                            fontSize: 13,
                            padding:
                              "4px 7px",
                            border:
                              "1px solid var(--border-color)",
                            borderRadius: 5,
                            background:
                              "var(--input-bg)",
                          }}
                        >
                          {item.code || "-"}
                        </span>
                      </td>

                      <td style={cellStyle}>
                        <Link
                          href={`/items/${item.id}`}
                          style={{
                            color: "inherit",
                            textDecoration:
                              "none",
                          }}
                        >
                          {item.description ||
                            "-"}
                        </Link>
                      </td>

                      {canViewPrices && (
                        <td style={rightCellStyle}>
                          {formatEuro(
                            item.price
                          )}
                        </td>
                      )}

                      <td style={centerCellStyle}>
                        <StockBadge
                          stock={item.stock}
                          minStock={
                            item.min_stock
                          }
                        />
                      </td>

                      <td style={centerCellStyle}>
                        {item.min_stock > 0
                          ? item.min_stock
                          : "—"}
                      </td>

                      <td style={centerCellStyle}>
                        {item.on_order > 0 ? (
                          <span
                            style={{
                              display:
                                "inline-block",
                              minWidth: 34,
                              padding:
                                "4px 9px",
                              borderRadius: 20,
                              background:
                                "rgba(59, 130, 246, 0.15)",
                              fontWeight: 800,
                            }}
                          >
                            {item.on_order}
                          </span>
                        ) : (
                          <span
                            style={{
                              opacity: 0.4,
                            }}
                          >
                            —
                          </span>
                        )}
                      </td>

                      {canViewInventoryValue && (
                        <td style={rightCellStyle}>
                          <strong>
                            {formatEuro(
                              item.stock *
                                item.price
                            )}
                          </strong>
                        </td>
                      )}

                      {upholsteryEnabled && (
                        <td style={cellStyle}>
                          <button
                            type="button"
                            onClick={() =>
                              kitOpen
                                ? closeKitEditor()
                                : openKitEditor(item)
                            }
                            style={{
                              padding: "7px 11px",
                              borderRadius: 7,
                              border:
                                "1px solid rgba(37,99,235,0.35)",
                              background:
                                "rgba(37,99,235,0.08)",
                              color: "#2563eb",
                              cursor: "pointer",
                              fontWeight: 750,
                              fontSize: 12,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {kitOpen ? "Chiudi" : "+ Registra kit"}
                          </button>
                        </td>
                      )}
                    </tr>

                    {upholsteryEnabled && kitOpen && (
                      <tr>
                        <td
                          colSpan={tableColumnCount}
                          style={{
                            padding: "14px 16px",
                            background:
                              "rgba(37,99,235,0.05)",
                            borderBottom:
                              "1px solid var(--border-color)",
                          }}
                        >
                          <div
                            style={{
                              marginBottom: 10,
                              fontSize: 12,
                              fontWeight: 850,
                            }}
                          >
                            Registra nuovo kit in giacenza —{" "}
                            {item.supplier_code || item.code}
                          </div>

                          {!hasUpholsteryChoices() && (
                            <div
                              style={{
                                marginBottom: 10,
                                padding: "9px 11px",
                                borderRadius: 8,
                                border:
                                  "1px solid rgba(250,204,21,0.4)",
                                background:
                                  "rgba(250,204,21,0.10)",
                                fontSize: 11,
                              }}
                            >
                              Configura almeno un Colore, un valore
                              in Dettagli e loghi, una Cucitura e
                              una Trapuntatura in Gestione
                              Tappezzerie prima di registrare un
                              kit.
                            </div>
                          )}

                          {kitError && (
                            <div
                              style={{
                                marginBottom: 10,
                                padding: "9px 11px",
                                borderRadius: 8,
                                border:
                                  "1px solid rgba(239,68,68,0.35)",
                                background:
                                  "rgba(239,68,68,0.08)",
                                color: "#b91c1c",
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {kitError}
                            </div>
                          )}

                          {kitMessage && (
                            <div
                              style={{
                                marginBottom: 10,
                                padding: "9px 11px",
                                borderRadius: 8,
                                border:
                                  "1px solid rgba(34,197,94,0.35)",
                                background:
                                  "rgba(34,197,94,0.08)",
                                color: "#166534",
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {kitMessage}
                            </div>
                          )}

                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 10,
                              alignItems: "flex-end",
                            }}
                          >
                            <KitField label="Matricola">
                              <input
                                type="number"
                                min="1"
                                max="10000"
                                step="1"
                                value={kitDraft.matricola}
                                onChange={(e) =>
                                  setKitDraft((current) => ({
                                    ...current,
                                    matricola: e.target.value,
                                  }))
                                }
                                style={kitInputStyle}
                              />
                            </KitField>

                            <KitField label="Codice scanner">
                              <input
                                value={kitDraft.scannerCode}
                                onChange={(e) =>
                                  setKitDraft((current) => ({
                                    ...current,
                                    scannerCode: e.target.value,
                                  }))
                                }
                                style={kitInputStyle}
                              />
                            </KitField>

                            <KitField label="Prezzo kit">
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={kitDraft.unitPrice}
                                onChange={(e) =>
                                  setKitDraft((current) => ({
                                    ...current,
                                    unitPrice: e.target.value,
                                  }))
                                }
                                style={kitInputStyle}
                              />
                            </KitField>

                            <KitField label="Colore">
                              <select
                                value={kitDraft.color}
                                onChange={(e) =>
                                  setKitDraft((current) => ({
                                    ...current,
                                    color: e.target.value,
                                  }))
                                }
                                style={kitInputStyle}
                              >
                                {upholsteryOptions.color.map(
                                  (option) => (
                                    <option
                                      key={option.id}
                                      value={option.name}
                                    >
                                      {option.name}
                                    </option>
                                  )
                                )}
                              </select>
                            </KitField>

                            <KitField label="Dettagli e loghi">
                              <select
                                value={kitDraft.detailsLogos}
                                onChange={(e) =>
                                  setKitDraft((current) => ({
                                    ...current,
                                    detailsLogos: e.target.value,
                                  }))
                                }
                                style={kitInputStyle}
                              >
                                {upholsteryOptions.details_logos.map(
                                  (option) => (
                                    <option
                                      key={option.id}
                                      value={option.name}
                                    >
                                      {option.name}
                                    </option>
                                  )
                                )}
                              </select>
                            </KitField>

                            <KitField label="Cucitura">
                              <select
                                value={kitDraft.stitching}
                                onChange={(e) =>
                                  setKitDraft((current) => ({
                                    ...current,
                                    stitching: e.target.value,
                                  }))
                                }
                                style={kitInputStyle}
                              >
                                {upholsteryOptions.stitching.map(
                                  (option) => (
                                    <option
                                      key={option.id}
                                      value={option.name}
                                    >
                                      {option.name}
                                    </option>
                                  )
                                )}
                              </select>
                            </KitField>

                            <KitField label="Trapuntatura">
                              <select
                                value={kitDraft.quilting}
                                onChange={(e) =>
                                  setKitDraft((current) => ({
                                    ...current,
                                    quilting: e.target.value,
                                  }))
                                }
                                style={kitInputStyle}
                              >
                                {upholsteryOptions.quilting.map(
                                  (option) => (
                                    <option
                                      key={option.id}
                                      value={option.name}
                                    >
                                      {option.name}
                                    </option>
                                  )
                                )}
                              </select>
                            </KitField>

                            <KitField label="Nota (facoltativa)">
                              <input
                                value={kitDraft.note}
                                onChange={(e) =>
                                  setKitDraft((current) => ({
                                    ...current,
                                    note: e.target.value,
                                  }))
                                }
                                style={kitInputStyle}
                              />
                            </KitField>

                            {boatRequestsFor(item.id).length > 0 && (
                              <KitField label="Assegna a battello">
                                <select
                                  value={kitDraft.boatUpholsteryId}
                                  onChange={(e) =>
                                    setKitDraft((current) => ({
                                      ...current,
                                      boatUpholsteryId: e.target.value,
                                    }))
                                  }
                                  style={kitInputStyle}
                                >
                                  <option value="">
                                    Automatico (consegna più vicina)
                                  </option>
                                  {boatRequestsFor(item.id).map(
                                    (request) => (
                                      <option
                                        key={request.id}
                                        value={request.id}
                                      >
                                        {`Battello N. ${request.boatOrderNumber} — ${request.boatModel} — ${request.color}`}
                                      </option>
                                    )
                                  )}
                                </select>
                              </KitField>
                            )}

                            <button
                              type="button"
                              onClick={() => saveKit(item)}
                              disabled={
                                kitSaving || !hasUpholsteryChoices()
                              }
                              style={{
                                minHeight: 38,
                                padding: "0 16px",
                                borderRadius: 8,
                                border: "1px solid #1d4ed8",
                                background: "#2563eb",
                                color: "white",
                                cursor: kitSaving
                                  ? "not-allowed"
                                  : "pointer",
                                fontWeight: 850,
                                fontSize: 12,
                                opacity:
                                  kitSaving ||
                                  !hasUpholsteryChoices()
                                    ? 0.55
                                    : 1,
                              }}
                            >
                              {kitSaving
                                ? "Salvataggio..."
                                : "Salva kit"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          fontSize: 12,
          opacity: 0.5,
        }}
      >
        Clicca sul codice articolo o sulla descrizione per aprire
        la scheda completa.
      </div>
    </div>
  );
}

/* ---------------- COMPONENTI ---------------- */

function KitField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontSize: 10,
      }}
    >
      <span
        style={{
          opacity: 0.6,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const kitInputStyle: React.CSSProperties = {
  minHeight: 38,
  padding: "0 10px",
  minWidth: 140,
  border: "1px solid var(--border-color)",
  borderRadius: 7,
  background: "var(--input-bg)",
  color: "var(--foreground)",
  outline: "none",
  fontSize: 12,
};

function SummaryCard({
  title,
  value,
  subtitle,
  warning = false,
}: {
  title: string;
  value: string;
  subtitle: string;
  warning?: boolean;
}) {
  return (
    <div
      style={{
        padding: 18,

        border: warning
          ? "1px solid rgba(239, 68, 68, 0.5)"
          : "1px solid var(--border-color)",

        borderRadius: 12,

        background: warning
          ? "rgba(239, 68, 68, 0.08)"
          : "var(--card)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          textTransform:
            "uppercase",
          letterSpacing: 0.8,
          fontWeight: 700,
          opacity: 0.55,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: 27,
          fontWeight: 850,
          marginTop: 7,
          letterSpacing: "-0.5px",
        }}
      >
        {warning && "⚠ "}
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

function StockBadge({
  stock,
  minStock,
}: {
  stock: number;
  minStock: number;
}) {
  const low =
    minStock > 0 &&
    stock <= minStock;

  if (low) {
    return (
      <span
        title={`Scorta minima: ${minStock}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,

          padding: "5px 10px",

          borderRadius: 20,

          background:
            "rgba(239, 68, 68, 0.18)",

          border:
            "1px solid rgba(239, 68, 68, 0.4)",

          fontWeight: 850,
        }}
      >
        ⚠ {stock}
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-block",
        minWidth: 34,
        padding: "5px 10px",

        borderRadius: 20,

        background:
          "rgba(34, 197, 94, 0.12)",

        fontWeight: 800,
      }}
    >
      {stock}
    </span>
  );
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

/* ---------------- STILI ---------------- */

const primaryButton = {
  display: "inline-block",
  padding: "11px 16px",

  borderRadius: 8,
  border:
    "1px solid var(--foreground)",

  background:
    "var(--foreground)",
  color:
    "var(--background)",

  textDecoration: "none",
  fontWeight: 750,
};

const secondaryButton = {
  display: "inline-block",
  padding: "11px 16px",

  borderRadius: 8,
  border:
    "1px solid var(--border-color)",

  background:
    "var(--card)",
  color:
    "var(--foreground)",

  textDecoration: "none",
  fontWeight: 650,
};

const warehousePdfButton = {
  display: "inline-block",
  padding: "11px 16px",

  borderRadius: 8,
  border:
    "1px solid var(--border-color)",

  background:
    "var(--card)",
  color:
    "var(--foreground)",

  cursor: "pointer",
  fontWeight: 750,
};

const detailedPdfButton = {
  display: "inline-block",
  padding: "11px 16px",

  borderRadius: 8,
  border:
    "1px solid rgba(59,130,246,0.45)",

  background:
    "rgba(59,130,246,0.12)",

  color:
    "var(--foreground)",

  cursor: "pointer",
  fontWeight: 750,
};

const headerStyle = {
  padding: "13px 14px",
  textAlign: "left" as const,

  fontSize: 12,
  textTransform:
    "uppercase" as const,
  letterSpacing: 0.5,

  opacity: 0.7,

  borderBottom:
    "1px solid var(--border-color)",

  whiteSpace:
    "nowrap" as const,
};

const headerCenterStyle = {
  ...headerStyle,
  textAlign: "center" as const,
};

const headerRightStyle = {
  ...headerStyle,
  textAlign: "right" as const,
};

const cellStyle = {
  padding: "12px 14px",
  fontSize: 14,
};

const centerCellStyle = {
  ...cellStyle,
  textAlign: "center" as const,
};

const rightCellStyle = {
  ...cellStyle,
  textAlign: "right" as const,
  whiteSpace:
    "nowrap" as const,
};

const emptyStyle = {
  padding: 45,
  textAlign: "center" as const,
  opacity: 0.55,
};