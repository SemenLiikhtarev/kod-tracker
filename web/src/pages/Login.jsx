import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Avatar, Badge, Button, Spinner } from "../components/ui.jsx";
import { ROLE_LABEL, navigate, usePoll } from "../lib.js";

const HOME = { manager: "/board", executor: "/my", observer: "/board" };

export default function Login() {
  const { login } = useAuth();
  const { data: users, loading } = usePoll(() => api("/auth/demo-users", { auth: false }), [], 0);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState("");

  const doLogin = async (mail) => {
    setBusy(mail);
    setError(null);
    try {
      const user = await login(mail);
      navigate(HOME[user.role] || "/projects");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const groups = ["manager", "executor", "observer"];

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-light/60 to-white p-6">
      <div className="w-full max-w-3xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/logo.png" alt="КОД" className="mb-3 h-24 w-24 rounded-2xl object-cover shadow-sm" />
          <h1 className="text-2xl font-bold text-primary">КОД</h1>
          <p className="text-sm text-muted">Конвейер Обработки Данных — вход через корпоративный Яндекс ID</p>
        </div>

        <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-end gap-2">
            <label className="flex-1">
              <span className="mb-1 block text-xs font-medium text-muted">Корпоративная почта (Яндекс ID)</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ivanov@kod.ru"
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <Button onClick={() => doLogin(email.trim())} disabled={!email.trim() || busy}>
              Войти
            </Button>
          </div>

          {error && <div className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Быстрый вход (демо)</div>
          {loading && <Spinner />}
          <div className="grid gap-4 md:grid-cols-3">
            {groups.map((role) => (
              <div key={role}>
                <div className="mb-2 text-sm font-medium">{ROLE_LABEL[role]}</div>
                <div className="space-y-1.5">
                  {(users || [])
                    .filter((u) => u.role === role)
                    .map((u) => (
                      <button
                        key={u.id}
                        onClick={() => doLogin(u.email)}
                        disabled={!!busy}
                        className="flex w-full items-center gap-2 rounded-lg border border-black/5 px-2.5 py-2 text-left transition hover:border-primary/30 hover:bg-sky-light/60"
                      >
                        <Avatar name={u.name} color={u.avatar_color} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{u.name}</span>
                          <span className="block truncate text-[11px] text-muted">{u.email}</span>
                        </span>
                        {busy === u.email && <span className="text-xs text-primary">…</span>}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-black/5 pt-4 text-[11px] text-muted">
            <Badge className="bg-sky-light text-primary">executor</Badge>
            <Badge className="bg-sky-light text-primary">manager</Badge>
            <Badge className="bg-sky-light text-primary">observer</Badge>
            <span>исполнители видят задачи только по своим типам обработки данных</span>
          </div>
        </div>
      </div>
    </div>
  );
}
