"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const user = localStorage.getItem("magazzino_user");

    if (!user && pathname !== "/login") {
      router.replace("/login");
      return;
    }

    if (user && pathname === "/login") {
      router.replace("/");
      return;
    }

    setReady(true);
  }, [pathname, router]);

  if (!ready) return <div className="p-6">Caricamento...</div>;

  return <>{children}</>;
}