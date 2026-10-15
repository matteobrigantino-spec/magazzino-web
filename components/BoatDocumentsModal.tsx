"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/*
  DOCUMENTI BATTELLO

  Pannello a comparsa per caricare e consultare i documenti PDF di un
  battello (fatture, certificati, schede tecniche, ecc.), agganciati
  al suo boat_id - stesso schema gia' usato per l'archivio foto
  (production_boat_photos / BoatPhotosModal) e per i disegni articolo
  (item_drawings / ItemDrawingsPanel): bucket Storage dedicato +
  tabella con path/url/nome file, upload e cancellazione immediati.
*/

type BoatDocument = {
  id: string;
  storage_path: string;
  url: string;
  file_name: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
};

export default function BoatDocumentsModal({
  boatId,
  boatLabel,
  onClose,
  onCountChange,
}: {
  boatId: string;
  boatLabel: string;
  onClose: () => void;
  onCountChange?: (boatId: string, count: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [documents, setDocuments] = useState<BoatDocument[]>([]);
  const [busyDocId, setBusyDocId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boatId]);

  async function load() {
    setLoading(true);
    setError("");

    const { data, error: err } = await supabase
      .from("production_boat_documents")
      .select("id,storage_path,url,file_name,uploaded_at,uploaded_by")
      .eq("boat_id", boatId)
      .order("uploaded_at", { ascending: false });

    if (err) {
      setError("Errore caricamento documenti: " + err.message);
    } else {
      const rows = (data || []) as BoatDocument[];
      setDocuments(rows);
      onCountChange?.(boatId, rows.length);
    }

    setLoading(false);
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError("");

    const operator =
      localStorage.getItem("magazzino_display_name") ||
      localStorage.getItem("magazzino_user") ||
      "Matteo";

    for (const file of Array.from(files)) {
      if (file.type && file.type !== "application/pdf") {
        setError(`"${file.name}" non è un PDF: saltato.`);
        continue;
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]+/g, "_") || "documento.pdf";
      const path = `${boatId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("boat-documents")
        .upload(path, file, {
          contentType: file.type || "application/pdf",
          upsert: false,
        });

      if (uploadError) {
        setError(`Errore caricamento "${file.name}": ${uploadError.message}`);
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from("boat-documents")
        .getPublicUrl(path);

      await supabase.from("production_boat_documents").insert({
        boat_id: boatId,
        storage_path: path,
        url: publicUrlData.publicUrl,
        file_name: file.name,
        uploaded_by: operator,
      });
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await load();
  }

  async function deleteDocument(doc: BoatDocument) {
    const confirmed = window.confirm(
      `Eliminare "${doc.file_name || "questo documento"}"? Non si può annullare.`
    );
    if (!confirmed) return;

    setBusyDocId(doc.id);
    setError("");

    await supabase.storage.from("boat-documents").remove([doc.storage_path]);

    const { error: err } = await supabase
      .from("production_boat_documents")
      .delete()
      .eq("id", doc.id);

    if (err) {
      setError("Errore eliminazione: " + err.message);
      setBusyDocId("");
      return;
    }

    setBusyDocId("");
    await load();
  }

  function formatUploadedAt(value: string) {
    try {
      return new Date(value).toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return "";
    }
  }

  return (
    <div className="bdm-backdrop" onClick={onClose}>
      <div className="bdm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bdm-head">
          <div>
            <div className="bdm-eyebrow">DOCUMENTI</div>
            <h3>{boatLabel}</h3>
          </div>
          <button type="button" className="bdm-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="bdm-body">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            style={{ display: "none" }}
            onChange={handleFiles}
          />

          <button
            type="button"
            className="bdm-add-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Caricamento..." : "+ Carica documento PDF"}
          </button>

          {error && <div className="bdm-error">{error}</div>}

          {loading ? (
            <div className="bdm-hint">Caricamento...</div>
          ) : documents.length === 0 ? (
            <div className="bdm-hint">
              Nessun documento ancora per questo battello. Usa &quot;+ Carica documento
              PDF&quot; per iniziare l&apos;archivio (fatture, certificati, schede
              tecniche, ecc.).
            </div>
          ) : (
            <div className="bdm-list">
              {documents.map((doc) => (
                <div key={doc.id} className="bdm-row">
                  <span className="bdm-row-icon">📄</span>

                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="bdm-row-link"
                    title="Apri in una nuova scheda"
                  >
                    {doc.file_name || "File senza nome"}
                  </a>

                  <span className="bdm-row-meta">
                    {formatUploadedAt(doc.uploaded_at)}
                    {doc.uploaded_by ? ` · ${doc.uploaded_by}` : ""}
                  </span>

                  <button
                    type="button"
                    className="bdm-row-del"
                    disabled={busyDocId === doc.id}
                    onClick={() => deleteDocument(doc)}
                    title="Elimina"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        .bdm-backdrop {
          position: fixed;
          inset: 0;
          z-index: 2000;
          background: rgba(4, 8, 14, 0.72);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .bdm-panel {
          width: 100%;
          max-width: 640px;
          max-height: 82vh;
          display: flex;
          flex-direction: column;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 16px;
          background: #0b1828;
          color: #f8fafc;
          box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.7);
        }
        .bdm-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 18px 20px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.14);
        }
        .bdm-eyebrow {
          color: #60a5fa;
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 1.4px;
        }
        .bdm-head h3 {
          margin: 4px 0 0;
          font-size: 16px;
          font-weight: 900;
        }
        .bdm-close {
          min-width: 30px;
          min-height: 30px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(255, 255, 255, 0.03);
          color: #e2e8f0;
          cursor: pointer;
          font-size: 13px;
        }
        .bdm-body {
          padding: 16px 20px 20px;
          overflow-y: auto;
        }
        .bdm-add-btn {
          min-height: 38px;
          padding: 0 14px;
          border-radius: 8px;
          border: 1px solid rgba(34, 197, 94, 0.32);
          background: rgba(34, 197, 94, 0.1);
          color: #86efac;
          cursor: pointer;
          font-size: 11px;
          font-weight: 900;
        }
        .bdm-add-btn:disabled {
          opacity: 0.55;
          cursor: wait;
        }
        .bdm-error {
          margin-top: 10px;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(239, 68, 68, 0.28);
          background: rgba(239, 68, 68, 0.08);
          color: #fca5a5;
          font-size: 11px;
          font-weight: 700;
        }
        .bdm-hint {
          margin-top: 14px;
          color: #7388a3;
          font-size: 11px;
          line-height: 1.6;
        }
        .bdm-list {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .bdm-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 11px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.02);
        }
        .bdm-row-icon {
          font-size: 17px;
          line-height: 1;
          flex-shrink: 0;
        }
        .bdm-row-link {
          flex: 1;
          min-width: 0;
          color: #f8fafc;
          text-decoration: none;
          font-size: 12.5px;
          font-weight: 750;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .bdm-row-link:hover {
          text-decoration: underline;
        }
        .bdm-row-meta {
          flex-shrink: 0;
          color: #7388a3;
          font-size: 10px;
          font-weight: 700;
          white-space: nowrap;
        }
        .bdm-row-del {
          min-width: 26px;
          min-height: 26px;
          border-radius: 6px;
          border: 1px solid rgba(239, 68, 68, 0.4);
          background: rgba(239, 68, 68, 0.08);
          color: #fca5a5;
          cursor: pointer;
          font-size: 12px;
          flex-shrink: 0;
        }
        .bdm-row-del:disabled {
          opacity: 0.5;
          cursor: wait;
        }
        @media (max-width: 480px) {
          .bdm-panel {
            max-height: 90vh;
          }
          .bdm-row-meta {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
