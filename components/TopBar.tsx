"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Supplier = {
  id: string;
  name: string;
};

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();

  const isCatalogo = pathname.startsWith("/catalogo");
  const isLogin = pathname === "/login";
  const hideTopBar = isLogin || isCatalogo;

  const [username, setUsername] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [supplierMenuOpen, setSupplierMenuOpen] = useState(false);
  const [warehouseMenuOpen, setWarehouseMenuOpen] = useState(false);

  const supplierMenuRef = useRef<HTMLDivElement | null>(null);
  const warehouseMenuRef = useRef<HTMLDivElement | null>(null);

  /*
    UTENTE
  */
  useEffect(() => {
    if (hideTopBar) {
      return;
    }

    const user = localStorage.getItem("magazzino_user");

    setUsername(user || "");
  }, [pathname, hideTopBar]);

  /*
    FORNITORI DEL MENU MAGAZZINO

    Sul catalogo non facciamo richieste
    a Supabase, perché deve funzionare offline.
  */
  useEffect(() => {
    if (hideTopBar) {
      return;
    }

    async function loadSuppliers() {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .order("name");

      if (!error && data) {
        setSuppliers(data);
      }
    }

    loadSuppliers();
  }, [pathname, hideTopBar]);

  /*
    CHIUSURA MENU CLICCANDO FUORI
  */
  useEffect(() => {
    if (hideTopBar) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (
        supplierMenuRef.current &&
        !supplierMenuRef.current.contains(target)
      ) {
        setSupplierMenuOpen(false);
      }

      if (
        warehouseMenuRef.current &&
        !warehouseMenuRef.current.contains(target)
      ) {
        setWarehouseMenuOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };
  }, [hideTopBar]);

  /*
    LOGOUT
  */
  function logout() {
    localStorage.removeItem("magazzino_user");
    localStorage.removeItem("magazzino_role");
    localStorage.removeItem("magazzino_user_id");
    localStorage.removeItem(
      "magazzino_session_version"
    );
    localStorage.removeItem(
      "magazzino_last_activity"
    );

    router.replace("/login");
  }

  /*
    LOGIN E CATALOGO:
    NESSUNA BARRA
  */
  if (hideTopBar) {
    return null;
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        {/* LOGO */}

        <Link
          href="/"
          className="topbar-logo"
        >
          MAGAZZINO
        </Link>

        {/* FORNITORI */}

        <div
          className="topbar-menu"
          ref={supplierMenuRef}
        >
          <button
            className="topbar-button"
            onClick={() => {
              setSupplierMenuOpen(
                !supplierMenuOpen
              );

              setWarehouseMenuOpen(false);
            }}
          >
            Fornitori

            <span className="topbar-arrow">
              ▼
            </span>
          </button>

          {supplierMenuOpen && (
            <div className="dropdown-menu">
              <Link
                href="/suppliers/new"
                className="dropdown-item"
                onClick={() =>
                  setSupplierMenuOpen(false)
                }
              >
                + Nuovo fornitore
              </Link>

              <Link
                href="/suppliers"
                className="dropdown-item"
                onClick={() =>
                  setSupplierMenuOpen(false)
                }
              >
                Elenco fornitori
              </Link>
            </div>
          )}
        </div>

        {/* MAGAZZINO */}

        <div
          className="topbar-menu"
          ref={warehouseMenuRef}
        >
          <button
            className="topbar-button"
            onClick={() => {
              setWarehouseMenuOpen(
                !warehouseMenuOpen
              );

              setSupplierMenuOpen(false);
            }}
          >
            Magazzino

            <span className="topbar-arrow">
              ▼
            </span>
          </button>

          {warehouseMenuOpen && (
            <div className="dropdown-menu warehouse-dropdown">
              {suppliers.length === 0 ? (
                <div className="dropdown-empty">
                  Nessun fornitore
                </div>
              ) : (
                suppliers.map((supplier) => (
                  <Link
                    key={supplier.id}
                    href={`/suppliers/${supplier.id}`}
                    className="dropdown-item"
                    onClick={() =>
                      setWarehouseMenuOpen(false)
                    }
                  >
                    {supplier.name}
                  </Link>
                ))
              )}
            </div>
          )}
        </div>

        {/* MOVIMENTI */}

        <Link
          href="/movements"
          className="topbar-link"
        >
          Movimenti
        </Link>

        {/* ORDINI */}

        <Link
          href="/orders"
          className="topbar-link"
        >
          Ordini
        </Link>

        {/* SPAZIO */}

        <div className="topbar-spacer" />

        {/* USER */}

        <div className="topbar-user">
          {username}
        </div>

        {/* IMPOSTAZIONI */}

        <Link
          href="/settings"
          title="Impostazioni"
          aria-label="Impostazioni"
          style={{
            width: 34,
            height: 34,

            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            borderRadius: 8,

            border:
              pathname === "/settings"
                ? "1px solid var(--foreground)"
                : "1px solid var(--border-color)",

            background:
              pathname === "/settings"
                ? "var(--input-bg)"
                : "transparent",

            color: "var(--foreground)",

            textDecoration: "none",

            fontSize: 18,

            lineHeight: 1,

            transition: "all 0.15s ease",
          }}
        >
          ⚙
        </Link>

        {/* LOGOUT */}

        <button
          onClick={logout}
          className="topbar-logout"
        >
          Logout
        </button>
      </div>
    </header>
  );
}