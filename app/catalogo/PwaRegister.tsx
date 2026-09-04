"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const isLocalDevelopment =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    /*
      IN LOCALE NON USIAMO IL SERVICE WORKER.

      Così durante lo sviluppo vediamo sempre
      immediatamente il codice nuovo e non
      vecchie pagine salvate nella cache.
    */
    if (isLocalDevelopment) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          registrations.forEach(
            (registration) => {
              registration.unregister();
            }
          );
        })
        .catch((error) => {
          console.warn(
            "Errore rimozione Service Worker locale:",
            error
          );
        });

      return;
    }

    /*
      ONLINE / PRODUZIONE:
      la PWA continua a funzionare normalmente
      anche offline.
    */
    navigator.serviceWorker
      .register("/sw.js", {
        scope: "/catalogo",
      })
      .catch((error) => {
        console.error(
          "Errore registrazione Service Worker:",
          error
        );
      });
  }, []);

  return null;
}