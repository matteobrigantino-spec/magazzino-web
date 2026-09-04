"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../lib/supabaseClient";

type Reminder = {
  id: string;
  title: string;
  reminder_date: string;
  note: string | null;
  is_done: boolean;
  completed_at: string | null;
  created_at: string;
};

type FilterType =
  | "open"
  | "completed"
  | "all";

export default function PromemoriaPage() {
  const [reminders, setReminders] =
    useState<Reminder[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [message, setMessage] =
    useState("");

  const [filter, setFilter] =
    useState<FilterType>(
      "open"
    );

  const [search, setSearch] =
    useState("");

  const [
    modalOpen,
    setModalOpen,
  ] = useState(false);

  const [
    editingReminder,
    setEditingReminder,
  ] =
    useState<Reminder | null>(
      null
    );

  const [title, setTitle] =
    useState("");

  const [date, setDate] =
    useState("");

  const [note, setNote] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  useEffect(() => {
    loadReminders();
  }, []);

  async function loadReminders() {
    setLoading(true);
    setMessage("");

    const {
      data,
      error,
    } = await supabase
      .from("reminders")
      .select(
        "id,title,reminder_date,note,is_done,completed_at,created_at"
      )
      .order(
        "reminder_date",
        {
          ascending: true,
        }
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {
      console.error(error);

      setMessage(
        "Errore durante il caricamento dei promemoria."
      );

      setLoading(false);
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
    setLoading(false);
  }

  const openCount =
    useMemo(() => {
      return reminders.filter(
        (item) =>
          !item.is_done
      ).length;
    }, [reminders]);

  const completedCount =
    useMemo(() => {
      return reminders.filter(
        (item) =>
          item.is_done
      ).length;
    }, [reminders]);

  const overdueCount =
    useMemo(() => {
      const today =
        currentLocalDate();

      return reminders.filter(
        (item) =>
          !item.is_done &&
          item.reminder_date <
            today
      ).length;
    }, [reminders]);

  const visibleReminders =
    useMemo(() => {
      const text =
        search
          .trim()
          .toLowerCase();

      let list =
        [...reminders];

      if (
        filter ===
        "open"
      ) {
        list =
          list.filter(
            (item) =>
              !item.is_done
          );
      }

      if (
        filter ===
        "completed"
      ) {
        list =
          list.filter(
            (item) =>
              item.is_done
          );
      }

      if (text) {
        list =
          list.filter(
            (item) =>
              item.title
                .toLowerCase()
                .includes(
                  text
                ) ||
              (
                item.note ||
                ""
              )
                .toLowerCase()
                .includes(
                  text
                )
          );
      }

      if (
        filter ===
        "completed"
      ) {
        list.sort(
          (a, b) =>
            timestamp(
              b.completed_at
            ) -
            timestamp(
              a.completed_at
            )
        );
      } else {
        list.sort(
          (a, b) =>
            a.reminder_date.localeCompare(
              b.reminder_date
            )
        );
      }

      return list;
    }, [
      reminders,
      filter,
      search,
    ]);

  function openNewReminder() {
    setEditingReminder(
      null
    );

    setTitle("");
    setDate(
      currentLocalDate()
    );
    setNote("");

    setModalOpen(true);
  }

  function openEditReminder(
    reminder: Reminder
  ) {
    setEditingReminder(
      reminder
    );

    setTitle(
      reminder.title
    );

    setDate(
      reminder.reminder_date
    );

    setNote(
      reminder.note ||
        ""
    );

    setModalOpen(true);
  }

  function closeModal() {
    if (saving) {
      return;
    }

    setModalOpen(false);
    setEditingReminder(
      null
    );
  }

  async function saveReminder() {
    const cleanTitle =
      title.trim();

    if (!cleanTitle) {
      window.alert(
        "Inserisci il titolo del promemoria."
      );

      return;
    }

    if (!date) {
      window.alert(
        "Seleziona una data."
      );

      return;
    }

    setSaving(true);

    if (
      editingReminder
    ) {
      const {
        error,
      } = await supabase
        .from("reminders")
        .update({
          title:
            cleanTitle,

          reminder_date:
            date,

          note:
            note.trim() ||
            null,
        })
        .eq(
          "id",
          editingReminder.id
        );

      if (error) {
        window.alert(
          "Errore modifica promemoria: " +
            error.message
        );

        setSaving(false);
        return;
      }

      setMessage(
        "✓ Promemoria modificato."
      );
    } else {
      const {
        error,
      } = await supabase
        .from("reminders")
        .insert({
          title:
            cleanTitle,

          reminder_date:
            date,

          note:
            note.trim() ||
            null,

          is_done:
            false,
        });

      if (error) {
        window.alert(
          "Errore creazione promemoria: " +
            error.message
        );

        setSaving(false);
        return;
      }

      setMessage(
        "✓ Nuovo promemoria creato."
      );
    }

    setSaving(false);
    setModalOpen(false);
    setEditingReminder(
      null
    );

    await loadReminders();
  }

  async function completeReminder(
    reminder: Reminder
  ) {
    const {
      error,
    } = await supabase
      .from("reminders")
      .update({
        is_done:
          true,

        completed_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        reminder.id
      );

    if (error) {
      window.alert(
        "Errore aggiornamento promemoria: " +
          error.message
      );

      return;
    }

    await loadReminders();
  }

  async function reopenReminder(
    reminder: Reminder
  ) {
    const {
      error,
    } = await supabase
      .from("reminders")
      .update({
        is_done:
          false,

        completed_at:
          null,
      })
      .eq(
        "id",
        reminder.id
      );

    if (error) {
      window.alert(
        "Errore riapertura promemoria: " +
          error.message
      );

      return;
    }

    await loadReminders();
  }

  async function deleteReminder(
    reminder: Reminder
  ) {
    const confirmed =
      window.confirm(
        `Vuoi eliminare definitivamente questo promemoria?\n\n${reminder.title}`
      );

    if (!confirmed) {
      return;
    }

    const {
      error,
    } = await supabase
      .from("reminders")
      .delete()
      .eq(
        "id",
        reminder.id
      );

    if (error) {
      window.alert(
        "Errore eliminazione promemoria: " +
          error.message
      );

      return;
    }

    setMessage(
      "✓ Promemoria eliminato."
    );

    await loadReminders();
  }

  return (
    <div className="reminders-page">
      {/* TESTATA */}

      <div className="reminders-header">
        <div>
          <div className="reminders-eyebrow">
            ORGANIZZAZIONE
          </div>

          <h1>
            Promemoria
          </h1>

          <p>
            Scadenze, attività e cose da ricordare.
          </p>
        </div>

        <button
          type="button"
          className="new-reminder-button"
          onClick={
            openNewReminder
          }
        >
          + Nuovo promemoria
        </button>
      </div>

      {/* CARTE */}

      <div className="reminders-summary">
        <SummaryCard
          label="Aperti"
          value={
            openCount
          }
          tone="blue"
        />

        <SummaryCard
          label="Scaduti"
          value={
            overdueCount
          }
          tone="red"
        />

        <SummaryCard
          label="Completati"
          value={
            completedCount
          }
          tone="green"
        />
      </div>

      {/* FILTRI */}

      <div className="reminders-toolbar">
        <div className="reminders-tabs">
          <FilterButton
            active={
              filter ===
              "open"
            }
            onClick={() =>
              setFilter(
                "open"
              )
            }
          >
            Aperti
            <span>
              {openCount}
            </span>
          </FilterButton>

          <FilterButton
            active={
              filter ===
              "completed"
            }
            onClick={() =>
              setFilter(
                "completed"
              )
            }
          >
            Completati
            <span>
              {
                completedCount
              }
            </span>
          </FilterButton>

          <FilterButton
            active={
              filter ===
              "all"
            }
            onClick={() =>
              setFilter(
                "all"
              )
            }
          >
            Tutti
          </FilterButton>
        </div>

        <input
          className="reminders-search"
          value={
            search
          }
          onChange={(event) =>
            setSearch(
              event.target.value
            )
          }
          placeholder="Cerca promemoria..."
        />
      </div>

      {message && (
        <div className="reminders-message">
          {message}
        </div>
      )}

      {/* ELENCO */}

      <div className="reminders-panel">
        <div className="reminders-panel-header">
          <strong>
            {filter ===
            "open"
              ? "Da fare"
              : filter ===
                  "completed"
                ? "Completati"
                : "Tutti i promemoria"}
          </strong>

          <span>
            {
              visibleReminders.length
            }{" "}
            elementi
          </span>
        </div>

        {loading ? (
          <div className="reminders-empty">
            Caricamento...
          </div>
        ) : visibleReminders.length ===
          0 ? (
          <div className="reminders-empty">
            Nessun promemoria.
          </div>
        ) : (
          <div className="reminders-list">
            {visibleReminders.map(
              (
                reminder
              ) => {
                const state =
                  reminder.is_done
                    ? {
                        label:
                          "Completato",

                        color:
                          "#22c55e",
                      }
                    : reminderState(
                        reminder.reminder_date
                      );

                return (
                  <div
                    key={
                      reminder.id
                    }
                    className={`reminder-row ${
                      reminder.is_done
                        ? "reminder-completed"
                        : ""
                    }`}
                  >
                    {/* DATA */}

                    <div
                      className="reminder-date-card"
                      style={{
                        color:
                          state.color,

                        borderColor:
                          `${state.color}55`,

                        background:
                          `${state.color}10`,
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

                      <small>
                        {formatReminderYear(
                          reminder.reminder_date
                        )}
                      </small>
                    </div>

                    {/* TESTO */}

                    <div className="reminder-main">
                      <div className="reminder-title-line">
                        <strong>
                          {
                            reminder.title
                          }
                        </strong>

                        <span
                          className="reminder-status"
                          style={{
                            color:
                              state.color,

                            background:
                              `${state.color}12`,

                            borderColor:
                              `${state.color}40`,
                          }}
                        >
                          {
                            state.label
                          }
                        </span>
                      </div>

                      {reminder.note && (
                        <p>
                          {
                            reminder.note
                          }
                        </p>
                      )}

                      {reminder.is_done &&
                        reminder.completed_at && (
                          <small>
                            Completato il{" "}
                            {formatDateTime(
                              reminder.completed_at
                            )}
                          </small>
                        )}
                    </div>

                    {/* AZIONI */}

                    <div className="reminder-actions">
                      {!reminder.is_done ? (
                        <button
                          type="button"
                          className="done-button"
                          onClick={() =>
                            completeReminder(
                              reminder
                            )
                          }
                        >
                          ✓ Fatto
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="reopen-button"
                          onClick={() =>
                            reopenReminder(
                              reminder
                            )
                          }
                        >
                          ↶ Riapri
                        </button>
                      )}

                      <button
                        type="button"
                        className="edit-button"
                        onClick={() =>
                          openEditReminder(
                            reminder
                          )
                        }
                      >
                        Modifica
                      </button>

                      <button
                        type="button"
                        className="delete-button"
                        onClick={() =>
                          deleteReminder(
                            reminder
                          )
                        }
                      >
                        Elimina
                      </button>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )}
      </div>

      {/* MODALE */}

      {modalOpen && (
        <div
          className="reminder-modal-backdrop"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeModal();
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
                  {editingReminder
                    ? "Modifica promemoria"
                    : "Nuovo promemoria"}
                </h2>
              </div>

              <button
                type="button"
                className="reminder-close"
                onClick={
                  closeModal
                }
                disabled={
                  saving
                }
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
                value={
                  title
                }
                onChange={(event) =>
                  setTitle(
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
                  date
                }
                onChange={(event) =>
                  setDate(
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
                rows={4}
                value={
                  note
                }
                onChange={(event) =>
                  setNote(
                    event.target.value
                  )
                }
                placeholder="Aggiungi una nota..."
              />
            </div>

            <div className="reminder-modal-actions">
              <button
                type="button"
                className="cancel-button"
                onClick={
                  closeModal
                }
                disabled={
                  saving
                }
              >
                Annulla
              </button>

              <button
                type="button"
                className="save-button"
                onClick={
                  saveReminder
                }
                disabled={
                  saving
                }
              >
                {saving
                  ? "Salvataggio..."
                  : editingReminder
                    ? "Salva modifiche"
                    : "Crea promemoria"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .reminders-page {
          width: 100%;
          max-width: 1500px;
          margin: 0 auto;
        }

        .reminders-header {
          margin-bottom: 22px;
          padding: 28px 30px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border: 1px solid rgba(75,110,160,0.34);
          border-radius: 18px;
          background:
            linear-gradient(
              125deg,
              #0c1728 0%,
              #0b1627 55%,
              #08111d 100%
            );
        }

        .reminders-eyebrow {
          color: #60a5fa;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1.7px;
        }

        .reminders-header h1 {
          margin: 7px 0 0;
          color: white;
          font-size: 34px;
          font-weight: 950;
        }

        .reminders-header p {
          margin: 7px 0 0;
          color: rgba(255,255,255,0.58);
          font-size: 12px;
        }

        .new-reminder-button {
          padding: 11px 15px;
          border: 1px solid #3b82f6;
          border-radius: 9px;
          background: #3b82f6;
          color: white;
          cursor: pointer;
          font-size: 11px;
          font-weight: 900;
        }

        .reminders-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0,1fr));
          gap: 13px;
          margin-bottom: 18px;
        }

        .reminder-summary-card {
          padding: 16px;
          border: 1px solid var(--border-color);
          border-radius: 12px;
          background:
            linear-gradient(
              145deg,
              var(--card),
              var(--input-bg)
            );
        }

        .reminder-summary-card span {
          display: block;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 0.7px;
          text-transform: uppercase;
          opacity: 0.52;
        }

        .reminder-summary-card strong {
          display: block;
          margin-top: 6px;
          font-size: 25px;
          font-weight: 950;
        }

        .summary-blue strong {
          color: #60a5fa;
        }

        .summary-red strong {
          color: #ef4444;
        }

        .summary-green strong {
          color: #22c55e;
        }

        .reminders-toolbar {
          margin-bottom: 16px;
          padding: 11px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          border: 1px solid var(--border-color);
          border-radius: 12px;
          background: var(--card);
        }

        .reminders-tabs {
          display: flex;
          gap: 7px;
        }

        .reminder-filter {
          padding: 8px 10px;
          display: flex;
          align-items: center;
          gap: 7px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: transparent;
          color: var(--foreground);
          cursor: pointer;
          font-size: 10px;
          font-weight: 850;
        }

        .reminder-filter.active {
          border-color: rgba(59,130,246,0.45);
          background: rgba(59,130,246,0.10);
          color: #60a5fa;
        }

        .reminder-filter span {
          min-width: 20px;
          padding: 2px 5px;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          text-align: center;
          font-size: 8px;
        }

        .reminders-search {
          width: min(320px, 100%);
          padding: 9px 11px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          outline: none;
          background: var(--input-bg);
          color: var(--foreground);
          font: inherit;
          font-size: 11px;
        }

        .reminders-message {
          margin-bottom: 16px;
          padding: 11px 13px;
          border: 1px solid rgba(34,197,94,0.25);
          border-radius: 9px;
          background: rgba(34,197,94,0.07);
          font-size: 11px;
          font-weight: 750;
        }

        .reminders-panel {
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

        .reminders-panel-header {
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border-color);
        }

        .reminders-panel-header strong {
          font-size: 15px;
          font-weight: 900;
        }

        .reminders-panel-header span {
          font-size: 9px;
          opacity: 0.45;
        }

        .reminder-row {
          padding: 13px 15px;
          display: flex;
          align-items: center;
          gap: 14px;
          border-bottom: 1px solid var(--border-color);
        }

        .reminder-completed {
          opacity: 0.68;
        }

        .reminder-date-card {
          width: 52px;
          min-width: 52px;
          height: 58px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px solid;
          border-radius: 10px;
        }

        .reminder-date-card strong {
          font-size: 18px;
          line-height: 1;
        }

        .reminder-date-card span {
          margin-top: 3px;
          font-size: 8px;
          font-weight: 900;
        }

        .reminder-date-card small {
          margin-top: 2px;
          font-size: 7px;
          opacity: 0.65;
        }

        .reminder-main {
          flex: 1;
          min-width: 0;
        }

        .reminder-title-line {
          display: flex;
          align-items: center;
          gap: 9px;
          flex-wrap: wrap;
        }

        .reminder-title-line strong {
          font-size: 12px;
          font-weight: 900;
        }

        .reminder-status {
          padding: 4px 7px;
          border: 1px solid;
          border-radius: 999px;
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .reminder-main p {
          margin: 5px 0 0;
          font-size: 10px;
          opacity: 0.48;
        }

        .reminder-main small {
          display: block;
          margin-top: 5px;
          font-size: 8px;
          opacity: 0.38;
        }

        .reminder-actions {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .done-button,
        .reopen-button,
        .edit-button,
        .delete-button {
          padding: 7px 9px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 9px;
          font-weight: 900;
        }

        .done-button {
          border: 1px solid rgba(34,197,94,0.25);
          background: rgba(34,197,94,0.07);
          color: #22c55e;
        }

        .reopen-button {
          border: 1px solid rgba(59,130,246,0.28);
          background: rgba(59,130,246,0.07);
          color: #60a5fa;
        }

        .edit-button {
          border: 1px solid var(--border-color);
          background: var(--input-bg);
          color: var(--foreground);
        }

        .delete-button {
          border: 1px solid rgba(239,68,68,0.24);
          background: rgba(239,68,68,0.06);
          color: #ef4444;
        }

        .reminders-empty {
          padding: 45px;
          text-align: center;
          font-size: 11px;
          opacity: 0.45;
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

        .cancel-button,
        .save-button {
          padding: 10px 14px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 900;
        }

        .cancel-button {
          border: 1px solid rgba(255,255,255,0.13);
          background: transparent;
          color: white;
        }

        .save-button {
          border: 1px solid #3b82f6;
          background: #3b82f6;
          color: white;
        }

        @media (max-width: 800px) {
          .reminders-header,
          .reminders-toolbar {
            flex-direction: column;
            align-items: stretch;
          }

          .reminders-summary {
            grid-template-columns: 1fr;
          }

          .reminders-search {
            width: 100%;
          }

          .reminder-row {
            align-items: flex-start;
            flex-wrap: wrap;
          }

          .reminder-actions {
            width: 100%;
            justify-content: flex-start;
            padding-left: 66px;
          }
        }
      `}</style>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone:
    | "blue"
    | "red"
    | "green";
}) {
  return (
    <div
      className={`reminder-summary-card summary-${tone}`}
    >
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children:
    React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`reminder-filter ${
        active
          ? "active"
          : ""
      }`}
      onClick={
        onClick
      }
    >
      {children}
    </button>
  );
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
      label:
        "Scaduto",

      color:
        "#ef4444",
    };
  }

  if (
    dateValue ===
    today
  ) {
    return {
      label:
        "Oggi",

      color:
        "#f59e0b",
    };
  }

  return {
    label:
      "Prossimo",

    color:
      "#3b82f6",
  };
}

function formatReminderDay(
  value: string
) {
  return (
    value.split(
      "-"
    )[2] ||
    "--"
  );
}

function formatReminderMonth(
  value: string
) {
  const month =
    Number(
      value.split(
        "-"
      )[1]
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

  return (
    months[
      month - 1
    ] ||
    ""
  );
}

function formatReminderYear(
  value: string
) {
  return (
    value.split(
      "-"
    )[0] ||
    ""
  );
}

function formatDateTime(
  value: string
) {
  const date =
    new Date(
      value
    );

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
      hour:
        "2-digit",
      minute:
        "2-digit",
    }
  ).format(date);
}

function timestamp(
  value:
    string |
    null
) {
  if (!value) {
    return 0;
  }

  const date =
    new Date(
      value
    );

  return Number.isNaN(
    date.getTime()
  )
    ? 0
    : date.getTime();
}