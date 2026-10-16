"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/*
  ARCHIVIO BATTELLO (dettagli + foto + documenti insieme)

  Pannello unico che mostra, per un battello, i dettagli di sola
  lettura (colori carena/ragno-longheroni/coperta/tubolare, optional
  scelti, note), poi le foto (griglia di miniature in formato
  medio-piccolo) e i documenti PDF caricati: usato principalmente per
  i battelli consegnati, dove non ha senso aprire la scheda di
  produzione (percorso lavorazione reparti) ma serve solo consultare
  quello che e' stato caricato/configurato. Stessa logica di
  upload/eliminazione di BoatPhotosModal e BoatDocumentsModal, solo
  unite in un unico pannello invece di due separati, con in piu' la
  lettura (sola lettura, nessuna modifica da qui) di
  production_boats, production_tubolari e production_bom_sections /
  production_boat_bom_sections gia' usate nella scheda di produzione.
*/

type BoatPhoto = {
  id: string;
  storage_path: string;
  url: string;
  file_name: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
};

type BoatDocument = {
  id: string;
  storage_path: string;
  url: string;
  file_name: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
};

type UpholsteryRow = {
  id: string;
  itemDescription: string;
  supplierName: string;
  color: string;
  detailsLogos: string;
  stitching: string;
  quilting: string;
  note: string | null;
  kitMatricola: number | null;
};

type TeakRow = {
  id: string;
  itemDescription: string;
  supplierName: string;
  color: string;
  coverage: string;
  note: string | null;
  kitMatricola: number | null;
};

type BoatDetails = {
  hull: string;
  stringers: string;
  deck: string;
  accessories: string;
  note: string | null;
  tubeColor: string;
  optionalSections: string[];
  upholsteryRows: UpholsteryRow[];
  teakRows: TeakRow[];
};

const EMPTY_DETAILS: BoatDetails = {
  hull: "",
  stringers: "",
  deck: "",
  accessories: "",
  note: null,
  tubeColor: "",
  optionalSections: [],
  upholsteryRows: [],
  teakRows: [],
};

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bam-detail-item">
      <div className="bam-detail-label">{label}</div>
      <div className="bam-detail-value">{value || "—"}</div>
    </div>
  );
}

export default function BoatArchiveModal({
  boatId,
  boatLabel,
  onClose,
  onPhotoCountChange,
  onDocCountChange,
}: {
  boatId: string;
  boatLabel: string;
  onClose: () => void;
  onPhotoCountChange?: (boatId: string, count: number) => void;
  onDocCountChange?: (boatId: string, count: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [details, setDetails] = useState<BoatDetails>(EMPTY_DETAILS);

  const [photos, setPhotos] = useState<BoatPhoto[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [busyPhotoId, setBusyPhotoId] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<BoatDocument[]>([]);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [docError, setDocError] = useState("");
  const [busyDocId, setBusyDocId] = useState("");
  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boatId]);

  async function load() {
    setLoading(true);
    setLoadError("");

    const [
      photosResult,
      documentsResult,
      boatResult,
      tubeResult,
      boatSectionsResult,
      upholsteryResult,
      teakResult,
    ] = await Promise.all([
      supabase
        .from("production_boat_photos")
        .select("id,storage_path,url,file_name,uploaded_at,uploaded_by")
        .eq("boat_id", boatId)
        .order("uploaded_at", { ascending: false }),
      supabase
        .from("production_boat_documents")
        .select("id,storage_path,url,file_name,uploaded_at,uploaded_by")
        .eq("boat_id", boatId)
        .order("uploaded_at", { ascending: false }),
      supabase
        .from("production_boats")
        .select("model_boat,hull,stringers,deck,accessories,note")
        .eq("id", boatId)
        .maybeSingle(),
      // Colore tubolare (solo per i gommoni): tabella a parte,
      // una riga per battello. Se non esiste nessuna riga (battello
      // senza tubolare) non e' un errore, resta semplicemente vuoto.
      supabase
        .from("production_tubolari")
        .select("tube_color")
        .eq("boat_id", boatId)
        .maybeSingle(),
      // Optional scelti per QUESTO battello: qui prendiamo solo gli
      // id delle sezioni scelte, i nomi arrivano nel secondo giro
      // sotto (serve prima sapere il modello del battello).
      supabase
        .from("production_boat_bom_sections")
        .select("section_id")
        .eq("boat_id", boatId),
      // Tappezzeria e teak: un battello puo' averne piu' richieste
      // (colori/articoli diversi), o nessuna se non previste. Stesso
      // schema gia' usato dalla scheda di produzione, qui solo in
      // lettura: niente stato ordine/assegnazione, solo cosa risulta
      // gia' collegato e con che colore.
      supabase
        .from("production_boat_upholstery")
        .select(
          "id,supplier_id,item_id,color,details_logos,stitching,quilting,note,upholstery_kits(matricola)"
        )
        .eq("boat_id", boatId)
        .order("created_at", { ascending: true }),
      supabase
        .from("production_boat_teak")
        .select(
          "id,supplier_id,item_id,color,coverage,note,teak_kits(matricola)"
        )
        .eq("boat_id", boatId)
        .order("created_at", { ascending: true }),
    ]);

    if (photosResult.error && documentsResult.error) {
      setLoadError("Errore caricamento archivio: " + photosResult.error.message);
    } else {
      if (!photosResult.error) {
        const rows = (photosResult.data || []) as BoatPhoto[];
        setPhotos(rows);
        onPhotoCountChange?.(boatId, rows.length);
      }

      if (!documentsResult.error) {
        const rows = (documentsResult.data || []) as BoatDocument[];
        setDocuments(rows);
        onDocCountChange?.(boatId, rows.length);
      }
    }

    const boatRow = !boatResult.error ? (boatResult.data as any) : null;

    let optionalSections: string[] = [];

    const selectedSectionIds = !boatSectionsResult.error
      ? new Set(
          (boatSectionsResult.data || []).map((row: any) => String(row.section_id))
        )
      : new Set<string>();

    const upholsteryRawRows = !upholsteryResult.error
      ? ((upholsteryResult.data || []) as any[])
      : [];

    const teakRawRows = !teakResult.error ? ((teakResult.data || []) as any[]) : [];

    // Descrizione articolo e nome fornitore per tappezzeria/teak non
    // arrivano dalla select sopra (item_id/supplier_id sono solo id):
    // li risolviamo qui, insieme al nome delle sezioni optional, in
    // un solo giro parallelo invece di uno sequenziale per tabella.
    const itemIds = Array.from(
      new Set(
        [...upholsteryRawRows, ...teakRawRows]
          .map((row) => (row.item_id ? String(row.item_id) : ""))
          .filter(Boolean)
      )
    );

    const supplierIds = Array.from(
      new Set(
        [...upholsteryRawRows, ...teakRawRows]
          .map((row) => (row.supplier_id ? String(row.supplier_id) : ""))
          .filter(Boolean)
      )
    );

    const [sectionsRes, itemsRes, suppliersRes] = await Promise.all([
      boatRow?.model_boat && selectedSectionIds.size > 0
        ? supabase
            .from("production_bom_sections")
            .select("id,name")
            .eq("model_boat", boatRow.model_boat)
            .eq("kind", "optional")
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] as any[], error: null as any }),
      itemIds.length > 0
        ? supabase.from("items").select("id,description").in("id", itemIds)
        : Promise.resolve({ data: [] as any[], error: null as any }),
      supplierIds.length > 0
        ? supabase.from("suppliers").select("id,name").in("id", supplierIds)
        : Promise.resolve({ data: [] as any[], error: null as any }),
    ]);

    if (!sectionsRes.error) {
      optionalSections = (sectionsRes.data || [])
        .filter((section: any) => selectedSectionIds.has(String(section.id)))
        .map((section: any) => String(section.name));
    }

    const itemDescriptionById = new Map<string, string>(
      (!itemsRes.error ? itemsRes.data || [] : []).map((row: any) => [
        String(row.id),
        String(row.description || ""),
      ])
    );

    const supplierNameById = new Map<string, string>(
      (!suppliersRes.error ? suppliersRes.data || [] : []).map((row: any) => [
        String(row.id),
        String(row.name || ""),
      ])
    );

    const upholsteryRows: UpholsteryRow[] = upholsteryRawRows.map((row) => ({
      id: String(row.id),
      itemDescription: itemDescriptionById.get(String(row.item_id)) || "Articolo",
      supplierName: supplierNameById.get(String(row.supplier_id)) || "",
      color: String(row.color || ""),
      detailsLogos: String(row.details_logos || ""),
      stitching: String(row.stitching || ""),
      quilting: String(row.quilting || ""),
      note: row.note ? String(row.note) : null,
      kitMatricola: row.upholstery_kits ? Number(row.upholstery_kits.matricola) : null,
    }));

    const teakRows: TeakRow[] = teakRawRows.map((row) => ({
      id: String(row.id),
      itemDescription: itemDescriptionById.get(String(row.item_id)) || "Articolo",
      supplierName: supplierNameById.get(String(row.supplier_id)) || "",
      color: String(row.color || ""),
      coverage: String(row.coverage || ""),
      note: row.note ? String(row.note) : null,
      kitMatricola: row.teak_kits ? Number(row.teak_kits.matricola) : null,
    }));

    setDetails({
      hull: boatRow?.hull ? String(boatRow.hull) : "",
      stringers: boatRow?.stringers ? String(boatRow.stringers) : "",
      deck: boatRow?.deck ? String(boatRow.deck) : "",
      accessories: boatRow?.accessories ? String(boatRow.accessories) : "",
      note: boatRow?.note ? String(boatRow.note) : null,
      tubeColor:
        !tubeResult.error && tubeResult.data?.tube_color
          ? String(tubeResult.data.tube_color)
          : "",
      optionalSections,
      upholsteryRows,
      teakRows,
    });

    setLoading(false);
  }

  async function handlePhotoFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhotos(true);
    setPhotoError("");

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
        setPhotoError(`Errore caricamento "${file.name}": ${uploadError.message}`);
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

    setUploadingPhotos(false);
    if (photoInputRef.current) photoInputRef.current.value = "";
    await load();
  }

  async function deletePhoto(photo: BoatPhoto) {
    const confirmed = window.confirm("Eliminare questa foto? Non si può annullare.");
    if (!confirmed) return;

    setBusyPhotoId(photo.id);
    setPhotoError("");

    await supabase.storage.from("boat-photos").remove([photo.storage_path]);

    const { error: err } = await supabase
      .from("production_boat_photos")
      .delete()
      .eq("id", photo.id);

    if (err) {
      setPhotoError("Errore eliminazione: " + err.message);
      setBusyPhotoId("");
      return;
    }

    setBusyPhotoId("");
    await load();
  }

  async function handleDocFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingDocs(true);
    setDocError("");

    const operator =
      localStorage.getItem("magazzino_display_name") ||
      localStorage.getItem("magazzino_user") ||
      "Matteo";

    for (const file of Array.from(files)) {
      if (file.type && file.type !== "application/pdf") {
        setDocError(`"${file.name}" non è un PDF: saltato.`);
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
        setDocError(`Errore caricamento "${file.name}": ${uploadError.message}`);
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

    setUploadingDocs(false);
    if (docInputRef.current) docInputRef.current.value = "";
    await load();
  }

  async function deleteDocument(doc: BoatDocument) {
    const confirmed = window.confirm(
      `Eliminare "${doc.file_name || "questo documento"}"? Non si può annullare.`
    );
    if (!confirmed) return;

    setBusyDocId(doc.id);
    setDocError("");

    await supabase.storage.from("boat-documents").remove([doc.storage_path]);

    const { error: err } = await supabase
      .from("production_boat_documents")
      .delete()
      .eq("id", doc.id);

    if (err) {
      setDocError("Errore eliminazione: " + err.message);
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
    <div className="bam-backdrop" onClick={onClose}>
      <div className="bam-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bam-head">
          <div>
            <div className="bam-eyebrow">ARCHIVIO BATTELLO</div>
            <h3>{boatLabel}</h3>
          </div>
          <button type="button" className="bam-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="bam-body">
          {loadError && <div className="bam-error">{loadError}</div>}

          {loading ? (
            <div className="bam-hint">Caricamento...</div>
          ) : (
            <>
              {/* DETTAGLI BATTELLO: colori, optional, note */}

              <div className="bam-section">
                <div className="bam-section-head">
                  <span className="bam-section-title">Dettagli battello</span>
                </div>

                <div className="bam-details-grid">
                  <DetailItem label="Carena" value={details.hull} />
                  <DetailItem label="Ragno / Longheroni" value={details.stringers} />
                  <DetailItem label="Coperta" value={details.deck} />
                  <DetailItem label="Colore tubolare" value={details.tubeColor} />
                  <DetailItem label="Accessori" value={details.accessories} />
                </div>

                {details.optionalSections.length > 0 && (
                  <div className="bam-optional-block">
                    <div className="bam-detail-label">Optional</div>
                    <div className="bam-tags">
                      {details.optionalSections.map((name) => (
                        <span key={name} className="bam-tag">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bam-optional-block">
                  <div className="bam-detail-label">Note</div>
                  <div className="bam-note">
                    {details.note || "Nessuna nota inserita."}
                  </div>
                </div>
              </div>

              <div className="bam-divider" />

              {/* TAPPEZZERIA */}

              <div className="bam-section">
                <div className="bam-section-head">
                  <span className="bam-section-title">
                    Tappezzeria{" "}
                    {details.upholsteryRows.length > 0 &&
                      `(${details.upholsteryRows.length})`}
                  </span>
                </div>

                {details.upholsteryRows.length === 0 ? (
                  <div className="bam-hint">
                    Nessuna tappezzeria collegata a questo battello.
                  </div>
                ) : (
                  <div className="bam-list">
                    {details.upholsteryRows.map((row) => (
                      <div key={row.id} className="bam-row bam-row-tall">
                        <span className="bam-row-icon">🛋️</span>

                        <div className="bam-row-main">
                          <div className="bam-row-title">
                            {row.itemDescription}
                            {row.supplierName && (
                              <span className="bam-row-supplier">
                                {" "}
                                · {row.supplierName}
                              </span>
                            )}
                          </div>

                          <div className="bam-row-sub">
                            {[row.color, row.detailsLogos, row.stitching, row.quilting]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </div>

                          {row.note && <div className="bam-row-note">{row.note}</div>}
                        </div>

                        <span
                          className={`bam-status-badge ${
                            row.kitMatricola ? "assigned" : "pending"
                          }`}
                        >
                          {row.kitMatricola
                            ? `Assegnata · #${row.kitMatricola}`
                            : "Non assegnata"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bam-divider" />

              {/* TEAK */}

              <div className="bam-section">
                <div className="bam-section-head">
                  <span className="bam-section-title">
                    Teak{" "}
                    {details.teakRows.length > 0 && `(${details.teakRows.length})`}
                  </span>
                </div>

                {details.teakRows.length === 0 ? (
                  <div className="bam-hint">
                    Nessun teak collegato a questo battello.
                  </div>
                ) : (
                  <div className="bam-list">
                    {details.teakRows.map((row) => (
                      <div key={row.id} className="bam-row bam-row-tall">
                        <span className="bam-row-icon">🪵</span>

                        <div className="bam-row-main">
                          <div className="bam-row-title">
                            {row.itemDescription}
                            {row.supplierName && (
                              <span className="bam-row-supplier">
                                {" "}
                                · {row.supplierName}
                              </span>
                            )}
                          </div>

                          <div className="bam-row-sub">
                            {[row.color, row.coverage].filter(Boolean).join(" · ") ||
                              "—"}
                          </div>

                          {row.note && <div className="bam-row-note">{row.note}</div>}
                        </div>

                        <span
                          className={`bam-status-badge ${
                            row.kitMatricola ? "assigned" : "pending"
                          }`}
                        >
                          {row.kitMatricola
                            ? `Assegnata · #${row.kitMatricola}`
                            : "Non assegnata"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bam-divider" />

              {/* FOTO */}

              <div className="bam-section">
                <div className="bam-section-head">
                  <span className="bam-section-title">
                    Foto {photos.length > 0 && `(${photos.length})`}
                  </span>

                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={handlePhotoFiles}
                  />

                  <button
                    type="button"
                    className="bam-add-btn"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhotos}
                  >
                    {uploadingPhotos ? "Caricamento..." : "+ Aggiungi foto"}
                  </button>
                </div>

                {photoError && <div className="bam-error">{photoError}</div>}

                {photos.length === 0 ? (
                  <div className="bam-hint">
                    Nessuna foto ancora per questo battello.
                  </div>
                ) : (
                  <div className="bam-grid">
                    {photos.map((photo) => (
                      <div key={photo.id} className="bam-thumb">
                        <a href={photo.url} target="_blank" rel="noreferrer">
                          <img src={photo.url} alt={photo.file_name || "Foto battello"} />
                        </a>
                        <button
                          type="button"
                          className="bam-thumb-del"
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

              <div className="bam-divider" />

              {/* DOCUMENTI */}

              <div className="bam-section">
                <div className="bam-section-head">
                  <span className="bam-section-title">
                    Documenti {documents.length > 0 && `(${documents.length})`}
                  </span>

                  <input
                    ref={docInputRef}
                    type="file"
                    accept="application/pdf"
                    multiple
                    style={{ display: "none" }}
                    onChange={handleDocFiles}
                  />

                  <button
                    type="button"
                    className="bam-add-btn"
                    onClick={() => docInputRef.current?.click()}
                    disabled={uploadingDocs}
                  >
                    {uploadingDocs ? "Caricamento..." : "+ Carica PDF"}
                  </button>
                </div>

                {docError && <div className="bam-error">{docError}</div>}

                {documents.length === 0 ? (
                  <div className="bam-hint">
                    Nessun documento ancora per questo battello (fatture,
                    certificati, schede tecniche, ecc.).
                  </div>
                ) : (
                  <div className="bam-list">
                    {documents.map((doc) => (
                      <div key={doc.id} className="bam-row">
                        <span className="bam-row-icon">📄</span>

                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="bam-row-link"
                          title="Apri in una nuova scheda"
                        >
                          {doc.file_name || "File senza nome"}
                        </a>

                        <span className="bam-row-meta">
                          {formatUploadedAt(doc.uploaded_at)}
                          {doc.uploaded_by ? ` · ${doc.uploaded_by}` : ""}
                        </span>

                        <button
                          type="button"
                          className="bam-row-del"
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
            </>
          )}
        </div>
      </div>

      <style jsx global>{`
        .bam-backdrop {
          position: fixed;
          inset: 0;
          z-index: 2000;
          background: rgba(4, 8, 14, 0.72);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .bam-panel {
          width: 100%;
          max-width: 680px;
          max-height: 86vh;
          display: flex;
          flex-direction: column;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 16px;
          background: #0b1828;
          color: #f8fafc;
          box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.7);
        }
        .bam-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 18px 20px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.14);
        }
        .bam-eyebrow {
          color: #60a5fa;
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 1.4px;
        }
        .bam-head h3 {
          margin: 4px 0 0;
          font-size: 16px;
          font-weight: 900;
        }
        .bam-close {
          min-width: 30px;
          min-height: 30px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(255, 255, 255, 0.03);
          color: #e2e8f0;
          cursor: pointer;
          font-size: 13px;
        }
        .bam-body {
          padding: 16px 20px 20px;
          overflow-y: auto;
        }
        .bam-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .bam-section-title {
          color: #93c5fd;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }
        .bam-divider {
          margin: 18px 0;
          border-top: 1px solid rgba(148, 163, 184, 0.14);
        }
        .bam-details-grid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
        }
        .bam-detail-item {
          min-width: 0;
        }
        .bam-detail-label {
          color: #7388a3;
          font-size: 9.5px;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .bam-detail-value {
          margin-top: 3px;
          color: #f8fafc;
          font-size: 13px;
          font-weight: 750;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .bam-optional-block {
          margin-top: 16px;
        }
        .bam-tags {
          margin-top: 6px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .bam-tag {
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid rgba(96, 165, 250, 0.3);
          background: rgba(59, 130, 246, 0.1);
          color: #93c5fd;
          font-size: 11px;
          font-weight: 750;
        }
        .bam-note {
          margin-top: 6px;
          padding: 10px 12px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.02);
          color: #cbd5f5;
          font-size: 12.5px;
          line-height: 1.55;
          white-space: pre-wrap;
        }
        .bam-add-btn {
          min-height: 34px;
          padding: 0 13px;
          border-radius: 8px;
          border: 1px solid rgba(34, 197, 94, 0.32);
          background: rgba(34, 197, 94, 0.1);
          color: #86efac;
          cursor: pointer;
          font-size: 10.5px;
          font-weight: 900;
        }
        .bam-add-btn:disabled {
          opacity: 0.55;
          cursor: wait;
        }
        .bam-error {
          margin-top: 10px;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(239, 68, 68, 0.28);
          background: rgba(239, 68, 68, 0.08);
          color: #fca5a5;
          font-size: 11px;
          font-weight: 700;
        }
        .bam-hint {
          margin-top: 12px;
          color: #7388a3;
          font-size: 11px;
          line-height: 1.6;
        }
        .bam-grid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
          gap: 9px;
        }
        .bam-thumb {
          position: relative;
          aspect-ratio: 1;
          border-radius: 9px;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: #050b13;
        }
        .bam-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .bam-thumb-del {
          position: absolute;
          top: 4px;
          right: 4px;
          min-width: 20px;
          min-height: 20px;
          border-radius: 6px;
          border: 1px solid rgba(239, 68, 68, 0.4);
          background: rgba(15, 20, 28, 0.82);
          color: #fca5a5;
          cursor: pointer;
          font-size: 10px;
          line-height: 1;
        }
        .bam-thumb-del:disabled {
          opacity: 0.5;
          cursor: wait;
        }
        .bam-list {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .bam-row {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 8px 10px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.02);
        }
        .bam-row-icon {
          font-size: 16px;
          line-height: 1;
          flex-shrink: 0;
        }
        .bam-row-tall {
          align-items: flex-start;
          padding: 10px 11px;
        }
        .bam-row-main {
          flex: 1;
          min-width: 0;
        }
        .bam-row-title {
          color: #f8fafc;
          font-size: 12.5px;
          font-weight: 800;
        }
        .bam-row-supplier {
          color: #7388a3;
          font-weight: 700;
        }
        .bam-row-sub {
          margin-top: 2px;
          color: #a6b6cc;
          font-size: 11px;
        }
        .bam-row-note {
          margin-top: 4px;
          color: #7388a3;
          font-size: 10.5px;
          font-style: italic;
        }
        .bam-status-badge {
          flex-shrink: 0;
          padding: 4px 9px;
          border-radius: 999px;
          font-size: 9.5px;
          font-weight: 850;
          white-space: nowrap;
        }
        .bam-status-badge.assigned {
          border: 1px solid rgba(34, 197, 94, 0.32);
          background: rgba(34, 197, 94, 0.1);
          color: #86efac;
        }
        .bam-status-badge.pending {
          border: 1px solid rgba(245, 158, 11, 0.32);
          background: rgba(245, 158, 11, 0.1);
          color: #fcd34d;
        }
        .bam-row-link {
          flex: 1;
          min-width: 0;
          color: #f8fafc;
          text-decoration: none;
          font-size: 12px;
          font-weight: 750;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .bam-row-link:hover {
          text-decoration: underline;
        }
        .bam-row-meta {
          flex-shrink: 0;
          color: #7388a3;
          font-size: 9.5px;
          font-weight: 700;
          white-space: nowrap;
        }
        .bam-row-del {
          min-width: 24px;
          min-height: 24px;
          border-radius: 6px;
          border: 1px solid rgba(239, 68, 68, 0.4);
          background: rgba(239, 68, 68, 0.08);
          color: #fca5a5;
          cursor: pointer;
          font-size: 11px;
          flex-shrink: 0;
        }
        .bam-row-del:disabled {
          opacity: 0.5;
          cursor: wait;
        }
        @media (max-width: 480px) {
          .bam-panel {
            max-height: 92vh;
          }
          .bam-row-meta {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
