"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

type ItemData = {
  id: string;
  supplier_id: string;
  code: string;
  description: string;
  stock: number;
  price: number;
  on_order: number;
  image_url: string | null;
};

export default function ItemDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }> | { itemId: string };
}) {
  const resolvedParams =
    typeof (params as any)?.then === "function"
      ? use(params as Promise<{ itemId: string }>)
      : (params as { itemId: string });

  const itemId = resolvedParams.itemId;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [supplierId, setSupplierId] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [stock, setStock] = useState<number>(0);
  const [onOrder, setOnOrder] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    async function loadItem() {
      setLoading(true);

      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("id", itemId)
        .single();

      if (error) {
        setMsg("Errore caricamento: " + error.message);
        setLoading(false);
        return;
      }

      const item = data as ItemData;
      setSupplierId(item.supplier_id || "");
      setCode(item.code || "");
      setDescription(item.description || "");
      setPrice(Number(item.price || 0));
      setStock(Number(item.stock || 0));
      setOnOrder(Number(item.on_order || 0));
      setImageUrl(item.image_url || "");

      setLoading(false);
    }

    loadItem();
  }, [itemId]);

  async function saveItem() {
    setMsg("");
    setSaving(true);

    const trimmedCode = code.trim();
    const trimmedDescription = description.trim();

    if (!trimmedCode) {
      setMsg("Inserisci il codice articolo.");
      setSaving(false);
      return;
    }

    if (!trimmedDescription) {
      setMsg("Inserisci la descrizione.");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("items")
      .update({
        code: trimmedCode,
        description: trimmedDescription,
        price: Number(price) || 0,
        stock: Number(stock) || 0,
        on_order: Number(onOrder) || 0,
        image_url: imageUrl.trim() || null,
      })
      .eq("id", itemId);

    if (error) {
      setMsg("Errore salvataggio: " + error.message);
      setSaving(false);
      return;
    }

    setMsg("Articolo salvato correttamente ✔");
    setSaving(false);
  }

  if (loading) {
    return <div>Caricamento...</div>;
  }

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Dettaglio Articolo</h1>

        <div className="flex gap-3">
          <Link
            href={supplierId ? `/suppliers/${supplierId}` : "/suppliers"}
            className="border px-4 py-2 rounded hover:bg-gray-700"
          >
            ← Torna al fornitore
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="space-y-4">
          <div>
            <label className="block mb-1 font-semibold">Codice articolo</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="border p-3 w-full rounded"
            />
          </div>

          <div>
            <label className="block mb-1 font-semibold">Descrizione</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="border p-3 w-full rounded"
            />
          </div>

          <div>
            <label className="block mb-1 font-semibold">Prezzo singolo</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="border p-3 w-full rounded"
            />
          </div>

          <div>
            <label className="block mb-1 font-semibold">Articoli in magazzino</label>
            <input
              type="number"
              value={stock}
              onChange={(e) => setStock(Number(e.target.value))}
              className="border p-3 w-full rounded"
            />
          </div>

          <div>
            <label className="block mb-1 font-semibold">Articoli in ordine</label>
            <input
              type="number"
              value={onOrder}
              onChange={(e) => setOnOrder(Number(e.target.value))}
              className="border p-3 w-full rounded"
            />
          </div>

          <div>
            <label className="block mb-1 font-semibold">Link immagine</label>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="border p-3 w-full rounded"
            />
          </div>

          <button
            onClick={saveItem}
            disabled={saving}
            className="border px-4 py-3 rounded hover:bg-gray-700"
          >
            {saving ? "Salvataggio..." : "Salva modifiche"}
          </button>

          {msg && <div className="border p-3 rounded">{msg}</div>}
        </div>

        <div>
          <div className="border rounded p-4 bg-gray-900">
            <div className="mb-3 text-lg font-semibold">Anteprima articolo</div>

            <div className="mb-4">
              <div className="text-sm opacity-70">Codice letto dalla pistola</div>
              <div className="text-2xl font-bold mt-1">{code || "Nessun codice"}</div>
            </div>

            <div className="mb-4">
              <div className="text-sm opacity-70">Totale in magazzino</div>
              <div className="text-xl font-semibold">
                {(Number(stock) * Number(price)).toFixed(2)} €
              </div>
            </div>

            <div className="mb-4">
              <div className="text-sm opacity-70">Totale in ordine</div>
              <div className="text-xl font-semibold">
                {(Number(onOrder) * Number(price)).toFixed(2)} €
              </div>
            </div>

            <div className="mt-4 border rounded p-3 min-h-[260px] flex items-center justify-center bg-black">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Articolo"
                  className="max-h-64 object-contain"
                />
              ) : (
                <span className="opacity-50">Nessuna immagine</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}