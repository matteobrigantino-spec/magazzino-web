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
  password: string;
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
      } = await supabase
        .from("users")
        .select(
          `
            id,
            username,
            password,
            role,
            session_version,
            display_name,
            is_active,
            permissions
          `
        )
        .eq(
          "username",
          cleanUsername
        )
        .eq(
          "password",
          cleanPassword
        )
        .maybeSingle<LoginUser>();

      if (error) {
        setMsg(
          "Errore login: " +
            error.message
        );

        setLoading(false);
        return;
      }

      if (!data) {
        setMsg(
          "Username o password errati"
        );

        setLoading(false);
        return;
      }

      if (
        data.is_active === false
      ) {
        setMsg(
          "Questo account è stato disattivato."
        );

        setLoading(false);
        return;
      }

      const permissions =
        data.permissions &&
        typeof data.permissions ===
          "object"
          ? data.permissions
          : {};

      localStorage.setItem(
        "magazzino_user",
        data.username
      );

      localStorage.setItem(
        "magazzino_display_name",
        data.display_name ||
          data.username
      );

      localStorage.setItem(
        "magazzino_role",
        data.role || "user"
      );

      localStorage.setItem(
        "magazzino_user_id",
        data.id
      );

      localStorage.setItem(
        "magazzino_session_version",
        String(
          data.session_version || 1
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