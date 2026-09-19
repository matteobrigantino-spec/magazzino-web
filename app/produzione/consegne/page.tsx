"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { supabase } from "../../../lib/supabaseClient";
import { fetchCompanyLogo, drawCompanyLogoTopRight } from "../../../lib/pdfLogo";

type Boat = {
  id: string;
  progressive_no: number | null;
  order_number: string;
  model_boat: string;
};

type DeliveryItem = {
  id: string;
  delivery_id: string;
  boat_id: string;
  note: string | null;
  sort_order: number;
};

type Delivery = {
  id: string;
  trip_date: string;
  title: string;
  note: string | null;
};

type DraftItem = {
  boatId: string;
  note: string;
};

function monthBounds(month: string) {
  const [y, m] = month.split("-").map((v) => Number(v));
  const start = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function formatItDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ProductionDeliveriesPage() {
  const [month, setMonth] = useState(() => todayInputValue().slice(0, 7));
  const [boats, setBoats] = useState<Boat[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [itemsByDelivery, setItemsByDelivery] = useState<Record<string, DeliveryItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [formDate, setFormDate] = useState(todayInputValue());
  const [formTitle, setFormTitle] = useState("");
  const [formNote, setFormNote] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [pickerBoatId, setPickerBoatId] = useState("");
  const [pickerNote, setPickerNote] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const { start, end } = monthBounds(month);

    const [boatRes, delRes] = await Promise.all([
      supabase
        .from("production_boats")
        .select("id,progressive_no,order_number,model_boat")
        .order("progressive_no", { ascending: true }),
      supabase
        .from("production_deliveries")
        .select("id,trip_date,title,note")
        .gte("trip_date", start)
        .lte("trip_date", end)
        .order("trip_date", { ascending: true }),
    ]);

    if (boatRes.error) {
      setErrorMessage("Errore caricamento battelli: " + boatRes.error.message);
      setLoading(false);
      return;
    }

    if (delRes.error) {
      setErrorMessage("Errore caricamento viaggi: " + delRes.error.message);
      setLoading(false);
      return;
    }

    const cleanBoats: Boat[] = (boatRes.data || []).map((row: any) => ({
      id: String(row.id),
      progressive_no:
        row.progressive_no === null || row.progressive_no === undefined
          ? null
          : Number(row.progressive_no),
      order_number: String(row.order_number || ""),
      model_boat: String(row.model_boat || ""),
    }));

    setBoats(cleanBoats);

    const cleanDeliveries: Delivery[] = (delRes.data || []).map((row: any) => ({
      id: String(row.id),
      trip_date: String(row.trip_date || ""),
      title: String(row.title || ""),
      note: row.note ? String(row.note) : null,
    }));

    setDeliveries(cleanDeliveries);

    const deliveryIds = cleanDeliveries.map((d) => d.id);

    if (deliveryIds.length === 0) {
      setItemsByDelivery({});
      setLoading(false);
      return;
    }

    const itemRes = await supabase
      .from("production_delivery_items")
      .select("id,delivery_id,boat_id,note,sort_order")
      .in("delivery_id", deliveryIds)
      .order("sort_order", { ascending: true });

    if (itemRes.error) {
      setErrorMessage("Errore caricamento battelli del viaggio: " + itemRes.error.message);
      setLoading(false);
      return;
    }

    const grouped: Record<string, DeliveryItem[]> = {};
    for (const row of itemRes.data || []) {
      const item: DeliveryItem = {
        id: String((row as any).id),
        delivery_id: String((row as any).delivery_id),
        boat_id: String((row as any).boat_id),
        note: (row as any).note ? String((row as any).note) : null,
        sort_order: Number((row as any).sort_order || 0),
      };
      if (!grouped[item.delivery_id]) grouped[item.delivery_id] = [];
      grouped[item.delivery_id].push(item);
    }

    setItemsByDelivery(grouped);
    setLoading(false);
  }

  const boatMap = useMemo(() => new Map(boats.map((boat) => [boat.id, boat])), [boats]);

  const availableBoats = useMemo(
    () => boats.filter((boat) => !draftItems.some((item) => item.boatId === boat.id)),
    [boats, draftItems]
  );

  function addDraftItem() {
    if (!pickerBoatId) return;
    setDraftItems((current) => [...current, { boatId: pickerBoatId, note: pickerNote.trim() }]);
    setPickerBoatId("");
    setPickerNote("");
  }

  function removeDraftItem(index: number) {
    setDraftItems((current) => current.filter((_, i) => i !== index));
  }

  function resetForm() {
    setFormDate(todayInputValue());
    setFormTitle("");
    setFormNote("");
    setDraftItems([]);
    setPickerBoatId("");
    setPickerNote("");
  }

  async function saveTrip() {
    setErrorMessage("");
    setMessage("");

    if (!formDate) {
      setErrorMessage("Inserisci la data del viaggio.");
      return;
    }

    if (draftItems.length === 0) {
      setErrorMessage("Aggiungi almeno un battello al viaggio.");
      return;
    }

    setCreating(true);

    const { data, error } = await supabase
      .from("production_deliveries")
      .insert({
        trip_date: formDate,
        title: formTitle.trim(),
        note: formNote.trim() || null,
      })
      .select("id")
      .maybeSingle();

    if (error || !data) {
      setErrorMessage("Errore creazione viaggio: " + (error?.message || ""));
      setCreating(false);
      return;
    }

    const deliveryId = String((data as any).id);

    const { error: itemsError } = await supabase.from("production_delivery_items").insert(
      draftItems.map((item, index) => ({
        delivery_id: deliveryId,
        boat_id: item.boatId,
        note: item.note || null,
        sort_order: (index + 1) * 10,
      }))
    );

    if (itemsError) {
      setErrorMessage("Errore salvataggio battelli del viaggio: " + itemsError.message);
      setCreating(false);
      return;
    }

    setCreating(false);
    setShowNew(false);
    resetForm();
    setMessage("Viaggio creato.");

    const tripMonth = formDate.slice(0, 7);
    if (tripMonth !== month) {
      setMonth(tripMonth);
    } else {
      await loadData();
    }
  }

  async function deleteTrip(delivery: Delivery) {
    const ok = window.confirm(
      `Eliminare il viaggio del ${formatItDate(delivery.trip_date)}${
        delivery.title ? ` (${delivery.title})` : ""
      }?`
    );
    if (!ok) return;

    setSavingId(delivery.id);
    setErrorMessage("");
    setMessage("");

    const { error } = await supabase.from("production_deliveries").delete().eq("id", delivery.id);

    if (error) {
      setErrorMessage("Errore eliminazione viaggio: " + error.message);
      setSavingId("");
      return;
    }

    setSavingId("");
    setMessage("Viaggio eliminato.");
    await loadData();
  }

  function tripRows(delivery: Delivery) {
    return (itemsByDelivery[delivery.id] || [])
      .map((item) => ({ item, boat: boatMap.get(item.boat_id) }))
      .filter((row) => row.boat);
  }

  function drawTripTable(doc: jsPDF, delivery: Delivery, startY: number): number {
    const rows = tripRows(delivery);
    let y = startY;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(
      `${formatItDate(delivery.trip_date)}${delivery.title ? " · " + delivery.title : ""}`,
      12,
      y
    );
    y += 4;

    if (delivery.note) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      const noteLines = doc.splitTextToSize(delivery.note, 186);
      doc.text(noteLines, 12, y + 2);
      y += noteLines.length * 3.2 + 2;
    }

    y += 3;

    const columns = [
      { x: 12, title: "Prog.", w: 15 },
      { x: 27, title: "N. ordine", w: 28 },
      { x: 55, title: "Modello battello", w: 55 },
      { x: 110, title: "Note consegna", w: 88 },
    ];

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    for (const col of columns) {
      doc.rect(col.x, y - 4, col.w, 7);
      doc.text(col.title, col.x + 1.2, y + 0.6);
    }
    y += 3;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.6);

    for (const row of rows) {
      const boat = row.boat!;
      const values = [
        boat.progressive_no !== null ? String(boat.progressive_no) : "-",
        boat.order_number,
        boat.model_boat,
        row.item.note || "",
      ];

      const noteLines = doc.splitTextToSize(values[3], columns[3].w - 2);
      const modelLines = doc.splitTextToSize(values[2], columns[2].w - 2);
      const rowH = Math.max(7, noteLines.length * 3 + 3, modelLines.length * 3 + 3);

      if (y + rowH > 280) {
        doc.addPage();
        y = 16;
      }

      values.forEach((value, index) => {
        const col = columns[index];
        doc.rect(col.x, y, col.w, rowH);
        const content =
          index === 3 ? noteLines : index === 2 ? modelLines : doc.splitTextToSize(value, col.w - 2);
        doc.text(content, col.x + 1.2, y + 3.6);
      });

      y += rowH;
    }

    return y + 8;
  }

  async function generateTripPdf(delivery: Delivery) {
    const rows = tripRows(delivery);
    if (rows.length === 0) {
      setErrorMessage("Questo viaggio non ha battelli da stampare.");
      return;
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const companyLogo = await fetchCompanyLogo();
    drawCompanyLogoTopRight(doc, companyLogo, { maxWidth: 28, maxHeight: 13 });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("PROGRAMMA DI CONSEGNA", 12, 16);

    drawTripTable(doc, delivery, 26);

    const safeDate = delivery.trip_date.replace(/-/g, "");
    const safeTitle = delivery.title.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    doc.save(`Consegna_${safeDate}${safeTitle ? "_" + safeTitle : ""}.pdf`);
  }

  async function generateMonthPdf() {
    if (deliveries.length === 0) {
      setErrorMessage("Non ci sono viaggi da stampare in questo mese.");
      return;
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const companyLogo = await fetchCompanyLogo();
    drawCompanyLogoTopRight(doc, companyLogo, { maxWidth: 28, maxHeight: 13 });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);

    const [y, m] = month.split("-");
    const monthLabel = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(
      new Date(Number(y), Number(m) - 1, 1)
    );

    doc.text(`PROGRAMMA CONSEGNE - ${monthLabel.toUpperCase()}`, 12, 16);

    let y2 = 26;
    for (const delivery of deliveries) {
      if (y2 > 250) {
        doc.addPage();
        y2 = 16;
      }
      y2 = drawTripTable(doc, delivery, y2);
    }

    doc.save(`Programma_Consegne_${month}.pdf`);
  }

  return (
    <div className="pcg-page">
      <section className="pcg-hero">
        <div>
          <div className="pcg-eyebrow">PRODUZIONE</div>
          <h1>Consegne</h1>
          <p>
            Organizza piccoli viaggi con i battelli da consegnare e stampa il
            programma in PDF, per singolo viaggio o per tutto il mese.
          </p>
        </div>

        <div className="pcg-actions">
          <Link href="/produzione" className="pcg-btn secondary">
            ← Produzione
          </Link>
          <button type="button" className="pcg-btn secondary" onClick={generateMonthPdf}>
            Genera PDF mese
          </button>
          <button
            type="button"
            className="pcg-btn primary"
            onClick={() => setShowNew((value) => !value)}
          >
            + Nuovo viaggio
          </button>
        </div>
      </section>

      {(message || errorMessage) && (
        <div className={errorMessage ? "pcg-message error" : "pcg-message success"}>
          {errorMessage || message}
        </div>
      )}

      <section className="pcg-card">
        <label className="pcg-month-field">
          <span>Mese</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </section>

      {showNew && (
        <section className="pcg-card">
          <div className="pcg-eyebrow">NUOVO VIAGGIO</div>

          <div className="pcg-form-grid">
            <label className="pcg-field">
              <span>Data *</span>
              <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </label>
            <label className="pcg-field">
              <span>Titolo / destinazione (facoltativo)</span>
              <input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Es. Zona Nord"
              />
            </label>
            <label className="pcg-field wide">
              <span>Note viaggio (facoltativo)</span>
              <input
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="Es. Partenza ore 7:00"
              />
            </label>
          </div>

          <div className="pcg-picker">
            <select value={pickerBoatId} onChange={(e) => setPickerBoatId(e.target.value)}>
              <option value="">Seleziona battello...</option>
              {availableBoats.map((boat) => (
                <option key={boat.id} value={boat.id}>
                  {boat.order_number} · {boat.model_boat}
                </option>
              ))}
            </select>
            <input
              value={pickerNote}
              onChange={(e) => setPickerNote(e.target.value)}
              placeholder="Nota per questo battello (facoltativa)"
            />
            <button type="button" onClick={addDraftItem} disabled={!pickerBoatId}>
              + Aggiungi
            </button>
          </div>

          {draftItems.length > 0 && (
            <div className="pcg-draft-list">
              {draftItems.map((item, index) => {
                const boat = boatMap.get(item.boatId);
                return (
                  <div className="pcg-draft-row" key={item.boatId}>
                    <strong>{boat?.order_number || "—"}</strong>
                    <span>{boat?.model_boat || ""}</span>
                    {item.note && <em>{item.note}</em>}
                    <button type="button" onClick={() => removeDraftItem(index)}>
                      Rimuovi
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pcg-form-actions">
            <button
              type="button"
              className="pcg-btn secondary"
              onClick={() => {
                setShowNew(false);
                resetForm();
              }}
              disabled={creating}
            >
              Annulla
            </button>
            <button type="button" className="pcg-btn primary" onClick={saveTrip} disabled={creating}>
              {creating ? "Salvataggio..." : "Salva viaggio"}
            </button>
          </div>
        </section>
      )}

      <section className="pcg-card">
        <div className="pcg-list-head">
          <div>
            <div className="pcg-eyebrow">VIAGGI DEL MESE</div>
            <h2>Programma consegne</h2>
          </div>
          <span>{deliveries.length}</span>
        </div>

        {loading ? (
          <div className="pcg-empty">Caricamento...</div>
        ) : deliveries.length === 0 ? (
          <div className="pcg-empty">Nessun viaggio in questo mese.</div>
        ) : (
          <div className="pcg-trip-list">
            {deliveries.map((delivery) => {
              const rows = tripRows(delivery);
              return (
                <div className="pcg-trip" key={delivery.id}>
                  <div className="pcg-trip-head">
                    <div>
                      <strong>{formatItDate(delivery.trip_date)}</strong>
                      {delivery.title && <span> · {delivery.title}</span>}
                      {delivery.note && <em>{delivery.note}</em>}
                    </div>
                    <div className="pcg-trip-actions">
                      <button type="button" onClick={() => generateTripPdf(delivery)}>
                        Genera PDF
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={savingId === delivery.id}
                        onClick={() => deleteTrip(delivery)}
                      >
                        Elimina
                      </button>
                    </div>
                  </div>

                  {rows.length === 0 ? (
                    <div className="pcg-trip-empty">Nessun battello in questo viaggio.</div>
                  ) : (
                    <table className="pcg-trip-table">
                      <thead>
                        <tr>
                          <th>N° ordine</th>
                          <th>Modello</th>
                          <th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.item.id}>
                            <td>{row.boat!.order_number}</td>
                            <td>{row.boat!.model_boat}</td>
                            <td>{row.item.note || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
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
      .pcg-page { width:100%; max-width:1200px; margin:0 auto; color:#f8fafc; }
      .pcg-hero { padding:21px 22px; display:flex; align-items:center; justify-content:space-between; gap:18px; flex-wrap:wrap; border:1px solid rgba(59,130,246,.24); border-radius:16px; background:linear-gradient(135deg,#0d1d31,#071321); }
      .pcg-eyebrow { color:#60a5fa; font-size:9px; font-weight:950; letter-spacing:1.45px; }
      .pcg-hero h1 { margin:5px 0 0; font-size:27px; font-weight:950; letter-spacing:-.6px; }
      .pcg-hero p { max-width:640px; margin:6px 0 0; color:#91a4bc; font-size:10px; line-height:1.55; }
      .pcg-actions { display:flex; align-items:center; flex-wrap:wrap; gap:7px; }
      .pcg-btn { min-height:38px; padding:0 12px; display:inline-flex; align-items:center; border-radius:8px; text-decoration:none; font-size:9px; font-weight:900; cursor:pointer; border:0; }
      .pcg-btn.secondary { border:1px solid rgba(148,163,184,.22); background:rgba(255,255,255,.035); color:#e2e8f0; }
      .pcg-btn.primary { border:1px solid #2563eb; background:#2563eb; color:#fff; }
      .pcg-btn:disabled { opacity:.55; cursor:wait; }
      .pcg-message { margin-top:11px; padding:11px 13px; border-radius:9px; font-size:10px; font-weight:800; }
      .pcg-message.success { border:1px solid rgba(34,197,94,.28); background:rgba(34,197,94,.08); color:#86efac; }
      .pcg-message.error { border:1px solid rgba(239,68,68,.28); background:rgba(239,68,68,.08); color:#fca5a5; }
      .pcg-card { margin-top:11px; padding:16px; border:1px solid rgba(148,163,184,.15); border-radius:13px; background:#0b1828; }
      .pcg-month-field { display:flex; align-items:center; gap:10px; }
      .pcg-month-field span { color:#8ea2ba; font-size:8px; font-weight:900; text-transform:uppercase; letter-spacing:.6px; }
      .pcg-month-field input { min-height:38px; padding:0 10px; border:1px solid rgba(148,163,184,.19); border-radius:8px; outline:none; background:#081524; color:#fff; font-size:11px; }
      .pcg-form-grid { margin-top:12px; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
      .pcg-field { min-width:0; }
      .pcg-field.wide { grid-column:span 1; }
      .pcg-field > span { margin-bottom:5px; display:block; color:#8ea2ba; font-size:8px; font-weight:900; text-transform:uppercase; letter-spacing:.6px; }
      .pcg-field input { width:100%; min-height:39px; box-sizing:border-box; padding:0 10px; border:1px solid rgba(148,163,184,.19); border-radius:8px; outline:none; background:#081524; color:#fff; font-size:11px; }
      .pcg-picker { margin-top:14px; display:grid; grid-template-columns:1fr 1fr auto; gap:8px; }
      .pcg-picker select, .pcg-picker input { min-height:39px; box-sizing:border-box; padding:0 10px; border:1px solid rgba(148,163,184,.19); border-radius:8px; outline:none; background:#081524; color:#fff; font-size:10px; }
      .pcg-picker button { min-height:39px; padding:0 14px; border:1px solid rgba(96,165,250,.32); border-radius:8px; background:rgba(59,130,246,.14); color:#bfdbfe; cursor:pointer; font-size:9px; font-weight:900; white-space:nowrap; }
      .pcg-picker button:disabled { opacity:.5; cursor:default; }
      .pcg-draft-list { margin-top:10px; display:flex; flex-direction:column; gap:6px; }
      .pcg-draft-row { padding:8px 10px; display:flex; align-items:center; gap:8px; border:1px solid rgba(148,163,184,.13); border-radius:8px; background:rgba(255,255,255,.02); font-size:10px; }
      .pcg-draft-row strong { color:#93c5fd; }
      .pcg-draft-row span { color:#cbd5e1; }
      .pcg-draft-row em { flex:1; color:#8ea2ba; font-style:normal; font-size:9px; }
      .pcg-draft-row button { margin-left:auto; padding:4px 9px; border:1px solid rgba(239,68,68,.25); border-radius:6px; background:rgba(239,68,68,.07); color:#fca5a5; cursor:pointer; font-size:8px; font-weight:900; }
      .pcg-form-actions { margin-top:14px; display:flex; justify-content:flex-end; gap:8px; }
      .pcg-list-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
      .pcg-list-head h2 { margin:4px 0 0; font-size:17px; }
      .pcg-list-head > span { min-width:29px; min-height:29px; display:grid; place-items:center; border:1px solid rgba(96,165,250,.23); border-radius:999px; color:#93c5fd; font-size:9px; font-weight:950; }
      .pcg-trip-list { margin-top:12px; display:flex; flex-direction:column; gap:10px; }
      .pcg-trip { padding:13px; border:1px solid rgba(148,163,184,.13); border-radius:10px; background:rgba(255,255,255,.016); }
      .pcg-trip-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .pcg-trip-head strong { font-size:12px; }
      .pcg-trip-head span { color:#93c5fd; font-size:11px; font-weight:800; }
      .pcg-trip-head em { display:block; margin-top:3px; color:#8ea2ba; font-size:9px; font-style:normal; }
      .pcg-trip-actions { display:flex; gap:6px; }
      .pcg-trip-actions button { min-height:30px; padding:0 10px; border:1px solid rgba(96,165,250,.28); border-radius:7px; background:rgba(59,130,246,.10); color:#93c5fd; cursor:pointer; font-size:8px; font-weight:900; }
      .pcg-trip-actions button.danger { border-color:rgba(239,68,68,.28); background:rgba(239,68,68,.08); color:#fca5a5; }
      .pcg-trip-actions button:disabled { opacity:.5; cursor:wait; }
      .pcg-trip-empty { margin-top:8px; color:#7388a3; font-size:9px; }
      .pcg-trip-table { margin-top:10px; width:100%; border-collapse:collapse; font-size:9px; }
      .pcg-trip-table th { padding:6px 8px; background:rgba(255,255,255,.03); color:#86a0bf; text-align:left; font-size:7px; font-weight:950; letter-spacing:.5px; text-transform:uppercase; }
      .pcg-trip-table td { padding:7px 8px; border-top:1px solid rgba(148,163,184,.09); }
      .pcg-empty { padding:30px; color:#7388a3; text-align:center; font-size:10px; }
      @media(max-width:800px){ .pcg-hero{align-items:stretch;flex-direction:column}.pcg-form-grid{grid-template-columns:1fr}.pcg-picker{grid-template-columns:1fr} }
    `}</style>
  );
}
