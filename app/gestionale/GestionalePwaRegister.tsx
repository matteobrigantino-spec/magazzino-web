"use client";

import { useEffect } from "react";

export default function GestionalePwaRegister() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    const hostname =
      window.location.hostname;

    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1"
    ) {
      return;
    }

    navigator.serviceWorker
      .register(
        "/sw-gestionale.js",
        {
          scope: "/",
        }
      )
      .catch((error) => {
        console.warn(
          "Service worker Gestionale non registrato:",
          error
        );
      });
  }, []);

  return null;
}
