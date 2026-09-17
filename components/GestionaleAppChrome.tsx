"use client";

import type {
  ReactNode,
} from "react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import TopBar from "./TopBar";

type Permissions = {
  dashboard?: boolean;
  suppliers?: boolean;
  movements?: boolean;
  missing_codes?: boolean;
  orders?: boolean;
  reminders?: boolean;
  settings?: boolean;
  manage_users?: boolean;
  low_stock?: boolean;
  [key: string]:
    | boolean
    | undefined;
};

type NavItem = {
  label: string;
  href: string;
  icon:
    | "home"
    | "production"
    | "warehouse"
    | "orders"
    | "movement"
    | "alert"
    | "users"
    | "barcode"
    | "bell"
    | "note"
    | "settings";
  permission?: keyof Permissions;
  activePrefixes?: string[];
};

const APP_MODE_KEY =
  "magazzino_gestionale_app_mode";

const PRIMARY_NAV: NavItem[] = [
  {
    label: "Home",
    href: "/gestionale",
    icon: "home",
    permission: "dashboard",
    activePrefixes: ["/gestionale"],
  },
  {
    label: "Produzione",
    href: "/produzione",
    icon: "production",
    activePrefixes: ["/produzione"],
  },
  {
    label: "Magazzino",
    href: "/suppliers",
    icon: "warehouse",
    permission: "suppliers",
    activePrefixes: [
      "/suppliers",
      "/items",
    ],
  },
  {
    label: "Ordini",
    href: "/orders",
    icon: "orders",
    permission: "orders",
    activePrefixes: ["/orders"],
  },
  {
    label: "Movimenti",
    href: "/movements",
    icon: "movement",
    permission: "movements",
    activePrefixes: ["/movements"],
  },
  {
    label: "Scorte",
    href: "/low-stock-report",
    icon: "alert",
    permission: "low_stock",
    activePrefixes: [
      "/low-stock-report",
    ],
  },
  {
    label: "Fornitori",
    href: "/suppliers",
    icon: "users",
    permission: "suppliers",
    activePrefixes: [],
  },
  {
    label: "Codici",
    href: "/codici-da-inserire",
    icon: "barcode",
    permission: "missing_codes",
    activePrefixes: [
      "/codici-da-inserire",
    ],
  },
  {
    label: "Promemoria",
    href: "/promemoria",
    icon: "bell",
    permission: "reminders",
    activePrefixes: ["/promemoria"],
  },
  {
    label: "Note",
    href: "/note-condivise",
    icon: "note",
    activePrefixes: [
      "/note-condivise",
    ],
  },
];

const SECONDARY_NAV: NavItem[] = [
  {
    label: "Utenti",
    href: "/utenti",
    icon: "users",
    permission: "manage_users",
    activePrefixes: ["/utenti"],
  },
  {
    label: "Impostazioni",
    href: "/settings",
    icon: "settings",
    permission: "settings",
    activePrefixes: ["/settings"],
  },
];

export default function GestionaleAppChrome({
  children,
}: {
  children: ReactNode;
}) {
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

  const isGestionaleHome =
    pathname === "/gestionale" ||
    pathname.startsWith(
      "/gestionale/"
    );

  const [
    appMode,
    setAppMode,
  ] =
    useState(
      isGestionaleHome
    );

  const [
    modeReady,
    setModeReady,
  ] =
    useState(
      isGestionaleHome ||
        isCatalogo ||
        isLogin
    );

  /*
    Attiviamo la "modalità Gestionale Matteo"
    quando:

    - siamo nella nuova Home /gestionale;
    - la stessa scheda proveniva da /gestionale;
    - l'app è stata aperta come PWA standalone.

    Catalogo PWA e login restano separati.
  */
  useEffect(() => {
    if (
      isCatalogo ||
      isLogin
    ) {
      setModeReady(true);
      return;
    }

    let standalone =
      false;

    try {
      standalone =
        window.matchMedia(
          "(display-mode: standalone)"
        ).matches ||
        Boolean(
          (
            window.navigator as
              Navigator & {
                standalone?: boolean;
              }
          ).standalone
        );
    } catch {
      standalone =
        false;
    }

    let savedMode =
      false;

    try {
      savedMode =
        window.sessionStorage.getItem(
          APP_MODE_KEY
        ) === "1";
    } catch {
      savedMode =
        false;
    }

    const nextMode =
      isGestionaleHome ||
      savedMode ||
      standalone;

    if (
      isGestionaleHome
    ) {
      try {
        window.sessionStorage.setItem(
          APP_MODE_KEY,
          "1"
        );
      } catch {
        // sessionStorage non disponibile
      }
    }

    setAppMode(
      nextMode
    );

    setModeReady(
      true
    );
  }, [
    isCatalogo,
    isLogin,
    isGestionaleHome,
    pathname,
  ]);

  /*
    Se durante la navigazione entriamo nella
    nuova Home, manteniamo la modalità app
    per tutte le pagine successive.
  */
  useEffect(() => {
    if (
      !isGestionaleHome
    ) {
      return;
    }

    setAppMode(true);

    try {
      window.sessionStorage.setItem(
        APP_MODE_KEY,
        "1"
      );
    } catch {
      // sessionStorage non disponibile
    }
  }, [
    isGestionaleHome,
  ]);

  /*
    In modalità nuova, qualunque vecchio
    collegamento che prova a mandare alla
    vecchia Home "/" viene riportato alla
    Home nuova "/gestionale".
  */
  useEffect(() => {
    if (
      modeReady &&
      appMode &&
      pathname === "/"
    ) {
      router.replace(
        "/gestionale"
      );
    }
  }, [
    modeReady,
    appMode,
    pathname,
    router,
  ]);

  /*
    LOGIN + PWA MAGAZZINIERE:
    manteniamo esattamente il comportamento
    precedente.
  */
  if (
    isCatalogo ||
    isLogin
  ) {
    return (
      <>
        <TopBar />

        <main className="mx-auto max-w-7xl px-6 py-6">
          {children}
        </main>
      </>
    );
  }

  /*
    La Home /gestionale possiede già
    sidebar + topbar WOW dentro page.tsx.

    Manteniamo anche il vecchio <main> perché
    la pagina attuale usa i margini negativi
    per occupare correttamente tutto lo schermo.
  */
  if (
    isGestionaleHome
  ) {
    return (
      <>
        <TopBar />

        <main className="mx-auto max-w-7xl px-6 py-6">
          {children}
        </main>
      </>
    );
  }

  if (!modeReady) {
    return (
      <div className="gma-boot">
        <div className="gma-boot-mark">
          <CubeIcon />
        </div>

        <strong>
          Gestionale Matteo
        </strong>

        <span>
          Apertura applicazione...
        </span>

        <GlobalStyles />
      </div>
    );
  }

  if (
    appMode &&
    pathname === "/"
  ) {
    return (
      <div className="gma-boot">
        <div className="gma-boot-mark">
          <CubeIcon />
        </div>

        <strong>
          Gestionale Matteo
        </strong>

        <span>
          Ritorno alla Home...
        </span>

        <GlobalStyles />
      </div>
    );
  }

  /*
    MODALITÀ GESTIONALE MATTEO:
    tutte le pagine vere del gestionale
    rimangono dentro la nuova interfaccia.
  */
  if (appMode) {
    return (
      <GestionaleShell>
        {children}
      </GestionaleShell>
    );
  }

  /*
    Gestionale web tradizionale:
    nessuna modifica.
  */
  return (
    <>
      <TopBar />

      <main className="mx-auto max-w-7xl px-6 py-6">
        {children}
      </main>
    </>
  );
}

function GestionaleShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname =
    usePathname();

  const router =
    useRouter();

  const [
    displayName,
    setDisplayName,
  ] =
    useState("Matteo");

  const [
    role,
    setRole,
  ] =
    useState("");

  const [
    permissions,
    setPermissions,
  ] =
    useState<Permissions>(
      {}
    );

  const [
    now,
    setNow,
  ] =
    useState<Date>(
      () => new Date()
    );

  useEffect(() => {
    const savedName =
      localStorage.getItem(
        "magazzino_display_name"
      );

    const username =
      localStorage.getItem(
        "magazzino_user"
      );

    const savedRole =
      localStorage.getItem(
        "magazzino_role"
      );

    const savedPermissions =
      localStorage.getItem(
        "magazzino_permissions"
      );

    let parsed:
      Permissions = {};

    try {
      parsed =
        savedPermissions
          ? JSON.parse(
              savedPermissions
            )
          : {};
    } catch {
      parsed = {};
    }

    setDisplayName(
      savedName ||
        username ||
        "Matteo"
    );

    setRole(
      savedRole ||
        ""
    );

    setPermissions(
      parsed
    );
  }, [
    pathname,
  ]);

  useEffect(() => {
    const timer =
      window.setInterval(
        () => {
          setNow(
            new Date()
          );
        },
        30 * 1000
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, []);

  const canAccess =
    (
      permission?:
        keyof Permissions
    ) => {
      if (
        !permission
      ) {
        return true;
      }

      if (
        role === "admin"
      ) {
        return true;
      }

      /*
        Compatibilità:
        se low_stock non esiste nei vecchi
        permessi, non nascondiamo la voce.
      */
      if (
        permission ===
          "low_stock" &&
        permissions.low_stock ===
          undefined
      ) {
        return true;
      }

      return (
        permissions[
          permission
        ] === true
      );
    };

  const primaryNav =
    useMemo(
      () =>
        PRIMARY_NAV.filter(
          (item) =>
            canAccess(
              item.permission
            )
        ),
      [
        role,
        permissions,
      ]
    );

  const secondaryNav =
    useMemo(
      () =>
        SECONDARY_NAV.filter(
          (item) =>
            canAccess(
              item.permission
            )
        ),
      [
        role,
        permissions,
      ]
    );

  function isActive(
    item: NavItem
  ) {
    if (
      item.href ===
      "/gestionale"
    ) {
      return (
        pathname ===
        "/gestionale"
      );
    }

    if (
      item.label ===
      "Fornitori"
    ) {
      return false;
    }

    return (
      item.activePrefixes ||
      []
    ).some(
      (prefix) =>
        pathname ===
          prefix ||
        pathname.startsWith(
          prefix + "/"
        )
    );
  }

  const initial =
    (
      displayName
        .trim()[0] ||
      "M"
    ).toUpperCase();

  return (
    <div className="gma-shell">
      <aside className="gma-sidebar">
        <button
          type="button"
          className="gma-logo"
          onClick={() =>
            router.push(
              "/gestionale"
            )
          }
        >
          <span className="gma-logo-mark">
            <CubeIcon />
          </span>

          <span className="gma-logo-copy">
            <strong>
              GESTIONALE
            </strong>

            <small>
              MATTEO
            </small>
          </span>
        </button>

        <div className="gma-nav-label">
          CONTROL CENTER
        </div>

        <nav className="gma-nav">
          {primaryNav.map(
            (item) => (
              <button
                key={
                  item.label
                }
                type="button"
                className={`gma-nav-item ${
                  isActive(
                    item
                  )
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  router.push(
                    item.href
                  )
                }
              >
                <span className="gma-nav-icon">
                  <NavIcon
                    name={
                      item.icon
                    }
                  />
                </span>

                <span>
                  {item.label}
                </span>
              </button>
            )
          )}
        </nav>

        {secondaryNav.length >
          0 && (
          <>
            <div className="gma-nav-divider" />

            <nav className="gma-nav">
              {secondaryNav.map(
                (item) => (
                  <button
                    key={
                      item.label
                    }
                    type="button"
                    className={`gma-nav-item ${
                      isActive(
                        item
                      )
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      router.push(
                        item.href
                      )
                    }
                  >
                    <span className="gma-nav-icon">
                      <NavIcon
                        name={
                          item.icon
                        }
                      />
                    </span>

                    <span>
                      {item.label}
                    </span>
                  </button>
                )
              )}
            </nav>
          </>
        )}

        <div className="gma-sidebar-spacer" />

        <div className="gma-profile">
          <div className="gma-avatar">
            {initial}
          </div>

          <div className="gma-profile-copy">
            <strong>
              {displayName}
            </strong>

            <span>
              {role ===
              "admin"
                ? "Amministratore"
                : "Gestionale"}
            </span>
          </div>
        </div>
      </aside>

      <div className="gma-workspace">
        <header className="gma-topbar">
          <button
            type="button"
            className="gma-search"
            onClick={() =>
              router.push(
                "/gestionale"
              )
            }
            title="Apri la ricerca universale nella Home"
          >
            <SearchIcon />

            <span>
              Cerca articoli, fornitori,
              ordini, codici...
            </span>

            <kbd>
              Ctrl + K
            </kbd>
          </button>

          <div className="gma-topbar-spacer" />

          <button
            type="button"
            className="gma-status"
            onClick={() =>
              router.push(
                "/gestionale"
              )
            }
          >
            <span className="gma-status-dot" />
            Dati aggiornati
          </button>

          <div className="gma-clock">
            <span>
              {formatDate(
                now
              )}
            </span>

            <strong>
              {formatTime(
                now
              )}
            </strong>
          </div>

          <button
            type="button"
            className="gma-top-avatar"
            onClick={() =>
              router.push(
                "/settings"
              )
            }
            title="Impostazioni"
          >
            {initial}
          </button>
        </header>

        <main className="gma-content">
          <div className="gma-content-inner">
            {children}
          </div>
        </main>
      </div>

      <nav className="gma-mobile-nav">
        <MobileNavButton
          active={
            pathname ===
            "/gestionale"
          }
          label="Home"
          icon="home"
          onClick={() =>
            router.push(
              "/gestionale"
            )
          }
        />

        <MobileNavButton
          active={
            pathname.startsWith(
              "/produzione"
            )
          }
          label="Produzione"
          icon="production"
          onClick={() =>
            router.push(
              "/produzione"
            )
          }
        />

        <MobileNavButton
          active={
            pathname.startsWith(
              "/suppliers"
            ) ||
            pathname.startsWith(
              "/items"
            )
          }
          label="Magazzino"
          icon="warehouse"
          onClick={() =>
            router.push(
              "/suppliers"
            )
          }
        />

        <MobileNavButton
          active={
            pathname.startsWith(
              "/orders"
            )
          }
          label="Ordini"
          icon="orders"
          onClick={() =>
            router.push(
              "/orders"
            )
          }
        />

        <MobileNavButton
          active={
            pathname.startsWith(
              "/settings"
            ) ||
            pathname.startsWith(
              "/utenti"
            )
          }
          label="Altro"
          icon="settings"
          onClick={() =>
            router.push(
              "/settings"
            )
          }
        />
      </nav>

      <GlobalStyles />
    </div>
  );
}

function MobileNavButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon:
    NavItem["icon"];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={
        active
          ? "active"
          : ""
      }
      onClick={onClick}
    >
      <NavIcon
        name={icon}
      />

      <span>
        {label}
      </span>
    </button>
  );
}

function formatTime(
  value: Date
) {
  return new Intl.DateTimeFormat(
    "it-IT",
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(value);
}

function formatDate(
  value: Date
) {
  const text =
    new Intl.DateTimeFormat(
      "it-IT",
      {
        weekday:
          "short",
        day:
          "2-digit",
        month:
          "short",
      }
    ).format(value);

  return (
    text
      .replace(
        ".",
        ""
      )
      .replace(
        /^./,
        (letter) =>
          letter.toUpperCase()
      )
  );
}

function GlobalStyles() {
  return (
    <style jsx global>{`
      .gma-boot {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background:
          radial-gradient(
            circle at 50% 0%,
            rgba(39, 135, 255, 0.17),
            transparent 30%
          ),
          #040b13;
        color: #f4f8ff;
      }

      .gma-boot-mark {
        width: 60px;
        height: 60px;
        margin-bottom: 7px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(72, 148, 255, 0.34);
        border-radius: 18px;
        background:
          linear-gradient(
            145deg,
            #0e61da,
            #2787ff
          );
        box-shadow:
          0 0 42px rgba(39, 135, 255, 0.23);
      }

      .gma-boot strong {
        font-size: 17px;
      }

      .gma-boot span {
        color: #7f91aa;
        font-size: 11px;
      }

      .gma-shell {
        --background: #040b13;
        --foreground: #f4f8ff;
        --card: #091522;
        --card-2: #0d1b2b;
        --input-bg: #0d1b2b;
        --border-color: rgba(120, 157, 199, 0.18);
        --muted: #7f91aa;

        min-height: 100vh;
        display: grid;
        grid-template-columns:
          190px
          minmax(0, 1fr);

        background:
          radial-gradient(
            circle at 67% -12%,
            rgba(39, 135, 255, 0.10),
            transparent 27%
          ),
          #040b13;

        color: var(--foreground);
        color-scheme: dark;

        font-family:
          var(--font-geist-sans),
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
      }

      .gma-sidebar {
        position: sticky;
        top: 0;
        z-index: 60;

        height: 100vh;
        box-sizing: border-box;

        display: flex;
        flex-direction: column;

        padding:
          15px
          10px
          13px;

        border-right:
          1px solid
          rgba(
            115,
            151,
            193,
            0.12
          );

        background:
          linear-gradient(
            180deg,
            rgba(7, 17, 29, 0.99),
            rgba(4, 11, 19, 0.995)
          );
      }

      .gma-logo {
        min-height: 50px;
        padding:
          4px
          8px
          15px;

        display: flex;
        align-items: center;
        gap: 10px;

        border: 0;
        background: transparent;
        color: #f4f8ff;

        cursor: pointer;
        text-align: left;
      }

      .gma-logo-mark {
        width: 40px;
        height: 40px;

        flex: 0 0 auto;

        display: flex;
        align-items: center;
        justify-content: center;

        border:
          1px solid
          rgba(
            122,
            178,
            255,
            0.32
          );

        border-radius: 12px;

        background:
          linear-gradient(
            145deg,
            #155cc8,
            #2787ff
          );

        box-shadow:
          0 0 28px
          rgba(
            39,
            135,
            255,
            0.14
          );
      }

      .gma-logo-copy {
        min-width: 0;
      }

      .gma-logo-copy strong,
      .gma-logo-copy small {
        display: block;
      }

      .gma-logo-copy strong {
        font-size: 12px;
        font-weight: 950;
        letter-spacing: 0.85px;
      }

      .gma-logo-copy small {
        margin-top: 2px;

        color: #69a9ff;

        font-size: 7px;
        font-weight: 950;
        letter-spacing: 2px;
      }

      .gma-nav-label {
        padding:
          5px
          11px
          7px;

        color: #58708f;

        font-size: 7px;
        font-weight: 950;
        letter-spacing: 1.5px;
      }

      .gma-nav {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .gma-nav-item {
        min-height: 38px;
        width: 100%;

        padding:
          0
          10px;

        display: flex;
        align-items: center;
        gap: 10px;

        border:
          1px solid
          transparent;

        border-radius: 9px;

        background:
          transparent;

        color: #9badc4;

        cursor: pointer;

        font-size: 9px;
        font-weight: 800;
        text-align: left;

        transition:
          0.15s
          ease;
      }

      .gma-nav-item:hover {
        background:
          rgba(
            39,
            135,
            255,
            0.07
          );

        color: #f4f8ff;
      }

      .gma-nav-item.active {
        border-color:
          rgba(
            39,
            135,
            255,
            0.42
          );

        background:
          linear-gradient(
            90deg,
            rgba(
              39,
              135,
              255,
              0.20
            ),
            rgba(
              39,
              135,
              255,
              0.08
            )
          );

        color: #f5f9ff;

        box-shadow:
          inset
          3px
          0
          0
          #27b9ff;
      }

      .gma-nav-icon {
        width: 18px;
        height: 18px;

        flex: 0 0 auto;

        display: flex;
        align-items: center;
        justify-content: center;

        color: currentColor;
      }

      .gma-nav-divider {
        height: 1px;

        margin:
          12px
          10px;

        background:
          rgba(
            115,
            151,
            193,
            0.14
          );
      }

      .gma-sidebar-spacer {
        flex: 1;
      }

      .gma-profile {
        padding:
          10px
          8px
          2px;

        display: flex;
        align-items: center;
        gap: 9px;

        border-top:
          1px solid
          rgba(
            115,
            151,
            193,
            0.12
          );
      }

      .gma-avatar,
      .gma-top-avatar {
        border-radius: 999px;

        display: flex;
        align-items: center;
        justify-content: center;

        background:
          linear-gradient(
            145deg,
            #1662d5,
            #3b98ff
          );

        color: white;

        font-weight: 950;
      }

      .gma-avatar {
        width: 31px;
        height: 31px;

        font-size: 10px;
      }

      .gma-profile-copy {
        min-width: 0;
      }

      .gma-profile-copy strong,
      .gma-profile-copy span {
        display: block;
      }

      .gma-profile-copy strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        color: #f4f8ff;

        font-size: 9px;
        font-weight: 900;
      }

      .gma-profile-copy span {
        margin-top: 2px;

        color: #637a98;

        font-size: 7px;
      }

      .gma-workspace {
        min-width: 0;
      }

      .gma-topbar {
        position: sticky;
        top: 0;
        z-index: 55;

        min-height: 59px;
        padding:
          0
          16px;

        display: flex;
        align-items: center;
        gap: 10px;

        border-bottom:
          1px solid
          rgba(
            115,
            151,
            193,
            0.12
          );

        background:
          rgba(
            4,
            11,
            19,
            0.91
          );

        backdrop-filter:
          blur(18px);
      }

      .gma-search {
        width: min(
          520px,
          44vw
        );

        min-height: 39px;

        padding:
          0
          11px;

        display: flex;
        align-items: center;
        gap: 9px;

        border:
          1px solid
          rgba(
            72,
            148,
            255,
            0.28
          );

        border-radius: 10px;

        background:
          #071523;

        color: #6f829c;

        cursor: pointer;

        text-align: left;
      }

      .gma-search > span {
        flex: 1;

        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        font-size: 9px;
      }

      .gma-search kbd {
        padding:
          4px
          6px;

        border:
          1px solid
          rgba(
            120,
            157,
            199,
            0.20
          );

        border-radius: 6px;

        background:
          rgba(
            255,
            255,
            255,
            0.025
          );

        color: #8ca0ba;

        font-size: 7px;
        font-family: inherit;
      }

      .gma-topbar-spacer {
        flex: 1;
      }

      .gma-status {
        min-height: 31px;

        padding:
          0
          10px;

        display: flex;
        align-items: center;
        gap: 6px;

        border:
          1px solid
          rgba(
            36,
            212,
            123,
            0.18
          );

        border-radius: 999px;

        background:
          rgba(
            36,
            212,
            123,
            0.06
          );

        color: #55df96;

        cursor: pointer;

        font-size: 7px;
        font-weight: 900;
      }

      .gma-status-dot {
        width: 6px;
        height: 6px;

        border-radius: 999px;

        background: #24d47b;

        box-shadow:
          0
          0
          0
          4px
          rgba(
            36,
            212,
            123,
            0.08
          );
      }

      .gma-clock {
        min-width: 94px;

        padding-left: 8px;

        text-align: right;
      }

      .gma-clock span,
      .gma-clock strong {
        display: block;
      }

      .gma-clock span {
        color: #657a96;
        font-size: 7px;
      }

      .gma-clock strong {
        margin-top: 1px;

        color: #f4f8ff;

        font-size: 13px;
        font-weight: 950;
      }

      .gma-top-avatar {
        width: 34px;
        height: 34px;

        flex: 0 0 auto;

        border: 0;

        cursor: pointer;

        font-size: 10px;
      }

      .gma-content {
        min-height:
          calc(
            100vh -
            59px
          );

        box-sizing:
          border-box;

        padding:
          18px
          18px
          46px;

        background:
          radial-gradient(
            circle at 80% 0%,
            rgba(
              39,
              135,
              255,
              0.055
            ),
            transparent 28%
          );
      }

      .gma-content-inner {
        width: 100%;
        max-width: 1500px;
        margin: 0 auto;

        --background: #040b13;
        --foreground: #f4f8ff;
        --card: #091522;
        --card-2: #0d1b2b;
        --input-bg: #0d1b2b;
        --border-color:
          rgba(
            120,
            157,
            199,
            0.18
          );

        color: var(--foreground);
      }

      .gma-content-inner input,
      .gma-content-inner select,
      .gma-content-inner textarea {
        color-scheme: dark;
      }

      .gma-mobile-nav {
        display: none;
      }

      @media (
        max-width: 960px
      ) {
        .gma-shell {
          display: block;
          padding-bottom: 66px;
        }

        .gma-sidebar {
          display: none;
        }

        .gma-topbar {
          min-height: 55px;
          padding:
            0
            10px;
        }

        .gma-search {
          width: auto;
          flex: 1;
        }

        .gma-search kbd,
        .gma-status,
        .gma-clock {
          display: none;
        }

        .gma-content {
          min-height:
            calc(
              100vh -
              55px
            );

          padding:
            13px
            12px
            24px;
        }

        .gma-mobile-nav {
          position: fixed;
          left: 10px;
          right: 10px;
          bottom: 10px;
          z-index: 80;

          min-height: 56px;
          padding:
            5px
            7px;

          display: grid;
          grid-template-columns:
            repeat(
              5,
              1fr
            );
          gap: 4px;

          border:
            1px solid
            rgba(
              120,
              157,
              199,
              0.18
            );

          border-radius: 16px;

          background:
            rgba(
              7,
              17,
              29,
              0.94
            );

          box-shadow:
            0
            14px
            45px
            rgba(
              0,
              0,
              0,
              0.36
            );

          backdrop-filter:
            blur(18px);
        }

        .gma-mobile-nav button {
          min-width: 0;
          min-height: 46px;

          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;

          border: 0;
          border-radius: 11px;

          background:
            transparent;

          color: #7388a5;

          cursor: pointer;

          font-size: 7px;
          font-weight: 850;
        }

        .gma-mobile-nav button.active {
          background:
            rgba(
              39,
              135,
              255,
              0.12
            );

          color: #55a4ff;
        }
      }
    `}</style>
  );
}

function NavIcon({
  name,
}: {
  name:
    NavItem["icon"];
}) {
  if (
    name === "home"
  ) {
    return (
      <HomeIcon />
    );
  }

  if (
    name === "production"
  ) {
    return (
      <ProductionIcon />
    );
  }

  if (
    name === "warehouse"
  ) {
    return (
      <WarehouseIcon />
    );
  }

  if (
    name === "orders"
  ) {
    return (
      <OrdersIcon />
    );
  }

  if (
    name === "movement"
  ) {
    return (
      <MovementIcon />
    );
  }

  if (
    name === "alert"
  ) {
    return (
      <AlertIcon />
    );
  }

  if (
    name === "users"
  ) {
    return (
      <UsersIcon />
    );
  }

  if (
    name === "barcode"
  ) {
    return (
      <BarcodeIcon />
    );
  }

  if (
    name === "bell"
  ) {
    return (
      <BellIcon />
    );
  }

  if (
    name === "note"
  ) {
    return (
      <NoteIcon />
    );
  }

  return (
    <SettingsIcon />
  );
}


function ProductionIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M4 20V10L9 13V9L14 12V6H20V20H4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8 20V16H11V20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 9H18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CubeIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M4 8L12 4L20 8V18L12 22L4 18V8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 8L12 12L19.5 8"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 12V22"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M4 10L12 4L20 10V20H14V14H10V20H4V10Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WarehouseIcon() {
  return (
    <svg
      width="15"
      height="15"
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
    </svg>
  );
}

function OrdersIcon() {
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
        d="M8 8H16M8 12H16M8 16H13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
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
    >
      <path
        d="M4 8H18M14 4L18 8L14 12M20 16H6M10 12L6 16L10 20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      width="15"
      height="15"
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

function UsersIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="9"
        cy="8"
        r="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M3.5 19C3.8 15.7 5.7 14 9 14C12.3 14 14.2 15.7 14.5 19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle
        cx="17"
        cy="9"
        r="2.3"
        stroke="currentColor"
        strokeWidth="1.6"
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
    >
      <path
        d="M4 5V19M8 5V19M11 5V19M15 5V19M19 5V19"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M6 16V10C6 6.7 8.4 4.5 12 4.5C15.6 4.5 18 6.7 18 10V16L20 18H4L6 16Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M10 20H14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
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
      <path
        d="M5 4H19V16L15 20H5V4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M15 20V16H19M8 8H16M8 12H14"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 3.5V6M12 18V20.5M3.5 12H6M18 12H20.5M6 6L7.8 7.8M16.2 16.2L18 18M18 6L16.2 7.8M7.8 16.2L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
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
    >
      <circle
        cx="11"
        cy="11"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M16 16L20 20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
