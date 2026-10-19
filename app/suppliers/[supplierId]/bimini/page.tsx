"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { supabase } from "../../../../lib/supabaseClient";

/*
  GIACENZA BIMINI (vista rapida)

  Versione minima della pagina di magazzino: elenco di cosa c'e'
  in giacenza e di cosa e' gia' assegnato a un battello. Niente
  ancora di modifica prezzo/PDF/vendita manuale (come invece ha
  gia' teak) - si puo' aggiungere in un secondo momento se serve,
  qui serve prima verificare che il meccanismo base funzioni.
*/

type BiminiKit = {
  id: string;
  item_id: string;
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

export default function BiminiWarehousePage({
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
  const [kits, setKits] = useState<BiminiKit[]>([]);
  const [itemLookup, setItemLookup] = useState<ItemLookup[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [deletingKitId, setDeletingKitId] = useState("");

  useEffect(() => {
    loadData();
  }, [supplierId]);

  const itemMap = useMemo(() => new Map(itemLookup.map((item) => [item.id, item])), [itemLookup]);

  const stockKits = useMemo(() => kits.filter((kit) => kit.status === "stock"), [kits]);
  const outKits = useMemo(() => kits.filter((kit) => kit.status === "out"), [kits]);
  const totalValue = useMemo(
    () => stockKits.reduce((sum, kit) => sum + Number(kit.unit_price || 0), 0),
    [stockKits]
  );

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const [supplierResponse, kitsResponse, itemsResponse] = await Promise.all([
      supabase.from("suppliers").select("name,bimini_enabled").eq("id", supplierId).maybeSingle(),
      supabase
        .from("bimini_kits")
        .select("id,item_id,matricola,scanner_code,color,unit_price,boat_registration,status,note,received_at")
        .eq("supplier_id", supplierId)
        .order("matricola", { ascending: true }),
      supabase.from("items").select("id,code,supplier_code,description").eq("supplier_id", supplierId),
    ]);

    if (supplierResponse.error || !supplierResponse.data) {
      setErrorMessage("Fornitore non trovato.");
      setLoading(false);
      return;
    }

    if (supplierResponse.data.bimini_enabled !== true) {
      setErrorMessage("La gestione Bimini non è attiva per questo fornitore.");
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

  async function deleteKit(kit: BiminiKit) {
    const confirmed = window.confirm(
      `Eliminare definitivamente il Kit #${kit.matricola}?\n\n` +
        "La giacenza dell'articolo verrà diminuita di 1.\n" +
        "Questa operazione serve anche per eliminare un kit inserito per errore."
    );

    if (!confirmed) return;

    setDeletingKitId(kit.id);
    setErrorMessage("");

    const { error } = await supabase.rpc("delete_bimini_kit", { p_kit_id: kit.id });

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
      <div className="bwh-loading">
        <div className="bwh-spinner" />
        <strong>Giacenza Bimini</strong>
        <span>Caricamento...</span>
        <Styles />
      </div>
    );
  }

  return (
    <div className="bwh-page">
      <section className="bwh-hero">
        <div>
          <div className="bwh-eyebrow">MAGAZZINO BIMINI</div>
          <h1>{supplierName}</h1>
          <p>
            {stockKits.length} in giacenza ({formatEuro(totalValue)}) · {outKits.length} assegnati a un
            battello.
          </p>
        </div>

        <div className="bwh-hero-actions">
          <Link href={`/suppliers/${supplierId}/bimini/configurazioni`} className="bwh-secondary-button">
            Colori
          </Link>
          <Link href={`/suppliers/${supplierId}/bimini/new-kit`} className="bwh-primary-button">
            + Registra kit
          </Link>
          <Link href={`/suppliers/${supplierId}`} className="bwh-secondary-button">
            ← Fornitore
          </Link>
        </div>
      </section>

      {errorMessage && <div className="bwh-message error">{errorMessage}</div>}

      <section className="bwh-card">
        <h2>In giacenza ({stockKits.length})</h2>

        {stockKits.length === 0 ? (
          <div className="bwh-hint">Nessun kit Bimini in giacenza al momento.</div>
        ) : (
          <div className="bwh-list">
            {stockKits.map((kit) => {
              const item = itemMap.get(kit.item_id);
              return (
                <div key={kit.id} className="bwh-row">
                  <span className="bwh-row-matricola">#{kit.matricola}</span>
                  <div className="bwh-row-main">
                    <strong>{item ? item.supplier_code || item.code : kit.item_id}</strong>
                    <span>{item?.description || ""}</span>
                  </div>
                  <span className="bwh-row-color">{kit.color}</span>
                  <span className="bwh-row-price">{formatEuro(kit.unit_price)}</span>
                  <button
                    type="button"
                    className="bwh-delete-button"
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

      <section className="bwh-card">
        <h2>Assegnati a un battello ({outKits.length})</h2>

        {outKits.length === 0 ? (
          <div className="bwh-hint">Nessun kit Bimini attualmente assegnato.</div>
        ) : (
          <div className="bwh-list">
            {outKits.map((kit) => {
              const item = itemMap.get(kit.item_id);
              return (
                <div key={kit.id} className="bwh-row">
                  <span className="bwh-row-matricola">#{kit.matricola}</span>
                  <div className="bwh-row-main">
                    <strong>{item ? item.supplier_code || item.code : kit.item_id}</strong>
                    <span>{item?.description || ""}</span>
                  </div>
                  <span className="bwh-row-color">{kit.color}</span>
                  <span className="bwh-row-boat">{kit.boat_registration || "—"}</span>
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
      .bwh-page { width:100%; max-width:1100px; margin:0 auto; color:#0f172a; }
      .bwh-loading { min-height:55vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; color:#0f172a; }
      .bwh-loading span { opacity:.65; font-size:12px; }
      .bwh-spinner { width:34px; height:34px; margin-bottom:6px; border:3px solid rgba(37,99,235,.14); border-top-color:#2563eb; border-radius:999px; animation:bwh-spin .75s linear infinite; }
      @keyframes bwh-spin { to { transform:rotate(360deg); } }
      .bwh-hero { padding:22px 24px; display:flex; justify-content:space-between; align-items:center; gap:20px; flex-wrap:wrap; border:1px solid #d9e2ef; border-radius:16px; background:linear-gradient(135deg,#f8fbff,#eef5ff); }
      .bwh-eyebrow { margin-bottom:6px; color:#2563eb; font-size:10px; font-weight:950; letter-spacing:1.5px; }
      .bwh-hero h1 { margin:0; font-size:clamp(24px,3.5vw,34px); font-weight:950; letter-spacing:-.6px; }
      .bwh-hero p { max-width:600px; margin:8px 0 0; color:#475569; font-size:12.5px; line-height:1.6; }
      .bwh-hero-actions { display:flex; flex-wrap:wrap; gap:8px; }
      .bwh-primary-button, .bwh-secondary-button { min-height:42px; padding:0 14px; display:inline-flex; align-items:center; justify-content:center; border-radius:9px; text-decoration:none; font-size:11px; font-weight:900; white-space:nowrap; }
      .bwh-primary-button { border:1px solid #1d4ed8; background:#2563eb; color:#fff; }
      .bwh-secondary-button { border:1px solid #cbd5e1; background:#fff; color:#0f172a; }
      .bwh-message { margin-top:14px; padding:12px 14px; border-radius:11px; font-size:12px; font-weight:750; }
      .bwh-message.error { border:1px solid #fca5a5; background:#fef2f2; color:#991b1b; }
      .bwh-card { margin-top:14px; padding:18px 19px; border:1px solid #dbe3ee; border-radius:14px; background:#fff; }
      .bwh-card h2 { margin:0 0 12px; font-size:15px; font-weight:900; }
      .bwh-hint { color:#64748b; font-size:12px; }
      .bwh-list { display:flex; flex-direction:column; gap:7px; }
      .bwh-row { display:flex; align-items:center; gap:12px; padding:9px 11px; border:1px solid #e2e8f0; border-radius:9px; background:#f8fafc; }
      .bwh-row-matricola { flex-shrink:0; min-width:40px; color:#2563eb; font-weight:950; font-size:13px; }
      .bwh-row-main { flex:1; min-width:0; display:flex; flex-direction:column; }
      .bwh-row-main strong { font-size:12.5px; }
      .bwh-row-main span { color:#64748b; font-size:10.5px; }
      .bwh-row-color { flex-shrink:0; color:#334155; font-size:11px; font-weight:700; }
      .bwh-row-price { flex-shrink:0; color:#16a34a; font-size:12px; font-weight:900; }
      .bwh-row-boat { flex-shrink:0; color:#2563eb; font-size:11px; font-weight:800; }
      .bwh-delete-button { flex-shrink:0; min-height:30px; padding:0 11px; border:1px solid #fca5a5; border-radius:7px; background:#fef2f2; color:#b91c1c; font-size:10.5px; font-weight:850; cursor:pointer; }
      .bwh-delete-button:disabled { opacity:.55; cursor:not-allowed; }
      @media (max-width: 640px) {
        .bwh-hero { flex-direction:column; align-items:stretch; }
        .bwh-row { flex-wrap:wrap; }
      }
    `}</style>
  );
}
