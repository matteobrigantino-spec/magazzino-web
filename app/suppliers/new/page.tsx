"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewSupplierPage() {
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const router = useRouter();

  async function onSave() {
    const n = name.trim();

    if (!n) {
      setMsg("Inserisci il nome del fornitore.");
      return;
    }

    setSaving(true);
    setMsg("");

    const { data: existing, error: existingError } =
      await supabase
        .from("suppliers")
        .select("id,name")
        .ilike("name", n)
        .maybeSingle();

    if (existingError) {
      setSaving(false);
      setMsg("Errore: " + existingError.message);
      return;
    }

    if (existing) {
      setSaving(false);
      setMsg("Esiste già: " + existing.name);
      return;
    }

    const { error } = await supabase
      .from("suppliers")
      .insert({
        name: n,
      });

    if (error) {
      setSaving(false);
      setMsg("Errore: " + error.message);
      return;
    }

    setSaving(false);

    router.push("/suppliers");
    router.refresh();
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key === "Enter") {
      onSave();
    }
  }

  const isError =
    msg.toLowerCase().startsWith("errore") ||
    msg.toLowerCase().startsWith("esiste");

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          marginBottom: 26,
        }}
      >
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
          Anagrafica
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: "-0.5px",
          }}
        >
          Nuovo fornitore
        </h1>

        <div
          style={{
            marginTop: 6,
            opacity: 0.6,
            fontSize: 14,
          }}
        >
          Crea un nuovo fornitore da utilizzare nel magazzino.
        </div>
      </div>

      <div
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          background: "var(--card)",
          overflow: "hidden",
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
            Dati fornitore
          </div>

          <div
            style={{
              marginTop: 3,
              fontSize: 12,
              opacity: 0.55,
            }}
          >
            Inserisci il nome con cui vuoi identificare il fornitore.
          </div>
        </div>

        <div
          style={{
            padding: 20,
          }}
        >
          <label
            htmlFor="supplier-name"
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 750,
              marginBottom: 7,
            }}
          >
            Nome fornitore
          </label>

          <input
            id="supplier-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);

              if (msg) {
                setMsg("");
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Es. Nautica Rossi"
            autoFocus
            disabled={saving}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 14px",
              background: "var(--input-bg)",
              color: "var(--foreground)",
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              outline: "none",
              fontSize: 15,
              opacity: saving ? 0.6 : 1,
            }}
          />

          <div
            style={{
              marginTop: 7,
              fontSize: 12,
              opacity: 0.5,
            }}
          >
            Premi Invio oppure usa il pulsante Salva fornitore.
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
              href="/suppliers"
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
              ← Annulla
            </Link>

            <button
              type="button"
              onClick={onSave}
              disabled={saving || !name.trim()}
              style={{
                padding: "11px 18px",
                borderRadius: 8,

                border:
                  saving || !name.trim()
                    ? "1px solid var(--border-color)"
                    : "1px solid var(--foreground)",

                background:
                  saving || !name.trim()
                    ? "var(--card-2)"
                    : "var(--foreground)",

                color:
                  saving || !name.trim()
                    ? "var(--foreground)"
                    : "var(--background)",

                cursor:
                  saving || !name.trim()
                    ? "not-allowed"
                    : "pointer",

                opacity:
                  saving || !name.trim()
                    ? 0.5
                    : 1,

                fontWeight: 800,
                fontSize: 14,
              }}
            >
              {saving
                ? "Salvataggio..."
                : "Salva fornitore"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}