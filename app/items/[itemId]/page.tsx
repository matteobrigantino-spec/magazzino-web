"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

type ItemData = {
  id: string;
  supplier_id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  category: string;
  unit: string;
  stock: number;
  min_stock: number;
  box_qty: number;
  price?: number;
  on_order: number;
  image_url: string | null;
};

type Permissions = {
  view_prices?: boolean;
  view_inventory_value?: boolean;

  [key: string]: boolean | undefined;
};

export default function ItemDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }> | { itemId: string };
}) {
  const resolvedParams =
    typeof (params as any)?.then === "function"
      ? use(params as Promise<{ itemId: string }>)
      : (params as { itemId: string });

  const itemId = resolvedParams.itemId;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState("");
  const [success, setSuccess] = useState(false);

  const [canViewPrices, setCanViewPrices] = useState(false);
  const [canViewInventoryValue, setCanViewInventoryValue] =
    useState(false);

  const [supplierId, setSupplierId] = useState("");
  const [scannerCode, setScannerCode] = useState("");
  const [supplierCode, setSupplierCode] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Altro");
  const [unit, setUnit] = useState("PZ");
  const [price, setPrice] = useState<number>(0);
  const [stock, setStock] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(0);
  const [boxQty, setBoxQty] = useState<number>(1);
  const [onOrder, setOnOrder] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState("");

  // Storico prezzi (STEP 40): menu a scomparsa, caricato solo la
  // prima volta che viene aperto.
  const [priceHistoryOpen, setPriceHistoryOpen] = useState(false);
  const [priceHistoryLoaded, setPriceHistoryLoaded] = useState(false);
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false);
  const [priceHistoryError, setPriceHistoryError] = useState("");
  const [priceHistoryRows, setPriceHistoryRows] = useState<
    { id: string; old_price: number | null; new_price: number; changed_at: string }[]
  >([]);

  // Parabrezza tracciati a pezzo (STEP 55): se questo articolo ha
  // almeno un windshield_kits, mostriamo un pannello "Assegnato a"
  // con i battelli a cui sono agganciati i pezzi (assegnati e
  // consegnati), cosi' non serve andare su Produzione -> Parabrezza
  // per saperlo.
  const [isWindshieldItem, setIsWindshieldItem] = useState(false);
  const [windshieldOpen, setWindshieldOpen] = useState(false);
  const [windshieldLoaded, setWindshieldLoaded] = useState(false);
  const [windshieldLoading, setWindshieldLoading] = useState(false);
  const [windshieldError, setWindshieldError] = useState("");
  const [windshieldRows, setWindshieldRows] = useState<
    {
      id: string;
      status: string;
      matricola: string | null;
      boatOrderNumber: string;
      boatModel: string;
      when: string | null;
    }[]
  >([]);

  // Articoli composti (STEP 57): un articolo puo' essere collegato a
  // piu' altri articoli gia' a catalogo che insieme lo compongono
  // (es. "CHIUSURA COMPLETA" fatta di 3 pezzi). Non tocca mai la
  // giacenza di nessuno: serve solo a raggruppare e a calcolare al
  // volo quanti se ne possono fare con lo stock attuale.
  const [componentsOpen, setComponentsOpen] = useState(false);
  const [componentsLoaded, setComponentsLoaded] = useState(false);
  const [componentsLoading, setComponentsLoading] = useState(false);
  const [componentsError, setComponentsError] = useState("");
  const [componentRows, setComponentRows] = useState<
    {
      id: string;
      componentItemId: string;
      qty: number;
      code: string;
      description: string;
      stock: number;
    }[]
  >([]);

  const [componentSearch, setComponentSearch] = useState("");
  const [componentSearchResults, setComponentSearchResults] = useState<
    { id: string; code: string; description: string }[]
  >([]);
  const [selectedComponentId, setSelectedComponentId] = useState("");
  const [selectedComponentLabel, setSelectedComponentLabel] = useState("");
  const [newComponentQty, setNewComponentQty] = useState<number>(1);
  const [addingComponent, setAddingComponent] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function runSearch() {
      const q = componentSearch.trim().replace(/[,()]/g, "");
      if (selectedComponentId || q.length < 2) {
        setComponentSearchResults([]);
        return;
      }

      const { data } = await supabase
        .from("items")
        .select("id,code,supplier_code,description")
        .or(`description.ilike.%${q}%,code.ilike.%${q}%,supplier_code.ilike.%${q}%`)
        .neq("id", itemId)
        .limit(15);

      if (cancelled) return;

      setComponentSearchResults(
        (data || []).map((row: any) => ({
          id: String(row.id),
          code: String(row.supplier_code || row.code || ""),
          description: String(row.description || ""),
        }))
      );
    }

    const timer = setTimeout(runSearch, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [componentSearch, selectedComponentId, itemId]);

  async function loadComponents() {
    setComponentsLoading(true);
    setComponentsError("");

    const { data, error } = await supabase
      .from("item_composites")
      .select("id,component_item_id,qty")
      .eq("composite_item_id", itemId)
      .order("created_at", { ascending: true });

    if (error) {
      setComponentsError("Errore caricamento componenti: " + error.message);
      setComponentsLoading(false);
      return;
    }

    const links = data || [];
    const componentIds = Array.from(
      new Set(links.map((row: any) => String(row.component_item_id)))
    );

    let itemsById: Record<
      string,
      { code: string; description: string; stock: number }
    > = {};

    if (componentIds.length > 0) {
      const { data: itemRows } = await supabase
        .from("items")
        .select("id,code,supplier_code,description,stock")
        .in("id", componentIds);

      (itemRows || []).forEach((row: any) => {
        itemsById[String(row.id)] = {
          code: String(row.supplier_code || row.code || ""),
          description: String(row.description || ""),
          stock: Number(row.stock || 0),
        };
      });
    }

    setComponentRows(
      links.map((row: any) => ({
        id: String(row.id),
        componentItemId: String(row.component_item_id),
        qty: Number(row.qty || 1),
        code: itemsById[String(row.component_item_id)]?.code || "—",
        description:
          itemsById[String(row.component_item_id)]?.description ||
          "Articolo eliminato",
        stock: itemsById[String(row.component_item_id)]?.stock ?? 0,
      }))
    );

    setComponentsLoaded(true);
    setComponentsLoading(false);
  }

  async function toggleComponentsPanel() {
    const opening = !componentsOpen;
    setComponentsOpen(opening);

    if (!opening || componentsLoaded) return;

    await loadComponents();
  }

  async function addComponent() {
    setComponentsError("");

    if (!selectedComponentId) {
      setComponentsError("Cerca e seleziona un articolo da collegare.");
      return;
    }

    const qty = Number(newComponentQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setComponentsError("Inserisci una quantità valida.");
      return;
    }

    setAddingComponent(true);

    const { error } = await supabase.from("item_composites").upsert(
      {
        composite_item_id: itemId,
        component_item_id: selectedComponentId,
        qty,
      },
      { onConflict: "composite_item_id,component_item_id" }
    );

    if (error) {
      setComponentsError("Errore collegamento: " + error.message);
      setAddingComponent(false);
      return;
    }

    setComponentSearch("");
    setComponentSearchResults([]);
    setSelectedComponentId("");
    setSelectedComponentLabel("");
    setNewComponentQty(1);
    setAddingComponent(false);
    await loadComponents();
  }

  async function removeComponent(rowId: string) {
    const confirmed = window.confirm(
      "Scollegare questo componente da questo articolo?"
    );
    if (!confirmed) return;

    setComponentsError("");

    const { error } = await supabase
      .from("item_composites")
      .delete()
      .eq("id", rowId);

    if (error) {
      setComponentsError("Errore rimozione: " + error.message);
      return;
    }

    await loadComponents();
  }

  const buildableQty =
    componentRows.length === 0
      ? null
      : Math.min(
          ...componentRows.map((row) =>
            Math.floor(row.stock / Math.max(row.qty, 0.0001))
          )
        );

  async function toggleWindshieldPanel() {
    const opening = !windshieldOpen;
    setWindshieldOpen(opening);

    if (!opening || windshieldLoaded) return;

    setWindshieldLoading(true);
    setWindshieldError("");

    const { data, error } = await supabase
      .from("windshield_kits")
      .select(
        "id,status,matricola,out_at,delivered_at,production_boats(order_number,model_boat)"
      )
      .eq("item_id", itemId)
      .in("status", ["out", "delivered"])
      .order("out_at", { ascending: false });

    if (error) {
      setWindshieldError("Errore caricamento: " + error.message);
    } else {
      setWindshieldRows(
        (data || []).map((row: any) => ({
          id: String(row.id),
          status: String(row.status),
          matricola: row.matricola ? String(row.matricola) : null,
          boatOrderNumber: String(row.production_boats?.order_number || "-"),
          boatModel: String(row.production_boats?.model_boat || "-"),
          when: row.status === "delivered" ? row.delivered_at : row.out_at,
        }))
      );
      setWindshieldLoaded(true);
    }

    setWindshieldLoading(false);
  }

  async function togglePriceHistory() {
    const opening = !priceHistoryOpen;
    setPriceHistoryOpen(opening);

    if (!opening || priceHistoryLoaded) return;

    setPriceHistoryLoading(true);
    setPriceHistoryError("");

    const { data, error } = await supabase
      .from("item_price_history")
      .select("id,old_price,new_price,changed_at")
      .eq("item_id", itemId)
      .order("changed_at", { ascending: false });

    if (error) {
      setPriceHistoryError("Errore caricamento storico: " + error.message);
    } else {
      setPriceHistoryRows((data || []) as any);
      setPriceHistoryLoaded(true);
    }

    setPriceHistoryLoading(false);
  }

  useEffect(() => {
    async function loadItem() {
      setLoading(true);
      setMsg("");
      setSuccess(false);

      const role =
        localStorage.getItem("magazzino_role");

      const savedPermissions =
        localStorage.getItem("magazzino_permissions");

      let permissions: Permissions = {};

      try {
        permissions = savedPermissions
          ? JSON.parse(savedPermissions)
          : {};
      } catch {
        permissions = {};
      }

      /*
        Compatibilità con l'account admin
        già esistente.
      */
      const isAdmin = role === "admin";

      const pricesAllowed =
        isAdmin ||
        permissions.view_prices === true;

      const inventoryValueAllowed =
        isAdmin ||
        permissions.view_inventory_value === true;

      setCanViewPrices(pricesAllowed);
      setCanViewInventoryValue(inventoryValueAllowed);

      /*
        Il prezzo viene richiesto al database
        solo se serve davvero:

        - per mostrare il prezzo unitario;
        - oppure per calcolare i valori economici.
      */
      const needsPrice =
        pricesAllowed ||
        inventoryValueAllowed;

      let itemData: unknown = null;
      let itemError: { message: string } | null = null;

      if (needsPrice) {
        const response = await supabase
          .from("items")
          .select(
            "id,supplier_id,code,supplier_code,description,category,unit,stock,min_stock,box_qty,price,on_order,image_url"
          )
          .eq("id", itemId)
          .single();

        itemData = response.data;
        itemError = response.error;
      } else {
        const response = await supabase
          .from("items")
          .select(
            "id,supplier_id,code,supplier_code,description,category,unit,stock,min_stock,box_qty,on_order,image_url"
          )
          .eq("id", itemId)
          .single();

        itemData = response.data;
        itemError = response.error;
      }

      if (itemError || !itemData) {
        setMsg(
          "Errore caricamento: " +
            (itemError?.message || "Articolo non trovato")
        );
        setSuccess(false);
        setLoading(false);
        return;
      }

      const item = itemData as ItemData;

      setSupplierId(item.supplier_id || "");
      setScannerCode(item.code || "");
      setSupplierCode(item.supplier_code || "");
      setDescription(item.description || "");
      setCategory(item.category?.trim() || "Altro");
      setUnit(item.unit?.trim() || "PZ");

      if (needsPrice) {
        setPrice(Number(item.price || 0));
      } else {
        setPrice(0);
      }

      setStock(Number(item.stock || 0));
      setMinStock(Number(item.min_stock || 0));
      setBoxQty(Math.max(1, Number(item.box_qty || 1)));
      setOnOrder(Number(item.on_order || 0));
      setImageUrl(item.image_url || "");

      const { data: wkCheck } = await supabase
        .from("windshield_kits")
        .select("id")
        .eq("item_id", itemId)
        .limit(1);

      setIsWindshieldItem((wkCheck || []).length > 0);

      setLoading(false);
    }

    loadItem();
  }, [itemId]);

  async function saveItem() {
    setMsg("");
    setSuccess(false);

    if (!scannerCode.trim()) {
      setMsg("Inserisci il codice scanner.");
      return;
    }

    if (!supplierCode.trim()) {
      setMsg("Inserisci il codice fornitore.");
      return;
    }

    if (!description.trim()) {
      setMsg("Inserisci la descrizione.");
      return;
    }

    if (!category.trim()) {
      setMsg("Inserisci una categoria.");
      return;
    }

    if (
      canViewPrices &&
      Number(price) < 0
    ) {
      setMsg("Il prezzo non può essere negativo.");
      return;
    }

    if (Number(stock) < 0) {
      setMsg("La giacenza non può essere negativa.");
      return;
    }

    if (Number(minStock) < 0) {
      setMsg("La scorta minima non può essere negativa.");
      return;
    }

    if (
      !Number.isInteger(Number(boxQty)) ||
      Number(boxQty) <= 0
    ) {
      setMsg("La quantità per box deve essere almeno 1 pezzo.");
      return;
    }

    if (Number(onOrder) < 0) {
      setMsg("Gli articoli in ordine non possono essere negativi.");
      return;
    }

    setSaving(true);

    const updateData: {
      code: string;
      supplier_code: string;
      description: string;
      category: string;
      unit: string;
      stock: number;
      min_stock: number;
      box_qty: number;
      on_order: number;
      image_url: string | null;
      price?: number;
    } = {
      code: scannerCode.trim(),
      supplier_code: supplierCode.trim(),
      description: description.trim(),
      category: category.trim() || "Altro",
      unit: unit.trim() || "PZ",
      stock: Number(stock) || 0,
      min_stock: Number(minStock) || 0,
      box_qty: Number(boxQty) || 1,
      on_order: Number(onOrder) || 0,
      image_url: imageUrl.trim() || null,
    };

    /*
      Se l'utente non può vedere/modificare
      i prezzi, il campo price NON viene
      inviato a Supabase.

      Quindi il prezzo già presente
      nel database rimane invariato.
    */
    if (canViewPrices) {
      updateData.price =
        Number(price) || 0;
    }

    const { error } = await supabase
      .from("items")
      .update(updateData)
      .eq("id", itemId);

    if (error) {
      setMsg("Errore salvataggio: " + error.message);
      setSuccess(false);
      setSaving(false);
      return;
    }

    setMsg("Articolo salvato correttamente.");
    setSuccess(true);
    setSaving(false);
  }

  async function deleteItem() {
    const conferma = confirm(
      "Sei sicuro di voler eliminare questo articolo? L'operazione non può essere annullata."
    );

    if (!conferma) return;

    setDeleting(true);
    setMsg("");
    setSuccess(false);

    const { error } = await supabase
      .from("items")
      .delete()
      .eq("id", itemId);

    if (error) {
      setMsg("Errore eliminazione: " + error.message);
      setDeleting(false);
      return;
    }

    router.push(`/suppliers/${supplierId}`);
    router.refresh();
  }

  const lowStock =
    Number(minStock) > 0 &&
    Number(stock) <= Number(minStock);

  const warehouseValue =
    Number(stock || 0) * Number(price || 0);

  const orderValue =
    Number(onOrder || 0) * Number(price || 0);

  if (loading) {
    return (
      <div
        style={{
          width: "100%",
          maxWidth: 1200,
          margin: "0 auto",
          padding: 30,
          opacity: 0.6,
        }}
      >
        Caricamento articolo...
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      {/* HEADER */}
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
            Magazzino / Articolo
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: "-0.5px",
            }}
          >
            Dettaglio articolo
          </h1>

          <div
            style={{
              marginTop: 6,
              opacity: 0.6,
              fontSize: 14,
            }}
          >
            Modifica i dati e controlla la situazione dell'articolo.
          </div>
        </div>

        <Link
          href={`/suppliers/${supplierId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 15px",
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            background: "var(--input-bg)",
            color: "var(--foreground)",
            textDecoration: "none",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          ← Torna al fornitore
        </Link>
      </div>

      {/* LAYOUT */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(0, 1fr) minmax(330px, 430px)",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* FORM */}
        <div
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            overflow: "hidden",
            background: "var(--card)",
          }}
        >
          <div
            style={{
              padding: "15px 18px",
              background: "var(--table-head)",
              borderBottom:
                "1px solid var(--border-color)",
            }}
          >
            <div
              style={{
                fontWeight: 800,
                fontSize: 15,
              }}
            >
              Dati articolo
            </div>

            <div
              style={{
                marginTop: 3,
                fontSize: 12,
                opacity: 0.55,
              }}
            >
              Modifica le informazioni dell'articolo.
            </div>
          </div>

          <div style={{ padding: 20 }}>
            <Field
              label="Codice scanner"
              value={scannerCode}
              onChange={setScannerCode}
            />

            <Field
              label="Codice fornitore"
              value={supplierCode}
              onChange={setSupplierCode}
            />

            <Field
              label="Descrizione"
              value={description}
              onChange={setDescription}
            />

            <CategoryField
              value={category}
              onChange={setCategory}
            />

            <UnitField
              value={unit}
              onChange={setUnit}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(2, minmax(0, 1fr))",
                gap: 14,
              }}
            >
              {canViewPrices && (
                <NumberField
                  label="Prezzo singolo"
                  value={price}
                  onChange={setPrice}
                  suffix="€"
                  step="0.01"
                />
              )}

              <NumberField
                label="Scorta minima"
                value={minStock}
                onChange={setMinStock}
                suffix="pz"
                step="1"
              />

              <NumberField
                label="Quantità per box"
                value={boxQty}
                onChange={setBoxQty}
                suffix="pz"
                step="1"
                min="1"
              />

              <NumberField
                label="Giacenza"
                value={stock}
                onChange={setStock}
                suffix="pz"
                step="1"
              />

              <NumberField
                label="In ordine"
                value={onOrder}
                onChange={setOnOrder}
                suffix="pz"
                step="1"
              />
            </div>

            <div
              style={{
                marginTop: -3,
                marginBottom: 16,
                fontSize: 12,
                opacity: 0.55,
              }}
            >
              L'articolo entra nel report scorte minime quando
              la giacenza è minore o uguale alla scorta minima.
              La quantità per box verrà usata per calcolare ordini
              sempre a confezioni intere.
            </div>

            <Field
              label="Link immagine"
              value={imageUrl}
              onChange={setImageUrl}
              placeholder="https://..."
            />

            {canViewPrices && (
              <div
                style={{
                  marginTop: 4,
                  marginBottom: 16,
                  border: "1px solid var(--border-color)",
                  borderRadius: 9,
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={togglePriceHistory}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "12px 14px",
                    background: "var(--input-bg)",
                    color: "var(--foreground)",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 750,
                    textAlign: "left",
                  }}
                >
                  <span>
                    Storico prezzi
                    {priceHistoryLoaded && (
                      <span style={{ opacity: 0.55, fontWeight: 500 }}>
                        {" "}
                        ({priceHistoryRows.length}{" "}
                        {priceHistoryRows.length === 1 ? "variazione" : "variazioni"})
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      display: "inline-block",
                      transition: "transform .15s ease",
                      transform: priceHistoryOpen
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                    }}
                  >
                    ▾
                  </span>
                </button>

                {priceHistoryOpen && (
                  <div style={{ padding: "12px 14px" }}>
                    {priceHistoryLoading && (
                      <div style={{ fontSize: 13, opacity: 0.6 }}>Caricamento...</div>
                    )}

                    {!priceHistoryLoading && priceHistoryError && (
                      <div style={{ fontSize: 13, color: "#ef4444" }}>{priceHistoryError}</div>
                    )}

                    {!priceHistoryLoading &&
                      !priceHistoryError &&
                      priceHistoryLoaded &&
                      priceHistoryRows.length === 0 && (
                        <div style={{ fontSize: 13, opacity: 0.55 }}>
                          Nessuna variazione di prezzo registrata finora. Lo storico si
                          accumula da qui in avanti, ad ogni modifica del prezzo.
                        </div>
                      )}

                    {!priceHistoryLoading && priceHistoryRows.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {priceHistoryRows.map((row) => {
                          const oldPrice = row.old_price === null ? null : Number(row.old_price);
                          const newPrice = Number(row.new_price);
                          const isIncrease = oldPrice !== null && newPrice > oldPrice;
                          const isDecrease = oldPrice !== null && newPrice < oldPrice;

                          return (
                            <div
                              key={row.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 12,
                                padding: "8px 0",
                                borderBottom: "1px solid var(--border-color)",
                                fontSize: 13,
                              }}
                            >
                              <span style={{ opacity: 0.6 }}>
                                {formatDateTimeIt(row.changed_at)}
                              </span>
                              <span>
                                {oldPrice === null ? (
                                  <span style={{ opacity: 0.55 }}>—</span>
                                ) : (
                                  <span style={{ opacity: 0.75 }}>{formatEuro(oldPrice)}</span>
                                )}
                                {"  →  "}
                                <strong
                                  style={{
                                    color: isIncrease
                                      ? "#ef4444"
                                      : isDecrease
                                        ? "#22c55e"
                                        : "var(--foreground)",
                                  }}
                                >
                                  {formatEuro(newPrice)}
                                </strong>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {isWindshieldItem && (
              <div
                style={{
                  marginTop: 4,
                  marginBottom: 16,
                  border: "1px solid var(--border-color)",
                  borderRadius: 9,
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={toggleWindshieldPanel}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "12px 14px",
                    background: "var(--input-bg)",
                    color: "var(--foreground)",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 750,
                    textAlign: "left",
                  }}
                >
                  <span>
                    Assegnato a
                    {windshieldLoaded && (
                      <span style={{ opacity: 0.55, fontWeight: 500 }}>
                        {" "}
                        ({windshieldRows.length})
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      display: "inline-block",
                      transition: "transform .15s ease",
                      transform: windshieldOpen
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                    }}
                  >
                    ▾
                  </span>
                </button>

                {windshieldOpen && (
                  <div style={{ padding: "12px 14px" }}>
                    <div style={{ marginBottom: 10, fontSize: 12, opacity: 0.55 }}>
                      La Giacenza qui sopra include anche i pezzi già assegnati a un
                      battello ma non ancora consegnati: restano fisicamente in
                      magazzino finché il battello non risulta consegnato al cliente.
                    </div>

                    {windshieldLoading && (
                      <div style={{ fontSize: 13, opacity: 0.6 }}>Caricamento...</div>
                    )}

                    {!windshieldLoading && windshieldError && (
                      <div style={{ fontSize: 13, color: "#ef4444" }}>{windshieldError}</div>
                    )}

                    {!windshieldLoading &&
                      !windshieldError &&
                      windshieldLoaded &&
                      windshieldRows.length === 0 && (
                        <div style={{ fontSize: 13, opacity: 0.55 }}>
                          Nessun pezzo di questo articolo attualmente assegnato a un
                          battello.
                        </div>
                      )}

                    {!windshieldLoading && windshieldRows.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {windshieldRows.map((row) => (
                          <div
                            key={row.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 12,
                              padding: "8px 0",
                              borderBottom: "1px solid var(--border-color)",
                              fontSize: 13,
                            }}
                          >
                            <span>
                              <strong>{row.boatOrderNumber}</strong>
                              <span style={{ opacity: 0.6 }}> · {row.boatModel}</span>
                              {row.matricola && (
                                <span style={{ opacity: 0.6 }}> · matricola {row.matricola}</span>
                              )}
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {row.when && (
                                <span style={{ opacity: 0.55 }}>
                                  {formatDateTimeIt(row.when)}
                                </span>
                              )}
                              <span
                                style={{
                                  padding: "3px 9px",
                                  borderRadius: 20,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  border:
                                    row.status === "delivered"
                                      ? "1px solid rgba(148,163,184,0.35)"
                                      : "1px solid rgba(34,197,94,0.35)",
                                  background:
                                    row.status === "delivered"
                                      ? "rgba(148,163,184,0.12)"
                                      : "rgba(34,197,94,0.1)",
                                  color: row.status === "delivered" ? "#94a3b8" : "#22c55e",
                                }}
                              >
                                {row.status === "delivered" ? "CONSEGNATO" : "ASSEGNATO"}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div
              style={{
                marginTop: 4,
                marginBottom: 16,
                border: "1px solid var(--border-color)",
                borderRadius: 9,
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={toggleComponentsPanel}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "12px 14px",
                  background: "var(--input-bg)",
                  color: "var(--foreground)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 750,
                  textAlign: "left",
                }}
              >
                <span>
                  Componenti
                  {componentsLoaded && (
                    <span style={{ opacity: 0.55, fontWeight: 500 }}>
                      {" "}
                      ({componentRows.length})
                    </span>
                  )}
                </span>
                <span
                  style={{
                    display: "inline-block",
                    transition: "transform .15s ease",
                    transform: componentsOpen
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                  }}
                >
                  ▾
                </span>
              </button>

              {componentsOpen && (
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ marginBottom: 10, fontSize: 12, opacity: 0.55 }}>
                    Collega qui gli articoli che insieme formano questo codice
                    (es. un composto/chiusura fatto di più pezzi). Non tocca la
                    giacenza di nessuno: serve solo a vederli raggruppati e a
                    sapere subito quanti se ne possono fare con lo stock
                    attuale dei componenti.
                  </div>

                  {componentsLoading && (
                    <div style={{ fontSize: 13, opacity: 0.6 }}>Caricamento...</div>
                  )}

                  {!componentsLoading && componentsError && (
                    <div style={{ fontSize: 13, color: "#ef4444", marginBottom: 10 }}>
                      {componentsError}
                    </div>
                  )}

                  {!componentsLoading &&
                    componentsLoaded &&
                    componentRows.length === 0 && (
                      <div style={{ fontSize: 13, opacity: 0.55, marginBottom: 12 }}>
                        Nessun articolo collegato ancora.
                      </div>
                    )}

                  {!componentsLoading && componentRows.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        {componentRows.map((row) => (
                          <div
                            key={row.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 12,
                              padding: "8px 0",
                              borderBottom: "1px solid var(--border-color)",
                              fontSize: 13,
                            }}
                          >
                            <span>
                              <strong>{row.code}</strong>
                              <span style={{ opacity: 0.6 }}> · {row.description}</span>
                            </span>
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                              }}
                            >
                              <span style={{ opacity: 0.7 }}>x{row.qty}</span>
                              <span style={{ opacity: 0.55 }}>giacenza {row.stock}</span>
                              <button
                                type="button"
                                onClick={() => removeComponent(row.id)}
                                style={{
                                  border: "1px solid rgba(239,68,68,0.35)",
                                  background: "rgba(239,68,68,0.08)",
                                  color: "#f87171",
                                  borderRadius: 6,
                                  padding: "3px 8px",
                                  fontSize: 11,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                ✕
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>

                      {buildableQty !== null && (
                        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 750, opacity: 0.85 }}>
                          Con la giacenza attuale dei componenti puoi assemblarne:{" "}
                          {buildableQty}
                        </div>
                      )}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      alignItems: "flex-end",
                      paddingTop: 8,
                      borderTop: "1px dashed var(--border-color)",
                    }}
                  >
                    <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
                      <input
                        type="text"
                        value={selectedComponentLabel || componentSearch}
                        onChange={(e) => {
                          setSelectedComponentId("");
                          setSelectedComponentLabel("");
                          setComponentSearch(e.target.value);
                        }}
                        placeholder="Cerca articolo da collegare..."
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 7,
                          border: "1px solid var(--border-color)",
                          background: "var(--input-bg)",
                          color: "var(--foreground)",
                          fontSize: 13,
                        }}
                      />
                      {componentSearch.trim().length >= 2 &&
                        !selectedComponentId &&
                        componentSearchResults.length > 0 && (
                          <div
                            style={{
                              position: "absolute",
                              top: "100%",
                              left: 0,
                              right: 0,
                              zIndex: 5,
                              marginTop: 4,
                              background: "var(--input-bg)",
                              border: "1px solid var(--border-color)",
                              borderRadius: 7,
                              maxHeight: 220,
                              overflowY: "auto",
                            }}
                          >
                            {componentSearchResults.map((res) => (
                              <div
                                key={res.id}
                                onClick={() => {
                                  setSelectedComponentId(res.id);
                                  setSelectedComponentLabel(
                                    `${res.code} · ${res.description}`
                                  );
                                  setComponentSearchResults([]);
                                }}
                                style={{
                                  padding: "8px 10px",
                                  fontSize: 12.5,
                                  cursor: "pointer",
                                  borderBottom: "1px solid var(--border-color)",
                                }}
                              >
                                <strong>{res.code}</strong>{" "}
                                <span style={{ opacity: 0.65 }}>{res.description}</span>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>

                    <input
                      type="number"
                      min="0.01"
                      step="1"
                      value={newComponentQty}
                      onChange={(e) => setNewComponentQty(Number(e.target.value))}
                      title="Quantità necessaria"
                      style={{
                        width: 70,
                        padding: "8px 10px",
                        borderRadius: 7,
                        border: "1px solid var(--border-color)",
                        background: "var(--input-bg)",
                        color: "var(--foreground)",
                        fontSize: 13,
                      }}
                    />

                    <button
                      type="button"
                      onClick={addComponent}
                      disabled={addingComponent || !selectedComponentId}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 7,
                        border: "1px solid rgba(51,224,234,0.4)",
                        background: "rgba(51,224,234,0.12)",
                        color: "#7cf2c4",
                        fontSize: 12.5,
                        fontWeight: 800,
                        cursor:
                          addingComponent || !selectedComponentId
                            ? "not-allowed"
                            : "pointer",
                        opacity: addingComponent || !selectedComponentId ? 0.55 : 1,
                      }}
                    >
                      {addingComponent ? "Aggiungo..." : "+ Collega"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {msg && (
              <div
                style={{
                  marginTop: 16,
                  padding: "12px 14px",
                  borderRadius: 9,
                  border: success
                    ? "1px solid rgba(34,197,94,0.4)"
                    : "1px solid rgba(239,68,68,0.45)",
                  background: success
                    ? "rgba(34,197,94,0.08)"
                    : "rgba(239,68,68,0.08)",
                  fontSize: 13,
                  fontWeight: 650,
                }}
              >
                {success ? "✓ " : ""}
                {msg}
              </div>
            )}

            {/* PULSANTI */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginTop: 24,
                paddingTop: 18,
                borderTop:
                  "1px solid var(--border-color)",
              }}
            >
              <button
                type="button"
                onClick={deleteItem}
                disabled={deleting || saving}
                style={{
                  padding: "10px 15px",
                  borderRadius: 8,
                  border:
                    "1px solid rgba(239,68,68,0.45)",
                  background:
                    "rgba(239,68,68,0.10)",
                  color: "#ef4444",
                  cursor:
                    deleting || saving
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    deleting || saving ? 0.5 : 1,
                  fontWeight: 750,
                  fontSize: 14,
                }}
              >
                {deleting
                  ? "Eliminazione..."
                  : "Elimina articolo"}
              </button>

              <button
                type="button"
                onClick={saveItem}
                disabled={saving || deleting}
                style={{
                  padding: "11px 18px",
                  borderRadius: 8,
                  border:
                    saving || deleting
                      ? "1px solid var(--border-color)"
                      : "1px solid var(--foreground)",
                  background:
                    saving || deleting
                      ? "var(--card-2)"
                      : "var(--foreground)",
                  color:
                    saving || deleting
                      ? "var(--foreground)"
                      : "var(--background)",
                  cursor:
                    saving || deleting
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    saving || deleting ? 0.5 : 1,
                  fontWeight: 800,
                  fontSize: 14,
                }}
              >
                {saving
                  ? "Salvataggio..."
                  : "Salva modifiche"}
              </button>
            </div>
          </div>
        </div>

        {/* ANTEPRIMA */}
        <div
          style={{
            border: lowStock
              ? "1px solid rgba(239,68,68,0.45)"
              : "1px solid var(--border-color)",
            borderRadius: 12,
            overflow: "hidden",
            background: "var(--card)",
          }}
        >
          <div
            style={{
              padding: "15px 18px",
              background: "var(--table-head)",
              borderBottom:
                "1px solid var(--border-color)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontWeight: 800 }}>
              Anteprima articolo
            </span>

            <StockBadge lowStock={lowStock} />
          </div>

          <div style={{ padding: 18 }}>
            <PreviewRow
              label="Codice scanner"
              value={scannerCode || "-"}
              strong
            />

            <PreviewRow
              label="Codice fornitore"
              value={supplierCode || "-"}
            />

            <PreviewRow
              label="Descrizione"
              value={description || "-"}
            />

            <PreviewRow
              label="Categoria"
              value={category || "Altro"}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(2, minmax(0, 1fr))",
                gap: 10,
                marginTop: 18,
              }}
            >
              <MiniCard
                label="Giacenza"
                value={`${stock} pz`}
                warning={lowStock}
              />

              <MiniCard
                label="Scorta minima"
                value={`${minStock} pz`}
              />

              <MiniCard
                label="Quantità per box"
                value={`${boxQty} pz`}
              />

              <MiniCard
                label="In ordine"
                value={`${onOrder} pz`}
              />

              {canViewPrices && (
                <MiniCard
                  label="Prezzo"
                  value={formatEuro(price)}
                />
              )}
            </div>

            {canViewInventoryValue && (
              <div
                style={{
                  marginTop: 10,
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(2, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                <MiniCard
                  label="Valore magazzino"
                  value={formatEuro(warehouseValue)}
                />

                <MiniCard
                  label="Valore in ordine"
                  value={formatEuro(orderValue)}
                />
              </div>
            )}

            <div
              style={{
                marginTop: 18,
                minHeight: 260,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border:
                  "1px solid var(--border-color)",
                borderRadius: 10,
                background: "var(--input-bg)",
                overflow: "hidden",
              }}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Articolo"
                  style={{
                    display: "block",
                    width: "100%",
                    maxHeight: 300,
                    objectFit: "contain",
                  }}
                />
              ) : (
                <span
                  style={{
                    opacity: 0.45,
                    fontSize: 13,
                  }}
                >
                  Nessuna immagine
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 750,
          marginBottom: 7,
        }}
      >
        {label}
      </label>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}

function CategoryField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 750,
          marginBottom: 7,
        }}
      >
        Categoria
      </label>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Scrivi la categoria"
        style={inputStyle}
      />

      <div
        style={{
          marginTop: 6,
          fontSize: 11,
          opacity: 0.5,
        }}
      >
        Campo libero: inserisci la categoria che vuoi usare per questo articolo.
      </div>
    </div>
  );
}

const UNIT_SUGGESTIONS = ["PZ", "MT", "KG", "CP", "LT", "MQ"];

function UnitField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 750,
          marginBottom: 7,
        }}
      >
        Unità di misura
      </label>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="PZ"
        list="unit-suggestions"
        style={inputStyle}
      />
      <datalist id="unit-suggestions">
        {UNIT_SUGGESTIONS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <div
        style={{
          marginTop: 6,
          fontSize: 11,
          opacity: 0.5,
        }}
      >
        Come viene contato questo articolo (pezzi, metri, chilogrammi...).
        Scegli dal suggerimento o scrivi la tua.
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  step,
  min = "0",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix: string;
  step: string;
  min?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 750,
          marginBottom: 7,
        }}
      >
        {label}
      </label>

      <div style={{ position: "relative" }}>
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(e) =>
            onChange(Number(e.target.value))
          }
          style={{
            ...inputStyle,
            paddingRight: 45,
          }}
        />

        <span
          style={{
            position: "absolute",
            right: 13,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 12,
            opacity: 0.5,
            pointerEvents: "none",
          }}
        >
          {suffix}
        </span>
      </div>
    </div>
  );
}

function PreviewRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div style={{ marginBottom: 15 }}>
      <div
        style={{
          fontSize: 11,
          opacity: 0.5,
          textTransform: "uppercase",
          letterSpacing: 0.7,
          fontWeight: 700,
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 4,
          fontSize: strong ? 22 : 16,
          fontWeight: strong ? 850 : 700,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MiniCard({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div
      style={{
        padding: 12,
        border: warning
          ? "1px solid rgba(239,68,68,0.4)"
          : "1px solid var(--border-color)",
        borderRadius: 9,
        background: warning
          ? "rgba(239,68,68,0.08)"
          : "var(--input-bg)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          opacity: 0.55,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          fontWeight: 700,
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 5,
          fontSize: 16,
          fontWeight: 850,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StockBadge({
  lowStock,
}: {
  lowStock: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 9px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 800,
        whiteSpace: "nowrap",
        background: lowStock
          ? "rgba(239,68,68,0.12)"
          : "rgba(34,197,94,0.12)",
        border: lowStock
          ? "1px solid rgba(239,68,68,0.35)"
          : "1px solid rgba(34,197,94,0.30)",
        color: lowStock
          ? "#ef4444"
          : "#22c55e",
      }}
    >
      {lowStock ? "⚠ SCORTA BASSA" : "SCORTA OK"}
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

function formatDateTimeIt(value: string) {
  try {
    return new Intl.DateTimeFormat("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "12px 14px",
  background: "var(--input-bg)",
  color: "var(--foreground)",
  border: "1px solid var(--border-color)",
  borderRadius: 8,
  outline: "none",
  fontSize: 14,
};