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

    mode: "no-cors" è importante perché molte
    immagini arrivano da siti esterni.
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

    for (let index = 0; index < imageUrls.length; index++) {
      const url = imageUrls[index];

      setPhotoProgress(
        `Scaricamento fotografie: ${index + 1} / ${imageUrls.length}`
      );

      try {
        /*
          Se la foto è già presente,
          non la riscarichiamo.
        */
        const existing = await cache.match(url, {
          ignoreVary: true,
        });

        if (existing) {
          saved++;
          continue;
        }

        /*
          Richiesta NO-CORS.

          Permette di salvare anche immagini
          provenienti da siti che non consentono
          normali richieste JavaScript cross-domain.
        */
        const request = new Request(url, {
          method: "GET",
          mode: "no-cors",
          credentials: "omit",
          cache: "reload",
        });

        const response = await fetch(request);

        /*
          Una risposta "opaque" è normale
          con mode no-cors e può essere salvata
          nella Cache Storage.
        */
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
    ARTICOLI DEL FORNITORE + RICERCA
  */
  const supplierItems = useMemo(() => {
    if (!selectedSupplier) {
      return [];
    }

    const text = search.trim().toLowerCase();

    const collator = new Intl.Collator("it", {
      numeric: true,
      sensitivity: "base",
    });

    return items
      .filter(
        (item) =>
          item.supplier_id === selectedSupplier.id
      )
      .filter((item) => {
        if (!text) {
          return true;
        }

        return (
          item.supplier_code
            ?.toLowerCase()
            .includes(text) ||

          item.code
            ?.toLowerCase()
            .includes(text) ||

          item.description
            ?.toLowerCase()
            .includes(text)
        );
      })
      .sort((a, b) =>
        collator.compare(
          a.supplier_code || "",
          b.supplier_code || ""
        )
      );
  }, [items, selectedSupplier, search]);

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

  /*
    APERTURA FOTO

    NON facciamo fetch qui.

    L'immagine viene mostrata direttamente
    usando il suo URL originale.

    Se siamo offline, il service worker
    intercetta la richiesta e restituisce
    la foto salvata sul PC.
  */
  function openItemPhoto(item: Item) {
    setSelectedItem(item);
  }

  function closePhoto() {
    setSelectedItem(null);
  }

  function goBackToSuppliers() {
    setSelectedSupplier(null);
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
          marginBottom: 28,
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

      {!selectedSupplier ? (
        <>
          {/* FORNITORI */}

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
                    setSelectedSupplier(supplier);
                    setSearch("");
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
                    {supplierCounts[supplier.id] || 0}{" "}
                    articoli
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* FORNITORE SELEZIONATO */}

          <button
            type="button"
            onClick={goBackToSuppliers}
            style={{
              marginBottom: 18,
              padding: 0,
              border: 0,
              background: "transparent",
              color: "var(--foreground)",
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
              {
                items.filter(
                  (item) =>
                    item.supplier_id ===
                    selectedSupplier.id
                ).length
              }{" "}
              articoli
            </div>
          </div>

          {/* RICERCA */}

          <div
            style={{
              marginBottom: 18,
              padding: 14,

              border:
                "1px solid var(--border-color)",

              background:
                "var(--card)",

              borderRadius: 12,
            }}
          >
            <input
              autoFocus
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Cerca codice articolo, codice scanner o descrizione..."
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "14px 16px",
                borderRadius: 9,

                border:
                  "1px solid var(--border-color)",

                background:
                  "var(--input-bg)",

                color:
                  "var(--foreground)",

                fontSize: 16,
                outline: "none",
              }}
            />

            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                opacity: 0.55,
              }}
            >
              {supplierItems.length} risultati
            </div>
          </div>

          {/* TABELLA */}

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
                        Nessun articolo trovato.
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
                        {/* CODICE ARTICOLO */}

                        <td style={cellStyle}>
                          <button
                            type="button"
                            onClick={() =>
                              openItemPhoto(item)
                            }
                            style={{
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
                            }}
                          >
                            {item.supplier_code || "-"}
                          </button>
                        </td>

                        {/* SCANNER */}

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

                        {/* DESCRIZIONE */}

                        <td style={cellStyle}>
                          {item.description || "-"}
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
            {/* TESTATA FOTO */}

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
                  {selectedItem.supplier_code || "-"}
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
                  {selectedItem.code || "-"}
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

            {/* FOTO */}

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
                  src={selectedItem.image_url}
                  alt={selectedItem.description}
                  style={{
                    display: "block",
                    width: "100%",
                    maxHeight: "65vh",
                    objectFit: "contain",
                  }}
                  onError={(event) => {
                    const image =
                      event.currentTarget;

                    image.style.display = "none";

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