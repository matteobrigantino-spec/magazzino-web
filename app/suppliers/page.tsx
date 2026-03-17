"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

type Supplier = {
  id: string;
  name: string;
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id,name")
        .order("name");

      if (!error && data) setSuppliers(data);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Fornitori</h1>

        <Link
          href="/suppliers/new"
          className="border px-4 py-2 rounded font-semibold"
        >
          + Nuovo Fornitore
        </Link>
      </div>

      {loading ? (
        <p className="mt-4 opacity-70">Caricamento...</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {suppliers.map((s) => (
            <li key={s.id}>
              <Link
                href={`/suppliers/${s.id}`}
                className="border p-3 rounded block hover:bg-gray-100"
              >
                {s.name}
              </Link>
            </li>
          ))}

          {suppliers.length === 0 && (
            <li className="border p-3 rounded opacity-70">
              Nessun fornitore presente.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
