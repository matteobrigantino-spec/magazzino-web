"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../lib/supabaseClient";

type Supplier = {
  id: string;
  name: string;
};

type Item = {
  id: string;
  supplier_id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  image_url: string | null;
};

type CatalogData = {
  suppliers: Supplier[];
  items: Item[];
  updatedAt: string;
};

type PwaTheme =
  | "light"
  | "dark";

const STORAGE_KEY =
  "magazzino_catalogo_offline";

const THEME_KEY =
  "magazzino_pwa_theme";

const IMAGE_CACHE =
  "catalogo-magazzino-v2-images";

export default function CatalogoPage() {
  const [suppliers, setSuppliers] =
    useState<Supplier[]>([]);

  const [items, setItems] =
    useState<Item[]>([]);

  const [
    selectedSupplier,
    setSelectedSupplier,
  ] = useState<Supplier | null>(null);

  const [search, setSearch] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [updating, setUpdating] =
    useState(false);

  const [lastUpdate, setLastUpdate] =
    useState("");

  const [
    selectedItem,
    setSelectedItem,
  ] = useState<Item | null>(null);

  const [message, setMessage] =
    useState("");

  const [
    photoProgress,
    setPhotoProgress,
  ] = useState("");

  const [
    theme,
    setTheme,
  ] = useState<PwaTheme>(
    "dark"
  );

  useEffect(() => {
    try {
      const savedTheme =
        localStorage.getItem(
          THEME_KEY
        );

      if (
        savedTheme === "light" ||
        savedTheme === "dark"
      ) {
        setTheme(
          savedTheme
        );
      }
    } catch (error) {
      console.warn(
        "Tema PWA non disponibile:",
        error
      );
    }

    loadLocalCatalog();
  }, []);

  function changeTheme(
    nextTheme: PwaTheme
  ) {
    setTheme(
      nextTheme
    );

    try {
      localStorage.setItem(
        THEME_KEY,
        nextTheme
      );
    } catch (error) {
      console.warn(
        "Impossibile salvare il tema PWA:",
        error
      );
    }
  }

  function loadLocalCatalog() {
    setLoading(true);

    try {
      const saved =
        localStorage.getItem(
          STORAGE_KEY
        );

      if (saved) {
        const parsed: CatalogData =
          JSON.parse(saved);

        setSuppliers(
          parsed.suppliers || []
        );

        setItems(
          parsed.items || []
        );

        setLastUpdate(
          parsed.updatedAt || ""
        );
      }
    } catch (error) {
      console.error(
        "Errore lettura catalogo locale:",
        error
      );
    }

    setLoading(false);
  }

  async function updateCatalog() {
    setUpdating(true);
    setMessage("");
    setPhotoProgress("");

    try {
      const {
        data: suppliersData,
        error: suppliersError,
      } = await supabase
        .from("suppliers")
        .select("id,name")
        .order("name");

      if (suppliersError) {
        throw new Error(
          suppliersError.message
        );
      }

      const {
        data: itemsData,
        error: itemsError,
      } = await supabase
        .from("items")
        .select(
          "id,supplier_id,code,supplier_code,description,image_url"
        )
        .order("description");

      if (itemsError) {
        throw new Error(
          itemsError.message
        );
      }

      const cleanSuppliers:
        Supplier[] =
        (suppliersData || []).map(
          (supplier) => ({
            id: String(
              supplier.id
            ),

            name: String(
              supplier.name || ""
            ),
          })
        );

      const cleanItems:
        Item[] =
        (itemsData || []).map(
          (item) => ({
            id: String(
              item.id
            ),

            supplier_id:
              String(
                item.supplier_id
              ),

            code:
              String(
                item.code || ""
              ),

            supplier_code:
              item.supplier_code
                ? String(
                    item.supplier_code
                  )
                : null,

            description:
              String(
                item.description ||
                  ""
              ),

            image_url:
              item.image_url
                ? String(
                    item.image_url
                  )
                : null,
          })
        );

      const updatedAt =
        new Date().toISOString();

      const catalog:
        CatalogData = {
        suppliers:
          cleanSuppliers,

        items:
          cleanItems,

        updatedAt,
      };

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
          catalog
        )
      );

      setSuppliers(
        cleanSuppliers
      );

      setItems(
        cleanItems
      );

      setLastUpdate(
        updatedAt
      );

      const photoResult =
        await downloadAllPhotos(
          cleanItems
        );

      setMessage(
        `Catalogo aggiornato: ${cleanSuppliers.length} fornitori, ` +
          `${cleanItems.length} articoli. ` +
          `Foto salvate: ${photoResult.saved}. ` +
          `Foto non disponibili: ${photoResult.failed}.`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "Aggiornamento non riuscito. " +
          "Controlla che il PC sia collegato a Internet."
      );
    }

    setPhotoProgress("");
    setUpdating(false);
  }

  async function downloadAllPhotos(
    allItems: Item[]
  ) {
    if (!("caches" in window)) {
      return {
        saved: 0,
        failed: 0,
      };
    }

    const imageUrls =
      Array.from(
        new Set(
          allItems
            .map(
              (item) =>
                item.image_url?.trim()
            )
            .filter(
              (
                url
              ): url is string =>
                typeof url ===
                  "string" &&
                url.length >
                  0
            )
        )
      );

    if (
      imageUrls.length ===
      0
    ) {
      return {
        saved: 0,
        failed: 0,
      };
    }

    const cache =
      await caches.open(
        IMAGE_CACHE
      );

    let saved = 0;
    let failed = 0;

    for (
      let index = 0;
      index <
      imageUrls.length;
      index++
    ) {
      const url =
        imageUrls[index];

      setPhotoProgress(
        `Scaricamento fotografie: ${
          index + 1
        } / ${imageUrls.length}`
      );

      try {
        const existing =
          await cache.match(
            url,
            {
              ignoreVary:
                true,
            }
          );

        if (existing) {
          saved++;
          continue;
        }

        const request =
          new Request(
            url,
            {
              method: "GET",
              mode: "no-cors",
              credentials:
                "omit",
              cache: "reload",
            }
          );

        const response =
          await fetch(
            request
          );

        if (
          response.ok ||
          response.type ===
            "opaque"
        ) {
          await cache.put(
            request,
            response.clone()
          );

          saved++;
        } else {
          failed++;
        }
      } catch (error) {
        console.warn(
          "Impossibile salvare la foto:",
          url,
          error
        );

        failed++;
      }
    }

    return {
      saved,
      failed,
    };
  }

  const supplierMap =
    useMemo(() => {
      const map =
        new Map<
          string,
          Supplier
        >();

      suppliers.forEach(
        (supplier) => {
          map.set(
            supplier.id,
            supplier
          );
        }
      );

      return map;
    }, [suppliers]);

  const globalSearchResults =
    useMemo(() => {
      const text =
        search
          .trim()
          .toLowerCase();

      if (!text) {
        return [];
      }

      const collator =
        new Intl.Collator(
          "it",
          {
            numeric: true,
            sensitivity:
              "base",
          }
        );

      return items
        .filter(
          (item) =>
            item.supplier_code
              ?.toLowerCase()
              .includes(
                text
              ) ||
            item.code
              .toLowerCase()
              .includes(
                text
              ) ||
            item.description
              .toLowerCase()
              .includes(
                text
              )
        )
        .sort(
          (a, b) => {
            const supplierA =
              supplierMap.get(
                a.supplier_id
              )?.name || "";

            const supplierB =
              supplierMap.get(
                b.supplier_id
              )?.name || "";

            const supplierCompare =
              collator.compare(
                supplierA,
                supplierB
              );

            if (
              supplierCompare !==
              0
            ) {
              return supplierCompare;
            }

            return collator.compare(
              a.supplier_code ||
                a.code,
              b.supplier_code ||
                b.code
            );
          }
        );
    }, [
      items,
      search,
      supplierMap,
    ]);

  const groupedGlobalResults =
    useMemo(() => {
      const groups =
        new Map<
          string,
          {
            supplier:
              Supplier;
            items:
              Item[];
          }
        >();

      globalSearchResults.forEach(
        (item) => {
          const supplier =
            supplierMap.get(
              item.supplier_id
            );

          if (!supplier) {
            return;
          }

          const existing =
            groups.get(
              supplier.id
            );

          if (existing) {
            existing.items.push(
              item
            );
          } else {
            groups.set(
              supplier.id,
              {
                supplier,
                items: [item],
              }
            );
          }
        }
      );

      return Array.from(
        groups.values()
      );
    }, [
      globalSearchResults,
      supplierMap,
    ]);

  const supplierItems =
    useMemo(() => {
      if (
        !selectedSupplier
      ) {
        return [];
      }

      const collator =
        new Intl.Collator(
          "it",
          {
            numeric: true,
            sensitivity:
              "base",
          }
        );

      return items
        .filter(
          (item) =>
            item.supplier_id ===
            selectedSupplier.id
        )
        .sort(
          (a, b) =>
            collator.compare(
              a.supplier_code ||
                "",
              b.supplier_code ||
                ""
            )
        );
    }, [
      items,
      selectedSupplier,
    ]);

  const supplierCounts =
    useMemo(() => {
      const counts:
        Record<
          string,
          number
        > = {};

      items.forEach(
        (item) => {
          counts[
            item.supplier_id
          ] =
            (
              counts[
                item.supplier_id
              ] || 0
            ) + 1;
        }
      );

      return counts;
    }, [items]);

  function openItemPhoto(
    item: Item
  ) {
    setSelectedItem(item);
  }

  function closePhoto() {
    setSelectedItem(null);
  }

  function goBackToSuppliers() {
    setSelectedSupplier(null);
  }

  function clearSearch() {
    setSearch("");
  }

  if (loading) {
    return (
      <div
        className="pwa-catalog-page"
        data-theme={theme}
      >
        <div className="pwa-catalog-loading">
          Caricamento catalogo...
        </div>
      </div>
    );
  }

  const isSearching =
    search.trim().length >
    0;

  return (
    <>
      <div
        className="pwa-catalog-page"
        data-theme={theme}
      >
        {/* BARRA PWA */}

        <div className="pwa-catalog-topbar">
          <div className="pwa-catalog-brand">
            <div className="pwa-catalog-brand-icon">
              <CatalogSmallIcon />
            </div>

            <div>
              <strong>
                MAGAZZINO
              </strong>

              <span>
                PWA OPERATIVA
              </span>
            </div>
          </div>

          <div className="pwa-topbar-actions">
            <a
              className="pwa-notes-link"
              href="/catalogo/note"
            >
              <span aria-hidden="true">📝</span>
              Note
            </a>

            <div
              className="pwa-theme-switch"
              role="group"
              aria-label="Tema PWA"
            >
            <button
              type="button"
              className={
                theme === "light"
                  ? "active"
                  : ""
              }
              onClick={() =>
                changeTheme(
                  "light"
                )
              }
            >
              <span aria-hidden="true">
                ☀
              </span>
              Chiaro
            </button>

            <button
              type="button"
              className={
                theme === "dark"
                  ? "active"
                  : ""
              }
              onClick={() =>
                changeTheme(
                  "dark"
                )
              }
            >
              <span aria-hidden="true">
                ☾
              </span>
              Scuro
            </button>
            </div>
          </div>
        </div>

        {/* HERO */}

        <section className="pwa-catalog-hero">
          <div className="pwa-catalog-hero-glow pwa-glow-one" />
          <div className="pwa-catalog-hero-glow pwa-glow-two" />

          <div className="pwa-catalog-hero-copy">
            <div className="pwa-catalog-eyebrow">
              <CatalogSmallIcon />

              <span>
                CATALOGO OFFLINE
              </span>
            </div>

            <h1>
              Catalogo{" "}
              <span>
                Magazzino
              </span>
            </h1>

            <p>
              Consulta codici,
              descrizioni e fotografie
              anche senza connessione.
            </p>

            <div className="pwa-catalog-meta">
              <div className="pwa-catalog-meta-dot" />

              <span>
                {lastUpdate
                  ? `Ultimo aggiornamento: ${formatDateTime(
                      lastUpdate
                    )}`
                  : "Catalogo non ancora aggiornato"}
              </span>
            </div>
          </div>

          <div className="pwa-catalog-hero-stats">
            <div className="pwa-catalog-stat">
              <strong>
                {suppliers.length}
              </strong>

              <span>
                Fornitori
              </span>
            </div>

            <div className="pwa-catalog-stat-divider" />

            <div className="pwa-catalog-stat">
              <strong>
                {items.length}
              </strong>

              <span>
                Articoli
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={
              updateCatalog
            }
            disabled={
              updating
            }
            className="pwa-update-button"
          >
            <RefreshIcon />

            <div>
              <strong>
                {updating
                  ? "Aggiornamento..."
                  : "Aggiorna magazzino"}
              </strong>

              <span>
                Scarica dati e foto
              </span>
            </div>
          </button>
        </section>

        {/* RICERCA */}

        <section className="pwa-search-panel">
          <div className="pwa-section-heading">
            <div>
              <div className="pwa-section-label">
                RICERCA GLOBALE
              </div>

              <h2>
                Cerca in tutto il magazzino
              </h2>
            </div>

            <div className="pwa-offline-count">
              <span className="pwa-offline-count-dot" />

              {items.length} articoli offline
            </div>
          </div>

          <div
            className={`pwa-search-box ${
              isSearching
                ? "has-value"
                : ""
            }`}
          >
            <SearchIcon />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Cerca codice articolo, codice scanner o descrizione..."
              autoComplete="off"
            />

            {search && (
              <button
                type="button"
                onClick={
                  clearSearch
                }
                className="pwa-search-clear"
              >
                ×
              </button>
            )}
          </div>

          <div className="pwa-search-info">
            {isSearching ? (
              <>
                <SearchSmallIcon />

                <span>
                  <strong>
                    {
                      globalSearchResults.length
                    }
                  </strong>{" "}
                  articoli trovati in{" "}
                  <strong>
                    {
                      groupedGlobalResults.length
                    }
                  </strong>{" "}
                  fornitori
                </span>
              </>
            ) : (
              <>
                <OfflineIcon />

                <span>
                  Ricerca disponibile anche senza Internet
                </span>
              </>
            )}
          </div>
        </section>

        {photoProgress && (
          <div className="pwa-progress-message">
            <div className="pwa-progress-icon">
              <RefreshIcon />
            </div>

            <div>
              <strong>
                Aggiornamento fotografie
              </strong>

              <span>
                {photoProgress}
              </span>
            </div>
          </div>
        )}

        {message && (
          <div className="pwa-catalog-message">
            <div className="pwa-message-icon">
              ✓
            </div>

            <span>
              {message}
            </span>
          </div>
        )}

        {isSearching ? (
          <section>
            <div className="pwa-content-heading">
              <div>
                <div className="pwa-section-label">
                  RISULTATI
                </div>

                <h2>
                  Risultati ricerca
                </h2>

                <p>
                  Ricerca effettuata su tutti i fornitori.
                </p>
              </div>

              <button
                type="button"
                className="pwa-secondary-button"
                onClick={
                  clearSearch
                }
              >
                × Cancella ricerca
              </button>
            </div>

            {globalSearchResults.length ===
            0 ? (
              <EmptyState
                title="Nessun articolo trovato"
                text="Prova con un altro codice o una parte della descrizione."
              />
            ) : (
              <div className="pwa-result-groups">
                {groupedGlobalResults.map(
                  (group) => (
                    <div
                      key={
                        group.supplier.id
                      }
                      className="pwa-result-group"
                    >
                      <div className="pwa-result-group-header">
                        <div className="pwa-result-supplier">
                          <div className="pwa-result-supplier-icon">
                            <SupplierIcon />
                          </div>

                          <div>
                            <strong>
                              {
                                group.supplier.name
                              }
                            </strong>

                            <span>
                              {
                                group.items.length
                              }{" "}
                              {group.items.length ===
                              1
                                ? "risultato"
                                : "risultati"}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="pwa-open-supplier-button"
                          onClick={() => {
                            setSearch("");

                            setSelectedSupplier(
                              group.supplier
                            );
                          }}
                        >
                          Apri fornitore
                          <ArrowIcon />
                        </button>
                      </div>

                      <CatalogTable
                        items={
                          group.items
                        }
                        onItemClick={
                          openItemPhoto
                        }
                      />
                    </div>
                  )
                )}
              </div>
            )}
          </section>
        ) : !selectedSupplier ? (
          <section>
            <div className="pwa-content-heading">
              <div>
                <div className="pwa-section-label">
                  MAGAZZINO
                </div>

                <h2>
                  Fornitori
                </h2>

                <p>
                  Seleziona un fornitore per visualizzare gli articoli.
                </p>
              </div>

              <div className="pwa-supplier-total">
                {suppliers.length} fornitori
              </div>
            </div>

            {suppliers.length ===
            0 ? (
              <EmptyState
                title="Catalogo vuoto"
                text="Collega il PC a Internet e premi “Aggiorna magazzino”."
              />
            ) : (
              <div className="pwa-suppliers-grid">
                {suppliers.map(
                  (supplier) => (
                    <button
                      key={
                        supplier.id
                      }
                      type="button"
                      className="pwa-supplier-card"
                      onClick={() =>
                        setSelectedSupplier(
                          supplier
                        )
                      }
                    >
                      <div className="pwa-supplier-card-top">
                        <div className="pwa-supplier-card-icon">
                          <SupplierIcon />
                        </div>

                        <div className="pwa-supplier-card-arrow">
                          <ArrowIcon />
                        </div>
                      </div>

                      <strong>
                        {supplier.name}
                      </strong>

                      <div className="pwa-supplier-card-bottom">
                        <span>
                          {supplierCounts[
                            supplier.id
                          ] || 0}{" "}
                          articoli
                        </span>

                        <small>
                          Apri catalogo
                        </small>
                      </div>
                    </button>
                  )
                )}
              </div>
            )}
          </section>
        ) : (
          <section>
            <button
              type="button"
              onClick={
                goBackToSuppliers
              }
              className="pwa-back-button"
            >
              <BackIcon />

              Torna ai fornitori
            </button>

            <div className="pwa-selected-supplier-header">
              <div className="pwa-selected-supplier-icon">
                <SupplierIcon />
              </div>

              <div>
                <div className="pwa-section-label">
                  FORNITORE
                </div>

                <h2>
                  {selectedSupplier.name}
                </h2>

                <p>
                  {supplierItems.length} articoli disponibili offline
                </p>
              </div>
            </div>

            <div className="pwa-result-group">
              <CatalogTable
                items={
                  supplierItems
                }
                onItemClick={
                  openItemPhoto
                }
              />
            </div>
          </section>
        )}

        {selectedItem && (
          <div
            className="pwa-photo-backdrop"
            onClick={
              closePhoto
            }
          >
            <div
              className="pwa-photo-modal"
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <div className="pwa-photo-header">
                <div>
                  <div className="pwa-photo-label">
                    ARTICOLO
                  </div>

                  <h2>
                    {selectedItem.supplier_code ||
                      "-"}
                  </h2>

                  <p>
                    {
                      selectedItem.description
                    }
                  </p>

                  <div className="pwa-photo-scanner">
                    <BarcodeIcon />

                    Scanner:{" "}
                    {selectedItem.code ||
                      "-"}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={
                    closePhoto
                  }
                  className="pwa-photo-close"
                >
                  ×
                </button>
              </div>

              <div className="pwa-photo-container">
                {selectedItem.image_url ? (
                  <img
                    src={
                      selectedItem.image_url
                    }
                    alt={
                      selectedItem.description
                    }
                    onError={(event) => {
                      const image =
                        event.currentTarget;

                      image.style.display =
                        "none";

                      const parent =
                        image.parentElement;

                      if (parent) {
                        parent.innerHTML =
                          '<div class="pwa-photo-unavailable">Foto non disponibile offline</div>';
                      }
                    }}
                  />
                ) : (
                  <div className="pwa-photo-unavailable">
                    <ImageIcon />

                    <strong>
                      Foto non disponibile
                    </strong>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .pwa-catalog-page {
          width: 100%;
          max-width: 1500px;
          min-height: 100vh;
          margin: 0 auto;
          padding-bottom: 36px;
          color: #e7edf6;
          transition:
            color 0.18s ease,
            background 0.18s ease;
        }

        .pwa-catalog-page[data-theme="dark"] {
          background: #07111f;
          box-shadow:
            0 0 0 100vmax #07111f;
          clip-path:
            inset(0 -100vmax);
        }

        .pwa-catalog-page[data-theme="light"] {
          background: #f4f7fb;
          color: #0f172a;
          box-shadow:
            0 0 0 100vmax #f4f7fb;
          clip-path:
            inset(0 -100vmax);
        }

        .pwa-catalog-topbar {
          min-height: 64px;
          margin-bottom: 18px;
          padding: 10px 14px;

          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;

          box-sizing: border-box;

          border: 1px solid rgba(96,165,250,0.18);
          border-radius: 13px;

          background:
            rgba(10,20,35,0.78);
        }

        .pwa-catalog-brand {
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .pwa-catalog-brand-icon {
          width: 38px;
          height: 38px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 10px;

          color: #60a5fa;

          background:
            rgba(59,130,246,0.11);

          border:
            1px solid rgba(59,130,246,0.22);
        }

        .pwa-catalog-brand strong,
        .pwa-catalog-brand span {
          display: block;
        }

        .pwa-catalog-brand strong {
          color: white;
          font-size: 14px;
          font-weight: 950;
          letter-spacing: 0.8px;
        }

        .pwa-catalog-brand span {
          margin-top: 2px;
          color: rgba(255,255,255,0.38);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1.1px;
        }

        .pwa-topbar-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
        }

        .pwa-notes-link {
          min-height: 42px;
          padding: 0 13px;

          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;

          box-sizing: border-box;

          border: 1px solid rgba(96,165,250,0.24);
          border-radius: 10px;

          background: rgba(59,130,246,0.10);
          color: #dbeafe;

          text-decoration: none;
          font-size: 11px;
          font-weight: 900;
        }

        .pwa-theme-switch {
          padding: 4px;

          display: inline-flex;
          align-items: center;
          gap: 4px;

          border:
            1px solid rgba(96,165,250,0.18);

          border-radius: 10px;

          background:
            rgba(3,9,17,0.48);
        }

        .pwa-theme-switch button {
          min-height: 34px;
          padding: 0 11px;

          display: inline-flex;
          align-items: center;
          gap: 6px;

          border: 1px solid transparent;
          border-radius: 7px;

          background: transparent;
          color: rgba(255,255,255,0.52);

          cursor: pointer;

          font-size: 11px;
          font-weight: 850;
        }

        .pwa-theme-switch button.active {
          border-color:
            rgba(96,165,250,0.32);

          background:
            rgba(59,130,246,0.16);

          color: #dbeafe;
        }

        .pwa-catalog-loading {
          padding: 60px 20px;
          color: rgba(255,255,255,0.55);
          text-align: center;
          font-size: 16px;
        }

        .pwa-catalog-hero {
          position: relative;
          overflow: hidden;

          min-height: 225px;

          margin-bottom: 24px;
          padding: 32px 34px;

          box-sizing: border-box;

          display: grid;

          grid-template-columns:
            minmax(0,1fr)
            auto
            260px;

          align-items: center;
          gap: 35px;

          border: 1px solid rgba(78,112,162,0.42);
          border-radius: 18px;

          background:
            linear-gradient(
              125deg,
              #0c1728 0%,
              #0b1627 55%,
              #08111d 100%
            );
        }

        .pwa-catalog-hero-glow {
          position: absolute;
          border-radius: 999px;
          pointer-events: none;
        }

        .pwa-glow-one {
          width: 600px;
          height: 600px;
          top: -500px;
          right: 300px;

          background: rgba(37,99,235,0.15);
        }

        .pwa-glow-two {
          width: 350px;
          height: 350px;
          right: 70px;
          bottom: -290px;

          background: rgba(59,130,246,0.09);
        }

        .pwa-catalog-hero-copy,
        .pwa-catalog-hero-stats,
        .pwa-update-button {
          position: relative;
          z-index: 2;
        }

        .pwa-catalog-eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;

          color: #60a5fa;

          font-size: 10px;
          font-weight: 950;

          letter-spacing: 1.6px;
        }

        .pwa-catalog-hero h1 {
          margin: 13px 0 0;

          color: white;

          font-size: 46px;
          line-height: 1;

          font-weight: 950;

          letter-spacing: -1.3px;
        }

        .pwa-catalog-hero h1 span {
          color: #3b82f6;
        }

        .pwa-catalog-hero p {
          margin: 13px 0 0;

          color: rgba(255,255,255,0.57);

          font-size: 14px;
          line-height: 1.5;
        }

        .pwa-catalog-meta {
          margin-top: 20px;

          display: flex;
          align-items: center;
          gap: 9px;

          color: rgba(255,255,255,0.50);

          font-size: 11px;
        }

        .pwa-catalog-meta-dot {
          width: 8px;
          height: 8px;

          border-radius: 50%;

          background: #22c55e;

          box-shadow:
            0 0 0 5px rgba(34,197,94,0.09);
        }

        .pwa-catalog-hero-stats {
          min-width: 220px;

          display: flex;
          align-items: center;
          justify-content: center;

          gap: 24px;
        }

        .pwa-catalog-stat {
          min-width: 80px;
          text-align: center;
        }

        .pwa-catalog-stat strong,
        .pwa-catalog-stat span {
          display: block;
        }

        .pwa-catalog-stat strong {
          color: white;

          font-size: 34px;
          font-weight: 950;
        }

        .pwa-catalog-stat span {
          margin-top: 5px;

          color: rgba(255,255,255,0.44);

          font-size: 10px;
          font-weight: 800;

          text-transform: uppercase;

          letter-spacing: 0.7px;
        }

        .pwa-catalog-stat-divider {
          width: 1px;
          height: 65px;

          background: rgba(96,165,250,0.20);
        }

        .pwa-update-button {
          min-height: 92px;

          padding: 17px 19px;

          display: flex;
          align-items: center;
          gap: 14px;

          border: 1px solid rgba(96,165,250,0.46);
          border-radius: 14px;

          background:
            linear-gradient(
              135deg,
              rgba(37,99,235,0.96),
              rgba(59,130,246,0.84)
            );

          color: white;

          cursor: pointer;

          text-align: left;

          box-shadow:
            0 12px 34px rgba(37,99,235,0.18);
        }

        .pwa-update-button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .pwa-update-button strong,
        .pwa-update-button span {
          display: block;
        }

        .pwa-update-button strong {
          font-size: 14px;
          font-weight: 900;
        }

        .pwa-update-button span {
          margin-top: 5px;

          color: rgba(255,255,255,0.65);

          font-size: 10px;
        }

        .pwa-search-panel {
          margin-bottom: 28px;
          padding: 23px;

          border: 1px solid rgba(96,165,250,0.22);
          border-radius: 15px;

          background:
            linear-gradient(
              145deg,
              rgba(16,28,47,0.96),
              rgba(10,20,35,0.97)
            );
        }

        .pwa-section-heading,
        .pwa-content-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 18px;
        }

        .pwa-section-label {
          color: #60a5fa;

          font-size: 10px;
          font-weight: 950;

          letter-spacing: 1.5px;
        }

        .pwa-section-heading h2,
        .pwa-content-heading h2 {
          margin: 6px 0 0;

          color: white;

          font-size: 25px;
          font-weight: 950;
        }

        .pwa-content-heading {
          margin-bottom: 18px;
        }

        .pwa-content-heading p {
          margin: 6px 0 0;

          color: rgba(255,255,255,0.44);

          font-size: 12px;
        }

        .pwa-offline-count,
        .pwa-supplier-total {
          padding: 9px 12px;

          display: flex;
          align-items: center;
          gap: 7px;

          border: 1px solid rgba(34,197,94,0.18);
          border-radius: 999px;

          background: rgba(34,197,94,0.05);

          color: rgba(255,255,255,0.64);

          font-size: 10px;
          font-weight: 850;
        }

        .pwa-supplier-total {
          border-color: rgba(59,130,246,0.22);

          background: rgba(59,130,246,0.08);

          color: #93c5fd;
        }

        .pwa-offline-count-dot {
          width: 7px;
          height: 7px;

          border-radius: 50%;

          background: #22c55e;
        }

        .pwa-search-box {
          height: 68px;

          margin-top: 18px;
          padding: 0 17px;

          display: flex;
          align-items: center;
          gap: 13px;

          border: 1px solid rgba(96,165,250,0.25);
          border-radius: 12px;

          background: rgba(3,9,17,0.60);

          color: #60a5fa;
        }

        .pwa-search-box:focus-within,
        .pwa-search-box.has-value {
          border-color: rgba(96,165,250,0.68);

          box-shadow:
            0 0 0 4px rgba(59,130,246,0.07);
        }

        .pwa-search-box input {
          min-width: 0;
          flex: 1;

          border: none;
          outline: none;

          background: transparent;

          color: white;

          font: inherit;

          font-size: 17px;
          font-weight: 650;
        }

        .pwa-search-box input::placeholder {
          color: rgba(255,255,255,0.36);
        }

        .pwa-search-clear {
          width: 38px;
          height: 38px;

          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 9px;

          background: rgba(255,255,255,0.045);

          color: rgba(255,255,255,0.70);

          cursor: pointer;

          font-size: 20px;
        }

        .pwa-search-info {
          margin-top: 12px;

          display: flex;
          align-items: center;
          gap: 8px;

          color: rgba(255,255,255,0.42);

          font-size: 10px;
        }

        .pwa-search-info strong {
          color: #93c5fd;
        }

        .pwa-progress-message,
        .pwa-catalog-message {
          margin-bottom: 22px;
          padding: 15px 17px;

          display: flex;
          align-items: center;
          gap: 12px;

          border-radius: 11px;

          font-size: 12px;
        }

        .pwa-progress-message {
          border: 1px solid rgba(59,130,246,0.32);
          background: rgba(59,130,246,0.075);
        }

        .pwa-catalog-message {
          border: 1px solid rgba(34,197,94,0.22);
          background: rgba(34,197,94,0.06);
        }

        .pwa-progress-icon,
        .pwa-message-icon {
          width: 38px;
          height: 38px;

          flex-shrink: 0;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 9px;
        }

        .pwa-progress-icon {
          color: #60a5fa;

          background: rgba(59,130,246,0.11);
        }

        .pwa-message-icon {
          color: #22c55e;

          background: rgba(34,197,94,0.11);

          font-weight: 950;
        }

        .pwa-suppliers-grid {
          display: grid;

          grid-template-columns:
            repeat(
              auto-fill,
              minmax(250px,1fr)
            );

          gap: 16px;
        }

        .pwa-supplier-card {
          min-height: 195px;

          padding: 20px;

          display: flex;
          flex-direction: column;

          border: 1px solid rgba(96,165,250,0.22);
          border-radius: 14px;

          background:
            linear-gradient(
              145deg,
              rgba(17,29,48,0.97),
              rgba(11,22,38,0.97)
            );

          color: white;

          cursor: pointer;

          text-align: left;

          transition:
            transform 0.15s ease,
            border-color 0.15s ease;
        }

        .pwa-supplier-card:hover {
          transform: translateY(-3px);

          border-color: rgba(96,165,250,0.50);
        }

        .pwa-supplier-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .pwa-supplier-card-icon {
          width: 46px;
          height: 46px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 11px;

          color: #60a5fa;

          background: rgba(59,130,246,0.11);

          border: 1px solid rgba(59,130,246,0.20);
        }

        .pwa-supplier-card-arrow {
          color: rgba(96,165,250,0.45);
        }

        .pwa-supplier-card > strong {
          margin-top: 23px;

          min-height: 50px;

          font-size: 20px;
          font-weight: 900;

          line-height: 1.25;
        }

        .pwa-supplier-card-bottom {
          margin-top: auto;

          padding-top: 15px;

          display: flex;
          align-items: center;
          justify-content: space-between;

          border-top: 1px solid rgba(96,165,250,0.11);
        }

        .pwa-supplier-card-bottom span {
          color: #93c5fd;

          font-size: 12px;
          font-weight: 850;
        }

        .pwa-supplier-card-bottom small {
          color: rgba(255,255,255,0.34);

          font-size: 9px;
        }

        .pwa-result-groups {
          display: flex;
          flex-direction: column;

          gap: 20px;
        }

        .pwa-result-group {
          overflow: hidden;

          border: 1px solid rgba(96,165,250,0.20);
          border-radius: 14px;

          background: rgba(10,20,35,0.92);
        }

        .pwa-result-group-header {
          padding: 16px 18px;

          display: flex;
          align-items: center;
          justify-content: space-between;

          gap: 18px;

          border-bottom: 1px solid rgba(96,165,250,0.14);

          background: rgba(59,130,246,0.05);
        }

        .pwa-result-supplier {
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .pwa-result-supplier-icon {
          width: 44px;
          height: 44px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 10px;

          color: #60a5fa;

          background: rgba(59,130,246,0.11);
        }

        .pwa-result-supplier strong,
        .pwa-result-supplier span {
          display: block;
        }

        .pwa-result-supplier strong {
          color: white;

          font-size: 16px;
          font-weight: 900;
        }

        .pwa-result-supplier span {
          margin-top: 4px;

          color: rgba(255,255,255,0.42);

          font-size: 10px;
        }

        .pwa-open-supplier-button,
        .pwa-secondary-button,
        .pwa-back-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;

          gap: 8px;

          border: 1px solid rgba(96,165,250,0.28);
          border-radius: 9px;

          background: rgba(59,130,246,0.08);

          color: #93c5fd;

          cursor: pointer;

          font-size: 11px;
          font-weight: 850;
        }

        .pwa-open-supplier-button {
          min-height: 38px;
          padding: 0 13px;
        }

        .pwa-secondary-button {
          min-height: 40px;
          padding: 0 13px;
        }

        .pwa-back-button {
          margin-bottom: 18px;

          min-height: 42px;
          padding: 0 14px;
        }

        .pwa-catalog-table-wrap {
          overflow-x: auto;
        }

        .pwa-catalog-table {
          width: 100%;
          min-width: 760px;

          border-collapse: collapse;
        }

        .pwa-catalog-table thead {
          background: rgba(255,255,255,0.02);
        }

        .pwa-catalog-table th {
          padding: 15px 18px;

          color: rgba(147,197,253,0.55);

          text-align: left;

          font-size: 10px;
          font-weight: 900;

          letter-spacing: 0.9px;

          text-transform: uppercase;

          white-space: nowrap;
        }

        .pwa-catalog-table td {
          padding: 16px 18px;

          border-top: 1px solid rgba(96,165,250,0.09);

          color: rgba(255,255,255,0.76);

          font-size: 14px;

          vertical-align: middle;
        }

        .pwa-catalog-table tbody tr:hover {
          background: rgba(59,130,246,0.04);
        }

        .pwa-article-button {
          padding: 7px 10px;

          border: 1px solid rgba(59,130,246,0.23);
          border-radius: 8px;

          background: rgba(59,130,246,0.08);

          color: #93c5fd;

          cursor: pointer;

          font: inherit;

          font-size: 13px;
          font-weight: 900;
        }

        .pwa-scanner-code {
          color: rgba(255,255,255,0.62);

          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;

          font-size: 13px;
          font-weight: 700;
        }

        .pwa-selected-supplier-header {
          margin-bottom: 18px;
          padding: 20px;

          display: flex;
          align-items: center;

          gap: 15px;

          border: 1px solid rgba(96,165,250,0.20);
          border-radius: 13px;

          background: rgba(59,130,246,0.05);
        }

        .pwa-selected-supplier-icon {
          width: 54px;
          height: 54px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 12px;

          color: #60a5fa;

          background: rgba(59,130,246,0.11);
        }

        .pwa-selected-supplier-header h2 {
          margin: 4px 0 0;

          color: white;

          font-size: 30px;
          font-weight: 950;
        }

        .pwa-selected-supplier-header p {
          margin: 5px 0 0;

          color: rgba(255,255,255,0.42);

          font-size: 11px;
        }

        .pwa-empty-state {
          padding: 55px 25px;

          border: 1px solid rgba(96,165,250,0.18);
          border-radius: 14px;

          background: rgba(10,20,35,0.78);

          text-align: center;
        }

        .pwa-empty-state strong {
          display: block;

          color: white;

          font-size: 18px;
          font-weight: 900;
        }

        .pwa-empty-state span {
          display: block;

          margin-top: 7px;

          color: rgba(255,255,255,0.42);

          font-size: 12px;
        }

        .pwa-photo-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;

          padding: 20px;

          display: flex;
          align-items: center;
          justify-content: center;

          background: rgba(0,0,0,0.80);

          backdrop-filter: blur(5px);
        }

        .pwa-photo-modal {
          width: min(900px,100%);
          max-height: 92vh;

          overflow-y: auto;

          border: 1px solid rgba(96,165,250,0.30);
          border-radius: 17px;

          background: #0b1524;
        }

        .pwa-photo-header {
          padding: 22px 24px;

          display: flex;
          align-items: flex-start;
          justify-content: space-between;

          gap: 20px;

          border-bottom: 1px solid rgba(96,165,250,0.15);
        }

        .pwa-photo-label {
          color: #60a5fa;

          font-size: 10px;
          font-weight: 950;

          letter-spacing: 1.4px;
        }

        .pwa-photo-header h2 {
          margin: 7px 0 0;

          color: white;

          font-size: 32px;
          font-weight: 950;
        }

        .pwa-photo-header p {
          margin: 7px 0 0;

          color: rgba(255,255,255,0.64);

          font-size: 14px;
        }

        .pwa-photo-scanner {
          margin-top: 10px;

          display: flex;
          align-items: center;
          gap: 7px;

          color: rgba(255,255,255,0.40);

          font-size: 11px;
        }

        .pwa-photo-close {
          width: 42px;
          height: 42px;

          border: 1px solid rgba(255,255,255,0.13);
          border-radius: 10px;

          background: rgba(255,255,255,0.04);

          color: white;

          cursor: pointer;

          font-size: 22px;
        }

        .pwa-photo-container {
          min-height: 400px;

          margin: 20px;

          overflow: hidden;

          display: flex;
          align-items: center;
          justify-content: center;

          border: 1px solid rgba(96,165,250,0.13);
          border-radius: 13px;

          background: rgba(3,9,17,0.60);
        }

        .pwa-photo-container img {
          display: block;

          width: 100%;

          max-height: 65vh;

          object-fit: contain;
        }

        .pwa-photo-unavailable {
          padding: 40px;

          color: rgba(255,255,255,0.40);

          text-align: center;

          font-size: 13px;
        }


        /* =================================================
           TEMA CHIARO - STILE COERENTE CON IL GESTIONALE
        ================================================= */

        .pwa-catalog-page[data-theme="light"]
        .pwa-catalog-topbar {
          border-color: #dbe4ef;
          background: #ffffff;
          box-shadow:
            0 10px 28px rgba(15,23,42,0.05);
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-catalog-brand-icon {
          color: #1478ff;
          background: #eff6ff;
          border-color: #cfe1ff;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-catalog-brand strong {
          color: #0f172a;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-catalog-brand span {
          color: #64748b;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-notes-link {
          border-color: #cfe1ff;
          background: #eff6ff;
          color: #1478ff;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-theme-switch {
          border-color: #dbe4ef;
          background: #f8fafc;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-theme-switch button {
          color: #64748b;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-theme-switch button.active {
          border-color: #cfe1ff;
          background: #ffffff;
          color: #1478ff;
          box-shadow:
            0 2px 8px rgba(15,23,42,0.07);
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-catalog-loading {
          color: #64748b;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-catalog-hero {
          border-color: #d7e2ef;
          background:
            linear-gradient(
              125deg,
              #ffffff 0%,
              #f8fbff 58%,
              #eef5ff 100%
            );
          box-shadow:
            0 14px 36px rgba(15,23,42,0.05);
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-glow-one {
          background:
            rgba(37,99,235,0.08);
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-glow-two {
          background:
            rgba(59,130,246,0.07);
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-catalog-eyebrow,
        .pwa-catalog-page[data-theme="light"]
        .pwa-section-label {
          color: #1478ff;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-catalog-hero h1,
        .pwa-catalog-page[data-theme="light"]
        .pwa-section-heading h2,
        .pwa-catalog-page[data-theme="light"]
        .pwa-content-heading h2,
        .pwa-catalog-page[data-theme="light"]
        .pwa-selected-supplier-header h2,
        .pwa-catalog-page[data-theme="light"]
        .pwa-result-supplier strong,
        .pwa-catalog-page[data-theme="light"]
        .pwa-empty-state strong {
          color: #0f172a;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-catalog-hero p,
        .pwa-catalog-page[data-theme="light"]
        .pwa-catalog-meta,
        .pwa-catalog-page[data-theme="light"]
        .pwa-content-heading p,
        .pwa-catalog-page[data-theme="light"]
        .pwa-result-supplier span,
        .pwa-catalog-page[data-theme="light"]
        .pwa-selected-supplier-header p,
        .pwa-catalog-page[data-theme="light"]
        .pwa-empty-state span,
        .pwa-catalog-page[data-theme="light"]
        .pwa-search-info {
          color: #64748b;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-catalog-stat strong {
          color: #0f172a;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-catalog-stat span {
          color: #64748b;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-search-panel {
          border-color: #dbe4ef;
          background:
            linear-gradient(
              145deg,
              #ffffff,
              #f8fbff
            );
          box-shadow:
            0 12px 30px rgba(15,23,42,0.04);
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-offline-count {
          border-color: rgba(34,197,94,0.24);
          background: rgba(34,197,94,0.07);
          color: #475569;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-supplier-total {
          border-color: #cfe1ff;
          background: #eff6ff;
          color: #1478ff;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-search-box {
          border-color: #cfd9e6;
          background: #f8fafc;
          color: #1478ff;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-search-box:focus-within,
        .pwa-catalog-page[data-theme="light"]
        .pwa-search-box.has-value {
          border-color: #72a8ff;
          box-shadow:
            0 0 0 4px rgba(20,120,255,0.08);
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-search-box input {
          color: #0f172a;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-search-box input::placeholder {
          color: #94a3b8;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-search-clear {
          border-color: #dbe4ef;
          background: #ffffff;
          color: #64748b;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-search-info strong {
          color: #1478ff;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-progress-message {
          color: #1e40af;
          background: #eff6ff;
          border-color: #bfdbfe;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-catalog-message {
          color: #166534;
          background: #f0fdf4;
          border-color: #bbf7d0;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-supplier-card {
          border-color: #dbe4ef;
          background:
            linear-gradient(
              145deg,
              #ffffff,
              #f8fbff
            );
          color: #0f172a;
          box-shadow:
            0 9px 24px rgba(15,23,42,0.04);
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-supplier-card:hover {
          border-color: #9cc3ff;
          box-shadow:
            0 14px 30px rgba(15,23,42,0.07);
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-supplier-card-icon,
        .pwa-catalog-page[data-theme="light"]
        .pwa-result-supplier-icon,
        .pwa-catalog-page[data-theme="light"]
        .pwa-selected-supplier-icon {
          color: #1478ff;
          background: #eff6ff;
          border-color: #cfe1ff;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-supplier-card-bottom {
          border-top-color: #e5edf5;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-supplier-card-bottom span {
          color: #1478ff;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-supplier-card-bottom small {
          color: #64748b;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-result-group {
          border-color: #dbe4ef;
          background: #ffffff;
          box-shadow:
            0 10px 26px rgba(15,23,42,0.04);
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-result-group-header {
          border-bottom-color: #e5edf5;
          background: #f8fbff;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-open-supplier-button,
        .pwa-catalog-page[data-theme="light"]
        .pwa-secondary-button,
        .pwa-catalog-page[data-theme="light"]
        .pwa-back-button,
        .pwa-catalog-page[data-theme="light"]
        .pwa-article-button {
          border-color: #cfe1ff;
          background: #eff6ff;
          color: #1478ff;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-catalog-table thead {
          background: #f8fafc;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-catalog-table th {
          color: #64748b;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-catalog-table td {
          border-top-color: #e5eaf0;
          color: #334155;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-catalog-table tbody tr:hover {
          background: #f8fbff;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-scanner-code {
          color: #475569;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-selected-supplier-header {
          border-color: #cfe1ff;
          background: #eff6ff;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-empty-state {
          border-color: #dbe4ef;
          background: #ffffff;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-photo-backdrop {
          background: rgba(15,23,42,0.72);
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-photo-modal {
          border-color: #dbe4ef;
          background: #ffffff;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-photo-header {
          border-bottom-color: #e5eaf0;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-photo-header h2 {
          color: #0f172a;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-photo-header p {
          color: #475569;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-photo-scanner {
          color: #64748b;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-photo-close {
          border-color: #dbe4ef;
          background: #f8fafc;
          color: #0f172a;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-photo-container {
          border-color: #e5eaf0;
          background: #f8fafc;
        }

        .pwa-catalog-page[data-theme="light"]
        .pwa-photo-unavailable {
          color: #64748b;
        }

        @media (max-width: 1050px) {
          .pwa-catalog-hero {
            grid-template-columns: 1fr auto;
          }

          .pwa-catalog-hero-stats {
            display: none;
          }
        }

        @media (max-width: 700px) {
          .pwa-catalog-topbar {
            align-items: stretch;
            flex-direction: column;
          }

          .pwa-topbar-actions {
            width: 100%;
            align-items: stretch;
            flex-direction: column;
          }

          .pwa-notes-link {
            width: 100%;
          }

          .pwa-theme-switch {
            width: 100%;
            box-sizing: border-box;
          }

          .pwa-theme-switch button {
            flex: 1;
            justify-content: center;
          }

          .pwa-catalog-hero {
            grid-template-columns: 1fr;

            padding: 24px;
          }

          .pwa-update-button {
            width: 100%;
            min-height: 70px;
          }

          .pwa-catalog-hero h1 {
            font-size: 36px;
          }

          .pwa-section-heading,
          .pwa-content-heading {
            align-items: flex-start;
          }

          .pwa-suppliers-grid {
            grid-template-columns:
              repeat(
                2,
                minmax(0,1fr)
              );
          }
        }

        @media (max-width: 470px) {
          .pwa-suppliers-grid {
            grid-template-columns: 1fr;
          }

          .pwa-section-heading,
          .pwa-content-heading {
            flex-direction: column;
          }

          .pwa-offline-count,
          .pwa-supplier-total {
            align-self: flex-start;
          }

          .pwa-result-group-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .pwa-open-supplier-button {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}

function CatalogTable({
  items,
  onItemClick,
}: {
  items: Item[];
  onItemClick: (
    item: Item
  ) => void;
}) {
  return (
    <div className="pwa-catalog-table-wrap">
      <table className="pwa-catalog-table">
        <thead>
          <tr>
            <th>
              Codice articolo
            </th>

            <th>
              Codice scanner
            </th>

            <th>
              Descrizione
            </th>
          </tr>
        </thead>

        <tbody>
          {items.length ===
          0 ? (
            <tr>
              <td
                colSpan={3}
                style={{
                  padding:
                    40,
                  textAlign:
                    "center",
                  opacity:
                    0.5,
                }}
              >
                Nessun articolo presente.
              </td>
            </tr>
          ) : (
            items.map(
              (item) => (
                <tr
                  key={
                    item.id
                  }
                >
                  <td>
                    <button
                      type="button"
                      className="pwa-article-button"
                      onClick={() =>
                        onItemClick(
                          item
                        )
                      }
                    >
                      {item.supplier_code ||
                        "-"}
                    </button>
                  </td>

                  <td>
                    <span className="pwa-scanner-code">
                      {item.code ||
                        "-"}
                    </span>
                  </td>

                  <td>
                    {item.description ||
                      "-"}
                  </td>
                </tr>
              )
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="pwa-empty-state">
      <strong>
        {title}
      </strong>

      <span>
        {text}
      </span>
    </div>
  );
}

/* ICONE */

function CatalogSmallIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SearchSmallIcon() {
  return <SearchIcon />;
}

function SupplierIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
      <path d="M4 8L12 4L20 8V18L12 21L4 18V8Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 8L12 12L19.5 8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 12V21" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
      <path d="M20 7V3L17.5 5.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M19 6C17.5 4.5 15.3 3.5 13 3.5C8.3 3.5 4.5 7.3 4.5 12" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 17V21L6.5 18.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 18C6.5 19.5 8.7 20.5 11 20.5C15.7 20.5 19.5 16.7 19.5 12" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M5 12H19" stroke="currentColor" strokeWidth="2" />
      <path d="M14 7L19 12L14 17" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M19 12H5" stroke="currentColor" strokeWidth="2" />
      <path d="M10 7L5 12L10 17" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function OfflineIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="18" r="1.5" fill="currentColor" />
      <path d="M8 14C9 12.8 10.4 12 12 12C13.6 12 15 12.8 16 14" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function BarcodeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M4 5V19" stroke="currentColor" strokeWidth="2" />
      <path d="M8 5V19" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 5V19" stroke="currentColor" strokeWidth="2.5" />
      <path d="M15 5V19" stroke="currentColor" strokeWidth="1.5" />
      <path d="M18 5V19" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6 18L11 13L14 16L17 13L20 16" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function formatDateTime(
  value: string
) {
  if (!value) {
    return "-";
  }

  try {
    return new Intl.DateTimeFormat(
      "it-IT",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    ).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}