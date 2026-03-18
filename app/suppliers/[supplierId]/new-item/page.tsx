"use client";

import React, { use, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import Link from "next/link";

export default function NewItemPage({
  params,
}: {
  params: Promise<{ supplierId: string }> | { supplierId: string };
}) {
  const resolvedParams =
    typeof (params as any)?.then === "function"
      ? use(params as Promise<{ supplierId: string }>)
      : (params as { supplierId: string });

  const supplierId = resolvedParams.supplierId;
  const router = useRouter();

  const [scannerCode, setScannerCode] = useState("");
  const [supplierCode, setSupplierCode] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setMsg("");

    const trimmedScannerCode = scannerCode.trim();
    const trimmedSupplierCode = supplierCode.trim();
    const trimmedDescription = description.trim();
    const trimmedImage = imageUrl.trim();

    if (!trimmedScannerCode) {
      setMsg("Inserisci il codice scanner.");
      return;
    }

    if (!trimmedSupplierCode) {
      setMsg("Inserisci il codice fornitore.");
      return;
    }

    if (!trimmedDescription) {
      setMsg("Inserisci la descrizione.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("items").insert({
      supplier_id: supplierId,
      code: trimmedScannerCode,
      supplier_code: trimmedSupplierCode,
      description: trimmedDescription,
      price: Number(price) || 0,
      stock: 0,
      on_order: 0,
      image_url: trimmedImage || null,
    });

    if (error) {
      setMsg("Errore salvataggio: " + error.message);
      setSaving(false);
      return;
    }

    router.push(`/suppliers/${supplierId}`);
    router.refresh();
  }

  return (
    <div className="max-w-5xl">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Nuovo Articolo</h1>

        <Link
          href={`/suppliers/${supplierId}`}
          className="border px-4 py-2 rounded hover:bg-gray-700"
        >
          ← Torna al fornitore
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="space-y-4">
          <div>
            <label className="block mb-1 font-semibold">Codice scanner</label>
            <input
              value={scannerCode}
              onChange={(e) => setScannerCode(e.target.value)}
              className="border p-3 w-full rounded"
            />
          </div>

          <div>
            <label className="block mb-1 font-semibold">Codice fornitore</label>
            <input
              value={supplierCode}
              onChange={(e) => setSupplierCode(e.target.value)}
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
            <label className="block mb-1 font-semibold">Link immagine</label>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="border p-3 w-full rounded"
            />
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="border px-4 py-3 rounded hover:bg-gray-700"
          >
            {saving ? "Salvataggio..." : "Salva Articolo"}
          </button>

          {msg && <div className="border p-3 rounded">{msg}</div>}
        </div>

        <div>
          <div className="border rounded p-4 bg-gray-900">
            <div className="mb-3 text-lg font-semibold">Anteprima articolo</div>

            <div className="mb-4">
              <div className="text-sm opacity-70">Codice scanner</div>
              <div className="text-2xl font-bold mt-1">
                {scannerCode || "Nessun codice"}
              </div>
            </div>

            <div className="mb-4">
              <div className="text-sm opacity-70">Codice fornitore</div>
              <div className="text-xl font-semibold">
                {supplierCode || "Nessun codice"}
              </div>
            </div>

            <div className="mb-4">
              <div className="text-sm opacity-70">Prezzo singolo</div>
              <div className="text-xl font-semibold">
                {Number(price || 0).toFixed(2)} €
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