"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { supabase } from "../../../lib/supabaseClient";
import { fetchCompanyLogo, drawCompanyLogoTopRight } from "../../../lib/pdfLogo";

type Item = {
  id: string;
  supplier_id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  stock: number;
};

type Supplier = {
  id: string;
  name: string;
};

type ModelOption = {
  id: string;
  name: string;
};

type MatrixRow = {
  id: string;
  model_boat: string;
  item_id: string;
  note: string | null;
};

type Kit = {
  id: string;
  item_id: string;
  matricola: string | null;
  unit_price: number | null;
  status: "stock" | "out";
  note: string | null;
  boat_id: string | null;
  boat_registration: string | null;
  received_at: string;
  out_at: string | null;
};

type Boat = {
  id: string;
  progressive_no: number | null;
  order_number: string;
  model_boat: string;
  requested_delivery_date: string | null;
};

type Requirement = {
  id: string;
  boat_id: string;
  item_id: string;
  kit_id: string | null;
  order_item_id: string | null;
};

function formatItDate(value: string | null) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatMoney(value: number | null) {
  if (value === null || value === undefined) return "";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
}

export default function ParabrezzaPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [newMappingModel, setNewMappingModel] = useState("");
  const [newMappingItemId, setNewMappingItemId] = useState("");
  const [savingMapping, setSavingMapping] = useState(false);

  const [kitItemId, setKitItemId] = useState("");
  const [kitMatricola, setKitMatricola] = useState("");
  const [kitPrice, setKitPrice] = useState("");
  const [kitNote, setKitNote] = useState("");
  const [kitFilter, setKitFilter] = useState("");
  const [savingKit, setSavingKit] = useState(false);
  const [convertItemId, setConvertItemId] = useState("");
  const [convertQuantity, setConvertQuantity] = useState("");
  const [convertingStock, setConvertingStock] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [busyKitId, setBusyKitId] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const [itemsRes, suppliersRes, optionsRes, matrixRes, kitsRes, boatsRes, reqRes] =
      await Promise.all([
        supabase
          .from("items")
          .select("id,supplier_id,code,supplier_code,description,stock")
          .order("description", { ascending: true }),
        supabase.from("suppliers").select("id,name").order("name", { ascending: true }),
        supabase
          .from("production_options")
          .select("id,option_type,name,active")
          .eq("option_type", "model")
          .eq("active", true)
          .order("name", { ascending: true }),
        supabase
          .from("production_windshield_matrix")
          .select("id,model_boat,item_id,note")
          .order("model_boat", { ascending: true }),
        supabase
          .from("windshield_kits")
          .select(
            "id,item_id,matricola,unit_price,status,note,boat_id,boat_registration,received_at,out_at"
          )
          .order("received_at", { ascending: false }),
        supabase
          .from("production_boats")
          .select("id,progressive_no,order_number,model_boat,requested_delivery_date")
          .order("requested_delivery_date", { ascending: true, nullsFirst: false }),
        supabase
          .from("production_boat_windshield")
          .select("id,boat_id,item_id,kit_id,order_item_id"),
      ]);

    if (itemsRes.error) {
      setErrorMessage("Errore caricamento articoli: " + itemsRes.error.message);
      setLoading(false);
      return;
    }

    setItems(
      (itemsRes.data || []).map((row: any) => ({
        id: String(row.id),
        supplier_id: String(row.supplier_id || ""),
        code: String(row.code || ""),
        supplier_code: row.supplier_code ? String(row.supplier_code) : null,
        description: String(row.description || ""),
        stock: Number(row.stock || 0),
      }))
    );

    setSuppliers(
      (suppliersRes.data || []).map((row: any) => ({
        id: String(row.id),
        name: String(row.name || ""),
      }))
    );

    setModelOptions(
      (optionsRes.data || []).map((row: any) => ({
        id: String(row.id),
        name: String(row.name || ""),
      }))
    );

    // La tabella e le funzioni dello STEP 25 potrebbero non essere ancora
    // state create sul database: in quel caso queste query falliscono da
    // sole senza bloccare il resto della pagina (mostriamo solo un avviso).
    if (matrixRes.error) {
      setErrorMessage(
        "Le tabelle del sistema parabrezza non risultano ancora create: fai girare STEP25_PARABREZZA_AUTOMATICO.sql su Supabase, poi ricarica questa pagina."
      );
      setLoading(false);
      return;
    }

    setMatrix(
      (matrixRes.data || []).map((row: any) => ({
        id: String(row.id),
        model_boat: String(row.model_boat || ""),
        item_id: String(row.item_id || ""),
        note: row.note ? String(row.note) : null,
      }))
    );

    setKits(
      (kitsRes.data || []).map((row: any) => ({
        id: String(row.id),
        item_id: String(row.item_id || ""),
        matricola: row.matricola ? String(row.matricola) : null,
        unit_price: row.unit_price === null || row.unit_price === undefined ? null : Number(row.unit_price),
        status: row.status === "out" ? "out" : "stock",
        note: row.note ? String(row.note) : null,
        boat_id: row.boat_id ? String(row.boat_id) : null,
        boat_registration: row.boat_registration ? String(row.boat_registration) : null,
        received_at: String(row.received_at || ""),
        out_at: row.out_at ? String(row.out_at) : null,
      }))
    );

    setBoats(
      (boatsRes.data || []).map((row: any) => ({
        id: String(row.id),
        progressive_no:
          row.progressive_no === null || row.progressive_no === undefined
            ? null
            : Number(row.progressive_no),
        order_number: String(row.order_number || ""),
        model_boat: String(row.model_boat || ""),
        requested_delivery_date: row.requested_delivery_date
          ? String(row.requested_delivery_date)
          : null,
      }))
    );

    setRequirements(
      (reqRes.data || []).map((row: any) => ({
        id: String(row.id),
        boat_id: String(row.boat_id || ""),
        item_id: String(row.item_id || ""),
        kit_id: row.kit_id ? String(row.kit_id) : null,
        order_item_id: row.order_item_id ? String(row.order_item_id) : null,
      }))
    );

    setLoading(false);
  }

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const supplierMap = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])),
    [suppliers]
  );
  const boatMap = useMemo(() => new Map(boats.map((boat) => [boat.id, boat])), [boats]);

  function itemLabel(itemId: string) {
    const item = itemMap.get(itemId);
    if (!item) return "Articolo non trovato";
    // Il fornitore e' sempre Paris Plast su questa pagina: ripeterlo
    // ad ogni articolo era solo rumore, si mostra solo codice e
    // descrizione.
    const code = item.supplier_code || item.code;
    return `${code} — ${item.description}`;
  }

  // Un modello puo' avere piu' articoli abbinati (STEP 29): non si
  // nasconde piu' dal picker un modello gia' mappato, si mostra solo
  // quanti articoli ha gia' cosi' e' chiaro che se ne sta aggiungendo
  // un altro.
  const articleCountByModel = useMemo(() => {
    const counts = new Map<string, number>();
    matrix.forEach((row) => {
      counts.set(row.model_boat, (counts.get(row.model_boat) || 0) + 1);
    });
    return counts;
  }, [matrix]);

  // Il fornitore dei parabrezza e' solo Paris Plast: i selettori di
  // articolo mostrano solo il suo catalogo, non tutto il magazzino.
  const parisPlastSupplierId = useMemo(
    () =>
      suppliers.find((supplier) => supplier.name.toUpperCase().includes("PARIS PLAST"))?.id ||
      "",
    [suppliers]
  );

  const parisPlastItems = useMemo(
    () =>
      parisPlastSupplierId
        ? items.filter((item) => item.supplier_id === parisPlastSupplierId)
        : items,
    [items, parisPlastSupplierId]
  );

  // Articoli Paris Plast gia' abbinati al modello scelto nel form: si
  // escludono dal picker per evitare di riproporre lo stesso articolo
  // due volte sullo stesso modello (bloccato comunque a livello DB).
  const alreadyMappedItemIds = useMemo(() => {
    if (!newMappingModel) return new Set<string>();
    return new Set(
      matrix.filter((row) => row.model_boat === newMappingModel).map((row) => row.item_id)
    );
  }, [matrix, newMappingModel]);

  const availableItemsForNewMapping = useMemo(
    () => parisPlastItems.filter((item) => !alreadyMappedItemIds.has(item.id)),
    [parisPlastItems, alreadyMappedItemIds]
  );

  const filteredItemsForKit = useMemo(() => {
    const term = kitFilter.trim().toLowerCase();
    if (!term) return parisPlastItems;
    return parisPlastItems.filter((item) => {
      const supplierName = (supplierMap.get(item.supplier_id) || "").toLowerCase();
      return (
        item.description.toLowerCase().includes(term) ||
        item.code.toLowerCase().includes(term) ||
        (item.supplier_code || "").toLowerCase().includes(term) ||
        supplierName.includes(term)
      );
    });
  }, [parisPlastItems, kitFilter, supplierMap]);

  async function addMapping() {
    setMessage("");
    setErrorMessage("");

    if (!newMappingModel || !newMappingItemId) {
      setErrorMessage("Scegli un modello e un articolo.");
      return;
    }

    setSavingMapping(true);

    const { error } = await supabase
      .from("production_windshield_matrix")
      .insert({ model_boat: newMappingModel, item_id: newMappingItemId });

    if (error) {
      setErrorMessage("Errore salvataggio mappatura: " + error.message);
      setSavingMapping(false);
      return;
    }

    // Aggancia subito anche i battelli di questo modello gia' in
    // produzione: senza questa chiamata resterebbero per sempre
    // senza parabrezza tracciato (la richiesta si crea solo alla
    // creazione del battello, non retroattivamente).
    const { data: backfilledCount, error: backfillError } = await supabase.rpc(
      "backfill_windshield_requirements_for_model",
      { p_model_boat: newMappingModel }
    );

    if (backfillError) {
      console.error("Errore aggancio battelli esistenti:", backfillError);
    }

    const boatsNote =
      !backfillError && backfilledCount
        ? ` Agganciati anche ${backfilledCount} battelli già in produzione di questo modello.`
        : "";

    setMessage(`Mappatura salvata: ${newMappingModel} → ${itemLabel(newMappingItemId)}.${boatsNote}`);
    setNewMappingModel("");
    setNewMappingItemId("");
    setSavingMapping(false);
    await loadData();
  }

  async function updateMappingItem(mappingId: string, itemId: string) {
    setMessage("");
    setErrorMessage("");

    const mapping = matrix.find((row) => row.id === mappingId);

    const { error } = await supabase
      .from("production_windshield_matrix")
      .update({ item_id: itemId, updated_at: new Date().toISOString() })
      .eq("id", mappingId);

    if (error) {
      setErrorMessage("Errore aggiornamento mappatura: " + error.message);
      return;
    }

    // Aggancia anche eventuali battelli di questo modello che per
    // qualche motivo fossero rimasti senza richiesta parabrezza
    // (non tocca quelli che ne hanno gia' una con l'articolo vecchio).
    if (mapping) {
      const { error: backfillError } = await supabase.rpc(
        "backfill_windshield_requirements_for_model",
        { p_model_boat: mapping.model_boat }
      );
      if (backfillError) {
        console.error("Errore aggancio battelli esistenti:", backfillError);
      }
    }

    await loadData();
  }

  async function deleteMapping(mappingId: string, modelBoat: string) {
    const ok = window.confirm(`Togliere la mappatura per "${modelBoat}"?`);
    if (!ok) return;

    setMessage("");
    setErrorMessage("");

    const { error } = await supabase
      .from("production_windshield_matrix")
      .delete()
      .eq("id", mappingId);

    if (error) {
      setErrorMessage("Errore eliminazione mappatura: " + error.message);
      return;
    }

    setMessage("Mappatura rimossa.");
    await loadData();
  }

  async function registerKit() {
    setMessage("");
    setErrorMessage("");

    if (!kitItemId) {
      setErrorMessage("Scegli l'articolo del parabrezza arrivato.");
      return;
    }

    setSavingKit(true);

    const priceNumber = kitPrice.trim() ? Number(kitPrice.trim().replace(",", ".")) : null;

    const { data: kitId, error } = await supabase.rpc("create_windshield_stock_kit", {
      p_item_id: kitItemId,
      p_matricola: kitMatricola.trim() || null,
      p_unit_price: priceNumber,
      p_note: kitNote.trim() || null,
    });

    if (error || !kitId) {
      setErrorMessage("Errore registrazione arrivo: " + (error?.message || ""));
      setSavingKit(false);
      return;
    }

    const { data: assignedReqId, error: priorityError } = await supabase.rpc(
      "assign_windshield_stock_kit_by_priority",
      { p_kit_id: kitId }
    );

    if (priorityError) {
      console.error("Errore assegnazione automatica parabrezza:", priorityError);
    }

    if (assignedReqId) {
      setMessage("Arrivo registrato e assegnato subito al battello in attesa con la consegna più vicina.");
    } else {
      setMessage("Arrivo registrato in giacenza. Nessun battello in attesa di questo articolo al momento.");
    }

    setKitMatricola("");
    setKitPrice("");
    setKitNote("");
    setSavingKit(false);
    await loadData();
  }

  // Trasforma pezzi gia' in giacenza generale (arrivati da Movimenti o
  // da un ordine, mai passati da "Registra un arrivo") in pezzi
  // tracciati singolarmente, pronti per l'assegnazione automatica.
  // Non tocca items.stock: quei pezzi sono gia' conteggiati li'.
  async function convertStock() {
    setMessage("");
    setErrorMessage("");

    const quantity = Number(convertQuantity.trim());

    if (!convertItemId) {
      setErrorMessage("Scegli l'articolo da convertire.");
      return;
    }
    if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) {
      setErrorMessage("Inserisci una quantità valida.");
      return;
    }

    setConvertingStock(true);

    const { data, error } = await supabase.rpc("convert_item_stock_to_windshield_kits", {
      p_item_id: convertItemId,
      p_quantity: quantity,
    });

    if (error) {
      setErrorMessage("Errore conversione giacenza: " + error.message);
      setConvertingStock(false);
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const created = Number(result?.created || 0);
    const assigned = Number(result?.assigned || 0);

    setMessage(
      assigned > 0
        ? `Convertiti ${created} pezzi in giacenza tracciata, ${assigned} assegnati subito ai battelli in attesa.`
        : `Convertiti ${created} pezzi in giacenza tracciata.`
    );
    setConvertItemId("");
    setConvertQuantity("");
    setConvertingStock(false);
    await loadData();
  }

  async function deleteKit(kit: Kit) {
    const ok = window.confirm("Eliminare questo kit dalla giacenza?");
    if (!ok) return;

    setMessage("");
    setErrorMessage("");
    setBusyKitId(kit.id);

    const { error } = await supabase.rpc("delete_windshield_stock_kit", { p_kit_id: kit.id });

    if (error) {
      setErrorMessage("Errore eliminazione kit: " + error.message);
      setBusyKitId("");
      return;
    }

    setMessage("Kit eliminato dalla giacenza.");
    setBusyKitId("");
    await loadData();
  }

  async function releaseKit(kit: Kit) {
    const ok = window.confirm("Liberare questo parabrezza dal battello a cui è assegnato?");
    if (!ok) return;

    setMessage("");
    setErrorMessage("");
    setBusyKitId(kit.id);

    const { error } = await supabase.rpc("unassign_windshield_kit_from_boat", {
      p_kit_id: kit.id,
    });

    if (error) {
      setErrorMessage("Errore liberazione kit: " + error.message);
      setBusyKitId("");
      return;
    }

    setMessage("Kit liberato: torna in giacenza.");
    setBusyKitId("");
    await loadData();
  }

  const stockKits = useMemo(() => kits.filter((kit) => kit.status === "stock"), [kits]);
  const outKits = useMemo(() => kits.filter((kit) => kit.status === "out"), [kits]);

  // Pezzi in giacenza generale dell'articolo (items.stock) non ancora
  // tracciati singolarmente qui: es. arrivati da Movimenti o da un
  // ordine ricevuto, mai passati da "Registra un arrivo". Servono per
  // il pulsante di conversione qui sotto.
  const trackedStockByItem = useMemo(() => {
    const counts = new Map<string, number>();
    stockKits.forEach((kit) => {
      counts.set(kit.item_id, (counts.get(kit.item_id) || 0) + 1);
    });
    return counts;
  }, [stockKits]);

  const untrackedStockItems = useMemo(
    () =>
      parisPlastItems
        .map((item) => ({
          item,
          untracked: item.stock - (trackedStockByItem.get(item.id) || 0),
        }))
        .filter((row) => row.untracked > 0),
    [parisPlastItems, trackedStockByItem]
  );

  const selectedUntrackedQuantity = useMemo(() => {
    if (!convertItemId) return 0;
    const item = itemMap.get(convertItemId);
    if (!item) return 0;
    return item.stock - (trackedStockByItem.get(convertItemId) || 0);
  }, [convertItemId, itemMap, trackedStockByItem]);

  const statusRows = useMemo(() => {
    return requirements
      .map((req) => {
        const boat = boatMap.get(req.boat_id);
        if (!boat) return null;
        const status = req.kit_id ? "assegnato" : req.order_item_id ? "ordine" : "da_ordinare";
        return { req, boat, status };
      })
      .filter((row): row is { req: Requirement; boat: Boat; status: string } => row !== null)
      .sort((a, b) => {
        const ad = a.boat.requested_delivery_date;
        const bd = b.boat.requested_delivery_date;
        if (ad && bd) {
          if (ad !== bd) return ad < bd ? -1 : 1;
        } else if (ad || bd) {
          return ad ? -1 : 1;
        }
        return (a.boat.progressive_no ?? Infinity) - (b.boat.progressive_no ?? Infinity);
      });
  }, [requirements, boatMap]);

  // Con piu' articoli per modello, un battello puo' comparire piu'
  // volte in statusRows (una riga per articolo): si raggruppano qui
  // per battello cosi' la tabella mostra un solo rigo per battello,
  // con tutti i suoi articoli/stati impilati dentro, invece di
  // ripetere consegna/ordine/modello ad ogni articolo.
  const boatGroups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, { boat: Boat; rows: { req: Requirement; status: string }[] }>();
    statusRows.forEach(({ req, boat, status }) => {
      const existing = map.get(boat.id);
      if (existing) {
        existing.rows.push({ req, status });
      } else {
        map.set(boat.id, { boat, rows: [{ req, status }] });
        order.push(boat.id);
      }
    });
    return order.map((id) => map.get(id)!);
  }, [statusRows]);

  const statusLabel: Record<string, string> = {
    assegnato: "ASSEGNATO",
    ordine: "IN ORDINE",
    da_ordinare: "DA ORDINARE",
  };

  const statusColor: Record<string, [number, number, number]> = {
    assegnato: [21, 128, 61],
    ordine: [29, 78, 216],
    da_ordinare: [194, 65, 12],
  };

  // PDF stampabile dello stato parabrezza per battello: stessa
  // logica della tabella a schermo (un rigo per battello, articoli
  // impilati dentro), stesso stile degli altri PDF del sito (logo
  // in alto a destra, tabella disegnata a mano con jsPDF).
  async function generateWindshieldStatusPdf() {
    if (boatGroups.length === 0) return;

    setGeneratingPdf(true);
    setMessage("");
    setErrorMessage("");

    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const companyLogo = await fetchCompanyLogo();
      drawCompanyLogoTopRight(doc, companyLogo, { maxWidth: 28, maxHeight: 13 });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("STATO PARABREZZA PER BATTELLO", 12, 16);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(90, 100, 115);
      doc.text(`Generato il ${formatItDate(new Date().toISOString().slice(0, 10))}`, 12, 22);
      doc.setTextColor(0, 0, 0);

      let y = 32;

      const columns = [
        { x: 12, title: "Consegna", w: 22 },
        { x: 34, title: "N. ordine", w: 24 },
        { x: 58, title: "Modello", w: 38 },
        { x: 96, title: "Articoli", w: 102 },
      ];

      const lineH = 4.6;

      function drawHeader() {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        for (const col of columns) {
          doc.rect(col.x, y - 5.5, col.w, 10);
          doc.text(col.title, col.x + 1.5, y + 1);
        }
        y += 5;
      }

      drawHeader();

      for (const { boat, rows } of boatGroups) {
        const consegna = formatItDate(boat.requested_delivery_date) || "—";
        const modelloLines = doc.splitTextToSize(boat.model_boat, columns[2].w - 3);

        // Ogni articolo diventa un blocco di 2 righe: il testo
        // dell'articolo (che puo' andare a capo) e sotto, in colore,
        // lo stato - cosi' resta leggibile anche con piu' articoli.
        const articleBlocks = rows.map(({ req, status }) => {
          const textLines: string[] = doc.splitTextToSize(itemLabel(req.item_id), columns[3].w - 3);
          return { textLines, status };
        });

        const articleLineCount = articleBlocks.reduce(
          (sum, block) => sum + block.textLines.length + 1,
          0
        );

        const rowH = Math.max(
          10,
          articleLineCount * lineH + 4.5,
          modelloLines.length * lineH + 4.5
        );

        if (y + rowH > 280) {
          doc.addPage();
          y = 16;
          drawHeader();
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(0, 0, 0);

        doc.rect(columns[0].x, y, columns[0].w, rowH);
        doc.text(consegna, columns[0].x + 1.5, y + 5.3);

        doc.rect(columns[1].x, y, columns[1].w, rowH);
        doc.text(boat.order_number, columns[1].x + 1.5, y + 5.3);

        doc.rect(columns[2].x, y, columns[2].w, rowH);
        doc.text(modelloLines, columns[2].x + 1.5, y + 5.3);

        doc.rect(columns[3].x, y, columns[3].w, rowH);
        let articleY = y + 5.3;
        for (const block of articleBlocks) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.5);
          doc.setTextColor(0, 0, 0);
          doc.text(block.textLines, columns[3].x + 1.5, articleY);
          articleY += block.textLines.length * lineH;

          const color = statusColor[block.status] || [90, 100, 115];
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8.5);
          doc.setTextColor(color[0], color[1], color[2]);
          doc.text(statusLabel[block.status] || "", columns[3].x + 4, articleY);
          doc.setTextColor(0, 0, 0);
          articleY += lineH;
        }

        y += rowH;
      }

      doc.save(`stato_parabrezza_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err: any) {
      setErrorMessage("Errore generazione PDF: " + (err?.message || String(err)));
    } finally {
      setGeneratingPdf(false);
    }
  }

  if (loading) {
    return (
      <div className="pbz-page">
        <div className="pbz-loading">Caricamento...</div>
        <Styles />
      </div>
    );
  }

  return (
    <div className="pbz-page">
      <section className="pbz-hero">
        <div>
          <div className="pbz-eyebrow">PRODUZIONE</div>
          <h1>Parabrezza</h1>
          <p>
            Ogni modello di battello ha uno o più articoli parabrezza abbinati: quando crei un
            battello, ogni pezzo si assegna da solo (in giacenza o dall'ordine aperto), dando
            la precedenza a chi consegna prima. Non devi scegliere nulla a mano.
          </p>
        </div>
        <div className="pbz-actions">
          <Link href="/produzione" className="pbz-btn secondary">
            ← Produzione
          </Link>
        </div>
      </section>

      {(message || errorMessage) && (
        <div className={errorMessage ? "pbz-message error" : "pbz-message success"}>
          {errorMessage || message}
        </div>
      )}

      <section className="pbz-card">
        <div className="pbz-eyebrow">MAPPA MODELLI</div>
        <h2>Modello battello → articolo parabrezza</h2>

        {matrix.length > 0 && (
          <div className="pbz-matrix-list">
            {matrix.map((row) => (
              <div className="pbz-matrix-row" key={row.id}>
                <strong>{row.model_boat}</strong>
                <select
                  value={row.item_id}
                  onChange={(e) => updateMappingItem(row.id, e.target.value)}
                >
                  {parisPlastItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {itemLabel(item.id)}
                    </option>
                  ))}
                </select>
                <button type="button" className="danger" onClick={() => deleteMapping(row.id, row.model_boat)}>
                  Rimuovi
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="pbz-matrix-add">
          <select value={newMappingModel} onChange={(e) => setNewMappingModel(e.target.value)}>
            <option value="">Scegli modello...</option>
            {modelOptions.map((option) => {
              const count = articleCountByModel.get(option.name) || 0;
              return (
                <option key={option.id} value={option.name}>
                  {option.name}
                  {count > 0
                    ? ` (${count} articol${count === 1 ? "o" : "i"} già abbinat${count === 1 ? "o" : "i"})`
                    : ""}
                </option>
              );
            })}
          </select>
          <select value={newMappingItemId} onChange={(e) => setNewMappingItemId(e.target.value)}>
            <option value="">Articolo parabrezza...</option>
            {availableItemsForNewMapping.map((item) => (
              <option key={item.id} value={item.id}>
                {itemLabel(item.id)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addMapping}
            disabled={savingMapping || !newMappingModel || !newMappingItemId}
          >
            {savingMapping ? "Salvataggio..." : "+ Aggiungi mappatura"}
          </button>
        </div>
        {newMappingModel && availableItemsForNewMapping.length === 0 && (
          <p className="pbz-hint">
            Tutti gli articoli Paris Plast sono già abbinati a questo modello.
          </p>
        )}
      </section>

      <section className="pbz-card">
        <div className="pbz-eyebrow">MAGAZZINO PARABREZZA</div>
        <h2>Registra un arrivo</h2>

        <div className="pbz-kit-form">
          <input
            className="pbz-kit-filter"
            value={kitFilter}
            onChange={(e) => setKitFilter(e.target.value)}
            placeholder="Cerca articolo per fornitore, codice o descrizione..."
          />
          <select value={kitItemId} onChange={(e) => setKitItemId(e.target.value)}>
            <option value="">Seleziona articolo...</option>
            {filteredItemsForKit.map((item) => (
              <option key={item.id} value={item.id}>
                {itemLabel(item.id)} (giacenza: {item.stock})
              </option>
            ))}
          </select>
          <input
            value={kitMatricola}
            onChange={(e) => setKitMatricola(e.target.value)}
            placeholder="Matricola / riferimento (facoltativo)"
          />
          <input
            value={kitPrice}
            onChange={(e) => setKitPrice(e.target.value)}
            placeholder="Prezzo (facoltativo)"
            inputMode="decimal"
          />
          <input
            value={kitNote}
            onChange={(e) => setKitNote(e.target.value)}
            placeholder="Nota (facoltativa)"
          />
          <button type="button" onClick={registerKit} disabled={savingKit || !kitItemId}>
            {savingKit ? "Registrazione..." : "Registra in giacenza"}
          </button>
        </div>

        {untrackedStockItems.length > 0 && (
          <div className="pbz-convert-box">
            <p className="pbz-hint">
              Alcuni articoli hanno già giacenza generale (arrivata da Movimenti o da un ordine)
              mai registrata qui come pezzi singoli: puoi convertirla senza raddoppiare il
              conteggio.
            </p>
            <div className="pbz-convert-form">
              <select value={convertItemId} onChange={(e) => setConvertItemId(e.target.value)}>
                <option value="">Articolo da convertire...</option>
                {untrackedStockItems.map(({ item, untracked }) => (
                  <option key={item.id} value={item.id}>
                    {itemLabel(item.id)} ({untracked} non tracciati)
                  </option>
                ))}
              </select>
              <input
                value={convertQuantity}
                onChange={(e) => setConvertQuantity(e.target.value)}
                placeholder="Quantità"
                inputMode="numeric"
              />
              <button
                type="button"
                onClick={convertStock}
                disabled={convertingStock || !convertItemId || !convertQuantity}
              >
                {convertingStock ? "Conversione..." : "Converti da giacenza generale"}
              </button>
            </div>
            {convertItemId && (
              <p className="pbz-hint">
                Non tracciati per questo articolo: {selectedUntrackedQuantity}.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="pbz-card">
        <div className="pbz-eyebrow">GIACENZA</div>
        <h2>Parabrezza in giacenza ({stockKits.length})</h2>

        {stockKits.length === 0 ? (
          <p className="pbz-hint">Nessun parabrezza in giacenza al momento.</p>
        ) : (
          <table className="pbz-table">
            <thead>
              <tr>
                <th>Articolo</th>
                <th>Matricola</th>
                <th>Prezzo</th>
                <th>Arrivato il</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stockKits.map((kit) => (
                <tr key={kit.id}>
                  <td>{itemLabel(kit.item_id)}</td>
                  <td>{kit.matricola || "—"}</td>
                  <td>{formatMoney(kit.unit_price) || "—"}</td>
                  <td>{kit.received_at ? formatItDate(kit.received_at.slice(0, 10)) : "—"}</td>
                  <td>{kit.note || "—"}</td>
                  <td>
                    <button
                      type="button"
                      className="danger"
                      disabled={busyKitId === kit.id}
                      onClick={() => deleteKit(kit)}
                    >
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="pbz-card">
        <div className="pbz-card-heading">
          <div>
            <div className="pbz-eyebrow">STATO BATTELLI</div>
            <h2>Parabrezza per battello ({boatGroups.length})</h2>
          </div>
          <button
            type="button"
            onClick={generateWindshieldStatusPdf}
            disabled={generatingPdf || boatGroups.length === 0}
          >
            {generatingPdf ? "Generazione PDF..." : "Stampa PDF"}
          </button>
        </div>

        {boatGroups.length === 0 ? (
          <p className="pbz-hint">
            Nessun battello ha ancora un parabrezza tracciato (mappa i modelli qui sopra).
          </p>
        ) : (
          <table className="pbz-table pbz-table-grouped">
            <thead>
              <tr>
                <th>Consegna</th>
                <th>N. ordine</th>
                <th>Modello</th>
                <th>Articoli</th>
              </tr>
            </thead>
            <tbody>
              {boatGroups.map(({ boat, rows }) => (
                <tr key={boat.id}>
                  <td>{formatItDate(boat.requested_delivery_date) || "—"}</td>
                  <td>{boat.order_number}</td>
                  <td>{boat.model_boat}</td>
                  <td>
                    <div className="pbz-article-list">
                      {rows.map(({ req, status }) => {
                        const kit = req.kit_id ? kits.find((k) => k.id === req.kit_id) : null;
                        return (
                          <div className="pbz-article-row" key={req.id}>
                            <span className="pbz-article-name">{itemLabel(req.item_id)}</span>
                            <span className={`pbz-status ${status}`}>
                              {status === "assegnato"
                                ? "ASSEGNATO"
                                : status === "ordine"
                                ? "IN ORDINE"
                                : "DA ORDINARE"}
                            </span>
                            {kit && (
                              <button
                                type="button"
                                className="danger"
                                disabled={busyKitId === kit.id}
                                onClick={() => releaseKit(kit)}
                              >
                                Libera
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {outKits.length > 0 && (
        <section className="pbz-card">
          <div className="pbz-eyebrow">STORICO</div>
          <h2>Parabrezza già assegnati ({outKits.length})</h2>
          <table className="pbz-table">
            <thead>
              <tr>
                <th>Articolo</th>
                <th>Matricola</th>
                <th>N. ordine battello</th>
                <th>Assegnato il</th>
              </tr>
            </thead>
            <tbody>
              {outKits.map((kit) => (
                <tr key={kit.id}>
                  <td>{itemLabel(kit.item_id)}</td>
                  <td>{kit.matricola || "—"}</td>
                  <td>{kit.boat_registration || "—"}</td>
                  <td>{kit.out_at ? formatItDate(kit.out_at.slice(0, 10)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Styles />
    </div>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      .pbz-page { width:100%; max-width:none; margin:0 auto; padding:0 24px; box-sizing:border-box; color:#f8fafc; }
      .pbz-loading { padding:60px; text-align:center; color:#7388a3; font-size:16px; }
      .pbz-hero { padding:26px 28px; display:flex; align-items:center; justify-content:space-between; gap:18px; flex-wrap:wrap; border:1px solid rgba(59,130,246,.24); border-radius:16px; background:linear-gradient(135deg,#0d1d31,#071321); }
      .pbz-eyebrow { color:#60a5fa; font-size:13px; font-weight:950; letter-spacing:1.6px; }
      .pbz-hero h1 { margin:7px 0 0; font-size:36px; font-weight:950; letter-spacing:-.6px; }
      .pbz-hero p { max-width:760px; margin:9px 0 0; color:#91a4bc; font-size:15px; line-height:1.6; }
      .pbz-actions { display:flex; align-items:center; gap:9px; }
      .pbz-btn { min-height:46px; padding:0 16px; display:inline-flex; align-items:center; border-radius:9px; text-decoration:none; font-size:13px; font-weight:900; cursor:pointer; border:0; }
      .pbz-btn.secondary { border:1px solid rgba(148,163,184,.22); background:rgba(255,255,255,.035); color:#e2e8f0; }
      .pbz-message { margin-top:14px; padding:14px 17px; border-radius:10px; font-size:14px; font-weight:800; }
      .pbz-message.success { border:1px solid rgba(34,197,94,.28); background:rgba(34,197,94,.08); color:#86efac; }
      .pbz-message.error { border:1px solid rgba(239,68,68,.28); background:rgba(239,68,68,.08); color:#fca5a5; }
      .pbz-card { margin-top:14px; padding:22px; border:1px solid rgba(148,163,184,.15); border-radius:14px; background:#0b1828; }
      .pbz-card h2 { margin:6px 0 0; font-size:21px; }
      .pbz-card-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-wrap:wrap; }
      .pbz-hint { margin-top:13px; color:#7388a3; font-size:13px; }
      .pbz-matrix-list { margin-top:16px; display:flex; flex-direction:column; gap:9px; }
      .pbz-matrix-row { padding:11px 14px; display:grid; grid-template-columns:190px 1fr auto; align-items:center; gap:11px; border:1px solid rgba(148,163,184,.13); border-radius:9px; background:rgba(255,255,255,.02); }
      .pbz-matrix-row strong { color:#93c5fd; font-size:14px; }
      .pbz-matrix-add { margin-top:16px; display:grid; grid-template-columns:1fr 1.6fr auto; gap:11px; }
      .pbz-kit-form { margin-top:16px; display:grid; grid-template-columns:1fr 1.6fr 0.8fr 0.6fr 1fr auto; gap:11px; }
      .pbz-kit-filter { grid-column:1; }
      .pbz-convert-box { margin-top:16px; padding-top:16px; border-top:1px dashed rgba(148,163,184,.2); }
      .pbz-convert-form { margin-top:9px; display:grid; grid-template-columns:1.6fr 0.6fr auto; gap:11px; }
      .pbz-page select, .pbz-page input {
        min-height:46px; box-sizing:border-box; padding:0 13px; border:1px solid rgba(148,163,184,.19);
        border-radius:9px; outline:none; background:#081524; color:#fff; font-size:14px;
      }
      .pbz-matrix-add button, .pbz-kit-form button, .pbz-card-heading button {
        min-height:46px; padding:0 16px; border:1px solid rgba(96,165,250,.32); border-radius:9px;
        background:rgba(59,130,246,.14); color:#bfdbfe; cursor:pointer; font-size:13px; font-weight:900; white-space:nowrap;
      }
      .pbz-matrix-add button:disabled, .pbz-kit-form button:disabled, .pbz-card-heading button:disabled { opacity:.5; cursor:default; }
      button.danger { border:1px solid rgba(239,68,68,.28); background:rgba(239,68,68,.08); color:#fca5a5; padding:8px 14px; border-radius:7px; cursor:pointer; font-size:12px; font-weight:900; }
      button.danger:disabled { opacity:.5; cursor:wait; }
      .pbz-table { margin-top:16px; width:100%; border-collapse:collapse; font-size:15px; }
      .pbz-table th { padding:11px 14px; background:rgba(255,255,255,.03); color:#86a0bf; text-align:left; font-size:12px; font-weight:950; letter-spacing:.5px; text-transform:uppercase; }
      .pbz-table td { padding:14px; border-top:1px solid rgba(148,163,184,.16); vertical-align:top; }
      .pbz-table-grouped tbody tr:nth-child(even) { background:rgba(255,255,255,.02); }
      .pbz-table-grouped tbody tr:hover { background:rgba(59,130,246,.06); }
      .pbz-table-grouped td:first-child, .pbz-table-grouped td:nth-child(2) { white-space:nowrap; }
      .pbz-article-list { display:flex; flex-direction:column; gap:9px; }
      .pbz-article-row { display:flex; align-items:center; gap:11px; flex-wrap:wrap; }
      .pbz-article-name { color:#e2e8f0; font-weight:700; }
      .pbz-status { padding:6px 12px; border-radius:999px; font-size:13px; font-weight:900; white-space:nowrap; }
      .pbz-status.assegnato { background:rgba(34,197,94,.12); color:#86efac; }
      .pbz-status.ordine { background:rgba(59,130,246,.14); color:#93c5fd; }
      .pbz-status.da_ordinare { background:rgba(249,115,22,.14); color:#fdba74; }
      @media(max-width:900px){ .pbz-matrix-add,.pbz-kit-form,.pbz-convert-form{grid-template-columns:1fr} .pbz-matrix-row{grid-template-columns:1fr} }
    `}</style>
  );
}
