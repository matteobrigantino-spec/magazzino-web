"use client";

import React, { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";

type Item = {
  id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  stock: number;
  price: number;
  on_order: number;
  image_url: string | null;
};

export default function SupplierDetail({
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
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredImage, setHoveredImage] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      const { data: supplier } = await supabase
        .from("suppliers")
        .select("name")
        .eq("id", supplierId)
        .maybeSingle();

      if (supplier?.name) {
        setSupplierName(supplier.name);
      }

      const { data: itemsData } = await supabase
        .from("items")
        .select("id, code, supplier_code, description, stock, price, on_order, image_url")
        .eq("supplier_id", supplierId)
        .order("description");

      if (itemsData) {
        setItems(itemsData);
      }

      setLoading(false);
    }

    loadData();
  }, [supplierId]);

  const totals = useMemo(() => {
    const totalMagazzino = items.reduce(
      (sum, it) => sum + Number(it.stock || 0) * Number(it.price || 0),
      0
    );

    const totalOrdine = items.reduce(
      (sum, it) => sum + Number(it.on_order || 0) * Number(it.price || 0),
      0
    );

    return { totalMagazzino, totalOrdine };
  }, [items]);

  return (
    <div>
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{supplierName}</h1>

        <div className="flex gap-3">
          <Link
            href={`/suppliers/${supplierId}/new-item`}
            className="border px-4 py-2 rounded hover:bg-gray-700"
          >
            + Nuovo Articolo
          </Link>

          <Link
            href="/suppliers"
            className="border px-4 py-2 rounded hover:bg-gray-700"
          >
            ← Torna ai fornitori
          </Link>
        </div>
      </div>

      <div className="mt-4 border p-3 rounded bg-gray-900">
        <div>Totale € in magazzino: {totals.totalMagazzino.toFixed(2)}</div>
        <div>Totale € in ordine: {totals.totalOrdine.toFixed(2)}</div>
      </div>

      {hoveredImage && (
        <div className="fixed right-5 top-20 z-50 border bg-black p-2 rounded shadow-lg">
          <img
            src={hoveredImage}
            alt="Anteprima articolo"
            className="w-48 h-48 object-contain"
          />
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border mt-2 text-sm">
          <thead className="bg-gray-700 text-white">
            <tr>
              <th className="p-2">Codice fornitore</th>
              <th className="p-2">Fornitore</th>
              <th className="p-2">Descrizione</th>
              <th className="p-2">Prezzo singolo</th>
              <th className="p-2">Articoli in magazzino</th>
              <th className="p-2">Prezzo totale in magazzino</th>
              <th className="p-2">Articoli in ordine</th>
              <th className="p-2">Prezzo totale in ordine</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="p-3 text-center">
                  Caricamento...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-3 text-center">
                  Nessun articolo per questo fornitore.
                </td>
              </tr>
            ) : (
              items.map((it, index) => (
                <tr
                  key={it.id}
                  className={`${
                    index % 2 === 0 ? "bg-gray-900" : "bg-gray-800"
                  } hover:bg-blue-900 transition`}
                >
                  <td
                    className="p-2 underline cursor-pointer"
                    onMouseEnter={() => setHoveredImage(it.image_url)}
                    onMouseLeave={() => setHoveredImage(null)}
                  >
                    <Link href={`/items/${it.id}`}>
                      {it.supplier_code || "-"}
                    </Link>
                  </td>

                  <td className="p-2">{supplierName}</td>
                  <td className="p-2">{it.description}</td>
                  <td className="p-2">{Number(it.price).toFixed(2)}</td>
                  <td className="p-2">{it.stock}</td>
                  <td className="p-2">
                    {(Number(it.stock) * Number(it.price)).toFixed(2)}
                  </td>
                  <td className="p-2">{it.on_order}</td>
                  <td className="p-2">
                    {(Number(it.on_order) * Number(it.price)).toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}