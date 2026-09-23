"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import jsPDF from "jspdf";
import { fetchCompanyLogo, drawCompanyLogoTopLeft } from "../../../../lib/pdfLogo";

/*
  DATI LEGALI ITALBOATS - USATI NELL'INTESTAZIONE DEL PDF ORDINE

  Gli stessi dati del vecchio modulo d'ordine cartaceo (ragione
  sociale, indirizzo, contatti, dati fiscali), cosi' il PDF generato
  dal gestionale ha lo stesso valore formale di una lettera d'ordine.
*/
const COMPANY_INFO = {
  name: "Italboats S.r.l.",
  address: [
    "Zona Industriale, 14",
    "73054 Presicce-Acquarica (LE) · Italy",
  ],
  contacts: [
    "Tel. +39 (0)833 722 553",
    "WhatsApp +39 351 534 5854",
    "info@italboats.com",
    "www.italboats.com",
  ],
  fiscal: [
    "P.IVA IT 11642820150",
    "SDI KRRH6B9",
    "REA di Lecce n. LE 293728",
    "Cap. Sociale EUR 100.000,00 i.v.",
  ],
};

type Supplier = {
  id: string;
  name: string;
  upholstery_enabled?: boolean;
  windshield_enabled?: boolean;
};

type Item = {
  id: string;
  supplier_id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  price: number;
  stock: number;
  min_stock: number;
  box_qty: number;
  on_order: number;
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

type LineVariant = {
  id: string;
  qty: number;
  color: string;
  details_logos: string;
  stitching: string;
  quilting: string;
  note: string;
};

type OrderLine = {
  item: Item;
  qty: number;
  variants: LineVariant[];
  requestedDelivery: string;
  boatUpholsteryId: string;
};

type OpenBoatRequest = {
  id: string;
  itemId: string;
  boatOrderNumber: string;
  boatModel: string;
  color: string;
};

type AtomicOrderResult = {
  success?: boolean;
  order_id?: string;
  status?: string;
  articles?: number;
  pieces?: number;
  total?: number;
};

export default function SupplierOrderPage() {
  const params = useParams();
  const router = useRouter();

  const supplierId = String(params.supplierId);

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [lines, setLines] = useState<OrderLine[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showAddItems, setShowAddItems] = useState(false);
  const [search, setSearch] = useState("");

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "success" | "error" | ""
  >("");

  // Colore/dettagli riga per riga: solo per i fornitori con Gestione
  // Tappezzerie attiva. Non cambia come funziona l'ordine (quantità e
  // box restano uguali): è solo una suddivisione facoltativa della
  // quantità già scelta, per sapere quanti pezzi vanno in ogni colore.
  const [upholsteryOptions, setUpholsteryOptions] = useState<{
    color: UpholsteryOption[];
    details_logos: UpholsteryOption[];
    stitching: UpholsteryOption[];
    quilting: UpholsteryOption[];
  }>({ color: [], details_logos: [], stitching: [], quilting: [] });

  const [openVariantItemId, setOpenVariantItemId] = useState("");
  const [variantDraft, setVariantDraft] = useState({
    qty: "1",
    color: "",
    details_logos: "",
    stitching: "",
    quilting: "",
    note: "",
  });

  useEffect(() => {
    loadData();
  }, [supplierId]);

  useEffect(() => {
    if (!supplier?.upholstery_enabled) {
      setUpholsteryOptions({
        color: [],
        details_logos: [],
        stitching: [],
        quilting: [],
      });
      return;
    }

    async function loadUpholsteryOptions() {
      const { data, error } = await supabase
        .from("upholstery_options")
        .select("id,option_type,name,active,sort_order")
        .eq("supplier_id", supplierId)
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) return;

      const grouped = {
        color: [] as UpholsteryOption[],
        details_logos: [] as UpholsteryOption[],
        stitching: [] as UpholsteryOption[],
        quilting: [] as UpholsteryOption[],
      };

      for (const row of data || []) {
        const type = String((row as any).option_type) as UpholsteryOptionType;
        if (!grouped[type]) continue;
        grouped[type].push({
          id: String((row as any).id),
          option_type: type,
          name: String((row as any).name || ""),
        });
      }

      setUpholsteryOptions(grouped);
    }

    loadUpholsteryOptions();
  }, [supplierId, supplier?.upholstery_enabled]);

  const [openBoatRequests, setOpenBoatRequests] = useState<
    OpenBoatRequest[]
  >([]);

  useEffect(() => {
    if (!supplier?.upholstery_enabled) {
      setOpenBoatRequests([]);
      return;
    }

    async function loadOpenBoatRequests() {
      const { data, error } = await supabase
        .from("production_boat_upholstery")
        .select(
          "id,item_id,color,production_boats(order_number,model_boat)"
        )
        .eq("supplier_id", supplierId)
        .is("kit_id", null)
        .is("order_item_id", null);

      if (error) return;

      setOpenBoatRequests(
        (data || []).map((row: any) => ({
          id: String(row.id),
          itemId: String(row.item_id),
          boatOrderNumber: String(
            row.production_boats?.order_number || "?"
          ),
          boatModel: String(row.production_boats?.model_boat || ""),
          color: String(row.color || ""),
        }))
      );
    }

    loadOpenBoatRequests();
  }, [supplierId, supplier?.upholstery_enabled]);

  function boatRequestsFor(itemId: string) {
    return openBoatRequests.filter(
      (request) => request.itemId === itemId
    );
  }

  function changeBoatUpholstery(itemId: string, value: string) {
    setLines((current) =>
      current.map((line) =>
        line.item.id === itemId
          ? { ...line, boatUpholsteryId: value }
          : line
      )
    );
  }

  function openVariantEditor(itemId: string) {
    setOpenVariantItemId(itemId);
    setVariantDraft({
      qty: "1",
      color: upholsteryOptions.color[0]?.name || "",
      details_logos: upholsteryOptions.details_logos[0]?.name || "",
      stitching: upholsteryOptions.stitching[0]?.name || "",
      quilting: upholsteryOptions.quilting[0]?.name || "",
      note: "",
    });
  }

  function closeVariantEditor() {
    setOpenVariantItemId("");
  }

  function addVariant(itemId: string) {
    if (
      !variantDraft.color ||
      !variantDraft.details_logos ||
      !variantDraft.stitching ||
      !variantDraft.quilting
    ) {
      return;
    }

    const qty = Math.max(1, Math.round(Number(variantDraft.qty || 1)));

    setLines((current) =>
      current.map((line) =>
        line.item.id === itemId
          ? {
              ...line,
              variants: [
                ...line.variants,
                {
                  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  qty,
                  color: variantDraft.color,
                  details_logos: variantDraft.details_logos,
                  stitching: variantDraft.stitching,
                  quilting: variantDraft.quilting,
                  note: variantDraft.note.trim(),
                },
              ],
            }
          : line
      )
    );

    setVariantDraft((current) => ({ ...current, qty: "1", note: "" }));
  }

  function removeVariant(itemId: string, variantId: string) {
    setLines((current) =>
      current.map((line) =>
        line.item.id === itemId
          ? {
              ...line,
              variants: line.variants.filter((v) => v.id !== variantId),
            }
          : line
      )
    );
  }

  async function loadData() {
    setLoading(true);
    setMessage("");
    setMessageType("");

    /*
      FORNITORE
    */
    const { data: supplierData, error: supplierError } =
      await supabase
        .from("suppliers")
        .select("id,name,upholstery_enabled,windshield_enabled")
        .eq("id", supplierId)
        .single();

    if (supplierError || !supplierData) {
      setMessage(
        "Errore caricamento fornitore: " +
          (supplierError?.message || "Fornitore non trovato")
      );

      setMessageType("error");
      setLoading(false);
      return;
    }

    /*
      ARTICOLI DEL FORNITORE
    */
    const { data: itemsData, error: itemsError } =
      await supabase
        .from("items")
        .select(
          "id,supplier_id,code,supplier_code,description,price,stock,min_stock,box_qty,on_order"
        )
        .eq("supplier_id", supplierId)
        .order("description");

    if (itemsError) {
      setMessage(
        "Errore caricamento articoli: " + itemsError.message
      );

      setMessageType("error");
      setLoading(false);
      return;
    }

    const cleanItems: Item[] = (itemsData || []).map((item) => ({
      id: String(item.id),
      supplier_id: String(item.supplier_id),
      code: String(item.code || ""),
      supplier_code: item.supplier_code
        ? String(item.supplier_code)
        : null,
      description: String(item.description || ""),
      price: Number(item.price || 0),
      stock: Number(item.stock || 0),
      min_stock: Number(item.min_stock || 0),
      box_qty: Math.max(1, Number(item.box_qty || 1)),
      on_order: Number(item.on_order || 0),
    }));

    /*
      RICHIESTE TAPPEZZERIA/PARABREZZA "DA ORDINARE"

      Un articolo con almeno una richiesta battello ancora senza
      kit assegnato E senza riga d'ordine aperta (kit_id e
      order_item_id entrambi null, su production_boat_upholstery o
      production_boat_windshield) deve entrare comunque nella
      proposta, anche se la giacenza generale dell'articolo è già
      sopra la scorta minima: per la tappezzeria, colori diversi
      dello stesso kit condividono l'articolo ma non la giacenza
      fisica del colore specifico richiesto; per il parabrezza la
      giacenza può semplicemente non essere ancora arrivata. In
      entrambi i casi il solo calcolo su scorta minima non le vede.
    */
    const openRequestCounts = new Map<string, number>();

    /*
      Colore/dettagli/cucitura/trapuntatura di ogni richiesta aperta,
      raggruppati per articolo: servono per precompilare da soli i
      "colori" della riga d'ordine (quelli che oggi si aggiungono a
      mano con "+ Colore"), così il fornitore vede subito quanti pezzi
      per ciascun colore senza doverli riselezionare uno per uno.
    */
    const openRequestVariantsByItem = new Map<
      string,
      { color: string; details_logos: string; stitching: string; quilting: string }[]
    >();

    if (supplierData.upholstery_enabled) {
      const { data: openReqData } = await supabase
        .from("production_boat_upholstery")
        .select("item_id,color,details_logos,stitching,quilting")
        .eq("supplier_id", supplierId)
        .is("kit_id", null)
        .is("order_item_id", null);

      for (const row of openReqData || []) {
        const itemId = String((row as any).item_id);

        openRequestCounts.set(
          itemId,
          (openRequestCounts.get(itemId) || 0) + 1
        );

        const list = openRequestVariantsByItem.get(itemId) || [];

        list.push({
          color: String((row as any).color || ""),
          details_logos: String((row as any).details_logos || ""),
          stitching: String((row as any).stitching || ""),
          quilting: String((row as any).quilting || ""),
        });

        openRequestVariantsByItem.set(itemId, list);
      }
    }

    /*
      RICHIESTE PARABREZZA "DA ORDINARE"

      Stessa logica delle tappezzerie qui sopra, ma senza colore: un
      parabrezza e' gia' identificato dall'articolo (production_boat_
      windshield non ha una colonna supplier_id propria, quindi
      filtriamo per gli articoli di questo fornitore).
    */
    if (supplierData.windshield_enabled && cleanItems.length > 0) {
      const { data: openWindshieldData } = await supabase
        .from("production_boat_windshield")
        .select("item_id")
        .in(
          "item_id",
          cleanItems.map((item) => item.id)
        )
        .is("kit_id", null)
        .is("order_item_id", null);

      for (const row of openWindshieldData || []) {
        const itemId = String((row as any).item_id);
        openRequestCounts.set(
          itemId,
          (openRequestCounts.get(itemId) || 0) + 1
        );
      }
    }

    /*
      Raggruppa le richieste aperte di un articolo per combinazione
      colore/dettagli/cucitura/trapuntatura, contando quanti pezzi
      servono per ciascuna: diventa la lista "colori" già pronta
      sulla riga d'ordine.
    */
    function buildVariantsFromRequests(itemId: string): LineVariant[] {
      const requests = openRequestVariantsByItem.get(itemId) || [];

      const groups = new Map<
        string,
        { qty: number } & Omit<LineVariant, "id" | "qty" | "note">
      >();

      for (const request of requests) {
        const key = [
          request.color,
          request.details_logos,
          request.stitching,
          request.quilting,
        ].join("||");

        const existing = groups.get(key);

        if (existing) {
          existing.qty += 1;
        } else {
          groups.set(key, { qty: 1, ...request });
        }
      }

      return Array.from(groups.values()).map((group, index) => ({
        id: `auto-${itemId}-${index}-${Date.now()}`,
        qty: group.qty,
        color: group.color,
        details_logos: group.details_logos,
        stitching: group.stitching,
        quilting: group.quilting,
        note: "",
      }));
    }

    /*
      BOZZA AUTOMATICA A BOX INTERI

      1. Calcoliamo quanti pezzi mancano per arrivare
         almeno alla scorta minima, considerando anche
         la merce già in ordine.

      2. Confrontiamo questo valore con il numero di
         richieste battello ancora "da ordinare" per lo
         stesso articolo: prendiamo il più alto dei due,
         così l'ordine copre sempre almeno tutte le
         richieste aperte, anche quando la scorta minima
         da sola non le farebbe emergere.

      3. Dividiamo i pezzi mancanti per la quantità
         contenuta in un box.

      4. Arrotondiamo SEMPRE per eccesso al box intero.

      Esempio:
      stock 1200
      minimo 2000
      in ordine 0
      box 200
      => mancano 800
      => 4 box
      => 800 pezzi da ordinare
    */
    const automaticLines: OrderLine[] = cleanItems
      .map((item) => {
        const missingQtyStock = Math.max(
          0,
          Number(item.min_stock || 0) -
            Number(item.stock || 0) -
            Number(item.on_order || 0)
        );

        const openRequestsQty =
          openRequestCounts.get(item.id) || 0;

        const missingQty = Math.max(
          missingQtyStock,
          openRequestsQty
        );

        const boxQty = Math.max(
          1,
          Number(item.box_qty || 1)
        );

        const boxesNeeded =
          missingQty > 0
            ? Math.ceil(missingQty / boxQty)
            : 0;

        const suggestedQty =
          boxesNeeded * boxQty;

        return {
          item,
          qty: suggestedQty,
          variants: buildVariantsFromRequests(item.id),
          requestedDelivery: "",
          boatUpholsteryId: "",
        };
      })
      .filter((line) => line.qty > 0);

    setSupplier(supplierData);
    setItems(cleanItems);
    setLines(automaticLines);
    setLoading(false);
  }

  /*
    TOTALI
  */
  const totalArticles = lines.length;

  const totalPieces = useMemo(() => {
    return lines.reduce(
      (sum, line) => sum + Number(line.qty || 0),
      0
    );
  }, [lines]);

  const totalBoxes = useMemo(() => {
    return lines.reduce((sum, line) => {
      const boxQty = Math.max(
        1,
        Number(line.item.box_qty || 1)
      );

      return (
        sum +
        Math.ceil(
          Number(line.qty || 0) / boxQty
        )
      );
    }, 0);
  }, [lines]);

  const totalValue = useMemo(() => {
    return lines.reduce(
      (sum, line) =>
        sum +
        Number(line.qty || 0) *
          Number(line.item.price || 0),
      0
    );
  }, [lines]);

  /*
    ARTICOLI DISPONIBILI DA AGGIUNGERE
  */
  const availableItems = useMemo(() => {
    const usedIds = new Set(
      lines.map((line) => line.item.id)
    );

    const text = search.trim().toLowerCase();

    return items
      .filter((item) => !usedIds.has(item.id))
      .filter((item) => {
        if (!text) return true;

        return (
          item.description
            .toLowerCase()
            .includes(text) ||
          item.code
            .toLowerCase()
            .includes(text) ||
          item.supplier_code
            ?.toLowerCase()
            .includes(text)
        );
      });
  }, [items, lines, search]);

  function changeBoxes(
    itemId: string,
    value: number
  ) {
    const safeBoxes = Math.max(
      1,
      Math.floor(Number(value || 1))
    );

    setLines((current) =>
      current.map((line) => {
        if (line.item.id !== itemId) {
          return line;
        }

        const boxQty = Math.max(
          1,
          Number(line.item.box_qty || 1)
        );

        return {
          ...line,
          qty: safeBoxes * boxQty,
        };
      })
    );
  }

  function removeLine(itemId: string) {
    setLines((current) =>
      current.filter(
        (line) => line.item.id !== itemId
      )
    );
  }

  function addItem(item: Item) {
    setLines((current) => {
      const alreadyExists = current.some(
        (line) => line.item.id === item.id
      );

      if (alreadyExists) {
        return current;
      }

      return [
        ...current,
        {
          item,
          qty: Math.max(
            1,
            Number(item.box_qty || 1)
          ),
          variants: [],
          requestedDelivery: "",
          boatUpholsteryId: "",
        },
      ];
    });
  }

  function changeRequestedDelivery(
    itemId: string,
    value: string
  ) {
    setLines((current) =>
      current.map((line) =>
        line.item.id === itemId
          ? { ...line, requestedDelivery: value }
          : line
      )
    );
  }

  /*
    CREA PDF ORDINE

    Il PDF è separato dalla transazione SQL.

    Se il PDF fallisce:
    - l'ordine rimane comunque corretto
    - order_items rimangono corretti
    - on_order rimane corretto
  */
  async function createOrderPdf(
    orderId: string,
    orderLines: OrderLine[],
    orderNumber: number | null
  ) {
    if (!supplier) {
      throw new Error("Fornitore non disponibile");
    }

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const companyLogo = await fetchCompanyLogo();

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const marginLeft = 18;
    const marginRight = 18;
    const contentWidth = pageWidth - marginLeft - marginRight;

    /*
      PALETTE - stesso tono "lettera d'ordine formale" del vecchio
      modulo cartaceo: inchiostro quasi nero, grigio caldo per i
      dettagli secondari, oro per gli accenti di marchio.
    */
    const INK: [number, number, number] = [28, 26, 22];
    const MUTED: [number, number, number] = [122, 116, 104];
    const GOLD: [number, number, number] = [169, 130, 42];
    const GOLD_SOFT: [number, number, number] = [244, 238, 221];
    const BORDER: [number, number, number] = [221, 215, 199];
    const ROW_ALT: [number, number, number] = [250, 248, 242];

    function setInk(c: [number, number, number]) {
      doc.setTextColor(c[0], c[1], c[2]);
    }

    function setDraw(c: [number, number, number]) {
      doc.setDrawColor(c[0], c[1], c[2]);
    }

    function setFill(c: [number, number, number]) {
      doc.setFillColor(c[0], c[1], c[2]);
    }

    function fitFontSize(
      text: string,
      maxSize: number,
      minSize: number,
      maxWidth: number
    ) {
      let size = maxSize;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);

      while (size > minSize && doc.getTextWidth(text) > maxWidth) {
        size -= 0.3;
        doc.setFontSize(size);
      }

      return Math.max(size, minSize);
    }

    /*
      COLONNE TABELLA

      La consegna richiesta e' per singolo articolo (kit diversi
      possono arrivare in mesi diversi), quindi ogni riga ha la sua
      colonna CONSEGNA, valorizzata solo se impostata.
    */
    const colDefs = [
      { key: "riga", label: "Riga", frac: 0.06, align: "center" as const },
      {
        key: "code",
        label: "Cod. articolo",
        frac: 0.19,
        align: "left" as const,
      },
      {
        key: "description",
        label: "Descrizione",
        frac: 0.33,
        align: "left" as const,
      },
      {
        key: "consegna",
        label: "Consegna",
        frac: 0.11,
        align: "center" as const,
      },
      { key: "qty", label: "Q.tà", frac: 0.09, align: "right" as const },
      {
        key: "price",
        label: "Prezzo unit.",
        frac: 0.11,
        align: "right" as const,
      },
      { key: "total", label: "Totale", frac: 0.11, align: "right" as const },
    ];

    const colX: Record<string, number> = {};
    const colW: Record<string, number> = {};

    {
      let x = marginLeft;

      colDefs.forEach((col) => {
        const w = contentWidth * col.frac;
        colX[col.key] = x;
        colW[col.key] = w;
        x += w;
      });
    }

    const cellPad = 2.6;

    /*
      INTESTAZIONE (logo, ragione sociale, indirizzo/contatti/dati
      fiscali su 3 colonne allineate, riga oro di chiusura)
    */
    function drawLetterhead() {
      const logoTop = 16;
      drawCompanyLogoTopLeft(doc, companyLogo, {
        top: logoTop,
        left: marginLeft,
        maxHeight: 13,
      });

      const nameY = logoTop + 13 + 6;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      setInk(INK);
      doc.text(COMPANY_INFO.name, marginLeft, nameY);

      const gridTop = nameY + 6;
      const colWidth = contentWidth / 3;

      const infoCols: { label: string; lines: string[] }[] = [
        { label: "Indirizzo", lines: COMPANY_INFO.address },
        { label: "Contatti", lines: COMPANY_INFO.contacts },
        { label: "Dati fiscali", lines: COMPANY_INFO.fiscal },
      ];

      infoCols.forEach((col, i) => {
        const x = marginLeft + i * colWidth;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        setInk(GOLD);
        doc.text(col.label.toUpperCase(), x, gridTop);

        doc.setFontSize(8);
        setInk(MUTED);

        let lineY = gridTop + 4.3;

        col.lines.forEach((line) => {
          doc.text(line, x, lineY);
          lineY += 3.9;
        });
      });

      const ruleY = gridTop + 4.3 + 4.2 * 4 + 2.5;

      setDraw(GOLD);
      doc.setLineWidth(0.6);
      doc.line(marginLeft, ruleY, pageWidth - marginRight, ruleY);
      doc.setLineWidth(0.2);

      setInk(INK);

      return ruleY;
    }

    function drawDocTitle(ruleY: number) {
      const y = ruleY + 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      setInk(INK);

      doc.text("ORDINE DI ACQUISTO", pageWidth / 2, y, {
        align: "center",
      });

      return y + 9;
    }

    function drawRecipientAndMeta(topY: number) {
      const leftX = marginLeft;
      const rightX = marginLeft + contentWidth * 0.58;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.4);
      setInk(MUTED);
      doc.text("Spett.le", leftX, topY);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      setInk(INK);
      doc.text(supplier!.name, leftX, topY + 5);

      const deliveryDates = Array.from(
        new Set(
          orderLines.map((line) => line.requestedDelivery).filter(Boolean)
        )
      );

      const headerDelivery =
        deliveryDates.length === 0
          ? "-"
          : deliveryDates.length === 1
          ? formatDateForPdf(parseDateInputValue(deliveryDates[0]))
          : "vedi righe sotto";

      function metaLine(yPos: number, label: string, value: string) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.4);
        setInk(MUTED);
        doc.text(label, rightX, yPos);

        const labelWidth = doc.getTextWidth(label);

        doc.setFont("helvetica", "bold");
        setInk(INK);
        doc.text(value, rightX + labelWidth + 1.5, yPos);
      }

      metaLine(topY, "Ordine n.", orderNumber ? String(orderNumber) : "-");
      metaLine(topY + 5, "Data", formatDateForPdf(new Date()));
      metaLine(topY + 10, "Consegna richiesta", headerDelivery);

      let y2 = topY + 18;

      if (!orderNumber) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        setInk(MUTED);
        doc.text(`ID ordine: ${orderId}`, leftX, y2);
        y2 += 5;
      }

      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.6);
      setInk(INK);

      doc.text(
        "Con la presente Vi inviamo il nostro ordine per gli articoli indicati di seguito.",
        leftX,
        y2
      );

      setInk(INK);

      return y2 + 8;
    }

    function drawTableHeader(topY: number) {
      const headerH = 8;

      setFill(GOLD_SOFT);
      doc.rect(marginLeft, topY, contentWidth, headerH, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      setInk(INK);

      const textY = topY + headerH - 2.9;

      colDefs.forEach((col) => {
        const x = colX[col.key];
        const w = colW[col.key];
        const label = col.label.toUpperCase();

        if (col.align === "left") {
          doc.text(label, x + cellPad, textY);
        } else if (col.align === "right") {
          doc.text(label, x + w - cellPad, textY, { align: "right" });
        } else {
          doc.text(label, x + w / 2, textY, { align: "center" });
        }
      });

      setDraw(GOLD);
      doc.setLineWidth(0.45);
      doc.line(marginLeft, topY + headerH, pageWidth - marginRight, topY + headerH);
      doc.setLineWidth(0.2);

      doc.setFont("helvetica", "normal");
      setInk(INK);

      return topY + headerH;
    }

    function drawContinuationHeader() {
      let y = 20;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      setInk(INK);

      doc.text(
        orderNumber
          ? `Ordine di acquisto n. ${orderNumber} - ${supplier!.name} (segue)`
          : `Ordine di acquisto - ${supplier!.name} (segue)`,
        marginLeft,
        y
      );

      y += 8;

      return drawTableHeader(y);
    }

    /*
      DETTAGLI COLORE (kit tappezzeria)

      Chi prepara il kit deve capire a colpo d'occhio quale
      colore/dettaglio/cucitura/trapuntatura usare, senza dover
      decifrare una riga fitta di barre - ma senza nemmeno un
      riquadro pesante che appesantisce il PDF. Una sottile riga
      verticale dorata a sinistra basta a segnalare "questo è un
      dettaglio della riga sopra"; le etichette restano in grigio
      caldo discreto, i valori in inchiostro.
    */
    const VARIANT_CARD_WIDTH =
      colX.qty + colW.qty - colX.description - 2;
    const VARIANT_INDENT = 4;
    const VARIANT_LABEL_WIDTH = 30;
    const VARIANT_FONT_SIZE = 8;
    const VARIANT_LINE_HEIGHT_FACTOR = 1.25;
    const VARIANT_LINE_HEIGHT =
      VARIANT_FONT_SIZE * 0.352778 * VARIANT_LINE_HEIGHT_FACTOR;
    const VARIANT_HEADER_BLOCK = 6.5;
    const VARIANT_BOTTOM_PAD = 1.5;
    const VARIANT_CARD_GAP = 2.5;

    function buildVariantFields(variant: LineVariant) {
      const fields: { label: string; value: string }[] = [];

      if (variant.color) {
        fields.push({ label: "Colore", value: variant.color });
      }

      if (variant.details_logos) {
        fields.push({
          label: "Dettagli e loghi",
          value: variant.details_logos,
        });
      }

      if (variant.stitching) {
        fields.push({ label: "Cucitura", value: variant.stitching });
      }

      if (variant.quilting) {
        fields.push({ label: "Trapuntatura", value: variant.quilting });
      }

      if (variant.note) {
        fields.push({ label: "Nota", value: variant.note });
      }

      return fields.length > 0
        ? fields
        : [{ label: "Dettagli", value: "-" }];
    }

    function layoutVariantCard(variant: LineVariant) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(VARIANT_FONT_SIZE);

      const valueMaxWidth =
        VARIANT_CARD_WIDTH - VARIANT_INDENT - VARIANT_LABEL_WIDTH;

      const fields = buildVariantFields(variant).map((field) => ({
        label: field.label,
        lines: doc.splitTextToSize(field.value, valueMaxWidth),
      }));

      const fieldLineCount = fields.reduce(
        (sum, field) => sum + field.lines.length,
        0
      );

      const height =
        VARIANT_HEADER_BLOCK +
        fieldLineCount * VARIANT_LINE_HEIGHT +
        VARIANT_BOTTOM_PAD;

      return { fields, height };
    }

    function drawVariantCard(
      x: number,
      yTop: number,
      variant: LineVariant,
      layout: {
        fields: { label: string; lines: string[] }[];
        height: number;
      },
      index: number,
      total: number
    ) {
      setDraw(GOLD);
      doc.setLineWidth(0.4);
      doc.line(x, yTop + 0.5, x, yTop + layout.height - 0.5);
      doc.setLineWidth(0.2);

      const contentX = x + VARIANT_INDENT;
      const headerBaseline = yTop + 3;

      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.2);
      setInk(MUTED);

      doc.text(
        total > 1
          ? `Colore ${index + 1} di ${total}`
          : "Dettagli kit",
        contentX,
        headerBaseline
      );

      setInk(INK);

      doc.text(
        `${variant.qty} pz`,
        x + VARIANT_CARD_WIDTH,
        headerBaseline,
        { align: "right" }
      );

      let cy = yTop + VARIANT_HEADER_BLOCK;
      const labelX = contentX;
      const valueX = labelX + VARIANT_LABEL_WIDTH;

      layout.fields.forEach((field) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        setInk(MUTED);
        doc.text(`${field.label}`, labelX, cy);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(VARIANT_FONT_SIZE);
        setInk(INK);
        doc.text(field.lines, valueX, cy, {
          lineHeightFactor: VARIANT_LINE_HEIGHT_FACTOR,
        });

        cy += field.lines.length * VARIANT_LINE_HEIGHT;
      });

      setInk(INK);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
    }

    const rowVPad = 3.3;
    const rowMinH = rowVPad * 2 + 3.6;
    const descLineH = 3.9;

    const ruleY = drawLetterhead();
    let y = drawDocTitle(ruleY);
    y = drawRecipientAndMeta(y);
    y = drawTableHeader(y);

    let totalOrder = 0;

    orderLines.forEach((line, index) => {
      const lineTotal = Number(line.qty || 0) * Number(line.item.price || 0);
      totalOrder += lineTotal;

      const descMaxWidth = colW.description - 2 * cellPad;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.6);

      const descriptionLines = doc.splitTextToSize(
        line.item.description || "-",
        descMaxWidth
      );

      const variantLayouts = line.variants.map((variant) =>
        layoutVariantCard(variant)
      );

      const variantsTopGap = variantLayouts.length > 0 ? 3 : 0;

      const variantsHeight = variantLayouts.reduce(
        (sum, layout, i) =>
          sum + layout.height + (i > 0 ? VARIANT_CARD_GAP : 0),
        0
      );

      const lineBoxQty = Math.max(1, Number(line.item.box_qty || 1));
      const hasBoxQty = lineBoxQty > 1;
      const lineBoxes = Math.ceil(Number(line.qty || 0) / lineBoxQty);

      const rowHeight = Math.max(
        rowMinH,
        rowVPad +
          descriptionLines.length * descLineH +
          (variantsHeight > 0 ? variantsTopGap + variantsHeight : 0) +
          rowVPad
      );

      /*
        NUOVA PAGINA SE SERVE
      */
      if (y + rowHeight > pageHeight - 25) {
        doc.addPage();
        y = drawContinuationHeader();
      }

      const rowTop = y;

      if (index % 2 === 1) {
        setFill(ROW_ALT);
        doc.rect(marginLeft, rowTop, contentWidth, rowHeight, "F");
      }

      const rowTextTop = rowTop + rowVPad + 2.4;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.2);
      setInk(MUTED);

      doc.text(String(index + 1), colX.riga + colW.riga / 2, rowTextTop, {
        align: "center",
      });

      const code = line.item.supplier_code || "-";
      const codeSize = fitFontSize(
        code,
        8.2,
        6,
        colW.code - 2 * cellPad
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(codeSize);
      setInk(INK);
      doc.text(code, colX.code + cellPad, rowTextTop);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.6);
      setInk(INK);
      doc.text(descriptionLines, colX.description + cellPad, rowTextTop);

      if (line.requestedDelivery) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.2);
        setInk(MUTED);

        doc.text(
          formatDateForPdf(parseDateInputValue(line.requestedDelivery)),
          colX.consegna + colW.consegna / 2,
          rowTextTop,
          { align: "center" }
        );
      }

      if (variantLayouts.length > 0) {
        let cardY = rowTop + rowVPad + descriptionLines.length * descLineH + variantsTopGap;

        line.variants.forEach((variant, i) => {
          const layout = variantLayouts[i];

          drawVariantCard(
            colX.description,
            cardY,
            variant,
            layout,
            i,
            line.variants.length
          );

          cardY += layout.height + VARIANT_CARD_GAP;
        });
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.6);
      setInk(INK);

      doc.text(
        String(line.qty),
        colX.qty + colW.qty - cellPad,
        rowTextTop,
        { align: "right" }
      );

      if (hasBoxQty) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.4);
        setInk(MUTED);

        doc.text(
          `${lineBoxes} box`,
          colX.qty + colW.qty - cellPad,
          rowTextTop + 3.4,
          { align: "right" }
        );
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.2);
      setInk(MUTED);

      doc.text(
        formatPdfEuro(line.item.price),
        colX.price + colW.price - cellPad,
        rowTextTop,
        { align: "right" }
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.6);
      setInk(INK);

      doc.text(
        formatPdfEuro(lineTotal),
        colX.total + colW.total - cellPad,
        rowTextTop,
        { align: "right" }
      );

      y = rowTop + rowHeight;

      setDraw(BORDER);
      doc.setLineWidth(0.25);
      doc.line(marginLeft, y, pageWidth - marginRight, y);
      doc.setLineWidth(0.2);
    });

    /*
      TOTALE E CHIUSURA LETTERA
    */
    if (y + 45 > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }

    y += 8;

    setDraw(INK);
    doc.setLineWidth(0.45);

    const totalLineWidth = 78;

    doc.line(
      pageWidth - marginRight - totalLineWidth,
      y,
      pageWidth - marginRight,
      y
    );

    doc.setLineWidth(0.2);

    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.6);
    setInk(MUTED);

    doc.text(
      "Importo totale ordine, IVA escl.",
      pageWidth - marginRight - totalLineWidth,
      y
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    setInk(INK);

    doc.text(
      formatPdfEuro(totalOrder, true),
      pageWidth - marginRight,
      y,
      { align: "right" }
    );

    y += 12;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.6);
    setInk(INK);

    doc.text(
      "In attesa di una Vostra cortese conferma d'ordine, porgiamo distinti saluti.",
      marginLeft,
      y
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(COMPANY_INFO.name, marginLeft, y + 10);

    /*
      PIE' DI PAGINA SU TUTTE LE PAGINE
    */
    const totalPages = doc.getNumberOfPages();

    for (let page = 1; page <= totalPages; page++) {
      doc.setPage(page);

      const footerTextY = pageHeight - 14;
      const footerRuleY = footerTextY - 5.5;

      setDraw(BORDER);
      doc.setLineWidth(0.25);
      doc.line(marginLeft, footerRuleY, pageWidth - marginRight, footerRuleY);
      doc.setLineWidth(0.2);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      setInk(MUTED);

      doc.text(
        "Documento generato automaticamente dal gestionale Italboats.",
        marginLeft,
        footerTextY
      );

      doc.text(
        `Pagina ${page} di ${totalPages}`,
        pageWidth - marginRight,
        footerTextY,
        { align: "right" }
      );
    }

    setInk(INK);

    return doc;
  }

  /*
    CONFERMA ORDINE ATOMICA
  */
  async function confirmOrder() {
    if (!supplier) {
      return;
    }

    if (lines.length === 0) {
      setMessage(
        "Aggiungi almeno un articolo all'ordine."
      );

      setMessageType("error");
      return;
    }

    /*
      CONTROLLO QUANTITÀ
    */
    const invalidLine =
      lines.find(
        (line) =>
          !Number.isFinite(
            Number(line.qty)
          ) ||
          Number(line.qty) <= 0
      );

    if (invalidLine) {
      setMessage(
        "Tutte le quantità devono essere maggiori di zero."
      );

      setMessageType("error");
      return;
    }

    const invalidBoxLine = lines.find(
      (line) => {
        const boxQty = Math.max(
          1,
          Number(line.item.box_qty || 1)
        );

        return (
          Number(line.qty) % boxQty !== 0
        );
      }
    );

    if (invalidBoxLine) {
      setMessage(
        "Le quantità devono corrispondere a box interi."
      );

      setMessageType("error");
      return;
    }

    const confirmed = confirm(
      `Confermi l'ordine a ${supplier.name}?\n\n` +
        `Articoli: ${totalArticles}\n` +
        `Pezzi: ${totalPieces}\n` +
        `Totale: ${formatEuro(totalValue)}`
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setMessage("");
    setMessageType("");

    /*
      PREPARIAMO LE RIGHE DA MANDARE
      ALLA FUNZIONE SQL
    */
    const rpcLines = lines.map(
      (line) => ({
        item_id: line.item.id,
        qty: Number(line.qty),
      })
    );

    /*
      CREAZIONE ATOMICA:

      - orders
      - order_items
      - items.on_order

      tutto insieme.
    */
    const { data, error } =
      await supabase.rpc(
        "create_order_atomic",
        {
          p_supplier_id:
            supplier.id,

          p_lines:
            rpcLines,
        }
      );

    if (error) {
      console.error(
        "Errore creazione ordine atomico:",
        error
      );

      setMessage(
        "Ordine NON creato: " +
          error.message
      );

      setMessageType("error");
      setSaving(false);

      return;
    }

    const result =
      data as AtomicOrderResult | null;

    const orderId =
      result?.order_id;

    if (!orderId) {
      setMessage(
        "Ordine creato, ma non è stato restituito l'ID ordine."
      );

      setMessageType("error");
      setSaving(false);

      return;
    }

    /*
      COLORE/DETTAGLI E CONSEGNA PER RIGA

      L'ordine è già sicuro (righe e quantità create sopra). Questo
      salva solo informazioni in più per riga (colore/dettagli
      tappezzeria, data di consegna richiesta): se fallisce non
      tocchiamo l'ordine già creato, avvisiamo soltanto.
    */
    const linesWithVariants = lines.filter(
      (line) => line.variants.length > 0
    );

    const linesWithDelivery = lines.filter(
      (line) => line.requestedDelivery
    );

    const linesWithBoatUpholstery = lines.filter(
      (line) => line.boatUpholsteryId
    );

    if (
      linesWithVariants.length > 0 ||
      linesWithDelivery.length > 0 ||
      linesWithBoatUpholstery.length > 0
    ) {
      try {
        const { data: orderItemsData, error: orderItemsError } =
          await supabase
            .from("order_items")
            .select("id,item_id")
            .eq("order_id", orderId);

        if (orderItemsError) throw orderItemsError;

        const orderItemIdByItemId = new Map(
          (orderItemsData || []).map((row: any) => [
            String(row.item_id),
            String(row.id),
          ])
        );

        const variantRows = linesWithVariants.flatMap((line) => {
          const orderItemId = orderItemIdByItemId.get(line.item.id);
          if (!orderItemId) return [];

          return line.variants.map((variant) => ({
            order_item_id: orderItemId,
            qty: variant.qty,
            color: variant.color,
            details_logos: variant.details_logos,
            stitching: variant.stitching,
            quilting: variant.quilting,
            note: variant.note || null,
          }));
        });

        if (variantRows.length > 0) {
          const { error: variantsError } = await supabase
            .from("order_item_variants")
            .insert(variantRows);

          if (variantsError) throw variantsError;
        }

        for (const line of linesWithDelivery) {
          const orderItemId = orderItemIdByItemId.get(
            line.item.id
          );

          if (!orderItemId) continue;

          const { error: deliveryError } = await supabase
            .from("order_items")
            .update({
              requested_delivery_date: line.requestedDelivery,
            })
            .eq("id", orderItemId);

          if (deliveryError) throw deliveryError;
        }

        for (const line of linesWithBoatUpholstery) {
          const orderItemId = orderItemIdByItemId.get(
            line.item.id
          );

          if (!orderItemId) continue;

          // Il collegamento "Per battello" e' sulla richiesta
          // tappezzeria del battello (production_boat_upholstery),
          // non piu' su order_items: cosi' la stessa riga d'ordine
          // puo' coprire piu' battelli (STEP 23).
          const { error: boatUpholsteryError } = await supabase
            .from("production_boat_upholstery")
            .update({
              order_item_id: orderItemId,
            })
            .eq("id", line.boatUpholsteryId);

          if (boatUpholsteryError) throw boatUpholsteryError;
        }
      } catch (variantsSaveError: any) {
        console.error(
          "Errore salvataggio colore/dettagli/consegna/battello riga:",
          variantsSaveError
        );
      }
    }

    // Per le righe tappezzeria NON assegnate a mano con "Per battello",
    // prova ad abbinarle in automatico alla richiesta del battello con
    // la consegna richiesta più vicina (stesso fornitore + articolo).
    if (supplier?.upholstery_enabled) {
      const autoLinkItemIds = Array.from(
        new Set(
          lines
            .filter((line) => !line.boatUpholsteryId)
            .map((line) => line.item.id)
        )
      );

      for (const autoItemId of autoLinkItemIds) {
        try {
          await supabase.rpc("sync_upholstery_order_links", {
            p_supplier_id: supplierId,
            p_item_id: autoItemId,
          });
        } catch (syncError) {
          console.error(
            "Errore abbinamento automatico tappezzeria:",
            syncError
          );
        }
      }
    }

    /*
      A QUESTO PUNTO L'ORDINE È GIÀ SICURO.

      Anche se il PDF fallisce:
      NON dobbiamo ricreare l'ordine.
    */
    let orderNumber: number | null = null;

    try {
      const { data: orderRow } = await supabase
        .from("orders")
        .select("order_number")
        .eq("id", orderId)
        .maybeSingle();

      orderNumber =
        orderRow?.order_number ?? null;
    } catch {
      orderNumber = null;
    }

    try {
      const doc =
        await createOrderPdf(
          orderId,
          lines,
          orderNumber
        );

      const pdfBlob =
        doc.output("blob");

      const safeSupplierName =
        supplier.name
          .trim()
          .replace(
            /[\\/:*?"<>|]/g,
            "-"
          )
          .replace(
            /\s+/g,
            "_"
          );

      const pdfPath =
        `${supplier.id}/${orderId}_${safeSupplierName}.pdf`;

      /*
        UPLOAD PDF
      */
      const {
        error: uploadError,
      } = await supabase.storage
        .from("orders-pdf")
        .upload(
          pdfPath,
          pdfBlob,
          {
            contentType:
              "application/pdf",

            upsert: false,
          }
        );

      if (uploadError) {
        throw new Error(
          uploadError.message
        );
      }

      /*
        URL PUBBLICO
      */
      const {
        data: publicUrlData,
      } = supabase.storage
        .from("orders-pdf")
        .getPublicUrl(
          pdfPath
        );

      const pdfUrl =
        publicUrlData.publicUrl;

      /*
        SALVIAMO URL E PATH NELL'ORDINE

        requested_delivery_date sull'ordine resta come riepilogo
        (la consegna più vicina tra le righe), usato nella lista
        ordini: la data vera, per articolo, è su order_items.
      */
      const earliestDelivery = linesWithDelivery
        .map((line) => line.requestedDelivery)
        .sort()[0] || null;

      const {
        error: pdfUpdateError,
      } = await supabase
        .from("orders")
        .update({
          pdf_path:
            pdfPath,

          pdf_url:
            pdfUrl,

          requested_delivery_date:
            earliestDelivery,
        })
        .eq(
          "id",
          orderId
        );

      if (pdfUpdateError) {
        throw new Error(
          pdfUpdateError.message
        );
      }

      alert(
        "Ordine creato correttamente."
      );

      router.push(
        `/orders/${orderId}`
      );

      return;
    } catch (pdfError: any) {
      console.error(
        "Errore PDF ordine:",
        pdfError
      );

      /*
        IMPORTANTE:

        NON cancelliamo l'ordine
        e NON proviamo a ricrearlo.

        L'ordine è già stato creato
        correttamente dalla funzione atomica.
      */
      alert(
        "L'ordine è stato creato correttamente, " +
          "ma il PDF non è stato salvato.\n\n" +
          "Ordine ID:\n" +
          orderId
      );

      router.push(
        `/orders/${orderId}`
      );

      return;
    } finally {
      setSaving(false);
    }
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
        Preparazione ordine...
      </div>
    );
  }

  if (!supplier) {
    return (
      <div
        style={{
          maxWidth: 1500,
          margin: "0 auto",
        }}
      >
        Fornitore non trovato.
      </div>
    );
  }

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
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap: 20,
          flexWrap: "wrap",
          marginBottom: 25,
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
            Ordini / Nuovo ordine
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 34,
              fontWeight: 850,
              letterSpacing:
                "-0.5px",
            }}
          >
            {supplier.name}
          </h1>

          <div
            style={{
              marginTop: 7,
              fontSize: 14,
              opacity: 0.6,
            }}
          >
            Controlla la proposta automatica,
            modifica le quantità e conferma
            l&apos;ordine.
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            router.push(
              "/orders"
            )
          }
          disabled={saving}
          style={secondaryButtonStyle}
        >
          ← Torna agli ordini
        </button>
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
          {message}
        </div>
      )}

      {/* RIEPILOGO */}

      <div
        style={{
          display: "grid",

          gridTemplateColumns:
            "repeat(auto-fit, minmax(210px, 1fr))",

          gap: 14,
          marginBottom: 22,
        }}
      >
        <SummaryCard
          title="Articoli"
          value={String(
            totalArticles
          )}
          subtitle="Codici presenti nell'ordine"
        />

        <SummaryCard
          title="Box"
          value={String(
            totalBoxes
          )}
          subtitle="Confezioni totali"
        />

        <SummaryCard
          title="Pezzi"
          value={String(
            totalPieces
          )}
          subtitle="Quantità totale"
        />

        <SummaryCard
          title="Totale ordine"
          value={formatEuro(
            totalValue
          )}
          subtitle="Valore complessivo"
        />
      </div>

      {/* RIGHE ORDINE */}

      <div style={cardStyle}>
        <div
          style={{
            padding:
              "16px 18px",

            display: "flex",

            justifyContent:
              "space-between",

            alignItems:
              "center",

            gap: 15,

            flexWrap: "wrap",

            background:
              "var(--table-head)",

            borderBottom:
              "1px solid var(--border-color)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 850,
              }}
            >
              Articoli ordine
            </div>

            <div
              style={{
                marginTop: 3,
                fontSize: 12,
                opacity: 0.55,
              }}
            >
              La proposta automatica considera
              giacenza, scorta minima, merce già in ordine,
              quantità per box e le richieste battello ancora
              "da ordinare". Gli ordini vengono arrotondati
              sempre a confezioni intere.
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              setShowAddItems(
                !showAddItems
              )
            }
            disabled={saving}
            style={
              secondaryButtonStyle
            }
          >
            {showAddItems
              ? "Chiudi aggiunta articoli"
              : "+ Aggiungi articolo"}
          </button>
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
                  Prezzo
                </TableHead>

                <TableHead align="right">
                  Giacenza
                </TableHead>

                <TableHead align="right">
                  Scorta min.
                </TableHead>

                <TableHead align="right">
                  Già in ordine
                </TableHead>

                <TableHead align="right">
                  Pz / box
                </TableHead>

                <TableHead align="right">
                  Box
                </TableHead>

                <TableHead align="right">
                  Quantità pz
                </TableHead>

                <TableHead>
                  Consegna richiesta
                </TableHead>

                <TableHead align="right">
                  Totale
                </TableHead>

                <TableHead>
                  Azione
                </TableHead>

                {supplier?.upholstery_enabled && (
                  <TableHead>
                    Colore / dettagli
                  </TableHead>
                )}

                {supplier?.upholstery_enabled && (
                  <TableHead>
                    Per battello
                  </TableHead>
                )}
              </tr>
            </thead>

            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      supplier?.upholstery_enabled
                        ? 15
                        : 13
                    }
                    style={{
                      padding: 40,
                      textAlign:
                        "center",
                      opacity: 0.55,
                    }}
                  >
                    Nessun articolo nella proposta.
                    Puoi aggiungerli manualmente con
                    “+ Aggiungi articolo”.
                  </td>
                </tr>
              ) : (
                lines.map((line) => (
                  <Fragment key={line.item.id}>
                  <tr
                    style={{
                      borderTop:
                        "1px solid var(--border-color)",
                    }}
                  >
                    <TableCell>
                      <strong>
                        {line.item
                          .supplier_code ||
                          "-"}
                      </strong>
                    </TableCell>

                    <TableCell>
                      {line.item.code ||
                        "-"}
                    </TableCell>

                    <TableCell>
                      {
                        line.item
                          .description
                      }
                    </TableCell>

                    <TableCell align="right">
                      {formatEuro(
                        line.item.price
                      )}
                    </TableCell>

                    <TableCell align="right">
                      {
                        line.item
                          .stock
                      }
                    </TableCell>

                    <TableCell align="right">
                      {
                        line.item
                          .min_stock
                      }
                    </TableCell>

                    <TableCell align="right">
                      {
                        line.item
                          .on_order
                      }
                    </TableCell>

                    <TableCell align="right">
                      <strong>
                        {Math.max(
                          1,
                          Number(
                            line.item
                              .box_qty || 1
                          )
                        )}
                      </strong>
                    </TableCell>

                    <TableCell align="right">
                      <input
                        type="number"
                        min="1"
                        step="1"

                        value={Math.max(
                          1,
                          Math.round(
                            Number(
                              line.qty || 0
                            ) /
                              Math.max(
                                1,
                                Number(
                                  line.item
                                    .box_qty ||
                                    1
                                )
                              )
                          )
                        )}

                        disabled={
                          saving
                        }

                        onChange={(e) =>
                          changeBoxes(
                            line.item.id,
                            Number(
                              e.target
                                .value
                            )
                          )
                        }

                        style={{
                          width: 76,

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
                        }}
                      />
                    </TableCell>

                    <TableCell align="right">
                      <strong>
                        {line.qty}
                      </strong>
                    </TableCell>

                    <TableCell>
                      <input
                        type="date"
                        value={
                          line.requestedDelivery
                        }
                        disabled={saving}
                        onChange={(e) =>
                          changeRequestedDelivery(
                            line.item.id,
                            e.target.value
                          )
                        }
                        style={{
                          minHeight: 34,
                          padding: "0 8px",
                          border:
                            "1px solid var(--border-color)",
                          borderRadius: 7,
                          background:
                            "var(--input-bg)",
                          color:
                            "var(--foreground)",
                          outline: "none",
                          fontSize: 12,
                          width: 128,
                        }}
                      />
                    </TableCell>

                    <TableCell align="right">
                      <strong>
                        {formatEuro(
                          line.qty *
                            line.item
                              .price
                        )}
                      </strong>
                    </TableCell>

                    <TableCell>
                      <button
                        type="button"
                        disabled={
                          saving
                        }
                        onClick={() =>
                          removeLine(
                            line.item.id
                          )
                        }
                        style={{
                          padding:
                            "7px 10px",

                          borderRadius: 7,

                          border:
                            "1px solid rgba(239,68,68,0.35)",

                          background:
                            "rgba(239,68,68,0.08)",

                          color:
                            "#ef4444",

                          cursor:
                            saving
                              ? "not-allowed"
                              : "pointer",

                          fontWeight: 750,
                        }}
                      >
                        Togli
                      </button>
                    </TableCell>

                    {supplier?.upholstery_enabled && (
                      <TableCell>
                        <button
                          type="button"
                          onClick={() =>
                            openVariantItemId === line.item.id
                              ? closeVariantEditor()
                              : openVariantEditor(line.item.id)
                          }
                          style={{
                            padding: "7px 10px",
                            borderRadius: 7,
                            border: "1px solid rgba(96,165,250,0.35)",
                            background: "rgba(59,130,246,0.08)",
                            color: "#3b82f6",
                            cursor: "pointer",
                            fontWeight: 750,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {line.variants.length > 0
                            ? `${line.variants.length} colore/i`
                            : "+ Colore"}
                        </button>
                      </TableCell>
                    )}

                    {supplier?.upholstery_enabled && (
                      <TableCell>
                        <select
                          value={line.boatUpholsteryId}
                          disabled={saving}
                          onChange={(e) =>
                            changeBoatUpholstery(
                              line.item.id,
                              e.target.value
                            )
                          }
                          style={{
                            minHeight: 34,
                            padding: "0 8px",
                            border:
                              "1px solid var(--border-color)",
                            borderRadius: 7,
                            background:
                              "var(--input-bg)",
                            color:
                              "var(--foreground)",
                            outline: "none",
                            fontSize: 12,
                            maxWidth: 180,
                          }}
                        >
                          <option value="">
                            Automatico (consegna più vicina)
                          </option>
                          {boatRequestsFor(line.item.id).map(
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
                      </TableCell>
                    )}
                  </tr>

                  {supplier?.upholstery_enabled &&
                    openVariantItemId === line.item.id && (
                      <tr>
                        <td
                          colSpan={13}
                          style={{
                            padding: "12px 14px",
                            background: "rgba(59,130,246,0.05)",
                            borderBottom:
                              "1px solid var(--border-color)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                              alignItems: "flex-end",
                            }}
                          >
                            <VariantField label="Colore">
                              <select
                                value={variantDraft.color}
                                onChange={(e) =>
                                  setVariantDraft((c) => ({
                                    ...c,
                                    color: e.target.value,
                                  }))
                                }
                              >
                                <option value="">Seleziona...</option>
                                {upholsteryOptions.color.map((opt) => (
                                  <option key={opt.id} value={opt.name}>
                                    {opt.name}
                                  </option>
                                ))}
                              </select>
                            </VariantField>

                            <VariantField label="Dettagli e loghi">
                              <select
                                value={variantDraft.details_logos}
                                onChange={(e) =>
                                  setVariantDraft((c) => ({
                                    ...c,
                                    details_logos: e.target.value,
                                  }))
                                }
                              >
                                <option value="">Seleziona...</option>
                                {upholsteryOptions.details_logos.map((opt) => (
                                  <option key={opt.id} value={opt.name}>
                                    {opt.name}
                                  </option>
                                ))}
                              </select>
                            </VariantField>

                            <VariantField label="Cucitura">
                              <select
                                value={variantDraft.stitching}
                                onChange={(e) =>
                                  setVariantDraft((c) => ({
                                    ...c,
                                    stitching: e.target.value,
                                  }))
                                }
                              >
                                <option value="">Seleziona...</option>
                                {upholsteryOptions.stitching.map((opt) => (
                                  <option key={opt.id} value={opt.name}>
                                    {opt.name}
                                  </option>
                                ))}
                              </select>
                            </VariantField>

                            <VariantField label="Trapuntatura">
                              <select
                                value={variantDraft.quilting}
                                onChange={(e) =>
                                  setVariantDraft((c) => ({
                                    ...c,
                                    quilting: e.target.value,
                                  }))
                                }
                              >
                                <option value="">Seleziona...</option>
                                {upholsteryOptions.quilting.map((opt) => (
                                  <option key={opt.id} value={opt.name}>
                                    {opt.name}
                                  </option>
                                ))}
                              </select>
                            </VariantField>

                            <VariantField label="Pezzi">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={variantDraft.qty}
                                onChange={(e) =>
                                  setVariantDraft((c) => ({
                                    ...c,
                                    qty: e.target.value,
                                  }))
                                }
                                style={{ width: 64 }}
                              />
                            </VariantField>

                            <VariantField label="Nota (facoltativa)">
                              <input
                                value={variantDraft.note}
                                onChange={(e) =>
                                  setVariantDraft((c) => ({
                                    ...c,
                                    note: e.target.value,
                                  }))
                                }
                                style={{ width: 140 }}
                              />
                            </VariantField>

                            <button
                              type="button"
                              onClick={() => addVariant(line.item.id)}
                              style={{
                                padding: "9px 14px",
                                borderRadius: 7,
                                border: "1px solid #2563eb",
                                background: "#2563eb",
                                color: "#fff",
                                cursor: "pointer",
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                              }}
                            >
                              + Aggiungi
                            </button>

                            <button
                              type="button"
                              onClick={closeVariantEditor}
                              style={{
                                padding: "9px 14px",
                                borderRadius: 7,
                                border: "1px solid var(--border-color)",
                                background: "transparent",
                                color: "inherit",
                                cursor: "pointer",
                                fontWeight: 700,
                              }}
                            >
                              Chiudi
                            </button>
                          </div>

                          {line.variants.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                              {line.variants.map((variant) => (
                                <div
                                  key={variant.id}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "6px 0",
                                    fontSize: 12,
                                  }}
                                >
                                  <span>
                                    {variant.color} / {variant.details_logos} /{" "}
                                    {variant.stitching} / {variant.quilting}
                                    {variant.note ? ` — ${variant.note}` : ""}
                                  </span>
                                  <strong>{variant.qty} pz</strong>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeVariant(line.item.id, variant.id)
                                    }
                                    style={{
                                      marginLeft: "auto",
                                      padding: "4px 9px",
                                      borderRadius: 6,
                                      border:
                                        "1px solid rgba(239,68,68,0.35)",
                                      background: "rgba(239,68,68,0.08)",
                                      color: "#ef4444",
                                      cursor: "pointer",
                                      fontSize: 11,
                                      fontWeight: 750,
                                    }}
                                  >
                                    Rimuovi
                                  </button>
                                </div>
                              ))}
                              <div
                                style={{
                                  marginTop: 4,
                                  fontSize: 11,
                                  opacity: 0.6,
                                }}
                              >
                                Totale assegnato:{" "}
                                {line.variants.reduce(
                                  (sum, v) => sum + v.qty,
                                  0
                                )}{" "}
                                / {line.qty} pz
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AGGIUNTA ARTICOLI */}

      {showAddItems && (
        <div
          style={{
            marginTop: 18,

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
              fontSize: 18,
              fontWeight: 850,
              marginBottom: 12,
            }}
          >
            Aggiungi articolo
          </div>

          <input
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            placeholder="Cerca codice articolo, scanner o descrizione..."
            style={{
              width: "100%",
              boxSizing:
                "border-box",

              padding:
                "12px 14px",

              borderRadius: 8,

              border:
                "1px solid var(--border-color)",

              background:
                "var(--input-bg)",

              color:
                "var(--foreground)",

              outline: "none",

              fontSize: 14,

              marginBottom: 12,
            }}
          />

          <div
            style={{
              maxHeight: 350,
              overflowY: "auto",

              border:
                "1px solid var(--border-color)",

              borderRadius: 9,
            }}
          >
            {availableItems.length ===
            0 ? (
              <div
                style={{
                  padding: 25,
                  textAlign:
                    "center",
                  opacity: 0.55,
                }}
              >
                Nessun articolo disponibile.
              </div>
            ) : (
              availableItems.map(
                (item) => (
                  <div
                    key={item.id}
                    style={{
                      padding:
                        "12px 14px",

                      display: "flex",

                      justifyContent:
                        "space-between",

                      alignItems:
                        "center",

                      gap: 15,

                      borderBottom:
                        "1px solid var(--border-color)",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 850,
                        }}
                      >
                        {item.supplier_code ||
                          "-"}
                      </div>

                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 13,
                        }}
                      >
                        {item.description}
                      </div>

                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 11,
                          opacity: 0.55,
                        }}
                      >
                        Scanner:{" "}
                        {item.code ||
                          "-"}{" "}
                        · Giacenza:{" "}
                        {item.stock} ·
                        Scorta min.:{" "}
                        {
                          item.min_stock
                        }{" "}
                        · €{" "}
                        {Number(
                          item.price
                        ).toFixed(2)}
                      </div>
                    </div>

                    <button
                      type="button"

                      disabled={
                        saving
                      }

                      onClick={() =>
                        addItem(item)
                      }

                      style={
                        primarySmallButton
                      }
                    >
                      Aggiungi
                    </button>
                  </div>
                )
              )
            )}
          </div>
        </div>
      )}

      {/* CONFERMA */}

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

          alignItems:
            "center",

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
            Conferma ordine
          </div>

          <div
            style={{
              marginTop: 5,
              fontSize: 13,
              opacity: 0.6,
            }}
          >
            L&apos;ordine, le righe e le quantità
            “in ordine” verranno registrati insieme
            in un&apos;unica operazione sicura.
          </div>

          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              opacity: 0.55,
            }}
          >
            La data di consegna richiesta si imposta
            per ogni articolo nella tabella qui sopra
            (facoltativa).
          </div>
        </div>

        <button
          type="button"

          onClick={
            confirmOrder
          }

          disabled={
            saving ||
            lines.length === 0
          }

          style={primaryButtonStyle(
            saving ||
              lines.length === 0
          )}
        >
          {saving
            ? "Creazione ordine..."
            : "Conferma ordine"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- COMPONENTI ---------------- */

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
  align?: "left" | "right";
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
  align?: "left" | "right";
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

function VariantField({
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
      <span style={{ opacity: 0.6, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

/* ---------------- FORMATTAZIONE ---------------- */

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

function formatPdfEuro(
  value: number,
  symbolFirst = false
) {
  const formatted = new Intl.NumberFormat(
    "it-IT",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  ).format(
    Number(value || 0)
  );

  return symbolFirst
    ? `EUR ${formatted}`
    : `${formatted} EUR`;
}

function formatDateForPdf(
  date: Date
) {
  return new Intl.DateTimeFormat(
    "it-IT",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  ).format(date);
}

/*
  Converte il valore "AAAA-MM-GG" di un <input type="date"> in un
  oggetto Date sui componenti locali, per evitare che il fuso
  orario faccia scivolare la data di un giorno indietro (come
  succede con "new Date('AAAA-MM-GG')", che viene letta come UTC).
*/
function parseDateInputValue(value: string) {
  const [year, month, day] = value
    .split("-")
    .map((part) => Number(part));

  return new Date(year, (month || 1) - 1, day || 1);
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
  minWidth: 1480,

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

const primarySmallButton = {
  padding:
    "8px 12px",

  borderRadius: 7,

  border:
    "1px solid var(--foreground)",

  background:
    "var(--foreground)",

  color:
    "var(--background)",

  cursor: "pointer",

  fontWeight: 800,
};

function primaryButtonStyle(
  disabled: boolean
) {
  return {
    padding:
      "12px 19px",

    borderRadius: 9,

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

    opacity: disabled
      ? 0.5
      : 1,
  };
}