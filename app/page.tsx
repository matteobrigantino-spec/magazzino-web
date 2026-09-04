"use client";

import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

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
  price: number;
  stock: number;
  min_stock: number;
  on_order: number;
};

type Order = {
  id: string;
  supplier_id: string;
  status: string;
  order_date: string | null;
  created_at: string | null;
};

type LowStockItem = Item & {
  qty_to_order: number;
};

type Reminder = {
  id: string;
  title: string;
  reminder_date: string;
  note: string | null;
  is_done: boolean;
  completed_at: string | null;
  created_at: string;
};

const DAILY_QUOTES = [
  "La precisione di oggi costruisce il risultato di domani.",
  "Organizzare bene oggi significa avere più tempo domani.",
  "Ogni movimento corretto rende il magazzino più efficiente.",
  "Un magazzino organizzato è un'azienda che lavora meglio.",
  "I risultati migliori nascono dall'attenzione ai dettagli.",
  "La qualità del lavoro si vede anche nelle piccole cose.",
  "Ogni dato corretto è una decisione migliore.",
  "La costanza fa la differenza più della velocità.",
  "Controllo e organizzazione rendono il lavoro più semplice.",
  "Un buon sistema rende semplice anche il lavoro più complesso.",
  "Migliorare un processo ogni giorno significa crescere davvero.",
  "La precisione evita di dover fare due volte lo stesso lavoro.",
  "Ogni articolo al posto giusto è tempo guadagnato.",
  "Controllare oggi evita problemi domani.",
  "Le buone abitudini costruiscono grandi risultati.",
  "L'efficienza nasce quando ogni passaggio ha uno scopo preciso.",
  "Avere tutto sotto controllo significa lavorare con più serenità.",
  "Ogni miglioramento porta il sistema un passo più avanti.",
  "La chiarezza nei dati porta chiarezza nelle decisioni.",
  "Il tempo risparmiato grazie all'ordine è tempo guadagnato.",
  "Un processo affidabile vale più di una soluzione improvvisata.",
  "Una giornata organizzata comincia da informazioni affidabili.",
  "Fare bene una volta è meglio che correggere due volte.",
  "Un sistema ordinato permette di concentrarsi sulla crescita.",
  "Ogni controllo fatto bene elimina un dubbio futuro.",
  "Organizzazione significa sapere sempre cosa c'è e cosa manca.",
  "Un buon magazzino non deve sorprendere: deve informare.",
  "La continuità nel lavoro crea risultati solidi.",
  "Ridurre gli errori significa aumentare il tempo disponibile.",
  "L'affidabilità nasce da procedure semplici e precise.",
  "Ogni giornata è un'occasione per rendere il lavoro più fluido.",
  "Dati ordinati, decisioni veloci, lavoro più semplice.",
  "La professionalità si costruisce con sistemi che funzionano sempre.",
  "Un passo fatto bene oggi evita dieci passi inutili domani.",
  "La semplicità è il risultato di un'organizzazione fatta bene.",
  "Precisione, ordine e continuità rendono il lavoro più efficace.",
  "Sapere dove siamo oggi ci permette di decidere meglio domani.",
  "Ogni processo chiaro elimina tempo perso.",
  "L'organizzazione trasforma i dati in controllo.",
  "Un sistema affidabile lascia spazio alle cose importanti.",
];

export default function Home() {
  const router = useRouter();

  const [suppliers, setSuppliers] =
    useState<Supplier[]>([]);

  const [items, setItems] =
    useState<Item[]>([]);

  const [orders, setOrders] =
    useState<Order[]>([]);

  const [reminders, setReminders] =
    useState<Reminder[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [now, setNow] =
    useState<Date | null>(null);

  const [
    reminderModalOpen,
    setReminderModalOpen,
  ] = useState(false);

  const [
    reminderTitle,
    setReminderTitle,
  ] = useState("");

  const [
    reminderDate,
    setReminderDate,
  ] = useState("");

  const [
    reminderNote,
    setReminderNote,
  ] = useState("");

  const [
    savingReminder,
    setSavingReminder,
  ] = useState(false);

  useEffect(() => {
    setNow(new Date());

    const timer =
      window.setInterval(() => {
        setNow(new Date());
      }, 60 * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setErrorMessage("");

    const {
      data: suppliersData,
      error: suppliersError,
    } = await supabase
      .from("suppliers")
      .select("id,name")
      .order("name");

    if (suppliersError) {
      setErrorMessage(
        "Errore caricamento fornitori: " +
          suppliersError.message
      );

      setLoading(false);
      return;
    }

    const {
      data: itemsData,
      error: itemsError,
    } = await supabase
      .from("items")
      .select(
        "id,supplier_id,code,supplier_code,description,price,stock,min_stock,on_order"
      );

    if (itemsError) {
      setErrorMessage(
        "Errore caricamento articoli: " +
          itemsError.message
      );

      setLoading(false);
      return;
    }

    const {
      data: ordersData,
      error: ordersError,
    } = await supabase
      .from("orders")
      .select(
        "id,supplier_id,status,order_date,created_at"
      )
      .order("created_at", {
        ascending: false,
      });

    if (ordersError) {
      setErrorMessage(
        "Errore caricamento ordini: " +
          ordersError.message
      );

      setLoading(false);
      return;
    }

    const {
      data: remindersData,
      error: remindersError,
    } = await supabase
      .from("reminders")
      .select(
        "id,title,reminder_date,note,is_done,completed_at,created_at"
      )
      .eq("is_done", false)
      .order("reminder_date", {
        ascending: true,
      })
      .order("created_at", {
        ascending: true,
      });

    if (remindersError) {
      setErrorMessage(
        "Errore caricamento promemoria: " +
          remindersError.message
      );

      setLoading(false);
      return;
    }

    const cleanSuppliers: Supplier[] =
      (suppliersData || []).map(
        (row) => ({
          id: String(row.id),
          name: String(
            row.name || ""
          ),
        })
      );

    const cleanItems: Item[] =
      (itemsData || []).map(
        (row) => ({
          id: String(row.id),

          supplier_id:
            String(
              row.supplier_id
            ),

          code:
            String(
              row.code || ""
            ),

          supplier_code:
            row.supplier_code
              ? String(
                  row.supplier_code
                )
              : null,

          description:
            String(
              row.description || ""
            ),

          price:
            Number(
              row.price || 0
            ),

          stock:
            Number(
              row.stock || 0
            ),

          min_stock:
            Number(
              row.min_stock || 0
            ),

          on_order:
            Number(
              row.on_order || 0
            ),
        })
      );

    const cleanOrders: Order[] =
      (ordersData || []).map(
        (row) => ({
          id: String(row.id),

          supplier_id:
            String(
              row.supplier_id
            ),

          status:
            String(
              row.status || ""
            ),

          order_date:
            row.order_date
              ? String(
                  row.order_date
                )
              : null,

          created_at:
            row.created_at
              ? String(
                  row.created_at
                )
              : null,
        })
      );

    const cleanReminders:
      Reminder[] =
      (remindersData || []).map(
        (row) => ({
          id: String(row.id),

          title:
            String(
              row.title || ""
            ),

          reminder_date:
            String(
              row.reminder_date ||
                ""
            ),

          note:
            row.note
              ? String(row.note)
              : null,

          is_done:
            Boolean(
              row.is_done
            ),

          completed_at:
            row.completed_at
              ? String(
                  row.completed_at
                )
              : null,

          created_at:
            String(
              row.created_at ||
                ""
            ),
        })
      );

    setSuppliers(cleanSuppliers);
    setItems(cleanItems);
    setOrders(cleanOrders);
    setReminders(cleanReminders);

    setLoading(false);
  }

  function openReminderModal() {
    setReminderTitle("");
    setReminderNote("");
    setReminderDate(
      currentLocalDate()
    );

    setReminderModalOpen(
      true
    );
  }

  function closeReminderModal() {
    if (savingReminder) {
      return;
    }

    setReminderModalOpen(
      false
    );
  }

  async function createReminder() {
    const cleanTitle =
      reminderTitle.trim();

    if (!cleanTitle) {
      window.alert(
        "Inserisci il titolo del promemoria."
      );

      return;
    }

    if (!reminderDate) {
      window.alert(
        "Seleziona una data."
      );

      return;
    }

    setSavingReminder(true);

    const {
      error,
    } = await supabase
      .from("reminders")
      .insert({
        title:
          cleanTitle,

        reminder_date:
          reminderDate,

        note:
          reminderNote.trim() ||
          null,

        is_done:
          false,
      });

    if (error) {
      window.alert(
        "Errore salvataggio promemoria: " +
          error.message
      );

      setSavingReminder(false);
      return;
    }

    setSavingReminder(false);
    setReminderModalOpen(
      false
    );

    await loadReminders();
  }

  async function loadReminders() {
    const {
      data,
      error,
    } = await supabase
      .from("reminders")
      .select(
        "id,title,reminder_date,note,is_done,completed_at,created_at"
      )
      .eq("is_done", false)
      .order("reminder_date", {
        ascending: true,
      })
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      console.error(
        error
      );
      return;
    }

    const clean:
      Reminder[] =
      (data || []).map(
        (row) => ({
          id:
            String(
              row.id
            ),

          title:
            String(
              row.title ||
                ""
            ),

          reminder_date:
            String(
              row.reminder_date ||
                ""
            ),

          note:
            row.note
              ? String(
                  row.note
                )
              : null,

          is_done:
            Boolean(
              row.is_done
            ),

          completed_at:
            row.completed_at
              ? String(
                  row.completed_at
                )
              : null,

          created_at:
            String(
              row.created_at ||
                ""
            ),
        })
      );

    setReminders(clean);
  }

  async function completeReminder(
    id: string
  ) {
    const {
      error,
    } = await supabase
      .from("reminders")
      .update({
        is_done: true,
        completed_at:
          new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      window.alert(
        "Errore aggiornamento promemoria: " +
          error.message
      );

      return;
    }

    setReminders(
      (current) =>
        current.filter(
          (reminder) =>
            reminder.id !== id
        )
    );
  }

  const supplierMap =
    useMemo(() => {
      const map =
        new Map<
          string,
          string
        >();

      suppliers.forEach(
        (supplier) => {
          map.set(
            supplier.id,
            supplier.name
          );
        }
      );

      return map;
    }, [suppliers]);

  const lowStockItems =
    useMemo<
      LowStockItem[]
    >(() => {
      return items
        .map(
          (item) => ({
            ...item,

            qty_to_order:
              Math.max(
                0,
                item.min_stock -
                  item.stock -
                  item.on_order
              ),
          })
        )
        .filter(
          (item) =>
            item.qty_to_order >
            0
        )
        .sort(
          (a, b) =>
            b.qty_to_order -
            a.qty_to_order
        );
    }, [items]);

  const openOrders =
    useMemo(() => {
      return orders.filter(
        (order) =>
          order.status ===
            "ordered" ||
          order.status ===
            "partial"
      );
    }, [orders]);

  const totalOnOrder =
    useMemo(() => {
      return items.reduce(
        (sum, item) =>
          sum +
          item.on_order,
        0
      );
    }, [items]);

  const warehouseValue =
    useMemo(() => {
      return items.reduce(
        (sum, item) =>
          sum +
          item.stock *
            item.price,
        0
      );
    }, [items]);

  const dailyQuote =
    useMemo(() => {
      if (!now) {
        return DAILY_QUOTES[0];
      }

      const day =
        getDayOfYear(now);

      return DAILY_QUOTES[
        (day - 1) %
          DAILY_QUOTES.length
      ];
    }, [now]);

  const recentOrders =
    useMemo(() => {
      return [...orders]
        .sort(
          (a, b) =>
            orderTimestamp(b) -
            orderTimestamp(a)
        )
        .slice(0, 4);
    }, [orders]);

  if (loading) {
    return (
      <div className="home-loading">
        Caricamento Dashboard...
      </div>
    );
  }

  return (
    <div className="home-dashboard">
      {/* HERO */}

      <section className="home-hero">
        <div className="home-hero-circle home-circle-one" />
        <div className="home-hero-circle home-circle-two" />

        <div className="home-hero-main">
          <div className="home-hero-copy">
            <div className="home-brand-row">
              <WarehouseIcon />

              <span>
                MAGAZZINO
              </span>
            </div>

            <h1>
              Buongiorno{" "}
              <span>
                Matteo
              </span>
            </h1>

            <p className="home-hero-subtitle">
              Tutto sotto controllo,
              a colpo d&apos;occhio.
            </p>

            <div className="home-quote">
              <div className="home-quote-symbol">
                “
              </div>

              <div>
                <div className="home-quote-text">
                  {dailyQuote}
                </div>

                <div className="home-quote-label">
                  FRASE DEL GIORNO
                </div>
              </div>
            </div>
          </div>

          <div className="home-calendar">
            <div className="home-calendar-top">
              <strong>
                {now
                  ? formatWeekday(
                      now
                    )
                  : "—"}
              </strong>

              <div className="home-calendar-icon">
                <CalendarIcon />
              </div>
            </div>

            <div className="home-calendar-day">
              {now
                ? String(
                    now.getDate()
                  ).padStart(
                    2,
                    "0"
                  )
                : "--"}
            </div>

            <div className="home-calendar-month">
              {now
                ? `${formatMonth(
                    now
                  )} ${now.getFullYear()}`
                : "—"}
            </div>

            <div className="home-calendar-time">
              <ClockIcon />

              <strong>
                {now
                  ? formatTime(
                      now
                    )
                  : "--:--"}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {errorMessage && (
        <div className="home-error">
          {errorMessage}
        </div>
      )}

      {/* KPI */}

      <section className="home-kpi-grid">
        <KpiCard
          title="Da riordinare"
          value={String(
            lowStockItems.length
          )}
          subtitle="Codici sotto scorta"
          tone="orange"
          icon={
            <AlertIcon />
          }
          onClick={() =>
            router.push(
              "/low-stock-report"
            )
          }
        />

        <KpiCard
          title="Merce in arrivo"
          value={`${formatNumber(
            totalOnOrder
          )} pz`}
          subtitle="Quantità già ordinate"
          tone="blue"
          icon={
            <IncomingIcon />
          }
          onClick={() =>
            router.push(
              "/orders"
            )
          }
        />

        <KpiCard
          title="Ordini aperti"
          value={String(
            openOrders.length
          )}
          subtitle="In ordine o parziali"
          tone="purple"
          icon={
            <DocumentIcon />
          }
          onClick={() =>
            router.push(
              "/orders"
            )
          }
        />

        <KpiCard
          title="Valore magazzino"
          value={formatEuro(
            warehouseValue
          )}
          subtitle="Giacenza × prezzo"
          tone="green"
          icon={
            <EuroIcon />
          }
        />
      </section>

      {/* AZIONI RAPIDE */}

      <section className="home-panel home-actions-panel">
        <PanelTitle
          title="Azioni rapide"
          subtitle="Accesso diretto alle operazioni principali."
        />

        <div className="home-actions-grid">
          <QuickAction
            title="Nuovo fornitore"
            icon={<PlusIcon />}
            onClick={() =>
              router.push(
                "/suppliers/new"
              )
            }
          />

          <QuickAction
            title="Ordini"
            icon={<CartIcon />}
            onClick={() =>
              router.push(
                "/orders"
              )
            }
          />

          <QuickAction
            title="Gestisci fornitori"
            icon={<UsersIcon />}
            onClick={() =>
              router.push(
                "/suppliers"
              )
            }
          />

          <QuickAction
            title="Movimenti"
            icon={<MovementIcon />}
            onClick={() =>
              router.push(
                "/movements"
              )
            }
          />
        </div>
      </section>

      {/* PROMEMORIA + ATTIVITÀ */}

      <section className="home-lower-grid">
        <div className="home-panel">
          <PanelTitle
            title="Scadenze e promemoria"
            subtitle={
              reminders.length === 0
                ? "Nessun promemoria aperto"
                : `${reminders.length} promemoria aperti`
            }
            badge={
              reminders.length >
              0
                ? reminders.length
                : undefined
            }
            secondaryActionText="Vedi tutti"
            onSecondaryAction={() =>
              router.push(
                "/promemoria"
              )
            }
            actionText="+ Nuovo promemoria"
            onAction={
              openReminderModal
            }
          />

          <div className="home-reminders">
            {reminders.length ===
            0 ? (
              <div className="home-success-empty">
                <div className="home-success-icon">
                  ✓
                </div>

                <div>
                  <strong>
                    Nessun promemoria
                  </strong>

                  <span>
                    Premi “Nuovo promemoria”
                    per aggiungerne uno.
                  </span>
                </div>
              </div>
            ) : (
              reminders
                .slice(0, 6)
                .map(
                  (reminder) => {
                    const state =
                      reminderState(
                        reminder.reminder_date
                      );

                    return (
                      <div
                        key={
                          reminder.id
                        }
                        className="home-reminder-row"
                      >
                        <div
                          className="home-date-badge"
                          style={{
                            color:
                              state.color,

                            borderColor:
                              `${state.color}55`,

                            background:
                              `${state.color}12`,
                          }}
                        >
                          <strong>
                            {formatReminderDay(
                              reminder.reminder_date
                            )}
                          </strong>

                          <span>
                            {formatReminderMonth(
                              reminder.reminder_date
                            )}
                          </span>
                        </div>

                        <div className="home-reminder-copy">
                          <strong>
                            {
                              reminder.title
                            }
                          </strong>

                          <span
                            style={{
                              color:
                                state.color,
                            }}
                          >
                            {
                              state.label
                            }
                          </span>

                          {reminder.note && (
                            <small>
                              {
                                reminder.note
                              }
                            </small>
                          )}
                        </div>

                        <button
                          type="button"
                          className="home-done-button"
                          onClick={() =>
                            completeReminder(
                              reminder.id
                            )
                          }
                        >
                          ✓ Fatto
                        </button>
                      </div>
                    );
                  }
                )
            )}
          </div>
        </div>

        <div className="home-panel">
          <PanelTitle
            title="Attività recenti"
            subtitle="Ultimi ordini registrati"
            actionText="Vedi tutti"
            onAction={() =>
              router.push(
                "/orders"
              )
            }
          />

          <div className="home-activity-list">
            {recentOrders.length ===
            0 ? (
              <div className="home-empty">
                Nessuna attività recente.
              </div>
            ) : (
              recentOrders.map(
                (order) => (
                  <button
                    type="button"
                    key={order.id}
                    className="home-activity-row"
                    onClick={() =>
                      router.push(
                        `/orders/${order.id}`
                      )
                    }
                  >
                    <div className="home-activity-icon">
                      <DocumentIcon />
                    </div>

                    <div className="home-activity-copy">
                      <strong>
                        {supplierMap.get(
                          order.supplier_id
                        ) ||
                          "Ordine"}
                      </strong>

                      <span>
                        {formatDate(
                          order.order_date ||
                            order.created_at
                        )}
                      </span>
                    </div>

                    <StatusBadge
                      status={
                        order.status
                      }
                    />
                  </button>
                )
              )
            )}
          </div>
        </div>
      </section>

      {/* PANNELLI FINALI */}

      <section className="home-bottom-grid">
        <div className="home-panel">
          <PanelTitle
            title="Articoli da riordinare"
            subtitle="Le priorità attuali del magazzino"
            actionText="Vedi tutti"
            onAction={() =>
              router.push(
                "/low-stock-report"
              )
            }
          />

          {lowStockItems.length ===
          0 ? (
            <div className="home-empty">
              Nessun articolo da
              riordinare.
            </div>
          ) : (
            lowStockItems
              .slice(0, 5)
              .map((item) => (
                <div
                  key={item.id}
                  className="home-stock-row"
                >
                  <div>
                    <strong>
                      {item.supplier_code ||
                        item.code ||
                        "-"}
                    </strong>

                    <span>
                      {
                        item.description
                      }
                    </span>

                    <small>
                      {supplierMap.get(
                        item.supplier_id
                      ) ||
                        "Fornitore"}
                    </small>
                  </div>

                  <div className="home-stock-qty">
                    +
                    {
                      item.qty_to_order
                    }

                    <small>
                      da ordinare
                    </small>
                  </div>
                </div>
              ))
          )}
        </div>

        <div className="home-panel">
          <PanelTitle
            title="Ordini da ricevere"
            subtitle="Ordini ancora aperti"
            actionText="Tutti gli ordini"
            onAction={() =>
              router.push(
                "/orders"
              )
            }
          />

          {openOrders.length ===
          0 ? (
            <div className="home-empty">
              Nessun ordine aperto.
            </div>
          ) : (
            openOrders
              .slice(0, 5)
              .map((order) => (
                <button
                  type="button"
                  key={order.id}
                  className="home-order-row"
                  onClick={() =>
                    router.push(
                      `/orders/${order.id}`
                    )
                  }
                >
                  <div>
                    <strong>
                      {supplierMap.get(
                        order.supplier_id
                      ) ||
                        "Fornitore"}
                    </strong>

                    <span>
                      {formatDate(
                        order.order_date ||
                          order.created_at
                      )}
                    </span>
                  </div>

                  <StatusBadge
                    status={
                      order.status
                    }
                  />
                </button>
              ))
          )}
        </div>
      </section>

      {/* MODALE NUOVO PROMEMORIA */}

      {reminderModalOpen && (
        <div
          className="reminder-modal-backdrop"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeReminderModal();
            }
          }}
        >
          <div className="reminder-modal">
            <div className="reminder-modal-header">
              <div>
                <div className="reminder-modal-label">
                  PROMEMORIA
                </div>

                <h2>
                  Nuovo promemoria
                </h2>
              </div>

              <button
                type="button"
                onClick={
                  closeReminderModal
                }
                disabled={
                  savingReminder
                }
                className="reminder-close"
              >
                ×
              </button>
            </div>

            <div className="reminder-form">
              <label>
                Titolo
              </label>

              <input
                autoFocus
                type="text"
                value={
                  reminderTitle
                }
                onChange={(event) =>
                  setReminderTitle(
                    event.target.value
                  )
                }
                placeholder="Es. Controllare ordine Osculati"
              />

              <label>
                Data
              </label>

              <input
                type="date"
                value={
                  reminderDate
                }
                onChange={(event) =>
                  setReminderDate(
                    event.target.value
                  )
                }
              />

              <label>
                Nota
                <span>
                  facoltativa
                </span>
              </label>

              <textarea
                value={
                  reminderNote
                }
                onChange={(event) =>
                  setReminderNote(
                    event.target.value
                  )
                }
                placeholder="Es. Chiamare il fornitore se non è ancora arrivato."
                rows={4}
              />
            </div>

            <div className="reminder-modal-actions">
              <button
                type="button"
                className="reminder-cancel"
                onClick={
                  closeReminderModal
                }
                disabled={
                  savingReminder
                }
              >
                Annulla
              </button>

              <button
                type="button"
                className="reminder-save"
                onClick={
                  createReminder
                }
                disabled={
                  savingReminder
                }
              >
                {savingReminder
                  ? "Salvataggio..."
                  : "Salva promemoria"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .home-dashboard {
          width: 100%;
          max-width: 1500px;
          margin: 0 auto;
        }

        .home-loading {
          max-width: 1500px;
          margin: 0 auto;
          padding: 35px 20px;
          opacity: 0.6;
        }

        .home-hero {
          position: relative;
          overflow: hidden;
          min-height: 245px;
          margin-bottom: 18px;
          border: 1px solid rgba(78, 112, 162, 0.38);
          border-radius: 18px;
          background:
            linear-gradient(
              125deg,
              #0c1728 0%,
              #0b1627 55%,
              #08111d 100%
            );
        }

        .home-hero-circle {
          position: absolute;
          border-radius: 999px;
          pointer-events: none;
        }

        .home-circle-one {
          width: 620px;
          height: 620px;
          top: -520px;
          right: 250px;
          background: rgba(37, 99, 235, 0.13);
        }

        .home-circle-two {
          width: 400px;
          height: 400px;
          right: 80px;
          bottom: -340px;
          background: rgba(59, 130, 246, 0.08);
        }

        .home-hero-main {
          position: relative;
          z-index: 2;
          min-height: 245px;
          padding: 27px 30px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 205px;
          gap: 35px;
          align-items: center;
        }

        .home-brand-row {
          display: flex;
          align-items: center;
          gap: 9px;
          color: #93c5fd;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1.7px;
        }

        .home-hero h1 {
          margin: 15px 0 0;
          color: white;
          font-size: 39px;
          line-height: 1;
          letter-spacing: -1.3px;
          font-weight: 950;
        }

        .home-hero h1 span {
          color: #3b82f6;
        }

        .home-hero-subtitle {
          margin: 9px 0 0;
          color: rgba(255,255,255,0.62);
          font-size: 13px;
        }

        .home-quote {
          max-width: 610px;
          margin-top: 24px;
          padding: 13px 15px;
          display: flex;
          align-items: center;
          gap: 13px;
          border: 1px solid rgba(96,165,250,0.30);
          border-radius: 11px;
          background: rgba(59,130,246,0.07);
        }

        .home-quote-symbol {
          color: #60a5fa;
          font-family: Georgia, serif;
          font-size: 39px;
          line-height: 0.75;
          font-weight: 900;
        }

        .home-quote-text {
          color: white;
          font-size: 13px;
          font-weight: 750;
          line-height: 1.45;
        }

        .home-quote-label {
          margin-top: 4px;
          color: rgba(147,197,253,0.62);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.5px;
        }

        .home-calendar {
          padding: 17px;
          min-height: 188px;
          display: flex;
          flex-direction: column;
          border: 1px solid rgba(96,165,250,0.34);
          border-radius: 14px;
          background: rgba(4,13,25,0.72);
          box-sizing: border-box;
        }

        .home-calendar-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: white;
          font-size: 14px;
        }

        .home-calendar-icon {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          background: rgba(37,99,235,0.20);
          border: 1px solid rgba(59,130,246,0.40);
        }

        .home-calendar-day {
          margin-top: 13px;
          color: white;
          font-size: 52px;
          line-height: 0.95;
          letter-spacing: -2px;
          font-weight: 950;
        }

        .home-calendar-month {
          margin-top: 8px;
          color: #dbeafe;
          font-size: 12px;
          text-transform: capitalize;
          font-weight: 700;
        }

        .home-calendar-time {
          margin-top: auto;
          padding-top: 13px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-top: 1px solid rgba(96,165,250,0.25);
          color: white;
          font-size: 15px;
        }

        .home-error {
          margin-bottom: 18px;
          padding: 13px 15px;
          border-radius: 10px;
          border: 1px solid rgba(239,68,68,0.4);
          background: rgba(239,68,68,0.08);
          color: #ef4444;
          font-weight: 700;
        }

        .home-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 18px;
        }

        .home-kpi {
          min-height: 146px;
          padding: 16px;
          border: 1px solid var(--border-color);
          border-radius: 14px;
          background:
            linear-gradient(
              145deg,
              var(--card),
              var(--input-bg)
            );
          color: var(--foreground);
          text-align: left;
          cursor: pointer;
        }

        .home-kpi.no-click {
          cursor: default;
        }

        .home-kpi-icon {
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
        }

        .home-tone-orange {
          color: #f59e0b;
          background: rgba(245,158,11,0.09);
          border: 1px solid rgba(245,158,11,0.20);
        }

        .home-tone-blue {
          color: #3b82f6;
          background: rgba(59,130,246,0.09);
          border: 1px solid rgba(59,130,246,0.20);
        }

        .home-tone-purple {
          color: #8b5cf6;
          background: rgba(139,92,246,0.09);
          border: 1px solid rgba(139,92,246,0.20);
        }

        .home-tone-green {
          color: #22c55e;
          background: rgba(34,197,94,0.09);
          border: 1px solid rgba(34,197,94,0.20);
        }

        .home-kpi-title {
          margin-top: 13px;
          font-size: 10px;
          font-weight: 850;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          opacity: 0.54;
        }

        .home-kpi-value {
          margin-top: 6px;
          font-size: 27px;
          font-weight: 950;
          letter-spacing: -0.5px;
        }

        .home-kpi-subtitle {
          margin-top: 4px;
          font-size: 10px;
          opacity: 0.45;
        }

        .home-panel {
          overflow: hidden;
          border: 1px solid var(--border-color);
          border-radius: 14px;
          background:
            linear-gradient(
              145deg,
              var(--card),
              var(--input-bg)
            );
        }

        .home-actions-panel {
          margin-bottom: 18px;
        }

        .home-panel-title {
          padding: 15px 17px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid var(--border-color);
        }

        .home-panel-title strong {
          display: block;
          font-size: 16px;
          font-weight: 900;
        }

        .home-panel-title span {
          display: block;
          margin-top: 3px;
          font-size: 10px;
          opacity: 0.47;
        }

        .home-panel-title-right {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .home-panel-count {
          min-width: 28px;
          height: 28px;
          padding: 0 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: #ef4444;
          color: white;
          font-size: 11px;
          font-weight: 950;
        }

        .home-panel-secondary-action {
          padding: 7px 10px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: transparent;
          color: var(--foreground);
          cursor: pointer;
          font-size: 10px;
          font-weight: 850;
          opacity: 0.72;
        }

        .home-panel-secondary-action:hover {
          opacity: 1;
          background: var(--input-bg);
        }

        .home-panel-action {
          padding: 7px 10px;
          border: 1px solid rgba(59,130,246,0.30);
          border-radius: 8px;
          background: rgba(59,130,246,0.08);
          color: #60a5fa;
          cursor: pointer;
          font-size: 10px;
          font-weight: 850;
        }

        .home-actions-grid {
          padding: 15px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 11px;
        }

        .home-action {
          min-height: 96px;
          padding: 13px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 9px;
          border: 1px solid rgba(59,130,246,0.24);
          border-radius: 11px;
          background: rgba(59,130,246,0.045);
          color: var(--foreground);
          cursor: pointer;
          font-weight: 850;
          font-size: 11px;
        }

        .home-action-icon {
          width: 35px;
          height: 35px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: rgba(59,130,246,0.12);
          color: #60a5fa;
        }

        .home-lower-grid,
        .home-bottom-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          margin-bottom: 18px;
        }

        .home-reminder-row {
          padding: 11px 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          border-bottom: 1px solid var(--border-color);
        }

        .home-date-badge {
          width: 46px;
          height: 48px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px solid;
          border-radius: 9px;
        }

        .home-date-badge strong {
          font-size: 16px;
          line-height: 1;
        }

        .home-date-badge span {
          margin-top: 3px;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .home-reminder-copy {
          flex: 1;
          min-width: 0;
        }

        .home-reminder-copy strong {
          display: block;
          font-size: 11px;
          font-weight: 850;
        }

        .home-reminder-copy span {
          display: block;
          margin-top: 2px;
          font-size: 9px;
          font-weight: 750;
        }

        .home-reminder-copy small {
          display: block;
          margin-top: 4px;
          font-size: 9px;
          opacity: 0.43;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .home-done-button {
          flex-shrink: 0;
          padding: 7px 9px;
          border: 1px solid rgba(34,197,94,0.25);
          border-radius: 8px;
          background: rgba(34,197,94,0.07);
          color: #22c55e;
          cursor: pointer;
          font-size: 9px;
          font-weight: 900;
        }

        .home-activity-row,
        .home-order-row {
          width: 100%;
          padding: 11px 15px;
          display: flex;
          align-items: center;
          gap: 12px;
          border: none;
          border-bottom: 1px solid var(--border-color);
          background: transparent;
          color: var(--foreground);
          cursor: pointer;
          text-align: left;
        }

        .home-activity-copy {
          min-width: 0;
          flex: 1;
        }

        .home-activity-copy strong {
          display: block;
          font-size: 11px;
          font-weight: 850;
        }

        .home-activity-copy span {
          display: block;
          margin-top: 2px;
          font-size: 9px;
          opacity: 0.46;
        }

        .home-activity-icon {
          width: 31px;
          height: 31px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: rgba(59,130,246,0.08);
          color: #60a5fa;
        }

        .home-success-empty {
          padding: 25px 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }

        .home-success-empty strong,
        .home-success-empty span {
          display: block;
        }

        .home-success-empty strong {
          font-size: 12px;
        }

        .home-success-empty span {
          margin-top: 3px;
          font-size: 10px;
          opacity: 0.45;
        }

        .home-success-icon {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          color: #22c55e;
          background: rgba(34,197,94,0.10);
          border: 1px solid rgba(34,197,94,0.24);
          font-weight: 950;
        }

        .home-empty {
          padding: 34px;
          text-align: center;
          font-size: 11px;
          opacity: 0.46;
        }

        .home-stock-row {
          padding: 11px 15px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
          border-bottom: 1px solid var(--border-color);
        }

        .home-stock-row strong,
        .home-stock-row span,
        .home-stock-row small,
        .home-order-row strong,
        .home-order-row span {
          display: block;
        }

        .home-stock-row strong,
        .home-order-row strong {
          font-size: 11px;
          font-weight: 850;
        }

        .home-stock-row span,
        .home-order-row span {
          margin-top: 2px;
          font-size: 9px;
          opacity: 0.48;
        }

        .home-stock-row small {
          margin-top: 3px;
          font-size: 8px;
          opacity: 0.35;
        }

        .home-stock-qty {
          flex-shrink: 0;
          text-align: right;
          color: #f59e0b;
          font-size: 16px;
          font-weight: 950;
        }

        .home-stock-qty small {
          color: var(--foreground);
          font-size: 8px;
          font-weight: 500;
          opacity: 0.42;
        }

        .home-order-row {
          justify-content: space-between;
        }

        .home-status {
          display: inline-block;
          padding: 5px 7px;
          border-radius: 999px;
          font-size: 8px;
          font-weight: 900;
          white-space: nowrap;
        }

        .reminder-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.68);
          backdrop-filter: blur(5px);
        }

        .reminder-modal {
          width: min(520px, 100%);
          overflow: hidden;
          border: 1px solid rgba(96,165,250,0.30);
          border-radius: 16px;
          background: #0b1422;
          color: white;
          box-shadow: 0 28px 90px rgba(0,0,0,0.55);
        }

        .reminder-modal-header {
          padding: 20px 21px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 15px;
          border-bottom: 1px solid rgba(96,165,250,0.16);
        }

        .reminder-modal-header h2 {
          margin: 5px 0 0;
          font-size: 22px;
          font-weight: 950;
        }

        .reminder-modal-label {
          color: #60a5fa;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1.5px;
        }

        .reminder-close {
          width: 32px;
          height: 32px;
          border: 1px solid rgba(255,255,255,0.13);
          border-radius: 8px;
          background: rgba(255,255,255,0.04);
          color: white;
          cursor: pointer;
          font-size: 20px;
        }

        .reminder-form {
          padding: 20px 21px;
        }

        .reminder-form label {
          display: block;
          margin: 14px 0 7px;
          color: rgba(255,255,255,0.72);
          font-size: 10px;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }

        .reminder-form label:first-child {
          margin-top: 0;
        }

        .reminder-form label span {
          margin-left: 6px;
          font-weight: 500;
          text-transform: none;
          opacity: 0.45;
        }

        .reminder-form input,
        .reminder-form textarea {
          width: 100%;
          box-sizing: border-box;
          padding: 12px 13px;
          border: 1px solid rgba(96,165,250,0.22);
          border-radius: 9px;
          outline: none;
          background: rgba(255,255,255,0.035);
          color: white;
          font: inherit;
        }

        .reminder-form input:focus,
        .reminder-form textarea:focus {
          border-color: #3b82f6;
        }

        .reminder-form textarea {
          resize: vertical;
        }

        .reminder-modal-actions {
          padding: 15px 21px 20px;
          display: flex;
          justify-content: flex-end;
          gap: 9px;
        }

        .reminder-cancel,
        .reminder-save {
          padding: 10px 14px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 900;
        }

        .reminder-cancel {
          border: 1px solid rgba(255,255,255,0.13);
          background: transparent;
          color: white;
        }

        .reminder-save {
          border: 1px solid #3b82f6;
          background: #3b82f6;
          color: white;
        }

        @media (max-width: 1000px) {
          .home-kpi-grid {
            grid-template-columns: repeat(2, minmax(0,1fr));
          }

          .home-actions-grid {
            grid-template-columns: repeat(2, minmax(0,1fr));
          }
        }

        @media (max-width: 760px) {
          .home-hero-main {
            grid-template-columns: 1fr;
          }

          .home-calendar {
            min-height: auto;
          }

          .home-kpi-grid,
          .home-lower-grid,
          .home-bottom-grid {
            grid-template-columns: 1fr;
          }

          .home-panel-title {
            align-items: flex-start;
          }

          .home-panel-title-right {
            flex-wrap: wrap;
            justify-content: flex-end;
          }
        }
      `}</style>
    </div>
  );
}

/* COMPONENTI */

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  tone,
  onClick,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  tone:
    | "orange"
    | "blue"
    | "purple"
    | "green";
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`home-kpi ${
        !onClick
          ? "no-click"
          : ""
      }`}
    >
      <div
        className={`home-kpi-icon home-tone-${tone}`}
      >
        {icon}
      </div>

      <div className="home-kpi-title">
        {title}
      </div>

      <div className="home-kpi-value">
        {value}
      </div>

      <div className="home-kpi-subtitle">
        {subtitle}
      </div>
    </button>
  );
}

function PanelTitle({
  title,
  subtitle,
  badge,
  actionText,
  onAction,
  secondaryActionText,
  onSecondaryAction,
}: {
  title: string;
  subtitle: string;
  badge?: number;
  actionText?: string;
  onAction?: () => void;
  secondaryActionText?: string;
  onSecondaryAction?: () => void;
}) {
  return (
    <div className="home-panel-title">
      <div>
        <strong>
          {title}
        </strong>

        <span>
          {subtitle}
        </span>
      </div>

      <div className="home-panel-title-right">
        {badge !==
          undefined && (
          <div className="home-panel-count">
            {badge}
          </div>
        )}

        {secondaryActionText &&
          onSecondaryAction && (
            <button
              type="button"
              className="home-panel-secondary-action"
              onClick={
                onSecondaryAction
              }
            >
              {
                secondaryActionText
              }
            </button>
          )}

        {actionText &&
          onAction && (
            <button
              type="button"
              className="home-panel-action"
              onClick={
                onAction
              }
            >
              {actionText}
            </button>
          )}
      </div>
    </div>
  );
}

function QuickAction({
  title,
  icon,
  onClick,
}: {
  title: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="home-action"
      onClick={onClick}
    >
      <div className="home-action-icon">
        {icon}
      </div>

      {title}
    </button>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  if (
    status === "partial"
  ) {
    return (
      <span
        className="home-status"
        style={{
          color: "#f59e0b",
          background:
            "rgba(245,158,11,0.10)",
          border:
            "1px solid rgba(245,158,11,0.30)",
        }}
      >
        PARZIALE
      </span>
    );
  }

  if (
    status === "received"
  ) {
    return (
      <span
        className="home-status"
        style={{
          color: "#22c55e",
          background:
            "rgba(34,197,94,0.10)",
          border:
            "1px solid rgba(34,197,94,0.28)",
        }}
      >
        RICEVUTO
      </span>
    );
  }

  return (
    <span
      className="home-status"
      style={{
        color: "#3b82f6",
        background:
          "rgba(59,130,246,0.10)",
        border:
          "1px solid rgba(59,130,246,0.28)",
      }}
    >
      IN ORDINE
    </span>
  );
}

/* ICONE */

function WarehouseIcon() {
  return (
    <div
      style={{
        width: 27,
        height: 27,
        display: "flex",
        alignItems: "center",
        justifyContent:
          "center",
        borderRadius: 8,
        background:
          "linear-gradient(135deg,#2563eb,#60a5fa)",
      }}
    >
      <span
        style={{
          width: 11,
          height: 8,
          border:
            "2px solid white",
          borderRadius: 2,
        }}
      />
    </div>
  );
}

function CalendarIcon() {
  return (
    <div
      style={{
        width: 15,
        height: 15,
        border:
          "2px solid #60a5fa",
        borderRadius: 3,
        position: "relative",
        boxSizing:
          "border-box",
      }}
    >
      <span
        style={{
          position:
            "absolute",
          left: 2,
          right: 2,
          top: 3,
          height: 2,
          background:
            "#60a5fa",
        }}
      />
    </div>
  );
}

function ClockIcon() {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        border:
          "2px solid #60a5fa",
        borderRadius:
          "50%",
      }}
    />
  );
}

function AlertIcon() {
  return (
    <span
      style={{
        fontSize: 17,
        fontWeight: 950,
      }}
    >
      !
    </span>
  );
}

function IncomingIcon() {
  return (
    <span
      style={{
        fontSize: 21,
        fontWeight: 900,
      }}
    >
      ↓
    </span>
  );
}

function DocumentIcon() {
  return (
    <span
      style={{
        width: 14,
        height: 17,
        display:
          "inline-block",
        border:
          "2px solid currentColor",
        borderRadius: 3,
        boxSizing:
          "border-box",
      }}
    />
  );
}

function EuroIcon() {
  return (
    <span
      style={{
        fontSize: 18,
        fontWeight: 950,
      }}
    >
      €
    </span>
  );
}

function PlusIcon() {
  return (
    <span
      style={{
        fontSize: 22,
      }}
    >
      +
    </span>
  );
}

function CartIcon() {
  return (
    <span
      style={{
        fontSize: 19,
      }}
    >
      ◫
    </span>
  );
}

function UsersIcon() {
  return (
    <span
      style={{
        fontSize: 19,
      }}
    >
      ♟
    </span>
  );
}

function MovementIcon() {
  return (
    <span
      style={{
        fontSize: 19,
      }}
    >
      ⇄
    </span>
  );
}

/* UTILITÀ */

function currentLocalDate() {
  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}

function reminderState(
  dateValue: string
) {
  const today =
    currentLocalDate();

  if (
    dateValue <
    today
  ) {
    return {
      label: "Scaduto",
      color: "#ef4444",
    };
  }

  if (
    dateValue ===
    today
  ) {
    return {
      label: "Oggi",
      color: "#f59e0b",
    };
  }

  return {
    label: "Prossimo",
    color: "#3b82f6",
  };
}

function formatReminderDay(
  value: string
) {
  const parts =
    value.split("-");

  return parts[2] || "--";
}

function formatReminderMonth(
  value: string
) {
  const parts =
    value.split("-");

  const month =
    Number(
      parts[1]
    );

  const months = [
    "GEN",
    "FEB",
    "MAR",
    "APR",
    "MAG",
    "GIU",
    "LUG",
    "AGO",
    "SET",
    "OTT",
    "NOV",
    "DIC",
  ];

  return months[
    month - 1
  ] || "";
}

function getDayOfYear(
  date: Date
) {
  const current =
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

  const start =
    Date.UTC(
      date.getFullYear(),
      0,
      0
    );

  return Math.floor(
    (current - start) /
      86400000
  );
}

function formatWeekday(
  date: Date
) {
  return capitalize(
    new Intl.DateTimeFormat(
      "it-IT",
      {
        weekday:
          "long",
      }
    ).format(date)
  );
}

function formatMonth(
  date: Date
) {
  return capitalize(
    new Intl.DateTimeFormat(
      "it-IT",
      {
        month:
          "long",
      }
    ).format(date)
  );
}

function formatTime(
  date: Date
) {
  return new Intl.DateTimeFormat(
    "it-IT",
    {
      hour:
        "2-digit",
      minute:
        "2-digit",
    }
  ).format(date);
}

function capitalize(
  value: string
) {
  if (!value) {
    return value;
  }

  return (
    value
      .charAt(0)
      .toUpperCase() +
    value.slice(1)
  );
}

function formatEuro(
  value: number
) {
  return new Intl.NumberFormat(
    "it-IT",
    {
      style:
        "currency",
      currency:
        "EUR",
      minimumFractionDigits:
        2,
    }
  ).format(
    Number(
      value || 0
    )
  );
}

function formatNumber(
  value: number
) {
  return new Intl.NumberFormat(
    "it-IT"
  ).format(
    Number(
      value || 0
    )
  );
}

function formatDate(
  value:
    string |
    null
) {
  if (!value) {
    return "-";
  }

  const safe =
    value.includes("T")
      ? value
      : `${value}T00:00:00`;

  const date =
    new Date(safe);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "it-IT",
    {
      day:
        "2-digit",
      month:
        "2-digit",
      year:
        "numeric",
    }
  ).format(date);
}

function orderTimestamp(
  order: Order
) {
  const value =
    order.created_at ||
    order.order_date;

  if (!value) {
    return 0;
  }

  const date =
    new Date(
      value.includes("T")
        ? value
        : `${value}T00:00:00`
    );

  return Number.isNaN(
    date.getTime()
  )
    ? 0
    : date.getTime();
}