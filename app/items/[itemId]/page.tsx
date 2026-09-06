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
  stock: number;
  min_stock: number;
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
  const [price, setPrice] = useState<number>(0);
  const [stock, setStock] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(0);
  const [onOrder, setOnOrder] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState("");

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
            "id,supplier_id,code,supplier_code,description,stock,min_stock,price,on_order,image_url"
          )
          .eq("id", itemId)
          .single();

        itemData = response.data;
        itemError = response.error;
      } else {
        const response = await supabase
          .from("items")
          .select(
            "id,supplier_id,code,supplier_code,description,stock,min_stock,on_order,image_url"
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

      if (needsPrice) {
        setPrice(Number(item.price || 0));
      } else {
        setPrice(0);
      }

      setStock(Number(item.stock || 0));
      setMinStock(Number(item.min_stock || 0));
      setOnOrder(Number(item.on_order || 0));
      setImageUrl(item.image_url || "");

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

    if (Number(onOrder) < 0) {
      setMsg("Gli articoli in ordine non possono essere negativi.");
      return;
    }

    setSaving(true);

    const updateData: {
      code: string;
      supplier_code: string;
      description: string;
      stock: number;
      min_stock: number;
      on_order: number;
      image_url: string | null;
      price?: number;
    } = {
      code: scannerCode.trim(),
      supplier_code: supplierCode.trim(),
      description: description.trim(),
      stock: Number(stock) || 0,
      min_stock: Number(minStock) || 0,
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
            </div>

            <Field
              label="Link immagine"
              value={imageUrl}
              onChange={setImageUrl}
              placeholder="https://..."
            />

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

function NumberField({
  label,
  value,
  onChange,
  suffix,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix: string;
  step: string;
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
          min="0"
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