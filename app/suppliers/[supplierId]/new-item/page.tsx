"use client";

import React, { use, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import Link from "next/link";

export default function NewItemPage({
  params,
}: {
  params: Promise<{ supplierId: string }> | { supplierId: string };
}) {
  const resolvedParams =
    typeof (params as any)?.then === "function"
      ? use(params as Promise<{ supplierId: string }>)
      : (params as { supplierId: string });

  const supplierId = resolvedParams.supplierId;
  const router = useRouter();

  const [scannerCode, setScannerCode] = useState("");
  const [supplierCode, setSupplierCode] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setMsg("");

    const trimmedScannerCode = scannerCode.trim();
    const trimmedSupplierCode = supplierCode.trim();
    const trimmedDescription = description.trim();
    const trimmedImage = imageUrl.trim();

    if (!trimmedScannerCode) {
      setMsg("Inserisci il codice scanner.");
      return;
    }

    if (!trimmedSupplierCode) {
      setMsg("Inserisci il codice fornitore.");
      return;
    }

    if (!trimmedDescription) {
      setMsg("Inserisci la descrizione.");
      return;
    }

    if (Number(price) < 0) {
      setMsg("Il prezzo non può essere negativo.");
      return;
    }

    if (Number(minStock) < 0) {
      setMsg("La scorta minima non può essere negativa.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("items").insert({
      supplier_id: supplierId,
      code: trimmedScannerCode,
      supplier_code: trimmedSupplierCode,
      description: trimmedDescription,
      price: Number(price) || 0,
      stock: 0,
      min_stock: Number(minStock) || 0,
      on_order: 0,
      image_url: trimmedImage || null,
    });

    if (error) {
      setMsg("Errore salvataggio: " + error.message);
      setSaving(false);
      return;
    }

    router.push(`/suppliers/${supplierId}`);
    router.refresh();
  }

  const isError = Boolean(msg);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
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
            Magazzino
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: "-0.5px",
            }}
          >
            Nuovo articolo
          </h1>

          <div
            style={{
              marginTop: 6,
              opacity: 0.6,
              fontSize: 14,
            }}
          >
            Inserisci i dati dell'articolo da associare al fornitore.
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 420px)",
          gap: 20,
          alignItems: "start",
        }}
      >
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
              borderBottom: "1px solid var(--border-color)",
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
              I campi principali sono obbligatori.
            </div>
          </div>

          <div
            style={{
              padding: 20,
            }}
          >
            <Field
              label="Codice scanner"
              value={scannerCode}
              onChange={setScannerCode}
              placeholder="Es. 010101"
              autoFocus
            />

            <Field
              label="Codice fornitore"
              value={supplierCode}
              onChange={setSupplierCode}
              placeholder="Es. ART-1234"
            />

            <Field
              label="Descrizione"
              value={description}
              onChange={setDescription}
              placeholder="Es. Pompa autoclave 12V"
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 14,
              }}
            >
              <NumberField
                label="Prezzo singolo"
                value={price}
                onChange={setPrice}
                suffix="€"
                step="0.01"
              />

              <NumberField
                label="Scorta minima"
                value={minStock}
                onChange={setMinStock}
                suffix="pz"
                step="1"
              />
            </div>

            <Field
              label="Link immagine"
              value={imageUrl}
              onChange={setImageUrl}
              placeholder="https://..."
            />

            <div
              style={{
                marginTop: 8,
                padding: "11px 13px",
                borderRadius: 8,
                background: "var(--input-bg)",
                border: "1px solid var(--border-color)",
                fontSize: 12,
                opacity: 0.65,
              }}
            >
              Giacenza iniziale e quantità in ordine verranno impostate automaticamente a 0.
            </div>

            {msg && (
              <div
                style={{
                  marginTop: 16,
                  padding: "12px 14px",
                  borderRadius: 9,
                  border: isError
                    ? "1px solid rgba(239,68,68,0.45)"
                    : "1px solid var(--border-color)",
                  background: isError
                    ? "rgba(239,68,68,0.08)"
                    : "var(--input-bg)",
                  fontSize: 13,
                }}
              >
                {msg}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginTop: 24,
                paddingTop: 18,
                borderTop: "1px solid var(--border-color)",
              }}
            >
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
                Annulla
              </Link>

              <button
                type="button"
                onClick={save}
                disabled={saving}
                style={{
                  padding: "11px 18px",
                  borderRadius: 8,
                  border: saving
                    ? "1px solid var(--border-color)"
                    : "1px solid var(--foreground)",
                  background: saving
                    ? "var(--card-2)"
                    : "var(--foreground)",
                  color: saving
                    ? "var(--foreground)"
                    : "var(--background)",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.5 : 1,
                  fontWeight: 800,
                  fontSize: 14,
                }}
              >
                {saving
                  ? "Salvataggio..."
                  : "Salva articolo"}
              </button>
            </div>
          </div>
        </div>

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
              borderBottom: "1px solid var(--border-color)",
              fontWeight: 800,
            }}
          >
            Anteprima articolo
          </div>

          <div
            style={{
              padding: 18,
            }}
          >
            <PreviewRow
              label="Codice scanner"
              value={scannerCode || "Nessun codice"}
              strong
            />

            <PreviewRow
              label="Codice fornitore"
              value={supplierCode || "Nessun codice"}
            />

            <PreviewRow
              label="Descrizione"
              value={description || "Nessuna descrizione"}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 10,
                marginTop: 16,
              }}
            >
              <MiniCard
                label="Prezzo"
                value={formatEuro(price)}
              />

              <MiniCard
                label="Scorta minima"
                value={`${Number(minStock || 0)} pz`}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 10,
                marginTop: 10,
              }}
            >
              <MiniCard
                label="Giacenza iniziale"
                value="0 pz"
              />

              <MiniCard
                label="In ordine"
                value="0 pz"
              />
            </div>

            <div
              style={{
                marginTop: 18,
                minHeight: 260,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid var(--border-color)",
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
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div
      style={{
        marginBottom: 16,
      }}
    >
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
        autoFocus={autoFocus}
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
    <div
      style={{
        marginBottom: 16,
      }}
    >
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

      <div
        style={{
          position: "relative",
        }}
      >
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
    <div
      style={{
        marginBottom: 15,
      }}
    >
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
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        padding: 12,
        border: "1px solid var(--border-color)",
        borderRadius: 9,
        background: "var(--input-bg)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          opacity: 0.5,
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