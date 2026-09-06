"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

type PwaTheme = "light" | "dark";
type NoteStatus = "new" | "read" | "resolved";
type ViewMode = "received" | "sent";

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

const THEME_KEY = "magazzino_pwa_theme";

export default function NoteMagazzinierePage() {
  const [theme, setTheme] = useState<PwaTheme>("dark");
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("received");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingId, setUpdatingId] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);

    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }

    loadNotes(true);
  }, []);

  function changeTheme(nextTheme: PwaTheme) {
    setTheme(nextTheme);
    localStorage.setItem(THEME_KEY, nextTheme);
  }

  async function loadNotes(initial = false) {
    if (initial) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setErrorMessage("");

    const { data, error } = await supabase.rpc(
      "get_magazziniere_notes"
    );

    if (error) {
      setErrorMessage(
        "Impossibile caricare le note. Controlla la connessione e riprova."
      );
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const cleanNotes: SharedNote[] = (data || []).map(
      (row: Record<string, unknown>) => ({
        id: String(row.id || ""),
        sender_user_id: String(row.sender_user_id || ""),
        recipient_user_id: String(row.recipient_user_id || ""),
        sender_name: String(row.sender_name || ""),
        title: String(row.title || "Senza titolo"),
        message: String(row.message || ""),
        status: normalizeStatus(row.status),
        created_at: String(row.created_at || ""),
        read_at: row.read_at ? String(row.read_at) : null,
        resolved_at: row.resolved_at
          ? String(row.resolved_at)
          : null,
      })
    );

    setNotes(cleanNotes);
    setLoading(false);
    setRefreshing(false);
  }

  const receivedNotes = useMemo(
    () => notes.filter((note) => !isWarehouseNote(note)),
    [notes]
  );

  const sentNotes = useMemo(
    () => notes.filter((note) => isWarehouseNote(note)),
    [notes]
  );

  const unreadCount = useMemo(
    () =>
      receivedNotes.filter(
        (note) => note.status === "new"
      ).length,
    [receivedNotes]
  );

  const visibleNotes =
    viewMode === "received" ? receivedNotes : sentNotes;

  function openComposer() {
    setTitle("");
    setMessage("");
    setErrorMessage("");
    setSuccessMessage("");
    setComposerOpen(true);
  }

  function closeComposer() {
    if (sending) {
      return;
    }

    setComposerOpen(false);
  }

  async function sendNote() {
    const cleanTitle = title.trim();
    const cleanMessage = message.trim();

    if (!cleanTitle) {
      window.alert("Inserisci il titolo della nota.");
      return;
    }

    if (!cleanMessage) {
      window.alert("Scrivi il messaggio.");
      return;
    }

    setSending(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase.rpc(
      "send_magazziniere_note",
      {
        p_title: cleanTitle,
        p_message: cleanMessage,
      }
    );

    if (error) {
      setErrorMessage(
        "Invio non riuscito. Controlla la connessione e riprova."
      );
      setSending(false);
      return;
    }

    setSending(false);
    setComposerOpen(false);
    setViewMode("sent");
    setSuccessMessage("Nota inviata a Matteo.");

    await loadNotes(false);
  }

  async function updateStatus(
    note: SharedNote,
    nextStatus: NoteStatus
  ) {
    if (isWarehouseNote(note)) {
      return;
    }

    setUpdatingId(note.id);
    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase.rpc(
      "update_magazziniere_note_status",
      {
        p_note_id: note.id,
        p_status: nextStatus,
      }
    );

    if (error || data !== true) {
      setErrorMessage(
        "Non è stato possibile aggiornare la nota."
      );
      setUpdatingId("");
      return;
    }

    setNotes((current) =>
      current.map((row) =>
        row.id === note.id
          ? {
              ...row,
              status: nextStatus,
              read_at:
                nextStatus === "new"
                  ? null
                  : row.read_at ||
                    new Date().toISOString(),
              resolved_at:
                nextStatus === "resolved"
                  ? new Date().toISOString()
                  : null,
            }
          : row
      )
    );

    setUpdatingId("");
  }

  return (
    <main
      className="notes-page"
      data-theme={theme}
    >
      <div className="page-shell">
        <header className="topbar">
          <div className="brand-block">
            <div className="brand-name">MAGAZZINO</div>
            <div className="brand-subtitle">
              NOTE MAGAZZINIERE
            </div>
          </div>

          <div className="top-actions">
            <a
              className="back-button"
              href="/catalogo"
            >
              ← Catalogo
            </a>

            <div
              className="theme-switch"
              aria-label="Tema PWA"
            >
              <button
                type="button"
                className={
                  theme === "light"
                    ? "theme-button active"
                    : "theme-button"
                }
                onClick={() => changeTheme("light")}
              >
                ☀ Chiaro
              </button>

              <button
                type="button"
                className={
                  theme === "dark"
                    ? "theme-button active"
                    : "theme-button"
                }
                onClick={() => changeTheme("dark")}
              >
                ☾ Scuro
              </button>
            </div>
          </div>
        </header>

        <section className="hero">
          <div>
            <div className="eyebrow">
              Comunicazioni operative
            </div>

            <h1>Note</h1>

            <p>
              Messaggi diretti tra Matteo e il
              magazziniere.
            </p>
          </div>

          <button
            type="button"
            className="new-note-button"
            onClick={openComposer}
          >
            + Scrivi a Matteo
          </button>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">
              Da leggere
            </div>
            <div className="stat-value danger">
              {unreadCount}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">
              Ricevute
            </div>
            <div className="stat-value">
              {receivedNotes.length}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">
              Inviate
            </div>
            <div className="stat-value">
              {sentNotes.length}
            </div>
          </div>
        </section>

        <section className="toolbar">
          <div className="tabs">
            <button
              type="button"
              className={
                viewMode === "received"
                  ? "tab active"
                  : "tab"
              }
              onClick={() => setViewMode("received")}
            >
              Ricevute
              {unreadCount > 0 && (
                <span className="unread-pill">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              className={
                viewMode === "sent"
                  ? "tab active"
                  : "tab"
              }
              onClick={() => setViewMode("sent")}
            >
              Inviate
            </button>
          </div>

          <button
            type="button"
            className="refresh-button"
            disabled={refreshing}
            onClick={() => loadNotes(false)}
          >
            {refreshing
              ? "Aggiornamento..."
              : "↻ Aggiorna"}
          </button>
        </section>

        {errorMessage && (
          <div className="message-box error">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="message-box success">
            {successMessage}
          </div>
        )}

        {loading ? (
          <div className="empty-card">
            Caricamento note...
          </div>
        ) : visibleNotes.length === 0 ? (
          <div className="empty-card">
            <div className="empty-icon">📝</div>
            <div className="empty-title">
              Nessuna nota
            </div>
            <div className="empty-text">
              {viewMode === "received"
                ? "Non ci sono ancora note ricevute."
                : "Non hai ancora inviato note."}
            </div>
          </div>
        ) : (
          <section className="notes-list">
            {visibleNotes.map((note) => {
              const received =
                !isWarehouseNote(note);

              const busy =
                updatingId === note.id;

              return (
                <article
                  key={note.id}
                  className={
                    note.status === "new" &&
                    received
                      ? "note-card unread"
                      : "note-card"
                  }
                >
                  <div className="note-main">
                    <div className="note-meta-row">
                      <StatusBadge
                        status={note.status}
                      />

                      <span className="direction">
                        {received
                          ? "Da Matteo"
                          : "A Matteo"}
                      </span>

                      <span className="date">
                        {formatDateTime(
                          note.created_at
                        )}
                      </span>
                    </div>

                    <h2>{note.title}</h2>

                    <div className="note-message">
                      {note.message}
                    </div>
                  </div>

                  {received && (
                    <div className="note-actions">
                      {note.status === "new" && (
                        <button
                          type="button"
                          className="secondary-action"
                          disabled={busy}
                          onClick={() =>
                            updateStatus(
                              note,
                              "read"
                            )
                          }
                        >
                          {busy
                            ? "..."
                            : "Segna letta"}
                        </button>
                      )}

                      {note.status !==
                        "resolved" && (
                        <button
                          type="button"
                          className="resolve-action"
                          disabled={busy}
                          onClick={() =>
                            updateStatus(
                              note,
                              "resolved"
                            )
                          }
                        >
                          {busy
                            ? "..."
                            : "✓ Risolta"}
                        </button>
                      )}

                      {note.status ===
                        "resolved" && (
                        <button
                          type="button"
                          className="secondary-action"
                          disabled={busy}
                          onClick={() =>
                            updateStatus(
                              note,
                              "read"
                            )
                          }
                        >
                          {busy
                            ? "..."
                            : "Riapri"}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </div>

      {composerOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
            ) {
              closeComposer();
            }
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="modal-eyebrow">
                  NOTA AL GESTIONALE
                </div>
                <h2>Scrivi a Matteo</h2>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={closeComposer}
                disabled={sending}
                aria-label="Chiudi"
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <label htmlFor="note-title">
                Titolo
              </label>

              <input
                id="note-title"
                type="text"
                maxLength={200}
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                disabled={sending}
                placeholder="Es. Materiale da controllare"
                autoFocus
              />

              <label htmlFor="note-message">
                Messaggio
              </label>

              <textarea
                id="note-message"
                rows={7}
                maxLength={5000}
                value={message}
                onChange={(event) =>
                  setMessage(
                    event.target.value
                  )
                }
                disabled={sending}
                placeholder="Scrivi qui la comunicazione..."
              />

              <div className="counter">
                {message.length}/5000
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="cancel-button"
                onClick={closeComposer}
                disabled={sending}
              >
                Annulla
              </button>

              <button
                type="button"
                className="send-button"
                onClick={sendNote}
                disabled={sending}
              >
                {sending
                  ? "Invio..."
                  : "Invia nota"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .notes-page {
          --page-bg: #07111f;
          --card-bg: #0d1928;
          --card-bg-soft: #101e2f;
          --text: #f8fafc;
          --muted: #94a3b8;
          --border: rgba(148, 163, 184, 0.16);
          --border-strong: rgba(96, 165, 250, 0.26);
          --accent: #3b82f6;
          --accent-soft: rgba(59, 130, 246, 0.12);
          --input-bg: rgba(255, 255, 255, 0.035);
          --shadow: 0 18px 50px rgba(0, 0, 0, 0.22);

          min-height: 100vh;
          background: var(--page-bg);
          color: var(--text);
          transition:
            background 0.2s ease,
            color 0.2s ease;
        }

        .notes-page[data-theme="light"] {
          --page-bg: #f4f7fb;
          --card-bg: #ffffff;
          --card-bg-soft: #f8fafc;
          --text: #0f172a;
          --muted: #64748b;
          --border: rgba(15, 23, 42, 0.10);
          --border-strong: rgba(37, 99, 235, 0.20);
          --accent: #2563eb;
          --accent-soft: rgba(37, 99, 235, 0.08);
          --input-bg: #f8fafc;
          --shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
        }

        * {
          box-sizing: border-box;
        }

        .page-shell {
          width: min(1180px, calc(100% - 32px));
          margin: 0 auto;
          padding: 18px 0 52px;
        }

        .topbar {
          min-height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 12px 15px;
          border: 1px solid var(--border);
          border-radius: 16px;
          background: var(--card-bg);
          box-shadow: var(--shadow);
        }

        .brand-name {
          font-size: 15px;
          font-weight: 950;
          letter-spacing: 0.7px;
        }

        .brand-subtitle {
          margin-top: 2px;
          color: var(--muted);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1.25px;
        }

        .top-actions {
          display: flex;
          align-items: center;
          gap: 9px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .back-button,
        .theme-button,
        .refresh-button,
        .tab,
        .secondary-action,
        .resolve-action,
        .cancel-button,
        .send-button,
        .new-note-button,
        .close-button {
          font: inherit;
        }

        .back-button {
          display: inline-flex;
          align-items: center;
          min-height: 38px;
          padding: 8px 12px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--card-bg-soft);
          color: var(--text);
          text-decoration: none;
          font-size: 12px;
          font-weight: 850;
        }

        .theme-switch {
          display: flex;
          gap: 4px;
          padding: 4px;
          border: 1px solid var(--border);
          border-radius: 11px;
          background: var(--card-bg-soft);
        }

        .theme-button {
          min-height: 30px;
          padding: 6px 9px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
          font-size: 11px;
          font-weight: 850;
        }

        .theme-button.active {
          background: var(--accent);
          color: #ffffff;
        }

        .hero {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          padding: 42px 4px 24px;
        }

        .eyebrow {
          color: var(--accent);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 1.3px;
          text-transform: uppercase;
        }

        .hero h1 {
          margin: 6px 0 0;
          font-size: clamp(34px, 5vw, 50px);
          line-height: 1;
          letter-spacing: -1.5px;
        }

        .hero p {
          margin: 10px 0 0;
          color: var(--muted);
          font-size: 14px;
          line-height: 1.5;
        }

        .new-note-button {
          min-height: 44px;
          padding: 11px 16px;
          border: 1px solid var(--accent);
          border-radius: 11px;
          background: var(--accent);
          color: #ffffff;
          cursor: pointer;
          font-size: 13px;
          font-weight: 900;
          box-shadow: 0 10px 28px rgba(37, 99, 235, 0.22);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }

        .stat-card {
          padding: 17px 18px;
          border: 1px solid var(--border);
          border-radius: 13px;
          background: var(--card-bg);
        }

        .stat-label {
          color: var(--muted);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }

        .stat-value {
          margin-top: 6px;
          font-size: 30px;
          font-weight: 950;
        }

        .stat-value.danger {
          color: #ef4444;
        }

        .toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 16px;
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: 13px;
          background: var(--card-bg);
        }

        .tabs {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
        }

        .tab,
        .refresh-button {
          min-height: 38px;
          padding: 8px 12px;
          border: 1px solid var(--border);
          border-radius: 9px;
          background: var(--card-bg-soft);
          color: var(--text);
          cursor: pointer;
          font-size: 12px;
          font-weight: 850;
        }

        .tab {
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }

        .tab.active {
          border-color: var(--border-strong);
          background: var(--accent-soft);
          color: var(--accent);
        }

        .unread-pill {
          min-width: 20px;
          height: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 6px;
          border-radius: 999px;
          background: #ef4444;
          color: white;
          font-size: 10px;
          font-weight: 950;
        }

        .refresh-button:disabled,
        .secondary-action:disabled,
        .resolve-action:disabled,
        .cancel-button:disabled,
        .send-button:disabled,
        .new-note-button:disabled,
        .close-button:disabled {
          cursor: default;
          opacity: 0.55;
        }

        .message-box {
          margin-bottom: 16px;
          padding: 12px 14px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 800;
        }

        .message-box.error {
          border: 1px solid rgba(239, 68, 68, 0.35);
          background: rgba(239, 68, 68, 0.08);
          color: #ef4444;
        }

        .message-box.success {
          border: 1px solid rgba(34, 197, 94, 0.34);
          background: rgba(34, 197, 94, 0.08);
          color: #22c55e;
        }

        .notes-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .note-card {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          padding: 18px;
          border: 1px solid var(--border);
          border-radius: 14px;
          background: var(--card-bg);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.03);
        }

        .note-card.unread {
          border-color: rgba(59, 130, 246, 0.40);
          background: linear-gradient(
              0deg,
              var(--accent-soft),
              var(--accent-soft)
            ),
            var(--card-bg);
        }

        .note-main {
          flex: 1 1 auto;
          min-width: 0;
        }

        .note-meta-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .direction,
        .date {
          color: var(--muted);
          font-size: 11px;
          font-weight: 750;
        }

        .note-card h2 {
          margin: 12px 0 0;
          font-size: 19px;
          line-height: 1.3;
          word-break: break-word;
        }

        .note-message {
          margin-top: 12px;
          padding: 13px 14px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--input-bg);
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 14px;
          line-height: 1.55;
        }

        .note-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .secondary-action,
        .resolve-action {
          min-height: 38px;
          padding: 8px 11px;
          border-radius: 9px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 900;
        }

        .secondary-action {
          border: 1px solid var(--border);
          background: var(--card-bg-soft);
          color: var(--text);
        }

        .resolve-action {
          border: 1px solid rgba(34, 197, 94, 0.34);
          background: rgba(34, 197, 94, 0.10);
          color: #22c55e;
        }

        .empty-card {
          padding: 52px 24px;
          border: 1px solid var(--border);
          border-radius: 14px;
          background: var(--card-bg);
          color: var(--muted);
          text-align: center;
        }

        .empty-icon {
          margin-bottom: 8px;
          font-size: 34px;
        }

        .empty-title {
          color: var(--text);
          font-size: 19px;
          font-weight: 900;
        }

        .empty-text {
          margin-top: 6px;
          font-size: 13px;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(0, 0, 0, 0.68);
          backdrop-filter: blur(5px);
        }

        .modal {
          width: min(560px, 100%);
          max-height: calc(100vh - 40px);
          overflow-y: auto;
          border: 1px solid var(--border-strong);
          border-radius: 16px;
          background: var(--card-bg);
          color: var(--text);
          box-shadow: 0 28px 90px rgba(0, 0, 0, 0.42);
        }

        .modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 15px;
          padding: 20px 21px;
          border-bottom: 1px solid var(--border);
        }

        .modal-eyebrow {
          color: var(--accent);
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 1.4px;
        }

        .modal-header h2 {
          margin: 5px 0 0;
          font-size: 23px;
        }

        .close-button {
          width: 34px;
          height: 34px;
          border: 1px solid var(--border);
          border-radius: 9px;
          background: var(--card-bg-soft);
          color: var(--text);
          cursor: pointer;
          font-size: 20px;
        }

        .modal-body {
          padding: 20px 21px;
        }

        .modal-body label {
          display: block;
          margin: 14px 0 7px;
          color: var(--muted);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.6px;
          text-transform: uppercase;
        }

        .modal-body label:first-child {
          margin-top: 0;
        }

        .modal-body input,
        .modal-body textarea {
          width: 100%;
          padding: 12px 13px;
          border: 1px solid var(--border-strong);
          border-radius: 9px;
          outline: none;
          background: var(--input-bg);
          color: var(--text);
          font: inherit;
        }

        .modal-body textarea {
          resize: vertical;
        }

        .modal-body input:focus,
        .modal-body textarea:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }

        .counter {
          margin-top: 6px;
          color: var(--muted);
          text-align: right;
          font-size: 10px;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 9px;
          padding: 15px 21px 20px;
          border-top: 1px solid var(--border);
        }

        .cancel-button,
        .send-button {
          min-height: 40px;
          padding: 9px 14px;
          border-radius: 9px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 900;
        }

        .cancel-button {
          border: 1px solid var(--border);
          background: var(--card-bg-soft);
          color: var(--text);
        }

        .send-button {
          border: 1px solid var(--accent);
          background: var(--accent);
          color: white;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          min-height: 24px;
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 0.45px;
        }

        .status-badge.new {
          border: 1px solid rgba(239, 68, 68, 0.30);
          background: rgba(239, 68, 68, 0.10);
          color: #ef4444;
        }

        .status-badge.read {
          border: 1px solid rgba(59, 130, 246, 0.30);
          background: rgba(59, 130, 246, 0.10);
          color: #3b82f6;
        }

        .status-badge.resolved {
          border: 1px solid rgba(34, 197, 94, 0.30);
          background: rgba(34, 197, 94, 0.10);
          color: #22c55e;
        }

        @media (max-width: 760px) {
          .page-shell {
            width: min(100% - 20px, 1180px);
            padding-top: 10px;
          }

          .topbar,
          .hero,
          .toolbar,
          .note-card {
            align-items: stretch;
          }

          .topbar,
          .hero,
          .toolbar,
          .note-card {
            flex-direction: column;
          }

          .top-actions {
            justify-content: flex-start;
          }

          .hero {
            padding-top: 30px;
          }

          .new-note-button {
            width: 100%;
          }

          .stats-grid {
            grid-template-columns: repeat(3, 1fr);
          }

          .stat-card {
            padding: 14px 10px;
            text-align: center;
          }

          .stat-label {
            font-size: 8px;
          }

          .stat-value {
            font-size: 25px;
          }

          .tabs {
            width: 100%;
          }

          .tab {
            flex: 1;
            justify-content: center;
          }

          .refresh-button {
            width: 100%;
          }

          .note-actions {
            justify-content: stretch;
          }

          .note-actions button {
            flex: 1;
          }
        }

        @media (max-width: 430px) {
          .top-actions {
            width: 100%;
          }

          .back-button {
            width: 100%;
            justify-content: center;
          }

          .theme-switch {
            width: 100%;
          }

          .theme-button {
            flex: 1;
          }

          .stats-grid {
            gap: 7px;
          }

          .stat-card {
            border-radius: 11px;
          }

          .modal-backdrop {
            padding: 10px;
          }
        }
      `}</style>
    </main>
  );
}

function StatusBadge({
  status,
}: {
  status: NoteStatus;
}) {
  if (status === "resolved") {
    return (
      <span className="status-badge resolved">
        RISOLTA
      </span>
    );
  }

  if (status === "read") {
    return (
      <span className="status-badge read">
        LETTA
      </span>
    );
  }

  return (
    <span className="status-badge new">
      DA LEGGERE
    </span>
  );
}

function isWarehouseNote(note: SharedNote) {
  return (
    note.sender_name
      .trim()
      .toLowerCase() === "magazziniere"
  );
}

function normalizeStatus(
  value: unknown
): NoteStatus {
  if (value === "read") {
    return "read";
  }

  if (value === "resolved") {
    return "resolved";
  }

  return "new";
}

function formatDateTime(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
