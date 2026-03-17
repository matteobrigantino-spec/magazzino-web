"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";

export default function NewItemPage({ params }: { params: { supplierId: string } }) {
  const router = useRouter();
  const supplierId = params.supplierId;

  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [stock, setStock] = useState<number>(0);
  const [onOrder, setOnOrder] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState("");
  const [msg, setMsg] = useState("");

  async function save() {
    const c = code.trim();
    const d = description.trim();
    if (!c) return setMsg("Inserisci il CODICE.");
    if (!d) return setMsg("Inserisci la DESCRIZIONE.");

    const { error } = await supabase.from("items").insert({
      supplier_id: supplierId,
      code: c,
      description: d,
      price: Number(price) || 0,
      stock: Number(stock) || 0,
      on_order: Number(onOrder) || 0,
      image_url: imageUrl.trim() || null,
    });

    if (error) return setMsg("Errore: " + error.message);

    router.push(`/suppliers/${supplierId}`);
    router.refresh();
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold">Nuovo Articolo</h1>

      <div className="mt-6 space-y-3">
        <input className="border p-3 w-full rounded" placeholder="Codice (univoco)" value={code} onChange={(e) => setCode(e.target.value)} />
        <input className="border p-3 w-full rounded" placeholder="Descrizione" value={description} onChange={(e) => setDescription(e.target.value)} />

        <div className="grid grid-cols-3 gap-3">
          <input className="border p-3 w-full rounded" type="number" placeholder="Prezzo €" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          <input className="border p-3 w-full rounded" type="number" placeholder="Stock" value={stock} onChange={(e) => setStock(Number(e.target.value))} />
          <input className="border p-3 w-full rounded" type="number" placeholder="In ordine" value={onOrder} onChange={(e) => setOnOrder(Number(e.target.value))} />
        </div>

        <input className="border p-3 w-full rounded" placeholder="Link foto (facoltativo)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />

        <button onClick={save} className="border p-3 w-full rounded font-semibold">
          Salva Articolo
        </button>

        {msg && <div className="border p-3 rounded text-sm">{msg}</div>}
      </div>
    </div>
  );
}
