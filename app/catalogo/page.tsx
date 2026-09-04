"use client";

import { useEffect, useMemo, useState } from "react";
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

const STORAGE_KEY = "magazzino_catalogo_offline";

/*
  Deve essere uguale al nome usato
  dentro public/sw.js
*/
const IMAGE_CACHE = "catalogo-magazzino-v2-images";

export default function CatalogoPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [selectedSupplier, setSelectedSupplier] =
    useState<Supplier | null>(null);

  /*
    RICERCA GLOBALE

    Cerca sempre dentro TUTTO il catalogo,
    indipendentemente dal fornitore aperto.
  */
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [lastUpdate, setLastUpdate] = useState("");

  const [selectedItem, setSelectedItem] =
    useState<Item | null>(null);

  const [message, setMessage] = useState("");
  const [photoProgress, setPhotoProgress] = useState("");

  useEffect(() => {
    loadLocalCatalog();
  }, []);

  /*
    LEGGE IL CATALOGO GIÀ SALVATO SUL PC
  */
  function loadLocalCatalog() {
    setLoading(true);

    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const parsed: CatalogData = JSON.parse(saved);

        setSuppliers(parsed.suppliers || []);
        setItems(parsed.items || []);
        setLastUpdate(parsed.updatedAt || "");
      }
    } catch (error) {
      console.error(
        "Errore lettura catalogo locale:",
        error
      );
    }

    setLoading(false);
  }

  /*
    AGGIORNA TUTTO IL CATALOGO

    1. scarica fornitori
    2. scarica articoli
    3. salva i dati sul PC
    4. scarica le fotografie
  */
  async function updateCatalog() {
    setUpdating(true);
    setMessage("");
    setPhotoProgress("");

    try {
      const { data: suppliersData, error: suppliersError } =
        await supabase
          .from("suppliers")
          .select("id,name")
          .order("name");

      if (suppliersError) {
        throw new Error(suppliersError.message);
      }

      const { data: itemsData, error: itemsError } =
        await supabase
          .from("items")
          .select(
            "id,supplier_id,code,supplier_code,description,image_url"
          )
          .order("description");

      if (itemsError) {
        throw new Error(itemsError.message);
      }

      const cleanSuppliers: Supplier[] =
        (suppliersData || []).map((supplier) => ({
          id: String(supplier.id),
          name: String(supplier.name || ""),
        }));

      const cleanItems: Item[] =
        (itemsData || []).map((item) => ({
          id: String(item.id),

          supplier_id: String(item.supplier_id),

          code: String(item.code || ""),

          supplier_code: item.supplier_code
            ? String(item.supplier_code)
            : null,

          description: String(
            item.description || ""
          ),

          image_url: item.image_url
            ? String(item.image_url)
            : null,
        }));

      const updatedAt = new Date().toISOString();

      const catalog: CatalogData = {
        suppliers: cleanSuppliers,
        items: cleanItems,
        updatedAt,
      };

      /*
        SALVIAMO I DATI TESTUALI
        SUL PC DEL MAGAZZINIERE
      */
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(catalog)
      );

      setSuppliers(cleanSuppliers);
      setItems(cleanItems);
      setLastUpdate(updatedAt);

      /*
        ORA SALVIAMO LE FOTO
      */
      const photoResult =
        await downloadAllPhotos(cleanItems);

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

  /*
    SCARICA FISICAMENTE LE FOTO NELLA CACHE
  */
  async function downloadAllPhotos(allItems: Item[]) {
    if (!("caches" in window)) {
      return {
        saved: 0,
        failed: 0,
      };
    }

    const imageUrls = Array.from(
      new Set(
        allItems
          .map((item) => item.image_url?.trim())
          .filter(
            (url): url is string =>
              typeof url === "string" &&
              url.length > 0
          )
      )
    );

    if (imageUrls.length === 0) {
      return {
        saved: 0,
        failed: 0,
      };
    }

    const cache = await caches.open(IMAGE_CACHE);

    let saved = 0;
    let failed = 0;

    for (
      let index = 0;
      index < imageUrls.length;
      index++
    ) {
      const url = imageUrls[index];

      setPhotoProgress(
        `Scaricamento fotografie: ${index + 1} / ${imageUrls.length}`
      );

      try {
        const existing = await cache.match(url, {
          ignoreVary: true,
        });

        if (existing) {
          saved++;
          continue;
        }

        const request = new Request(url, {
          method: "GET",
          mode: "no-cors",
          credentials: "omit",
          cache: "reload",
        });

        const response = await fetch(request);

        if (
          response.ok ||
          response.type === "opaque"
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

  /*
    MAPPA FORNITORI

    Serve per sapere subito a quale fornitore
    appartiene ogni articolo.
  */
  const supplierMap = useMemo(() => {
    const map = new Map<string, Supplier>();

    suppliers.forEach((supplier) => {
      map.set(supplier.id, supplier);
    });

    return map;
  }, [suppliers]);

  /*
    RICERCA GLOBALE

    Cerca:
    - codice articolo fornitore
    - codice scanner
    - descrizione

    SU TUTTI I FORNITORI.
  */
  const globalSearchResults = useMemo(() => {
    const text =
      search.trim().toLowerCase();

    if (!text) {
      return [];
    }

    const collator = new Intl.Collator("it", {
      numeric: true,
      sensitivity: "base",
    });

    return items
      .filter((item) => {
        return (
          item.supplier_code
            ?.toLowerCase()
            .includes(text) ||

          item.code
            .toLowerCase()
            .includes(text) ||

          item.description
            .toLowerCase()
            .includes(text)
        );
      })
      .sort((a, b) => {
        const supplierA =
          supplierMap.get(a.supplier_id)?.name || "";

        const supplierB =
          supplierMap.get(b.supplier_id)?.name || "";

        const supplierCompare =
          collator.compare(
            supplierA,
            supplierB
          );

        if (supplierCompare !== 0) {
          return supplierCompare;
        }

        return collator.compare(
          a.supplier_code || a.code,
          b.supplier_code || b.code
        );
      });
  }, [items, search, supplierMap]);

  /*
    RISULTATI GLOBALI RAGGRUPPATI
    PER FORNITORE
  */
  const groupedGlobalResults = useMemo(() => {
    const groups = new Map<
      string,
      {
        supplier: Supplier;
        items: Item[];
      }
    >();

    globalSearchResults.forEach((item) => {
      const supplier =
        supplierMap.get(item.supplier_id);

      if (!supplier) {
        return;
      }

      const existing =
        groups.get(supplier.id);

      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(supplier.id, {
          supplier,
          items: [item],
        });
      }
    });

    return Array.from(groups.values());
  }, [globalSearchResults, supplierMap]);

  /*
    ARTICOLI DEL FORNITORE SELEZIONATO

    Qui NON usiamo la ricerca globale.
    Quando la barra di ricerca è vuota,
    mostriamo tutti gli articoli del fornitore.
  */
  const supplierItems = useMemo(() => {
    if (!selectedSupplier) {
      return [];
    }

    const collator = new Intl.Collator("it", {
      numeric: true,
      sensitivity: "base",
    });

    return items
      .filter(
        (item) =>
          item.supplier_id === selectedSupplier.id
      )
      .sort((a, b) =>
        collator.compare(
          a.supplier_code || "",
          b.supplier_code || ""
        )
      );
  }, [items, selectedSupplier]);

  /*
    CONTEGGIO ARTICOLI PER FORNITORE
  */
  const supplierCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    items.forEach((item) => {
      counts[item.supplier_id] =
        (counts[item.supplier_id] || 0) + 1;
    });

    return counts;
  }, [items]);

  function openItemPhoto(item: Item) {
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
      <div style={pageStyle}>
        <div style={{ opacity: 0.6 }}>
          Caricamento catalogo...
        </div>
      </div>
    );
  }

  const isSearching =
    search.trim().length > 0;

  return (
    <div style={pageStyle}>
      {/* TESTATA */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 20,
          flexWrap: "wrap",
          marginBottom: 22,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 1.3,
              opacity: 0.5,
              textTransform: "uppercase",
              marginBottom: 5,
            }}
          >
            Catalogo offline
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: "-0.7px",
            }}
          >
            Catalogo Magazzino
          </h1>

          <div
            style={{
              marginTop: 7,
              fontSize: 14,
              opacity: 0.6,
            }}
          >
            {lastUpdate
              ? `Ultimo aggiornamento: ${formatDateTime(
                  lastUpdate
                )}`
              : "Catalogo non ancora aggiornato"}
          </div>
        </div>

        <button
          type="button"
          onClick={updateCatalog}
          disabled={updating}
          style={{
            padding: "13px 20px",
            borderRadius: 10,

            border:
              "1px solid var(--foreground)",

            background:
              "var(--foreground)",

            color:
              "var(--background)",

            cursor: updating
              ? "not-allowed"
              : "pointer",

            fontWeight: 850,
            fontSize: 14,

            opacity: updating ? 0.5 : 1,
          }}
        >
          {updating
            ? "Aggiornamento..."
            : "↻ Aggiorna magazzino"}
        </button>
      </div>

      {/* RICERCA GLOBALE */}

      <div
        style={{
          marginBottom: 22,
          padding: 16,

          border:
            "1px solid var(--border-color)",

          background:
            "var(--card)",

          borderRadius: 14,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 850,
            marginBottom: 8,
          }}
        >
          Cerca in tutto il magazzino
        </div>

        <div
          style={{
            position: "relative",
          }}
        >
          <input
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder="Cerca codice articolo, codice scanner o descrizione..."
            style={{
              width: "100%",
              boxSizing: "border-box",

              padding: search
                ? "15px 50px 15px 16px"
                : "15px 16px",

              borderRadius: 10,

              border:
                "1px solid var(--border-color)",

              background:
                "var(--input-bg)",

              color:
                "var(--foreground)",

              fontSize: 17,
              fontWeight: 650,

              outline: "none",
            }}
          />

          {search && (
            <button
              type="button"
              onClick={clearSearch}
              title="Cancella ricerca"
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform:
                  "translateY(-50%)",

                width: 34,
                height: 34,

                display: "flex",
                alignItems: "center",
                justifyContent: "center",

                borderRadius: 8,

                border:
                  "1px solid var(--border-color)",

                background:
                  "var(--card)",

                color:
                  "var(--foreground)",

                cursor: "pointer",

                fontSize: 18,
                fontWeight: 900,
              }}
            >
              ×
            </button>
          )}
        </div>

        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            opacity: 0.55,
          }}
        >
          {isSearching
            ? `${globalSearchResults.length} articoli trovati in ${groupedGlobalResults.length} fornitori`
            : `${items.length} articoli disponibili offline`}
        </div>
      </div>

      {/* PROGRESSO FOTO */}

      {photoProgress && (
        <div
          style={{
            marginBottom: 15,
            padding: "12px 15px",
            borderRadius: 9,

            border:
              "1px solid rgba(59,130,246,0.4)",

            background:
              "rgba(59,130,246,0.10)",

            fontSize: 13,
            fontWeight: 750,
          }}
        >
          {photoProgress}
        </div>
      )}

      {/* MESSAGGIO */}

      {message && (
        <div
          style={{
            marginBottom: 20,
            padding: "12px 15px",
            borderRadius: 9,

            border:
              "1px solid var(--border-color)",

            background:
              "var(--card)",

            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {message}
        </div>
      )}

      {/* =====================================================
          RICERCA GLOBALE
      ===================================================== */}

      {isSearching ? (
        <>
          <div
            style={{
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
              }}
            >
              Risultati ricerca
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 13,
                opacity: 0.55,
              }}
            >
              Ricerca effettuata su tutti i fornitori
            </div>
          </div>

          {globalSearchResults.length === 0 ? (
            <div style={emptyStyle}>
              <div
                style={{
                  fontSize: 19,
                  fontWeight: 850,
                  marginBottom: 7,
                }}
              >
                Nessun articolo trovato
              </div>

              <div
                style={{
                  fontSize: 14,
                  opacity: 0.6,
                }}
              >
                Prova con un altro codice o una parte
                della descrizione.
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              {groupedGlobalResults.map(
                (group) => (
                  <div
                    key={group.supplier.id}
                    style={{
                      border:
                        "1px solid var(--border-color)",

                      borderRadius: 13,

                      overflow: "hidden",

                      background:
                        "var(--card)",
                    }}
                  >
                    {/* FORNITORE */}

                    <div
                      style={{
                        padding:
                          "14px 17px",

                        display: "flex",

                        alignItems: "center",

                        justifyContent:
                          "space-between",

                        gap: 15,

                        background:
                          "var(--table-head)",

                        borderBottom:
                          "1px solid var(--border-color)",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 900,
                          }}
                        >
                          {group.supplier.name}
                        </div>

                        <div
                          style={{
                            marginTop: 3,
                            fontSize: 11,
                            opacity: 0.5,
                          }}
                        >
                          {group.items.length}{" "}
                          {group.items.length === 1
                            ? "risultato"
                            : "risultati"}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSearch("");
                          setSelectedSupplier(
                            group.supplier
                          );
                        }}
                        style={smallButtonStyle}
                      >
                        Apri fornitore
                      </button>
                    </div>

                    {/* RISULTATI */}

                    <div
                      style={{
                        overflowX: "auto",
                      }}
                    >
                      <table
                        style={{
                          width: "100%",
                          minWidth: 850,

                          borderCollapse:
                            "collapse",
                        }}
                      >
                        <thead>
                          <tr>
                            <th style={headerStyle}>
                              Codice articolo
                            </th>

                            <th style={headerStyle}>
                              Codice scanner
                            </th>

                            <th style={headerStyle}>
                              Descrizione
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {group.items.map(
                            (item) => (
                              <tr
                                key={item.id}
                                style={{
                                  borderBottom:
                                    "1px solid var(--border-color)",
                                }}
                              >
                                <td style={cellStyle}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openItemPhoto(
                                        item
                                      )
                                    }
                                    style={articleButtonStyle}
                                  >
                                    {item.supplier_code ||
                                      "-"}
                                  </button>
                                </td>

                                <td style={cellStyle}>
                                  <span
                                    style={{
                                      fontFamily:
                                        "monospace",

                                      fontWeight: 750,
                                    }}
                                  >
                                    {item.code || "-"}
                                  </span>
                                </td>

                                <td style={cellStyle}>
                                  {item.description ||
                                    "-"}
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </>
      ) : !selectedSupplier ? (
        <>
          {/* =================================================
              FORNITORI
          ================================================= */}

          <div
            style={{
              fontSize: 18,
              fontWeight: 850,
              marginBottom: 13,
            }}
          >
            Fornitori
          </div>

          {suppliers.length === 0 ? (
            <div style={emptyStyle}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  marginBottom: 8,
                }}
              >
                Catalogo vuoto
              </div>

              <div
                style={{
                  fontSize: 14,
                  opacity: 0.6,
                }}
              >
                Collega il PC a Internet e premi
                “Aggiorna magazzino”.
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",

                gridTemplateColumns:
                  "repeat(auto-fill, minmax(250px, 1fr))",

                gap: 14,
              }}
            >
              {suppliers.map((supplier) => (
                <button
                  key={supplier.id}
                  type="button"
                  onClick={() => {
                    setSelectedSupplier(
                      supplier
                    );
                  }}
                  style={{
                    textAlign: "left",
                    padding: 20,
                    borderRadius: 12,

                    border:
                      "1px solid var(--border-color)",

                    background:
                      "var(--card)",

                    color:
                      "var(--foreground)",

                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 850,
                    }}
                  >
                    {supplier.name}
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      opacity: 0.55,
                    }}
                  >
                    {supplierCounts[
                      supplier.id
                    ] || 0}{" "}
                    articoli
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* =================================================
              FORNITORE SELEZIONATO
          ================================================= */}

          <button
            type="button"
            onClick={goBackToSuppliers}
            style={{
              marginBottom: 18,
              padding: 0,
              border: 0,

              background:
                "transparent",

              color:
                "var(--foreground)",

              cursor: "pointer",

              fontWeight: 750,
              fontSize: 14,
            }}
          >
            ← Torna ai fornitori
          </button>

          <div
            style={{
              marginBottom: 18,
            }}
          >
            <h2
              style={{
                margin: 0,

                fontSize: 30,

                fontWeight: 900,
              }}
            >
              {selectedSupplier.name}
            </h2>

            <div
              style={{
                marginTop: 5,

                opacity: 0.55,

                fontSize: 13,
              }}
            >
              {supplierItems.length} articoli
            </div>
          </div>

          {/* TABELLA FORNITORE */}

          <div
            style={{
              border:
                "1px solid var(--border-color)",

              borderRadius: 12,

              overflow: "hidden",

              background:
                "var(--card)",
            }}
          >
            <div
              style={{
                overflowX: "auto",
              }}
            >
              <table
                style={{
                  width: "100%",

                  minWidth: 760,

                  borderCollapse:
                    "collapse",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background:
                        "var(--table-head)",
                    }}
                  >
                    <th style={headerStyle}>
                      Codice articolo
                    </th>

                    <th style={headerStyle}>
                      Codice scanner
                    </th>

                    <th style={headerStyle}>
                      Descrizione
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {supplierItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        style={tableEmptyStyle}
                      >
                        Nessun articolo presente.
                      </td>
                    </tr>
                  ) : (
                    supplierItems.map((item) => (
                      <tr
                        key={item.id}
                        style={{
                          borderBottom:
                            "1px solid var(--border-color)",
                        }}
                      >
                        <td style={cellStyle}>
                          <button
                            type="button"
                            onClick={() =>
                              openItemPhoto(item)
                            }
                            style={articleButtonStyle}
                          >
                            {item.supplier_code ||
                              "-"}
                          </button>
                        </td>

                        <td style={cellStyle}>
                          <span
                            style={{
                              fontFamily:
                                "monospace",

                              fontWeight: 700,
                            }}
                          >
                            {item.code || "-"}
                          </span>
                        </td>

                        <td style={cellStyle}>
                          {item.description ||
                            "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* FINESTRA FOTO */}

      {selectedItem && (
        <div
          onClick={closePhoto}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,

            background:
              "rgba(0,0,0,0.78)",

            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            padding: 20,
          }}
        >
          <div
            onClick={(e) =>
              e.stopPropagation()
            }
            style={{
              width: "100%",
              maxWidth: 900,
              maxHeight: "92vh",
              overflowY: "auto",

              borderRadius: 16,
              padding: 22,

              background:
                "var(--background)",

              color:
                "var(--foreground)",

              border:
                "1px solid var(--border-color)",
            }}
          >
            <div
              style={{
                display: "flex",

                justifyContent:
                  "space-between",

                gap: 20,

                marginBottom: 18,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                  }}
                >
                  {selectedItem.supplier_code ||
                    "-"}
                </div>

                <div
                  style={{
                    marginTop: 6,
                    fontSize: 15,
                    opacity: 0.7,
                  }}
                >
                  {selectedItem.description}
                </div>

                <div
                  style={{
                    marginTop: 5,
                    fontSize: 13,
                    opacity: 0.5,
                  }}
                >
                  Scanner:{" "}
                  {selectedItem.code ||
                    "-"}
                </div>
              </div>

              <button
                type="button"
                onClick={closePhoto}
                style={{
                  width: 40,
                  height: 40,
                  flexShrink: 0,

                  borderRadius: 9,

                  border:
                    "1px solid var(--border-color)",

                  background:
                    "var(--card)",

                  color:
                    "var(--foreground)",

                  cursor: "pointer",

                  fontSize: 20,
                  fontWeight: 900,
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                minHeight: 350,

                display: "flex",
                alignItems: "center",
                justifyContent: "center",

                borderRadius: 12,

                border:
                  "1px solid var(--border-color)",

                background:
                  "var(--card)",

                overflow: "hidden",
              }}
            >
              {selectedItem.image_url ? (
                <img
                  src={
                    selectedItem.image_url
                  }
                  alt={
                    selectedItem.description
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    maxHeight: "65vh",
                    objectFit: "contain",
                  }}
                  onError={(event) => {
                    const image =
                      event.currentTarget;

                    image.style.display =
                      "none";

                    const parent =
                      image.parentElement;

                    if (parent) {
                      parent.innerHTML =
                        '<div style="padding:30px;opacity:.55;text-align:center">Foto non disponibile offline</div>';
                    }
                  }}
                />
              ) : (
                <div
                  style={{
                    textAlign: "center",
                    padding: 30,
                    opacity: 0.55,
                  }}
                >
                  Foto non disponibile
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- UTILITÀ ---------------- */

function formatDateTime(value: string) {
  if (!value) {
    return "-";
  }

  try {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

/* ---------------- STILI ---------------- */

const pageStyle = {
  width: "100%",
  maxWidth: 1500,
  margin: "0 auto",
};

const headerStyle = {
  padding: "14px 16px",

  textAlign:
    "left" as const,

  fontSize: 12,

  fontWeight: 850,

  textTransform:
    "uppercase" as const,

  letterSpacing: 0.6,

  opacity: 0.65,

  whiteSpace:
    "nowrap" as const,
};

const cellStyle = {
  padding: "15px 16px",

  fontSize: 15,

  verticalAlign:
    "middle" as const,
};

const emptyStyle = {
  padding: 40,

  border:
    "1px solid var(--border-color)",

  borderRadius: 12,

  background:
    "var(--card)",

  textAlign:
    "center" as const,
};

const tableEmptyStyle = {
  padding: 45,

  textAlign:
    "center" as const,

  opacity: 0.55,
};

const articleButtonStyle = {
  padding: 0,

  border: 0,

  background:
    "transparent",

  color:
    "var(--foreground)",

  cursor: "pointer",

  fontWeight: 900,

  textDecoration:
    "underline",

  textUnderlineOffset: 3,

  fontSize: 15,
};

const smallButtonStyle = {
  padding:
    "8px 11px",

  borderRadius: 8,

  border:
    "1px solid var(--border-color)",

  background:
    "var(--input-bg)",

  color:
    "var(--foreground)",

  cursor: "pointer",

  fontWeight: 800,

  fontSize: 11,
};