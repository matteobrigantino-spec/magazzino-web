"use client";

import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import ProductionIcon from "../components/ProductionIcon";

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

type ItemDbRow = {
  id: string;
  supplier_id: string;
  code: string | null;
  supplier_code: string | null;
  description: string | null;
  price?: number | null;
  stock: number | null;
  min_stock: number | null;
  on_order: number | null;
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
  user_id: string;
  title: string;
  reminder_date: string;
  note: string | null;
  is_done: boolean;
  completed_at: string | null;
  created_at: string;
};

type SharedNoteRecipient = {
  id: string;
  username: string;
  display_name: string | null;
};

type UnreadNote = {
  id: string;
  sender_name: string;
  title: string;
  message: string;
  created_at: string;
};

type BoatAtRisk = {
  id: string;
  order_number: string;
  model_boat: string;
  requested_delivery_date: string;
  missingWindshield: boolean;
  missingUpholstery: boolean;
};

type Permissions = {
  dashboard?: boolean;
  view_prices?: boolean;
  view_inventory_value?: boolean;
  suppliers?: boolean;
  movements?: boolean;
  missing_codes?: boolean;
  orders?: boolean;
  create_orders?: boolean;
  reminders?: boolean;
  settings?: boolean;
  manage_users?: boolean;
  low_stock?: boolean;
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

  const [
    permissions,
    setPermissions,
  ] = useState<Permissions>({});

  const [
    displayName,
    setDisplayName,
  ] = useState("Utente");

  const [
    isMainAccount,
    setIsMainAccount,
  ] = useState(false);

  const [
    sharedNoteModalOpen,
    setSharedNoteModalOpen,
  ] = useState(false);

  const [
    sharedNoteTitle,
    setSharedNoteTitle,
  ] = useState("");

  const [
    sharedNoteMessage,
    setSharedNoteMessage,
  ] = useState("");

  const [
    sharedNoteRecipients,
    setSharedNoteRecipients,
  ] = useState<SharedNoteRecipient[]>([]);

  const [
    sharedNoteRecipientId,
    setSharedNoteRecipientId,
  ] = useState("");

  const [
    loadingSharedNoteRecipients,
    setLoadingSharedNoteRecipients,
  ] = useState(false);

  const [
    sendingSharedNote,
    setSendingSharedNote,
  ] = useState(false);

  const [
    unreadNotes,
    setUnreadNotes,
  ] = useState<UnreadNote[]>([]);

  const [
    boatsAtRisk,
    setBoatsAtRisk,
  ] = useState<BoatAtRisk[]>([]);

  const canViewInventoryValue =
    permissions.view_inventory_value === true;

  const canViewSuppliers =
    permissions.suppliers === true;

  const canViewMovements =
    permissions.movements === true;

  const canViewOrders =
    permissions.orders === true;

  const canViewReminders =
    permissions.reminders === true;

  const canViewLowStock =
    permissions.low_stock !== false;

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

    const currentPermissions =
      readLocalPermissions();

    const currentUserId =
      localStorage.getItem(
        "magazzino_user_id"
      ) || "";

    setPermissions(
      currentPermissions
    );

    setDisplayName(
      localStorage.getItem(
        "magazzino_display_name"
      ) ||
        localStorage.getItem(
          "magazzino_user"
        ) ||
        "Utente"
    );

    setIsMainAccount(
      localStorage.getItem(
        "magazzino_user"
      ) === "admin"
    );

    /*
      Se l'utente non può accedere
      alla Dashboard non carichiamo
      dati inutilmente.
    */
    if (
      currentPermissions.dashboard !==
      true
    ) {
      setLoading(false);
      return;
    }

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

    let itemsData: ItemDbRow[] = [];

    if (
      currentPermissions
        .view_inventory_value === true
    ) {
      const {
        data,
        error,
      } = await supabase
        .from("items")
        .select(
          "id,supplier_id,code,supplier_code,description,price,stock,min_stock,on_order"
        );

      if (error) {
        setErrorMessage(
          "Errore caricamento articoli: " +
            error.message
        );

        setLoading(false);
        return;
      }

      itemsData =
        (data || []) as ItemDbRow[];
    } else {
      const {
        data,
        error,
      } = await supabase
        .from("items")
        .select(
          "id,supplier_id,code,supplier_code,description,stock,min_stock,on_order"
        );

      if (error) {
        setErrorMessage(
          "Errore caricamento articoli: " +
            error.message
        );

        setLoading(false);
        return;
      }

      itemsData =
        (data || []) as ItemDbRow[];
    }

    let ordersData: Order[] = [];

    if (
      currentPermissions.orders ===
      true
    ) {
      const {
        data,
        error,
      } = await supabase
        .from("orders")
        .select(
          "id,supplier_id,status,order_date,created_at"
        )
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        setErrorMessage(
          "Errore caricamento ordini: " +
            error.message
        );

        setLoading(false);
        return;
      }

      ordersData =
        (data || []) as Order[];
    }

    let remindersData:
      Reminder[] = [];

    if (
      currentPermissions.reminders ===
      true
    ) {
      if (!currentUserId) {
        setErrorMessage(
          "Utente non riconosciuto. Esci e accedi nuovamente."
        );

        setLoading(false);
        return;
      }

      const {
        data,
        error,
      } = await supabase
        .from("reminders")
        .select(
          "id,user_id,title,reminder_date,note,is_done,completed_at,created_at"
        )
        .eq("user_id", currentUserId)
        .eq("is_done", false)
        .order("reminder_date", {
          ascending: true,
        })
        .order("created_at", {
          ascending: true,
        });

      if (error) {
        setErrorMessage(
          "Errore caricamento promemoria: " +
            error.message
        );

        setLoading(false);
        return;
      }

      remindersData =
        (data || []) as Reminder[];
    }

    /*
      Note condivise non lette: non blocca mai la dashboard,
      è solo un'informazione in più.
    */
    let unreadNotesData: UnreadNote[] = [];

    if (currentUserId) {
      const { data: unreadData, error: unreadError } =
        await supabase
          .from("shared_notes")
          .select(
            "id,sender_name,title,message,created_at"
          )
          .eq("recipient_user_id", currentUserId)
          .eq("status", "new")
          .order("created_at", { ascending: false })
          .limit(50);

      if (!unreadError) {
        unreadNotesData =
          (unreadData || []) as UnreadNote[];
      }
    }

    /*
      Battelli a rischio consegna: battelli attivi con una data di
      consegna richiesta ancora senza parabrezza o tappezzeria
      assegnati. Anche questo non blocca mai la dashboard: se la
      produzione non è configurata semplicemente non mostra nulla.
    */
    let boatsAtRiskData: BoatAtRisk[] = [];

    try {
      const { data: riskBoatsData, error: riskBoatsError } =
        await supabase
          .from("production_boats")
          .select(
            "id,order_number,model_boat,requested_delivery_date"
          )
          .eq("status", "active")
          .not("requested_delivery_date", "is", null)
          .order("requested_delivery_date", {
            ascending: true,
          })
          .limit(40);

      if (
        !riskBoatsError &&
        riskBoatsData &&
        riskBoatsData.length > 0
      ) {
        const boatIds = riskBoatsData.map((row) =>
          String(row.id)
        );

        const [windshieldResult, upholsteryResult] =
          await Promise.all([
            supabase
              .from("production_boat_windshield")
              .select("boat_id")
              .in("boat_id", boatIds)
              .is("kit_id", null),
            supabase
              .from("production_boat_upholstery")
              .select("boat_id")
              .in("boat_id", boatIds)
              .is("kit_id", null),
          ]);

        const missingWindshieldSet = new Set(
          (
            (windshieldResult.data || []) as {
              boat_id: string;
            }[]
          ).map((row) => String(row.boat_id))
        );

        const missingUpholsterySet = new Set(
          (
            (upholsteryResult.data || []) as {
              boat_id: string;
            }[]
          ).map((row) => String(row.boat_id))
        );

        boatsAtRiskData = riskBoatsData
          .filter(
            (row) =>
              missingWindshieldSet.has(String(row.id)) ||
              missingUpholsterySet.has(String(row.id))
          )
          .map((row) => ({
            id: String(row.id),
            order_number: String(
              row.order_number || ""
            ),
            model_boat: String(row.model_boat || ""),
            requested_delivery_date: String(
              row.requested_delivery_date || ""
            ),
            missingWindshield:
              missingWindshieldSet.has(String(row.id)),
            missingUpholstery:
              missingUpholsterySet.has(String(row.id)),
          }))
          .slice(0, 8);
      }
    } catch {
      // Non blocca mai la dashboard.
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
            currentPermissions
              .view_inventory_value ===
            true
              ? Number(
                  row.price || 0
                )
              : 0,

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

          user_id:
            String(
              row.user_id || ""
            ),

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
    setUnreadNotes(unreadNotesData);
    setBoatsAtRisk(boatsAtRiskData);

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

    const currentUserId =
      localStorage.getItem(
        "magazzino_user_id"
      );

    if (!currentUserId) {
      window.alert(
        "Utente non riconosciuto. Esci e accedi nuovamente."
      );

      return;
    }

    setSavingReminder(true);

    const {
      error,
    } = await supabase
      .from("reminders")
      .insert({
        user_id:
          currentUserId,

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

  async function openSharedNoteModal() {
    setSharedNoteTitle("");
    setSharedNoteMessage("");
    setSharedNoteRecipients([]);
    setSharedNoteRecipientId("");
    setSharedNoteModalOpen(
      true
    );

    const currentUserId =
      localStorage.getItem(
        "magazzino_user_id"
      );

    if (!currentUserId) {
      window.alert(
        "Utente non riconosciuto. Esci e accedi nuovamente."
      );

      setSharedNoteModalOpen(
        false
      );

      return;
    }

    setLoadingSharedNoteRecipients(
      true
    );

    const {
      data,
      error,
    } = await supabase
      .from("users")
      .select(
        "id,username,display_name"
      )
      .eq("is_active", true)
      .neq("id", currentUserId)
      .order("display_name", {
        ascending: true,
        nullsFirst: false,
      })
      .order("username", {
        ascending: true,
      });

    if (error) {
      window.alert(
        "Errore caricamento destinatari: " +
          error.message
      );

      setLoadingSharedNoteRecipients(
        false
      );

      return;
    }

    const cleanRecipients:
      SharedNoteRecipient[] =
      (data || []).map(
        (row) => ({
          id:
            String(
              row.id
            ),

          username:
            String(
              row.username ||
                ""
            ),

          display_name:
            row.display_name
              ? String(
                  row.display_name
                )
              : null,
        })
      );

    setSharedNoteRecipients(
      cleanRecipients
    );

    setSharedNoteRecipientId(
      cleanRecipients[0]?.id ||
        ""
    );

    setLoadingSharedNoteRecipients(
      false
    );
  }

  function closeSharedNoteModal() {
    if (sendingSharedNote) {
      return;
    }

    setSharedNoteModalOpen(
      false
    );
  }

  async function sendSharedNote() {
    const cleanTitle =
      sharedNoteTitle.trim();

    const cleanMessage =
      sharedNoteMessage.trim();

    if (!cleanTitle) {
      window.alert(
        "Inserisci il titolo della nota."
      );

      return;
    }

    if (!cleanMessage) {
      window.alert(
        "Scrivi il messaggio da inviare."
      );

      return;
    }

    const senderUserId =
      localStorage.getItem(
        "magazzino_user_id"
      );

    const senderName =
      localStorage.getItem(
        "magazzino_display_name"
      ) ||
      localStorage.getItem(
        "magazzino_user"
      ) ||
      "Utente";

    if (!senderUserId) {
      window.alert(
        "Utente non riconosciuto. Esci e accedi nuovamente."
      );

      return;
    }

    if (!sharedNoteRecipientId) {
      window.alert(
        "Seleziona il destinatario della nota."
      );

      return;
    }

    setSendingSharedNote(true);

    const {
      error,
    } = await supabase
      .from("shared_notes")
      .insert({
        sender_user_id:
          senderUserId,

        recipient_user_id:
          sharedNoteRecipientId,

        sender_name:
          senderName,

        title:
          cleanTitle,

        message:
          cleanMessage,

        status:
          "new",

        read_at:
          null,

        resolved_at:
          null,
      });

    if (error) {
      window.alert(
        "Nota non inviata: " +
          error.message
      );

      setSendingSharedNote(false);
      return;
    }

    setSendingSharedNote(false);
    setSharedNoteModalOpen(
      false
    );

    setSharedNoteTitle("");
    setSharedNoteMessage("");
    setSharedNoteRecipientId("");
    setSharedNoteRecipients([]);

    window.alert(
      "Nota inviata correttamente."
    );
  }

  async function loadReminders() {
    if (!canViewReminders) {
      setReminders([]);
      return;
    }

    const currentUserId =
      localStorage.getItem(
        "magazzino_user_id"
      );

    if (!currentUserId) {
      setReminders([]);
      return;
    }

    const {
      data,
      error,
    } = await supabase
      .from("reminders")
      .select(
        "id,user_id,title,reminder_date,note,is_done,completed_at,created_at"
      )
      .eq("user_id", currentUserId)
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

          user_id:
            String(
              row.user_id || ""
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
    const currentUserId =
      localStorage.getItem(
        "magazzino_user_id"
      );

    if (!currentUserId) {
      window.alert(
        "Utente non riconosciuto. Esci e accedi nuovamente."
      );

      return;
    }

    const {
      error,
    } = await supabase
      .from("reminders")
      .update({
        is_done: true,
        completed_at:
          new Date().toISOString(),
      })
      .eq("id", id)
      .eq(
        "user_id",
        currentUserId
      );

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

  if (
    permissions.dashboard !==
    true
  ) {
    return (
      <div
        style={{
          maxWidth: 620,
          margin: "70px auto",
          padding: 30,
          textAlign: "center",
          border:
            "1px solid var(--border-color)",
          borderRadius: 16,
          background: "var(--card)",
        }}
      >
        <div
          style={{
            fontSize: 38,
            marginBottom: 12,
          }}
        >
          🔒
        </div>

        <h1
          style={{
            margin: "0 0 8px",
            fontSize: 28,
          }}
        >
          Accesso non consentito
        </h1>

        <div
          style={{
            opacity: 0.62,
          }}
        >
          Il tuo account non ha il
          permesso di visualizzare la
          Dashboard.
        </div>
      </div>
    );
  }

  return (
    <div className="home-dashboard">
      {/* HERO */}

      <section className="home-hero">
        <div className="home-hero-main">
          <div className="home-hero-copy">
            <div className="home-brand-row">
              <img
                src="/logo-italboats-light.png"
                alt="Italboats"
              />
            </div>

            <h1>
              Buongiorno{" "}
              <span>
                {displayName}
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
        {canViewLowStock && (
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
        )}

        {canViewOrders && (
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
        )}

        {canViewOrders && (
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
        )}

        {canViewInventoryValue && (
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
        )}
      </section>

      {/* BATTELLI A RISCHIO CONSEGNA */}

      <section className="home-panel home-risk-panel">
        <PanelTitle
          title="Battelli a rischio consegna"
          subtitle={
            boatsAtRisk.length === 0
              ? "Tutti i battelli in produzione sono coperti"
              : `${boatsAtRisk.length} battelli con parabrezza o tappezzeria mancante`
          }
          badge={
            boatsAtRisk.length > 0
              ? boatsAtRisk.length
              : undefined
          }
          actionText="Vedi produzione"
          onAction={() =>
            router.push("/produzione")
          }
        />

        <div className="home-risk-list">
          {boatsAtRisk.length === 0 ? (
            <div className="home-success-empty">
              <div className="home-success-icon">
                ✓
              </div>

              <div>
                <strong>
                  Nessun battello a rischio
                </strong>

                <span>
                  Parabrezza e tappezzeria coperti
                  per tutte le consegne in vista.
                </span>
              </div>
            </div>
          ) : (
            boatsAtRisk.map((boat) => {
              const state = reminderState(
                boat.requested_delivery_date
              );

              return (
                <button
                  type="button"
                  key={boat.id}
                  className="home-risk-row"
                  onClick={() =>
                    router.push(
                      `/produzione/${boat.id}`
                    )
                  }
                >
                  <div
                    className="home-date-badge"
                    style={{
                      color: state.color,

                      borderColor: `${state.color}55`,

                      background: `${state.color}12`,
                    }}
                  >
                    <strong>
                      {formatReminderDay(
                        boat.requested_delivery_date
                      )}
                    </strong>

                    <span>
                      {formatReminderMonth(
                        boat.requested_delivery_date
                      )}
                    </span>
                  </div>

                  <div className="home-risk-copy">
                    <strong>
                      {boat.order_number ||
                        boat.model_boat}
                    </strong>

                    <span>
                      {boat.model_boat}
                    </span>
                  </div>

                  <div className="home-risk-tags">
                    {boat.missingWindshield && (
                      <span className="home-risk-tag home-risk-tag-blue">
                        Parabrezza
                      </span>
                    )}

                    {boat.missingUpholstery && (
                      <span className="home-risk-tag home-risk-tag-purple">
                        Tappezzeria
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* AZIONI RAPIDE */}

      <section className="home-panel home-actions-panel">
          <PanelTitle
            title="Azioni rapide"
            subtitle="Accesso diretto alle operazioni principali."
          />

          <div className="home-actions-grid">
            <QuickAction
              title="Produzione"
              icon={<ProductionIcon />}
              onClick={() => router.push("/produzione")}
            />
            {canViewSuppliers && (
              <QuickAction
                title="Nuovo fornitore"
                icon={<PlusIcon />}
                onClick={() =>
                  router.push(
                    "/suppliers/new"
                  )
                }
              />
            )}

            {canViewOrders && (
              <QuickAction
                title="Ordini"
                icon={<CartIcon />}
                onClick={() =>
                  router.push(
                    "/orders"
                  )
                }
              />
            )}

            {canViewSuppliers && (
              <QuickAction
                title="Gestisci fornitori"
                icon={<UsersIcon />}
                onClick={() =>
                  router.push(
                    "/suppliers"
                  )
                }
              />
            )}

            {canViewMovements && (
              <QuickAction
                title="Movimenti"
                icon={<MovementIcon />}
                onClick={() =>
                  router.push(
                    "/movements"
                  )
                }
              />
            )}
          </div>
        </section>

      {/* PROMEMORIA + ATTIVITÀ */}

      {(canViewReminders ||
        canViewOrders) && (
        <section className="home-lower-grid">
          {canViewReminders && (
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
          )}

          {canViewOrders && (
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
          )}
        </section>
      )}

      {/* PANNELLI FINALI */}

      <section className="home-bottom-grid">
          {canViewLowStock && (
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

          )}

        <div className="home-panel">
          <PanelTitle
            title="Note condivise"
            subtitle={
              unreadNotes.length === 0
                ? "Comunicazioni tra gli account del magazzino"
                : `${unreadNotes.length} da leggere`
            }
            badge={
              unreadNotes.length > 0
                ? unreadNotes.length
                : undefined
            }
            secondaryActionText="Vedi note"
            onSecondaryAction={() =>
              router.push(
                "/note-condivise"
              )
            }
            actionText="+ Nuova nota"
            onAction={
              openSharedNoteModal
            }
          />

          {unreadNotes.length === 0 ? (
            <div className="home-shared-note-body">
              <div className="home-shared-note-icon">
                <NoteIcon />
              </div>

              <div className="home-shared-note-copy">
                <strong>
                  Scrivi a un altro account
                </strong>

                <span>
                  Scegli il destinatario e invia
                  una comunicazione interna.
                  {isMainAccount
                    ? " Dal tuo account puoi anche vedere tutte le note scambiate tra gli utenti."
                    : " Nella pagina Note condivise trovi le tue ricevute e inviate."}
                </span>
              </div>
            </div>
          ) : (
            <div className="home-notes-list">
              {unreadNotes
                .slice(0, 4)
                .map((note) => (
                  <button
                    type="button"
                    key={note.id}
                    className="home-notes-row"
                    onClick={() =>
                      router.push(
                        "/note-condivise"
                      )
                    }
                  >
                    <div className="home-shared-note-icon">
                      <NoteIcon />
                    </div>

                    <div className="home-notes-copy">
                      <strong>
                        {note.sender_name ||
                          "Utente"}
                        {" · "}
                        {note.title}
                      </strong>

                      <span>
                        {note.message}
                      </span>
                    </div>
                  </button>
                ))}
            </div>
          )}
        </div>

        {canViewOrders && (
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
        )}
      </section>

      {/* MODALE NUOVO PROMEMORIA */}

      {reminderModalOpen &&
        canViewReminders && (
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

      {/* MODALE NOTA CONDIVISA */}

      {sharedNoteModalOpen && (
        <div
          className="reminder-modal-backdrop"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeSharedNoteModal();
            }
          }}
        >
          <div className="reminder-modal">
            <div className="reminder-modal-header">
              <div>
                <div className="reminder-modal-label">
                  NOTE CONDIVISE
                </div>

                <h2>
                  Nuova nota
                </h2>
              </div>

              <button
                type="button"
                onClick={
                  closeSharedNoteModal
                }
                disabled={
                  sendingSharedNote
                }
                className="reminder-close"
              >
                ×
              </button>
            </div>

            <div className="reminder-form">
              <label>
                Destinatario
              </label>

              <select
                autoFocus
                value={
                  sharedNoteRecipientId
                }
                onChange={(event) =>
                  setSharedNoteRecipientId(
                    event.target.value
                  )
                }
                disabled={
                  sendingSharedNote ||
                  loadingSharedNoteRecipients
                }
              >
                {loadingSharedNoteRecipients ? (
                  <option value="">
                    Caricamento account...
                  </option>
                ) : sharedNoteRecipients.length ===
                  0 ? (
                  <option value="">
                    Nessun altro account attivo
                  </option>
                ) : (
                  sharedNoteRecipients.map(
                    (recipient) => (
                      <option
                        key={
                          recipient.id
                        }
                        value={
                          recipient.id
                        }
                      >
                        {sharedNoteRecipientLabel(
                          recipient
                        )}
                      </option>
                    )
                  )
                )}
              </select>

              <label>
                Titolo
              </label>

              <input
                type="text"
                value={
                  sharedNoteTitle
                }
                onChange={(event) =>
                  setSharedNoteTitle(
                    event.target.value
                  )
                }
                placeholder="Es. Manca materiale in reparto"
              />

              <label>
                Messaggio
              </label>

              <textarea
                value={
                  sharedNoteMessage
                }
                onChange={(event) =>
                  setSharedNoteMessage(
                    event.target.value
                  )
                }
                placeholder="Scrivi qui la nota da inviare..."
                rows={6}
              />

              <div className="home-shared-note-help">
                La nota verrà inviata solo
                all&apos;account selezionato.
                Il tuo account principale admin
                può vedere anche le note scambiate
                tra gli altri utenti.
              </div>
            </div>

            <div className="reminder-modal-actions">
              <button
                type="button"
                className="reminder-cancel"
                onClick={
                  closeSharedNoteModal
                }
                disabled={
                  sendingSharedNote
                }
              >
                Annulla
              </button>

              <button
                type="button"
                className="reminder-save"
                onClick={
                  sendSharedNote
                }
                disabled={
                  sendingSharedNote ||
                  loadingSharedNoteRecipients ||
                  !sharedNoteRecipientId
                }
              >
                {sendingSharedNote
                  ? "Invio..."
                  : "Invia nota"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .home-dashboard {
          width: 100%;
          max-width: 1440px;
          margin: 0 auto;
          padding: 38px 42px 46px;
          border-radius: 28px;
          position: relative;
          overflow: hidden;
          color: #f5f7fa;
          border: 1px solid rgba(255,255,255,0.07);
          background:
            radial-gradient(1100px 620px at 90% -16%, rgba(45,212,191,0.24), transparent 62%),
            radial-gradient(760px 480px at -6% 106%, rgba(139,92,246,0.16), transparent 60%),
            radial-gradient(600px 360px at 40% 40%, rgba(94,234,212,0.05), transparent 70%),
            linear-gradient(175deg, #050810 0%, #071120 45%, #0a1626 100%);
          box-shadow: 0 60px 110px -60px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.05);
        }

        .home-loading {
          max-width: 1440px;
          margin: 0 auto;
          padding: 40px 20px;
          color: rgba(255,255,255,0.5);
          font-size: 13px;
        }

        .home-hero {
          position: relative;
          z-index: 1;
          min-height: 190px;
          margin-bottom: 28px;
        }

        .home-hero-main {
          position: relative;
          z-index: 2;
          min-height: 190px;
          padding: 2px 0 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 220px;
          gap: 48px;
          align-items: stretch;
        }

        .home-hero-copy {
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .home-brand-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .home-brand-row img {
          height: 32px;
          width: auto;
          display: block;
          opacity: 0.92;
        }

        .home-hero h1 {
          margin: 22px 0 0;
          color: #f7fafc;
          font-size: 44px;
          line-height: 1;
          letter-spacing: -1.7px;
          font-weight: 800;
        }

        .home-hero h1 span {
          background: linear-gradient(90deg, #2dd4bf, #5eead4);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter: drop-shadow(0 0 26px rgba(45,212,191,0.45));
        }

        .home-hero-subtitle {
          margin: 11px 0 0;
          color: rgba(255,255,255,0.42);
          font-size: 13.5px;
          font-weight: 500;
        }

        .home-quote {
          max-width: 580px;
          margin-top: 26px;
          padding: 15px 20px;
          display: flex;
          align-items: center;
          gap: 15px;
          border: 1px solid rgba(45,212,191,0.20);
          border-left: 3px solid rgba(45,212,191,0.65);
          border-radius: 4px 16px 16px 4px;
          background: rgba(45,212,191,0.05);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 24px 46px -34px rgba(0,0,0,0.6);
        }

        .home-quote-symbol {
          color: rgba(94,234,212,0.55);
          font-family: Georgia, serif;
          font-size: 34px;
          line-height: 0.7;
          font-weight: 900;
        }

        .home-quote-text {
          color: rgba(245,247,250,0.85);
          font-size: 13.5px;
          font-style: italic;
          font-weight: 550;
          line-height: 1.55;
        }

        .home-quote-label {
          margin-top: 6px;
          color: rgba(94,234,212,0.7);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 2px;
        }

        .home-calendar {
          padding: 22px;
          min-height: 190px;
          display: flex;
          flex-direction: column;
          border: 1px solid rgba(45,212,191,0.22);
          border-radius: 20px;
          background: rgba(255,255,255,0.05);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          box-shadow: 0 26px 54px -30px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.14), 0 0 0 1px rgba(45,212,191,0.06);
          box-sizing: border-box;
        }

        .home-calendar-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: rgba(255,255,255,0.55);
          font-size: 11.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }

        .home-calendar-icon {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: rgba(45,212,191,0.14);
          border: 1px solid rgba(45,212,191,0.4);
          box-shadow: 0 0 16px -4px rgba(45,212,191,0.65);
        }

        .home-calendar-day {
          margin-top: 16px;
          background: linear-gradient(135deg, #ffffff 0%, #5eead4 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-variant-numeric: tabular-nums;
          font-size: 56px;
          line-height: 0.92;
          letter-spacing: -2.5px;
          font-weight: 700;
        }

        .home-calendar-month {
          margin-top: 7px;
          color: rgba(255,255,255,0.4);
          font-size: 11.5px;
          text-transform: capitalize;
          font-weight: 600;
        }

        .home-calendar-time {
          margin-top: auto;
          padding-top: 15px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-top: 1px solid rgba(255,255,255,0.08);
          color: #5eead4;
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-variant-numeric: tabular-nums;
          font-size: 15px;
          font-weight: 600;
        }

        .home-error {
          margin-bottom: 20px;
          padding: 13px 16px;
          border-radius: 12px;
          border: 1px solid rgba(248,113,113,0.35);
          background: rgba(248,113,113,0.08);
          color: #fca5a5;
          font-weight: 600;
          font-size: 13px;
        }

        .home-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          margin-bottom: 22px;
        }

        .home-kpi {
          position: relative;
          overflow: hidden;
          min-height: 148px;
          padding: 20px;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 18px;
          background: rgba(255,255,255,0.05);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 22px 46px -32px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.1);
          color: #f5f7fa;
          text-align: left;
          cursor: pointer;
          transition: transform .18s ease, box-shadow .18s ease, background .18s ease, border-color .18s ease;
        }

        .home-kpi::before {
          content: "";
          position: absolute;
          top: 0;
          left: 18px;
          right: 18px;
          height: 3px;
          border-radius: 0 0 4px 4px;
          background: rgba(255,255,255,0.2);
          opacity: 0.95;
          box-shadow: 0 0 16px 1px currentColor;
        }

        .home-kpi:has(.home-tone-orange)::before { background: #fb923c; color: rgba(251,146,60,0.7); }
        .home-kpi:has(.home-tone-blue)::before { background: #38bdf8; color: rgba(56,189,248,0.7); }
        .home-kpi:has(.home-tone-purple)::before { background: #a78bfa; color: rgba(167,139,250,0.7); }
        .home-kpi:has(.home-tone-green)::before { background: #34d399; color: rgba(52,211,153,0.7); }

        .home-kpi:not(.no-click):hover {
          transform: translateY(-4px);
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.18);
          box-shadow: 0 30px 58px -30px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.16);
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
          color: #fb923c;
          background: rgba(251,146,60,0.16);
          border: 1px solid rgba(251,146,60,0.4);
          box-shadow: 0 0 22px -4px rgba(251,146,60,0.55);
        }

        .home-tone-blue {
          color: #38bdf8;
          background: rgba(56,189,248,0.16);
          border: 1px solid rgba(56,189,248,0.4);
          box-shadow: 0 0 22px -4px rgba(56,189,248,0.55);
        }

        .home-tone-purple {
          color: #a78bfa;
          background: rgba(167,139,250,0.16);
          border: 1px solid rgba(167,139,250,0.4);
          box-shadow: 0 0 22px -4px rgba(167,139,250,0.55);
        }

        .home-tone-green {
          color: #34d399;
          background: rgba(52,211,153,0.16);
          border: 1px solid rgba(52,211,153,0.4);
          box-shadow: 0 0 22px -4px rgba(52,211,153,0.55);
        }

        .home-kpi-title {
          margin-top: 16px;
          font-size: 10.5px;
          font-weight: 750;
          letter-spacing: 0.9px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
        }

        .home-kpi-value {
          margin-top: 6px;
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-variant-numeric: tabular-nums;
          font-size: 26px;
          font-weight: 700;
          letter-spacing: -0.5px;
          color: #f7fafc;
        }

        .home-kpi-subtitle {
          margin-top: 4px;
          font-size: 10.5px;
          color: rgba(255,255,255,0.35);
        }

        .home-panel {
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 18px;
          background: rgba(255,255,255,0.045);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 22px 46px -32px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08);
        }

        .home-actions-panel {
          margin-bottom: 22px;
        }

        .home-risk-panel {
          margin-bottom: 22px;
        }

        .home-risk-list {
          display: flex;
          flex-direction: column;
        }

        .home-risk-row {
          width: 100%;
          padding: 12px 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          border: none;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: transparent;
          color: #f5f7fa;
          cursor: pointer;
          text-align: left;
          transition: background .15s ease;
        }

        .home-risk-row:last-child {
          border-bottom: none;
        }

        .home-risk-row:hover {
          background: rgba(255,255,255,0.04);
        }

        .home-risk-copy {
          flex: 1;
          min-width: 0;
        }

        .home-risk-copy strong {
          display: block;
          font-size: 11.5px;
          font-weight: 700;
        }

        .home-risk-copy span {
          display: block;
          margin-top: 2px;
          font-size: 9.5px;
          color: rgba(255,255,255,0.42);
        }

        .home-risk-tags {
          flex-shrink: 0;
          display: flex;
          gap: 6px;
        }

        .home-risk-tag {
          padding: 5px 9px;
          border-radius: 999px;
          font-size: 8.5px;
          font-weight: 800;
          letter-spacing: 0.3px;
          white-space: nowrap;
        }

        .home-risk-tag-blue {
          color: #38bdf8;
          background: rgba(56,189,248,0.12);
          border: 1px solid rgba(56,189,248,0.32);
        }

        .home-risk-tag-purple {
          color: #a78bfa;
          background: rgba(167,139,250,0.12);
          border: 1px solid rgba(167,139,250,0.32);
        }

        .home-panel-title {
          padding: 19px 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }

        .home-panel-title strong {
          display: block;
          color: #f7fafc;
          font-size: 15px;
          font-weight: 750;
        }

        .home-panel-title span {
          display: block;
          margin-top: 4px;
          color: rgba(255,255,255,0.4);
          font-size: 11px;
        }

        .home-panel-title-right {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .home-panel-count {
          min-width: 26px;
          height: 26px;
          padding: 0 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: #ef4444;
          color: white;
          font-size: 11px;
          font-weight: 800;
        }

        .home-panel-secondary-action {
          padding: 7px 11px;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 9px;
          background: transparent;
          color: rgba(255,255,255,0.65);
          cursor: pointer;
          font-size: 10.5px;
          font-weight: 700;
          transition: background .15s ease, color .15s ease;
        }

        .home-panel-secondary-action:hover {
          color: #f7fafc;
          background: rgba(255,255,255,0.06);
        }

        .home-panel-action {
          padding: 7px 11px;
          border: 1px solid rgba(45,212,191,0.32);
          border-radius: 9px;
          background: rgba(45,212,191,0.08);
          color: #5eead4;
          cursor: pointer;
          font-size: 10.5px;
          font-weight: 700;
          transition: background .15s ease;
        }

        .home-panel-action:hover {
          background: rgba(45,212,191,0.16);
        }

        .home-actions-grid {
          padding: 18px;
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
        }

        .home-action {
          min-height: 98px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          background: rgba(255,255,255,0.035);
          color: #f5f7fa;
          cursor: pointer;
          font-weight: 700;
          font-size: 11px;
          transition: border-color .18s ease, background .18s ease, transform .18s ease, box-shadow .18s ease;
        }

        .home-action:hover {
          border-color: rgba(45,212,191,0.55);
          background: rgba(45,212,191,0.10);
          transform: translateY(-3px) scale(1.02);
          box-shadow: 0 20px 34px -18px rgba(45,212,191,0.5);
        }

        .home-action-icon {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: rgba(45,212,191,0.14);
          border: 1px solid rgba(45,212,191,0.3);
          color: #5eead4;
          box-shadow: 0 0 18px -5px rgba(45,212,191,0.6);
        }

        .home-lower-grid,
        .home-bottom-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
          gap: 16px;
          margin-bottom: 16px;
        }

        .home-reminder-row {
          padding: 12px 15px;
          display: flex;
          align-items: center;
          gap: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
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
          border-radius: 10px;
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
          font-size: 11.5px;
          font-weight: 700;
          color: #f5f7fa;
        }

        .home-reminder-copy span {
          display: block;
          margin-top: 2px;
          font-size: 9.5px;
          font-weight: 700;
        }

        .home-reminder-copy small {
          display: block;
          margin-top: 4px;
          font-size: 9.5px;
          color: rgba(255,255,255,0.4);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .home-done-button {
          flex-shrink: 0;
          padding: 7px 10px;
          border: 1px solid rgba(52,211,153,0.32);
          border-radius: 9px;
          background: rgba(52,211,153,0.08);
          color: #34d399;
          cursor: pointer;
          font-size: 9.5px;
          font-weight: 800;
          transition: background .15s ease;
        }

        .home-done-button:hover {
          background: rgba(52,211,153,0.16);
        }

        .home-activity-row,
        .home-order-row {
          width: 100%;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          border: none;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: transparent;
          color: #f5f7fa;
          cursor: pointer;
          text-align: left;
          transition: background .15s ease;
        }

        .home-activity-row:hover,
        .home-order-row:hover {
          background: rgba(255,255,255,0.03);
        }

        .home-activity-copy {
          min-width: 0;
          flex: 1;
        }

        .home-activity-copy strong {
          display: block;
          font-size: 11.5px;
          font-weight: 700;
        }

        .home-activity-copy span {
          display: block;
          margin-top: 2px;
          font-size: 9.5px;
          color: rgba(255,255,255,0.4);
        }

        .home-activity-icon {
          width: 30px;
          height: 30px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          background: rgba(45,212,191,0.14);
          border: 1px solid rgba(45,212,191,0.3);
          color: #5eead4;
          box-shadow: 0 0 14px -5px rgba(45,212,191,0.55);
        }

        .home-success-empty {
          padding: 26px 18px;
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
          color: #f5f7fa;
        }

        .home-success-empty span {
          margin-top: 3px;
          font-size: 10px;
          color: rgba(255,255,255,0.4);
        }

        .home-success-icon {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          color: #34d399;
          background: rgba(52,211,153,0.08);
          border: 1px solid rgba(52,211,153,0.22);
          font-weight: 800;
        }

        .home-empty {
          padding: 36px;
          text-align: center;
          font-size: 11px;
          color: rgba(255,255,255,0.35);
        }

        .home-shared-note-body {
          min-height: 128px;
          padding: 22px;
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .home-notes-list {
          display: flex;
          flex-direction: column;
        }

        .home-notes-row {
          width: 100%;
          padding: 12px 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          border: none;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: transparent;
          color: #f5f7fa;
          cursor: pointer;
          text-align: left;
          transition: background .15s ease;
        }

        .home-notes-row:last-child {
          border-bottom: none;
        }

        .home-notes-row:hover {
          background: rgba(255,255,255,0.04);
        }

        .home-notes-copy {
          flex: 1;
          min-width: 0;
        }

        .home-notes-copy strong {
          display: block;
          font-size: 11.5px;
          font-weight: 700;
        }

        .home-notes-copy span {
          display: block;
          margin-top: 3px;
          font-size: 10px;
          color: rgba(255,255,255,0.42);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .home-shared-note-icon {
          width: 46px;
          height: 46px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          border: 1px solid rgba(45,212,191,0.38);
          background: rgba(45,212,191,0.12);
          box-shadow: 0 0 18px -5px rgba(45,212,191,0.6);
          color: #5eead4;
        }

        .home-shared-note-copy {
          min-width: 0;
        }

        .home-shared-note-copy strong,
        .home-shared-note-copy span {
          display: block;
        }

        .home-shared-note-copy strong {
          font-size: 13px;
          font-weight: 750;
          color: #f5f7fa;
        }

        .home-shared-note-copy span {
          margin-top: 6px;
          max-width: 520px;
          font-size: 10.5px;
          line-height: 1.55;
          color: rgba(255,255,255,0.42);
        }

        .home-shared-note-help {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 9px;
          border: 1px solid rgba(45,212,191,0.18);
          background: rgba(45,212,191,0.05);
          color: rgba(255,255,255,0.55);
          font-size: 10px;
          line-height: 1.5;
        }

        .home-stock-row {
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
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
          font-size: 11.5px;
          font-weight: 700;
        }

        .home-stock-row span,
        .home-order-row span {
          margin-top: 2px;
          font-size: 9.5px;
          color: rgba(255,255,255,0.42);
        }

        .home-stock-row small {
          margin-top: 3px;
          font-size: 8.5px;
          color: rgba(255,255,255,0.3);
        }

        .home-stock-qty {
          flex-shrink: 0;
          text-align: right;
          color: #fb923c;
          font-size: 16px;
          font-weight: 800;
        }

        .home-stock-qty small {
          color: rgba(255,255,255,0.4);
          font-size: 8px;
          font-weight: 500;
        }

        .home-order-row {
          justify-content: space-between;
        }

        .home-status {
          display: inline-block;
          padding: 5px 8px;
          border-radius: 999px;
          font-size: 8.5px;
          font-weight: 800;
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
          background: rgba(3,7,12,0.72);
          backdrop-filter: blur(4px);
        }

        .reminder-modal {
          width: min(520px, 100%);
          overflow: hidden;
          border: 1px solid rgba(45,212,191,0.24);
          border-radius: 18px;
          background: #0a1218;
          color: white;
          box-shadow: 0 30px 90px rgba(0,0,0,0.6);
        }

        .reminder-modal-header {
          padding: 20px 22px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 15px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }

        .reminder-modal-header h2 {
          margin: 5px 0 0;
          font-size: 21px;
          font-weight: 800;
        }

        .reminder-modal-label {
          color: #5eead4;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1.6px;
        }

        .reminder-close {
          width: 32px;
          height: 32px;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 9px;
          background: rgba(255,255,255,0.03);
          color: white;
          cursor: pointer;
          font-size: 19px;
        }

        .reminder-form {
          padding: 20px 22px;
        }

        .reminder-form label {
          display: block;
          margin: 15px 0 7px;
          color: rgba(255,255,255,0.6);
          font-size: 10px;
          font-weight: 750;
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
          color: rgba(255,255,255,0.4);
        }

        .reminder-form input,
        .reminder-form select,
        .reminder-form textarea {
          width: 100%;
          box-sizing: border-box;
          padding: 12px 13px;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          outline: none;
          background: rgba(255,255,255,0.025);
          color: white;
          font: inherit;
          transition: border-color .15s ease;
        }

        .reminder-form input:focus,
        .reminder-form select:focus,
        .reminder-form textarea:focus {
          border-color: #2dd4bf;
        }

        .reminder-form textarea {
          resize: vertical;
        }

        .reminder-modal-actions {
          padding: 16px 22px 21px;
          display: flex;
          justify-content: flex-end;
          gap: 9px;
        }

        .reminder-cancel,
        .reminder-save {
          padding: 10px 15px;
          border-radius: 9px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 800;
        }

        .reminder-cancel {
          border: 1px solid rgba(255,255,255,0.1);
          background: transparent;
          color: white;
        }

        .reminder-save {
          border: 1px solid #0891b2;
          background: linear-gradient(135deg, #2dd4bf, #0891b2);
          color: #04141a;
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
          .home-dashboard {
            padding: 26px 20px 32px;
          }

          .home-hero-main {
            grid-template-columns: 1fr;
            gap: 22px;
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
          "2px solid #5eead4",
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
            "#5eead4",
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
          "2px solid #5eead4",
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

function NoteIcon() {
  return (
    <span
      style={{
        width: 17,
        height: 14,
        display: "inline-block",
        border:
          "2px solid currentColor",
        borderRadius: 4,
        position: "relative",
        boxSizing:
          "border-box",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 3,
          right: 3,
          top: 3,
          height: 2,
          background:
            "currentColor",
          opacity: 0.75,
        }}
      />
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

function sharedNoteRecipientLabel(
  recipient: SharedNoteRecipient
) {
  const displayName =
    recipient.display_name?.trim();

  if (
    displayName &&
    displayName.toLowerCase() !==
      recipient.username.toLowerCase()
  ) {
    return `${displayName} (${recipient.username})`;
  }

  return (
    displayName ||
    recipient.username ||
    "Utente"
  );
}

function readLocalPermissions(): Permissions {
  let parsed: Permissions = {};

  try {
    const saved =
      localStorage.getItem(
        "magazzino_permissions"
      );

    parsed = saved
      ? JSON.parse(saved)
      : {};
  } catch {
    parsed = {};
  }

  /*
    Compatibilità con il vecchio
    account amministratore.
  */
  const role =
    localStorage.getItem(
      "magazzino_role"
    );

  if (role === "admin") {
    return {
      dashboard: true,
      view_prices: true,
      view_inventory_value: true,
      suppliers: true,
      movements: true,
      missing_codes: true,
      orders: true,
      create_orders: true,
      reminders: true,
      settings: true,
      manage_users: true,
      low_stock: true,
    };
  }

  return {
    dashboard:
      parsed.dashboard === true,
    view_prices:
      parsed.view_prices === true,
    view_inventory_value:
      parsed.view_inventory_value ===
      true,
    suppliers:
      parsed.suppliers === true,
    movements:
      parsed.movements === true,
    missing_codes:
      parsed.missing_codes === true,
    orders:
      parsed.orders === true,
    create_orders:
      parsed.create_orders === true,
    reminders:
      parsed.reminders === true,
    settings:
      parsed.settings === true,
    manage_users:
      parsed.manage_users === true,
    low_stock:
      parsed.low_stock !== false,
  };
}

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