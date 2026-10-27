import { useState } from "react";
import { api } from "../api.js";
import { Badge, Card, EmptyState, Spinner, Tabs } from "../components/ui.jsx";
import { fmt, fmtSize, usePoll } from "../lib.js";

const SERVICE_BADGE = {
  yandex_disk: "bg-sky-light text-primary",
  yandex_mail: "bg-success/10 text-success",
  telegram: "bg-primary/10 text-primary",
  queue: "bg-warning/20 text-[#8a6d00]",
};

function Inbox() {
  const { data, loading } = usePoll(() => api("/integrations/inbox"), [], 8000);
  if (loading) return <Spinner />;
  if (!data?.length) return <EmptyState>Писем не поступало.</EmptyState>;
  return (
    <div className="space-y-3">
      {data.map((e) => {
        const files = JSON.parse(e.attachments || "[]");
        return (
          <Card key={e.id} className="bg-white">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{e.subject}</span>
              <Badge className="bg-success/10 text-success">{e.status === "processed" ? "обработано" : e.status}</Badge>
            </div>
            <div className="mt-1 text-xs text-muted">
              от {e.from_addr} · {fmt(e.received_at)} {e.project_id ? `· проект #${e.project_id}` : ""}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {files.map((f) => (
                <Badge key={f} className="bg-sky-light text-primary">
                  📎 {f}
                </Badge>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Outbox() {
  const { data, loading } = usePoll(() => api("/integrations/outbox"), [], 8000);
  if (loading) return <Spinner />;
  if (!data?.length) return <EmptyState>Исходящих писем нет.</EmptyState>;
  return (
    <div className="space-y-3">
      {data.map((m) => (
        <Card key={m.id} className="bg-white">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{m.subject}</span>
            <span className="text-xs text-muted">{fmt(m.created_at)}</span>
          </div>
          <div className="mt-1 text-xs text-muted">Кому: {m.to_addr}</div>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-surface p-3 text-[11px] leading-relaxed text-ink">{m.body}</pre>
        </Card>
      ))}
    </div>
  );
}

function Telegram() {
  const { data, loading } = usePoll(() => api("/integrations/telegram"), [], 8000);
  if (loading) return <Spinner />;
  if (!data?.length) return <EmptyState>Сообщений нет.</EmptyState>;
  return (
    <div className="space-y-2">
      {data.map((t) => (
        <div key={t.id} className="flex items-start gap-2 rounded-xl border border-black/5 bg-white p-3">
          <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">TG</span>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">
              {t.user_name} · chat {t.chat_id} · {fmt(t.created_at)}
            </div>
            <div className="text-sm">{t.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Queue() {
  const { data, loading } = usePoll(() => api("/integrations/queue"), [], 5000);
  if (loading) return <Spinner />;
  const statusCls = { queued: "bg-warning/20 text-[#8a6d00]", running: "bg-primary/10 text-primary", done: "bg-success/10 text-success", failed: "bg-danger/10 text-danger" };
  return (
    <div>
      <div className="mb-4 grid grid-cols-4 gap-3">
        {[
          ["Ожидает", data.queued, "queued"],
          ["Выполняется", data.running, "running"],
          ["Готово", data.done, "done"],
          ["Ошибки", data.failed, "failed"],
        ].map(([label, value, key]) => (
          <Card key={key} className="bg-white">
            <div className="text-xs text-muted">{label}</div>
            <div className="text-xl font-semibold">{value}</div>
          </Card>
        ))}
      </div>
      {!data.jobs?.length ? (
        <EmptyState>Заданий в очереди не было.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/5 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Задание</th>
                <th className="px-3 py-2 font-medium">Статус</th>
                <th className="px-3 py-2 font-medium">Попытки</th>
                <th className="px-3 py-2 font-medium">Ошибка</th>
                <th className="px-3 py-2 font-medium">Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((j) => (
                <tr key={j.id} className="border-t border-black/5">
                  <td className="px-3 py-2 font-mono text-xs">{j.name}</td>
                  <td className="px-3 py-2"><Badge className={statusCls[j.status]}>{j.status}</Badge></td>
                  <td className="px-3 py-2">{j.attempts}/{j.max_attempts}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-xs text-danger">{j.last_error || "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted">{fmt(j.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Log() {
  const { data, loading } = usePoll(() => api("/integrations/log"), [], 6000);
  if (loading) return <Spinner />;
  if (!data?.length) return <EmptyState>Журнал пуст.</EmptyState>;
  return (
    <div className="overflow-hidden rounded-xl border border-black/5 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Время</th>
            <th className="px-3 py-2 font-medium">Сервис</th>
            <th className="px-3 py-2 font-medium">Операция</th>
            <th className="px-3 py-2 font-medium">Статус</th>
            <th className="px-3 py-2 font-medium">Данные</th>
          </tr>
        </thead>
        <tbody>
          {data.map((l) => (
            <tr key={l.id} className="border-t border-black/5">
              <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{fmt(l.created_at)}</td>
              <td className="px-3 py-2">
                <Badge className={SERVICE_BADGE[l.service] || "bg-black/5 text-muted"}>{l.service}</Badge>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{l.operation}</td>
              <td className="px-3 py-2">
                <span className={l.status === "ok" ? "text-success" : l.status === "error" ? "text-danger" : "text-[#8a6d00]"}>{l.status}</span>
              </td>
              <td className="max-w-[320px] truncate px-3 py-2 text-xs text-muted" title={l.payload || ""}>
                {l.payload || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Integrations() {
  const [tab, setTab] = useState("log");
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 text-sm text-muted">
        Внешние интеграции работают через мок-адаптеры (Яндекс.Почта IMAP/SMTP, Яндекс.Диск REST/WebDAV, Telegram Bot API). Операции с файлами и почтой идут через очередь с повторными попытками.
      </div>
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "log", label: "Журнал API" },
          { id: "inbox", label: "Входящие (Почта)" },
          { id: "outbox", label: "Исходящие (Почта)" },
          { id: "telegram", label: "Telegram-бот" },
          { id: "queue", label: "Очередь" },
        ]}
      />
      <div className="mt-4">
        {tab === "log" && <Log />}
        {tab === "inbox" && <Inbox />}
        {tab === "outbox" && <Outbox />}
        {tab === "telegram" && <Telegram />}
        {tab === "queue" && <Queue />}
      </div>
    </div>
  );
}
