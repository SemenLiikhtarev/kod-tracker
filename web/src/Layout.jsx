import { useState, useRef, useEffect } from "react";
import { api } from "./api.js";
import { useAuth } from "./auth.jsx";
import { Avatar, Badge } from "./components/ui.jsx";
import { navigate, usePoll, ROLE_LABEL } from "./lib.js";

const ICONS = {
  tasks: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  board: "M4 4h5v16H4zM10 4h5v10h-5zM16 4h4v13h-4z",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  chart: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  plug: "M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
};

function Icon({ name, size = 18, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={ICONS[name]} />
    </svg>
  );
}

function navFor(role) {
  const items = [
    { id: "my", label: "Мои задачи", icon: "tasks", roles: ["executor"] },
    { id: "board", label: "Канбан-доска", icon: "board", roles: ["manager", "observer"] },
    { id: "projects", label: "Проекты", icon: "folder", roles: ["manager", "executor", "observer"] },
    { id: "analytics", label: "Аналитика", icon: "chart", roles: ["manager", "observer"] },
    { id: "users", label: "Сотрудники", icon: "users", roles: ["manager"] },
    { id: "integrations", label: "Интеграции", icon: "plug", roles: ["manager", "observer"] },
  ];
  return items.filter((i) => i.roles.includes(role));
}

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { data, reload } = usePoll(() => api("/notifications"), [], 8000);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = data?.unread || 0;
  const items = data?.items || [];

  const markAll = async () => {
    await api("/notifications/read-all", { method: "POST" });
    reload();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-muted transition hover:bg-sky-light hover:text-primary"
        title="Уведомления"
      >
        <Icon name="bell" size={20} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-96 overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
            <span className="text-sm font-semibold">Уведомления</span>
            {unread > 0 && (
              <button className="text-xs text-primary hover:underline" onClick={markAll}>
                прочитать все
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-auto">
            {items.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted">Пока пусто</div>}
            {items.map((n) => (
              <div key={n.id} className={`border-b border-black/5 px-4 py-3 text-sm ${n.is_read ? "" : "bg-sky-light/60"}`}>
                <div className="text-ink">{n.text}</div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                  <span>{n.created_at}</span>
                  <Badge className="bg-black/5 text-muted">{n.channel === "ui" ? "UI" : n.channel}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout({ active, title, children }) {
  const { user, logout } = useAuth();
  const items = navFor(user.role);

  return (
    <div className="flex min-h-screen bg-white">
      <aside className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-black/5 bg-white">
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="/logo.png" alt="КОД" className="h-10 w-10 rounded-lg object-cover" />
          <div className="leading-tight">
            <div className="text-lg font-bold tracking-tight text-primary">КОД</div>
            <div className="text-[11px] text-muted">Конвейер Обработки Данных</div>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(`/${item.id}`)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active === item.id ? "bg-sky-light text-primary" : "text-muted hover:bg-surface hover:text-ink"
              }`}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-black/5 px-4 py-4 text-[11px] leading-relaxed text-muted">
          Файлы хранятся на Яндекс.Диске.
          <br />
          Заказы приходят через Яндекс.Почту.
        </div>
      </aside>

      <div className="ml-64 flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-black/5 bg-white/90 px-8 py-4 backdrop-blur">
          <h1 className="text-xl font-semibold">{title}</h1>
          <div className="flex items-center gap-3">
            <NotificationsBell />
            <div className="flex items-center gap-2 rounded-lg border border-black/5 px-2 py-1.5">
              <Avatar name={user.name} color={user.avatar_color} size={30} />
              <div className="leading-tight">
                <div className="text-sm font-medium">{user.name}</div>
                <div className="text-[11px] text-muted">{ROLE_LABEL[user.role]}</div>
              </div>
            </div>
            <button className="rounded-lg p-2 text-muted transition hover:bg-surface hover:text-danger" title="Выйти" onClick={logout}>
              ⎋
            </button>
          </div>
        </header>
        <main className="flex-1 bg-surface px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
