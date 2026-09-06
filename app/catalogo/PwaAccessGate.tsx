"use client";

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";

import { supabase } from "../../lib/supabaseClient";

const SESSION_ACCESS_KEY =
  "magazzino_pwa_session_unlocked";

export default function PwaAccessGate({
  children,
}: {
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] =
    useState(false);

  const [pin, setPin] = useState("");
  const [checking, setChecking] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
    /*
      sessionStorage dura per la sessione corrente:
      - resta valido passando tra Catalogo, Scanner, Note, ecc.
      - resta valido anche aggiornando la pagina
      - viene normalmente azzerato quando la PWA viene chiusa
        completamente e riaperta
    */
    const saved =
      sessionStorage.getItem(
        SESSION_ACCESS_KEY
      );

    setUnlocked(saved === "1");
    setReady(true);
  }, []);

  async function verifyPin(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanPin = pin.trim();

    if (!cleanPin) {
      setErrorMessage(
        "Inserisci il PIN."
      );
      return;
    }

    setChecking(true);
    setErrorMessage("");

    const {
      data,
      error,
    } = await supabase.rpc(
      "verify_pwa_pin",
      {
        p_pin: cleanPin,
      }
    );

    if (error) {
      setErrorMessage(
        "Impossibile verificare il PIN. Controlla la connessione."
      );

      setChecking(false);
      return;
    }

    if (data !== true) {
      setErrorMessage(
        "PIN non corretto."
      );

      setPin("");
      setChecking(false);
      return;
    }

    sessionStorage.setItem(
      SESSION_ACCESS_KEY,
      "1"
    );

    setUnlocked(true);
    setPin("");
    setChecking(false);
  }

  if (!ready) {
    return (
      <div className="pwa-access-loading">
        Verifica accesso...
      </div>
    );
  }

  if (unlocked) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="pwa-access-page">
        <div className="pwa-access-card">
          <div className="pwa-access-icon">
            <LockIcon />
          </div>

          <div className="pwa-access-eyebrow">
            PWA MAGAZZINO
          </div>

          <h1>Accesso magazziniere</h1>

          <p>
            Inserisci il PIN una sola volta
            all&apos;avvio della PWA.
          </p>

          <form
            onSubmit={verifyPin}
            className="pwa-access-form"
          >
            <label htmlFor="pwa-pin">
              PIN
            </label>

            <input
              id="pwa-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(event) => {
                setPin(
                  event.target.value.replace(
                    /\D/g,
                    ""
                  )
                );

                if (errorMessage) {
                  setErrorMessage("");
                }
              }}
              maxLength={8}
              autoFocus
              disabled={checking}
              placeholder="••••"
            />

            {errorMessage && (
              <div className="pwa-access-error">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={
                checking ||
                pin.trim().length === 0
              }
            >
              {checking
                ? "Verifica..."
                : "Entra nella PWA"}
            </button>
          </form>

          <div className="pwa-access-note">
            Dopo l&apos;accesso il PIN non
            verrà richiesto passando tra
            Catalogo, Scanner, Carico,
            Scarico e Note.
          </div>
        </div>
      </div>

      <style jsx global>{`
        .pwa-access-loading {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(
            255,
            255,
            255,
            0.56
          );
          font-size: 13px;
        }

        .pwa-access-page {
          min-height: 100vh;

          display: flex;
          align-items: center;
          justify-content: center;

          box-sizing: border-box;

          padding: 28px 18px;

          background:
            radial-gradient(
              circle at top right,
              rgba(
                37,
                99,
                235,
                0.14
              ),
              transparent 34%
            ),
            linear-gradient(
              180deg,
              #07101b 0%,
              #091321 45%,
              #08111d 100%
            );
        }

        .pwa-access-card {
          width:
            min(460px, 100%);

          padding: 34px;

          box-sizing: border-box;

          text-align: center;

          border:
            1px solid
            rgba(
              96,
              165,
              250,
              0.28
            );

          border-radius: 20px;

          background:
            linear-gradient(
              145deg,
              rgba(
                13,
                25,
                40,
                0.98
              ),
              rgba(
                8,
                17,
                29,
                0.98
              )
            );

          box-shadow:
            0 28px 80px
            rgba(
              0,
              0,
              0,
              0.35
            );
        }

        .pwa-access-icon {
          width: 64px;
          height: 64px;

          margin:
            0 auto 18px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 17px;

          color: #60a5fa;

          border:
            1px solid
            rgba(
              96,
              165,
              250,
              0.25
            );

          background:
            rgba(
              59,
              130,
              246,
              0.11
            );
        }

        .pwa-access-eyebrow {
          color: #60a5fa;

          font-size: 10px;
          font-weight: 950;

          letter-spacing: 1.6px;
        }

        .pwa-access-card h1 {
          margin:
            8px 0 0;

          color: white;

          font-size: 30px;
          font-weight: 950;

          letter-spacing:
            -0.6px;
        }

        .pwa-access-card p {
          margin:
            11px auto 0;

          max-width: 340px;

          color:
            rgba(
              255,
              255,
              255,
              0.52
            );

          font-size: 13px;
          line-height: 1.55;
        }

        .pwa-access-form {
          margin-top: 26px;

          text-align: left;
        }

        .pwa-access-form label {
          display: block;

          margin-bottom: 7px;

          color:
            rgba(
              255,
              255,
              255,
              0.52
            );

          font-size: 10px;
          font-weight: 900;

          letter-spacing: 1px;
        }

        .pwa-access-form input {
          width: 100%;

          box-sizing:
            border-box;

          padding:
            15px 16px;

          border:
            1px solid
            rgba(
              96,
              165,
              250,
              0.26
            );

          border-radius: 11px;

          outline: none;

          background:
            rgba(
              255,
              255,
              255,
              0.04
            );

          color: white;

          font: inherit;
          font-size: 22px;
          font-weight: 900;

          text-align: center;
          letter-spacing: 8px;
        }

        .pwa-access-form input:focus {
          border-color:
            rgba(
              96,
              165,
              250,
              0.80
            );

          box-shadow:
            0 0 0 4px
            rgba(
              59,
              130,
              246,
              0.10
            );
        }

        .pwa-access-error {
          margin-top: 10px;

          padding:
            10px 11px;

          border:
            1px solid
            rgba(
              239,
              68,
              68,
              0.32
            );

          border-radius: 9px;

          background:
            rgba(
              239,
              68,
              68,
              0.08
            );

          color: #f87171;

          font-size: 11px;
          font-weight: 800;
        }

        .pwa-access-form button {
          width: 100%;

          margin-top: 13px;

          min-height: 46px;

          border:
            1px solid #3b82f6;

          border-radius: 11px;

          background:
            linear-gradient(
              135deg,
              #2563eb,
              #3b82f6
            );

          color: white;

          cursor: pointer;

          font-size: 12px;
          font-weight: 950;

          letter-spacing: 0.4px;
        }

        .pwa-access-form button:disabled {
          opacity: 0.55;
          cursor: default;
        }

        .pwa-access-note {
          margin-top: 21px;

          padding-top: 17px;

          border-top:
            1px solid
            rgba(
              255,
              255,
              255,
              0.07
            );

          color:
            rgba(
              255,
              255,
              255,
              0.34
            );

          font-size: 10px;
          line-height: 1.5;
        }

        @media (
          max-width: 520px
        ) {
          .pwa-access-page {
            padding:
              20px 12px;
          }

          .pwa-access-card {
            padding:
              28px 20px;
          }

          .pwa-access-card h1 {
            font-size: 26px;
          }
        }
      `}</style>
    </>
  );
}

function LockIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="5"
        y="10"
        width="14"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M8 10V7.5C8 5.57 9.57 4 11.5 4H12.5C14.43 4 16 5.57 16 7.5V10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <path
        d="M12 14V16.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
