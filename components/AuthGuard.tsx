"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

const INACTIVITY_LIMIT = 3 * 60 * 60 * 1000; // 3 ore
const SESSION_CHECK_INTERVAL = 60 * 1000; // 1 minuto
const ACTIVITY_UPDATE_INTERVAL = 30 * 1000; // aggiorna max ogni 30 secondi

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [ready, setReady] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let lastActivityWrite = 0;

    function clearSession() {
      localStorage.removeItem("magazzino_user");
      localStorage.removeItem("magazzino_role");
      localStorage.removeItem("magazzino_user_id");
      localStorage.removeItem("magazzino_session_version");
      localStorage.removeItem("magazzino_last_activity");
    }

    function logoutAndRedirect() {
      clearSession();
      setReady(true);
      router.replace("/login");
    }

    function updateActivity() {
      const now = Date.now();

      if (now - lastActivityWrite < ACTIVITY_UPDATE_INTERVAL) {
        return;
      }

      lastActivityWrite = now;

      const user = localStorage.getItem("magazzino_user");

      if (user) {
        localStorage.setItem(
          "magazzino_last_activity",
          String(now)
        );
      }
    }

    function checkInactivity() {
      const user = localStorage.getItem("magazzino_user");

      if (!user) {
        return false;
      }

      const savedActivity = localStorage.getItem(
        "magazzino_last_activity"
      );

      if (!savedActivity) {
        localStorage.setItem(
          "magazzino_last_activity",
          String(Date.now())
        );

        return false;
      }

      const lastActivity = Number(savedActivity);

      if (!Number.isFinite(lastActivity)) {
        localStorage.setItem(
          "magazzino_last_activity",
          String(Date.now())
        );

        return false;
      }

      const inactiveFor = Date.now() - lastActivity;

      if (inactiveFor >= INACTIVITY_LIMIT) {
        logoutAndRedirect();
        return true;
      }

      return false;
    }

    async function checkAuth() {
      const user = localStorage.getItem("magazzino_user");
      const userId = localStorage.getItem(
        "magazzino_user_id"
      );

      const localSessionVersion = localStorage.getItem(
        "magazzino_session_version"
      );

      if (!user || !userId) {
        if (pathname !== "/login") {
          logoutAndRedirect();
          return;
        }

        setReady(true);
        return;
      }

      /*
        Se siamo già autenticati e apriamo /login,
        torniamo alla dashboard.
      */
      if (pathname === "/login") {
        router.replace("/");
        return;
      }

      /*
        Controllo delle 3 ore di inattività.
      */
      const expired = checkInactivity();

      if (expired) {
        return;
      }

      /*
        Controllo session_version su Supabase.

        IMPORTANTE:
        se c'è solo un errore temporaneo di rete,
        NON facciamo logout.
      */
      const { data, error } = await supabase
        .from("users")
        .select("session_version")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.warn(
          "Controllo sessione temporaneamente non disponibile:",
          error.message
        );

        setReady(true);
        return;
      }

      /*
        Se l'utente non esiste più nel database,
        allora facciamo logout.
      */
      if (!data) {
        logoutAndRedirect();
        return;
      }

      const dbVersion = Number(
        data.session_version || 1
      );

      const savedVersion = Number(
        localSessionVersion || 1
      );

      /*
        Se è stata cambiata la password da un altro PC,
        la session_version cambia e questo PC viene scollegato.
      */
      if (dbVersion !== savedVersion) {
        logoutAndRedirect();
        return;
      }

      setReady(true);
    }

    /*
      Primo controllo all'apertura della pagina.
    */
    checkAuth();

    if (pathname !== "/login") {
      /*
        Se non esiste ancora il timestamp attività,
        lo creiamo.
      */
      if (
        !localStorage.getItem("magazzino_last_activity")
      ) {
        localStorage.setItem(
          "magazzino_last_activity",
          String(Date.now())
        );
      }

      /*
        Questi eventi indicano che stai usando
        realmente il gestionale.
      */
      const activityEvents = [
        "mousedown",
        "keydown",
        "touchstart",
        "scroll",
        "click",
      ];

      activityEvents.forEach((eventName) => {
        window.addEventListener(
          eventName,
          updateActivity,
          { passive: true }
        );
      });

      /*
        Controlliamo sessione e inattività
        una volta al minuto, non ogni 5 secondi.
      */
      interval = setInterval(() => {
        checkAuth();
      }, SESSION_CHECK_INTERVAL);

      return () => {
        if (interval) {
          clearInterval(interval);
        }

        activityEvents.forEach((eventName) => {
          window.removeEventListener(
            eventName,
            updateActivity
          );
        });
      };
    }
  }, [pathname, router]);

  if (!ready) {
    return (
      <div className="p-6">
        Caricamento...
      </div>
    );
  }

  return <>{children}</>;
}