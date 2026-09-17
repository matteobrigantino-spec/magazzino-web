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
  stock: number | null;
  min_stock: number | null;
  category: string;
};

type CatalogData = {
  suppliers: Supplier[];
  items: Item[];
  updatedAt: string;
  inventorySnapshot?: boolean;
};

type PwaTheme = "light" | "dark";

type StockStatus =
  | "ok"
  | "low"
  | "out"
  | "unknown";

type StockFilter =
  | "all"
  | "low"
  | "out";

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
  ] = useState<PwaTheme>("dark");

  const [
    stockFilter,
    setStockFilter,
  ] = useState<StockFilter>("all");

  const [
    categoryFilter,
    setCategoryFilter,
  ] = useState("all");

  const [
    supplierFilter,
    setSupplierFilter,
  ] = useState("all");

  const [
    inventoryReady,
    setInventoryReady,
  ] = useState(false);

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
        setTheme(savedTheme);
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
    setTheme(nextTheme);

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

  function normalizeCachedItem(
    rawItem: any
  ): Item {
    const hasStock =
      rawItem?.stock !== undefined &&
      rawItem?.stock !== null;

    const hasMinStock =
      rawItem?.min_stock !== undefined &&
      rawItem?.min_stock !== null;

    return {
      id: String(rawItem?.id || ""),
      supplier_id: String(
        rawItem?.supplier_id || ""
      ),
      code: String(
        rawItem?.code || ""
      ),
      supplier_code:
        rawItem?.supplier_code
          ? String(
              rawItem.supplier_code
            )
          : null,
      description: String(
        rawItem?.description || ""
      ),
      image_url:
        rawItem?.image_url
          ? String(
              rawItem.image_url
            )
          : null,
      stock: hasStock
        ? Number(rawItem.stock)
        : null,
      min_stock: hasMinStock
        ? Number(rawItem.min_stock)
        : null,
      category:
        String(
          rawItem?.category ||
            "Altro"
        ).trim() || "Altro",
    };
  }

  function loadLocalCatalog() {
    setLoading(true);

    try {
      const saved =
        localStorage.getItem(
          STORAGE_KEY
        );

      if (saved) {
        const parsed =
          JSON.parse(saved) as CatalogData;

        const cachedSuppliers =
          Array.isArray(
            parsed.suppliers
          )
            ? parsed.suppliers.map(
                (supplier) => ({
                  id: String(
                    supplier.id
                  ),
                  name: String(
                    supplier.name ||
                      ""
                  ),
                })
              )
            : [];

        const cachedItems =
          Array.isArray(
            parsed.items
          )
            ? parsed.items.map(
                normalizeCachedItem
              )
            : [];

        setSuppliers(
          cachedSuppliers
        );

        setItems(
          cachedItems
        );

        setLastUpdate(
          parsed.updatedAt || ""
        );

        setInventoryReady(
          parsed.inventorySnapshot ===
            true &&
            cachedItems.every(
              (item) =>
                item.stock !== null &&
                item.min_stock !==
                  null
            )
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
          "id,supplier_id,code,supplier_code,description,image_url,stock,min_stock,category"
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
            stock:
              Number(
                item.stock || 0
              ),
            min_stock:
              Number(
                item.min_stock || 0
              ),
            category:
              String(
                item.category ||
                  "Altro"
              ).trim() ||
              "Altro",
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
        inventorySnapshot: true,
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

      setInventoryReady(true);

      const photoResult =
        await downloadAllPhotos(
          cleanItems
        );

      setMessage(
        `Magazzino aggiornato: ${cleanItems.length} articoli, ` +
          `${cleanSuppliers.length} fornitori. ` +
          `Foto salvate: ${photoResult.saved}.`
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
                url.length > 0
            )
        )
      );

    if (
      imageUrls.length === 0
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
              ignoreVary: true,
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

  const categories =
    useMemo(() => {
      const map =
        new Map<
          string,
          string
        >();

      items.forEach(
        (item) => {
          const cleanCategory =
            (
              item.category ||
              "Altro"
            ).trim() ||
            "Altro";

          const key =
            cleanCategory.toLocaleLowerCase(
              "it"
            );

          if (!map.has(key)) {
            map.set(
              key,
              cleanCategory
            );
          }
        }
      );

      return Array.from(
        map.values()
      ).sort(
        (a, b) =>
          a.localeCompare(
            b,
            "it",
            {
              sensitivity:
                "base",
            }
          )
      );
    }, [items]);

  const categoryCounts =
    useMemo(() => {
      const counts =
        new Map<
          string,
          number
        >();

      items.forEach(
        (item) => {
          const category =
            (
              item.category ||
              "Altro"
            ).trim() ||
            "Altro";

          const key =
            category.toLocaleLowerCase(
              "it"
            );

          counts.set(
            key,
            (counts.get(key) ||
              0) + 1
          );
        }
      );

      return counts;
    }, [items]);

  const lowStockCount =
    useMemo(() => {
      return items.filter(
        (item) =>
          getStockStatus(
            item
          ) === "low"
      ).length;
    }, [items]);

  const outOfStockCount =
    useMemo(() => {
      return items.filter(
        (item) =>
          getStockStatus(
            item
          ) === "out"
      ).length;
    }, [items]);

  const filteredItems =
    useMemo(() => {
      const text =
        search
          .trim()
          .toLocaleLowerCase(
            "it"
          );

      const collator =
        new Intl.Collator(
          "it",
          {
            numeric: true,
            sensitivity:
              "base",
          }
        );

      const statusPriority:
        Record<
          StockStatus,
          number
        > = {
        out: 0,
        low: 1,
        ok: 2,
        unknown: 3,
      };

      return items
        .filter((item) => {
          if (
            supplierFilter !==
              "all" &&
            item.supplier_id !==
              supplierFilter
          ) {
            return false;
          }

          if (
            categoryFilter !==
            "all"
          ) {
            const itemCategory =
              (
                item.category ||
                "Altro"
              )
                .trim()
                .toLocaleLowerCase(
                  "it"
                );

            if (
              itemCategory !==
              categoryFilter
                .toLocaleLowerCase(
                  "it"
                )
            ) {
              return false;
            }
          }

          const status =
            getStockStatus(
              item
            );

          if (
            stockFilter ===
              "low" &&
            status !== "low"
          ) {
            return false;
          }

          if (
            stockFilter ===
              "out" &&
            status !== "out"
          ) {
            return false;
          }

          if (!text) {
            return true;
          }

          const supplierName =
            supplierMap.get(
              item.supplier_id
            )?.name || "";

          return [
            item.supplier_code ||
              "",
            item.code,
            item.description,
            item.category ||
              "",
            supplierName,
          ].some((value) =>
            value
              .toLocaleLowerCase(
                "it"
              )
              .includes(text)
          );
        })
        .sort((a, b) => {
          const statusCompare =
            statusPriority[
              getStockStatus(a)
            ] -
            statusPriority[
              getStockStatus(b)
            ];

          if (
            statusCompare !== 0
          ) {
            return statusCompare;
          }

          const categoryCompare =
            collator.compare(
              a.category ||
                "Altro",
              b.category ||
                "Altro"
            );

          if (
            categoryCompare !== 0
          ) {
            return categoryCompare;
          }

          return collator.compare(
            a.supplier_code ||
              a.description,
            b.supplier_code ||
              b.description
          );
        });
    }, [
      items,
      search,
      supplierFilter,
      categoryFilter,
      stockFilter,
      supplierMap,
    ]);

  const hasActiveFilters =
    search.trim().length > 0 ||
    stockFilter !== "all" ||
    categoryFilter !== "all" ||
    supplierFilter !== "all";

  function resetFilters() {
    setSearch("");
    setStockFilter("all");
    setCategoryFilter("all");
    setSupplierFilter("all");
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

  return (
    <>
      <div
        className="pwa-catalog-page"
        data-theme={theme}
      >
        <div className="pwa-catalog-topbar">
          <div className="pwa-catalog-brand">
            <div className="pwa-catalog-brand-icon">
              <WarehouseIcon />
            </div>

            <div>
              <strong>
                MAGAZZINO
              </strong>

              <span>
                CATALOGO OPERATIVO
              </span>
            </div>
          </div>

          <div className="pwa-topbar-actions">
            <a
              className="pwa-notes-link"
              href="/catalogo/note"
            >
              <NoteIcon />
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
                <SunIcon />
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
                <MoonIcon />
                Scuro
              </button>
            </div>
          </div>
        </div>

        <section className="pwa-dashboard-hero">
          <div className="pwa-hero-copy">
            <div className="pwa-eyebrow">
              <span className="pwa-live-dot" />
              INVENTARIO PWA
            </div>

            <h1>
              Catalogo{" "}
              <span>
                intelligente
              </span>
            </h1>

            <p>
              Giacenze in sola lettura,
              filtri operativi e categorie
              dinamiche. Il magazziniere
              controlla tutto senza poter
              modificare lo stock da questa
              schermata.
            </p>

            <div className="pwa-last-update">
              <RefreshSmallIcon />

              <span>
                {lastUpdate
                  ? `Ultimo aggiornamento: ${formatDateTime(
                      lastUpdate
                    )}`
                  : "Catalogo non ancora aggiornato"}
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
                Dati, giacenze e foto
              </span>
            </div>
          </button>
        </section>

        {!inventoryReady && (
          <div className="pwa-snapshot-warning">
            <div className="pwa-warning-icon">
              <RefreshIcon />
            </div>

            <div>
              <strong>
                Primo aggiornamento necessario
              </strong>

              <span>
                Premi “Aggiorna magazzino” per
                scaricare giacenze, scorte minime
                e categorie nel catalogo offline.
              </span>
            </div>
          </div>
        )}

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

        <section className="pwa-kpi-grid">
          <button
            type="button"
            className="pwa-kpi-card pwa-kpi-total"
            onClick={() =>
              setStockFilter("all")
            }
          >
            <div className="pwa-kpi-icon">
              <BoxesIcon />
            </div>

            <div>
              <span>
                Articoli
              </span>

              <strong>
                {items.length}
              </strong>

              <small>
                Totale catalogo
              </small>
            </div>
          </button>

          <button
            type="button"
            className="pwa-kpi-card pwa-kpi-low"
            onClick={() =>
              setStockFilter("low")
            }
          >
            <div className="pwa-kpi-icon">
              <AlertIcon />
            </div>

            <div>
              <span>
                Scorta bassa
              </span>

              <strong>
                {inventoryReady
                  ? lowStockCount
                  : "—"}
              </strong>

              <small>
                Da controllare
              </small>
            </div>
          </button>

          <button
            type="button"
            className="pwa-kpi-card pwa-kpi-out"
            onClick={() =>
              setStockFilter("out")
            }
          >
            <div className="pwa-kpi-icon">
              <EmptyBoxIcon />
            </div>

            <div>
              <span>
                Esauriti
              </span>

              <strong>
                {inventoryReady
                  ? outOfStockCount
                  : "—"}
              </strong>

              <small>
                Giacenza zero
              </small>
            </div>
          </button>

          <div className="pwa-kpi-card pwa-kpi-category">
            <div className="pwa-kpi-icon">
              <TagIcon />
            </div>

            <div>
              <span>
                Categorie
              </span>

              <strong>
                {categories.length}
              </strong>

              <small>
                Create dagli articoli
              </small>
            </div>
          </div>
        </section>

        <section className="pwa-control-panel">
          <div className="pwa-control-top">
            <div>
              <div className="pwa-section-label">
                RICERCA E FILTRI
              </div>

              <h2>
                Trova subito quello che serve
              </h2>
            </div>

            <div className="pwa-offline-badge">
              <OfflineIcon />
              {items.length} articoli offline
            </div>
          </div>

          <div className="pwa-search-box">
            <SearchIcon />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Cerca codice, scanner, descrizione, categoria o fornitore..."
              autoComplete="off"
            />

            {search && (
              <button
                type="button"
                onClick={() =>
                  setSearch("")
                }
                className="pwa-search-clear"
                aria-label="Cancella ricerca"
              >
                ×
              </button>
            )}
          </div>

          <div className="pwa-filter-row">
            <div className="pwa-filter-title">
              Stato
            </div>

            <div className="pwa-filter-chips">
              <FilterButton
                active={
                  stockFilter ===
                  "all"
                }
                onClick={() =>
                  setStockFilter(
                    "all"
                  )
                }
                label="Tutti"
                count={items.length}
                tone="neutral"
              />

              <FilterButton
                active={
                  stockFilter ===
                  "low"
                }
                onClick={() =>
                  setStockFilter(
                    "low"
                  )
                }
                label="Scorta bassa"
                count={
                  inventoryReady
                    ? lowStockCount
                    : undefined
                }
                tone="warning"
              />

              <FilterButton
                active={
                  stockFilter ===
                  "out"
                }
                onClick={() =>
                  setStockFilter(
                    "out"
                  )
                }
                label="Esauriti"
                count={
                  inventoryReady
                    ? outOfStockCount
                    : undefined
                }
                tone="danger"
              />
            </div>
          </div>

          <div className="pwa-filter-row">
            <div className="pwa-filter-title">
              Categorie
            </div>

            <div className="pwa-category-scroll">
              <button
                type="button"
                className={`pwa-category-chip ${
                  categoryFilter ===
                  "all"
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setCategoryFilter(
                    "all"
                  )
                }
              >
                Tutte
                <span>
                  {items.length}
                </span>
              </button>

              {categories.map(
                (category) => (
                  <button
                    key={category}
                    type="button"
                    className={`pwa-category-chip ${
                      categoryFilter ===
                      category
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      setCategoryFilter(
                        category
                      )
                    }
                  >
                    {category}

                    <span>
                      {categoryCounts.get(
                        category.toLocaleLowerCase(
                          "it"
                        )
                      ) || 0}
                    </span>
                  </button>
                )
              )}
            </div>
          </div>

          <div className="pwa-filter-bottom">
            <label className="pwa-supplier-filter">
              <span>
                Fornitore
              </span>

              <select
                value={supplierFilter}
                onChange={(event) =>
                  setSupplierFilter(
                    event.target.value
                  )
                }
              >
                <option value="all">
                  Tutti i fornitori
                </option>

                {suppliers.map(
                  (supplier) => (
                    <option
                      key={
                        supplier.id
                      }
                      value={
                        supplier.id
                      }
                    >
                      {supplier.name}
                    </option>
                  )
                )}
              </select>
            </label>

            {hasActiveFilters && (
              <button
                type="button"
                className="pwa-reset-filters"
                onClick={
                  resetFilters
                }
              >
                × Azzera filtri
              </button>
            )}
          </div>
        </section>

        <div className="pwa-sticky-filters">
            <div className="pwa-sticky-search">
              <SearchIcon />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Cerca..."
                autoComplete="off"
              />

              {search && (
                <button
                  type="button"
                  onClick={() =>
                    setSearch("")
                  }
                  aria-label="Cancella ricerca"
                >
                  ×
                </button>
              )}
            </div>

            <div className="pwa-sticky-status">
              <button
                type="button"
                className={
                  stockFilter === "all"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setStockFilter("all")
                }
              >
                Tutti
                <span>
                  {items.length}
                </span>
              </button>

              <button
                type="button"
                className={`warning ${
                  stockFilter === "low"
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setStockFilter("low")
                }
              >
                Bassa
                {inventoryReady && (
                  <span>
                    {lowStockCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                className={`danger ${
                  stockFilter === "out"
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setStockFilter("out")
                }
              >
                Esauriti
                {inventoryReady && (
                  <span>
                    {outOfStockCount}
                  </span>
                )}
              </button>
            </div>

            <select
              className="pwa-sticky-select"
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(
                  event.target.value
                )
              }
              aria-label="Categoria"
            >
              <option value="all">
                Tutte le categorie
              </option>

              {categories.map(
                (category) => (
                  <option
                    key={category}
                    value={category}
                  >
                    {category}
                  </option>
                )
              )}
            </select>

            <select
              className="pwa-sticky-select pwa-sticky-supplier"
              value={supplierFilter}
              onChange={(event) =>
                setSupplierFilter(
                  event.target.value
                )
              }
              aria-label="Fornitore"
            >
              <option value="all">
                Tutti i fornitori
              </option>

              {suppliers.map(
                (supplier) => (
                  <option
                    key={supplier.id}
                    value={supplier.id}
                  >
                    {supplier.name}
                  </option>
                )
              )}
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                className="pwa-sticky-reset"
                onClick={
                  resetFilters
                }
                title="Azzera filtri"
              >
                ×
              </button>
            )}
        </div>

        <section className="pwa-results-section">
          <div className="pwa-results-heading">
            <div>
              <div className="pwa-section-label">
                CATALOGO
              </div>

              <h2>
                Articoli
              </h2>

              <p>
                {filteredItems.length}{" "}
                {filteredItems.length ===
                1
                  ? "articolo visualizzato"
                  : "articoli visualizzati"}
              </p>
            </div>

            <div className="pwa-readonly-pill">
              <LockIcon />
              Giacenza sola lettura
            </div>
          </div>

          {filteredItems.length ===
          0 ? (
            <EmptyState
              title="Nessun articolo trovato"
              text="Modifica la ricerca o azzera i filtri."
              onReset={
                hasActiveFilters
                  ? resetFilters
                  : undefined
              }
            />
          ) : (
            <div className="pwa-product-grid">
              {filteredItems.map(
                (item) => (
                  <ProductCard
                    key={item.id}
                    item={item}
                    supplier={
                      supplierMap.get(
                        item.supplier_id
                      ) || null
                    }
                    onOpen={() =>
                      setSelectedItem(
                        item
                      )
                    }
                  />
                )
              )}
            </div>
          )}
        </section>

        {selectedItem && (
          <ItemModal
            item={
              selectedItem
            }
            supplier={
              supplierMap.get(
                selectedItem.supplier_id
              ) || null
            }
            onClose={() =>
              setSelectedItem(
                null
              )
            }
          />
        )}
      </div>

      <style jsx global>{`
        .pwa-catalog-page {
          --pwa-bg: #07111f;
          --pwa-panel: #0d1b2d;
          --pwa-panel-2: #101f34;
          --pwa-panel-3: #13253d;
          --pwa-border: rgba(148, 163, 184, 0.16);
          --pwa-border-strong: rgba(96, 165, 250, 0.34);
          --pwa-text: #edf4ff;
          --pwa-muted: #8da0ba;
          --pwa-muted-2: #64748b;
          --pwa-blue: #3b82f6;
          --pwa-blue-soft: rgba(59, 130, 246, 0.12);
          --pwa-green: #22c55e;
          --pwa-green-soft: rgba(34, 197, 94, 0.10);
          --pwa-orange: #f59e0b;
          --pwa-orange-soft: rgba(245, 158, 11, 0.11);
          --pwa-red: #ef4444;
          --pwa-red-soft: rgba(239, 68, 68, 0.11);
          --pwa-shadow: 0 18px 46px rgba(0, 0, 0, 0.18);

          width: 100%;
          max-width: 1500px;
          min-height: 100vh;
          margin: 0 auto;
          padding-bottom: 44px;
          color: var(--pwa-text);
          background: var(--pwa-bg);
          box-shadow:
            0 0 0 100vmax var(--pwa-bg);
          clip-path:
            inset(0 -100vmax);
        }

        .pwa-catalog-page[data-theme="light"] {
          --pwa-bg: #f3f6fa;
          --pwa-panel: #ffffff;
          --pwa-panel-2: #f8fbff;
          --pwa-panel-3: #eef4fb;
          --pwa-border: #dce5ef;
          --pwa-border-strong: #a8c8f5;
          --pwa-text: #0f172a;
          --pwa-muted: #64748b;
          --pwa-muted-2: #94a3b8;
          --pwa-blue: #1478ff;
          --pwa-blue-soft: #eef5ff;
          --pwa-green: #16a34a;
          --pwa-green-soft: #effcf3;
          --pwa-orange: #d97706;
          --pwa-orange-soft: #fff8e8;
          --pwa-red: #dc2626;
          --pwa-red-soft: #fff1f1;
          --pwa-shadow:
            0 16px 40px rgba(15, 23, 42, 0.07);
        }

        .pwa-catalog-loading {
          padding: 70px 20px;
          color: var(--pwa-muted);
          text-align: center;
          font-size: 16px;
        }

        .pwa-catalog-topbar {
          min-height: 66px;
          margin-bottom: 18px;
          padding: 10px 14px;

          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;

          border: 1px solid var(--pwa-border);
          border-radius: 16px;

          background:
            color-mix(
              in srgb,
              var(--pwa-panel) 92%,
              transparent
            );

          box-shadow:
            0 8px 24px rgba(0,0,0,0.04);
        }

        .pwa-catalog-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .pwa-catalog-brand-icon {
          width: 40px;
          height: 40px;

          display: flex;
          align-items: center;
          justify-content: center;

          border: 1px solid var(--pwa-border-strong);
          border-radius: 11px;

          background: var(--pwa-blue-soft);
          color: var(--pwa-blue);
        }

        .pwa-catalog-brand strong,
        .pwa-catalog-brand span {
          display: block;
        }

        .pwa-catalog-brand strong {
          color: var(--pwa-text);
          font-size: 14px;
          font-weight: 950;
          letter-spacing: 0.8px;
        }

        .pwa-catalog-brand span {
          margin-top: 2px;
          color: var(--pwa-muted);
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 1px;
        }

        .pwa-topbar-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 9px;
        }

        .pwa-notes-link {
          min-height: 42px;
          padding: 0 14px;

          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;

          border: 1px solid var(--pwa-border-strong);
          border-radius: 10px;

          background: var(--pwa-blue-soft);
          color: var(--pwa-blue);

          text-decoration: none;
          font-size: 11px;
          font-weight: 900;
        }

        .pwa-theme-switch {
          padding: 4px;

          display: inline-flex;
          align-items: center;
          gap: 4px;

          border: 1px solid var(--pwa-border);
          border-radius: 10px;

          background: var(--pwa-panel-2);
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
          color: var(--pwa-muted);

          cursor: pointer;
          font-size: 11px;
          font-weight: 850;
        }

        .pwa-theme-switch button.active {
          border-color: var(--pwa-border-strong);
          background: var(--pwa-panel);
          color: var(--pwa-blue);

          box-shadow:
            0 2px 8px rgba(15,23,42,0.06);
        }

        .pwa-dashboard-hero {
          position: relative;
          overflow: hidden;

          min-height: 210px;
          margin-bottom: 18px;
          padding: 31px 33px;

          display: grid;
          grid-template-columns:
            minmax(0, 1fr) 260px;
          align-items: center;
          gap: 30px;

          border: 1px solid var(--pwa-border);
          border-radius: 20px;

          background:
            radial-gradient(
              circle at 72% 20%,
              rgba(59,130,246,0.16),
              transparent 28%
            ),
            linear-gradient(
              135deg,
              var(--pwa-panel),
              var(--pwa-panel-2)
            );

          box-shadow: var(--pwa-shadow);
        }

        .pwa-hero-copy {
          position: relative;
          z-index: 1;
        }

        .pwa-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;

          color: var(--pwa-blue);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 1.5px;
        }

        .pwa-live-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--pwa-green);

          box-shadow:
            0 0 0 5px var(--pwa-green-soft);
        }

        .pwa-dashboard-hero h1 {
          margin: 13px 0 0;

          color: var(--pwa-text);
          font-size: 45px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: -1.4px;
        }

        .pwa-dashboard-hero h1 span {
          color: var(--pwa-blue);
        }

        .pwa-dashboard-hero p {
          max-width: 780px;
          margin: 14px 0 0;

          color: var(--pwa-muted);
          font-size: 14px;
          line-height: 1.6;
        }

        .pwa-last-update {
          margin-top: 18px;

          display: flex;
          align-items: center;
          gap: 8px;

          color: var(--pwa-muted);
          font-size: 11px;
        }

        .pwa-update-button {
          position: relative;
          z-index: 1;

          min-height: 92px;
          padding: 18px 20px;

          display: flex;
          align-items: center;
          gap: 14px;

          border: 1px solid rgba(96,165,250,0.45);
          border-radius: 15px;

          background:
            linear-gradient(
              135deg,
              #2563eb,
              #3b82f6
            );

          color: white;
          cursor: pointer;
          text-align: left;

          box-shadow:
            0 16px 34px rgba(37,99,235,0.22);
        }

        .pwa-update-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .pwa-update-button strong,
        .pwa-update-button span {
          display: block;
        }

        .pwa-update-button strong {
          font-size: 14px;
          font-weight: 950;
        }

        .pwa-update-button span {
          margin-top: 4px;
          color: rgba(255,255,255,0.68);
          font-size: 10px;
        }

        .pwa-snapshot-warning,
        .pwa-progress-message,
        .pwa-catalog-message {
          margin-bottom: 18px;
          padding: 15px 17px;

          display: flex;
          align-items: center;
          gap: 12px;

          border-radius: 12px;
          font-size: 12px;
        }

        .pwa-snapshot-warning {
          border: 1px solid rgba(245,158,11,0.30);
          background: var(--pwa-orange-soft);
          color: var(--pwa-text);
        }

        .pwa-progress-message {
          border: 1px solid var(--pwa-border-strong);
          background: var(--pwa-blue-soft);
        }

        .pwa-catalog-message {
          border: 1px solid rgba(34,197,94,0.26);
          background: var(--pwa-green-soft);
        }

        .pwa-warning-icon,
        .pwa-progress-icon,
        .pwa-message-icon {
          width: 40px;
          height: 40px;

          flex-shrink: 0;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 10px;
        }

        .pwa-warning-icon {
          color: var(--pwa-orange);
          background: rgba(245,158,11,0.10);
        }

        .pwa-progress-icon {
          color: var(--pwa-blue);
          background: var(--pwa-blue-soft);
        }

        .pwa-message-icon {
          color: var(--pwa-green);
          background: var(--pwa-green-soft);
          font-weight: 950;
        }

        .pwa-snapshot-warning strong,
        .pwa-snapshot-warning span,
        .pwa-progress-message strong,
        .pwa-progress-message span {
          display: block;
        }

        .pwa-snapshot-warning span,
        .pwa-progress-message span {
          margin-top: 3px;
          color: var(--pwa-muted);
        }

        .pwa-kpi-grid {
          margin-bottom: 18px;

          display: grid;
          grid-template-columns:
            repeat(4, minmax(0,1fr));
          gap: 13px;
        }

        .pwa-kpi-card {
          min-height: 120px;
          padding: 18px;

          display: flex;
          align-items: center;
          gap: 15px;

          border: 1px solid var(--pwa-border);
          border-radius: 16px;

          background: var(--pwa-panel);
          color: var(--pwa-text);

          text-align: left;
          box-shadow:
            0 10px 28px rgba(0,0,0,0.05);
        }

        button.pwa-kpi-card {
          cursor: pointer;
        }

        button.pwa-kpi-card:hover {
          border-color: var(--pwa-border-strong);
          transform: translateY(-2px);
        }

        .pwa-kpi-icon {
          width: 52px;
          height: 52px;

          flex: 0 0 auto;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 14px;
          background: var(--pwa-blue-soft);
          color: var(--pwa-blue);
        }

        .pwa-kpi-low .pwa-kpi-icon {
          background: var(--pwa-orange-soft);
          color: var(--pwa-orange);
        }

        .pwa-kpi-out .pwa-kpi-icon {
          background: var(--pwa-red-soft);
          color: var(--pwa-red);
        }

        .pwa-kpi-category .pwa-kpi-icon {
          background: var(--pwa-green-soft);
          color: var(--pwa-green);
        }

        .pwa-kpi-card span,
        .pwa-kpi-card strong,
        .pwa-kpi-card small {
          display: block;
        }

        .pwa-kpi-card span {
          color: var(--pwa-muted);
          font-size: 10px;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0.7px;
        }

        .pwa-kpi-card strong {
          margin-top: 4px;
          color: var(--pwa-text);
          font-size: 27px;
          font-weight: 950;
          line-height: 1;
        }

        .pwa-kpi-card small {
          margin-top: 6px;
          color: var(--pwa-muted);
          font-size: 10px;
        }

        .pwa-control-panel {
          margin-bottom: 22px;
          padding: 22px;

          border: 1px solid var(--pwa-border);
          border-radius: 18px;

          background: var(--pwa-panel);
          box-shadow: var(--pwa-shadow);
        }

        .pwa-control-top,
        .pwa-results-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 18px;
        }

        .pwa-section-label {
          color: var(--pwa-blue);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 1.45px;
        }

        .pwa-control-top h2,
        .pwa-results-heading h2 {
          margin: 6px 0 0;

          color: var(--pwa-text);
          font-size: 25px;
          font-weight: 950;
        }

        .pwa-results-heading p {
          margin: 5px 0 0;
          color: var(--pwa-muted);
          font-size: 11px;
        }

        .pwa-offline-badge,
        .pwa-readonly-pill {
          padding: 9px 12px;

          display: inline-flex;
          align-items: center;
          gap: 7px;

          border: 1px solid rgba(34,197,94,0.22);
          border-radius: 999px;

          background: var(--pwa-green-soft);
          color: var(--pwa-green);

          font-size: 10px;
          font-weight: 900;
          white-space: nowrap;
        }

        .pwa-readonly-pill {
          border-color: var(--pwa-border-strong);
          background: var(--pwa-blue-soft);
          color: var(--pwa-blue);
        }

        .pwa-search-box {
          height: 64px;
          margin-top: 17px;
          padding: 0 16px;

          display: flex;
          align-items: center;
          gap: 12px;

          border: 1px solid var(--pwa-border);
          border-radius: 13px;

          background: var(--pwa-panel-2);
          color: var(--pwa-blue);
        }

        .pwa-search-box:focus-within {
          border-color: var(--pwa-border-strong);

          box-shadow:
            0 0 0 4px var(--pwa-blue-soft);
        }

        .pwa-search-box input {
          min-width: 0;
          flex: 1;

          border: none;
          outline: none;

          background: transparent;
          color: var(--pwa-text);

          font: inherit;
          font-size: 16px;
          font-weight: 650;
        }

        .pwa-search-box input::placeholder {
          color: var(--pwa-muted-2);
        }

        .pwa-search-clear {
          width: 38px;
          height: 38px;

          border: 1px solid var(--pwa-border);
          border-radius: 9px;

          background: var(--pwa-panel);
          color: var(--pwa-muted);

          cursor: pointer;
          font-size: 20px;
        }

        .pwa-filter-row {
          margin-top: 18px;
          padding-top: 18px;

          display: grid;
          grid-template-columns:
            105px minmax(0,1fr);
          gap: 15px;

          border-top: 1px solid var(--pwa-border);
        }

        .pwa-filter-title {
          padding-top: 8px;

          color: var(--pwa-muted);
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }

        .pwa-filter-chips,
        .pwa-category-scroll {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
        }

        .pwa-filter-chip,
        .pwa-category-chip {
          min-height: 40px;
          padding: 0 13px;

          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;

          border: 1px solid var(--pwa-border);
          border-radius: 999px;

          background: var(--pwa-panel-2);
          color: var(--pwa-muted);

          cursor: pointer;
          font-size: 11px;
          font-weight: 900;
        }

        .pwa-filter-chip span,
        .pwa-category-chip span {
          min-width: 22px;
          height: 22px;
          padding: 0 6px;

          display: inline-flex;
          align-items: center;
          justify-content: center;

          border-radius: 999px;

          background: var(--pwa-panel-3);
          color: var(--pwa-muted);

          font-size: 9px;
          font-weight: 950;
        }

        .pwa-filter-chip.active,
        .pwa-category-chip.active {
          border-color: var(--pwa-border-strong);
          background: var(--pwa-blue-soft);
          color: var(--pwa-blue);
        }

        .pwa-filter-chip.warning.active {
          border-color: rgba(245,158,11,0.34);
          background: var(--pwa-orange-soft);
          color: var(--pwa-orange);
        }

        .pwa-filter-chip.danger.active {
          border-color: rgba(239,68,68,0.34);
          background: var(--pwa-red-soft);
          color: var(--pwa-red);
        }

        .pwa-filter-bottom {
          margin-top: 18px;
          padding-top: 18px;

          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 14px;

          border-top: 1px solid var(--pwa-border);
        }

        .pwa-supplier-filter {
          width: min(360px, 100%);
        }

        .pwa-supplier-filter > span {
          display: block;
          margin-bottom: 7px;

          color: var(--pwa-muted);
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }

        .pwa-supplier-filter select {
          width: 100%;
          min-height: 44px;
          padding: 0 12px;

          border: 1px solid var(--pwa-border);
          border-radius: 10px;

          background: var(--pwa-panel-2);
          color: var(--pwa-text);

          outline: none;
          font: inherit;
          font-size: 12px;
          font-weight: 750;
        }

        .pwa-reset-filters {
          min-height: 42px;
          padding: 0 14px;

          border: 1px solid var(--pwa-border);
          border-radius: 10px;

          background: var(--pwa-panel-2);
          color: var(--pwa-muted);

          cursor: pointer;
          font-size: 11px;
          font-weight: 850;
        }

        .pwa-sticky-filters {
          position: sticky;
          top: 62px;
          z-index: 9000;

          width: 100%;
          min-height: 58px;
          margin: 0 0 16px;
          padding: 8px 9px;

          box-sizing: border-box;

          display: grid;
          grid-template-columns:
            minmax(220px, 1.35fr)
            auto
            minmax(165px, 0.7fr)
            minmax(165px, 0.8fr)
            auto;
          align-items: center;
          gap: 8px;

          border: 1px solid var(--pwa-border-strong);
          border-radius: 13px;

          background:
            color-mix(
              in srgb,
              var(--pwa-panel) 97%,
              transparent
            );

          box-shadow:
            0 12px 30px rgba(0,0,0,0.18);

          backdrop-filter:
            blur(18px)
            saturate(150%);
        }

        .pwa-sticky-search {
          min-width: 0;
          height: 42px;
          padding: 0 11px;

          display: flex;
          align-items: center;
          gap: 8px;

          border: 1px solid var(--pwa-border);
          border-radius: 10px;

          background: var(--pwa-panel-2);
          color: var(--pwa-blue);
        }

        .pwa-sticky-search:focus-within {
          border-color: var(--pwa-border-strong);
          box-shadow:
            0 0 0 3px var(--pwa-blue-soft);
        }

        .pwa-sticky-search input {
          min-width: 0;
          flex: 1;

          border: none;
          outline: none;

          background: transparent;
          color: var(--pwa-text);

          font: inherit;
          font-size: 12px;
          font-weight: 750;
        }

        .pwa-sticky-search input::placeholder {
          color: var(--pwa-muted-2);
        }

        .pwa-sticky-search button {
          width: 28px;
          height: 28px;
          padding: 0;

          border: 1px solid var(--pwa-border);
          border-radius: 7px;

          background: var(--pwa-panel);
          color: var(--pwa-muted);

          cursor: pointer;
          font-size: 17px;
        }

        .pwa-sticky-status {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .pwa-sticky-status button {
          min-height: 42px;
          padding: 0 9px;

          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;

          border: 1px solid var(--pwa-border);
          border-radius: 9px;

          background: var(--pwa-panel-2);
          color: var(--pwa-muted);

          cursor: pointer;
          font-size: 10px;
          font-weight: 900;
          white-space: nowrap;
        }

        .pwa-sticky-status button span {
          min-width: 19px;
          height: 19px;
          padding: 0 4px;

          display: inline-flex;
          align-items: center;
          justify-content: center;

          border-radius: 999px;

          background: var(--pwa-panel-3);
          color: currentColor;

          font-size: 8px;
          font-weight: 950;
        }

        .pwa-sticky-status button.active {
          border-color: var(--pwa-border-strong);
          background: var(--pwa-blue-soft);
          color: var(--pwa-blue);
        }

        .pwa-sticky-status button.warning.active {
          border-color: rgba(245,158,11,0.34);
          background: var(--pwa-orange-soft);
          color: var(--pwa-orange);
        }

        .pwa-sticky-status button.danger.active {
          border-color: rgba(239,68,68,0.34);
          background: var(--pwa-red-soft);
          color: var(--pwa-red);
        }

        .pwa-sticky-select {
          min-width: 0;
          width: 100%;
          height: 42px;
          padding: 0 9px;

          border: 1px solid var(--pwa-border);
          border-radius: 9px;

          background: var(--pwa-panel-2);
          color: var(--pwa-text);

          outline: none;
          font: inherit;
          font-size: 10px;
          font-weight: 800;
        }

        .pwa-sticky-reset {
          width: 42px;
          height: 42px;
          padding: 0;

          border: 1px solid var(--pwa-border);
          border-radius: 9px;

          background: var(--pwa-panel-2);
          color: var(--pwa-muted);

          cursor: pointer;
          font-size: 19px;
          font-weight: 700;
        }

        .pwa-results-section {
          padding-top: 2px;
        }

        .pwa-results-heading {
          margin-bottom: 16px;
        }

        .pwa-product-grid {
          display: grid;
          grid-template-columns:
            repeat(
              auto-fill,
              minmax(270px,1fr)
            );
          gap: 15px;
        }

        .pwa-product-card {
          position: relative;
          overflow: hidden;

          min-width: 0;

          border: 1px solid var(--pwa-border);
          border-radius: 17px;

          background: var(--pwa-panel);

          box-shadow:
            0 10px 26px rgba(0,0,0,0.06);

          transition:
            transform 0.15s ease,
            border-color 0.15s ease,
            box-shadow 0.15s ease;
        }

        .pwa-product-card:hover {
          transform: translateY(-3px);
          border-color: var(--pwa-border-strong);
          box-shadow:
            0 17px 34px rgba(0,0,0,0.10);
        }

        .pwa-product-card.status-low {
          border-color:
            rgba(245,158,11,0.28);
        }

        .pwa-product-card.status-out {
          border-color:
            rgba(239,68,68,0.30);
        }

        .pwa-card-image {
          position: relative;
          height: 175px;
          overflow: hidden;

          display: flex;
          align-items: center;
          justify-content: center;

          background:
            linear-gradient(
              145deg,
              var(--pwa-panel-2),
              var(--pwa-panel-3)
            );
        }

        .pwa-card-image img {
          position: relative;
          z-index: 2;

          width: 100%;
          height: 100%;
          object-fit: contain;

          background: var(--pwa-panel-2);
        }

        .pwa-card-image-fallback {
          position: absolute;
          inset: 0;
          z-index: 1;

          display: flex;
          align-items: center;
          justify-content: center;

          color: var(--pwa-muted-2);
        }

        .pwa-card-status {
          position: absolute;
          z-index: 3;
          top: 12px;
          right: 12px;
        }

        .pwa-status-badge {
          min-height: 28px;
          padding: 0 10px;

          display: inline-flex;
          align-items: center;
          gap: 6px;

          border: 1px solid var(--pwa-border);
          border-radius: 999px;

          background:
            color-mix(
              in srgb,
              var(--pwa-panel) 92%,
              transparent
            );

          color: var(--pwa-muted);

          backdrop-filter: blur(8px);

          font-size: 9px;
          font-weight: 950;
          letter-spacing: 0.4px;
          text-transform: uppercase;
        }

        .pwa-status-badge.ok {
          border-color:
            rgba(34,197,94,0.30);
          background:
            color-mix(
              in srgb,
              var(--pwa-green-soft) 88%,
              var(--pwa-panel)
            );
          color: var(--pwa-green);
        }

        .pwa-status-badge.low {
          border-color:
            rgba(245,158,11,0.32);
          background:
            color-mix(
              in srgb,
              var(--pwa-orange-soft) 88%,
              var(--pwa-panel)
            );
          color: var(--pwa-orange);
        }

        .pwa-status-badge.out {
          border-color:
            rgba(239,68,68,0.34);
          background:
            color-mix(
              in srgb,
              var(--pwa-red-soft) 88%,
              var(--pwa-panel)
            );
          color: var(--pwa-red);
        }

        .pwa-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: currentColor;
        }

        .pwa-card-body {
          padding: 16px;
        }

        .pwa-card-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .pwa-category-label {
          min-width: 0;
          max-width: 64%;
          padding: 6px 9px;

          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;

          border-radius: 999px;

          background: var(--pwa-blue-soft);
          color: var(--pwa-blue);

          font-size: 9px;
          font-weight: 950;
          letter-spacing: 0.35px;
          text-transform: uppercase;
        }

        .pwa-supplier-label {
          min-width: 0;

          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;

          color: var(--pwa-muted);
          font-size: 9px;
          font-weight: 800;
        }

        .pwa-card-code {
          margin-top: 13px;

          color: var(--pwa-blue);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.35px;
        }

        .pwa-card-title {
          min-height: 44px;
          margin-top: 5px;

          color: var(--pwa-text);
          font-size: 15px;
          line-height: 1.35;
          font-weight: 900;
        }

        .pwa-card-scanner {
          margin-top: 9px;

          display: flex;
          align-items: center;
          gap: 7px;

          color: var(--pwa-muted);
          font-size: 10px;
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;
        }

        .pwa-card-stock {
          margin-top: 15px;
          padding: 13px 14px;

          display: grid;
          grid-template-columns:
            1fr auto;
          align-items: end;
          gap: 12px;

          border: 1px solid var(--pwa-border);
          border-radius: 12px;

          background: var(--pwa-panel-2);
        }

        .pwa-stock-main span,
        .pwa-stock-main strong,
        .pwa-stock-main small,
        .pwa-stock-min span,
        .pwa-stock-min strong {
          display: block;
        }

        .pwa-stock-main span,
        .pwa-stock-min span {
          color: var(--pwa-muted);
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }

        .pwa-stock-main strong {
          margin-top: 4px;

          color: var(--pwa-text);
          font-size: 27px;
          line-height: 1;
          font-weight: 950;
        }

        .pwa-stock-main strong em {
          margin-left: 3px;

          color: var(--pwa-muted);
          font-size: 10px;
          font-style: normal;
          font-weight: 850;
        }

        .pwa-stock-main small {
          margin-top: 5px;
          color: var(--pwa-blue);
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .pwa-stock-min {
          text-align: right;
        }

        .pwa-stock-min strong {
          margin-top: 5px;
          color: var(--pwa-text);
          font-size: 14px;
          font-weight: 900;
        }

        .pwa-card-open {
          width: 100%;
          min-height: 42px;
          margin-top: 13px;

          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;

          border: 1px solid var(--pwa-border-strong);
          border-radius: 10px;

          background: var(--pwa-blue-soft);
          color: var(--pwa-blue);

          cursor: pointer;
          font-size: 11px;
          font-weight: 900;
        }

        .pwa-empty-state {
          padding: 60px 25px;

          border: 1px dashed var(--pwa-border-strong);
          border-radius: 17px;

          background: var(--pwa-panel);
          text-align: center;
        }

        .pwa-empty-state strong,
        .pwa-empty-state span {
          display: block;
        }

        .pwa-empty-state strong {
          color: var(--pwa-text);
          font-size: 19px;
          font-weight: 950;
        }

        .pwa-empty-state span {
          margin-top: 7px;
          color: var(--pwa-muted);
          font-size: 12px;
        }

        .pwa-empty-reset {
          min-height: 42px;
          margin-top: 16px;
          padding: 0 14px;

          border: 1px solid var(--pwa-border-strong);
          border-radius: 10px;

          background: var(--pwa-blue-soft);
          color: var(--pwa-blue);

          cursor: pointer;
          font-size: 11px;
          font-weight: 900;
        }

        .pwa-photo-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;

          padding: 20px;

          display: flex;
          align-items: center;
          justify-content: center;

          background: rgba(2,8,23,0.82);
          backdrop-filter: blur(7px);
        }

        .pwa-photo-modal {
          width: min(940px,100%);
          max-height: 92vh;
          overflow-y: auto;

          border: 1px solid var(--pwa-border-strong);
          border-radius: 20px;

          background: var(--pwa-panel);
          color: var(--pwa-text);

          box-shadow:
            0 30px 80px rgba(0,0,0,0.34);
        }

        .pwa-photo-header {
          padding: 22px 24px;

          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;

          border-bottom: 1px solid var(--pwa-border);
        }

        .pwa-photo-heading-row {
          display: flex;
          align-items: center;
          gap: 9px;
          flex-wrap: wrap;
        }

        .pwa-photo-label {
          color: var(--pwa-blue);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 1.4px;
        }

        .pwa-photo-header h2 {
          margin: 7px 0 0;

          color: var(--pwa-text);
          font-size: 30px;
          font-weight: 950;
        }

        .pwa-photo-header p {
          margin: 7px 0 0;

          color: var(--pwa-muted);
          font-size: 14px;
          line-height: 1.45;
        }

        .pwa-photo-close {
          width: 42px;
          height: 42px;

          flex: 0 0 auto;

          border: 1px solid var(--pwa-border);
          border-radius: 10px;

          background: var(--pwa-panel-2);
          color: var(--pwa-text);

          cursor: pointer;
          font-size: 22px;
        }

        .pwa-modal-grid {
          padding: 20px;

          display: grid;
          grid-template-columns:
            minmax(0,1.2fr)
            minmax(280px,0.8fr);
          gap: 18px;
        }

        .pwa-photo-container {
          min-height: 420px;
          overflow: hidden;

          display: flex;
          align-items: center;
          justify-content: center;

          border: 1px solid var(--pwa-border);
          border-radius: 15px;

          background: var(--pwa-panel-2);
        }

        .pwa-photo-container img {
          width: 100%;
          max-height: 68vh;
          object-fit: contain;
        }

        .pwa-photo-unavailable {
          padding: 40px;

          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;

          color: var(--pwa-muted);
          text-align: center;
          font-size: 12px;
        }

        .pwa-modal-info {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .pwa-modal-stock {
          padding: 18px;

          border: 1px solid var(--pwa-border);
          border-radius: 15px;

          background: var(--pwa-panel-2);
        }

        .pwa-modal-stock-label {
          color: var(--pwa-muted);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.7px;
          text-transform: uppercase;
        }

        .pwa-modal-stock-value {
          margin-top: 6px;

          color: var(--pwa-text);
          font-size: 38px;
          line-height: 1;
          font-weight: 950;
        }

        .pwa-modal-stock-value span {
          margin-left: 4px;

          color: var(--pwa-muted);
          font-size: 11px;
        }

        .pwa-modal-readonly {
          margin-top: 8px;

          display: flex;
          align-items: center;
          gap: 6px;

          color: var(--pwa-blue);
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .pwa-modal-row {
          padding: 13px 14px;

          border: 1px solid var(--pwa-border);
          border-radius: 11px;

          background: var(--pwa-panel-2);
        }

        .pwa-modal-row span,
        .pwa-modal-row strong {
          display: block;
        }

        .pwa-modal-row span {
          color: var(--pwa-muted);
          font-size: 9px;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0.55px;
        }

        .pwa-modal-row strong {
          margin-top: 5px;

          color: var(--pwa-text);
          font-size: 13px;
          font-weight: 900;
          word-break: break-word;
        }

        @media (max-width: 1050px) {
          .pwa-sticky-filters {
            grid-template-columns:
              minmax(220px,1fr)
              auto
              minmax(150px,0.7fr)
              auto;
          }

          .pwa-sticky-supplier {
            display: none;
          }

          .pwa-kpi-grid {
            grid-template-columns:
              repeat(2,minmax(0,1fr));
          }

          .pwa-dashboard-hero {
            grid-template-columns:
              minmax(0,1fr) 230px;
          }
        }

        @media (max-width: 760px) {
          .pwa-sticky-filters {
            top: 62px;
            width: 100%;
            grid-template-columns:
              minmax(0,1fr)
              auto;
            padding: 8px;
          }

          .pwa-sticky-status {
            grid-column:
              1 / -1;
            overflow-x: auto;
          }

          .pwa-sticky-select,
          .pwa-sticky-reset {
            display: none;
          }

          .pwa-catalog-topbar,
          .pwa-control-top,
          .pwa-results-heading,
          .pwa-filter-bottom {
            align-items: stretch;
            flex-direction: column;
          }

          .pwa-topbar-actions {
            width: 100%;
          }

          .pwa-notes-link,
          .pwa-theme-switch {
            flex: 1;
          }

          .pwa-theme-switch button {
            flex: 1;
            justify-content: center;
          }

          .pwa-dashboard-hero {
            grid-template-columns: 1fr;
            padding: 24px;
          }

          .pwa-dashboard-hero h1 {
            font-size: 36px;
          }

          .pwa-update-button {
            width: 100%;
            min-height: 70px;
          }

          .pwa-filter-row {
            grid-template-columns: 1fr;
          }

          .pwa-filter-title {
            padding-top: 0;
          }

          .pwa-supplier-filter {
            width: 100%;
          }

          .pwa-modal-grid {
            grid-template-columns: 1fr;
          }

          .pwa-photo-container {
            min-height: 300px;
          }
        }

        @media (max-width: 520px) {
          .pwa-kpi-grid {
            grid-template-columns: 1fr;
          }

          .pwa-topbar-actions {
            flex-direction: column;
          }

          .pwa-notes-link,
          .pwa-theme-switch {
            width: 100%;
            box-sizing: border-box;
          }

          .pwa-product-grid {
            grid-template-columns: 1fr;
          }

          .pwa-control-panel {
            padding: 16px;
          }

          .pwa-search-box {
            height: 58px;
          }

          .pwa-filter-chips,
          .pwa-category-scroll {
            flex-wrap: nowrap;
            overflow-x: auto;
            padding-bottom: 5px;
          }

          .pwa-filter-chip,
          .pwa-category-chip {
            flex: 0 0 auto;
          }
        }
      `}</style>
    </>
  );
}

function ProductCard({
  item,
  supplier,
  onOpen,
}: {
  item: Item;
  supplier: Supplier | null;
  onOpen: () => void;
}) {
  const status =
    getStockStatus(item);

  return (
    <article
      className={`pwa-product-card status-${status}`}
    >
      <div className="pwa-card-image">
        <div className="pwa-card-image-fallback">
          <ImageIcon />
        </div>

        {item.image_url && (
          <img
            src={item.image_url}
            alt={item.description}
            onError={(event) => {
              event.currentTarget.style.display =
                "none";
            }}
          />
        )}

        <div className="pwa-card-status">
          <StockBadge
            status={status}
          />
        </div>
      </div>

      <div className="pwa-card-body">
        <div className="pwa-card-meta">
          <span className="pwa-category-label">
            {item.category ||
              "Altro"}
          </span>

          <span className="pwa-supplier-label">
            {supplier?.name ||
              "Fornitore"}
          </span>
        </div>

        <div className="pwa-card-code">
          {item.supplier_code ||
            item.code ||
            "Senza codice"}
        </div>

        <div className="pwa-card-title">
          {item.description ||
            "Senza descrizione"}
        </div>

        <div className="pwa-card-scanner">
          <BarcodeIcon />
          {item.code ||
            "Nessun codice scanner"}
        </div>

        <div className="pwa-card-stock">
          <div className="pwa-stock-main">
            <span>
              Giacenza
            </span>

            <strong>
              {formatPieces(
                item.stock
              )}
              <em>
                pz
              </em>
            </strong>

            <small>
              sola lettura
            </small>
          </div>

          <div className="pwa-stock-min">
            <span>
              Minimo
            </span>

            <strong>
              {formatPieces(
                item.min_stock
              )}{" "}
              pz
            </strong>
          </div>
        </div>

        <button
          type="button"
          className="pwa-card-open"
          onClick={onOpen}
        >
          Apri scheda
          <ArrowIcon />
        </button>
      </div>
    </article>
  );
}

function ItemModal({
  item,
  supplier,
  onClose,
}: {
  item: Item;
  supplier: Supplier | null;
  onClose: () => void;
}) {
  const status =
    getStockStatus(item);

  return (
    <div
      className="pwa-photo-backdrop"
      onClick={onClose}
    >
      <div
        className="pwa-photo-modal"
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <div className="pwa-photo-header">
          <div>
            <div className="pwa-photo-heading-row">
              <div className="pwa-photo-label">
                ARTICOLO
              </div>

              <StockBadge
                status={status}
              />
            </div>

            <h2>
              {item.supplier_code ||
                item.code ||
                "-"}
            </h2>

            <p>
              {item.description}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="pwa-photo-close"
            aria-label="Chiudi"
          >
            ×
          </button>
        </div>

        <div className="pwa-modal-grid">
          <div className="pwa-photo-container">
            {item.image_url ? (
              <img
                src={item.image_url}
                alt={item.description}
                onError={(event) => {
                  event.currentTarget.style.display =
                    "none";

                  const parent =
                    event.currentTarget
                      .parentElement;

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

          <div className="pwa-modal-info">
            <div className="pwa-modal-stock">
              <div className="pwa-modal-stock-label">
                Giacenza attuale
              </div>

              <div className="pwa-modal-stock-value">
                {formatPieces(
                  item.stock
                )}
                <span>
                  pz
                </span>
              </div>

              <div className="pwa-modal-readonly">
                <LockIcon />
                Solo consultazione
              </div>
            </div>

            <ModalRow
              label="Scorta minima"
              value={`${formatPieces(
                item.min_stock
              )} pz`}
            />

            <ModalRow
              label="Categoria"
              value={
                item.category ||
                "Altro"
              }
            />

            <ModalRow
              label="Fornitore"
              value={
                supplier?.name ||
                "-"
              }
            />

            <ModalRow
              label="Codice articolo"
              value={
                item.supplier_code ||
                "-"
              }
            />

            <ModalRow
              label="Codice scanner"
              value={
                item.code ||
                "-"
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  tone:
    | "neutral"
    | "warning"
    | "danger";
}) {
  return (
    <button
      type="button"
      className={`pwa-filter-chip ${tone} ${
        active ? "active" : ""
      }`}
      onClick={onClick}
    >
      {label}

      {count !== undefined && (
        <span>
          {count}
        </span>
      )}
    </button>
  );
}

function StockBadge({
  status,
}: {
  status: StockStatus;
}) {
  const label =
    status === "out"
      ? "Esaurito"
      : status === "low"
        ? "Scorta bassa"
        : status === "ok"
          ? "Disponibile"
          : "Da aggiornare";

  return (
    <span
      className={`pwa-status-badge ${status}`}
    >
      <span className="pwa-status-dot" />
      {label}
    </span>
  );
}

function ModalRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="pwa-modal-row">
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}

function EmptyState({
  title,
  text,
  onReset,
}: {
  title: string;
  text: string;
  onReset?: () => void;
}) {
  return (
    <div className="pwa-empty-state">
      <strong>
        {title}
      </strong>

      <span>
        {text}
      </span>

      {onReset && (
        <button
          type="button"
          className="pwa-empty-reset"
          onClick={onReset}
        >
          Azzera filtri
        </button>
      )}
    </div>
  );
}

function getStockStatus(
  item: Item
): StockStatus {
  if (
    item.stock === null ||
    item.stock === undefined
  ) {
    return "unknown";
  }

  const stock =
    Number(item.stock || 0);

  const minStock =
    Number(
      item.min_stock || 0
    );

  if (stock <= 0) {
    return "out";
  }

  if (
    minStock > 0 &&
    stock <= minStock
  ) {
    return "low";
  }

  return "ok";
}

function formatPieces(
  value: number | null
) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(
      Number(value)
    )
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "it-IT",
    {
      maximumFractionDigits: 0,
    }
  ).format(
    Number(value)
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

function WarehouseIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M3 10L12 4L21 10V20H3V10Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M7 20V13H17V20"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M9 16H15"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
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

function RefreshIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M20 7V3L17.5 5.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19 6C17.5 4.5 15.3 3.5 13 3.5C8.3 3.5 4.5 7.3 4.5 12"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4 17V21L6.5 18.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M5 18C6.5 19.5 8.7 20.5 11 20.5C15.7 20.5 19.5 16.7 19.5 12"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function RefreshSmallIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M20 7V3L17.5 5.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19 6C17.5 4.5 15.3 3.5 13 3.5C8.3 3.5 4.5 7.3 4.5 12"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function BarcodeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
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
        d="M19 5V19"
        stroke="currentColor"
        strokeWidth="2.5"
      />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 24 24"
      fill="none"
    >
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle
        cx="9"
        cy="9"
        r="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M6 18L11 13L14 16L17 13L20 16"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M5 12H19"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M14 7L19 12L14 17"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
    >
      <rect
        x="5"
        y="10"
        width="14"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 10V7.5C8 5.6 9.6 4 12 4C14.4 4 16 5.6 16 7.5V10"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function OfflineIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="18"
        r="1.5"
        fill="currentColor"
      />
      <path
        d="M8 14C9 12.8 10.4 12 12 12C13.6 12 15 12.8 16 14"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function BoxesIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
    >
      <rect
        x="3"
        y="5"
        width="8"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <rect
        x="13"
        y="5"
        width="8"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <rect
        x="8"
        y="14"
        width="8"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M12 4L21 20H3L12 4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 9V14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle
        cx="12"
        cy="17"
        r="1"
        fill="currentColor"
      />
    </svg>
  );
}

function EmptyBoxIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M4 8L12 4L20 8V18L12 21L4 18V8Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4.5 8L12 12L19.5 8"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 15H16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M4 5H12L20 13L13 20L5 12L4 5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle
        cx="8.5"
        cy="9"
        r="1.4"
        fill="currentColor"
      />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
    >
      <rect
        x="5"
        y="4"
        width="14"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 9H16M8 13H16M8 17H13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="4"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 2V5M12 19V22M2 12H5M19 12H22M4.9 4.9L7 7M17 17L19.1 19.1M19.1 4.9L17 7M7 17L4.9 19.1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M20 15.5C18.7 16.2 17.2 16.5 15.7 16.2C11.6 15.4 8.9 11.5 9.7 7.4C10 5.9 10.7 4.6 11.8 3.6C7.3 3.7 3.7 7.4 3.7 12C3.7 16.6 7.4 20.3 12 20.3C15.5 20.3 18.5 18.3 20 15.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
