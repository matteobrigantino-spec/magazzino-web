"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { supabase } from "../../../../lib/supabaseClient";

/*
  GIACENZA TELI (vista rapida)

  Versione minima della pagina di magazzino: elenco di cosa c'e'
  in giacenza e di cosa e' gia' assegnato a un battello. Niente
  ancora di modifica prezzo/PDF/vendita manuale (come invece ha
  gia' teak) - si puo' aggiungere in un secondo momento se serve,
  qui serve prima verificare che il meccanismo base funzioni.
*/

const TELI_TIPI = [
  "Copriconsolle",
  "Copriseduta",
  "Copribattello",
] as const;

type TeliKit = {
  id: string;
  item_id: string;
  tipo: string;
  matricola: number;
  scanner_code: string;
  color: string;
  unit_price: number;
  boat_registration: string | null;
  status: string;
  note: string | null;
  received_at: string;
};

type ItemLookup = {
  id: string;
  code: string;
  supplier_code: string | null;
  description: string;
};

export default function TeliWarehousePage({
  params,
}: {
  params: Promise<{ supplierId: string }> | { supplierId: string };
}) {
  const resolvedParams =
    typeof (params as any)?.then === "function"
      ? use(params as Promise<{ supplierId: string }>)
      : (params as { supplierId: string });

  const supplierId = resolvedParams.supplierId;

  const [supplierName, setSupplierName] = useState("Fornitore");
  const [kits, setKits] = useState<TeliKit[]>([]);
  const [itemLookup, setItemLookup] = useState<ItemLookup[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [deletingKitId, setDeletingKitId] = useState("");
  const [tipoFilter, setTipoFilter] = useState<string>("Tutti");

  useEffect(() => {
    loadData();
  }, [supplierId]);

  const itemMap = useMemo(() => new Map(itemLookup.map((item) => [item.id, item])), [itemLookup]);

  const stockKits = useMemo(
    () =>
      kits.filter(
        (kit) => kit.status === "stock" && (tipoFilter === "Tutti" || kit.tipo === tipoFilter)
      ),
    [kits, tipoFilter]
  );
  const outKits = useMemo(
    () =>
      kits.filter(
        (kit) => kit.status === "out" && (tipoFilter === "Tutti" || kit.tipo === tipoFilter)
      ),
    [kits, tipoFilter]
  );
  const totalValue = useMemo(
    () => stockKits.reduce((sum, kit) => sum + Number(kit.unit_price || 0), 0),
    [stockKits]
  );

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const [supplierResponse, kitsResponse, itemsResponse] = await Promise.all([
      supabase.from("suppliers").select("name,teli_enabled").eq("id", supplierId).maybeSingle(),
      supabase
        .from("teli_kits")
        .select("id,item_id,tipo,matricola,scanner_code,color,unit_price,boat_registration,status,note,received_at")
        .eq("supplier_id", supplierId)
        .order("matricola", { ascending: true }),
      supabase.from("items").select("id,code,supplier_code,description").eq("supplier_id", supplierId),
    ]);

    if (supplierResponse.error || !supplierResponse.data) {
      setErrorMessage("Fornitore non trovato.");
      setLoading(false);
      return;
    }

    if (supplierResponse.data.teli_enabled !== true) {
      setErrorMessage("La gestione Teli non è attiva per questo fornitore.");
      setLoading(false);
      return;
    }

    setSupplierName(String(supplierResponse.data.name || "Fornitore"));

    if (kitsResponse.error) {
      setErrorMessage("Errore caricamento kit: " + kitsResponse.error.message);
      setLoading(false);
      return;
    }

    setKits(
      (kitsResponse.data || []).map((row: any) => ({
        id: String(row.id),
        item_id: String(row.item_id),
        tipo: String(row.tipo || ""),
        matricola: Number(row.matricola || 0),
        scanner_code: String(row.scanner_code || ""),
        color: String(row.color || ""),
        unit_price: Number(row.unit_price || 0),
        boat_registration: row.boat_registration ? String(row.boat_registration) : null,
        status: String(row.status || ""),
        note: row.note ? String(row.note) : null,
        received_at: String(row.received_at || ""),
      }))
    );

    if (!itemsResponse.error) {
      setItemLookup(
        (itemsResponse.data || []).map((row: any) => ({
          id: String(row.id),
          code: String(row.code || ""),
          supplier_code: row.supplier_code ? String(row.supplier_code) : null,
          description: String(row.description || ""),
        }))
      );
    }

    setLoading(false);
  }

  function formatEuro(value: number) {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value || 0);
  }

  async function deleteKit(kit: TeliKit) {
    const confirmed = window.confirm(
      `Eliminare definitivamente il Kit #${kit.matricola}?\n\n` +
        "La giacenza dell'articolo verrà diminuita di 1.\n" +
        "Questa operazione serve anche per eliminare un kit inserito per errore."
    );

    if (!confirmed) return;

    setDeletingKitId(kit.id);
    setErrorMessage("");

    const { error } = await supabase.rpc("delete_teli_kit", { p_kit_id: kit.id });

    if (error) {
      setErrorMessage("Errore eliminazione kit: " + error.message);
      setDeletingKitId("");
      return;
    }

    setKits((current) => current.filter((row) => row.id !== kit.id));
    setDeletingKitId("");
  }

  if (loading) {
    return (
      <div className="tli-loading">
        <div className="tli-spinner" />
        <strong>Giacenza Teli</strong>
        <span>Caricamento...</span>
        <Styles />
      </div>
    );
  }

  return (
    <div className="tli-page">
      <section className="tli-hero">
        <div>
          <div className="tli-eyebrow">MAGAZZINO TELI</div>
          <h1>{supplierName}</h1>
          <p>
            {stockKits.length} in giacenza ({formatEuro(totalValue)}) · {outKits.length} assegnati a un
            battello.
          </p>
        </div>

        <div className="tli-hero-actions">
          <Link href={`/suppliers/${supplierId}/teli/configurazioni`} className="tli-secondary-button">
            Colori
          </Link>
          <Link href={`/suppliers/${supplierId}/teli/new-kit`} className="tli-primary-button">
            + Registra kit
          </Link>
          <Link href={`/suppliers/${supplierId}`} className="tli-secondary-button">
            ← Fornitore
          </Link>
        </div>
      </section>

      <div className="tli-tipo-filter">
        {["Tutti", ...TELI_TIPI].map((option) => (
          <button
            key={option}
            type="button"
            className={tipoFilter === option ? "tli-tipo-chip active" : "tli-tipo-chip"}
            onClick={() => setTipoFilter(option)}
          >
            {option}
          </button>
        ))}
      </div>

      {errorMessage && <div className="tli-message error">{errorMessage}</div>}

      <section className="tli-card">
        <h2>In giacenza ({stockKits.length})</h2>

        {stockKits.length === 0 ? (
          <div className="tli-hint">Nessun kit Teli in giacenza al momento.</div>
        ) : (
          <div className="tli-list">
            {stockKits.map((kit) => {
              const item = itemMap.get(kit.item_id);
              return (
                <div key={kit.id} className="tli-row">
                  <span className="tli-row-matricola">#{kit.matricola}</span>
                  <span className="tli-row-tipo">{kit.tipo}</span>
                  <div className="tli-row-main">
                    <strong>{item ? item.supplier_code || item.code : kit.item_id}</strong>
                    <span>{item?.description || ""}</span>
                  </div>
                  <span className="tli-row-color">{kit.color}</span>
                  <span className="tli-row-price">{formatEuro(kit.unit_price)}</span>
                  <button
                    type="button"
                    className="tli-delete-button"
                    onClick={() => deleteKit(kit)}
                    disabled={deletingKitId === kit.id}
                  >
                    {deletingKitId === kit.id ? "..." : "Elimina"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="tli-card">
        <h2>Assegnati a un battello ({outKits.length})</h2>

        {outKits.length === 0 ? (
          <div className="tli-hint">Nessun kit Teli attualmente assegnato.</div>
        ) : (
          <div className="tli-list">
            {outKits.map((kit) => {
              const item = itemMap.get(kit.item_id);
              return (
                <div key={kit.id} className="tli-row">
                  <span className="tli-row-matricola">#{kit.matricola}</span>
                  <span className="tli-row-tipo">{kit.tipo}</span>
                  <div className="tli-row-main">
                    <strong>{item ? item.supplier_code || item.code : kit.item_id}</strong>
                    <span>{item?.description || ""}</span>
                  </div>
                  <span className="tli-row-color">{kit.color}</span>
                  <span className="tli-row-boat">{kit.boat_registration || "—"}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Styles />
    </div>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      .tli-page { width:100%; max-width:1100px; margin:0 auto; color:#0f172a; }
      .tli-loading { min-height:55vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; color:#0f172a; }
      .tli-loading span { opacity:.65; font-size:12px; }
      .tli-spinner { width:34px; height:34px; margin-bottom:6px; border:3px solid rgba(37,99,235,.14); border-top-color:#2563eb; border-radius:999px; animation:tli-spin .75s linear infinite; }
      @keyframes tli-spin { to { transform:rotate(360deg); } }
      .tli-hero { padding:22px 24px; display:flex; justify-content:space-between; align-items:center; gap:20px; flex-wrap:wrap; border:1px solid #d9e2ef; border-radius:16px; background:linear-gradient(135deg,#f8fbff,#eef5ff); }
      .tli-eyebrow { margin-bottom:6px; color:#2563eb; font-size:10px; font-weight:950; letter-spacing:1.5px; }
      .tli-hero h1 { margin:0; font-size:clamp(24px,3.5vw,34px); font-weight:950; letter-spacing:-.6px; }
      .tli-hero p { max-width:600px; margin:8px 0 0; color:#475569; font-size:12.5px; line-height:1.6; }
      .tli-hero-actions { display:flex; flex-wrap:wrap; gap:8px; }
      .tli-primary-button, .tli-secondary-button { min-height:42px; padding:0 14px; display:inline-flex; align-items:center; justify-content:center; border-radius:9px; text-decoration:none; font-size:11px; font-weight:900; white-space:nowrap; }
      .tli-primary-button { border:1px solid #1d4ed8; background:#2563eb; color:#fff; }
      .tli-secondary-button { border:1px solid #cbd5e1; background:#fff; color:#0f172a; }
      .tli-message { margin-top:14px; padding:12px 14px; border-radius:11px; font-size:12px; font-weight:750; }
      .tli-message.error { border:1px solid #fca5a5; background:#fef2f2; color:#991b1b; }
      .tli-card { margin-top:14px; padding:18px 19px; border:1px solid #dbe3ee; border-radius:14px; background:#fff; }
      .tli-card h2 { margin:0 0 12px; font-size:15px; font-weight:900; }
      .tli-hint { color:#64748b; font-size:12px; }
      .tli-list { display:flex; flex-direction:column; gap:7px; }
      .tli-row { display:flex; align-items:center; gap:12px; padding:9px 11px; border:1px solid #e2e8f0; border-radius:9px; background:#f8fafc; }
      .tli-row-matricola { flex-shrink:0; min-width:40px; color:#2563eb; font-weight:950; font-size:13px; }
      .tli-row-main { flex:1; min-width:0; display:flex; flex-direction:column; }
      .tli-row-main strong { font-size:12.5px; }
      .tli-row-main span { color:#64748b; font-size:10.5px; }
      .tli-row-color { flex-shrink:0; color:#334155; font-size:11px; font-weight:700; }
      .tli-row-price { flex-shrink:0; color:#16a34a; font-size:12px; font-weight:900; }
      .tli-row-boat { flex-shrink:0; color:#2563eb; font-size:11px; font-weight:800; }
      .tli-delete-button { flex-shrink:0; min-height:30px; padding:0 11px; border:1px solid #fca5a5; border-radius:7px; background:#fef2f2; color:#b91c1c; font-size:10.5px; font-weight:850; cursor:pointer; }
      .tli-delete-button:disabled { opacity:.55; cursor:not-allowed; }
      .tli-tipo-filter { margin-top:14px; display:flex; flex-wrap:wrap; gap:7px; }
      .tli-tipo-chip { min-height:34px; padding:0 13px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#334155; font-size:11px; font-weight:800; cursor:pointer; }
      .tli-tipo-chip.active { border-color:#2563eb; background:rgba(37,99,235,.12); color:#2563eb; }
      .tli-row-tipo { flex-shrink:0; min-width:112px; padding:3px 8px; border-radius:6px; background:#eef2ff; color:#4338ca; font-size:10px; font-weight:800; text-align:center; }
      @media (max-width: 640px) {
        .tli-hero { flex-direction:column; align-items:stretch; }
        .tli-row { flex-wrap:wrap; }
      }
    `}</style>
  );
}
