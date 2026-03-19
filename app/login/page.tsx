"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    setMsg("");
    setLoading(true);

    const { data, error } = await supabase
      .from("users")
      .select("id, username, password, role, session_version")
      .eq("username", username.trim())
      .eq("password", password.trim())
      .maybeSingle();

    if (error) {
      setMsg("Errore login: " + error.message);
      setLoading(false);
      return;
    }

    if (!data) {
      setMsg("Username o password errati");
      setLoading(false);
      return;
    }

    localStorage.setItem("magazzino_user", data.username);
    localStorage.setItem("magazzino_role", data.role || "admin");
    localStorage.setItem("magazzino_user_id", data.id);
    localStorage.setItem(
      "magazzino_session_version",
      String(data.session_version || 1)
    );

    setLoading(false);

    // piccolo ritardo per evitare rimbalzi di navigazione
    setTimeout(() => {
      router.replace("/");
    }, 100);
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md border rounded-xl p-6 bg-gray-900">
        <h1 className="text-2xl font-bold mb-6">Login Magazzino</h1>

        <div className="space-y-4">
          <div>
            <label className="block mb-1">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="border p-3 w-full rounded"
            />
          </div>

          <div>
            <label className="block mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border p-3 w-full rounded"
            />
          </div>

          <button
            onClick={login}
            disabled={loading}
            className="border px-4 py-3 rounded w-full hover:bg-gray-700"
          >
            {loading ? "Accesso..." : "Entra"}
          </button>

          {msg && <div className="border p-3 rounded">{msg}</div>}
        </div>
      </div>
    </div>
  );
}