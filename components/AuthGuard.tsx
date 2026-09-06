"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import { supabase } from "../lib/supabaseClient";

const INACTIVITY_LIMIT =
  3 * 60 * 60 * 1000; // 3 ore

const SESSION_CHECK_INTERVAL =
  5 * 60 * 1000; // 5 minuti

const INACTIVITY_CHECK_INTERVAL =
  60 * 1000; // 1 minuto

const ACTIVITY_UPDATE_INTERVAL =
  30 * 1000; // max ogni 30 secondi

const FOCUS_CHECK_MIN_INTERVAL =
  60 * 1000; // evita controlli continui cambiando finestra

type PermissionKey =
  | "dashboard"
  | "view_prices"
  | "view_inventory_value"
  | "suppliers"
  | "movements"
  | "missing_codes"
  | "orders"
  | "create_orders"
  | "reminders"
  | "settings"
  | "manage_users";

type Permissions = Partial<
  Record<PermissionKey, boolean>
>;

type AuthSnapshot = {
  username: string;
  userId: string;
  role: string | null;
  permissions: Permissions;
};

type RouteAccess = {
  allowed: boolean;
  permission: PermissionKey | null;
};

const PERMISSION_LABELS: Record<
  PermissionKey,
  string
> = {
  dashboard: "Dashboard",
  view_prices: "Visualizzazione prezzi",
  view_inventory_value:
    "Valore magazzino",
  suppliers: "Fornitori e articoli",
  movements: "Movimenti",
  missing_codes:
    "Codici da inserire",
  orders: "Ordini",
  create_orders:
    "Creazione e modifica ordini",
  reminders: "Promemoria",
  settings: "Impostazioni",
  manage_users:
    "Gestione utenti",
};

function readLocalPermissions():
  Permissions {
  const saved =
    localStorage.getItem(
      "magazzino_permissions"
    );

  if (!saved) {
    return {};
  }

  try {
    const parsed =
      JSON.parse(saved);

    if (
      parsed &&
      typeof parsed ===
        "object"
    ) {
      return parsed as Permissions;
    }
  } catch {
    // dato locale non valido:
    // nessun permesso
  }

  return {};
}

function readLocalAuth():
  AuthSnapshot | null {
  const username =
    localStorage.getItem(
      "magazzino_user"
    );

  const userId =
    localStorage.getItem(
      "magazzino_user_id"
    );

  if (
    !username ||
    !userId
  ) {
    return null;
  }

  return {
    username,
    userId,
    role:
      localStorage.getItem(
        "magazzino_role"
      ),
    permissions:
      readLocalPermissions(),
  };
}

function hasPermission(
  permissions: Permissions,
  role: string | null,
  permission: PermissionKey
) {
  /*
    Compatibilità con il vecchio
    account amministratore.
  */
  if (role === "admin") {
    return true;
  }

  return (
    permissions[
      permission
    ] === true
  );
}

function getRouteAccess(
  pathname: string,
  permissions: Permissions,
  role: string | null
): RouteAccess {
  /*
    Login e PWA restano fuori
    dai permessi del gestionale.
  */
  if (
    pathname === "/login" ||
    pathname.startsWith(
      "/catalogo"
    )
  ) {
    return {
      allowed: true,
      permission: null,
    };
  }

  if (
    pathname.startsWith(
      "/utenti"
    )
  ) {
    return {
      allowed:
        hasPermission(
          permissions,
          role,
          "manage_users"
        ),
      permission:
        "manage_users",
    };
  }

  if (
    pathname.startsWith(
      "/settings"
    )
  ) {
    return {
      allowed:
        hasPermission(
          permissions,
          role,
          "settings"
        ),
      permission:
        "settings",
    };
  }

  if (
    pathname.startsWith(
      "/promemoria"
    )
  ) {
    return {
      allowed:
        hasPermission(
          permissions,
          role,
          "reminders"
        ),
      permission:
        "reminders",
    };
  }

  if (
    pathname.startsWith(
      "/codici-da-inserire"
    )
  ) {
    return {
      allowed:
        hasPermission(
          permissions,
          role,
          "missing_codes"
        ),
      permission:
        "missing_codes",
    };
  }

  if (
    pathname.startsWith(
      "/movements"
    )
  ) {
    return {
      allowed:
        hasPermission(
          permissions,
          role,
          "movements"
        ),
      permission:
        "movements",
    };
  }

  if (
    pathname.startsWith(
      "/orders"
    )
  ) {
    return {
      allowed:
        hasPermission(
          permissions,
          role,
          "orders"
        ),
      permission:
        "orders",
    };
  }

  if (
    pathname.startsWith(
      "/suppliers"
    ) ||
    pathname.startsWith(
      "/items"
    ) ||
    pathname.startsWith(
      "/low-stock-report"
    )
  ) {
    return {
      allowed:
        hasPermission(
          permissions,
          role,
          "suppliers"
        ),
      permission:
        "suppliers",
    };
  }

  if (pathname === "/") {
    return {
      allowed:
        hasPermission(
          permissions,
          role,
          "dashboard"
        ),
      permission:
        "dashboard",
    };
  }

  /*
    Le pagine non ancora classificate
    restano accessibili per non rompere
    sezioni esistenti.
  */
  return {
    allowed: true,
    permission: null,
  };
}

function getFirstAllowedPath(
  permissions: Permissions,
  role: string | null
) {
  const candidates: Array<{
    permission: PermissionKey;
    path: string;
  }> = [
    {
      permission:
        "dashboard",
      path: "/",
    },
    {
      permission:
        "suppliers",
      path: "/suppliers",
    },
    {
      permission:
        "movements",
      path: "/movements",
    },
    {
      permission:
        "missing_codes",
      path:
        "/codici-da-inserire",
    },
    {
      permission:
        "orders",
      path: "/orders",
    },
    {
      permission:
        "reminders",
      path: "/promemoria",
    },
    {
      permission:
        "settings",
      path: "/settings",
    },
    {
      permission:
        "manage_users",
      path: "/utenti",
    },
  ];

  const found =
    candidates.find(
      (candidate) =>
        hasPermission(
          permissions,
          role,
          candidate.permission
        )
    );

  return found?.path || null;
}

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const isCatalogo =
    pathname.startsWith(
      "/catalogo"
    );

  const [ready, setReady] =
    useState(false);

  /*
    Snapshot locale dell'utente.

    Serve a calcolare i permessi
    SINCRONAMENTE ad ogni cambio pagina,
    senza interrogare Supabase.
  */
  const [
    authSnapshot,
    setAuthSnapshot,
  ] =
    useState<AuthSnapshot | null>(
      null
    );

  /*
    Lettura locale login + permessi.

    Questa operazione NON usa Internet
    e NON interroga Supabase.
  */
  useEffect(() => {
    if (isCatalogo) {
      setAuthSnapshot(null);
      setReady(true);
      return;
    }

    const localAuth =
      readLocalAuth();

    setAuthSnapshot(
      localAuth
    );

    /*
      Non autenticato:
      qualsiasi pagina gestionale
      va al login.
    */
    if (!localAuth) {
      if (
        pathname !==
        "/login"
      ) {
        router.replace(
          "/login"
        );
      }

      setReady(true);
      return;
    }

    /*
      Se siamo già autenticati
      e apriamo /login, andiamo
      alla prima sezione consentita.
    */
    if (
      pathname === "/login"
    ) {
      const firstAllowed =
        getFirstAllowedPath(
          localAuth.permissions,
          localAuth.role
        );

      router.replace(
        firstAllowed || "/"
      );
    }

    setReady(true);
  }, [
    pathname,
    router,
    isCatalogo,
  ]);

  /*
    Accesso alla pagina corrente.

    Dipende direttamente dal pathname
    e dallo snapshot permessi:
    quindi cambia immediatamente quando
    cambia pagina e non ha il vecchio
    problema di stato "in ritardo".
  */
  const routeAccess =
    useMemo<RouteAccess>(() => {
      if (isCatalogo) {
        return {
          allowed: true,
          permission: null,
        };
      }

      if (
        pathname === "/login"
      ) {
        return {
          allowed: true,
          permission: null,
        };
      }

      if (!authSnapshot) {
        return {
          allowed: false,
          permission: null,
        };
      }

      return getRouteAccess(
        pathname,
        authSnapshot.permissions,
        authSnapshot.role
      );
    }, [
      pathname,
      isCatalogo,
      authSnapshot,
    ]);

  /*
    Controllo vero della sessione.

    Viene eseguito:
    - all'apertura;
    - ogni 5 minuti;
    - quando torniamo sulla finestra.

    NON viene eseguito ad ogni pagina.
  */
  useEffect(() => {
    if (isCatalogo) {
      return;
    }

    let disposed = false;

    let sessionInterval:
      ReturnType<
        typeof setInterval
      > | null = null;

    let inactivityInterval:
      ReturnType<
        typeof setInterval
      > | null = null;

    let lastActivityWrite = 0;
    let lastSessionCheck = 0;

    function clearSession() {
      localStorage.removeItem(
        "magazzino_user"
      );

      localStorage.removeItem(
        "magazzino_display_name"
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
        "magazzino_permissions"
      );

      localStorage.removeItem(
        "magazzino_last_activity"
      );
    }

    function logoutAndRedirect() {
      clearSession();

      if (!disposed) {
        setAuthSnapshot(
          null
        );

        setReady(true);
      }

      router.replace(
        "/login"
      );
    }

    function updateActivity() {
      const now =
        Date.now();

      if (
        now -
          lastActivityWrite <
        ACTIVITY_UPDATE_INTERVAL
      ) {
        return;
      }

      lastActivityWrite =
        now;

      const user =
        localStorage.getItem(
          "magazzino_user"
        );

      if (user) {
        localStorage.setItem(
          "magazzino_last_activity",
          String(now)
        );
      }
    }

    function checkInactivity() {
      const user =
        localStorage.getItem(
          "magazzino_user"
        );

      if (!user) {
        return false;
      }

      const savedActivity =
        localStorage.getItem(
          "magazzino_last_activity"
        );

      if (!savedActivity) {
        localStorage.setItem(
          "magazzino_last_activity",
          String(Date.now())
        );

        return false;
      }

      const lastActivity =
        Number(
          savedActivity
        );

      if (
        !Number.isFinite(
          lastActivity
        )
      ) {
        localStorage.setItem(
          "magazzino_last_activity",
          String(Date.now())
        );

        return false;
      }

      const inactiveFor =
        Date.now() -
        lastActivity;

      if (
        inactiveFor >=
        INACTIVITY_LIMIT
      ) {
        logoutAndRedirect();
        return true;
      }

      return false;
    }

    async function checkAuth(
      initialCheck = false
    ) {
      const localAuth =
        readLocalAuth();

      const localSessionVersion =
        localStorage.getItem(
          "magazzino_session_version"
        );

      if (!localAuth) {
        if (
          window.location.pathname !==
          "/login"
        ) {
          logoutAndRedirect();
          return;
        }

        if (
          initialCheck &&
          !disposed
        ) {
          setReady(true);
        }

        return;
      }

      const expired =
        checkInactivity();

      if (expired) {
        return;
      }

      lastSessionCheck =
        Date.now();

      const {
        data,
        error,
      } = await supabase
        .from("users")
        .select(
          `
            id,
            username,
            display_name,
            role,
            session_version,
            is_active,
            permissions
          `
        )
        .eq(
          "id",
          localAuth.userId
        )
        .maybeSingle();

      /*
        Problema temporaneo di rete:
        NON facciamo logout.
      */
      if (error) {
        console.warn(
          "Controllo sessione temporaneamente non disponibile:",
          error.message
        );

        if (
          initialCheck &&
          !disposed
        ) {
          setReady(true);
        }

        return;
      }

      if (!data) {
        logoutAndRedirect();
        return;
      }

      if (
        data.is_active ===
        false
      ) {
        logoutAndRedirect();
        return;
      }

      const dbVersion =
        Number(
          data.session_version ||
            1
        );

      const savedVersion =
        Number(
          localSessionVersion ||
            1
        );

      if (
        dbVersion !==
        savedVersion
      ) {
        logoutAndRedirect();
        return;
      }

      const freshRole =
        String(
          data.role || "user"
        );

      const freshPermissions:
        Permissions =
        data.permissions &&
        typeof data.permissions ===
          "object"
          ? (data.permissions as Permissions)
          : {};

      const freshUsername =
        String(
          data.username ||
            localAuth.username
        );

      localStorage.setItem(
        "magazzino_user",
        freshUsername
      );

      localStorage.setItem(
        "magazzino_display_name",
        String(
          data.display_name ||
            data.username ||
            localAuth.username
        )
      );

      localStorage.setItem(
        "magazzino_role",
        freshRole
      );

      localStorage.setItem(
        "magazzino_permissions",
        JSON.stringify(
          freshPermissions
        )
      );

      /*
        Aggiorniamo anche lo stato React:
        se un amministratore cambia
        i permessi, il blocco pagina
        si aggiorna subito al prossimo
        controllo.
      */
      if (!disposed) {
        setAuthSnapshot({
          username:
            freshUsername,
          userId:
            localAuth.userId,
          role:
            freshRole,
          permissions:
            freshPermissions,
        });
      }

      if (
        initialCheck &&
        !disposed
      ) {
        setReady(true);
      }

      if (
        window.location.pathname ===
        "/login"
      ) {
        const firstAllowed =
          getFirstAllowedPath(
            freshPermissions,
            freshRole
          );

        router.replace(
          firstAllowed || "/"
        );
      }
    }

    checkAuth(true);

    const activityEvents = [
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "click",
    ];

    activityEvents.forEach(
      (eventName) => {
        window.addEventListener(
          eventName,
          updateActivity,
          {
            passive: true,
          }
        );
      }
    );

    inactivityInterval =
      setInterval(() => {
        checkInactivity();
      }, INACTIVITY_CHECK_INTERVAL);

    sessionInterval =
      setInterval(() => {
        checkAuth(false);
      }, SESSION_CHECK_INTERVAL);

    function handleFocus() {
      const now =
        Date.now();

      if (
        now -
          lastSessionCheck <
        FOCUS_CHECK_MIN_INTERVAL
      ) {
        return;
      }

      checkAuth(false);
    }

    window.addEventListener(
      "focus",
      handleFocus
    );

    return () => {
      disposed = true;

      if (sessionInterval) {
        clearInterval(
          sessionInterval
        );
      }

      if (
        inactivityInterval
      ) {
        clearInterval(
          inactivityInterval
        );
      }

      activityEvents.forEach(
        (eventName) => {
          window.removeEventListener(
            eventName,
            updateActivity
          );
        }
      );

      window.removeEventListener(
        "focus",
        handleFocus
      );
    };
  }, [
    router,
    isCatalogo,
  ]);

  if (!ready) {
    return (
      <div className="p-6">
        Caricamento...
      </div>
    );
  }

  /*
    Se non c'è una sessione valida,
    mentre avviene il redirect non
    mostriamo il contenuto protetto.
  */
  if (
    !isCatalogo &&
    pathname !== "/login" &&
    !authSnapshot
  ) {
    return (
      <div className="p-6">
        Caricamento...
      </div>
    );
  }

  /*
    BLOCCO VERO DELLA PAGINA
    a livello di interfaccia.
  */
  if (
    !isCatalogo &&
    pathname !== "/login" &&
    !routeAccess.allowed
  ) {
    const firstAllowed =
      authSnapshot
        ? getFirstAllowedPath(
            authSnapshot.permissions,
            authSnapshot.role
          )
        : null;

    return (
      <div
        style={{
          width: "100%",
          maxWidth: 720,
          margin:
            "70px auto",
          padding: "0 20px",
          boxSizing:
            "border-box",
        }}
      >
        <div
          style={{
            padding: 32,
            border:
              "1px solid var(--border-color)",
            borderRadius: 16,
            background:
              "var(--card)",
            textAlign:
              "center",
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              margin:
                "0 auto 15px",
              display: "flex",
              alignItems:
                "center",
              justifyContent:
                "center",
              borderRadius: 14,
              border:
                "1px solid rgba(245, 158, 11, 0.28)",
              background:
                "rgba(245, 158, 11, 0.09)",
              fontSize: 25,
            }}
          >
            🔒
          </div>

          <h1
            style={{
              margin:
                "0 0 8px",
              fontSize: 28,
              fontWeight: 900,
            }}
          >
            Accesso non consentito
          </h1>

          <div
            style={{
              maxWidth: 520,
              margin:
                "0 auto",
              fontSize: 14,
              lineHeight: 1.55,
              opacity: 0.62,
            }}
          >
            Il tuo account non ha il
            permesso necessario per
            aprire questa sezione.
            {routeAccess.permission
              ? ` Permesso richiesto: ${
                  PERMISSION_LABELS[
                    routeAccess.permission
                  ]
                }.`
              : ""}
          </div>

          {firstAllowed && (
            <button
              type="button"
              onClick={() =>
                router.push(
                  firstAllowed
                )
              }
              style={{
                marginTop: 20,
                padding:
                  "10px 15px",
                borderRadius: 9,
                border:
                  "1px solid #2686ff",
                background:
                  "linear-gradient(135deg, #1478ff, #2f92ff)",
                color: "#fff",
                fontWeight: 850,
                cursor:
                  "pointer",
              }}
            >
              Vai a una sezione consentita
            </button>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
