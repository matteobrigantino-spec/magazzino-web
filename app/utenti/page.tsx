"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import { supabase } from "../../lib/supabaseClient";

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

  [key: string]: boolean | undefined;
};

type UserRow = {
  id: string;
  username: string;
  password: string;
  role: string | null;
  session_version: number | null;
  display_name: string | null;
  is_active: boolean | null;
  permissions: Permissions | null;
  created_at: string | null;
  updated_at: string | null;
};

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
  | "manage_users"
  | "low_stock";

const PERMISSIONS: {
  key: PermissionKey;
  title: string;
  description: string;
}[] = [
  {
    key: "dashboard",
    title: "Dashboard",
    description:
      "Può accedere alla pagina Home del gestionale.",
  },
  {
    key: "view_prices",
    title: "Visualizza prezzi",
    description:
      "Può vedere prezzi, costi e importi degli articoli.",
  },
  {
    key: "view_inventory_value",
    title: "Valore magazzino",
    description:
      "Può vedere il valore economico complessivo del magazzino.",
  },
  {
    key: "suppliers",
    title: "Fornitori",
    description:
      "Può accedere alle pagine e agli articoli dei fornitori.",
  },
  {
    key: "movements",
    title: "Movimenti",
    description:
      "Può accedere ai movimenti di carico e scarico.",
  },
  {
    key: "missing_codes",
    title: "Codici da inserire",
    description:
      "Può vedere e gestire i codici non trovati.",
  },
  {
    key: "orders",
    title: "Visualizza ordini",
    description:
      "Può consultare gli ordini presenti nel gestionale.",
  },
  {
    key: "create_orders",
    title: "Crea e modifica ordini",
    description:
      "Può creare, modificare e gestire gli ordini.",
  },
  {
    key: "reminders",
    title: "Promemoria",
    description:
      "Può accedere alle scadenze e ai promemoria.",
  },
  {
    key: "settings",
    title: "Impostazioni personali",
    description:
      "Può accedere alle impostazioni del proprio account.",
  },
  {
    key: "manage_users",
    title: "Gestione utenti",
    description:
      "Può creare utenti e modificare i loro permessi.",
  },
  {
    key: "low_stock",
    title: "Articoli da riordinare",
    description:
      "Può vedere gli articoli sotto scorta nella Home e il relativo report.",
  },
];

function createEmptyPermissions(): Permissions {
  return {
    dashboard: true,
    view_prices: false,
    view_inventory_value: false,
    suppliers: true,
    movements: true,
    missing_codes: true,
    orders: true,
    create_orders: false,
    reminders: true,
    settings: true,
    manage_users: false,
    low_stock: false,
  };
}

function normalizePermissions(
  value: Permissions | null | undefined
): Permissions {
  return {
    dashboard:
      value?.dashboard === true,
    view_prices:
      value?.view_prices === true,
    view_inventory_value:
      value?.view_inventory_value === true,
    suppliers:
      value?.suppliers === true,
    movements:
      value?.movements === true,
    missing_codes:
      value?.missing_codes === true,
    orders:
      value?.orders === true,
    create_orders:
      value?.create_orders === true,
    reminders:
      value?.reminders === true,
    settings:
      value?.settings === true,
    manage_users:
      value?.manage_users === true,
    low_stock:
      value?.low_stock !== false,
  };
}

export default function UsersPage() {
  const router = useRouter();

  const [users, setUsers] =
    useState<UserRow[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [msg, setMsg] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [showModal, setShowModal] =
    useState(false);

  const [editingUser, setEditingUser] =
    useState<UserRow | null>(null);

  const [displayName, setDisplayName] =
    useState("");

  const [username, setUsername] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [isActive, setIsActive] =
    useState(true);

  const [permissions, setPermissions] =
    useState<Permissions>(
      createEmptyPermissions()
    );

  const [allowed, setAllowed] =
    useState<boolean | null>(null);

  useEffect(() => {
    const localPermissions =
      localStorage.getItem(
        "magazzino_permissions"
      );

    let parsed: Permissions = {};

    try {
      parsed = localPermissions
        ? JSON.parse(localPermissions)
        : {};
    } catch {
      parsed = {};
    }

    const role =
      localStorage.getItem(
        "magazzino_role"
      );

    /*
      Manteniamo compatibilità
      con il vecchio account admin.
    */
    const canManage =
      parsed.manage_users === true ||
      role === "admin";

    setAllowed(canManage);

    if (!canManage) {
      setLoading(false);
      return;
    }

    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    setMsg("");

    const {
      data,
      error,
    } = await supabase
      .from("users")
      .select(
        `
          id,
          username,
          password,
          role,
          session_version,
          display_name,
          is_active,
          permissions,
          created_at,
          updated_at
        `
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (error) {
      setMsg(
        "Errore caricamento utenti: " +
          error.message
      );

      setUsers([]);
      setLoading(false);
      return;
    }

    setUsers(
      (data || []) as UserRow[]
    );

    setLoading(false);
  }

  function openCreate() {
    setEditingUser(null);

    setDisplayName("");
    setUsername("");
    setPassword("");
    setIsActive(true);

    setPermissions(
      createEmptyPermissions()
    );

    setMsg("");
    setShowModal(true);
  }

  function openEdit(
    user: UserRow
  ) {
    setEditingUser(user);

    setDisplayName(
      user.display_name || ""
    );

    setUsername(
      user.username || ""
    );

    /*
      La password esistente
      non viene mostrata.
      Se il campo rimane vuoto,
      non viene modificata.
    */
    setPassword("");

    setIsActive(
      user.is_active !== false
    );

    setPermissions(
      normalizePermissions(
        user.permissions
      )
    );

    setMsg("");
    setShowModal(true);
  }

  function closeModal() {
    if (saving) {
      return;
    }

    setShowModal(false);
    setEditingUser(null);
  }

  function togglePermission(
    key: PermissionKey
  ) {
    setPermissions(
      (current) => ({
        ...current,
        [key]:
          !current[key],
      })
    );
  }

  function selectAllPermissions() {
    const all: Permissions = {};

    PERMISSIONS.forEach(
      (permission) => {
        all[permission.key] =
          true;
      }
    );

    setPermissions(all);
  }

  function clearAllPermissions() {
    const none: Permissions = {};

    PERMISSIONS.forEach(
      (permission) => {
        none[permission.key] =
          false;
      }
    );

    setPermissions(none);
  }

  async function saveUser() {
    if (saving) {
      return;
    }

    setMsg("");

    const cleanDisplayName =
      displayName.trim();

    const cleanUsername =
      username.trim();

    const cleanPassword =
      password.trim();

    if (!cleanDisplayName) {
      setMsg(
        "Inserisci il nome dell'utente."
      );
      return;
    }

    if (!cleanUsername) {
      setMsg(
        "Inserisci uno username."
      );
      return;
    }

    if (
      !editingUser &&
      !cleanPassword
    ) {
      setMsg(
        "Inserisci una password per il nuovo utente."
      );
      return;
    }

    if (
      cleanPassword &&
      cleanPassword.length < 4
    ) {
      setMsg(
        "La password deve contenere almeno 4 caratteri."
      );
      return;
    }

    /*
      Se può creare ordini,
      deve anche poter vedere
      la sezione Ordini.
    */
    const finalPermissions = {
      ...permissions,
      orders:
        permissions.create_orders === true
          ? true
          : permissions.orders === true,
    };

    setSaving(true);

    if (!editingUser) {
      const {
        error,
      } = await supabase
        .from("users")
        .insert({
          username:
            cleanUsername,
          password:
            cleanPassword,
          display_name:
            cleanDisplayName,
          role: "user",
          session_version: 1,
          is_active:
            isActive,
          permissions:
            finalPermissions,
          updated_at:
            new Date().toISOString(),
        });

      if (error) {
        if (
          error.message
            .toLowerCase()
            .includes(
              "unique"
            )
        ) {
          setMsg(
            "Esiste già un utente con questo username."
          );
        } else {
          setMsg(
            "Errore creazione utente: " +
              error.message
          );
        }

        setSaving(false);
        return;
      }

      setSaving(false);
      setShowModal(false);

      await loadUsers();

      setMsg(
        "Utente creato correttamente."
      );

      return;
    }

    const currentVersion =
      Number(
        editingUser.session_version ||
          1
      );

    const updateData: {
      username: string;
      display_name: string;
      is_active: boolean;
      permissions: Permissions;
      updated_at: string;
      password?: string;
      session_version?: number;
    } = {
      username:
        cleanUsername,
      display_name:
        cleanDisplayName,
      is_active:
        isActive,
      permissions:
        finalPermissions,
      updated_at:
        new Date().toISOString(),
    };

    /*
      Se viene inserita una nuova
      password aumentiamo la
      session_version per scollegare
      gli altri PC dell'utente.
    */
    if (cleanPassword) {
      updateData.password =
        cleanPassword;

      updateData.session_version =
        currentVersion + 1;
    }

    const {
      error,
    } = await supabase
      .from("users")
      .update(updateData)
      .eq(
        "id",
        editingUser.id
      );

    if (error) {
      if (
        error.message
          .toLowerCase()
          .includes("unique")
      ) {
        setMsg(
          "Esiste già un utente con questo username."
        );
      } else {
        setMsg(
          "Errore aggiornamento utente: " +
            error.message
        );
      }

      setSaving(false);
      return;
    }

    setSaving(false);
    setShowModal(false);

    await loadUsers();

    setMsg(
      "Utente aggiornato correttamente."
    );
  }

  async function toggleUserActive(
    user: UserRow
  ) {
    const currentUserId =
      localStorage.getItem(
        "magazzino_user_id"
      );

    if (
      currentUserId ===
      user.id
    ) {
      setMsg(
        "Non puoi disattivare l'account che stai usando."
      );
      return;
    }

    const newActive =
      user.is_active === false;

    const newVersion =
      Number(
        user.session_version ||
          1
      ) + 1;

    const {
      error,
    } = await supabase
      .from("users")
      .update({
        is_active:
          newActive,
        session_version:
          newVersion,
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        user.id
      );

    if (error) {
      setMsg(
        "Errore aggiornamento account: " +
          error.message
      );
      return;
    }

    await loadUsers();

    setMsg(
      newActive
        ? "Account riattivato."
        : "Account disattivato."
    );
  }

  const filteredUsers =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      if (!query) {
        return users;
      }

      return users.filter(
        (user) => {
          const text = [
            user.display_name ||
              "",
            user.username ||
              "",
            user.role || "",
          ]
            .join(" ")
            .toLowerCase();

          return text.includes(
            query
          );
        }
      );
    }, [
      users,
      search,
    ]);

  if (
    allowed === null
  ) {
    return (
      <div style={pageStyle}>
        Caricamento...
      </div>
    );
  }

  if (!allowed) {
    return (
      <div style={pageStyle}>
        <div style={accessDeniedStyle}>
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
              margin:
                "0 0 8px",
              fontSize: 28,
            }}
          >
            Accesso non consentito
          </h1>

          <div
            style={{
              opacity: 0.65,
              marginBottom: 20,
            }}
          >
            Il tuo account non ha
            il permesso di gestire
            gli utenti.
          </div>

          <button
            type="button"
            onClick={() =>
              router.push("/")
            }
            style={
              secondaryButtonStyle
            }
          >
            ← Torna alla Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* TESTATA */}

      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>
            Amministrazione
          </div>

          <h1 style={titleStyle}>
            Utenti e permessi
          </h1>

          <div style={subtitleStyle}>
            Crea gli account e scegli
            cosa può vedere o gestire
            ogni singolo utente.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() =>
              router.push("/")
            }
            style={
              secondaryButtonStyle
            }
          >
            ← Dashboard
          </button>

          <button
            type="button"
            onClick={openCreate}
            style={
              primaryButtonStyle
            }
          >
            ＋ Nuovo utente
          </button>
        </div>
      </div>

      {/* RIEPILOGO */}

      <div style={statsGridStyle}>
        <StatCard
          label="Account totali"
          value={users.length}
        />

        <StatCard
          label="Account attivi"
          value={
            users.filter(
              (user) =>
                user.is_active !==
                false
            ).length
          }
        />

        <StatCard
          label="Con prezzi"
          value={
            users.filter(
              (user) =>
                user.permissions
                  ?.view_prices ===
                true
            ).length
          }
        />

        <StatCard
          label="Gestione utenti"
          value={
            users.filter(
              (user) =>
                user.permissions
                  ?.manage_users ===
                true
            ).length
          }
        />
      </div>

      {/* MESSAGGIO */}

      {msg && (
        <div style={messageStyle}>
          {msg}
        </div>
      )}

      {/* RICERCA */}

      <div style={toolbarStyle}>
        <input
          value={search}
          onChange={(event) =>
            setSearch(
              event.target.value
            )
          }
          placeholder="Cerca nome o username..."
          style={searchInputStyle}
        />

        <div
          style={{
            fontSize: 13,
            opacity: 0.6,
            fontWeight: 700,
          }}
        >
          {filteredUsers.length}{" "}
          {filteredUsers.length ===
          1
            ? "utente"
            : "utenti"}
        </div>
      </div>

      {/* ELENCO */}

      <div style={tableCardStyle}>
        {loading ? (
          <div style={emptyStyle}>
            Caricamento utenti...
          </div>
        ) : filteredUsers.length ===
          0 ? (
          <div style={emptyStyle}>
            Nessun utente trovato.
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
            }}
          >
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>
                    Utente
                  </th>

                  <th style={thStyle}>
                    Username
                  </th>

                  <th style={thStyle}>
                    Stato
                  </th>

                  <th style={thStyle}>
                    Prezzi
                  </th>

                  <th style={thStyle}>
                    Ordini
                  </th>

                  <th style={thStyle}>
                    Utenti
                  </th>

                  <th
                    style={{
                      ...thStyle,
                      textAlign:
                        "right",
                    }}
                  >
                    Azioni
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map(
                  (user) => {
                    const p =
                      normalizePermissions(
                        user.permissions
                      );

                    return (
                      <tr
                        key={user.id}
                        style={
                          trStyle
                        }
                      >
                        <td
                          style={
                            tdStyle
                          }
                        >
                          <div
                            style={{
                              display:
                                "flex",
                              alignItems:
                                "center",
                              gap: 11,
                            }}
                          >
                            <div
                              style={
                                avatarStyle
                              }
                            >
                              {(
                                user.display_name ||
                                user.username ||
                                "U"
                              )
                                .slice(0, 1)
                                .toUpperCase()}
                            </div>

                            <div>
                              <div
                                style={{
                                  fontWeight: 850,
                                }}
                              >
                                {user.display_name ||
                                  user.username}
                              </div>

                              <div
                                style={{
                                  fontSize: 11,
                                  opacity: 0.5,
                                  marginTop: 2,
                                }}
                              >
                                {user.role ===
                                "admin"
                                  ? "Amministratore"
                                  : "Utente"}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td
                          style={
                            tdStyle
                          }
                        >
                          {user.username}
                        </td>

                        <td
                          style={
                            tdStyle
                          }
                        >
                          <StatusBadge
                            active={
                              user.is_active !==
                              false
                            }
                          />
                        </td>

                        <td
                          style={
                            tdStyle
                          }
                        >
                          <PermissionBadge
                            value={
                              p.view_prices ===
                              true
                            }
                          />
                        </td>

                        <td
                          style={
                            tdStyle
                          }
                        >
                          <PermissionBadge
                            value={
                              p.orders ===
                              true
                            }
                          />
                        </td>

                        <td
                          style={
                            tdStyle
                          }
                        >
                          <PermissionBadge
                            value={
                              p.manage_users ===
                              true
                            }
                          />
                        </td>

                        <td
                          style={{
                            ...tdStyle,
                            textAlign:
                              "right",
                          }}
                        >
                          <div
                            style={{
                              display:
                                "flex",
                              justifyContent:
                                "flex-end",
                              gap: 8,
                              flexWrap:
                                "wrap",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                openEdit(
                                  user
                                )
                              }
                              style={
                                miniButtonStyle
                              }
                            >
                              Modifica
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                toggleUserActive(
                                  user
                                )
                              }
                              style={
                                miniButtonStyle
                              }
                            >
                              {user.is_active ===
                              false
                                ? "Riattiva"
                                : "Disattiva"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODALE */}

      {showModal && (
        <div style={modalOverlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <div>
                <div style={eyebrowStyle}>
                  {editingUser
                    ? "Modifica account"
                    : "Nuovo account"}
                </div>

                <h2
                  style={{
                    margin: 0,
                    fontSize: 27,
                    fontWeight: 900,
                  }}
                >
                  {editingUser
                    ? editingUser.display_name ||
                      editingUser.username
                    : "Crea utente"}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                style={closeButtonStyle}
              >
                ✕
              </button>
            </div>

            <div style={modalBodyStyle}>
              {/* DATI ACCOUNT */}

              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>
                  Dati account
                </div>

                <div style={formGridStyle}>
                  <Field
                    label="Nome visualizzato"
                  >
                    <input
                      value={displayName}
                      onChange={(event) =>
                        setDisplayName(
                          event.target.value
                        )
                      }
                      placeholder="Es. Mario Rossi"
                      disabled={saving}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="Username">
                    <input
                      value={username}
                      onChange={(event) =>
                        setUsername(
                          event.target.value
                        )
                      }
                      placeholder="Es. mario"
                      disabled={saving}
                      autoComplete="off"
                      style={inputStyle}
                    />
                  </Field>

                  <Field
                    label={
                      editingUser
                        ? "Nuova password"
                        : "Password"
                    }
                  >
                    <input
                      type="password"
                      value={password}
                      onChange={(event) =>
                        setPassword(
                          event.target.value
                        )
                      }
                      placeholder={
                        editingUser
                          ? "Lascia vuoto per non cambiarla"
                          : "Password iniziale"
                      }
                      disabled={saving}
                      autoComplete="new-password"
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="Stato account">
                    <button
                      type="button"
                      onClick={() =>
                        setIsActive(
                          (value) =>
                            !value
                        )
                      }
                      disabled={saving}
                      style={{
                        ...toggleAccountStyle,
                        opacity: saving
                          ? 0.5
                          : 1,
                      }}
                    >
                      <span
                        style={{
                          ...switchStyle,
                          justifyContent:
                            isActive
                              ? "flex-end"
                              : "flex-start",
                        }}
                      >
                        <span
                          style={
                            switchDotStyle
                          }
                        />
                      </span>

                      {isActive
                        ? "Account attivo"
                        : "Account disattivato"}
                    </button>
                  </Field>
                </div>
              </div>

              {/* PERMESSI */}

              <div style={sectionStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems:
                      "center",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <div
                      style={
                        sectionTitleStyle
                      }
                    >
                      Permessi
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.55,
                        marginTop: 3,
                      }}
                    >
                      Ogni utente può
                      avere una
                      configurazione
                      diversa.
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                    }}
                  >
                    <button
                      type="button"
                      onClick={
                        selectAllPermissions
                      }
                      style={
                        smallTextButtonStyle
                      }
                    >
                      Seleziona tutto
                    </button>

                    <button
                      type="button"
                      onClick={
                        clearAllPermissions
                      }
                      style={
                        smallTextButtonStyle
                      }
                    >
                      Deseleziona tutto
                    </button>
                  </div>
                </div>

                <div
                  style={
                    permissionGridStyle
                  }
                >
                  {PERMISSIONS.map(
                    (permission) => {
                      const enabled =
                        permissions[
                          permission.key
                        ] === true;

                      return (
                        <button
                          key={
                            permission.key
                          }
                          type="button"
                          onClick={() =>
                            togglePermission(
                              permission.key
                            )
                          }
                          disabled={saving}
                          style={{
                            ...permissionCardStyle,
                            borderColor:
                              enabled
                                ? "#2d87ff"
                                : "var(--border-color)",
                            background:
                              enabled
                                ? "rgba(45, 135, 255, 0.10)"
                                : "var(--input-bg)",
                          }}
                        >
                          <span
                            style={{
                              ...permissionSwitchStyle,
                              justifyContent:
                                enabled
                                  ? "flex-end"
                                  : "flex-start",
                              background:
                                enabled
                                  ? "#2d87ff"
                                  : "rgba(130, 145, 165, 0.35)",
                            }}
                          >
                            <span
                              style={
                                permissionDotStyle
                              }
                            />
                          </span>

                          <span
                            style={{
                              textAlign:
                                "left",
                            }}
                          >
                            <span
                              style={{
                                display:
                                  "block",
                                fontSize: 14,
                                fontWeight: 850,
                              }}
                            >
                              {
                                permission.title
                              }
                            </span>

                            <span
                              style={{
                                display:
                                  "block",
                                fontSize: 11,
                                lineHeight: 1.4,
                                opacity: 0.55,
                                marginTop: 3,
                              }}
                            >
                              {
                                permission.description
                              }
                            </span>
                          </span>
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {msg && (
                <div style={messageStyle}>
                  {msg}
                </div>
              )}
            </div>

            <div style={modalFooterStyle}>
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                style={
                  secondaryButtonStyle
                }
              >
                Annulla
              </button>

              <button
                type="button"
                onClick={saveUser}
                disabled={saving}
                style={{
                  ...primaryButtonStyle,
                  opacity: saving
                    ? 0.55
                    : 1,
                  cursor: saving
                    ? "not-allowed"
                    : "pointer",
                }}
              >
                {saving
                  ? "Salvataggio..."
                  : editingUser
                    ? "Salva modifiche"
                    : "Crea utente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div style={statCardStyle}>
      <div
        style={{
          fontSize: 12,
          opacity: 0.55,
          fontWeight: 750,
          marginBottom: 7,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 30,
          fontWeight: 950,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({
  active,
}: {
  active: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 850,
        background: active
          ? "rgba(20, 190, 120, 0.12)"
          : "rgba(230, 80, 80, 0.12)",
        border: active
          ? "1px solid rgba(20, 190, 120, 0.28)"
          : "1px solid rgba(230, 80, 80, 0.28)",
      }}
    >
      <span>
        {active ? "●" : "○"}
      </span>

      {active
        ? "Attivo"
        : "Disattivato"}
    </span>
  );
}

function PermissionBadge({
  value,
}: {
  value: boolean;
}) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 850,
        opacity: value
          ? 1
          : 0.38,
      }}
    >
      {value ? "✓ Sì" : "— No"}
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 800,
          marginBottom: 7,
        }}
      >
        {label}
      </label>

      {children}
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 1400,
  margin: "0 auto",
  paddingBottom: 40,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 20,
  flexWrap: "wrap",
  marginBottom: 24,
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.5,
  textTransform: "uppercase",
  letterSpacing: 1.2,
  fontWeight: 850,
  marginBottom: 5,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 34,
  fontWeight: 950,
};

const subtitleStyle: React.CSSProperties = {
  marginTop: 7,
  fontSize: 14,
  opacity: 0.6,
};

const statsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginBottom: 18,
};

const statCardStyle: React.CSSProperties = {
  padding: 17,
  border:
    "1px solid var(--border-color)",
  borderRadius: 13,
  background: "var(--card)",
};

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
  marginBottom: 14,
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 440,
  padding: "11px 13px",
  border:
    "1px solid var(--border-color)",
  borderRadius: 9,
  background: "var(--input-bg)",
  color: "var(--foreground)",
  fontSize: 14,
  outline: "none",
};

const tableCardStyle: React.CSSProperties = {
  border:
    "1px solid var(--border-color)",
  borderRadius: 14,
  overflow: "hidden",
  background: "var(--card)",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 900,
};

const thStyle: React.CSSProperties = {
  padding: "13px 15px",
  textAlign: "left",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.7,
  opacity: 0.55,
  background: "var(--table-head)",
  borderBottom:
    "1px solid var(--border-color)",
};

const tdStyle: React.CSSProperties = {
  padding: "13px 15px",
  fontSize: 13,
  borderBottom:
    "1px solid var(--border-color)",
  verticalAlign: "middle",
};

const trStyle: React.CSSProperties = {
  background: "var(--card)",
};

const avatarStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  fontWeight: 950,
  background:
    "linear-gradient(135deg, #1478ff, #43a0ff)",
  color: "#fff",
};

const emptyStyle: React.CSSProperties = {
  padding: 35,
  textAlign: "center",
  opacity: 0.55,
  fontSize: 14,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 15px",
  borderRadius: 9,
  border: "1px solid #2686ff",
  background:
    "linear-gradient(135deg, #1478ff, #2f92ff)",
  color: "#fff",
  fontWeight: 850,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 9,
  border:
    "1px solid var(--border-color)",
  background: "var(--input-bg)",
  color: "var(--foreground)",
  cursor: "pointer",
  fontWeight: 800,
};

const miniButtonStyle: React.CSSProperties = {
  padding: "7px 9px",
  borderRadius: 7,
  border:
    "1px solid var(--border-color)",
  background: "var(--input-bg)",
  color: "var(--foreground)",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 800,
};

const messageStyle: React.CSSProperties = {
  padding: "11px 13px",
  marginBottom: 14,
  borderRadius: 9,
  border:
    "1px solid var(--border-color)",
  background: "var(--input-bg)",
  fontSize: 13,
  fontWeight: 750,
};

const accessDeniedStyle: React.CSSProperties = {
  margin: "70px auto",
  maxWidth: 500,
  textAlign: "center",
  border:
    "1px solid var(--border-color)",
  borderRadius: 16,
  padding: 32,
  background: "var(--card)",
};

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background:
    "rgba(0, 0, 0, 0.72)",
  backdropFilter: "blur(5px)",
};

const modalStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 950,
  maxHeight: "92vh",
  display: "flex",
  flexDirection: "column",
  borderRadius: 16,
  overflow: "hidden",
  border:
    "1px solid var(--border-color)",
  background: "var(--card)",
  boxShadow:
    "0 30px 90px rgba(0,0,0,.45)",
};

const modalHeaderStyle: React.CSSProperties = {
  padding: "18px 20px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 15,
  borderBottom:
    "1px solid var(--border-color)",
  background: "var(--table-head)",
};

const modalBodyStyle: React.CSSProperties = {
  padding: 20,
  overflowY: "auto",
};

const modalFooterStyle: React.CSSProperties = {
  padding: "15px 20px",
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  borderTop:
    "1px solid var(--border-color)",
  background: "var(--table-head)",
};

const closeButtonStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 9,
  border:
    "1px solid var(--border-color)",
  background: "var(--input-bg)",
  color: "var(--foreground)",
  cursor: "pointer",
  fontSize: 16,
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 22,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 14,
  marginTop: 13,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  borderRadius: 8,
  border:
    "1px solid var(--border-color)",
  background: "var(--input-bg)",
  color: "var(--foreground)",
  fontSize: 14,
  outline: "none",
};

const toggleAccountStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 11px",
  borderRadius: 8,
  border:
    "1px solid var(--border-color)",
  background: "var(--input-bg)",
  color: "var(--foreground)",
  cursor: "pointer",
  fontWeight: 800,
};

const switchStyle: React.CSSProperties = {
  width: 37,
  height: 21,
  borderRadius: 999,
  display: "flex",
  alignItems: "center",
  padding: 2,
  boxSizing: "border-box",
  background: "#20ad74",
};

const switchDotStyle: React.CSSProperties = {
  width: 17,
  height: 17,
  borderRadius: "50%",
  background: "#fff",
};

const permissionGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(255px, 1fr))",
  gap: 10,
};

const permissionCardStyle: React.CSSProperties = {
  minHeight: 78,
  display: "flex",
  alignItems: "flex-start",
  gap: 11,
  padding: 12,
  borderRadius: 10,
  border: "1px solid",
  color: "var(--foreground)",
  cursor: "pointer",
};

const permissionSwitchStyle: React.CSSProperties = {
  width: 35,
  height: 20,
  flexShrink: 0,
  borderRadius: 999,
  display: "flex",
  alignItems: "center",
  padding: 2,
  boxSizing: "border-box",
};

const permissionDotStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: "50%",
  background: "#fff",
};

const smallTextButtonStyle: React.CSSProperties = {
  padding: "7px 9px",
  borderRadius: 7,
  border:
    "1px solid var(--border-color)",
  background: "var(--input-bg)",
  color: "var(--foreground)",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 800,
};