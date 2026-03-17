"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Row = {
  date: string;
  movement: "SCARICO" | "CARICO";
  code: string;
  qty: number;
};

export default function MovementsPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [rows, setRows] = useState<Row[]>([
    { date: today, movement: "SCARICO", code: "", qty: 1 },
  ]);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // refs per mettere il focus sul campo "code" della riga successiva
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    codeRefs.current = codeRefs.current.slice(0, rows.length);
  }, [rows.length]);

  function updateRow(index: number, field: keyof Row, value: any) {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { date: today, movement: "SCARICO", code: "", qty: 1 },
    ]);
  }

  function removeRow(index: number) {
    setRows((prev) => {
      if (prev.length === 1) return prev;
      const copy = [...prev];
      copy.splice(index, 1);
      return copy;
    });
  }

  async function saveAll() {
    setMsg("");
    setSaving(true);

    try {
      // salviamo solo righe con codice
      const valid = rows
        .map((r) => ({
          ...r,
          code: r.code.trim(),
          qty: Number(r.qty),
        }))
        .filter((r) => r.code.length > 0);

      if (valid.length === 0) {
        setMsg("Nessuna riga da salvare.");
        return;
      }

      for (const r of valid) {
        if (!r.qty || r.qty <= 0) {
          setMsg(`Quantità non valida per codice ${r.code}`);
          return;
        }

        // 1) trova articolo per codice
        const { data: item, error: e1 } = await supabase
          .from("items")
          .select("id, stock")
          .eq("code", r.code)
          .maybeSingle();

        if (e1) {
          setMsg("Errore DB (lettura item): " + e1.message);
          return;
        }
        if (!item) {
          setMsg("Codice non trovato: " + r.code);
          return;
        }

        // 2) calcola nuovo stock
        const delta = r.movement === "CARICO" ? r.qty : -r.qty;
        const newStock = Number(item.stock) + delta;

        if (newStock < 0) {
          setMsg(`Stock insufficiente per ${r.code} (stock: ${item.stock})`);
          return;
        }

        // 3) aggiorna stock
        const { error: e2 } = await supabase
          .from("items")
          .update({ stock: newStock })
          .eq("id", item.id);

        if (e2) {
          setMsg("Errore DB (update stock): " + e2.message);
          return;
        }

        // 4) salva movimento (storico)
        const { error: e3 } = await supabase.from("movements").insert({
          movement_type: r.movement,
          code: r.code,
          qty: r.qty,
          note: `Data: ${r.date}`,
        });

        if (e3) {
          setMsg("Errore DB (insert movimento): " + e3.message);
          return;
        }
      }

      setMsg(`Movimenti salvati ✔ (${valid.length} righe)`);
      setRows([{ date: today, movement: "SCARICO", code: "", qty: 1 }]);

      // focus sulla prima riga
      setTimeout(() => codeRefs.current[0]?.focus(), 0);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Movimenti</h1>

      <div className="overflow-x-auto">
        <table className="w-full border">
          <thead>
            <tr className="border-b">
              <th className="p-2">Data</th>
              <th className="p-2">Movimento</th>
              <th className="p-2">Codice</th>
              <th className="p-2">Quantità</th>
              <th className="p-2"></th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b">
                <td className="p-2">
                  <input
                    type="date"
                    value={r.date}
                    onChange={(e) => updateRow(i, "date", e.target.value)}
                    className="border p-1"
                  />
                </td>

                <td className="p-2">
                  <select
                    value={r.movement}
                    onChange={(e) =>
                      updateRow(i, "movement", e.target.value as Row["movement"])
                    }
                    className="border p-1"
                  >
                    <option value="SCARICO">SCARICO</option>
                    <option value="CARICO">CARICO</option>
                  </select>
                </td>

                <td className="p-2 w-[50%]">
                  <input
                    ref={(el) => {
                      codeRefs.current[i] = el;
                    }}
                    value={r.code}
                    onChange={(e) => updateRow(i, "code", e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();

                        // se sei sull’ultima riga, creane un’altra e vai giù
                        if (i === rows.length - 1) {
                          addRow();
                          setTimeout(() => {
                            codeRefs.current[i + 1]?.focus();
                          }, 0);
                        } else {
                          codeRefs.current[i + 1]?.focus();
                        }
                      }
                    }}
                    className="border p-1 w-full"
                    placeholder="Scansiona qui… (INVIO = riga successiva)"
                  />
                </td>

                <td className="p-2">
                  <input
                    type="number"
                    value={r.qty}
                    onChange={(e) => updateRow(i, "qty", Number(e.target.value))}
                    className="border p-1 w-24"
                  />
                </td>

                <td className="p-2">
                  <button
                    onClick={() => removeRow(i)}
                    className="border px-3 py-1 rounded"
                    title="Elimina riga"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3 mt-4">
        <button onClick={addRow} className="border px-4 py-2 rounded">
          + Aggiungi riga
        </button>

        <button
          onClick={saveAll}
          disabled={saving}
          className="border px-4 py-2 rounded font-bold"
        >
          {saving ? "Salvataggio..." : "Salva movimenti"}
        </button>
      </div>

      {msg && <div className="mt-4 border p-3">{msg}</div>}
    </div>
  );
}
