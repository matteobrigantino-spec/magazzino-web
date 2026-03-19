"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function changePassword() {
    setMsg("");
    setSaving(true);

    let userId = localStorage.getItem("magazzino_user_id");
    const username = localStorage.getItem("magazzino_user");

    if (!userId && !username) {
      setMsg("Utente non trovato");
      setSaving(false);
      return;
    }

    // Se manca l'ID ma c'è lo username, recuperalo dal database
    if (!userId && username) {
      const { data: foundUser, error: findError } = await supabase
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
      localStorage.setItem("magazzino_user_id", foundUser.id);
      localStorage.setItem(
        "magazzino_session_version",
        String(foundUser.session_version || 1)
      );
    }

    if (!newPassword.trim()) {
      setMsg("Inserisci una nuova password");
      setSaving(false);
      return;
    }

    const { data: currentUser, error: readError } = await supabase
      .from("users")
      .select("session_version")
      .eq("id", userId)
      .maybeSingle();

    if (readError || !currentUser) {
      setMsg("Errore lettura utente");
      setSaving(false);
      return;
    }

    const newVersion = Number(currentUser.session_version || 1) + 1;

    const { error } = await supabase
      .from("users")
      .update({
        password: newPassword.trim(),
        session_version: newVersion,
      })
      .eq("id", userId);

    if (error) {
      setMsg("Errore aggiornamento password: " + error.message);
      setSaving(false);
      return;
    }

    localStorage.setItem("magazzino_session_version", String(newVersion));
    setMsg("Password aggiornata. Tutti gli altri PC sono stati scollegati.");
    setNewPassword("");
    setSaving(false);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard Magazzino</h1>
        <p className="mt-2 text-sm opacity-70">
          Seleziona una sezione dal menu in alto.
        </p>
      </div>

      <div className="max-w-md border rounded-xl p-6 bg-gray-900">
        <h2 className="text-xl font-bold mb-4">Cambio password admin</h2>

        <div className="space-y-4">
          <div>
            <label className="block mb-1">Nuova password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="border p-3 w-full rounded"
            />
          </div>

          <button
            onClick={changePassword}
            disabled={saving}
            className="border px-4 py-3 rounded hover:bg-gray-700"
          >
            {saving ? "Salvataggio..." : "Aggiorna password"}
          </button>

          {msg && <div className="border p-3 rounded">{msg}</div>}
        </div>
      </div>
    </div>
  );
}