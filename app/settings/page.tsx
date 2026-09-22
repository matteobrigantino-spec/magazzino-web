"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import {
  getExistingPushSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "../../lib/pushClient";

type PushStatus =
  | "checking"
  | "non_supportate"
  | "da_attivare"
  | "attive"
  | "in_corso"
  | "errore";

export default function SettingsPage() {
  const router = useRouter();

  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [pushStatus, setPushStatus] =
    useState<PushStatus>("checking");

  const [pushMsg, setPushMsg] =
    useState("");

  useEffect(() => {
    if (!isPushSupported()) {
      setPushStatus("non_supportate");
      return;
    }

    getExistingPushSubscription()
      .then((existing) => {
        setPushStatus(
          existing
            ? "attive"
            : "da_attivare"
        );
      })
      .catch(() => {
        setPushStatus("da_attivare");
      });
  }, []);

  async function activatePush() {
    setPushMsg("");
    setPushStatus("in_corso");

    const userId = localStorage.getItem(
      "magazzino_user_id"
    );

    if (!userId) {
      setPushMsg(
        "Utente non trovato."
      );
      setPushStatus("da_attivare");
      return;
    }

    try {
      const subscription =
        await subscribeToPush();

      const { error } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: userId,
            endpoint:
              subscription.endpoint,
            p256dh:
              subscription.p256dh,
            auth: subscription.auth,
          },
          { onConflict: "endpoint" }
        );

      if (error) {
        throw new Error(
          error.message
        );
      }

      setPushStatus("attive");

      setPushMsg(
        "Notifiche attivate su questo dispositivo."
      );
    } catch (error) {
      setPushStatus("errore");

      setPushMsg(
        error instanceof Error
          ? error.message
          : "Errore attivazione notifiche."
      );
    }
  }

  async function deactivatePush() {
    setPushMsg("");
    setPushStatus("in_corso");

    try {
      const existing =
        await getExistingPushSubscription();

      await unsubscribeFromPush();

      if (existing) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq(
            "endpoint",
            existing.endpoint
          );
      }

      setPushStatus("da_attivare");

      setPushMsg(
        "Notifiche disattivate su questo dispositivo."
      );
    } catch (error) {
      setPushStatus("errore");

      setPushMsg(
        error instanceof Error
          ? error.message
          : "Errore disattivazione notifiche."
      );
    }
  }

  async function changePassword() {
    setMsg("");
    setSaving(true);

    let userId =
      localStorage.getItem("magazzino_user_id");

    const username =
      localStorage.getItem("magazzino_user");

    if (!userId && !username) {
      setMsg("Utente non trovato");
      setSaving(false);
      return;
    }

    if (!userId && username) {
      const {
        data: foundUser,
        error: findError,
      } = await supabase
        .from("users")
        .select("id, session_version")
        .eq("username", username)
        .maybeSingle();

      if (findError || !foundUser) {
        setMsg("Errore lettura utente");
        setSaving(false);
        return;
      }

      userId = foundUser.id;

      localStorage.setItem(
        "magazzino_user_id",
        foundUser.id
      );

      localStorage.setItem(
        "magazzino_session_version",
        String(
          foundUser.session_version || 1
        )
      );
    }

    const cleanPassword =
      newPassword.trim();

    if (!cleanPassword) {
      setMsg("Inserisci una nuova password");
      setSaving(false);
      return;
    }

    if (cleanPassword.length < 4) {
      setMsg(
        "La password deve contenere almeno 4 caratteri."
      );
      setSaving(false);
      return;
    }

    if (!userId) {
      setMsg("Utente non trovato");
      setSaving(false);
      return;
    }

    const {
      data,
      error,
    } = await supabase.rpc(
      "change_magazzino_password",
      {
        p_user_id: userId,
        p_password: cleanPassword,
      }
    );

    if (error) {
      setMsg(
        "Errore aggiornamento password: " +
          error.message
      );

      setSaving(false);
      return;
    }

    const newVersion =
      Number(data);

    if (!Number.isFinite(newVersion)) {
      setMsg(
        "Password aggiornata, ma non è stato possibile aggiornare la sessione locale."
      );
      setSaving(false);
      return;
    }

    localStorage.setItem(
      "magazzino_session_version",
      String(newVersion)
    );

    setMsg(
      "Password aggiornata. Tutti gli altri PC sono stati scollegati."
    );

    setNewPassword("");
    setSaving(false);
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1000,
        margin: "0 auto",
      }}
    >
      {/* TESTATA */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 20,
          flexWrap: "wrap",
          marginBottom: 26,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              opacity: 0.55,
              textTransform: "uppercase",
              letterSpacing: 1.2,
              fontWeight: 800,
              marginBottom: 5,
            }}
          >
            Configurazione
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 34,
              fontWeight: 900,
            }}
          >
            Impostazioni
          </h1>

          <div
            style={{
              marginTop: 7,
              fontSize: 14,
              opacity: 0.6,
            }}
          >
            Gestione delle impostazioni del tuo account.
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            router.push("/")
          }
          style={secondaryButtonStyle}
        >
          ← Torna alla Dashboard
        </button>
      </div>

      {/* CAMBIO PASSWORD */}

      <div
        style={{
          border:
            "1px solid var(--border-color)",

          borderRadius: 14,

          overflow: "hidden",

          background:
            "var(--card)",
        }}
      >
        <div
          style={{
            padding: "17px 19px",

            borderBottom:
              "1px solid var(--border-color)",

            background:
              "var(--table-head)",
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 850,
            }}
          >
            Cambio password
          </div>

          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              opacity: 0.55,
            }}
          >
            Modifica la password dell&apos;utente attualmente collegato.
          </div>
        </div>

        <div
          style={{
            padding: 20,
          }}
        >
          <label
            style={{
              display: "block",
              marginBottom: 7,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Nuova password
          </label>

          <input
            type="password"

            value={newPassword}

            onChange={(e) =>
              setNewPassword(
                e.target.value
              )
            }

            placeholder="Inserisci nuova password"

            disabled={saving}

            style={{
              width: "100%",
              maxWidth: 450,
              boxSizing: "border-box",

              padding: "11px 13px",

              border:
                "1px solid var(--border-color)",

              borderRadius: 8,

              background:
                "var(--input-bg)",

              color:
                "var(--foreground)",

              fontSize: 14,
            }}
          />

          <div
            style={{
              marginTop: 15,
            }}
          >
            <button
              type="button"

              onClick={
                changePassword
              }

              disabled={saving}

              style={primaryButtonStyle(
                saving
              )}
            >
              {saving
                ? "Salvataggio..."
                : "Aggiorna password"}
            </button>
          </div>

          {msg && (
            <div
              style={{
                marginTop: 16,

                padding:
                  "12px 14px",

                border:
                  "1px solid var(--border-color)",

                borderRadius: 8,

                background:
                  "var(--input-bg)",

                fontSize: 13,

                fontWeight: 700,
              }}
            >
              {msg}
            </div>
          )}
        </div>
      </div>

      {/* NOTIFICHE PUSH */}

      <div
        style={{
          marginTop: 20,

          border:
            "1px solid var(--border-color)",

          borderRadius: 14,

          overflow: "hidden",

          background:
            "var(--card)",
        }}
      >
        <div
          style={{
            padding: "17px 19px",

            borderBottom:
              "1px solid var(--border-color)",

            background:
              "var(--table-head)",
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 850,
            }}
          >
            Notifiche
          </div>

          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              opacity: 0.55,
            }}
          >
            Avvisi automatici su questo dispositivo per battelli a rischio consegna e scorte sotto minimo.
          </div>
        </div>

        <div
          style={{
            padding: 20,
          }}
        >
          {pushStatus ===
          "non_supportate" ? (
            <div
              style={{
                fontSize: 13,
                opacity: 0.7,
              }}
            >
              Questo dispositivo/browser non supporta le notifiche push. Su iPhone serve installare il gestionale come app (Condividi → Aggiungi alla schermata Home) e poi aprirlo da lì.
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    display:
                      "inline-flex",
                    alignItems:
                      "center",
                    gap: 7,

                    padding:
                      "6px 11px",

                    borderRadius: 20,

                    border:
                      "1px solid var(--border-color)",

                    background:
                      "var(--input-bg)",

                    fontSize: 12,

                    fontWeight: 800,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background:
                        pushStatus ===
                        "attive"
                          ? "#22c55e"
                          : "#94a3b8",
                    }}
                  />
                  {pushStatus === "attive"
                    ? "Attive su questo dispositivo"
                    : pushStatus ===
                      "checking"
                    ? "Verifica in corso..."
                    : pushStatus ===
                      "in_corso"
                    ? "Aggiornamento..."
                    : "Non attive su questo dispositivo"}
                </span>

                {pushStatus ===
                "attive" ? (
                  <button
                    type="button"
                    onClick={
                      deactivatePush
                    }
                    disabled={false}
                    style={
                      secondaryButtonStyle
                    }
                  >
                    Disattiva
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={
                      activatePush
                    }
                    disabled={
                      pushStatus ===
                        "checking" ||
                      pushStatus ===
                        "in_corso"
                    }
                    style={primaryButtonStyle(
                      pushStatus ===
                        "checking" ||
                        pushStatus ===
                          "in_corso"
                    )}
                  >
                    Attiva notifiche su questo dispositivo
                  </button>
                )}
              </div>

              {pushMsg && (
                <div
                  style={{
                    marginTop: 14,

                    padding:
                      "12px 14px",

                    border:
                      "1px solid var(--border-color)",

                    borderRadius: 8,

                    background:
                      "var(--input-bg)",

                    fontSize: 13,

                    fontWeight: 700,
                  }}
                >
                  {pushMsg}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const secondaryButtonStyle = {
  padding: "10px 14px",

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

function primaryButtonStyle(
  disabled: boolean
) {
  return {
    padding: "11px 16px",

    borderRadius: 8,

    border:
      "1px solid var(--foreground)",

    background:
      "var(--foreground)",

    color:
      "var(--background)",

    cursor: disabled
      ? "not-allowed"
      : "pointer",

    fontWeight: 850,

    opacity: disabled
      ? 0.5
      : 1,
  };
}