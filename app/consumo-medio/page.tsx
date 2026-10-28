"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

type ItemRow = {
  id: string;
  code: string;
  supplier_code: string | null;
  description: string | null;
  stock: number;
  supplier_id: string | null;
};

type Supplier = {
  id: string;
  name: string;
};

type ConsumptionSummaryRow = {
  code: string;
  total_qty: number;
  first_movement_date: string | null;
  movement_count: number;
};

type ConsumptionRow = {
  id: string;
  code: string;
  supplierCode: string | null;
  description: string;
  stock: number;
  supplierName: string;
  totalQty: number | null;
  firstMovementDate: string | null;
  movementCount: number;
  monthsElapsed: number | null;
  monthlyAverage: number | null;
};

type SupplierGroup = {
  name: string;
  rows: ConsumptionRow[];
  withHistoryCount: number;
  totalMonthly: number;
  totalScaricato: number;
};

type SortKey = "monthlyAverage" | "totalQty" | "stock" | "description";

type PriceIncreaseResult = {
  pct: number;
  totalOld: number;
  totalNew: number;
  itemsConsidered: number;
  itemsWithoutHistory: number;
};

/*
  Mesi trascorsi dal primo scarico (incluso) a oggi (incluso),
  minimo 1 mese anche se il primo e unico scarico e' di questo
  stesso mese.
*/
function monthsElapsedSince(firstDateStr: string) {
  const first = new Date(firstDateStr + "T00:00:00");
  const today = new Date();

  const months =
    (today.getFullYear() - first.getFullYear()) * 12 +
    (today.getMonth() - first.getMonth()) +
    1;

  return Math.max(1, months);
}

export default function AverageConsumptionPage() {
  const [rows, setRows] = useState<ConsumptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [search, setSearch] = useState("");
  const [onlyWithHistory, setOnlyWithHistory] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("monthlyAverage");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(
    new Set()
  );

  const [canViewPrices, setCanViewPrices] = useState(false);

  /*
    Aumento prezzi complessivo (STEP 59): calcolato solo quando
    l'utente apre il pannello, non al caricamento della pagina,
    perche' serve leggere lo storico prezzi di tutti gli articoli.
  */
  const [priceIncreaseOpen, setPriceIncreaseOpen] = useState(false);
  const [priceIncreaseLoading, setPriceIncreaseLoading] = useState(false);
  const [priceIncreaseLoaded, setPriceIncreaseLoaded] = useState(false);
  const [priceIncreaseError, setPriceIncreaseError] = useState("");
  const [priceIncreaseResult, setPriceIncreaseResult] =
    useState<PriceIncreaseResult | null>(null);

  useEffect(() => {
    loadReport();
  }, []);

  async function loadReport() {
    setLoading(true);
    setErrorMessage("");

    const role = localStorage.getItem("magazzino_role");
    const savedPermissions = localStorage.getItem("magazzino_permissions");

    let permissions: { view_prices?: boolean } = {};

    try {
      permissions = savedPermissions ? JSON.parse(savedPermissions) : {};
    } catch {
      permissions = {};
    }

    setCanViewPrices(role === "admin" || permissions.view_prices === true);

    const [itemsResult, suppliersResult, consumptionResult] =
      await Promise.all([
        supabase
          .from("items")
          .select("id,code,supplier_code,description,stock,supplier_id")
          .order("description"),
        supabase.from("suppliers").select("id,name").order("name"),
        supabase.rpc("get_item_consumption_summary"),
      ]);

    if (itemsResult.error) {
      setErrorMessage(itemsResult.error.message);
      setLoading(false);
      return;
    }

    if (suppliersResult.error) {
      setErrorMessage(suppliersResult.error.message);
      setLoading(false);
      return;
    }

    if (consumptionResult.error) {
      setErrorMessage(
        "Errore nel calcolo del consumo: " +
          consumptionResult.error.message
      );
      setLoading(false);
      return;
    }

    const items = (itemsResult.data || []) as ItemRow[];
    const suppliers = (suppliersResult.data || []) as Supplier[];

    const consumptionByCode = new Map<string, ConsumptionSummaryRow>();

    ((consumptionResult.data || []) as ConsumptionSummaryRow[]).forEach(
      (row) => {
        if (row.code) {
          consumptionByCode.set(row.code, row);
        }
      }
    );

    const supplierNameById = new Map(
      suppliers.map((supplier) => [supplier.id, supplier.name])
    );

    const builtRows: ConsumptionRow[] = items.map((item) => {
      const consumption = item.code
        ? consumptionByCode.get(item.code)
        : undefined;

      const totalQty = consumption
        ? Number(consumption.total_qty || 0)
        : null;

      const firstMovementDate = consumption
        ? consumption.first_movement_date
        : null;

      const monthsElapsed =
        totalQty !== null && firstMovementDate
          ? monthsElapsedSince(firstMovementDate)
          : null;

      const monthlyAverage =
        totalQty !== null && monthsElapsed
          ? totalQty / monthsElapsed
          : null;

      return {
        id: String(item.id),
        code: item.code || "",
        supplierCode: item.supplier_code || null,
        description: item.description || "Senza descrizione",
        stock: Number(item.stock || 0),
        supplierName: item.supplier_id
          ? supplierNameById.get(item.supplier_id) || "Fornitore sconosciuto"
          : "Fornitore sconosciuto",
        totalQty,
        firstMovementDate,
        movementCount: consumption ? consumption.movement_count : 0,
        monthsElapsed,
        monthlyAverage,
      };
    });

    setRows(builtRows);
    setLoading(false);
  }

  const filteredRows = useMemo(() => {
    const text = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch =
        !text ||
        row.description.toLowerCase().includes(text) ||
        row.code.toLowerCase().includes(text) ||
        (row.supplierCode || "").toLowerCase().includes(text) ||
        row.supplierName.toLowerCase().includes(text);

      const matchesHistory = !onlyWithHistory || row.totalQty !== null;

      return matchesSearch && matchesHistory;
    });
  }, [rows, search, onlyWithHistory]);

  const sortedRows = useMemo(() => {
    const direction = sortDir === "asc" ? 1 : -1;

    /*
      Confronto scritto con rami espliciti per ogni chiave (invece di
      un accesso generico a[sortKey]) per restare su tipi semplici e
      sicuri: stringa contro stringa, numero contro numero.
    */
    function compareNullableNumbers(
      aValue: number | null,
      bValue: number | null
    ) {
      // Gli articoli senza alcun consumo registrato (null) vanno
      // sempre in fondo, indipendentemente dalla direzione scelta.
      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return 1;
      if (bValue === null) return -1;

      return direction * (aValue - bValue);
    }

    return [...filteredRows].sort((a, b) => {
      if (sortKey === "description") {
        return direction * a.description.localeCompare(b.description, "it");
      }

      if (sortKey === "stock") {
        return direction * (a.stock - b.stock);
      }

      if (sortKey === "totalQty") {
        return compareNullableNumbers(a.totalQty, b.totalQty);
      }

      return compareNullableNumbers(a.monthlyAverage, b.monthlyAverage);
    });
  }, [filteredRows, sortKey, sortDir]);

  /*
    RAGGRUPPAMENTO PER FORNITORE

    I fornitori con almeno un articolo con storico di consumo vengono
    mostrati per primi, ordinati dal più "attivo" (media mensile
    totale più alta) al meno attivo. I fornitori senza nessuno
    storico vanno in fondo, in ordine alfabetico: cosi' la pagina
    apre subito sui fornitori rilevanti invece che su un elenco
    piatto di 700+ articoli.
  */
  const groups = useMemo<SupplierGroup[]>(() => {
    const bySupplier = new Map<string, ConsumptionRow[]>();

    sortedRows.forEach((row) => {
      const list = bySupplier.get(row.supplierName) || [];
      list.push(row);
      bySupplier.set(row.supplierName, list);
    });

    const built = Array.from(bySupplier.entries()).map(([name, list]) => {
      const withHistory = list.filter((row) => row.totalQty !== null);

      return {
        name,
        rows: list,
        withHistoryCount: withHistory.length,
        totalMonthly: withHistory.reduce(
          (sum, row) => sum + (row.monthlyAverage || 0),
          0
        ),
        totalScaricato: withHistory.reduce(
          (sum, row) => sum + (row.totalQty || 0),
          0
        ),
      };
    });

    built.sort((a, b) => {
      if (a.withHistoryCount === 0 && b.withHistoryCount === 0) {
        return a.name.localeCompare(b.name, "it");
      }

      if (a.withHistoryCount === 0) return 1;
      if (b.withHistoryCount === 0) return -1;

      return b.totalMonthly - a.totalMonthly;
    });

    return built;
  }, [sortedRows]);

  const isSearching = search.trim().length > 0;

  const totals = useMemo(() => {
    const withHistory = rows.filter((row) => row.totalQty !== null);

    const totalScaricato = withHistory.reduce(
      (sum, row) => sum + (row.totalQty || 0),
      0
    );

    return {
      totalItems: rows.length,
      totalSuppliers: new Set(rows.map((row) => row.supplierName)).size,
      withHistory: withHistory.length,
      withoutHistory: rows.length - withHistory.length,
      totalScaricato,
    };
  }, [rows]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function toggleSupplier(name: string) {
    setExpandedSuppliers((prev) => {
      const next = new Set(prev);

      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }

      return next;
    });
  }

  function expandAll() {
    setExpandedSuppliers(new Set(groups.map((group) => group.name)));
  }

  function collapseAll() {
    setExpandedSuppliers(new Set());
  }

  function formatNumber(value: number, decimals = 2) {
    return new Intl.NumberFormat("it-IT", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  function formatDate(value: string) {
    return new Date(value + "T00:00:00").toLocaleDateString("it-IT");
  }

  function formatEuro(value: number) {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  /*
    AUMENTO PREZZI COMPLESSIVO

    Media pesata sul valore: sommo tutte le variazioni in euro e le
    divido per la somma dei prezzi di partenza, cosi' gli articoli
    piu' costosi pesano di piu' sul risultato (impatto reale sulla
    spesa, non solo conteggio articoli).

    Il prezzo di partenza di ogni articolo e' il primo prezzo mai
    registrato diverso da 0: se la primissima riga di storico parte
    da 0 (prezzo sconosciuto messo per la prima volta, es. 0 -> 45),
    quella riga non conta come aumento e uso 45 come base; eventuali
    variazioni successive (es. 45 -> 50) contano normalmente.
    Gli articoli senza nessuno storico prezzi non entrano nel calcolo.
  */
  async function togglePriceIncrease() {
    const opening = !priceIncreaseOpen;
    setPriceIncreaseOpen(opening);

    if (!opening || priceIncreaseLoaded) return;

    setPriceIncreaseLoading(true);
    setPriceIncreaseError("");

    const [historyResult, itemsResult] = await Promise.all([
      supabase
        .from("item_price_history")
        .select("item_id,old_price,new_price,changed_at")
        .order("changed_at", { ascending: true }),
      supabase.from("items").select("id,price"),
    ]);

    if (historyResult.error) {
      setPriceIncreaseError(
        "Errore caricamento storico prezzi: " + historyResult.error.message
      );
      setPriceIncreaseLoading(false);
      return;
    }

    if (itemsResult.error) {
      setPriceIncreaseError(
        "Errore caricamento prezzi attuali: " + itemsResult.error.message
      );
      setPriceIncreaseLoading(false);
      return;
    }

    const historyRows = (historyResult.data || []) as {
      item_id: string;
      old_price: number | string | null;
      new_price: number | string | null;
    }[];

    const currentPriceById = new Map<string, number>();

    (
      (itemsResult.data || []) as { id: string; price: number | null }[]
    ).forEach((item) => {
      currentPriceById.set(String(item.id), Number(item.price || 0));
    });

    const baselineByItem = new Map<string, number>();

    historyRows.forEach((row) => {
      const itemId = String(row.item_id);

      // Tengo solo la primissima riga di storico di ogni articolo
      // (le righe arrivano gia' ordinate per data crescente).
      if (baselineByItem.has(itemId)) return;

      const oldPrice = row.old_price === null ? 0 : Number(row.old_price);
      const newPrice = Number(row.new_price || 0);

      baselineByItem.set(itemId, oldPrice > 0 ? oldPrice : newPrice);
    });

    let totalOld = 0;
    let totalNew = 0;
    let itemsConsidered = 0;

    baselineByItem.forEach((baseline, itemId) => {
      if (baseline <= 0) return;

      const currentPrice = currentPriceById.get(itemId);
      if (currentPrice === undefined) return;

      totalOld += baseline;
      totalNew += currentPrice;
      itemsConsidered += 1;
    });

    const pct = totalOld > 0 ? ((totalNew - totalOld) / totalOld) * 100 : 0;

    setPriceIncreaseResult({
      pct,
      totalOld,
      totalNew,
      itemsConsidered,
      itemsWithoutHistory: currentPriceById.size - baselineByItem.size,
    });

    setPriceIncreaseLoaded(true);
    setPriceIncreaseLoading(false);
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1500,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          marginBottom: 26,
        }}
      >
        <div
          style={{
            fontSize: 13,
            opacity: 0.55,
            marginBottom: 4,
            textTransform: "uppercase",
            letterSpacing: 1.2,
            fontWeight: 700,
          }}
        >
          Magazzino
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: "-0.5px",
          }}
        >
          Media consumo articoli
        </h1>

        <div
          style={{
            marginTop: 6,
            opacity: 0.6,
            fontSize: 14,
            maxWidth: 760,
          }}
        >
          Media mensile di scarico di ogni articolo, calcolata sullo
          storico dei movimenti (quantità totale scaricata diviso i mesi
          trascorsi dal primo scarico). Sono compresi anche gli articoli
          già completamente scaricati, con giacenza attuale a zero.
          Raggruppati per fornitore: i fornitori più attivi sono aperti
          per primi.
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <SummaryCard
          title="Articoli nel catalogo"
          value={String(totals.totalItems)}
          subtitle="Totale articoli analizzati"
        />

        <SummaryCard
          title="Fornitori"
          value={String(totals.totalSuppliers)}
          subtitle="Fornitori nel catalogo"
        />

        <SummaryCard
          title="Con storico di consumo"
          value={String(totals.withHistory)}
          subtitle="Articoli con almeno uno scarico"
        />

        <SummaryCard
          title="Senza movimenti registrati"
          value={String(totals.withoutHistory)}
          subtitle="Nessuno scarico in archivio"
        />

        <SummaryCard
          title="Totale unità scaricate"
          value={formatNumber(totals.totalScaricato, 0)}
          subtitle="Somma di tutto lo storico scarichi"
        />
      </div>

      {canViewPrices && (
        <div
          style={{
            marginBottom: 16,
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            onClick={togglePriceIncrease}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "14px 16px",
              background: "var(--input-bg)",
              color: "var(--foreground)",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 750,
              textAlign: "left",
            }}
          >
            <span>
              Aumento prezzi complessivo
              {priceIncreaseLoaded && priceIncreaseResult && (
                <span style={{ opacity: 0.55, fontWeight: 500 }}>
                  {" "}
                  ({priceIncreaseResult.itemsConsidered}{" "}
                  {priceIncreaseResult.itemsConsidered === 1
                    ? "articolo"
                    : "articoli"}{" "}
                  con storico)
                </span>
              )}
            </span>

            <span
              style={{
                display: "inline-block",
                transition: "transform .15s ease",
                transform: priceIncreaseOpen
                  ? "rotate(180deg)"
                  : "rotate(0deg)",
              }}
            >
              ▾
            </span>
          </button>

          {priceIncreaseOpen && (
            <div style={{ padding: "14px 16px", background: "var(--card)" }}>
              {priceIncreaseLoading && (
                <div style={{ fontSize: 13, opacity: 0.6 }}>
                  Calcolo in corso...
                </div>
              )}

              {!priceIncreaseLoading && priceIncreaseError && (
                <div style={{ fontSize: 13, color: "#ef4444" }}>
                  {priceIncreaseError}
                </div>
              )}

              {!priceIncreaseLoading &&
                !priceIncreaseError &&
                priceIncreaseResult && (
                  <div>
                    <div
                      style={{
                        fontSize: 32,
                        fontWeight: 850,
                        letterSpacing: "-0.5px",
                        color:
                          priceIncreaseResult.pct > 0
                            ? "#ef4444"
                            : priceIncreaseResult.pct < 0
                              ? "#22c55e"
                              : "var(--foreground)",
                      }}
                    >
                      {priceIncreaseResult.pct > 0 ? "+" : ""}
                      {formatNumber(priceIncreaseResult.pct, 1)}%
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        opacity: 0.7,
                      }}
                    >
                      Da {formatEuro(priceIncreaseResult.totalOld)} a{" "}
                      {formatEuro(priceIncreaseResult.totalNew)}, su{" "}
                      {priceIncreaseResult.itemsConsidered}{" "}
                      {priceIncreaseResult.itemsConsidered === 1
                        ? "articolo"
                        : "articoli"}{" "}
                      con almeno una variazione di prezzo registrata.
                    </div>

                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        opacity: 0.5,
                      }}
                    >
                      {priceIncreaseResult.itemsWithoutHistory}{" "}
                      {priceIncreaseResult.itemsWithoutHistory === 1
                        ? "articolo non ha"
                        : "articoli non hanno"}{" "}
                      ancora nessuno storico prezzi e non{" "}
                      {priceIncreaseResult.itemsWithoutHistory === 1
                        ? "è compreso"
                        : "sono compresi"}{" "}
                      nel calcolo. Le variazioni che partono da un
                      prezzo a 0 (prima registrazione) non sono
                      conteggiate come aumento.
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          padding: 14,
          marginBottom: 16,
          background: "var(--card)",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
        }}
      >
        <div
          style={{
            position: "relative",
            flex: "1 1 350px",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 13,
              top: "50%",
              transform: "translateY(-50%)",
              opacity: 0.5,
            }}
          >
            ⌕
          </span>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca fornitore, codice o descrizione..."
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "11px 14px 11px 38px",
              background: "var(--input-bg)",
              color: "var(--foreground)",
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              outline: "none",
              fontSize: 14,
            }}
          />
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 13,
            opacity: 0.8,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={onlyWithHistory}
            onChange={(e) => setOnlyWithHistory(e.target.checked)}
          />
          Solo con storico consumo
        </label>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginLeft: "auto",
          }}
        >
          <button
            type="button"
            onClick={expandAll}
            style={pillButtonStyle}
          >
            Espandi tutti
          </button>

          <button
            type="button"
            onClick={collapseAll}
            style={pillButtonStyle}
          >
            Comprimi tutti
          </button>
        </div>

        <div
          style={{
            fontSize: 13,
            opacity: 0.6,
            padding: "0 5px",
          }}
        >
          {groups.length} fornitori · {sortedRows.length} articoli
        </div>
      </div>

      {errorMessage && (
        <div
          style={{
            padding: 14,
            marginBottom: 16,
            border: "1px solid rgba(239,68,68,0.5)",
            borderRadius: 10,
            background: "rgba(239,68,68,0.08)",
          }}
        >
          Errore: {errorMessage}
        </div>
      )}

      {/* INTESTAZIONE ORDINAMENTO (si applica dentro ogni fornitore) */}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 10,
          fontSize: 12,
          opacity: 0.6,
        }}
      >
        <span>Ordina gli articoli dentro ogni fornitore per:</span>

        <SortPill
          label="Media mensile"
          sortKey="monthlyAverage"
          activeKey={sortKey}
          dir={sortDir}
          onClick={toggleSort}
        />

        <SortPill
          label="Tot. scaricato"
          sortKey="totalQty"
          activeKey={sortKey}
          dir={sortDir}
          onClick={toggleSort}
        />

        <SortPill
          label="Giacenza"
          sortKey="stock"
          activeKey={sortKey}
          dir={sortDir}
          onClick={toggleSort}
        />

        <SortPill
          label="Descrizione"
          sortKey="description"
          activeKey={sortKey}
          dir={sortDir}
          onClick={toggleSort}
        />
      </div>

      {loading ? (
        <div
          style={{
            padding: 45,
            textAlign: "center",
            opacity: 0.55,
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            background: "var(--card)",
          }}
        >
          Caricamento report...
        </div>
      ) : groups.length === 0 ? (
        <div
          style={{
            padding: 45,
            textAlign: "center",
            opacity: 0.55,
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            background: "var(--card)",
          }}
        >
          Nessun articolo trovato con questi criteri.
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {groups.map((group) => {
            const isExpanded =
              isSearching || expandedSuppliers.has(group.name);

            return (
              <div
                key={group.name}
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 12,
                  background: "var(--card)",
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleSupplier(group.name)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 14,
                    padding: "14px 16px",
                    border: "none",
                    background: "var(--table-head)",
                    color: "var(--foreground)",
                    cursor: "pointer",
                    textAlign: "left",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 14,
                        opacity: 0.6,
                        transform: isExpanded
                          ? "rotate(90deg)"
                          : "rotate(0deg)",
                        transition: "transform 0.12s ease",
                      }}
                    >
                      ▸
                    </span>

                    <strong
                      style={{
                        fontSize: 15,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {group.name}
                    </strong>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      fontSize: 12,
                    }}
                  >
                    <Badge>{group.rows.length} articoli</Badge>

                    <Badge
                      tone={group.withHistoryCount > 0 ? "info" : "muted"}
                    >
                      {group.withHistoryCount} con consumo
                    </Badge>

                    {group.totalMonthly > 0 && (
                      <Badge tone="accent">
                        {formatNumber(group.totalMonthly)} / mese tot.
                      </Badge>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        minWidth: 1050,
                        borderCollapse: "collapse",
                      }}
                    >
                      <thead>
                        <tr>
                          <th style={headerStyle}>Codice articolo</th>
                          <th style={headerStyle}>Codice scanner</th>
                          <th style={headerStyle}>Descrizione</th>
                          <th style={headerCenterStyle}>Giacenza</th>
                          <th style={headerCenterStyle}>Tot. scaricato</th>
                          <th style={headerCenterStyle}>Primo scarico</th>
                          <th style={headerRightStyle}>Media mensile</th>
                        </tr>
                      </thead>

                      <tbody>
                        {group.rows.map((row) => (
                          <tr
                            key={row.id}
                            style={{
                              borderTop: "1px solid var(--border-color)",
                            }}
                          >
                            <td style={cellStyle}>
                              <Link
                                href={`/items/${row.id}`}
                                style={{
                                  color: "inherit",
                                  textDecoration: "none",
                                  fontWeight: 750,
                                }}
                              >
                                {row.supplierCode || "-"}
                              </Link>
                            </td>

                            <td style={cellStyle}>
                              <span
                                style={{
                                  fontFamily: "monospace",
                                  fontSize: 13,
                                  padding: "4px 7px",
                                  border: "1px solid var(--border-color)",
                                  borderRadius: 5,
                                  background: "var(--input-bg)",
                                }}
                              >
                                {row.code || "-"}
                              </span>
                            </td>

                            <td style={cellStyle}>
                              <Link
                                href={`/items/${row.id}`}
                                style={{
                                  color: "inherit",
                                  textDecoration: "none",
                                }}
                              >
                                {row.description}
                              </Link>
                            </td>

                            <td style={centerCellStyle}>{row.stock}</td>

                            <td style={centerCellStyle}>
                              {row.totalQty !== null ? (
                                formatNumber(row.totalQty, 0)
                              ) : (
                                <span style={{ opacity: 0.4 }}>—</span>
                              )}
                            </td>

                            <td style={centerCellStyle}>
                              {row.firstMovementDate ? (
                                formatDate(row.firstMovementDate)
                              ) : (
                                <span style={{ opacity: 0.4 }}>—</span>
                              )}
                            </td>

                            <td style={rightCellStyle}>
                              {row.monthlyAverage !== null ? (
                                <strong>
                                  {formatNumber(row.monthlyAverage)} / mese
                                </strong>
                              ) : (
                                <span style={{ opacity: 0.4 }}>
                                  Nessun consumo registrato
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          fontSize: 12,
          opacity: 0.5,
        }}
      >
        Media mensile = quantità totale scaricata (movimenti applicati) ÷
        mesi trascorsi dal primo scarico, incluso il mese in corso (minimo
        1 mese).
      </div>
    </div>
  );
}

function SortPill({
  label,
  sortKey,
  activeKey,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: "asc" | "desc";
  onClick: (key: SortKey) => void;
}) {
  const isActive = activeKey === sortKey;

  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      style={{
        padding: "5px 10px",
        borderRadius: 999,
        border: isActive
          ? "1px solid var(--foreground)"
          : "1px solid var(--border-color)",
        background: isActive ? "var(--foreground)" : "transparent",
        color: isActive ? "var(--background)" : "var(--foreground)",
        fontSize: 11,
        fontWeight: 750,
        cursor: "pointer",
      }}
    >
      {label}
      {isActive ? (dir === "asc" ? " ▲" : " ▼") : ""}
    </button>
  );
}

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "info" | "accent" | "muted";
}) {
  const colors: Record<
    string,
    { background: string; color: string; border: string }
  > = {
    default: {
      background: "rgba(148, 163, 184, 0.12)",
      color: "inherit",
      border: "1px solid var(--border-color)",
    },
    info: {
      background: "rgba(59, 130, 246, 0.12)",
      color: "#3b82f6",
      border: "1px solid rgba(59, 130, 246, 0.30)",
    },
    accent: {
      background: "rgba(16, 185, 129, 0.12)",
      color: "#10b981",
      border: "1px solid rgba(16, 185, 129, 0.30)",
    },
    muted: {
      background: "transparent",
      color: "inherit",
      border: "1px solid var(--border-color)",
      opacity: 0.6,
    } as any,
  };

  const style = colors[tone] || colors.default;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 9px",
        borderRadius: 999,
        fontWeight: 750,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        padding: 18,
        border: "1px solid var(--border-color)",
        borderRadius: 12,
        background: "var(--card)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontWeight: 700,
          opacity: 0.55,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: 27,
          fontWeight: 850,
          marginTop: 7,
          letterSpacing: "-0.5px",
        }}
      >
        {value}
      </div>

      <div
        style={{
          fontSize: 12,
          opacity: 0.55,
          marginTop: 4,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

const pillButtonStyle = {
  padding: "8px 13px",
  borderRadius: 8,
  border: "1px solid var(--border-color)",
  background: "var(--input-bg)",
  color: "var(--foreground)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};

const headerStyle = {
  padding: "11px 14px",
  textAlign: "left" as const,
  fontSize: 11,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  opacity: 0.6,
  borderBottom: "1px solid var(--border-color)",
  whiteSpace: "nowrap" as const,
};

const headerCenterStyle = {
  ...headerStyle,
  textAlign: "center" as const,
};

const headerRightStyle = {
  ...headerStyle,
  textAlign: "right" as const,
};

const cellStyle = {
  padding: "11px 14px",
  fontSize: 14,
};

const centerCellStyle = {
  ...cellStyle,
  textAlign: "center" as const,
};

const rightCellStyle = {
  ...cellStyle,
  textAlign: "right" as const,
  whiteSpace: "nowrap" as const,
};
