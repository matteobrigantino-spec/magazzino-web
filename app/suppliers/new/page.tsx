"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function NewSupplierPage() {
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function onSave() {
    const n = name.trim();
    if (!n) return setMsg("Inserisci il nome del fornitore.");

    setSaving(true);
    setMsg("");

    // evita duplicati (case-insensitive)
    const { data: existing } = await supabase
      .from("suppliers")
      .select("id,name")
      .ilike("name", n)
      .maybeSingle();

    if (existing) {
      setSaving(false);
      return setMsg("Esiste già: " + existing.name);
    }

    const { error } = await supabase.from("suppliers").insert({ name: n });

    if (error) {
      setSaving(false);
      return setMsg("Errore: " + error.message);
    }

    setSaving(false);
    router.push("/suppliers");
    router.refresh();
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold">Nuovo Fornitore</h1>

      <div className="mt-6 space-y-3">
        <label className="text-sm font-medium">Nome fornitore</label>
        <input
          className="border p-3 w-full rounded"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Es. Nautica Rossi"
        />

        <button
          onClick={onSave}
          disabled={saving}
          className="border p-3 w-full rounded font-semibold"
        >
          {saving ? "Salvataggio..." : "Salva"}
        </button>

        {msg && <div className="border p-3 rounded text-sm">{msg}</div>}
      </div>
    </div>
  );
}
