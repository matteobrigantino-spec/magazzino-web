"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState("");

  useEffect(() => {
    const user = localStorage.getItem("magazzino_user");
    setUsername(user || "");
  }, [pathname]);

  function logout() {
    localStorage.removeItem("magazzino_user");
    localStorage.removeItem("magazzino_role");
    router.replace("/login");
  }

  if (pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-50 border-b bg-black/80 backdrop-blur text-white">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-lg">
            Magazzino
          </Link>

          <nav className="flex gap-6 text-sm">
            <Link href="/movements" className="hover:underline">
              Movimenti
            </Link>
            <Link href="/suppliers" className="hover:underline">
              Fornitori
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span>{username}</span>
          <button
            onClick={logout}
            className="border px-3 py-1 rounded hover:bg-gray-700"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}