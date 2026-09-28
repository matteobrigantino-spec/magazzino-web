"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import CameraIcon from "../../../components/CameraIcon";
import BoatPhotosModal from "../../../components/BoatPhotosModal";

/*
  BATTELLI CONSEGNATI (STEP 54)

  Elenco di tutti i battelli per cui e' stato premuto "Consegna
  cliente" nella pagina Produzione: qui restano in archivio, con
  matricola, data e chi ha fatto la consegna. Da qui si puo' anche
  annullare per errore (il battello torna in "Battelli in
  produzione").
*/

type Boat = {
  id: string;
  progressive_no: number | null;
  order_number: string;
  model_boat: string;
  matricola: string | null;
  delivered_at: string;
  delivered_by: string | null;
};

function formatItDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export default function ConsegnatiPage() {
  const router = useRouter();
  const [boats, setBoats] = useState<Boat[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Archivio foto battello (STEP 56): stesso tasto fotocamera della
  // pagina Produzione, cosi' le foto restano consultabili anche dopo
  // la consegna, a distanza di tempo.
  const [photoCountByBoatId, setPhotoCountByBoatId] = useState<
    Record<string, number>
  >({});
  const [galleryBoat, setGalleryBoat] = useState<{ id: string; label: string } | null>(
    null
  );

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("production_boats")
      .select("id,progressive_no,order_number,model_boat,matricola,delivered_at,delivered_by")
      .not("delivered_at", "is", null)
      .order("delivered_at", { ascending: false });

    if (error) {
      setErrorMessage("Errore caricamento: " + error.message);
      setLoading(false);
      return;
    }

    setBoats(
      (data || []).map((row: any) => ({
        id: String(row.id),
        progressive_no:
          row.progressive_no === null || row.progressive_no === undefined
            ? null
            : Number(row.progressive_no),
        order_number: String(row.order_number || ""),
        model_boat: String(row.model_boat || ""),
        matricola: row.matricola ? String(row.matricola) : null,
        delivered_at: String(row.delivered_at),
        delivered_by: row.delivered_by ? String(row.delivered_by) : null,
      }))
    );

    // Conteggio foto per battello (STEP 56), sola lettura: se la
    // tabella non esiste ancora su Supabase la query fallisce da sola
    // e i conteggi restano a zero, senza bloccare il resto della pagina.
    const photoCountRes = await supabase.from("production_boat_photos").select("boat_id");
    if (!photoCountRes.error) {
      const counts: Record<string, number> = {};
      (photoCountRes.data || []).forEach((row: any) => {
        const id = String(row.boat_id);
        counts[id] = (counts[id] || 0) + 1;
      });
      setPhotoCountByBoatId(counts);
    }

    setLoading(false);
  }

  const filteredBoats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return boats;
    return boats.filter((boat) =>
      [boat.order_number, boat.model_boat, boat.matricola || ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [boats, search]);

  async function undoDelivery(boat: Boat) {
    setMessage("");
    setErrorMessage("");

    const confirmed = window.confirm(
      `Annullare la consegna di ${boat.order_number} · ${boat.model_boat}?\n\nIl battello tornera' in "Battelli in produzione".`
    );

    if (!confirmed) return;

    // RPC (non un semplice update): riporta il battello a "in
    // produzione" e, se aveva un parabrezza scaricato alla consegna,
    // lo rimette in giacenza nello stesso passaggio (STEP 55).
    const { error } = await supabase.rpc("undo_boat_delivery", {
      p_boat_id: boat.id,
    });

    if (error) {
      setErrorMessage("Errore durante l'annullamento: " + error.message);
      return;
    }

    setMessage("Consegna annullata: il battello e' tornato in produzione.");
    await loadData();
  }

  if (loading) {
    return (
      <div className="pdl-loading">
        Caricamento battelli consegnati...
        <Styles />
      </div>
    );
  }

  return (
    <div className="pdl-page">
      <section className="pdl-hero">
        <div>
          <div className="pdl-eyebrow">PRODUZIONE</div>
          <h1>Battelli consegnati</h1>
          <p>
            Tutti i battelli per cui e&apos; stata premuta &quot;Consegna
            cliente&quot;, con matricola, data e chi ha consegnato.
          </p>
        </div>

        <div className="pdl-actions">
          <Link href="/produzione" className="pdl-btn secondary">
            ← Produzione
          </Link>
        </div>
      </section>

      {(message || errorMessage) && (
        <div className={errorMessage ? "pdl-message error" : "pdl-message success"}>
          {errorMessage || message}
        </div>
      )}

      <section className="pdl-card">
        <div className="pdl-card-top">
          <span className="pdl-count">{boats.length} consegnati</span>
          <input
            type="text"
            className="pdl-search"
            placeholder="Cerca per n° ordine, modello o matricola..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="pdl-table-wrap">
          <table className="pdl-table">
            <thead>
              <tr>
                <th>Prog.</th>
                <th>N° ordine</th>
                <th>Battello</th>
                <th>Matricola</th>
                <th>Consegnato il</th>
                <th>Consegnato da</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredBoats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="pdl-empty-cell">
                    {boats.length === 0
                      ? "Nessun battello consegnato per ora."
                      : "Nessun risultato per questa ricerca."}
                  </td>
                </tr>
              ) : (
                filteredBoats.map((boat) => (
                  <tr
                    key={boat.id}
                    onClick={() => router.push(`/produzione/${boat.id}`)}
                    className="pdl-click-row"
                  >
                    <td>{boat.progressive_no ?? "—"}</td>
                    <td><span className="pdl-order">{boat.order_number}</span></td>
                    <td>{boat.model_boat}</td>
                    <td>{boat.matricola || "—"}</td>
                    <td>{formatItDateTime(boat.delivered_at)}</td>
                    <td>{boat.delivered_by || "—"}</td>
                    <td className="pdl-actions-cell" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="pdl-undo-btn"
                        onClick={() => undoDelivery(boat)}
                      >
                        Annulla consegna
                      </button>
                      <button
                        type="button"
                        className="pdl-photo-btn"
                        title="Archivio foto battello"
                        onClick={() =>
                          setGalleryBoat({
                            id: boat.id,
                            label: `${boat.order_number} · ${boat.model_boat}`,
                          })
                        }
                      >
                        <CameraIcon />
                        {Boolean(photoCountByBoatId[boat.id]) && (
                          <span className="pdl-photo-badge">
                            {photoCountByBoatId[boat.id]}
                          </span>
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {galleryBoat && (
        <BoatPhotosModal
          boatId={galleryBoat.id}
          boatLabel={galleryBoat.label}
          onClose={() => setGalleryBoat(null)}
          onCountChange={(boatId, count) =>
            setPhotoCountByBoatId((current) => ({ ...current, [boatId]: count }))
          }
        />
      )}

      <Styles />
    </div>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      .pdl-page { width:100%; max-width:1400px; margin:0 auto; color:#f8fafc; }
      .pdl-loading { min-height:55vh; display:grid; place-items:center; color:#8ea2ba; font-size:12px; }
      .pdl-hero { padding:21px 22px; display:flex; align-items:center; justify-content:space-between; gap:18px; flex-wrap:wrap; border:1px solid rgba(34,197,94,.22); border-radius:16px; background:linear-gradient(135deg,#0d1f16,#071912); }
      .pdl-eyebrow { color:#4ade80; font-size:9px; font-weight:950; letter-spacing:1.45px; }
      .pdl-hero h1 { margin:5px 0 0; font-size:27px; font-weight:950; letter-spacing:-.6px; }
      .pdl-hero p { max-width:640px; margin:6px 0 0; color:#91a4bc; font-size:10px; line-height:1.55; }
      .pdl-actions { display:flex; align-items:center; flex-wrap:wrap; gap:7px; }
      .pdl-btn { min-height:38px; padding:0 12px; display:inline-flex; align-items:center; border-radius:8px; text-decoration:none; font-size:9px; font-weight:900; cursor:pointer; border:0; }
      .pdl-btn.secondary { border:1px solid rgba(148,163,184,.22); background:rgba(255,255,255,.035); color:#e2e8f0; }
      .pdl-message { margin-top:11px; padding:11px 13px; border-radius:9px; font-size:10px; font-weight:800; }
      .pdl-message.success { border:1px solid rgba(34,197,94,.28); background:rgba(34,197,94,.08); color:#86efac; }
      .pdl-message.error { border:1px solid rgba(239,68,68,.28); background:rgba(239,68,68,.08); color:#fca5a5; }
      .pdl-card { margin-top:14px; padding:20px; border:1px solid rgba(148,163,184,.15); border-radius:16px; background:#0b1828; }
      .pdl-card-top { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:14px; }
      .pdl-count { color:#8ea2ba; font-size:10px; font-weight:800; }
      .pdl-search { min-height:38px; min-width:260px; padding:0 12px; border:1px solid rgba(148,163,184,.19); border-radius:8px; outline:none; background:#081524; color:#fff; font-size:11px; }
      .pdl-table-wrap { overflow-x:auto; }
      .pdl-table { width:100%; border-collapse:collapse; font-size:10.5px; }
      .pdl-table th { padding:8px 10px; background:rgba(255,255,255,.03); color:#86a0bf; text-align:left; font-size:8px; font-weight:950; letter-spacing:.5px; text-transform:uppercase; white-space:nowrap; }
      .pdl-table td { padding:9px 10px; border-top:1px solid rgba(148,163,184,.09); white-space:nowrap; }
      .pdl-click-row { cursor:pointer; }
      .pdl-click-row:hover { background:rgba(255,255,255,.025); }
      .pdl-order { color:#93c5fd; font-weight:800; }
      .pdl-undo-btn { min-height:30px; padding:0 11px; border:1px solid rgba(239,68,68,.28); border-radius:7px; background:rgba(239,68,68,.08); color:#fca5a5; cursor:pointer; font-size:9px; font-weight:900; white-space:nowrap; }
      .pdl-undo-btn:hover { background:rgba(239,68,68,.15); }
      .pdl-actions-cell { display:flex; align-items:center; gap:6px; }
      .pdl-photo-btn { position:relative; min-width:30px; min-height:30px; display:inline-flex; align-items:center; justify-content:center; border:1px solid rgba(148,163,184,.22); border-radius:7px; background:rgba(255,255,255,.035); color:#cbd5f5; cursor:pointer; }
      .pdl-photo-btn:hover { background:rgba(34,197,94,.12); border-color:rgba(34,197,94,.4); color:#86efac; }
      .pdl-photo-badge { position:absolute; top:-6px; right:-6px; min-width:15px; height:15px; padding:0 3px; border-radius:999px; background:#4ade80; color:#04170d; font-size:8.5px; font-weight:950; display:flex; align-items:center; justify-content:center; line-height:1; }
      .pdl-empty-cell { padding:30px; color:#7388a3; text-align:center; font-size:10px; white-space:normal; }
      @media(max-width:800px){ .pdl-hero{align-items:stretch;flex-direction:column} .pdl-search{min-width:0;flex:1} }
    `}</style>
  );
}
