"use client";

import {
  use,
  useEffect,
  useState,
} from "react";

import Link from "next/link";
import {
  useRouter,
} from "next/navigation";

import { supabase } from "../../../../../../lib/supabaseClient";

type KitData = {
  id: string;
  supplier_id: string;
  item_id: string;
  matricola: number;
  scanner_code: string;
  color: string;
  details_logos: string;
  stitching: string;
  quilting: string;
  unit_price: number;
  boat_registration: string | null;
  status: string;
  note: string | null;
  created_at: string;
  received_at: string | null;
  out_at: string | null;
};

type ItemData = {
  id: string;
  code: string;
  supplier_code: string | null;
  description: string;
};

export default function UpholsteryKitDetailPage({
  params,
}: {
  params:
    | Promise<{
        supplierId: string;
        kitId: string;
      }>
    | {
        supplierId: string;
        kitId: string;
      };
}) {
  const resolvedParams =
    typeof (params as any)?.then ===
    "function"
      ? use(
          params as Promise<{
            supplierId: string;
            kitId: string;
          }>
        )
      : (params as {
          supplierId: string;
          kitId: string;
        });

  const supplierId =
    resolvedParams.supplierId;

  const kitId =
    resolvedParams.kitId;

  const router =
    useRouter();

  const [
    kit,
    setKit,
  ] =
    useState<KitData | null>(
      null
    );

  const [
    item,
    setItem,
  ] =
    useState<ItemData | null>(
      null
    );

  const [
    supplierName,
    setSupplierName,
  ] =
    useState(
      "D'AMICO ARREDAMENTI NAVALI"
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    deleting,
    setDeleting,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  useEffect(() => {
    loadData();
  }, [
    supplierId,
    kitId,
  ]);

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const {
      data: kitData,
      error: kitError,
    } =
      await supabase
        .from(
          "upholstery_kits"
        )
        .select(
          "id,supplier_id,item_id,matricola,scanner_code,color,details_logos,stitching,quilting,unit_price,boat_registration,status,note,created_at,received_at,out_at"
        )
        .eq(
          "id",
          kitId
        )
        .eq(
          "supplier_id",
          supplierId
        )
        .maybeSingle();

    if (
      kitError ||
      !kitData
    ) {
      setErrorMessage(
        "Kit non trovato."
      );
      setLoading(false);
      return;
    }

    const cleanKit:
      KitData = {
      id:
        String(
          kitData.id
        ),
      supplier_id:
        String(
          kitData.supplier_id
        ),
      item_id:
        String(
          kitData.item_id
        ),
      matricola:
        Number(
          kitData.matricola ||
            0
        ),
      scanner_code:
        String(
          kitData.scanner_code ||
            ""
        ),
      color:
        String(
          kitData.color ||
            ""
        ),
      details_logos:
        String(
          kitData.details_logos ||
            ""
        ),
      stitching:
        String(
          kitData.stitching ||
            ""
        ),
      quilting:
        String(
          kitData.quilting ||
            ""
        ),
      unit_price:
        Number(
          kitData.unit_price ||
            0
        ),
      boat_registration:
        kitData.boat_registration
          ? String(
              kitData.boat_registration
            )
          : null,
      status:
        String(
          kitData.status ||
            ""
        ),
      note:
        kitData.note
          ? String(
              kitData.note
            )
          : null,
      created_at:
        String(
          kitData.created_at ||
            ""
        ),
      received_at:
        kitData.received_at
          ? String(
              kitData.received_at
            )
          : null,
      out_at:
        kitData.out_at
          ? String(
              kitData.out_at
            )
          : null,
    };

    setKit(
      cleanKit
    );

    const [
      itemResponse,
      supplierResponse,
    ] =
      await Promise.all([
        supabase
          .from(
            "items"
          )
          .select(
            "id,code,supplier_code,description"
          )
          .eq(
            "id",
            cleanKit.item_id
          )
          .maybeSingle(),

        supabase
          .from(
            "suppliers"
          )
          .select(
            "name"
          )
          .eq(
            "id",
            supplierId
          )
          .maybeSingle(),
      ]);

    if (
      itemResponse.data
    ) {
      setItem({
        id:
          String(
            itemResponse.data.id
          ),
        code:
          String(
            itemResponse.data.code ||
              ""
          ),
        supplier_code:
          itemResponse.data.supplier_code
            ? String(
                itemResponse.data.supplier_code
              )
            : null,
        description:
          String(
            itemResponse.data.description ||
              ""
          ),
      });
    }

    if (
      supplierResponse.data?.name
    ) {
      setSupplierName(
        String(
          supplierResponse.data.name
        )
      );
    }

    setLoading(false);
  }

  function formatEuro(
    value: number
  ) {
    return new Intl.NumberFormat(
      "it-IT",
      {
        style: "currency",
        currency: "EUR",
      }
    ).format(
      Number(
        value ||
          0
      )
    );
  }

  function formatDate(
    value: string | null
  ) {
    if (!value) {
      return "—";
    }

    const date =
      new Date(
        value
      );

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "—";
    }

    return new Intl.DateTimeFormat(
      "it-IT",
      {
        dateStyle:
          "short",
        timeStyle:
          "short",
      }
    ).format(
      date
    );
  }

  async function deleteKit() {
    if (!kit) {
      return;
    }

    if (
      kit.status !==
      "stock"
    ) {
      window.alert(
        "Un kit venduto non può essere eliminato. Prima annulla la vendita."
      );
      return;
    }

    const confirmed =
      window.confirm(
        `Eliminare definitivamente il Kit #${kit.matricola}?\n\n` +
          "La giacenza dell'articolo verrà diminuita di 1.\n" +
          "Questa operazione serve anche per eliminare il kit di prova."
      );

    if (
      !confirmed
    ) {
      return;
    }

    setDeleting(
      true
    );
    setErrorMessage("");

    const {
      error,
    } =
      await supabase.rpc(
        "delete_upholstery_kit",
        {
          p_kit_id:
            kit.id,
        }
      );

    if (error) {
      setErrorMessage(
        "Errore eliminazione kit: " +
          error.message
      );
      setDeleting(
        false
      );
      return;
    }

    router.push(
      `/suppliers/${supplierId}/upholstery`
    );
    router.refresh();
  }

  if (loading) {
    return (
      <div className="kit-detail-loading">
        Caricamento scheda kit...
        <Styles />
      </div>
    );
  }

  if (
    !kit
  ) {
    return (
      <div className="kit-detail-page">
        <div className="kit-detail-error">
          {errorMessage ||
            "Kit non trovato."}
        </div>

        <Link
          href={`/suppliers/${supplierId}/upholstery`}
          className="kit-detail-back"
        >
          ← Torna ai kit
        </Link>

        <Styles />
      </div>
    );
  }

  const isSold =
    kit.status ===
    "out";

  return (
    <div className="kit-detail-page">
      <section className="kit-detail-hero">
        <div>
          <div className="kit-detail-eyebrow">
            SCHEDA TAPPEZZERIA
          </div>

          <h1>
            Kit #
            {kit.matricola}
          </h1>

          <p>
            {supplierName}
          </p>
        </div>

        <div className="kit-detail-actions">
          <Link
            href={`/suppliers/${supplierId}/upholstery`}
            className="kit-detail-back"
          >
            ← Kit in giacenza
          </Link>

          <span
            className={
              isSold
                ? "kit-detail-status sold"
                : "kit-detail-status stock"
            }
          >
            {isSold
              ? "VENDUTO"
              : "IN GIACENZA"}
          </span>
        </div>
      </section>

      {errorMessage && (
        <div className="kit-detail-error">
          {errorMessage}
        </div>
      )}

      <section className="kit-detail-grid">
        <DetailCard
          label="Matricola Kit"
          value={`#${kit.matricola}`}
          highlight
        />

        <DetailCard
          label="Codice articolo"
          value={
            item?.supplier_code ||
            item?.code ||
            "—"
          }
        />

        <DetailCard
          label="Codice scanner"
          value={
            kit.scanner_code ||
            "—"
          }
        />

        <DetailCard
          label="Prezzo"
          value={
            formatEuro(
              kit.unit_price
            )
          }
        />

        <DetailCard
          label="Colore"
          value={
            kit.color ||
            "—"
          }
        />

        <DetailCard
          label="Dettagli e loghi"
          value={
            kit.details_logos ||
            "—"
          }
        />

        <DetailCard
          label="Cucitura"
          value={
            kit.stitching ||
            "—"
          }
        />

        <DetailCard
          label="Trapuntatura"
          value={
            kit.quilting ||
            "—"
          }
        />

        <DetailCard
          label="Matricola Battello"
          value={
            kit.boat_registration ||
            "Non assegnata"
          }
          sold={
            Boolean(
              kit.boat_registration
            )
          }
        />

        <DetailCard
          label="Inserito il"
          value={
            formatDate(
              kit.received_at ||
                kit.created_at
            )
          }
        />

        {isSold && (
          <DetailCard
            label="Venduto il"
            value={
              formatDate(
                kit.out_at
              )
            }
            sold
          />
        )}
      </section>

      <section className="kit-description-card">
        <div className="kit-detail-eyebrow">
          ARTICOLO
        </div>

        <h2>
          {item?.description ||
            "Descrizione non disponibile"}
        </h2>
      </section>

      <section className="kit-notes-card">
        <div className="kit-notes-head">
          <div>
            <div className="kit-detail-eyebrow">
              NOTE KIT
            </div>

            <h2>
              Note inserite
            </h2>
          </div>
        </div>

        <div
          className={
            kit.note
              ? "kit-notes-text"
              : "kit-notes-empty"
          }
        >
          {kit.note ||
            "Nessuna nota inserita per questo kit."}
        </div>
      </section>

      <section className="kit-danger-card">
        <div>
          <div className="kit-detail-eyebrow danger">
            ELIMINAZIONE
          </div>

          <h2>
            Elimina kit
          </h2>

          <p>
            Usalo per un inserimento errato o per il kit di prova.
            Se il kit è in giacenza, il sistema diminuisce
            automaticamente di 1 la giacenza dell&apos;articolo.
          </p>
        </div>

        <button
          type="button"
          onClick={
            deleteKit
          }
          disabled={
            deleting ||
            isSold
          }
          title={
            isSold
              ? "Prima annulla la vendita"
              : "Elimina definitivamente il kit"
          }
        >
          {deleting
            ? "Eliminazione..."
            : isSold
              ? "Kit venduto"
              : "Elimina kit"}
        </button>
      </section>

      <Styles />
    </div>
  );
}

function DetailCard({
  label,
  value,
  highlight = false,
  sold = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  sold?: boolean;
}) {
  return (
    <div
      className={`kit-detail-card ${
        highlight
          ? "highlight"
          : ""
      } ${
        sold
          ? "sold"
          : ""
      }`}
    >
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      .kit-detail-page {
        width: 100%;
        max-width: 1300px;
        margin: 0 auto;
        color: #f8fafc;
      }

      .kit-detail-loading {
        min-height: 45vh;
        display: grid;
        place-items: center;
        color: var(--foreground);
        font-weight: 850;
      }

      .kit-detail-hero {
        padding: 20px 22px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        border: 1px solid rgba(96, 165, 250, 0.24);
        border-radius: 16px;
        background:
          linear-gradient(
            135deg,
            #0d1d31,
            #091525
          );
      }

      .kit-detail-eyebrow {
        color: #60a5fa;
        font-size: 9px;
        font-weight: 950;
        letter-spacing: 1.4px;
      }

      .kit-detail-eyebrow.danger {
        color: #f87171;
      }

      .kit-detail-hero h1 {
        margin: 5px 0 0;
        color: #ffffff;
        font-size: 31px;
        font-weight: 950;
        letter-spacing: -0.7px;
      }

      .kit-detail-hero p {
        margin: 5px 0 0;
        color: #cbd5e1;
        font-size: 11px;
        font-weight: 700;
      }

      .kit-detail-actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }

      .kit-detail-back {
        min-height: 40px;
        padding: 0 13px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 9px;
        background: rgba(255, 255, 255, 0.035);
        color: #e2e8f0;
        text-decoration: none;
        font-size: 10px;
        font-weight: 900;
      }

      .kit-detail-status {
        min-height: 40px;
        padding: 0 12px;
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        font-size: 9px;
        font-weight: 950;
      }

      .kit-detail-status.stock {
        border: 1px solid rgba(34, 197, 94, 0.30);
        background: rgba(34, 197, 94, 0.09);
        color: #86efac;
      }

      .kit-detail-status.sold {
        border: 1px solid rgba(249, 115, 22, 0.30);
        background: rgba(249, 115, 22, 0.09);
        color: #fdba74;
      }

      .kit-detail-error {
        margin-top: 12px;
        padding: 12px 14px;
        border: 1px solid rgba(239, 68, 68, 0.30);
        border-radius: 10px;
        background: rgba(239, 68, 68, 0.08);
        color: #fca5a5;
        font-size: 11px;
        font-weight: 800;
      }

      .kit-detail-grid {
        margin-top: 12px;
        display: grid;
        grid-template-columns:
          repeat(
            4,
            minmax(0, 1fr)
          );
        gap: 10px;
      }

      .kit-detail-card {
        min-width: 0;
        padding: 14px;
        border: 1px solid rgba(148, 163, 184, 0.16);
        border-radius: 11px;
        background: #0c1a2b;
      }

      .kit-detail-card.highlight {
        border-color: rgba(96, 165, 250, 0.40);
        background: rgba(37, 99, 235, 0.12);
      }

      .kit-detail-card.sold {
        border-color: rgba(249, 115, 22, 0.28);
        background: rgba(249, 115, 22, 0.07);
      }

      .kit-detail-card span,
      .kit-detail-card strong {
        display: block;
      }

      .kit-detail-card span {
        color: #7f94ad;
        font-size: 8px;
        font-weight: 950;
        letter-spacing: 0.7px;
        text-transform: uppercase;
      }

      .kit-detail-card strong {
        margin-top: 5px;
        overflow: hidden;
        color: #ffffff;
        font-size: 13px;
        text-overflow: ellipsis;
      }

      .kit-description-card,
      .kit-notes-card,
      .kit-danger-card {
        margin-top: 12px;
        padding: 17px;
        border: 1px solid rgba(148, 163, 184, 0.16);
        border-radius: 13px;
        background: #0c1a2b;
      }

      .kit-description-card h2,
      .kit-notes-card h2,
      .kit-danger-card h2 {
        margin: 5px 0 0;
        color: #ffffff;
        font-size: 17px;
        font-weight: 900;
      }

      .kit-notes-text,
      .kit-notes-empty {
        margin-top: 13px;
        padding: 15px;
        min-height: 80px;
        box-sizing: border-box;
        border-radius: 10px;
        white-space: pre-wrap;
        font-size: 12px;
        line-height: 1.65;
      }

      .kit-notes-text {
        border: 1px solid rgba(96, 165, 250, 0.22);
        background: rgba(59, 130, 246, 0.06);
        color: #edf5ff;
      }

      .kit-notes-empty {
        border: 1px dashed rgba(148, 163, 184, 0.20);
        color: #7f94ad;
      }

      .kit-danger-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        border-color: rgba(239, 68, 68, 0.20);
      }

      .kit-danger-card p {
        max-width: 760px;
        margin: 6px 0 0;
        color: #94a3b8;
        font-size: 10px;
        line-height: 1.55;
      }

      .kit-danger-card button {
        min-height: 42px;
        padding: 0 15px;
        flex: 0 0 auto;
        border: 1px solid rgba(239, 68, 68, 0.42);
        border-radius: 9px;
        background: rgba(239, 68, 68, 0.10);
        color: #fca5a5;
        cursor: pointer;
        font-size: 10px;
        font-weight: 950;
      }

      .kit-danger-card button:disabled {
        opacity: 0.42;
        cursor: not-allowed;
      }

      @media (max-width: 950px) {
        .kit-detail-grid {
          grid-template-columns:
            1fr
            1fr;
        }
      }

      @media (max-width: 650px) {
        .kit-detail-hero,
        .kit-danger-card {
          align-items: stretch;
          flex-direction: column;
        }

        .kit-detail-actions {
          justify-content: flex-start;
        }

        .kit-detail-grid {
          grid-template-columns:
            1fr;
        }

        .kit-danger-card button {
          width: 100%;
        }
      }
    `}</style>
  );
}
