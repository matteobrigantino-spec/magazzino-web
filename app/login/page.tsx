"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type UserPermissions = {
  dashboard?: boolean;
  view_prices?: boolean;
  view_inventory_value?: boolean;
  suppliers?: boolean;
  movements?: boolean;
  missing_codes?: boolean;
  orders?: boolean;
  create_orders?: boolean;
  reminders?: boolean;
  settings?: boolean;
  manage_users?: boolean;

  [key: string]: boolean | undefined;
};

type LoginUser = {
  id: string;
  username: string;
  role: string | null;
  session_version: number | null;
  display_name: string | null;
  is_active: boolean | null;
  permissions: UserPermissions | null;
};

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [msg, setMsg] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  async function login() {
    if (loading) {
      return;
    }

    setMsg("");

    const cleanUsername =
      username.trim();

    const cleanPassword =
      password.trim();

    if (
      !cleanUsername ||
      !cleanPassword
    ) {
      setMsg(
        "Inserisci username e password"
      );

      return;
    }

    setLoading(true);

    try {
      const {
        data,
        error,
      } = await supabase.rpc(
        "login_user",
        {
          p_username:
            cleanUsername,
          p_password:
            cleanPassword,
        }
      );

      if (error) {
        setMsg(
          "Errore login: " +
            error.message
        );

        setLoading(false);
        return;
      }

      const loginRows =
        (data || []) as LoginUser[];

      const loginUser =
        loginRows[0] || null;

      if (!loginUser) {
        setMsg(
          "Username o password errati"
        );

        setLoading(false);
        return;
      }

      if (
        loginUser.is_active === false
      ) {
        setMsg(
          "Questo account è stato disattivato."
        );

        setLoading(false);
        return;
      }

      const permissions =
        loginUser.permissions &&
        typeof loginUser.permissions ===
          "object"
          ? loginUser.permissions
          : {};

      localStorage.setItem(
        "magazzino_user",
        loginUser.username
      );

      localStorage.setItem(
        "magazzino_display_name",
        loginUser.display_name ||
          loginUser.username
      );

      localStorage.setItem(
        "magazzino_role",
        loginUser.role || "user"
      );

      localStorage.setItem(
        "magazzino_user_id",
        loginUser.id
      );

      localStorage.setItem(
        "magazzino_session_version",
        String(
          loginUser.session_version || 1
        )
      );

      localStorage.setItem(
        "magazzino_permissions",
        JSON.stringify(
          permissions
        )
      );

      localStorage.setItem(
        "magazzino_last_activity",
        String(Date.now())
      );

      setLoading(false);

      setTimeout(() => {
        router.replace("/");
      }, 100);
    } catch (error) {
      console.error(
        "Errore login:",
        error
      );

      setMsg(
        "Errore durante l'accesso."
      );

      setLoading(false);
    }
  }

  function handleKeyDown(
    event:
      React.KeyboardEvent<HTMLInputElement>
  ) {
    if (
      event.key === "Enter"
    ) {
      event.preventDefault();
      login();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md border rounded-xl p-6 bg-gray-900">
        <h1 className="text-2xl font-bold mb-6">
          Login Magazzino
        </h1>

        <div className="space-y-4">
          <div>
            <label className="block mb-1">
              Username
            </label>

            <input
              value={username}
              onChange={(e) =>
                setUsername(
                  e.target.value
                )
              }
              onKeyDown={
                handleKeyDown
              }
              autoComplete="username"
              disabled={loading}
              className="border p-3 w-full rounded"
            />
          </div>

          <div>
            <label className="block mb-1">
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) =>
                setPassword(
                  e.target.value
                )
              }
              onKeyDown={
                handleKeyDown
              }
              autoComplete="current-password"
              disabled={loading}
              className="border p-3 w-full rounded"
            />
          </div>

          <button
            type="button"
            onClick={login}
            disabled={loading}
            className="border px-4 py-3 rounded w-full hover:bg-gray-700"
          >
            {loading
              ? "Accesso..."
              : "Entra"}
          </button>

          {msg && (
            <div className="border p-3 rounded">
              {msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}