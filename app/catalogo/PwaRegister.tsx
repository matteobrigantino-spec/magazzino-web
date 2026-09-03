"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    async function registerServiceWorker() {
      try {
        const registration =
          await navigator.serviceWorker.register(
            "/sw.js",
            {
              scope: "/catalogo",
            }
          );

        console.log(
          "Catalogo offline attivo:",
          registration.scope
        );
      } catch (error) {
        console.error(
          "Errore attivazione catalogo offline:",
          error
        );
      }
    }

    registerServiceWorker();
  }, []);

  return null;
}