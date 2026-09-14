"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
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
  stock: number;
  min_stock: number;
  on_order: number;
  price?: number;
};

type Order = {
  id: string;
  supplier_id: string;
  status: string;
  order_date: string | null;
  created_at: string | null;
};

type Reminder = {
  id: string;
  title: string;
  reminder_date: string;
  note: string | null;
};

type Permissions = {
  view_prices?: boolean;
  view_inventory_value?: boolean;
  [key: string]: boolean | undefined;
};

type SearchResult = {
  id: string;
  kind: "Articolo" | "Fornitore" | "Ordine" | "Sezione";
  title: string;
  subtitle: string;
  href: string;
  accent: "blue" | "violet" | "cyan" | "orange" | "green";
};

const NAV_ITEMS = [
  { label: "Home", href: "/gestionale", icon: "home" },
  { label: "Magazzino", href: "/suppliers", icon: "warehouse" },
  { label: "Ordini", href: "/orders", icon: "orders" },
  { label: "Movimenti", href: "/movements", icon: "movement" },
  { label: "Scorte", href: "/low-stock-report", icon: "alert" },
  { label: "Fornitori", href: "/suppliers", icon: "users" },
  { label: "Codici", href: "/codici-da-inserire", icon: "barcode" },
  { label: "Promemoria", href: "/promemoria", icon: "bell" },
  { label: "Note", href: "/note-condivise", icon: "note" },
] as const;

const SECONDARY_NAV = [
  { label: "Utenti", href: "/utenti", icon: "users" },
  { label: "Impostazioni", href: "/settings", icon: "settings" },
] as const;

export default function GestionalePage() {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [displayName, setDisplayName] = useState("Matteo");
  const [canViewInventoryValue, setCanViewInventoryValue] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const savedName = localStorage.getItem("magazzino_display_name");
    const username = localStorage.getItem("magazzino_user");

    setDisplayName(savedName || username || "Matteo");

    const role = localStorage.getItem("magazzino_role");
    const savedPermissions = localStorage.getItem("magazzino_permissions");

    let permissions: Permissions = {};

    try {
      permissions = savedPermissions ? JSON.parse(savedPermissions) : {};
    } catch {
      permissions = {};
    }

    setCanViewInventoryValue(
      role === "admin" || permissions.view_inventory_value === true
    );

    loadDashboard();

    function onKeyDown(event: KeyboardEvent) {
      const isCommand = event.ctrlKey || event.metaKey;

      if (isCommand && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => searchInputRef.current?.focus(), 30);
      }

      if (event.key === "Escape") {
        setSearchOpen(false);
        setSearch("");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function loadDashboard(manual = false) {
    if (manual) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorMessage("");

    try {
      const role = localStorage.getItem("magazzino_role");
      const savedPermissions = localStorage.getItem("magazzino_permissions");

      let permissions: Permissions = {};
      try {
        permissions = savedPermissions ? JSON.parse(savedPermissions) : {};
      } catch {
        permissions = {};
      }

      const needsPrice =
        role === "admin" ||
        permissions.view_inventory_value === true ||
        permissions.view_prices === true;

      const [
        suppliersResponse,
        itemsResponse,
        ordersResponse,
        remindersResponse,
      ] = await Promise.all([
        supabase.from("suppliers").select("id,name").order("name"),
        supabase
          .from("items")
          .select(
            needsPrice
              ? "id,supplier_id,code,supplier_code,description,price,stock,min_stock,on_order"
              : "id,supplier_id,code,supplier_code,description,stock,min_stock,on_order"
          ),
        supabase
          .from("orders")
          .select("id,supplier_id,status,order_date,created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("reminders")
          .select("id,title,reminder_date,note")
          .eq("is_done", false)
          .order("reminder_date", { ascending: true })
          .limit(10),
      ]);

      const firstError =
        suppliersResponse.error ||
        itemsResponse.error ||
        ordersResponse.error ||
        remindersResponse.error;

      if (firstError) {
        throw new Error(firstError.message);
      }

      setSuppliers(
        (suppliersResponse.data || []).map((row) => ({
          id: String(row.id),
          name: String(row.name || ""),
        }))
      );

      setItems(
        (itemsResponse.data || []).map((row: any) => ({
          id: String(row.id),
          supplier_id: String(row.supplier_id),
          code: String(row.code || ""),
          supplier_code: row.supplier_code
            ? String(row.supplier_code)
            : null,
          description: String(row.description || ""),
          stock: Number(row.stock || 0),
          min_stock: Number(row.min_stock || 0),
          on_order: Number(row.on_order || 0),
          price: needsPrice ? Number(row.price || 0) : undefined,
        }))
      );

      setOrders(
        (ordersResponse.data || []).map((row) => ({
          id: String(row.id),
          supplier_id: String(row.supplier_id),
          status: String(row.status || ""),
          order_date: row.order_date ? String(row.order_date) : null,
          created_at: row.created_at ? String(row.created_at) : null,
        }))
      );

      setReminders(
        (remindersResponse.data || []).map((row) => ({
          id: String(row.id),
          title: String(row.title || ""),
          reminder_date: String(row.reminder_date || ""),
          note: row.note ? String(row.note) : null,
        }))
      );
    } catch (error) {
      console.error(error);
      setErrorMessage(
        "Non riesco ad aggiornare i dati in questo momento. Controlla la connessione e riprova."
      );
    }

    setLoading(false);
    setRefreshing(false);
  }

  const supplierMap = useMemo(() => {
    const map = new Map<string, string>();
    suppliers.forEach((supplier) => map.set(supplier.id, supplier.name));
    return map;
  }, [suppliers]);

  const lowStockItems = useMemo(() => {
    return items
      .filter((item) => item.min_stock > 0 && item.stock <= item.min_stock)
      .sort((a, b) => {
        const deficitA = Math.max(
          0,
          a.min_stock - a.stock - a.on_order
        );
        const deficitB = Math.max(
          0,
          b.min_stock - b.stock - b.on_order
        );
        return deficitB - deficitA;
      });
  }, [items]);

  const outOfStock = useMemo(
    () => items.filter((item) => item.stock <= 0),
    [items]
  );

  const healthyStock = useMemo(
    () =>
      items.filter(
        (item) => item.stock > 0 && !(item.min_stock > 0 && item.stock <= item.min_stock)
      ),
    [items]
  );

  const openOrders = useMemo(
    () =>
      orders.filter((order) =>
        ["draft", "ordered", "partial"].includes(order.status)
      ),
    [orders]
  );

  const orderedOrders = useMemo(
    () => orders.filter((order) => order.status === "ordered"),
    [orders]
  );

  const partialOrders = useMemo(
    () => orders.filter((order) => order.status === "partial"),
    [orders]
  );

  const receivedOrders = useMemo(
    () => orders.filter((order) => order.status === "received"),
    [orders]
  );

  const totalOnOrder = useMemo(
    () => items.reduce((sum, item) => sum + item.on_order, 0),
    [items]
  );

  const warehouseValue = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + item.stock * Number(item.price || 0),
        0
      ),
    [items]
  );

  const supplierValueRows = useMemo(() => {
    const rows = new Map<
      string,
      { id: string; name: string; value: number; items: number }
    >();

    items.forEach((item) => {
      const current = rows.get(item.supplier_id) || {
        id: item.supplier_id,
        name: supplierMap.get(item.supplier_id) || "Fornitore",
        value: 0,
        items: 0,
      };

      current.value += item.stock * Number(item.price || 0);
      current.items += 1;
      rows.set(item.supplier_id, current);
    });

    return Array.from(rows.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [items, supplierMap]);

  const maxSupplierValue = Math.max(
    1,
    ...supplierValueRows.map((row) => row.value)
  );

  const stockDistribution = [
    {
      label: "Regolari",
      value: healthyStock.length,
      tone: "green",
    },
    {
      label: "Scorta bassa",
      value: Math.max(0, lowStockItems.length - outOfStock.length),
      tone: "orange",
    },
    {
      label: "Esauriti",
      value: outOfStock.length,
      tone: "red",
    },
  ];

  const stockTotal = Math.max(
    1,
    stockDistribution.reduce((sum, row) => sum + row.value, 0)
  );

  const recentOrders = useMemo(() => orders.slice(0, 5), [orders]);

  const criticalItems = useMemo(
    () => lowStockItems.slice(0, 5),
    [lowStockItems]
  );

  const todayTasks = useMemo(() => {
    const tasks: Array<{
      title: string;
      subtitle: string;
      tone: "red" | "orange" | "violet" | "blue";
      href: string;
      count: number;
    }> = [];

    if (outOfStock.length > 0) {
      tasks.push({
        title: `${outOfStock.length} articoli esauriti`,
        subtitle: "Richiedono attenzione immediata",
        tone: "red",
        href: "/low-stock-report",
        count: outOfStock.length,
      });
    }

    if (openOrders.length > 0) {
      tasks.push({
        title: `${openOrders.length} ordini aperti`,
        subtitle: `${formatNumber(totalOnOrder)} pezzi complessivi in arrivo`,
        tone: "orange",
        href: "/orders",
        count: openOrders.length,
      });
    }

    if (reminders.length > 0) {
      tasks.push({
        title: `${reminders.length} promemoria aperti`,
        subtitle: "Controlla scadenze e attività",
        tone: "blue",
        href: "/promemoria",
        count: reminders.length,
      });
    }

    const notOutLow = Math.max(0, lowStockItems.length - outOfStock.length);
    if (notOutLow > 0) {
      tasks.push({
        title: `${notOutLow} articoli sotto scorta`,
        subtitle: "Da valutare per il prossimo riordino",
        tone: "violet",
        href: "/low-stock-report",
        count: notOutLow,
      });
    }

    return tasks.slice(0, 5);
  }, [outOfStock, openOrders, totalOnOrder, reminders, lowStockItems]);

  const searchResults = useMemo<SearchResult[]>(() => {
    const term = search.trim().toLowerCase();

    const sections: SearchResult[] = [
      {
        id: "section-magazzino",
        kind: "Sezione",
        title: "Magazzino",
        subtitle: "Fornitori e articoli",
        href: "/suppliers",
        accent: "blue",
      },
      {
        id: "section-orders",
        kind: "Sezione",
        title: "Ordini",
        subtitle: "Ordini aperti e storico",
        href: "/orders",
        accent: "violet",
      },
      {
        id: "section-movements",
        kind: "Sezione",
        title: "Movimenti",
        subtitle: "Carichi e scarichi",
        href: "/movements",
        accent: "cyan",
      },
      {
        id: "section-stock",
        kind: "Sezione",
        title: "Scorte",
        subtitle: "Articoli da riordinare",
        href: "/low-stock-report",
        accent: "orange",
      },
    ];

    if (!term) {
      return sections;
    }

    const itemResults: SearchResult[] = items
      .filter((item) => {
        const text = [
          item.code,
          item.supplier_code || "",
          item.description,
          supplierMap.get(item.supplier_id) || "",
        ]
          .join(" ")
          .toLowerCase();
        return text.includes(term);
      })
      .slice(0, 8)
      .map((item) => ({
        id: `item-${item.id}`,
        kind: "Articolo",
        title: item.supplier_code || item.code || "Articolo",
        subtitle: `${item.description} · ${supplierMap.get(item.supplier_id) || "Fornitore"}`,
        href: `/items/${item.id}`,
        accent: item.stock <= 0 ? "orange" : "green",
      }));

    const supplierResults: SearchResult[] = suppliers
      .filter((supplier) => supplier.name.toLowerCase().includes(term))
      .slice(0, 5)
      .map((supplier) => ({
        id: `supplier-${supplier.id}`,
        kind: "Fornitore",
        title: supplier.name,
        subtitle: "Apri catalogo fornitore",
        href: `/suppliers/${supplier.id}`,
        accent: "blue",
      }));

    const orderResults: SearchResult[] = orders
      .filter((order) => {
        const supplier = supplierMap.get(order.supplier_id) || "";
        return (
          order.id.toLowerCase().includes(term) ||
          supplier.toLowerCase().includes(term) ||
          order.status.toLowerCase().includes(term)
        );
      })
      .slice(0, 4)
      .map((order) => ({
        id: `order-${order.id}`,
        kind: "Ordine",
        title: supplierMap.get(order.supplier_id) || "Ordine",
        subtitle: `${formatDate(order.order_date || order.created_at)} · ${orderLabel(order.status)}`,
        href: `/orders/${order.id}`,
        accent: "violet",
      }));

    const sectionResults = sections.filter((row) =>
      `${row.title} ${row.subtitle}`.toLowerCase().includes(term)
    );

    return [
      ...itemResults,
      ...supplierResults,
      ...orderResults,
      ...sectionResults,
    ].slice(0, 14);
  }, [search, items, suppliers, orders, supplierMap]);

  const now = new Date();
  const weekday = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
  }).format(now);
  const fullDate = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  const greeting =
    now.getHours() < 12
      ? "Buongiorno"
      : now.getHours() < 18
        ? "Buon pomeriggio"
        : "Buonasera";

  if (loading) {
    return (
      <div className="gm2-loading-page">
        <div className="gm2-loading-logo">
          <CubeIcon />
        </div>
        <strong>Gestionale Matteo</strong>
        <span>Caricamento control center...</span>
        <Styles />
      </div>
    );
  }

  return (
    <div className="gm2-app">
      <aside className="gm2-sidebar">
        <div className="gm2-logo" onClick={() => router.push("/gestionale")}>
          <div className="gm2-logo-mark">
            <CubeIcon />
          </div>
          <div>
            <strong>GESTIONALE</strong>
            <span>MATTEO</span>
          </div>
        </div>

        <div className="gm2-side-label">CONTROL CENTER</div>

        <nav className="gm2-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={`${item.href}-${item.label}`}
              type="button"
              className={item.href === "/gestionale" ? "active" : ""}
              onClick={() => router.push(item.href)}
            >
              <span className="gm2-nav-icon">
                <NavIcon name={item.icon} />
              </span>
              <span>{item.label}</span>

              {item.label === "Ordini" && openOrders.length > 0 && (
                <em className="gm2-badge red">{openOrders.length}</em>
              )}
              {item.label === "Scorte" && lowStockItems.length > 0 && (
                <em className="gm2-badge orange">{lowStockItems.length}</em>
              )}
              {item.label === "Promemoria" && reminders.length > 0 && (
                <em className="gm2-badge red">{reminders.length}</em>
              )}
            </button>
          ))}
        </nav>

        <div className="gm2-side-divider" />

        <nav className="gm2-nav secondary">
          {SECONDARY_NAV.map((item) => (
            <button
              key={item.href}
              type="button"
              onClick={() => router.push(item.href)}
            >
              <span className="gm2-nav-icon">
                <NavIcon name={item.icon} />
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="gm2-user-card">
          <div className="gm2-avatar">{displayName.charAt(0).toUpperCase()}</div>
          <div>
            <strong>{displayName}</strong>
            <span>Amministratore</span>
          </div>
          <button type="button" onClick={() => router.push("/settings")}>
            <SettingsIcon />
          </button>
        </div>
      </aside>

      <div className="gm2-workspace">
        <header className="gm2-topbar">
          <button
            type="button"
            className="gm2-global-search"
            onClick={() => {
              setSearchOpen(true);
              window.setTimeout(() => searchInputRef.current?.focus(), 30);
            }}
          >
            <SearchIcon />
            <span>Cerca articoli, fornitori, ordini, codici, movimenti...</span>
            <kbd>Ctrl + K</kbd>
          </button>

          <div className="gm2-top-status">
            <button className="gm2-icon-button" type="button" onClick={() => router.push("/promemoria")}>
              <BellIcon />
              {reminders.length > 0 && <span>{Math.min(9, reminders.length)}</span>}
            </button>

            <div className="gm2-sync-pill">
              <span />
              {errorMessage ? "Connessione da verificare" : "Dati aggiornati"}
            </div>

            <div className="gm2-clock">
              <span>{capitalize(weekday)} {fullDate}</span>
              <strong>{time}</strong>
            </div>

            <div className="gm2-top-avatar">{displayName.charAt(0).toUpperCase()}</div>
          </div>
        </header>

        <main className="gm2-main">
          <section className="gm2-hero">
            <div className="gm2-hero-grid" />
            <div className="gm2-aurora gm2-aurora-one" />
            <div className="gm2-aurora gm2-aurora-two" />

            <div className="gm2-hero-copy">
              <div className="gm2-live-label">
                <span />
                SISTEMA OPERATIVO
              </div>

              <h1>
                {greeting},
                <br />
                <strong>{displayName}.</strong>
              </h1>

              <p>Il tuo magazzino, sempre sotto controllo.</p>

              <div className="gm2-hero-actions">
                <ActionButton
                  primary
                  icon={<PlusIcon />}
                  label="Nuovo ordine"
                  onClick={() => router.push("/orders")}
                />
                <ActionButton
                  icon={<SearchIcon />}
                  label="Cerca articolo"
                  onClick={() => {
                    setSearchOpen(true);
                    window.setTimeout(() => searchInputRef.current?.focus(), 30);
                  }}
                />
                <ActionButton
                  icon={<BellIcon />}
                  label="Nuovo promemoria"
                  onClick={() => router.push("/promemoria")}
                />
                <ActionButton
                  icon={<MovementIcon />}
                  label="Nuovo movimento"
                  onClick={() => router.push("/movements")}
                />
              </div>
            </div>

            <div className="gm2-hero-side">
              <div className="gm2-hero-quote">
                “ Un magazzino efficiente lascia più tempo alle cose importanti. ”
              </div>

              <div className="gm2-hero-mini">
                <div>
                  <span>Da controllare</span>
                  <strong>{lowStockItems.length}</strong>
                </div>
                <div>
                  <span>Ordini aperti</span>
                  <strong>{openOrders.length}</strong>
                </div>
                <button type="button" onClick={() => loadDashboard(true)} disabled={refreshing}>
                  <RefreshIcon />
                  {refreshing ? "Aggiorno..." : "Aggiorna dati"}
                </button>
              </div>
            </div>
          </section>

          {errorMessage && (
            <div className="gm2-error-banner">
              <AlertIcon />
              <div>
                <strong>Aggiornamento non riuscito</strong>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          <section className="gm2-kpi-grid">
            <KpiCard
              icon={<CubeIcon />}
              tone="blue"
              title="Articoli totali"
              value={formatNumber(items.length)}
              note={`${suppliers.length} fornitori`}
              onClick={() => router.push("/suppliers")}
            />
            <KpiCard
              icon={<AlertIcon />}
              tone="orange"
              title="Scorte basse"
              value={formatNumber(lowStockItems.length)}
              note={`${outOfStock.length} esauriti`}
              onClick={() => router.push("/low-stock-report")}
            />
            <KpiCard
              icon={<OrderIcon />}
              tone="violet"
              title="Ordini aperti"
              value={formatNumber(openOrders.length)}
              note={`${formatNumber(totalOnOrder)} pz in arrivo`}
              onClick={() => router.push("/orders")}
            />
            <KpiCard
              icon={<EuroIcon />}
              tone="green"
              title="Valore magazzino"
              value={
                canViewInventoryValue
                  ? formatEuro(warehouseValue)
                  : "Riservato"
              }
              note="Giacenza × prezzo"
            />
          </section>

          <section className="gm2-dashboard-grid">
            <div className="gm2-column-main">
              <div className="gm2-analytics-grid">
                <Panel className="gm2-value-panel">
                  <PanelTitle title="Valore per fornitore" subtitle="Top 5 per valore attuale" />

                  {canViewInventoryValue && supplierValueRows.length > 0 ? (
                    <div className="gm2-ranking">
                      {supplierValueRows.map((row, index) => (
                        <button
                          key={row.id}
                          type="button"
                          className="gm2-ranking-row"
                          onClick={() => router.push(`/suppliers/${row.id}`)}
                        >
                          <span className="gm2-rank-number">{index + 1}</span>
                          <div className="gm2-rank-copy">
                            <div>
                              <strong>{row.name}</strong>
                              <span>{formatEuro(row.value)}</span>
                            </div>
                            <div className="gm2-rank-track">
                              <span
                                style={{
                                  width: `${Math.max(
                                    8,
                                    (row.value / maxSupplierValue) * 100
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <LockedState text="Valore economico non disponibile per questo account." />
                  )}
                </Panel>

                <Panel>
                  <PanelTitle title="Stato scorte" subtitle="Distribuzione articoli" />

                  <div className="gm2-stock-donut-wrap">
                    <div
                      className="gm2-stock-donut"
                      style={{
                        background: buildStockGradient(stockDistribution, stockTotal),
                      }}
                    >
                      <div>
                        <strong>{items.length}</strong>
                        <span>articoli</span>
                      </div>
                    </div>

                    <div className="gm2-stock-legend">
                      {stockDistribution.map((row) => (
                        <button
                          key={row.label}
                          type="button"
                          onClick={() =>
                            row.label === "Regolari"
                              ? router.push("/suppliers")
                              : router.push("/low-stock-report")
                          }
                        >
                          <span className={`gm2-dot ${row.tone}`} />
                          <div>
                            <strong>{row.label}</strong>
                            <small>{formatNumber(row.value)}</small>
                          </div>
                          <em>{Math.round((row.value / stockTotal) * 100)}%</em>
                        </button>
                      ))}
                    </div>
                  </div>
                </Panel>

                <Panel>
                  <PanelTitle title="Ordini" subtitle="Stato operativo" />

                  <div className="gm2-order-bars">
                    <OrderBar
                      label="Ordinati"
                      value={orderedOrders.length}
                      total={Math.max(1, orders.length)}
                      tone="blue"
                    />
                    <OrderBar
                      label="Parziali"
                      value={partialOrders.length}
                      total={Math.max(1, orders.length)}
                      tone="orange"
                    />
                    <OrderBar
                      label="Ricevuti"
                      value={receivedOrders.length}
                      total={Math.max(1, orders.length)}
                      tone="green"
                    />
                  </div>

                  <button
                    type="button"
                    className="gm2-panel-action"
                    onClick={() => router.push("/orders")}
                  >
                    Apri gestione ordini <ArrowIcon />
                  </button>
                </Panel>
              </div>

              <div className="gm2-lower-grid">
                <Panel>
                  <PanelTitle
                    title="Da fare oggi"
                    subtitle={`${todayTasks.length} priorità operative`}
                    action="Vedi tutto"
                    onAction={() => router.push("/low-stock-report")}
                  />

                  <div className="gm2-task-list">
                    {todayTasks.length === 0 ? (
                      <EmptyState
                        icon={<CheckIcon />}
                        title="Tutto sotto controllo"
                        text="Non ci sono priorità aperte."
                      />
                    ) : (
                      todayTasks.map((task) => (
                        <button
                          key={`${task.href}-${task.title}`}
                          type="button"
                          className="gm2-task-row"
                          onClick={() => router.push(task.href)}
                        >
                          <span className={`gm2-task-icon ${task.tone}`}>
                            <AlertIcon />
                          </span>
                          <div>
                            <strong>{task.title}</strong>
                            <span>{task.subtitle}</span>
                          </div>
                          <ArrowIcon />
                        </button>
                      ))
                    )}
                  </div>
                </Panel>

                <Panel>
                  <PanelTitle
                    title="Attività recenti"
                    subtitle="Ultimi ordini registrati"
                    action="Vedi tutto"
                    onAction={() => router.push("/orders")}
                  />

                  <div className="gm2-activity-list">
                    {recentOrders.length === 0 ? (
                      <EmptyState
                        icon={<OrderIcon />}
                        title="Nessuna attività"
                        text="Gli ultimi ordini compariranno qui."
                      />
                    ) : (
                      recentOrders.map((order) => (
                        <button
                          key={order.id}
                          type="button"
                          className="gm2-activity-row"
                          onClick={() => router.push(`/orders/${order.id}`)}
                        >
                          <span className="gm2-activity-icon">
                            <OrderIcon />
                          </span>
                          <div>
                            <strong>
                              {supplierMap.get(order.supplier_id) || "Ordine"}
                            </strong>
                            <span>{orderLabel(order.status)}</span>
                          </div>
                          <time>{formatDate(order.order_date || order.created_at)}</time>
                        </button>
                      ))
                    )}
                  </div>
                </Panel>

                <Panel>
                  <PanelTitle
                    title="Accesso rapido"
                    subtitle="Le funzioni che usi di più"
                    action="Personalizza"
                    onAction={() => router.push("/settings")}
                  />

                  <div className="gm2-quick-grid">
                    <QuickTile icon={<WarehouseIcon />} label="Magazzino" tone="blue" onClick={() => router.push("/suppliers")} />
                    <QuickTile icon={<OrderIcon />} label="Ordini" tone="violet" badge={openOrders.length} onClick={() => router.push("/orders")} />
                    <QuickTile icon={<MovementIcon />} label="Movimenti" tone="cyan" onClick={() => router.push("/movements")} />
                    <QuickTile icon={<AlertIcon />} label="Scorte" tone="orange" badge={lowStockItems.length} onClick={() => router.push("/low-stock-report")} />
                    <QuickTile icon={<UsersIcon />} label="Fornitori" tone="green" onClick={() => router.push("/suppliers")} />
                    <QuickTile icon={<BarcodeIcon />} label="Codici" tone="violet" onClick={() => router.push("/codici-da-inserire")} />
                    <QuickTile icon={<BellIcon />} label="Promemoria" tone="red" badge={reminders.length} onClick={() => router.push("/promemoria")} />
                    <QuickTile icon={<NoteIcon />} label="Note" tone="blue" onClick={() => router.push("/note-condivise")} />
                  </div>
                </Panel>
              </div>
            </div>

            <aside className="gm2-right-rail">
              <Panel className="gm2-calendar-panel">
                <div className="gm2-calendar-head">
                  <div>
                    <strong>{capitalize(weekday)}</strong>
                    <span>{fullDate}</span>
                  </div>
                  <CalendarIcon />
                </div>

                <div className="gm2-date-big">{String(now.getDate()).padStart(2, "0")}</div>

                <div className="gm2-agenda-title">
                  <strong>Agenda</strong>
                  <button type="button" onClick={() => router.push("/promemoria")}>
                    Vedi agenda
                  </button>
                </div>

                <div className="gm2-agenda-list">
                  {reminders.slice(0, 4).map((reminder, index) => (
                    <button
                      key={reminder.id}
                      type="button"
                      onClick={() => router.push("/promemoria")}
                    >
                      <span className={`gm2-agenda-line tone-${(index % 4) + 1}`} />
                      <div>
                        <strong>{reminder.title}</strong>
                        <span>{formatReminderDate(reminder.reminder_date)}</span>
                      </div>
                    </button>
                  ))}

                  {reminders.length === 0 && (
                    <div className="gm2-agenda-empty">Nessun promemoria aperto.</div>
                  )}
                </div>
              </Panel>

              <Panel>
                <PanelTitle
                  title="Articoli critici"
                  subtitle="Scorte più urgenti"
                  action="Vedi tutti"
                  onAction={() => router.push("/low-stock-report")}
                />

                <div className="gm2-critical-list">
                  {criticalItems.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => router.push(`/items/${item.id}`)}
                    >
                      <span className={`gm2-critical-icon ${item.stock <= 0 ? "red" : "orange"}`}>
                        <CubeIcon />
                      </span>
                      <div>
                        <strong>{item.supplier_code || item.code}</strong>
                        <span>{item.description || supplierMap.get(item.supplier_id)}</span>
                      </div>
                      <em className={item.stock <= 0 ? "red" : "orange"}>
                        {formatNumber(item.stock)} pz
                      </em>
                    </button>
                  ))}

                  {criticalItems.length === 0 && (
                    <EmptyState
                      icon={<CheckIcon />}
                      title="Nessuna criticità"
                      text="Le scorte sono regolari."
                    />
                  )}
                </div>
              </Panel>

              <Panel className="gm2-system-panel">
                <div className="gm2-system-ok">
                  <CheckIcon />
                </div>
                <div>
                  <strong>Connessione gestionale</strong>
                  <span>{errorMessage ? "Da verificare" : "Dati caricati correttamente"}</span>
                </div>

                <div className="gm2-system-list">
                  <SystemRow label="Database" ok={!errorMessage} />
                  <SystemRow label="Gestionale" ok={!errorMessage} />
                  <SystemRow label="Aggiornamento dati" ok={!errorMessage} />
                </div>
              </Panel>
            </aside>
          </section>
        </main>

        <nav className="gm2-mobile-nav">
          <button type="button" className="active" onClick={() => router.push("/gestionale")}>
            <HomeIcon />
            <span>Home</span>
          </button>
          <button type="button" onClick={() => router.push("/suppliers")}>
            <WarehouseIcon />
            <span>Magazzino</span>
          </button>
          <button type="button" onClick={() => router.push("/orders")}>
            <OrderIcon />
            <span>Ordini</span>
          </button>
          <button type="button" onClick={() => setSearchOpen(true)}>
            <SearchIcon />
            <span>Cerca</span>
          </button>
          <button type="button" onClick={() => router.push("/settings")}>
            <SettingsIcon />
            <span>Altro</span>
          </button>
        </nav>
      </div>

      {searchOpen && (
        <div
          className="gm2-search-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSearchOpen(false);
              setSearch("");
            }
          }}
        >
          <div className="gm2-search-modal">
            <div className="gm2-search-modal-head">
              <SearchIcon />
              <input
                ref={searchInputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cerca codice, articolo, fornitore, ordine..."
                autoFocus
              />
              <kbd>ESC</kbd>
            </div>

            <div className="gm2-search-hint">
              Ricerca universale · risultati in tempo reale
            </div>

            <div className="gm2-search-results">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => {
                    setSearchOpen(false);
                    setSearch("");
                    router.push(result.href);
                  }}
                >
                  <span className={`gm2-result-icon ${result.accent}`}>
                    <SearchResultIcon kind={result.kind} />
                  </span>
                  <div>
                    <strong>{result.title}</strong>
                    <span>{result.subtitle}</span>
                  </div>
                  <em>{result.kind}</em>
                  <ArrowIcon />
                </button>
              ))}

              {searchResults.length === 0 && (
                <div className="gm2-no-results">
                  <SearchIcon />
                  <strong>Nessun risultato</strong>
                  <span>Prova con un codice, una descrizione o un fornitore.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Styles />
    </div>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`gm2-panel ${className}`}>{children}</div>;
}

function PanelTitle({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string;
  subtitle: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="gm2-panel-title">
      <div>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      {action && onAction && (
        <button type="button" onClick={onAction}>
          {action}
          <ArrowIcon />
        </button>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  tone,
  title,
  value,
  note,
  onClick,
}: {
  icon: React.ReactNode;
  tone: "blue" | "orange" | "violet" | "green";
  title: string;
  value: string;
  note: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className={`gm2-kpi-icon ${tone}`}>{icon}</span>
      <div>
        <span className="gm2-kpi-title">{title}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
      {onClick && <ArrowIcon />}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className="gm2-kpi-card" onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className="gm2-kpi-card">{content}</div>;
}

function ActionButton({
  icon,
  label,
  primary = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`gm2-action-button ${primary ? "primary" : ""}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function QuickTile({
  icon,
  label,
  tone,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className="gm2-quick-tile" onClick={onClick}>
      <span className={`gm2-quick-icon ${tone}`}>{icon}</span>
      {badge !== undefined && badge > 0 && (
        <em>{Math.min(999, badge)}</em>
      )}
      <strong>{label}</strong>
    </button>
  );
}

function OrderBar({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "blue" | "orange" | "green";
}) {
  const percent = Math.min(100, Math.max(4, (value / total) * 100));

  return (
    <div className="gm2-order-bar">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="gm2-order-track">
        <span className={tone} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function SystemRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="gm2-system-row">
      <span className={`gm2-system-dot ${ok ? "" : "warning"}`} />
      <strong>{label}</strong>
      <em>{ok ? "OK" : "Verifica"}</em>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="gm2-empty-state">
      <span>{icon}</span>
      <strong>{title}</strong>
      <small>{text}</small>
    </div>
  );
}

function LockedState({ text }: { text: string }) {
  return (
    <div className="gm2-locked-state">
      <ShieldIcon />
      <strong>Dati riservati</strong>
      <span>{text}</span>
    </div>
  );
}

function buildStockGradient(
  rows: Array<{ value: number; tone: string }>,
  total: number
) {
  const colors: Record<string, string> = {
    green: "#22c55e",
    orange: "#f59e0b",
    red: "#ef4444",
  };

  let current = 0;
  const stops: string[] = [];

  rows.forEach((row) => {
    const start = current;
    const end = current + (row.value / total) * 100;
    stops.push(`${colors[row.tone]} ${start}% ${end}%`);
    current = end;
  });

  if (stops.length === 0) {
    return "conic-gradient(#223149 0 100%)";
  }

  return `conic-gradient(${stops.join(",")})`;
}

function orderLabel(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "ordered") return "In ordine";
  if (normalized === "partial") return "Parziale";
  if (normalized === "received") return "Ricevuto";
  if (normalized === "cancelled") return "Annullato";
  if (normalized === "draft") return "Bozza";
  return status || "Ordine";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function formatReminderDate(value: string) {
  if (!value) return "Data non disponibile";
  try {
    return new Intl.DateTimeFormat("it-IT", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    }).format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function NavIcon({ name }: { name: string }) {
  if (name === "home") return <HomeIcon />;
  if (name === "warehouse") return <WarehouseIcon />;
  if (name === "orders") return <OrderIcon />;
  if (name === "movement") return <MovementIcon />;
  if (name === "alert") return <AlertIcon />;
  if (name === "users") return <UsersIcon />;
  if (name === "barcode") return <BarcodeIcon />;
  if (name === "bell") return <BellIcon />;
  if (name === "note") return <NoteIcon />;
  return <SettingsIcon />;
}

function SearchResultIcon({ kind }: { kind: SearchResult["kind"] }) {
  if (kind === "Articolo") return <CubeIcon />;
  if (kind === "Fornitore") return <UsersIcon />;
  if (kind === "Ordine") return <OrderIcon />;
  return <SearchIcon />;
}

function Styles() {
  return (
    <style jsx global>{`
      :root {
        --gm2-bg: #040b13;
        --gm2-bg-2: #07111d;
        --gm2-panel: #091522;
        --gm2-panel-2: #0d1b2b;
        --gm2-panel-3: #102136;
        --gm2-border: rgba(120, 157, 199, 0.16);
        --gm2-border-strong: rgba(72, 148, 255, 0.31);
        --gm2-text: #f4f8ff;
        --gm2-muted: #7f91aa;
        --gm2-blue: #2787ff;
        --gm2-cyan: #27c5e9;
        --gm2-violet: #8d66ff;
        --gm2-green: #24d47b;
        --gm2-orange: #ffac2f;
        --gm2-red: #ff4d5e;
      }

      html,
      body {
        background: var(--gm2-bg) !important;
      }

      .topbar-v2 {
        display: none !important;
      }

      body > main,
      body main {
        max-width: none;
      }

      .gm2-loading-page,
      .gm2-app {
        font-family:
          Inter,
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
      }

      .gm2-loading-page {
        min-height: 100vh;
        margin: -26px -20px -48px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background:
          radial-gradient(circle at 50% 0%, rgba(39, 135, 255, 0.18), transparent 32%),
          #040b13;
        color: var(--gm2-text);
      }

      .gm2-loading-logo {
        width: 64px;
        height: 64px;
        margin-bottom: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--gm2-border-strong);
        border-radius: 19px;
        background: linear-gradient(145deg, #0e61da, #2787ff);
        box-shadow: 0 0 40px rgba(39, 135, 255, 0.22);
      }

      .gm2-loading-page strong {
        font-size: 18px;
      }

      .gm2-loading-page span {
        color: var(--gm2-muted);
        font-size: 12px;
      }

      .gm2-app {
        min-height: 100vh;
        margin: -26px -20px -48px;
        display: grid;
        grid-template-columns: 190px minmax(0, 1fr);
        background:
          radial-gradient(circle at 65% -15%, rgba(39, 135, 255, 0.1), transparent 25%),
          var(--gm2-bg);
        color: var(--gm2-text);
      }

      .gm2-sidebar {
        position: sticky;
        top: 0;
        height: 100vh;
        z-index: 40;
        display: flex;
        flex-direction: column;
        padding: 17px 10px 13px;
        border-right: 1px solid rgba(115, 151, 193, 0.12);
        background:
          linear-gradient(180deg, rgba(7, 17, 29, 0.98), rgba(4, 11, 19, 0.99));
        box-sizing: border-box;
      }

      .gm2-logo {
        min-height: 50px;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 5px 8px 16px;
        cursor: pointer;
      }

      .gm2-logo-mark {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(83, 157, 255, 0.5);
        border-radius: 13px;
        background: linear-gradient(145deg, #124ca2, #2787ff);
        color: white;
        box-shadow: 0 0 24px rgba(39, 135, 255, 0.22);
      }

      .gm2-logo strong,
      .gm2-logo span {
        display: block;
      }

      .gm2-logo strong {
        font-size: 12px;
        font-weight: 950;
        letter-spacing: 0.8px;
      }

      .gm2-logo span {
        margin-top: 2px;
        color: #78b4ff;
        font-size: 8px;
        font-weight: 800;
        letter-spacing: 2px;
      }

      .gm2-side-label {
        padding: 4px 10px 7px;
        color: #5d789b;
        font-size: 7px;
        font-weight: 900;
        letter-spacing: 1.35px;
      }

      .gm2-nav {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .gm2-nav button {
        position: relative;
        min-height: 39px;
        width: 100%;
        padding: 0 9px;
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr) auto;
        align-items: center;
        gap: 5px;
        border: 1px solid transparent;
        border-radius: 9px;
        background: transparent;
        color: #a4b2c4;
        cursor: pointer;
        text-align: left;
        font-size: 9px;
        font-weight: 700;
        transition: 0.15s ease;
      }

      .gm2-nav button:hover {
        background: rgba(28, 80, 139, 0.15);
        color: white;
      }

      .gm2-nav button.active {
        border-color: rgba(39, 135, 255, 0.28);
        background: linear-gradient(90deg, rgba(25, 109, 226, 0.44), rgba(21, 80, 151, 0.25));
        color: white;
        box-shadow: inset 3px 0 0 var(--gm2-cyan);
      }

      .gm2-nav-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #a5b9d3;
      }

      .gm2-nav button.active .gm2-nav-icon {
        color: #7bc4ff;
      }

      .gm2-badge {
        min-width: 19px;
        height: 19px;
        padding: 0 5px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        color: white;
        font-size: 7px;
        font-style: normal;
        font-weight: 950;
        box-shadow: 0 0 18px rgba(255, 77, 94, 0.18);
      }

      .gm2-badge.red {
        background: #e83b4d;
      }

      .gm2-badge.orange {
        background: #d77f07;
      }

      .gm2-side-divider {
        height: 1px;
        margin: 9px 10px;
        background: rgba(117, 150, 188, 0.13);
      }

      .gm2-nav.secondary button {
        min-height: 37px;
      }

      .gm2-user-card {
        margin-top: auto;
        padding: 11px 8px 2px;
        display: grid;
        grid-template-columns: 35px minmax(0, 1fr) 26px;
        align-items: center;
        gap: 8px;
        border-top: 1px solid rgba(117, 150, 188, 0.13);
      }

      .gm2-avatar,
      .gm2-top-avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: linear-gradient(145deg, #1668df, #419bff);
        color: white;
        font-weight: 900;
        box-shadow: 0 0 20px rgba(39, 135, 255, 0.18);
      }

      .gm2-avatar {
        width: 35px;
        height: 35px;
        font-size: 10px;
      }

      .gm2-user-card strong,
      .gm2-user-card span {
        display: block;
      }

      .gm2-user-card strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 9px;
      }

      .gm2-user-card span {
        margin-top: 2px;
        color: var(--gm2-muted);
        font-size: 7px;
      }

      .gm2-user-card button {
        width: 25px;
        height: 25px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        color: var(--gm2-muted);
        cursor: pointer;
      }

      .gm2-workspace {
        min-width: 0;
      }

      .gm2-topbar {
        position: sticky;
        top: 0;
        z-index: 35;
        min-height: 57px;
        padding: 8px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        border-bottom: 1px solid rgba(120, 157, 199, 0.13);
        background: rgba(4, 11, 19, 0.9);
        backdrop-filter: blur(20px);
        box-sizing: border-box;
      }

      .gm2-global-search {
        width: min(500px, 47vw);
        min-height: 39px;
        padding: 0 11px;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 9px;
        border: 1px solid rgba(61, 117, 184, 0.34);
        border-radius: 10px;
        background: rgba(8, 24, 42, 0.84);
        color: var(--gm2-muted);
        cursor: pointer;
        text-align: left;
        font-size: 8px;
      }

      .gm2-global-search span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gm2-global-search kbd,
      .gm2-search-modal-head kbd {
        padding: 4px 7px;
        border: 1px solid rgba(126, 159, 197, 0.2);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.03);
        color: #7f91aa;
        font-family: inherit;
        font-size: 7px;
        font-weight: 800;
      }

      .gm2-top-status {
        display: flex;
        align-items: center;
        gap: 9px;
      }

      .gm2-icon-button {
        position: relative;
        width: 35px;
        height: 35px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(120, 157, 199, 0.18);
        border-radius: 10px;
        background: #091522;
        color: #a3b5ca;
        cursor: pointer;
      }

      .gm2-icon-button > span {
        position: absolute;
        top: -5px;
        right: -4px;
        width: 17px;
        height: 17px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: var(--gm2-red);
        color: white;
        font-size: 7px;
        font-weight: 900;
      }

      .gm2-sync-pill {
        min-height: 31px;
        padding: 0 10px;
        display: flex;
        align-items: center;
        gap: 6px;
        border: 1px solid rgba(36, 212, 123, 0.15);
        border-radius: 999px;
        background: rgba(36, 212, 123, 0.06);
        color: #62e6a3;
        font-size: 7px;
        font-weight: 800;
      }

      .gm2-sync-pill > span {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: var(--gm2-green);
        box-shadow: 0 0 11px rgba(36, 212, 123, 0.75);
      }

      .gm2-clock {
        min-width: 122px;
        text-align: right;
      }

      .gm2-clock span,
      .gm2-clock strong {
        display: block;
      }

      .gm2-clock span {
        color: var(--gm2-muted);
        font-size: 6.5px;
      }

      .gm2-clock strong {
        margin-top: 1px;
        font-size: 18px;
        line-height: 1;
        letter-spacing: -0.5px;
      }

      .gm2-top-avatar {
        width: 34px;
        height: 34px;
        font-size: 10px;
      }

      .gm2-main {
        width: 100%;
        max-width: 1480px;
        margin: 0 auto;
        padding: 12px 14px 30px;
        box-sizing: border-box;
      }

      .gm2-hero {
        position: relative;
        overflow: hidden;
        min-height: 198px;
        padding: 22px 23px;
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.6fr);
        align-items: stretch;
        gap: 24px;
        border: 1px solid rgba(88, 139, 200, 0.19);
        border-radius: 17px;
        background:
          linear-gradient(120deg, rgba(8, 22, 37, 0.97), rgba(7, 19, 33, 0.93)),
          #081526;
        box-shadow: 0 20px 55px rgba(0, 0, 0, 0.2);
      }

      .gm2-hero-grid {
        position: absolute;
        inset: 0;
        opacity: 0.11;
        background-image:
          linear-gradient(rgba(87, 137, 199, 0.2) 1px, transparent 1px),
          linear-gradient(90deg, rgba(87, 137, 199, 0.2) 1px, transparent 1px);
        background-size: 36px 36px;
        mask-image: linear-gradient(to right, black, transparent 82%);
      }

      .gm2-aurora {
        position: absolute;
        pointer-events: none;
        border-radius: 999px;
        filter: blur(6px);
      }

      .gm2-aurora-one {
        width: 430px;
        height: 300px;
        top: -210px;
        right: 23%;
        background: rgba(31, 106, 229, 0.2);
      }

      .gm2-aurora-two {
        width: 250px;
        height: 210px;
        right: -100px;
        bottom: -130px;
        background: rgba(99, 57, 199, 0.18);
      }

      .gm2-hero-copy,
      .gm2-hero-side {
        position: relative;
        z-index: 2;
      }

      .gm2-live-label {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #78a8e8;
        font-size: 7px;
        font-weight: 900;
        letter-spacing: 1.25px;
      }

      .gm2-live-label > span {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: var(--gm2-green);
        box-shadow: 0 0 12px rgba(36, 212, 123, 0.8);
      }

      .gm2-hero h1 {
        margin: 12px 0 0;
        color: white;
        font-size: clamp(35px, 4vw, 52px);
        line-height: 0.96;
        font-weight: 900;
        letter-spacing: -2px;
      }

      .gm2-hero h1 strong {
        background: linear-gradient(90deg, #1988ff 0%, #4e8fff 45%, #875bff 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }

      .gm2-hero-copy > p {
        margin: 11px 0 0;
        color: #8ea0b8;
        font-size: 11px;
      }

      .gm2-hero-actions {
        margin-top: 18px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .gm2-action-button {
        min-height: 39px;
        padding: 0 13px;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        border: 1px solid rgba(62, 132, 220, 0.28);
        border-radius: 9px;
        background: rgba(10, 29, 49, 0.86);
        color: #dce9f9;
        cursor: pointer;
        font-size: 8px;
        font-weight: 800;
        transition: 0.15s ease;
      }

      .gm2-action-button:hover {
        transform: translateY(-1px);
        border-color: rgba(66, 151, 255, 0.55);
      }

      .gm2-action-button.primary {
        border-color: #2787ff;
        background: linear-gradient(135deg, #1686ff, #0871e6);
        color: white;
        box-shadow: 0 0 24px rgba(39, 135, 255, 0.22);
      }

      .gm2-hero-side {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 12px;
      }

      .gm2-hero-quote {
        max-width: 330px;
        margin-left: auto;
        color: #a5b5ca;
        font-size: 10px;
        font-style: italic;
        line-height: 1.55;
        text-align: right;
      }

      .gm2-hero-mini {
        margin-left: auto;
        width: min(100%, 360px);
        padding: 12px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        border: 1px solid rgba(102, 154, 214, 0.16);
        border-radius: 13px;
        background: rgba(5, 15, 26, 0.56);
        backdrop-filter: blur(10px);
      }

      .gm2-hero-mini > div {
        padding: 8px 9px;
        border-radius: 9px;
        background: rgba(255, 255, 255, 0.025);
      }

      .gm2-hero-mini span,
      .gm2-hero-mini strong {
        display: block;
      }

      .gm2-hero-mini span {
        color: #7186a0;
        font-size: 6.5px;
        text-transform: uppercase;
        font-weight: 800;
        letter-spacing: 0.4px;
      }

      .gm2-hero-mini strong {
        margin-top: 4px;
        font-size: 20px;
      }

      .gm2-hero-mini button {
        grid-column: 1 / -1;
        min-height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        border: 1px solid rgba(39, 135, 255, 0.24);
        border-radius: 8px;
        background: rgba(39, 135, 255, 0.09);
        color: #65adff;
        cursor: pointer;
        font-size: 7px;
        font-weight: 900;
      }

      .gm2-error-banner {
        margin-top: 10px;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        border: 1px solid rgba(255, 77, 94, 0.22);
        border-radius: 10px;
        background: rgba(255, 77, 94, 0.06);
        color: var(--gm2-red);
      }

      .gm2-error-banner strong,
      .gm2-error-banner span {
        display: block;
      }

      .gm2-error-banner strong {
        color: #ffdce0;
        font-size: 8px;
      }

      .gm2-error-banner span {
        margin-top: 2px;
        color: #a78389;
        font-size: 7px;
      }

      .gm2-kpi-grid {
        margin-top: 10px;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }

      .gm2-kpi-card {
        min-width: 0;
        min-height: 92px;
        padding: 13px;
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        border: 1px solid var(--gm2-border);
        border-radius: 12px;
        background: linear-gradient(145deg, #0a1725, #08131f);
        color: var(--gm2-text);
        text-align: left;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.1);
      }

      button.gm2-kpi-card {
        cursor: pointer;
        transition: 0.15s ease;
      }

      button.gm2-kpi-card:hover {
        transform: translateY(-2px);
        border-color: var(--gm2-border-strong);
      }

      .gm2-kpi-card > svg {
        color: #536a87;
      }

      .gm2-kpi-icon {
        width: 41px;
        height: 41px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
      }

      .gm2-kpi-icon.blue,
      .gm2-quick-icon.blue,
      .gm2-result-icon.blue {
        color: #5aa5ff;
        background: rgba(39, 135, 255, 0.12);
      }

      .gm2-kpi-icon.orange,
      .gm2-quick-icon.orange,
      .gm2-result-icon.orange {
        color: #ffb648;
        background: rgba(255, 172, 47, 0.12);
      }

      .gm2-kpi-icon.violet,
      .gm2-quick-icon.violet,
      .gm2-result-icon.violet {
        color: #a789ff;
        background: rgba(141, 102, 255, 0.12);
      }

      .gm2-kpi-icon.green,
      .gm2-quick-icon.green,
      .gm2-result-icon.green {
        color: #58dda0;
        background: rgba(36, 212, 123, 0.12);
      }

      .gm2-quick-icon.cyan,
      .gm2-result-icon.cyan {
        color: #60d8f0;
        background: rgba(39, 197, 233, 0.11);
      }

      .gm2-quick-icon.red {
        color: #ff7180;
        background: rgba(255, 77, 94, 0.11);
      }

      .gm2-kpi-card > div > span,
      .gm2-kpi-card > div > strong,
      .gm2-kpi-card > div > small {
        display: block;
      }

      .gm2-kpi-title {
        color: #8496ad;
        font-size: 7px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .gm2-kpi-card > div > strong {
        margin-top: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: white;
        font-size: clamp(18px, 2vw, 25px);
        line-height: 1;
        letter-spacing: -0.8px;
      }

      .gm2-kpi-card > div > small {
        margin-top: 5px;
        color: #667a95;
        font-size: 6.5px;
      }

      .gm2-dashboard-grid {
        margin-top: 10px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 250px;
        gap: 10px;
        align-items: start;
      }

      .gm2-column-main {
        min-width: 0;
      }

      .gm2-analytics-grid {
        display: grid;
        grid-template-columns: 1.25fr 0.9fr 0.85fr;
        gap: 10px;
      }

      .gm2-panel {
        min-width: 0;
        padding: 13px;
        border: 1px solid var(--gm2-border);
        border-radius: 12px;
        background: linear-gradient(145deg, #091522, #07121e);
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.08);
      }

      .gm2-panel-title {
        min-height: 33px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 9px;
      }

      .gm2-panel-title strong,
      .gm2-panel-title span {
        display: block;
      }

      .gm2-panel-title strong {
        color: #f4f8ff;
        font-size: 10px;
        font-weight: 900;
      }

      .gm2-panel-title span {
        margin-top: 3px;
        color: #657991;
        font-size: 6.5px;
      }

      .gm2-panel-title button {
        padding: 0;
        display: flex;
        align-items: center;
        gap: 5px;
        border: none;
        background: transparent;
        color: #3d9aff;
        cursor: pointer;
        font-size: 6.5px;
        font-weight: 850;
      }

      .gm2-ranking {
        margin-top: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .gm2-ranking-row {
        width: 100%;
        min-width: 0;
        padding: 5px 4px;
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr);
        align-items: center;
        gap: 7px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: white;
        cursor: pointer;
        text-align: left;
      }

      .gm2-ranking-row:hover {
        background: rgba(255, 255, 255, 0.025);
      }

      .gm2-rank-number {
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.045);
        color: #92a3b9;
        font-size: 7px;
        font-weight: 900;
      }

      .gm2-rank-copy > div:first-child {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .gm2-rank-copy strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 7.5px;
      }

      .gm2-rank-copy span {
        color: #9db0c8;
        font-size: 6.5px;
      }

      .gm2-rank-track {
        height: 4px;
        margin-top: 5px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.045);
      }

      .gm2-rank-track span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #1d78f2, #36a3ff);
        box-shadow: 0 0 11px rgba(39, 135, 255, 0.28);
      }

      .gm2-stock-donut-wrap {
        min-height: 170px;
        display: grid;
        grid-template-columns: 118px minmax(0, 1fr);
        align-items: center;
        gap: 12px;
      }

      .gm2-stock-donut {
        width: 112px;
        height: 112px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        box-shadow: 0 0 30px rgba(39, 135, 255, 0.06);
      }

      .gm2-stock-donut > div {
        width: 72px;
        height: 72px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: #08141f;
        box-shadow: inset 0 0 0 1px rgba(130, 160, 194, 0.12);
      }

      .gm2-stock-donut strong {
        font-size: 20px;
      }

      .gm2-stock-donut span {
        margin-top: 2px;
        color: #71849c;
        font-size: 6px;
      }

      .gm2-stock-legend {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .gm2-stock-legend button {
        min-width: 0;
        padding: 6px 0;
        display: grid;
        grid-template-columns: 8px minmax(0, 1fr) auto;
        align-items: center;
        gap: 7px;
        border: none;
        background: transparent;
        color: white;
        cursor: pointer;
        text-align: left;
      }

      .gm2-dot {
        width: 7px;
        height: 7px;
        border-radius: 999px;
      }

      .gm2-dot.green {
        background: var(--gm2-green);
      }

      .gm2-dot.orange {
        background: var(--gm2-orange);
      }

      .gm2-dot.red {
        background: var(--gm2-red);
      }

      .gm2-stock-legend strong,
      .gm2-stock-legend small {
        display: block;
      }

      .gm2-stock-legend strong {
        font-size: 7px;
      }

      .gm2-stock-legend small {
        margin-top: 2px;
        color: #687b93;
        font-size: 6px;
      }

      .gm2-stock-legend em {
        color: #8ca0b9;
        font-size: 6.5px;
        font-style: normal;
        font-weight: 800;
      }

      .gm2-order-bars {
        margin-top: 13px;
        display: flex;
        flex-direction: column;
        gap: 13px;
      }

      .gm2-order-bar > div:first-child {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .gm2-order-bar span {
        color: #8da1bb;
        font-size: 7px;
      }

      .gm2-order-bar strong {
        font-size: 8px;
      }

      .gm2-order-track {
        height: 6px;
        margin-top: 5px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.05);
      }

      .gm2-order-track span {
        display: block;
        height: 100%;
        border-radius: inherit;
      }

      .gm2-order-track span.blue {
        background: linear-gradient(90deg, #1979f1, #43a1ff);
      }

      .gm2-order-track span.orange {
        background: linear-gradient(90deg, #e28c13, #ffb84b);
      }

      .gm2-order-track span.green {
        background: linear-gradient(90deg, #17aa60, #38df8a);
      }

      .gm2-panel-action {
        width: 100%;
        min-height: 32px;
        margin-top: 17px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border: 1px solid rgba(76, 132, 197, 0.15);
        border-radius: 8px;
        background: rgba(39, 135, 255, 0.05);
        color: #59a8ff;
        cursor: pointer;
        font-size: 7px;
        font-weight: 850;
      }

      .gm2-lower-grid {
        margin-top: 10px;
        display: grid;
        grid-template-columns: 1fr 1fr 0.95fr;
        gap: 10px;
      }

      .gm2-task-list,
      .gm2-activity-list {
        margin-top: 9px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .gm2-task-row,
      .gm2-activity-row {
        width: 100%;
        min-width: 0;
        min-height: 48px;
        padding: 6px 7px;
        display: grid;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(115, 150, 190, 0.1);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.018);
        color: white;
        cursor: pointer;
        text-align: left;
      }

      .gm2-task-row {
        grid-template-columns: 34px minmax(0, 1fr) auto;
      }

      .gm2-task-icon,
      .gm2-activity-icon {
        width: 33px;
        height: 33px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 9px;
      }

      .gm2-task-icon.red {
        color: #ff6b79;
        background: rgba(255, 77, 94, 0.12);
      }

      .gm2-task-icon.orange {
        color: #ffb548;
        background: rgba(255, 172, 47, 0.12);
      }

      .gm2-task-icon.violet {
        color: #a789ff;
        background: rgba(141, 102, 255, 0.12);
      }

      .gm2-task-icon.blue {
        color: #62adff;
        background: rgba(39, 135, 255, 0.12);
      }

      .gm2-task-row strong,
      .gm2-task-row span,
      .gm2-activity-row strong,
      .gm2-activity-row span {
        display: block;
      }

      .gm2-task-row strong,
      .gm2-activity-row strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 7.5px;
      }

      .gm2-task-row div > span,
      .gm2-activity-row div > span {
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #6f829a;
        font-size: 6.3px;
      }

      .gm2-task-row > svg {
        color: #526a86;
      }

      .gm2-activity-row {
        grid-template-columns: 34px minmax(0, 1fr) auto;
      }

      .gm2-activity-icon {
        color: #60d7a0;
        background: rgba(36, 212, 123, 0.11);
      }

      .gm2-activity-row time {
        color: #7387a0;
        font-size: 6px;
      }

      .gm2-quick-grid {
        margin-top: 9px;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
      }

      .gm2-quick-tile {
        position: relative;
        min-height: 70px;
        padding: 7px 5px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border: 1px solid rgba(115, 150, 190, 0.12);
        border-radius: 9px;
        background: rgba(255, 255, 255, 0.02);
        color: white;
        cursor: pointer;
      }

      .gm2-quick-tile:hover {
        border-color: rgba(39, 135, 255, 0.34);
        background: rgba(39, 135, 255, 0.05);
      }

      .gm2-quick-icon {
        width: 31px;
        height: 31px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
      }

      .gm2-quick-tile strong {
        font-size: 6.5px;
      }

      .gm2-quick-tile em {
        position: absolute;
        top: 4px;
        right: 4px;
        min-width: 16px;
        height: 16px;
        padding: 0 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: #db7b06;
        color: white;
        font-size: 5.5px;
        font-style: normal;
        font-weight: 900;
      }

      .gm2-right-rail {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .gm2-calendar-panel {
        padding-bottom: 10px;
      }

      .gm2-calendar-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 9px;
      }

      .gm2-calendar-head strong,
      .gm2-calendar-head span {
        display: block;
      }

      .gm2-calendar-head strong {
        font-size: 10px;
      }

      .gm2-calendar-head span {
        margin-top: 3px;
        color: #73869f;
        font-size: 6.5px;
      }

      .gm2-calendar-head > svg {
        color: #4ca1ff;
      }

      .gm2-date-big {
        margin: 10px 0 8px;
        color: white;
        font-size: 44px;
        line-height: 1;
        font-weight: 900;
        letter-spacing: -2px;
      }

      .gm2-agenda-title {
        padding-top: 9px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        border-top: 1px solid rgba(115, 150, 190, 0.12);
      }

      .gm2-agenda-title strong {
        font-size: 8px;
      }

      .gm2-agenda-title button {
        padding: 0;
        border: none;
        background: transparent;
        color: #4099ff;
        cursor: pointer;
        font-size: 6px;
        font-weight: 850;
      }

      .gm2-agenda-list {
        margin-top: 7px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .gm2-agenda-list button {
        min-height: 42px;
        padding: 5px 4px;
        display: grid;
        grid-template-columns: 4px minmax(0, 1fr);
        align-items: center;
        gap: 7px;
        border: none;
        border-radius: 7px;
        background: transparent;
        color: white;
        cursor: pointer;
        text-align: left;
      }

      .gm2-agenda-list button:hover {
        background: rgba(255, 255, 255, 0.02);
      }

      .gm2-agenda-line {
        width: 3px;
        height: 29px;
        border-radius: 999px;
        background: #2787ff;
      }

      .gm2-agenda-line.tone-2 {
        background: #8d66ff;
      }

      .gm2-agenda-line.tone-3 {
        background: #f59e0b;
      }

      .gm2-agenda-line.tone-4 {
        background: #24d47b;
      }

      .gm2-agenda-list strong,
      .gm2-agenda-list span {
        display: block;
      }

      .gm2-agenda-list strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 6.8px;
      }

      .gm2-agenda-list span {
        margin-top: 2px;
        color: #6f839b;
        font-size: 5.8px;
      }

      .gm2-agenda-empty {
        padding: 12px 4px;
        color: #6f839b;
        font-size: 6.5px;
      }

      .gm2-critical-list {
        margin-top: 8px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .gm2-critical-list > button {
        width: 100%;
        min-width: 0;
        min-height: 45px;
        padding: 5px 3px;
        display: grid;
        grid-template-columns: 32px minmax(0, 1fr) auto;
        align-items: center;
        gap: 7px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: white;
        cursor: pointer;
        text-align: left;
      }

      .gm2-critical-list > button:hover {
        background: rgba(255, 255, 255, 0.025);
      }

      .gm2-critical-icon {
        width: 31px;
        height: 31px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
      }

      .gm2-critical-icon.red {
        color: #ff6978;
        background: rgba(255, 77, 94, 0.12);
      }

      .gm2-critical-icon.orange {
        color: #ffb54a;
        background: rgba(255, 172, 47, 0.12);
      }

      .gm2-critical-list strong,
      .gm2-critical-list span {
        display: block;
      }

      .gm2-critical-list strong {
        font-size: 7px;
      }

      .gm2-critical-list span {
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #6f8298;
        font-size: 5.8px;
      }

      .gm2-critical-list em {
        font-size: 7px;
        font-style: normal;
        font-weight: 900;
      }

      .gm2-critical-list em.red {
        color: #ff5a69;
      }

      .gm2-critical-list em.orange {
        color: #ffad38;
      }

      .gm2-system-panel {
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr);
        gap: 9px;
        background:
          radial-gradient(circle at 0 0, rgba(36, 212, 123, 0.12), transparent 35%),
          linear-gradient(145deg, #091522, #07121e);
      }

      .gm2-system-ok {
        width: 41px;
        height: 41px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(36, 212, 123, 0.24);
        border-radius: 999px;
        background: rgba(36, 212, 123, 0.11);
        color: #57e39d;
        box-shadow: 0 0 20px rgba(36, 212, 123, 0.08);
      }

      .gm2-system-panel > div:nth-child(2) strong,
      .gm2-system-panel > div:nth-child(2) span {
        display: block;
      }

      .gm2-system-panel > div:nth-child(2) strong {
        margin-top: 5px;
        font-size: 8.5px;
      }

      .gm2-system-panel > div:nth-child(2) span {
        margin-top: 3px;
        color: #52cf8f;
        font-size: 6px;
      }

      .gm2-system-list {
        grid-column: 1 / -1;
        margin-top: 4px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .gm2-system-row {
        min-height: 31px;
        padding: 0 7px;
        display: grid;
        grid-template-columns: 8px minmax(0, 1fr) auto;
        align-items: center;
        gap: 6px;
        border: 1px solid rgba(115, 150, 190, 0.09);
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.015);
      }

      .gm2-system-dot {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: #24d47b;
      }

      .gm2-system-dot.warning {
        background: #f59e0b;
      }

      .gm2-system-row strong {
        font-size: 6.5px;
      }

      .gm2-system-row em {
        color: #4fd993;
        font-size: 5.8px;
        font-style: normal;
        font-weight: 850;
      }

      .gm2-empty-state,
      .gm2-locked-state {
        min-height: 125px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #687b93;
        text-align: center;
      }

      .gm2-empty-state > span,
      .gm2-locked-state > svg {
        width: 37px;
        height: 37px;
        margin-bottom: 7px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
        color: #55da99;
      }

      .gm2-empty-state strong,
      .gm2-locked-state strong {
        color: #dce7f6;
        font-size: 7.5px;
      }

      .gm2-empty-state small,
      .gm2-locked-state span {
        margin-top: 3px;
        max-width: 190px;
        color: #687b93;
        font-size: 6px;
        line-height: 1.45;
      }

      .gm2-search-overlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        padding: 78px 18px 18px;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        background: rgba(1, 6, 12, 0.72);
        backdrop-filter: blur(12px);
      }

      .gm2-search-modal {
        width: min(720px, 100%);
        overflow: hidden;
        border: 1px solid rgba(66, 134, 216, 0.3);
        border-radius: 15px;
        background: #081522;
        box-shadow: 0 30px 100px rgba(0, 0, 0, 0.55);
      }

      .gm2-search-modal-head {
        min-height: 57px;
        padding: 0 15px;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        border-bottom: 1px solid rgba(115, 150, 190, 0.12);
        color: #70b5ff;
      }

      .gm2-search-modal-head input {
        width: 100%;
        border: none;
        outline: none;
        background: transparent;
        color: white;
        font-size: 13px;
        font-weight: 700;
      }

      .gm2-search-modal-head input::placeholder {
        color: #5c718d;
      }

      .gm2-search-hint {
        padding: 8px 15px;
        color: #627791;
        font-size: 6.5px;
        font-weight: 750;
        letter-spacing: 0.25px;
      }

      .gm2-search-results {
        max-height: 480px;
        overflow-y: auto;
        padding: 0 8px 8px;
      }

      .gm2-search-results > button {
        width: 100%;
        min-width: 0;
        min-height: 56px;
        padding: 7px 9px;
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 9px;
        border: 1px solid transparent;
        border-radius: 9px;
        background: transparent;
        color: white;
        cursor: pointer;
        text-align: left;
      }

      .gm2-search-results > button:hover {
        border-color: rgba(39, 135, 255, 0.18);
        background: rgba(39, 135, 255, 0.06);
      }

      .gm2-result-icon {
        width: 37px;
        height: 37px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
      }

      .gm2-search-results strong,
      .gm2-search-results span {
        display: block;
      }

      .gm2-search-results strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 8.5px;
      }

      .gm2-search-results div > span {
        margin-top: 3px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #6f839c;
        font-size: 6.5px;
      }

      .gm2-search-results em {
        padding: 5px 7px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.04);
        color: #8398b2;
        font-size: 5.8px;
        font-style: normal;
        font-weight: 800;
      }

      .gm2-search-results > button > svg {
        color: #4d6785;
      }

      .gm2-no-results {
        min-height: 180px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #60758e;
        text-align: center;
      }

      .gm2-no-results strong {
        margin-top: 9px;
        color: #d3deec;
      }

      .gm2-no-results span {
        margin-top: 4px;
        font-size: 6.5px;
      }

      .gm2-mobile-nav {
        display: none;
      }

      @media (max-width: 1180px) {
        .gm2-app {
          grid-template-columns: 70px minmax(0, 1fr);
        }

        .gm2-logo > div:last-child,
        .gm2-side-label,
        .gm2-nav button > span:nth-child(2),
        .gm2-user-card > div:nth-child(2) {
          display: none;
        }

        .gm2-logo {
          justify-content: center;
          padding-left: 0;
          padding-right: 0;
        }

        .gm2-nav button {
          grid-template-columns: 1fr;
          justify-items: center;
          padding: 0;
        }

        .gm2-badge {
          position: absolute;
          top: 3px;
          right: 3px;
        }

        .gm2-user-card {
          grid-template-columns: 1fr;
          justify-items: center;
        }

        .gm2-user-card > button {
          display: none;
        }

        .gm2-dashboard-grid {
          grid-template-columns: minmax(0, 1fr) 230px;
        }

        .gm2-analytics-grid {
          grid-template-columns: 1fr 1fr;
        }

        .gm2-value-panel {
          grid-column: 1 / -1;
        }

        .gm2-lower-grid {
          grid-template-columns: 1fr 1fr;
        }

        .gm2-lower-grid > .gm2-panel:last-child {
          grid-column: 1 / -1;
        }
      }

      @media (max-width: 900px) {
        .gm2-app {
          display: block;
          margin: -20px -14px -40px;
          padding-bottom: 66px;
        }

        .gm2-sidebar,
        .gm2-topbar {
          display: none;
        }

        .gm2-main {
          padding: 10px 10px 24px;
        }

        .gm2-hero {
          min-height: auto;
          grid-template-columns: 1fr;
          padding: 18px 16px;
          border-radius: 15px;
        }

        .gm2-hero-side {
          display: none;
        }

        .gm2-hero h1 {
          font-size: 39px;
        }

        .gm2-kpi-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .gm2-dashboard-grid {
          grid-template-columns: 1fr;
        }

        .gm2-right-rail {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }

        .gm2-system-panel {
          grid-column: 1 / -1;
        }

        .gm2-mobile-nav {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9990;
          height: 62px;
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          border-top: 1px solid rgba(99, 139, 188, 0.16);
          background: rgba(4, 11, 19, 0.94);
          backdrop-filter: blur(18px);
        }

        .gm2-mobile-nav button {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          border: none;
          background: transparent;
          color: #6d829c;
          font-size: 6px;
          font-weight: 800;
        }

        .gm2-mobile-nav button.active {
          color: #4ca1ff;
        }
      }

      @media (max-width: 620px) {
        .gm2-hero-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }

        .gm2-action-button {
          justify-content: center;
        }

        .gm2-kpi-card {
          min-height: 82px;
          padding: 10px;
          grid-template-columns: 35px minmax(0, 1fr);
        }

        .gm2-kpi-card > svg {
          display: none;
        }

        .gm2-kpi-icon {
          width: 34px;
          height: 34px;
        }

        .gm2-kpi-card > div > strong {
          font-size: 19px;
        }

        .gm2-analytics-grid,
        .gm2-lower-grid,
        .gm2-right-rail {
          grid-template-columns: 1fr;
        }

        .gm2-value-panel,
        .gm2-lower-grid > .gm2-panel:last-child,
        .gm2-system-panel {
          grid-column: auto;
        }

        .gm2-stock-donut-wrap {
          grid-template-columns: 105px minmax(0, 1fr);
        }

        .gm2-stock-donut {
          width: 100px;
          height: 100px;
        }

        .gm2-quick-grid {
          grid-template-columns: repeat(4, 1fr);
        }

        .gm2-search-overlay {
          padding: 18px 10px;
        }

        .gm2-search-modal {
          margin-top: 8px;
        }
      }
    `}</style>
  );
}

function HomeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M4 11L12 4L20 11V20H4V11Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 20V14H15V20" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CubeIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
      <path d="M4 8L12 4L20 8V17L12 21L4 17V8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M4 8L12 12L20 8M12 12V21" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function WarehouseIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M3 10L12 4L21 10V20H3V10Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7 20V13H17V20M9 16H15" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function OrderIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="4" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 8H16M8 12H16M8 16H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MovementIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M4 8H18M14 4L18 8L14 12M20 16H6M10 12L6 16L10 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M12 4L21 20H3L12 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 9V14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 19C3.8 15.7 5.7 14 9 14C12.3 14 14.2 15.7 14.5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 14.5C19.1 14.4 20.7 15.9 20.9 18.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function BarcodeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M4 5V19M8 5V19M11 5V19M15 5V19M19 5V19" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M6 16V10C6 6.7 8.4 4.5 12 4.5C15.6 4.5 18 6.7 18 10V16L20 18H4L6 16Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 20H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M5 4H19V16L15 20H5V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M15 20V16H19M8 8H16M8 12H14" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 3.5V6M12 18V20.5M3.5 12H6M18 12H20.5M6 6L7.8 7.8M16.2 16.2L18 18M18 6L16.2 7.8M7.8 16.2L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M20 7V3L17.5 5.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M19 6C17.5 4.5 15.3 3.5 13 3.5C8.3 3.5 4.5 7.3 4.5 12" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 17V21L6.5 18.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 18C6.5 19.5 8.7 20.5 11 20.5C15.7 20.5 19.5 16.7 19.5 12" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M5 12H19M14 7L19 12L14 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EuroIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M18 6.5C16.8 5.2 15.2 4.5 13.3 4.5C9.7 4.5 7 7.4 7 12C7 16.6 9.7 19.5 13.3 19.5C15.2 19.5 16.8 18.8 18 17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4.5 9.5H14.5M4.5 14.5H14.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3V7M16 3V7M4 10H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M5 12.5L10 17L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 3L19 6V11C19 15.4 16.4 18.5 12 21C7.6 18.5 5 15.4 5 11V6L12 3Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
