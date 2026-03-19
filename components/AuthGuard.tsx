"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    async function logoutAndRedirect() {
      localStorage.removeItem("magazzino_user");
      localStorage.removeItem("magazzino_role");
      localStorage.removeItem("magazzino_user_id");
      localStorage.removeItem("magazzino_session_version");
      router.replace("/login");
    }

    async function checkAuth() {
      const user = localStorage.getItem("magazzino_user");
      const userId = localStorage.getItem("magazzino_user_id");
      const localSessionVersion = localStorage.getItem(
        "magazzino_session_version"
      );

      if (!user || !userId) {
        if (pathname !== "/login") {
          await logoutAndRedirect();
          return;
        }
        setReady(true);
        return;
      }

      if (pathname === "/login") {
        router.replace("/");
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .select("session_version")
        .eq("id", userId)
        .maybeSingle();

      if (error || !data) {
        await logoutAndRedirect();
        return;
      }

      const dbVersion = Number(data.session_version || 1);
      const savedVersion = Number(localSessionVersion || 1);

      if (dbVersion !== savedVersion) {
        await logoutAndRedirect();
        return;
      }

      setReady(true);
    }

    checkAuth();

    if (pathname !== "/login") {
      interval = setInterval(() => {
        checkAuth();
      }, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [pathname, router]);

  if (!ready) {
    return <div className="p-6">Caricamento...</div>;
  }

  return <>{children}</>;
}