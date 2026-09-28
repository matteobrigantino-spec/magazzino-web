"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/*
  ARCHIVIO FOTO BATTELLO

  Pannello a comparsa (non una pagina a parte) per caricare e
  vedere le foto di un battello, agganciate al suo boat_id. Usato
  sia dalla lista "Battelli in produzione" sia da "Consegnati", cosi'
  le foto restano consultabili anche a distanza di tempo (es. tra un
  anno) dalla scheda del battello consegnato.
*/

type BoatPhoto = {
  id: string;
  storage_path: string;
  url: string;
  file_name: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
};

export default function BoatPhotosModal({
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
  const [photos, setPhotos] = useState<BoatPhoto[]>([]);
  const [busyPhotoId, setBusyPhotoId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boatId]);

  async function load() {
    setLoading(true);
    setError("");

    const { data, error: err } = await supabase
      .from("production_boat_photos")
      .select("id,storage_path,url,file_name,uploaded_at,uploaded_by")
      .eq("boat_id", boatId)
      .order("uploaded_at", { ascending: false });

    if (err) {
      setError("Errore caricamento foto: " + err.message);
    } else {
      const rows = (data || []) as BoatPhoto[];
      setPhotos(rows);
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
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]+/g, "_") || "foto.jpg";
      const path = `${boatId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("boat-photos")
        .upload(path, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        setError(`Errore caricamento "${file.name}": ${uploadError.message}`);
        continue;
      }

      const { data: publicUrlData } = supabase.storage.from("boat-photos").getPublicUrl(path);

      await supabase.from("production_boat_photos").insert({
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

  async function deletePhoto(photo: BoatPhoto) {
    const confirmed = window.confirm("Eliminare questa foto? Non si può annullare.");
    if (!confirmed) return;

    setBusyPhotoId(photo.id);
    setError("");

    await supabase.storage.from("boat-photos").remove([photo.storage_path]);

    const { error: err } = await supabase
      .from("production_boat_photos")
      .delete()
      .eq("id", photo.id);

    if (err) {
      setError("Errore eliminazione: " + err.message);
      setBusyPhotoId("");
      return;
    }

    setBusyPhotoId("");
    await load();
  }

  return (
    <div className="bpm-backdrop" onClick={onClose}>
      <div className="bpm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bpm-head">
          <div>
            <div className="bpm-eyebrow">ARCHIVIO FOTO</div>
            <h3>{boatLabel}</h3>
          </div>
          <button type="button" className="bpm-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="bpm-body">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            style={{ display: "none" }}
            onChange={handleFiles}
          />

          <button
            type="button"
            className="bpm-add-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Caricamento..." : "+ Aggiungi foto"}
          </button>

          {error && <div className="bpm-error">{error}</div>}

          {loading ? (
            <div className="bpm-hint">Caricamento...</div>
          ) : photos.length === 0 ? (
            <div className="bpm-hint">
              Nessuna foto ancora per questo battello. Usa &quot;+ Aggiungi foto&quot; per
              iniziare l&apos;archivio.
            </div>
          ) : (
            <div className="bpm-grid">
              {photos.map((photo) => (
                <div key={photo.id} className="bpm-thumb">
                  <a href={photo.url} target="_blank" rel="noreferrer">
                    <img src={photo.url} alt={photo.file_name || "Foto battello"} />
                  </a>
                  <button
                    type="button"
                    className="bpm-thumb-del"
                    disabled={busyPhotoId === photo.id}
                    onClick={() => deletePhoto(photo)}
                    title="Elimina foto"
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
        .bpm-backdrop {
          position: fixed;
          inset: 0;
          z-index: 2000;
          background: rgba(4, 8, 14, 0.72);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .bpm-panel {
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
        .bpm-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 18px 20px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.14);
        }
        .bpm-eyebrow {
          color: #60a5fa;
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 1.4px;
        }
        .bpm-head h3 {
          margin: 4px 0 0;
          font-size: 16px;
          font-weight: 900;
        }
        .bpm-close {
          min-width: 30px;
          min-height: 30px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(255, 255, 255, 0.03);
          color: #e2e8f0;
          cursor: pointer;
          font-size: 13px;
        }
        .bpm-body {
          padding: 16px 20px 20px;
          overflow-y: auto;
        }
        .bpm-add-btn {
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
        .bpm-add-btn:disabled {
          opacity: 0.55;
          cursor: wait;
        }
        .bpm-error {
          margin-top: 10px;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(239, 68, 68, 0.28);
          background: rgba(239, 68, 68, 0.08);
          color: #fca5a5;
          font-size: 11px;
          font-weight: 700;
        }
        .bpm-hint {
          margin-top: 14px;
          color: #7388a3;
          font-size: 11px;
        }
        .bpm-grid {
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
          gap: 10px;
        }
        .bpm-thumb {
          position: relative;
          aspect-ratio: 1;
          border-radius: 9px;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: #050b13;
        }
        .bpm-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .bpm-thumb-del {
          position: absolute;
          top: 4px;
          right: 4px;
          min-width: 22px;
          min-height: 22px;
          border-radius: 6px;
          border: 1px solid rgba(239, 68, 68, 0.4);
          background: rgba(15, 20, 28, 0.82);
          color: #fca5a5;
          cursor: pointer;
          font-size: 11px;
          line-height: 1;
        }
        .bpm-thumb-del:disabled {
          opacity: 0.5;
          cursor: wait;
        }
        @media (max-width: 480px) {
          .bpm-panel {
            max-height: 90vh;
          }
        }
      `}</style>
    </div>
  );
}
