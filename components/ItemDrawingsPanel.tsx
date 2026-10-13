"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/*
  DISEGNI TECNICI ARTICOLO

  Sezione nella scheda articolo per allegare uno o più file (disegno
  PDF, foto, schema) a quell'articolo, cosi' restano consultabili
  direttamente dalla scheda invece di stare solo sul PC di qualcuno.
  Stesso schema gia' usato per l'archivio foto battello
  (production_boat_photos / BoatPhotosModal): bucket Storage dedicato
  + tabella con path/url/nome file, upload e cancellazione immediati
  (non fanno parte del pulsante "Salva modifiche" della scheda).
*/

type ItemDrawing = {
  id: string;
  storage_path: string;
  url: string;
  file_name: string | null;
  uploaded_at: string;
};

export default function ItemDrawingsPanel({ itemId }: { itemId: string }) {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [drawings, setDrawings] = useState<ItemDrawing[]>([]);
  const [busyId, setBusyId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  async function load() {
    setLoading(true);
    setError("");

    const { data, error: err } = await supabase
      .from("item_drawings")
      .select("id,storage_path,url,file_name,uploaded_at")
      .eq("item_id", itemId)
      .order("uploaded_at", { ascending: false });

    if (err) {
      setError("Errore caricamento disegni: " + err.message);
    } else {
      setDrawings((data || []) as ItemDrawing[]);
    }

    setLoading(false);
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError("");

    for (const file of Array.from(files)) {
      const safeName =
        file.name.replace(/[^a-zA-Z0-9.\-_]+/g, "_") || "disegno.pdf";
      const path = `${itemId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("item-drawings")
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        setError(`Errore caricamento "${file.name}": ${uploadError.message}`);
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from("item-drawings")
        .getPublicUrl(path);

      await supabase.from("item_drawings").insert({
        item_id: itemId,
        storage_path: path,
        url: publicUrlData.publicUrl,
        file_name: file.name,
      });
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await load();
  }

  async function deleteDrawing(drawing: ItemDrawing) {
    const confirmed = window.confirm(
      `Eliminare "${drawing.file_name || "questo file"}"? Non si può annullare.`
    );
    if (!confirmed) return;

    setBusyId(drawing.id);
    setError("");

    await supabase.storage.from("item-drawings").remove([drawing.storage_path]);

    const { error: err } = await supabase
      .from("item_drawings")
      .delete()
      .eq("id", drawing.id);

    if (err) {
      setError("Errore eliminazione: " + err.message);
      setBusyId("");
      return;
    }

    setBusyId("");
    await load();
  }

  function isImage(fileName: string | null) {
    return /\.(png|jpe?g|gif|webp|svg)$/i.test(fileName || "");
  }

  return (
    <div
      style={{
        marginTop: 4,
        marginBottom: 16,
        border: "1px solid var(--border-color)",
        borderRadius: 9,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "12px 14px",
          background: "var(--input-bg)",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 750 }}>
          Disegni tecnici
          {!loading && (
            <span style={{ opacity: 0.55, fontWeight: 500 }}>
              {" "}
              ({drawings.length})
            </span>
          )}
        </span>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/*"
          multiple
          style={{ display: "none" }}
          onChange={handleFiles}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            padding: "7px 12px",
            borderRadius: 7,
            border: "1px solid rgba(34,197,94,0.4)",
            background: "rgba(34,197,94,0.12)",
            color: "#16a34a",
            fontSize: 12,
            fontWeight: 800,
            cursor: uploading ? "not-allowed" : "pointer",
            opacity: uploading ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {uploading ? "Caricamento..." : "+ Carica disegno"}
        </button>
      </div>

      <div style={{ padding: "12px 14px" }}>
        {error && (
          <div
            style={{
              marginBottom: 10,
              padding: "9px 11px",
              borderRadius: 7,
              border: "1px solid rgba(239,68,68,0.4)",
              background: "rgba(239,68,68,0.08)",
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ fontSize: 13, opacity: 0.6 }}>Caricamento...</div>
        ) : drawings.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.55 }}>
            Nessun disegno caricato per questo articolo. Usa &quot;+ Carica
            disegno&quot; per aggiungere un PDF o un&apos;immagine.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {drawings.map((drawing) => (
              <div
                key={drawing.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 11px",
                  border: "1px solid var(--border-color)",
                  borderRadius: 8,
                  background: "var(--card)",
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>
                  {isImage(drawing.file_name) ? "🖼️" : "📄"}
                </span>

                <a
                  href={drawing.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    color: "var(--foreground)",
                    textDecoration: "none",
                    fontSize: 13,
                    fontWeight: 700,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title="Apri in una nuova scheda"
                >
                  {drawing.file_name || "File senza nome"}
                </a>

                <button
                  type="button"
                  disabled={busyId === drawing.id}
                  onClick={() => deleteDrawing(drawing)}
                  title="Elimina"
                  style={{
                    minWidth: 26,
                    minHeight: 26,
                    borderRadius: 6,
                    border: "1px solid rgba(239,68,68,0.4)",
                    background: "rgba(239,68,68,0.08)",
                    color: "#ef4444",
                    cursor: busyId === drawing.id ? "wait" : "pointer",
                    opacity: busyId === drawing.id ? 0.5 : 1,
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
