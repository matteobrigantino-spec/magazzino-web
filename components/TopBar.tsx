"use client";

import Link from "next/link";
import {
  usePathname,
  useRouter,
} from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { supabase } from "../lib/supabaseClient";

type Supplier = {
  id: string;
  name: string;
};

type SearchItem = {
  id: string;
  supplier_id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  stock: number;
};

type SearchResult = SearchItem & {
  supplier_name: string;
};

export default function TopBar() {
  const pathname =
    usePathname();

  const router =
    useRouter();

  const isCatalogo =
    pathname.startsWith(
      "/catalogo"
    );

  const isLogin =
    pathname === "/login";

  const hideTopBar =
    isLogin ||
    isCatalogo;

  const [
    username,
    setUsername,
  ] = useState("");

  const [
    suppliers,
    setSuppliers,
  ] = useState<
    Supplier[]
  >([]);

  const [
    items,
    setItems,
  ] = useState<
    SearchItem[]
  >([]);

  const [
    supplierMenuOpen,
    setSupplierMenuOpen,
  ] = useState(false);

  const [
    warehouseMenuOpen,
    setWarehouseMenuOpen,
  ] = useState(false);

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    searchOpen,
    setSearchOpen,
  ] = useState(false);

  const [
    searchLoading,
    setSearchLoading,
  ] = useState(false);

  const supplierMenuRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const warehouseMenuRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const searchRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const searchInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  /*
    UTENTE
  */
  useEffect(() => {
    if (hideTopBar) {
      return;
    }

    const user =
      localStorage.getItem(
        "magazzino_user"
      );

    setUsername(
      user || ""
    );
  }, [
    pathname,
    hideTopBar,
  ]);

  /*
    CARICAMENTO DATI
    PER MENU E RICERCA
  */
  useEffect(() => {
    if (hideTopBar) {
      return;
    }

    async function loadTopBarData() {
      setSearchLoading(true);

      const [
        suppliersResponse,
        itemsResponse,
      ] =
        await Promise.all([
          supabase
            .from(
              "suppliers"
            )
            .select(
              "id,name"
            )
            .order(
              "name"
            ),

          supabase
            .from(
              "items"
            )
            .select(
              "id,supplier_id,code,supplier_code,description,stock"
            )
            .order(
              "description"
            ),
        ]);

      if (
        !suppliersResponse.error &&
        suppliersResponse.data
      ) {
        const cleanSuppliers:
          Supplier[] =
          suppliersResponse.data.map(
            (row) => ({
              id:
                String(
                  row.id
                ),

              name:
                String(
                  row.name ||
                    ""
                ),
            })
          );

        setSuppliers(
          cleanSuppliers
        );
      }

      if (
        !itemsResponse.error &&
        itemsResponse.data
      ) {
        const cleanItems:
          SearchItem[] =
          itemsResponse.data.map(
            (row) => ({
              id:
                String(
                  row.id
                ),

              supplier_id:
                String(
                  row.supplier_id
                ),

              code:
                String(
                  row.code ||
                    ""
                ),

              supplier_code:
                row.supplier_code
                  ? String(
                      row.supplier_code
                    )
                  : null,

              description:
                String(
                  row.description ||
                    ""
                ),

              stock:
                Number(
                  row.stock ||
                    0
                ),
            })
          );

        setItems(
          cleanItems
        );
      }

      if (
        suppliersResponse.error
      ) {
        console.error(
          "Errore fornitori TopBar:",
          suppliersResponse.error
        );
      }

      if (
        itemsResponse.error
      ) {
        console.error(
          "Errore articoli TopBar:",
          itemsResponse.error
        );
      }

      setSearchLoading(false);
    }

    loadTopBarData();
  }, [
    hideTopBar,
  ]);

  /*
    CHIUSURA MENU
    CLICCANDO FUORI
  */
  useEffect(() => {
    if (hideTopBar) {
      return;
    }

    function handleClickOutside(
      event: MouseEvent
    ) {
      const target =
        event.target as Node;

      if (
        supplierMenuRef.current &&
        !supplierMenuRef.current.contains(
          target
        )
      ) {
        setSupplierMenuOpen(
          false
        );
      }

      if (
        warehouseMenuRef.current &&
        !warehouseMenuRef.current.contains(
          target
        )
      ) {
        setWarehouseMenuOpen(
          false
        );
      }

      if (
        searchRef.current &&
        !searchRef.current.contains(
          target
        )
      ) {
        setSearchOpen(
          false
        );
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
  }, [
    hideTopBar,
  ]);

  /*
    ESC CHIUDE TUTTO
    CTRL/CMD + K APRE RICERCA
  */
  useEffect(() => {
    if (hideTopBar) {
      return;
    }

    function handleKeyboard(
      event: KeyboardEvent
    ) {
      if (
        event.key ===
        "Escape"
      ) {
        setSupplierMenuOpen(
          false
        );

        setWarehouseMenuOpen(
          false
        );

        setSearchOpen(
          false
        );

        searchInputRef.current?.blur();
      }

      if (
        (
          event.ctrlKey ||
          event.metaKey
        ) &&
        event.key.toLowerCase() ===
          "k"
      ) {
        event.preventDefault();

        setSearchOpen(
          true
        );

        searchInputRef.current?.focus();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyboard
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyboard
      );
    };
  }, [
    hideTopBar,
  ]);

  /*
    RESET RICERCA AD OGNI CAMBIO PAGINA

    Serve anche a evitare che il browser/password manager
    riutilizzi il nome utente dentro la ricerca globale.
  */
  useEffect(() => {
    if (hideTopBar) {
      return;
    }

    setSearch("");
    setSearchOpen(false);

    setSupplierMenuOpen(
      false
    );

    setWarehouseMenuOpen(
      false
    );

    if (
      searchInputRef.current
    ) {
      searchInputRef.current.value =
        "";

      searchInputRef.current.blur();
    }
  }, [
    pathname,
    hideTopBar,
  ]);

  /*
    MAPPA FORNITORI
  */
  const supplierMap =
    useMemo(() => {
      const map =
        new Map<
          string,
          string
        >();

      suppliers.forEach(
        (
          supplier
        ) => {
          map.set(
            supplier.id,
            supplier.name
          );
        }
      );

      return map;
    }, [
      suppliers,
    ]);

  /*
    RICERCA GLOBALE
  */
  const searchResults =
    useMemo<
      SearchResult[]
    >(() => {
      const query =
        normalizeText(
          search
        );

      if (!query) {
        return [];
      }

      return items
        .map(
          (
            item
          ): SearchResult => ({
            ...item,

            supplier_name:
              supplierMap.get(
                item.supplier_id
              ) ||
              "",
          })
        )
        .filter(
          (item) => {
            const fields = [
              item.code,
              item.supplier_code ||
                "",
              item.description,
              item.supplier_name,
            ];

            return fields.some(
              (
                field
              ) =>
                normalizeText(
                  field
                ).includes(
                  query
                )
            );
          }
        )
        .sort(
          (
            a,
            b
          ) => {
            const aSupplierCode =
              normalizeText(
                a.supplier_code ||
                  ""
              );

            const bSupplierCode =
              normalizeText(
                b.supplier_code ||
                  ""
              );

            const aCode =
              normalizeText(
                a.code
              );

            const bCode =
              normalizeText(
                b.code
              );

            if (
              aSupplierCode ===
                query ||
              aCode ===
                query
            ) {
              return -1;
            }

            if (
              bSupplierCode ===
                query ||
              bCode ===
                query
            ) {
              return 1;
            }

            return a.description.localeCompare(
              b.description,
              "it"
            );
          }
        )
        .slice(
          0,
          12
        );
    }, [
      search,
      items,
      supplierMap,
    ]);

  function openItem(
    item: SearchResult
  ) {
    setSearch("");
    setSearchOpen(
      false
    );

    router.push(
      `/items/${item.id}`
    );
  }

  /*
    LOGOUT
  */
  function logout() {
    localStorage.removeItem(
      "magazzino_user"
    );

    localStorage.removeItem(
      "magazzino_role"
    );

    localStorage.removeItem(
      "magazzino_user_id"
    );

    localStorage.removeItem(
      "magazzino_session_version"
    );

    localStorage.removeItem(
      "magazzino_last_activity"
    );

    router.replace(
      "/login"
    );
  }

  /*
    LOGIN E CATALOGO:
    NESSUNA BARRA
  */
  if (hideTopBar) {
    return null;
  }

  return (
    <>
      <header className="topbar-v2">
        <div className="topbar-v2-inner">
          {/* LOGO */}

          <Link
            href="/"
            className="topbar-v2-logo"
          >
            <div className="topbar-v2-logo-icon">
              <WarehouseLogoIcon />
            </div>

            <span>
              MAGAZZINO
            </span>
          </Link>

          {/* HOME */}

          <Link
            href="/"
            className={`topbar-v2-pill ${
              pathname ===
              "/"
                ? "active"
                : ""
            }`}
          >
            <HomeIcon />

            <span>
              Home
            </span>
          </Link>

          {/* FORNITORI */}

          <div
            className="topbar-v2-menu"
            ref={
              supplierMenuRef
            }
          >
            <button
              type="button"
              className={`topbar-v2-pill ${
                pathname.startsWith(
                  "/suppliers"
                )
                  ? "active"
                  : ""
              }`}
              onClick={() => {
                setSupplierMenuOpen(
                  !supplierMenuOpen
                );

                setWarehouseMenuOpen(
                  false
                );

                setSearchOpen(
                  false
                );
              }}
            >
              <UsersIcon />

              <span>
                Fornitori
              </span>

              <ChevronIcon />
            </button>

            {supplierMenuOpen && (
              <div className="topbar-v2-dropdown">
                <div className="topbar-v2-dropdown-title">
                  FORNITORI
                </div>

                <Link
                  href="/suppliers/new"
                  className="topbar-v2-dropdown-item"
                  onClick={() =>
                    setSupplierMenuOpen(
                      false
                    )
                  }
                >
                  <span className="topbar-v2-dropdown-icon">
                    +
                  </span>

                  Nuovo fornitore
                </Link>

                <Link
                  href="/suppliers"
                  className="topbar-v2-dropdown-item"
                  onClick={() =>
                    setSupplierMenuOpen(
                      false
                    )
                  }
                >
                  <span className="topbar-v2-dropdown-icon">
                    ≡
                  </span>

                  Elenco fornitori
                </Link>
              </div>
            )}
          </div>

          {/* MAGAZZINO */}

          <div
            className="topbar-v2-menu"
            ref={
              warehouseMenuRef
            }
          >
            <button
              type="button"
              className="topbar-v2-pill"
              onClick={() => {
                setWarehouseMenuOpen(
                  !warehouseMenuOpen
                );

                setSupplierMenuOpen(
                  false
                );

                setSearchOpen(
                  false
                );
              }}
            >
              <BoxIcon />

              <span>
                Magazzino
              </span>

              <ChevronIcon />
            </button>

            {warehouseMenuOpen && (
              <div className="topbar-v2-dropdown topbar-v2-warehouse-dropdown">
                <div className="topbar-v2-dropdown-title">
                  MAGAZZINO PER FORNITORE
                </div>

                {suppliers.length ===
                0 ? (
                  <div className="topbar-v2-dropdown-empty">
                    Nessun fornitore
                  </div>
                ) : (
                  suppliers.map(
                    (
                      supplier
                    ) => (
                      <Link
                        key={
                          supplier.id
                        }
                        href={`/suppliers/${supplier.id}`}
                        className="topbar-v2-dropdown-item"
                        onClick={() =>
                          setWarehouseMenuOpen(
                            false
                          )
                        }
                      >
                        <span className="topbar-v2-supplier-dot" />

                        {
                          supplier.name
                        }
                      </Link>
                    )
                  )
                )}
              </div>
            )}
          </div>

          {/* MOVIMENTI */}

          <Link
            href="/movements"
            className={`topbar-v2-pill ${
              pathname.startsWith(
                "/movements"
              )
                ? "active"
                : ""
            }`}
          >
            <MovementIcon />

            <span>
              Movimenti
            </span>
          </Link>

          {/* CODICI */}

          <Link
            href="/codici-da-inserire"
            className={`topbar-v2-pill ${
              pathname.startsWith(
                "/codici-da-inserire"
              )
                ? "active"
                : ""
            }`}
          >
            <BarcodeIcon />

            <span>
              Codici da inserire
            </span>
          </Link>

          {/* ORDINI */}

          <Link
            href="/orders"
            className={`topbar-v2-pill ${
              pathname.startsWith(
                "/orders"
              )
                ? "active"
                : ""
            }`}
          >
            <DocumentIcon />

            <span>
              Ordini
            </span>
          </Link>

          {/* RICERCA */}

          <div
            className="topbar-v2-search-wrap"
            ref={
              searchRef
            }
          >
            <div
              className={`topbar-v2-search ${
                searchOpen
                  ? "focus"
                  : ""
              }`}
            >
              <SearchIcon />

              <input
                ref={
                  searchInputRef
                }
                type="search"
                name="magazzino-global-search"
                value={
                  search
                }
                readOnly={
                  !searchOpen
                }
                onMouseDown={() =>
                  setSearchOpen(
                    true
                  )
                }
                onFocus={() =>
                  setSearchOpen(
                    true
                  )
                }
                onChange={(
                  event
                ) => {
                  setSearch(
                    event.target.value
                  );

                  setSearchOpen(
                    true
                  );

                  setSupplierMenuOpen(
                    false
                  );

                  setWarehouseMenuOpen(
                    false
                  );
                }}
                placeholder="Cerca articolo, descrizione o fornitore..."
                autoComplete="one-time-code"
                aria-autocomplete="none"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
              />

              {search ? (
                <button
                  type="button"
                  className="topbar-v2-search-clear"
                  aria-label="Cancella ricerca"
                  onClick={() => {
                    setSearch(
                      ""
                    );

                    searchInputRef.current?.focus();
                  }}
                >
                  ×
                </button>
              ) : (
                <div className="topbar-v2-shortcut">
                  Ctrl K
                </div>
              )}
            </div>

            {searchOpen && (
              <div className="topbar-v2-search-panel">
                {!search.trim() ? (
                  <div className="topbar-v2-search-start">
                    <div className="topbar-v2-search-start-icon">
                      <SearchIcon />
                    </div>

                    <div>
                      <strong>
                        Ricerca globale
                      </strong>

                      <span>
                        Cerca per codice articolo,
                        codice scanner,
                        descrizione o fornitore.
                      </span>
                    </div>
                  </div>
                ) : searchLoading ? (
                  <div className="topbar-v2-search-empty">
                    Caricamento articoli...
                  </div>
                ) : searchResults.length ===
                  0 ? (
                  <div className="topbar-v2-search-empty">
                    <strong>
                      Nessun articolo trovato
                    </strong>

                    <span>
                      Prova con un altro codice,
                      descrizione o fornitore.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="topbar-v2-search-panel-header">
                      <span>
                        RISULTATI
                      </span>

                      <strong>
                        {
                          searchResults.length
                        }
                      </strong>
                    </div>

                    <div className="topbar-v2-search-results">
                      {searchResults.map(
                        (
                          item
                        ) => (
                          <button
                            type="button"
                            key={
                              item.id
                            }
                            className="topbar-v2-search-result"
                            onClick={() =>
                              openItem(
                                item
                              )
                            }
                          >
                            <div className="topbar-v2-result-icon">
                              <BoxIcon />
                            </div>

                            <div className="topbar-v2-result-main">
                              <div className="topbar-v2-result-top">
                                <strong>
                                  {item.supplier_code ||
                                    item.code ||
                                    "-"}
                                </strong>

                                <span>
                                  {
                                    item.supplier_name
                                  }
                                </span>
                              </div>

                              <div className="topbar-v2-result-description">
                                {item.description ||
                                  "Senza descrizione"}
                              </div>

                              <div className="topbar-v2-result-bottom">
                                {item.code && (
                                  <span>
                                    Scanner:{" "}
                                    {
                                      item.code
                                    }
                                  </span>
                                )}

                                <span>
                                  Giacenza:{" "}
                                  <strong>
                                    {
                                      item.stock
                                    }
                                  </strong>
                                </span>
                              </div>
                            </div>

                            <div className="topbar-v2-result-arrow">
                              →
                            </div>
                          </button>
                        )
                      )}
                    </div>

                    <div className="topbar-v2-search-footer">
                      Mostrati massimo 12 risultati
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* USER */}

          <div className="topbar-v2-user-area">
            <div className="topbar-v2-avatar">
              {getInitial(
                username
              )}
            </div>

            <div className="topbar-v2-user-name">
              {username ||
                "Utente"}
            </div>

            <Link
              href="/settings"
              title="Impostazioni"
              aria-label="Impostazioni"
              className={`topbar-v2-icon-button ${
                pathname ===
                "/settings"
                  ? "active"
                  : ""
              }`}
              onClick={() => {
                setSearch(
                  ""
                );

                setSearchOpen(
                  false
                );

                setSupplierMenuOpen(
                  false
                );

                setWarehouseMenuOpen(
                  false
                );

                if (
                  searchInputRef.current
                ) {
                  searchInputRef.current.value =
                    "";

                  searchInputRef.current.blur();
                }
              }}
            >
              <SettingsIcon />
            </Link>

            <button
              type="button"
              onClick={
                logout
              }
              className="topbar-v2-logout"
            >
              Esci
            </button>
          </div>
        </div>
      </header>

      <style jsx global>{`
        .topbar-v2 {
          position: sticky;
          top: 0;
          z-index: 5000;
          width: 100%;
          border-bottom: 1px solid rgba(77, 113, 164, 0.36);
          background: rgba(7, 15, 27, 0.96);
          backdrop-filter: blur(16px);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
        }

        .topbar-v2-inner {
          width: 100%;
          max-width: 1700px;
          min-height: 68px;
          margin: 0 auto;
          padding: 9px 18px;
          display: flex;
          align-items: center;
          gap: 8px;
          box-sizing: border-box;
        }

        .topbar-v2-logo {
          flex-shrink: 0;
          margin-right: 8px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #ffffff;
          text-decoration: none;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 1.3px;
        }

        .topbar-v2-logo-icon {
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 11px;
          color: white;
          background:
            linear-gradient(
              135deg,
              #2563eb,
              #3b82f6
            );
          box-shadow:
            0 7px 20px
            rgba(37, 99, 235, 0.27);
        }

        .topbar-v2-menu {
          position: relative;
          flex-shrink: 0;
        }

        .topbar-v2-pill {
          height: 40px;
          padding: 0 13px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          flex-shrink: 0;
          border: 1px solid rgba(111, 145, 194, 0.22);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.025);
          color: rgba(255, 255, 255, 0.80);
          text-decoration: none;
          cursor: pointer;
          font: inherit;
          font-size: 10px;
          font-weight: 800;
          white-space: nowrap;
          transition:
            border-color 0.15s ease,
            color 0.15s ease,
            background 0.15s ease,
            transform 0.15s ease;
        }

        .topbar-v2-pill:hover {
          color: white;
          border-color: rgba(96, 165, 250, 0.42);
          background: rgba(59, 130, 246, 0.09);
        }

        .topbar-v2-pill.active {
          color: white;
          border-color: rgba(96, 165, 250, 0.65);
          background:
            linear-gradient(
              135deg,
              rgba(37, 99, 235, 0.95),
              rgba(59, 130, 246, 0.84)
            );
          box-shadow:
            0 6px 18px
            rgba(37, 99, 235, 0.24);
        }

        .topbar-v2-pill svg {
          flex-shrink: 0;
        }

        .topbar-v2-dropdown {
          position: absolute;
          top: calc(100% + 10px);
          left: 0;
          z-index: 5100;
          width: 220px;
          padding: 8px;
          overflow: hidden;
          border: 1px solid rgba(96, 165, 250, 0.24);
          border-radius: 12px;
          background: #0b1524;
          box-shadow:
            0 25px 60px
            rgba(0, 0, 0, 0.45);
        }

        .topbar-v2-warehouse-dropdown {
          width: 250px;
          max-height: 430px;
          overflow-y: auto;
        }

        .topbar-v2-dropdown-title {
          padding: 8px 9px 7px;
          color: rgba(147, 197, 253, 0.55);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.2px;
        }

        .topbar-v2-dropdown-item {
          min-height: 36px;
          padding: 7px 9px;
          display: flex;
          align-items: center;
          gap: 9px;
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.82);
          text-decoration: none;
          font-size: 10px;
          font-weight: 750;
        }

        .topbar-v2-dropdown-item:hover {
          color: white;
          background: rgba(59, 130, 246, 0.10);
        }

        .topbar-v2-dropdown-icon {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border-radius: 7px;
          color: #60a5fa;
          background: rgba(59, 130, 246, 0.10);
          font-size: 14px;
          font-weight: 900;
        }

        .topbar-v2-supplier-dot {
          width: 7px;
          height: 7px;
          flex-shrink: 0;
          border-radius: 50%;
          background: #3b82f6;
          box-shadow:
            0 0 0 3px
            rgba(59, 130, 246, 0.10);
        }

        .topbar-v2-dropdown-empty {
          padding: 18px 10px;
          color: rgba(255, 255, 255, 0.42);
          text-align: center;
          font-size: 10px;
        }

        .topbar-v2-search-wrap {
          position: relative;
          flex: 1 1 300px;
          min-width: 180px;
          max-width: 390px;
          margin-left: auto;
        }

        .topbar-v2-search {
          height: 40px;
          padding: 0 10px 0 12px;
          display: flex;
          align-items: center;
          gap: 9px;
          border: 1px solid rgba(96, 165, 250, 0.26);
          border-radius: 999px;
          background: rgba(59, 130, 246, 0.055);
          transition:
            border-color 0.15s ease,
            background 0.15s ease,
            box-shadow 0.15s ease;
        }

        .topbar-v2-search.focus {
          border-color: rgba(96, 165, 250, 0.72);
          background: rgba(59, 130, 246, 0.09);
          box-shadow:
            0 0 0 3px
            rgba(59, 130, 246, 0.08);
        }

        .topbar-v2-search input {
          min-width: 0;
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          color: white;
          font: inherit;
          font-size: 10px;
        }

        .topbar-v2-search input::placeholder {
          color: rgba(255, 255, 255, 0.42);
        }

        .topbar-v2-search input::-webkit-search-cancel-button {
          display: none;
        }

        /*
          Evita il giallo del browser/password manager
          nel campo di ricerca globale.
        */
        .topbar-v2-search input:-webkit-autofill,
        .topbar-v2-search input:-webkit-autofill:hover,
        .topbar-v2-search input:-webkit-autofill:focus,
        .topbar-v2-search input:autofill {
          -webkit-text-fill-color: #ffffff !important;
          caret-color: #ffffff;
          box-shadow:
            0 0 0 1000px
            #0b1524 inset !important;
          -webkit-box-shadow:
            0 0 0 1000px
            #0b1524 inset !important;
          background-color: #0b1524 !important;
          color: #ffffff !important;
        }

        .topbar-v2-shortcut {
          flex-shrink: 0;
          padding: 3px 6px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.42);
          font-size: 7px;
          font-weight: 800;
        }

        .topbar-v2-search-clear {
          width: 24px;
          height: 24px;
          flex-shrink: 0;
          border: none;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.65);
          cursor: pointer;
          font-size: 16px;
        }

        .topbar-v2-search-panel {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          z-index: 5200;
          width: min(570px, 80vw);
          overflow: hidden;
          border: 1px solid rgba(96, 165, 250, 0.28);
          border-radius: 14px;
          background: #091322;
          box-shadow:
            0 28px 80px
            rgba(0, 0, 0, 0.58);
        }

        .topbar-v2-search-start {
          padding: 22px;
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .topbar-v2-search-start-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border-radius: 11px;
          color: #60a5fa;
          background: rgba(59, 130, 246, 0.10);
          border: 1px solid rgba(59, 130, 246, 0.18);
        }

        .topbar-v2-search-start strong,
        .topbar-v2-search-start span {
          display: block;
        }

        .topbar-v2-search-start strong {
          color: white;
          font-size: 11px;
        }

        .topbar-v2-search-start span {
          margin-top: 4px;
          color: rgba(255, 255, 255, 0.45);
          font-size: 9px;
          line-height: 1.45;
        }

        .topbar-v2-search-panel-header {
          padding: 10px 13px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(96, 165, 250, 0.13);
          color: rgba(147, 197, 253, 0.58);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1px;
        }

        .topbar-v2-search-panel-header strong {
          min-width: 24px;
          height: 24px;
          padding: 0 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 7px;
          background: rgba(59, 130, 246, 0.10);
          color: #60a5fa;
          font-size: 9px;
          letter-spacing: 0;
        }

        .topbar-v2-search-results {
          max-height: 460px;
          overflow-y: auto;
        }

        .topbar-v2-search-result {
          width: 100%;
          padding: 11px 13px;
          display: flex;
          align-items: center;
          gap: 11px;
          border: none;
          border-bottom: 1px solid rgba(96, 165, 250, 0.10);
          background: transparent;
          color: white;
          cursor: pointer;
          text-align: left;
        }

        .topbar-v2-search-result:hover {
          background: rgba(59, 130, 246, 0.09);
        }

        .topbar-v2-result-icon {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border-radius: 10px;
          background: rgba(59, 130, 246, 0.09);
          color: #60a5fa;
        }

        .topbar-v2-result-main {
          min-width: 0;
          flex: 1;
        }

        .topbar-v2-result-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .topbar-v2-result-top strong {
          color: white;
          font-size: 11px;
          font-weight: 900;
        }

        .topbar-v2-result-top span {
          flex-shrink: 0;
          padding: 3px 6px;
          border-radius: 999px;
          background: rgba(139, 92, 246, 0.10);
          color: #c4b5fd;
          font-size: 7px;
          font-weight: 850;
        }

        .topbar-v2-result-description {
          margin-top: 4px;
          overflow: hidden;
          color: rgba(255, 255, 255, 0.69);
          font-size: 9px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .topbar-v2-result-bottom {
          margin-top: 5px;
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          color: rgba(255, 255, 255, 0.35);
          font-size: 8px;
        }

        .topbar-v2-result-bottom strong {
          color: #60a5fa;
        }

        .topbar-v2-result-arrow {
          flex-shrink: 0;
          color: rgba(96, 165, 250, 0.55);
          font-size: 15px;
        }

        .topbar-v2-search-empty {
          padding: 35px 20px;
          color: rgba(255, 255, 255, 0.45);
          text-align: center;
          font-size: 10px;
        }

        .topbar-v2-search-empty strong,
        .topbar-v2-search-empty span {
          display: block;
        }

        .topbar-v2-search-empty strong {
          color: rgba(255, 255, 255, 0.78);
          font-size: 11px;
        }

        .topbar-v2-search-empty span {
          margin-top: 5px;
        }

        .topbar-v2-search-footer {
          padding: 8px 12px;
          border-top: 1px solid rgba(96, 165, 250, 0.11);
          color: rgba(255, 255, 255, 0.28);
          text-align: right;
          font-size: 7px;
        }

        .topbar-v2-user-area {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 7px;
          padding-left: 9px;
          border-left: 1px solid rgba(96, 165, 250, 0.18);
        }

        .topbar-v2-avatar {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          color: white;
          background:
            linear-gradient(
              135deg,
              #2563eb,
              #60a5fa
            );
          font-size: 11px;
          font-weight: 950;
          box-shadow:
            0 5px 15px
            rgba(37, 99, 235, 0.20);
        }

        .topbar-v2-user-name {
          max-width: 95px;
          overflow: hidden;
          color: rgba(255, 255, 255, 0.84);
          font-size: 10px;
          font-weight: 850;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .topbar-v2-icon-button {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(111, 145, 194, 0.22);
          border-radius: 9px;
          background: transparent;
          color: rgba(255, 255, 255, 0.65);
          text-decoration: none;
        }

        .topbar-v2-icon-button:hover,
        .topbar-v2-icon-button.active {
          color: white;
          border-color: rgba(96, 165, 250, 0.45);
          background: rgba(59, 130, 246, 0.09);
        }

        .topbar-v2-logout {
          height: 34px;
          padding: 0 9px;
          border: 1px solid rgba(239, 68, 68, 0.18);
          border-radius: 9px;
          background: rgba(239, 68, 68, 0.045);
          color: rgba(248, 113, 113, 0.78);
          cursor: pointer;
          font-size: 9px;
          font-weight: 850;
        }

        .topbar-v2-logout:hover {
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.34);
          background: rgba(239, 68, 68, 0.08);
        }

        @media (max-width: 1400px) {
          .topbar-v2-inner {
            gap: 6px;
            padding-left: 12px;
            padding-right: 12px;
          }

          .topbar-v2-pill {
            padding: 0 10px;
          }

          .topbar-v2-search-wrap {
            max-width: 300px;
          }

          .topbar-v2-user-name {
            display: none;
          }
        }

        @media (max-width: 1180px) {
          .topbar-v2-logo span {
            display: none;
          }

          .topbar-v2-pill span {
            display: none;
          }

          .topbar-v2-pill {
            width: 40px;
            padding: 0;
          }

          .topbar-v2-search-wrap {
            max-width: none;
          }
        }

        @media (max-width: 760px) {
          .topbar-v2-inner {
            flex-wrap: wrap;
          }

          .topbar-v2-search-wrap {
            order: 20;
            flex-basis: 100%;
            max-width: none;
          }

          .topbar-v2-user-area {
            margin-left: auto;
          }

          .topbar-v2-search-panel {
            width: calc(100vw - 24px);
            right: -6px;
          }
        }
      `}</style>
    </>
  );
}

/* =========================================================
   ICONE
========================================================= */

function WarehouseLogoIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 8.5L12 4L20 8.5V18.5L12 22L4 18.5V8.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      <path
        d="M4.5 8.5L12 12.5L19.5 8.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M12 12.5V21.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 10.5L12 4L20 10.5V20H14V14H10V20H4V10.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="9"
        cy="8"
        r="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <circle
        cx="17"
        cy="9"
        r="2.3"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M3.5 19C3.5 15.8 5.7 14 9 14C12.3 14 14.5 15.8 14.5 19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <path
        d="M15 14.5C18.5 14.5 20.5 16 20.5 18.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 7L12 3L20 7V17L12 21L4 17V7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      <path
        d="M4.5 7L12 11L19.5 7"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M12 11V21"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function MovementIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 7H19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <path
        d="M15 3L19 7L15 11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M19 17H5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <path
        d="M9 13L5 17L9 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BarcodeIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 5V19"
        stroke="currentColor"
        strokeWidth="2"
      />

      <path
        d="M8 5V19"
        stroke="currentColor"
        strokeWidth="1.5"
      />

      <path
        d="M11 5V19"
        stroke="currentColor"
        strokeWidth="2.5"
      />

      <path
        d="M15 5V19"
        stroke="currentColor"
        strokeWidth="1.5"
      />

      <path
        d="M18 5V19"
        stroke="currentColor"
        strokeWidth="2.5"
      />

      <path
        d="M21 5V19"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 3H14L19 8V21H6V3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      <path
        d="M14 3V8H19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="10.5"
        cy="10.5"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M15.5 15.5L20 20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M19 12C19 11.5 18.9 11 18.8 10.5L21 8.8L19 5.2L16.4 6.2C15.7 5.6 15 5.2 14.2 4.9L13.8 2H10.2L9.8 4.9C9 5.2 8.3 5.6 7.6 6.2L5 5.2L3 8.8L5.2 10.5C5.1 11 5 11.5 5 12C5 12.5 5.1 13 5.2 13.5L3 15.2L5 18.8L7.6 17.8C8.3 18.4 9 18.8 9.8 19.1L10.2 22H13.8L14.2 19.1C15 18.8 15.7 18.4 16.4 17.8L19 18.8L21 15.2L18.8 13.5C18.9 13 19 12.5 19 12Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 10L12 15L17 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* =========================================================
   UTILITÀ
========================================================= */

function normalizeText(
  value: string
) {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase();
}

function getInitial(
  username: string
) {
  const clean =
    username.trim();

  if (!clean) {
    return "U";
  }

  return clean
    .charAt(0)
    .toUpperCase();
}