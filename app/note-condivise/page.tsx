"use client";

import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../lib/supabaseClient";

type NoteStatus =
  | "new"
  | "read"
  | "resolved";

type ViewMode =
  | "all"
  | "received"
  | "sent";

type StatusFilter =
  | "all"
  | NoteStatus;

type UserRow = {
  id: string;
  username: string;
  display_name: string | null;
  is_active: boolean;
};

type SharedNote = {
  id: string;
  sender_user_id: string;
  recipient_user_id: string;
  sender_name: string;
  title: string;
  message: string;
  status: NoteStatus;
  created_at: string;
  read_at: string | null;
  resolved_at: string | null;
};

export default function SharedNotesPage() {
  const [notes, setNotes] =
    useState<SharedNote[]>([]);

  const [users, setUsers] =
    useState<UserRow[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const [currentUserId, setCurrentUserId] =
    useState("");

  const [currentUsername, setCurrentUsername] =
    useState("");

  const [currentDisplayName, setCurrentDisplayName] =
    useState("Utente");

  const [isMainAccount, setIsMainAccount] =
    useState(false);

  const [viewMode, setViewMode] =
    useState<ViewMode>("received");

  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");

  const [search, setSearch] =
    useState("");

  const [noteModalOpen, setNoteModalOpen] =
    useState(false);

  const [recipientId, setRecipientId] =
    useState("");

  const [noteTitle, setNoteTitle] =
    useState("");

  const [noteMessage, setNoteMessage] =
    useState("");

  const [sendingNote, setSendingNote] =
    useState(false);

  useEffect(() => {
    const userId =
      localStorage.getItem(
        "magazzino_user_id"
      ) || "";

    const username =
      localStorage.getItem(
        "magazzino_user"
      ) || "";

    const displayName =
      localStorage.getItem(
        "magazzino_display_name"
      ) ||
      username ||
      "Utente";

    const mainAccount =
      username.toLowerCase() ===
      "admin";

    setCurrentUserId(userId);
    setCurrentUsername(username);
    setCurrentDisplayName(displayName);
    setIsMainAccount(mainAccount);
    setViewMode(
      mainAccount
        ? "all"
        : "received"
    );

    if (!userId) {
      setLoading(false);
      return;
    }

    loadPageData(
      userId,
      mainAccount,
      true
    );
  }, []);

  async function loadPageData(
    userId: string,
    mainAccount: boolean,
    initial = false
  ) {
    if (initial) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setErrorMessage("");

    const {
      data: usersData,
      error: usersError,
    } = await supabase
      .from("users")
      .select(
        "id,username,display_name,is_active"
      )
      .eq("is_active", true)
      .order("display_name", {
        ascending: true,
        nullsFirst: false,
      })
      .order("username", {
        ascending: true,
      });

    if (usersError) {
      setErrorMessage(
        "Errore caricamento utenti: " +
          usersError.message
      );

      setLoading(false);
      setRefreshing(false);
      return;
    }

    const cleanUsers: UserRow[] =
      (usersData || []).map(
        (row) => ({
          id: String(row.id),

          username:
            String(
              row.username || ""
            ),

          display_name:
            row.display_name
              ? String(
                  row.display_name
                )
              : null,

          is_active:
            Boolean(
              row.is_active
            ),
        })
      );

    let notesQuery =
      supabase
        .from("shared_notes")
        .select(
          "id,sender_user_id,recipient_user_id,sender_name,title,message,status,created_at,read_at,resolved_at"
        );

    if (!mainAccount) {
      notesQuery =
        notesQuery.or(
          `sender_user_id.eq.${userId},recipient_user_id.eq.${userId}`
        );
    }

    const {
      data: notesData,
      error: notesError,
    } = await notesQuery.order(
      "created_at",
      {
        ascending: false,
      }
    );

    if (notesError) {
      setErrorMessage(
        "Errore caricamento note: " +
          notesError.message
      );

      setLoading(false);
      setRefreshing(false);
      return;
    }

    const cleanNotes:
      SharedNote[] =
      (notesData || []).map(
        (row) => ({
          id:
            String(row.id),

          sender_user_id:
            String(
              row.sender_user_id ||
                ""
            ),

          recipient_user_id:
            String(
              row.recipient_user_id ||
                ""
            ),

          sender_name:
            String(
              row.sender_name ||
                "Utente"
            ),

          title:
            String(
              row.title ||
                "Senza titolo"
            ),

          message:
            String(
              row.message ||
                ""
            ),

          status:
            normalizeStatus(
              row.status
            ),

          created_at:
            String(
              row.created_at ||
                ""
            ),

          read_at:
            row.read_at
              ? String(
                  row.read_at
                )
              : null,

          resolved_at:
            row.resolved_at
              ? String(
                  row.resolved_at
                )
              : null,
        })
      );

    setUsers(cleanUsers);
    setNotes(cleanNotes);

    setLoading(false);
    setRefreshing(false);
  }

  function openNewNote() {
    setSuccessMessage("");
    setErrorMessage("");
    setNoteTitle("");
    setNoteMessage("");

    const firstRecipient =
      users.find(
        (user) =>
          user.id !==
          currentUserId
      );

    setRecipientId(
      firstRecipient?.id ||
        ""
    );

    setNoteModalOpen(true);
  }

  function closeNewNote() {
    if (sendingNote) {
      return;
    }

    setNoteModalOpen(false);
  }

  async function sendNote() {
    const cleanTitle =
      noteTitle.trim();

    const cleanMessage =
      noteMessage.trim();

    if (!currentUserId) {
      setErrorMessage(
        "Sessione utente non valida."
      );

      return;
    }

    if (!recipientId) {
      window.alert(
        "Seleziona un destinatario."
      );

      return;
    }

    if (!cleanTitle) {
      window.alert(
        "Inserisci il titolo della nota."
      );

      return;
    }

    if (!cleanMessage) {
      window.alert(
        "Scrivi il messaggio."
      );

      return;
    }

    setSendingNote(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } =
      await supabase
        .from("shared_notes")
        .insert({
          sender_user_id:
            currentUserId,

          recipient_user_id:
            recipientId,

          sender_name:
            currentDisplayName,

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
      setErrorMessage(
        "Errore invio nota: " +
          error.message
      );

      setSendingNote(false);
      return;
    }

    const recipient =
      users.find(
        (user) =>
          user.id ===
          recipientId
      );

    setSendingNote(false);
    setNoteModalOpen(false);

    setSuccessMessage(
      `Nota inviata a ${
        userLabel(
          recipient
        )
      }.`
    );

    if (!isMainAccount) {
      setViewMode("sent");
    }

    await loadPageData(
      currentUserId,
      isMainAccount,
      false
    );
  }

  async function updateStatus(
    note: SharedNote,
    nextStatus: NoteStatus
  ) {
    /*
      Solo il destinatario modifica lo stato.

      L'account admin può vedere tutte le note,
      ma se una nota è tra altri due utenti non
      la segna come "letta" al posto del vero
      destinatario.
    */
    if (
      note.recipient_user_id !==
      currentUserId
    ) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    const now =
      new Date().toISOString();

    const payload: {
      status: NoteStatus;
      read_at: string | null;
      resolved_at: string | null;
    } = {
      status: nextStatus,
      read_at:
        nextStatus === "new"
          ? null
          : note.read_at ||
            now,

      resolved_at:
        nextStatus ===
        "resolved"
          ? now
          : null,
    };

    const { error } =
      await supabase
        .from("shared_notes")
        .update(payload)
        .eq("id", note.id)
        .eq(
          "recipient_user_id",
          currentUserId
        );

    if (error) {
      setErrorMessage(
        "Errore aggiornamento nota: " +
          error.message
      );

      return;
    }

    setNotes(
      (current) =>
        current.map(
          (row) =>
            row.id ===
            note.id
              ? {
                  ...row,
                  status:
                    nextStatus,

                  read_at:
                    payload.read_at,

                  resolved_at:
                    payload.resolved_at,
                }
              : row
        )
    );
  }

  const userMap =
    useMemo(() => {
      const map =
        new Map<
          string,
          UserRow
        >();

      users.forEach(
        (user) => {
          map.set(
            user.id,
            user
          );
        }
      );

      return map;
    }, [users]);

  const stats =
    useMemo(() => {
      const received =
        notes.filter(
          (note) =>
            note.recipient_user_id ===
            currentUserId
        );

      const sent =
        notes.filter(
          (note) =>
            note.sender_user_id ===
            currentUserId
        );

      const unread =
        received.filter(
          (note) =>
            note.status ===
            "new"
        );

      return {
        visible:
          notes.length,

        received:
          received.length,

        sent:
          sent.length,

        unread:
          unread.length,
      };
    }, [
      notes,
      currentUserId,
    ]);

  const filteredNotes =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      return notes.filter(
        (note) => {
          const matchesView =
            viewMode === "all"
              ? isMainAccount
              : viewMode ===
                "received"
              ? note.recipient_user_id ===
                currentUserId
              : note.sender_user_id ===
                currentUserId;

          const matchesStatus =
            statusFilter ===
              "all" ||
            note.status ===
              statusFilter;

          const senderUser =
            userMap.get(
              note.sender_user_id
            );

          const recipientUser =
            userMap.get(
              note.recipient_user_id
            );

          const searchable =
            [
              note.sender_name,
              note.title,
              note.message,
              userLabel(
                senderUser
              ),
              userLabel(
                recipientUser
              ),
            ]
              .join(" ")
              .toLowerCase();

          const matchesSearch =
            !term ||
            searchable.includes(
              term
            );

          return (
            matchesView &&
            matchesStatus &&
            matchesSearch
          );
        }
      );
    }, [
      notes,
      viewMode,
      statusFilter,
      search,
      isMainAccount,
      currentUserId,
      userMap,
    ]);

  const recipients =
    useMemo(() => {
      return users.filter(
        (user) =>
          user.id !==
          currentUserId
      );
    }, [
      users,
      currentUserId,
    ]);

  if (loading) {
    return (
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: 30,
          opacity: 0.65,
        }}
      >
        Caricamento note condivise...
      </div>
    );
  }

  if (!currentUserId) {
    return (
      <div
        style={{
          maxWidth: 700,
          margin: "70px auto",
          padding: 30,
          textAlign:
            "center",
          border:
            "1px solid var(--border-color)",
          borderRadius: 16,
          background:
            "var(--card)",
        }}
      >
        Sessione non disponibile.
        Esci e accedi nuovamente.
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1400,
        margin: "0 auto",
      }}
    >
      {/* TESTATA */}

      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap: 18,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              opacity: 0.55,
              marginBottom: 4,
              textTransform:
                "uppercase",
              letterSpacing: 1.2,
              fontWeight: 800,
            }}
          >
            Comunicazioni interne
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 34,
              fontWeight: 950,
              letterSpacing:
                "-0.5px",
            }}
          >
            Note condivise
          </h1>

          <div
            style={{
              marginTop: 6,
              maxWidth: 760,
              fontSize: 14,
              opacity: 0.62,
              lineHeight: 1.5,
            }}
          >
            Invia e ricevi comunicazioni
            tra gli account del magazzino.
            {isMainAccount &&
              " Il tuo account può vedere anche le note scambiate tra gli altri utenti."}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 9,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            disabled={
              refreshing
            }
            onClick={() =>
              loadPageData(
                currentUserId,
                isMainAccount,
                false
              )
            }
            style={
              secondaryButtonStyle
            }
          >
            {refreshing
              ? "Aggiornamento..."
              : "↻ Aggiorna"}
          </button>

          <button
            type="button"
            onClick={
              openNewNote
            }
            disabled={
              recipients.length ===
              0
            }
            style={
              primaryButtonStyle
            }
          >
            + Nuova nota
          </button>
        </div>
      </div>

      {errorMessage && (
        <MessageBox
          tone="error"
        >
          {errorMessage}
        </MessageBox>
      )}

      {successMessage && (
        <MessageBox
          tone="success"
        >
          {successMessage}
        </MessageBox>
      )}

      {/* KPI */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {isMainAccount && (
          <StatCard
            label="Tutte visibili"
            value={
              stats.visible
            }
            tone="neutral"
          />
        )}

        <StatCard
          label="Ricevute"
          value={
            stats.received
          }
          tone="info"
        />

        <StatCard
          label="Da leggere"
          value={
            stats.unread
          }
          tone="danger"
        />

        <StatCard
          label="Inviate"
          value={
            stats.sent
          }
          tone="success"
        />
      </div>

      {/* TAB */}

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        {isMainAccount && (
          <TabButton
            active={
              viewMode ===
              "all"
            }
            onClick={() =>
              setViewMode(
                "all"
              )
            }
          >
            Tutte
          </TabButton>
        )}

        <TabButton
          active={
            viewMode ===
            "received"
          }
          onClick={() =>
            setViewMode(
              "received"
            )
          }
        >
          Ricevute
        </TabButton>

        <TabButton
          active={
            viewMode ===
            "sent"
          }
          onClick={() =>
            setViewMode(
              "sent"
            )
          }
        >
          Inviate
        </TabButton>
      </div>

      {/* FILTRI */}

      <div
        style={{
          padding: 14,
          marginBottom: 16,
          border:
            "1px solid var(--border-color)",
          borderRadius: 12,
          background:
            "var(--card)",
          display: "flex",
          alignItems:
            "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <input
          type="search"
          value={search}
          onChange={(
            event
          ) =>
            setSearch(
              event.target.value
            )
          }
          placeholder="Cerca utente, titolo o testo..."
          style={{
            flex:
              "1 1 360px",
            minWidth: 220,
            padding:
              "11px 13px",
            borderRadius: 8,
            border:
              "1px solid var(--border-color)",
            background:
              "var(--input-bg)",
            color:
              "var(--foreground)",
            outline: "none",
            fontSize: 14,
          }}
        />

        <select
          value={
            statusFilter
          }
          onChange={(
            event
          ) =>
            setStatusFilter(
              event.target
                .value as StatusFilter
            )
          }
          style={{
            padding:
              "11px 13px",
            borderRadius: 8,
            border:
              "1px solid var(--border-color)",
            background:
              "var(--input-bg)",
            color:
              "var(--foreground)",
            outline: "none",
            fontWeight: 750,
          }}
        >
          <option value="all">
            Tutti gli stati
          </option>

          <option value="new">
            Da leggere
          </option>

          <option value="read">
            Lette
          </option>

          <option value="resolved">
            Risolte
          </option>
        </select>

        <div
          style={{
            padding:
              "0 5px",
            fontSize: 12,
            opacity: 0.55,
          }}
        >
          {filteredNotes.length} note
        </div>
      </div>

      {/* ELENCO */}

      {filteredNotes.length ===
      0 ? (
        <div
          style={{
            padding: 46,
            textAlign: "center",
            border:
              "1px solid var(--border-color)",
            borderRadius: 14,
            background:
              "var(--card)",
          }}
        >
          <div
            style={{
              fontSize: 32,
              marginBottom: 10,
            }}
          >
            📝
          </div>

          <div
            style={{
              fontSize: 18,
              fontWeight: 850,
            }}
          >
            Nessuna nota
          </div>

          <div
            style={{
              marginTop: 5,
              fontSize: 13,
              opacity: 0.55,
            }}
          >
            Non ci sono note
            corrispondenti ai filtri
            selezionati.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection:
              "column",
            gap: 12,
          }}
        >
          {filteredNotes.map(
            (note) => {
              const sender =
                userMap.get(
                  note.sender_user_id
                );

              const recipient =
                userMap.get(
                  note.recipient_user_id
                );

              const canManageStatus =
                note.recipient_user_id ===
                currentUserId;

              return (
                <NoteCard
                  key={
                    note.id
                  }
                  note={
                    note
                  }
                  senderLabel={
                    userLabel(
                      sender
                    ) ||
                    note.sender_name
                  }
                  recipientLabel={
                    userLabel(
                      recipient
                    )
                  }
                  canManageStatus={
                    canManageStatus
                  }
                  isObserver={
                    isMainAccount &&
                    note.sender_user_id !==
                      currentUserId &&
                    note.recipient_user_id !==
                      currentUserId
                  }
                  onRead={() =>
                    updateStatus(
                      note,
                      "read"
                    )
                  }
                  onResolve={() =>
                    updateStatus(
                      note,
                      "resolved"
                    )
                  }
                  onReopen={() =>
                    updateStatus(
                      note,
                      "read"
                    )
                  }
                />
              );
            }
          )}
        </div>
      )}

      {/* MODALE NUOVA NOTA */}

      {noteModalOpen && (
        <div
          style={
            modalBackdropStyle
          }
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeNewNote();
            }
          }}
        >
          <div
            style={
              modalStyle
            }
          >
            <div
              style={
                modalHeaderStyle
              }
            >
              <div>
                <div
                  style={{
                    color:
                      "#60a5fa",
                    fontSize: 9,
                    fontWeight: 900,
                    letterSpacing:
                      1.4,
                  }}
                >
                  NOTE CONDIVISE
                </div>

                <h2
                  style={{
                    margin:
                      "5px 0 0",
                    fontSize: 23,
                    fontWeight: 950,
                  }}
                >
                  Nuova nota
                </h2>
              </div>

              <button
                type="button"
                onClick={
                  closeNewNote
                }
                disabled={
                  sendingNote
                }
                style={
                  closeButtonStyle
                }
              >
                ×
              </button>
            </div>

            <div
              style={{
                padding:
                  "20px 21px",
              }}
            >
              <FormLabel>
                Destinatario
              </FormLabel>

              <select
                value={
                  recipientId
                }
                onChange={(
                  event
                ) =>
                  setRecipientId(
                    event.target
                      .value
                  )
                }
                disabled={
                  sendingNote
                }
                style={
                  formControlStyle
                }
              >
                {recipients.length ===
                0 ? (
                  <option value="">
                    Nessun altro account attivo
                  </option>
                ) : (
                  recipients.map(
                    (user) => (
                      <option
                        key={
                          user.id
                        }
                        value={
                          user.id
                        }
                      >
                        {userLabel(
                          user
                        )}
                      </option>
                    )
                  )
                )}
              </select>

              <FormLabel>
                Titolo
              </FormLabel>

              <input
                autoFocus
                type="text"
                maxLength={200}
                value={
                  noteTitle
                }
                onChange={(
                  event
                ) =>
                  setNoteTitle(
                    event.target
                      .value
                  )
                }
                disabled={
                  sendingNote
                }
                placeholder="Es. Controllare materiale arrivato"
                style={
                  formControlStyle
                }
              />

              <FormLabel>
                Messaggio
              </FormLabel>

              <textarea
                rows={6}
                maxLength={5000}
                value={
                  noteMessage
                }
                onChange={(
                  event
                ) =>
                  setNoteMessage(
                    event.target
                      .value
                  )
                }
                disabled={
                  sendingNote
                }
                placeholder="Scrivi qui la comunicazione..."
                style={{
                  ...formControlStyle,
                  resize:
                    "vertical",
                }}
              />

              <div
                style={{
                  marginTop: 6,
                  textAlign:
                    "right",
                  fontSize: 10,
                  opacity: 0.45,
                }}
              >
                {noteMessage.length}/5000
              </div>
            </div>

            <div
              style={
                modalActionsStyle
              }
            >
              <button
                type="button"
                onClick={
                  closeNewNote
                }
                disabled={
                  sendingNote
                }
                style={
                  modalCancelStyle
                }
              >
                Annulla
              </button>

              <button
                type="button"
                onClick={
                  sendNote
                }
                disabled={
                  sendingNote ||
                  !recipientId
                }
                style={
                  modalSendStyle
                }
              >
                {sendingNote
                  ? "Invio..."
                  : "Invia nota"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NoteCard({
  note,
  senderLabel,
  recipientLabel,
  canManageStatus,
  isObserver,
  onRead,
  onResolve,
  onReopen,
}: {
  note: SharedNote;
  senderLabel: string;
  recipientLabel: string;
  canManageStatus: boolean;
  isObserver: boolean;
  onRead: () => void;
  onResolve: () => void;
  onReopen: () => void;
}) {
  const isNew =
    note.status === "new";

  return (
    <div
      style={{
        padding: 18,
        border: isNew
          ? "1px solid rgba(59,130,246,0.45)"
          : "1px solid var(--border-color)",

        borderRadius: 13,

        background: isNew
          ? "rgba(59,130,246,0.05)"
          : "var(--card)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems:
            "flex-start",
          justifyContent:
            "space-between",
          gap: 18,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            flex: "1 1 560px",
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems:
                "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <StatusBadge
              status={
                note.status
              }
            />

            {isObserver && (
              <span
                style={{
                  ...badgeBase,
                  color:
                    "#a78bfa",
                  border:
                    "1px solid rgba(139,92,246,0.30)",
                  background:
                    "rgba(139,92,246,0.09)",
                }}
              >
                VISTA ADMIN
              </span>
            )}

            <span
              style={{
                fontSize: 11,
                opacity: 0.5,
              }}
            >
              {formatDateTime(
                note.created_at
              )}
            </span>
          </div>

          <div
            style={{
              marginTop: 11,
              fontSize: 19,
              fontWeight: 900,
              lineHeight: 1.3,
              wordBreak:
                "break-word",
            }}
          >
            {note.title}
          </div>

          <div
            style={{
              marginTop: 6,
              display: "flex",
              alignItems:
                "center",
              gap: 7,
              flexWrap: "wrap",
              fontSize: 12,
              opacity: 0.65,
            }}
          >
            <strong>
              {senderLabel ||
                note.sender_name}
            </strong>

            <span>
              →
            </span>

            <strong>
              {recipientLabel ||
                "Destinatario"}
            </strong>
          </div>

          <div
            style={{
              marginTop: 14,
              padding:
                "14px 15px",
              borderRadius: 10,
              border:
                "1px solid var(--border-color)",
              background:
                "var(--input-bg)",
              whiteSpace:
                "pre-wrap",
              lineHeight: 1.55,
              fontSize: 14,
              wordBreak:
                "break-word",
            }}
          >
            {note.message}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent:
              "flex-end",
          }}
        >
          {canManageStatus &&
            note.status ===
              "new" && (
              <button
                type="button"
                onClick={
                  onRead
                }
                style={
                  secondaryButtonStyle
                }
              >
                Segna letta
              </button>
            )}

          {canManageStatus &&
            note.status !==
              "resolved" && (
              <button
                type="button"
                onClick={
                  onResolve
                }
                style={
                  resolveButtonStyle
                }
              >
                ✓ Risolta
              </button>
            )}

          {canManageStatus &&
            note.status ===
              "resolved" && (
              <button
                type="button"
                onClick={
                  onReopen
                }
                style={
                  secondaryButtonStyle
                }
              >
                Riapri
              </button>
            )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding:
          "9px 13px",
        borderRadius: 9,

        border: active
          ? "1px solid rgba(59,130,246,0.42)"
          : "1px solid var(--border-color)",

        background: active
          ? "rgba(59,130,246,0.10)"
          : "var(--card)",

        color: active
          ? "#60a5fa"
          : "var(--foreground)",

        cursor: "pointer",
        fontWeight: 850,
        fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone:
    | "neutral"
    | "info"
    | "danger"
    | "success";
}) {
  const style =
    statTone(tone);

  return (
    <div
      style={{
        padding: 18,
        border:
          style.border,
        borderRadius: 12,
        background:
          style.background,
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform:
            "uppercase",
          letterSpacing: 0.8,
          fontWeight: 850,
          opacity: 0.55,
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 7,
          fontSize: 29,
          fontWeight: 950,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: NoteStatus;
}) {
  if (
    status === "resolved"
  ) {
    return (
      <span
        style={{
          ...badgeBase,
          color: "#22c55e",
          background:
            "rgba(34,197,94,0.10)",
          border:
            "1px solid rgba(34,197,94,0.30)",
        }}
      >
        RISOLTA
      </span>
    );
  }

  if (
    status === "read"
  ) {
    return (
      <span
        style={{
          ...badgeBase,
          color: "#3b82f6",
          background:
            "rgba(59,130,246,0.10)",
          border:
            "1px solid rgba(59,130,246,0.30)",
        }}
      >
        LETTA
      </span>
    );
  }

  return (
    <span
      style={{
        ...badgeBase,
        color: "#ef4444",
        background:
          "rgba(239,68,68,0.10)",
        border:
          "1px solid rgba(239,68,68,0.30)",
      }}
    >
      DA LEGGERE
    </span>
  );
}

function MessageBox({
  tone,
  children,
}: {
  tone:
    | "error"
    | "success";
  children: ReactNode;
}) {
  const success =
    tone === "success";

  return (
    <div
      style={{
        marginBottom: 16,
        padding:
          "12px 14px",
        borderRadius: 9,

        border: success
          ? "1px solid rgba(34,197,94,0.38)"
          : "1px solid rgba(239,68,68,0.40)",

        background: success
          ? "rgba(34,197,94,0.08)"
          : "rgba(239,68,68,0.08)",

        color: success
          ? "#22c55e"
          : "#ef4444",

        fontSize: 13,
        fontWeight: 750,
      }}
    >
      {children}
    </div>
  );
}

function FormLabel({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <label
      style={{
        display: "block",
        margin:
          "14px 0 7px",
        color:
          "rgba(255,255,255,0.72)",
        fontSize: 10,
        fontWeight: 850,
        textTransform:
          "uppercase",
        letterSpacing: 0.6,
      }}
    >
      {children}
    </label>
  );
}

function normalizeStatus(
  value: unknown
): NoteStatus {
  if (
    value === "read"
  ) {
    return "read";
  }

  if (
    value === "resolved"
  ) {
    return "resolved";
  }

  return "new";
}

function userLabel(
  user:
    | UserRow
    | undefined
) {
  if (!user) {
    return "";
  }

  const display =
    user.display_name?.trim();

  if (
    display &&
    display.toLowerCase() !==
      user.username.toLowerCase()
  ) {
    return `${display} (${user.username})`;
  }

  return (
    display ||
    user.username ||
    "Utente"
  );
}

function formatDateTime(
  value: string
) {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

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
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(date);
}

function statTone(
  tone:
    | "neutral"
    | "info"
    | "danger"
    | "success"
) {
  if (
    tone === "info"
  ) {
    return {
      border:
        "1px solid rgba(59,130,246,0.28)",
      background:
        "rgba(59,130,246,0.06)",
    };
  }

  if (
    tone === "danger"
  ) {
    return {
      border:
        "1px solid rgba(239,68,68,0.28)",
      background:
        "rgba(239,68,68,0.06)",
    };
  }

  if (
    tone === "success"
  ) {
    return {
      border:
        "1px solid rgba(34,197,94,0.28)",
      background:
        "rgba(34,197,94,0.06)",
    };
  }

  return {
    border:
      "1px solid var(--border-color)",
    background:
      "var(--card)",
  };
}

const badgeBase = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: 20,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: 0.4,
};

const secondaryButtonStyle = {
  padding:
    "9px 12px",
  borderRadius: 8,
  border:
    "1px solid var(--border-color)",
  background:
    "var(--input-bg)",
  color:
    "var(--foreground)",
  cursor: "pointer",
  fontWeight: 800,
};

const primaryButtonStyle = {
  padding:
    "10px 14px",
  borderRadius: 9,
  border:
    "1px solid #3b82f6",
  background:
    "#3b82f6",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
};

const resolveButtonStyle = {
  padding:
    "9px 12px",
  borderRadius: 8,
  border:
    "1px solid rgba(34,197,94,0.38)",
  background:
    "rgba(34,197,94,0.10)",
  color: "#22c55e",
  cursor: "pointer",
  fontWeight: 850,
};

const modalBackdropStyle = {
  position:
    "fixed" as const,
  inset: 0,
  zIndex: 9999,
  padding: 20,
  display: "flex",
  alignItems: "center",
  justifyContent:
    "center",
  background:
    "rgba(0,0,0,0.68)",
  backdropFilter:
    "blur(5px)",
};

const modalStyle = {
  width:
    "min(560px, 100%)",
  maxHeight:
    "calc(100vh - 40px)",
  overflowY:
    "auto" as const,
  border:
    "1px solid rgba(96,165,250,0.30)",
  borderRadius: 16,
  background:
    "#0b1422",
  color: "white",
  boxShadow:
    "0 28px 90px rgba(0,0,0,0.55)",
};

const modalHeaderStyle = {
  padding:
    "20px 21px",
  display: "flex",
  alignItems:
    "flex-start",
  justifyContent:
    "space-between",
  gap: 15,
  borderBottom:
    "1px solid rgba(96,165,250,0.16)",
};

const closeButtonStyle = {
  width: 32,
  height: 32,
  border:
    "1px solid rgba(255,255,255,0.13)",
  borderRadius: 8,
  background:
    "rgba(255,255,255,0.04)",
  color: "white",
  cursor: "pointer",
  fontSize: 20,
};

const formControlStyle = {
  width: "100%",
  boxSizing:
    "border-box" as const,
  padding:
    "12px 13px",
  border:
    "1px solid rgba(96,165,250,0.22)",
  borderRadius: 9,
  outline: "none",
  background:
    "rgba(255,255,255,0.035)",
  color: "white",
  font: "inherit",
};

const modalActionsStyle = {
  padding:
    "15px 21px 20px",
  display: "flex",
  justifyContent:
    "flex-end",
  gap: 9,
  borderTop:
    "1px solid rgba(96,165,250,0.12)",
};

const modalCancelStyle = {
  padding:
    "10px 14px",
  borderRadius: 8,
  border:
    "1px solid rgba(255,255,255,0.13)",
  background:
    "transparent",
  color: "white",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 900,
};

const modalSendStyle = {
  padding:
    "10px 14px",
  borderRadius: 8,
  border:
    "1px solid #3b82f6",
  background:
    "#3b82f6",
  color: "white",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 900,
};
