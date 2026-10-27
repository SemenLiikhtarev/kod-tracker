import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Avatar, Badge, Button, Card, EmptyState, Spinner } from "../components/ui.jsx";
import { fmt, navigate, usePoll } from "../lib.js";

const STATE_BADGE = {
  overdue: "bg-danger/10 text-danger",
  soon: "bg-warning/20 text-[#8a6d00]",
  ok: "bg-success/10 text-success",
  none: "bg-black/5 text-muted",
};

function Progress({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mt-2">
      <div className="mb-1 flex justify-between text-[11px] text-muted">
        <span>
          Прогресс: {done}/{total} этапов
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Projects() {
  const { user } = useAuth();
  const { data, loading, error, reload } = usePoll(() => api("/projects"), [], 10000);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const simulate = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await api("/dev/incoming-email", { method: "POST", body: {} });
      setNotice(`Создан проект ${res.project.number} по письму «${res.email.subject}» (вложений: ${res.email.attachments.length})`);
      reload();
    } catch (err) {
      setNotice(`Ошибка: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error.message}</div>;

  return (
    <div className="mx-auto max-w-6xl">
      {user.role === "manager" && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-black/5 bg-white px-4 py-3">
          <div className="text-sm text-muted">
            Имитация входящего письма «Новый заказ» из Яндекс.Почты: создаётся проект, структура папок на Диске и первый этап.
          </div>
          <Button onClick={simulate} disabled={busy}>
            {busy ? "Обработка письма…" : "Получить новый заказ"}
          </Button>
        </div>
      )}
      {notice && <div className="mb-4 rounded-lg bg-sky-light px-3 py-2 text-sm text-primary">{notice}</div>}

      {!data?.length ? (
        <EmptyState>Проектов пока нет.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((p) => (
            <Card key={p.id} className="cursor-pointer bg-white transition hover:shadow-md" >
              <div onClick={() => navigate(`/project/${p.id}`)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-primary">{p.number}</div>
                    <div className="truncate text-sm">{p.title}</div>
                    <div className="truncate text-xs text-muted">{p.client_name}</div>
                  </div>
                  <Badge className={p.status === "done" ? "bg-success/10 text-success" : STATE_BADGE[p.deadline_state]}>
                    {p.status === "done" ? "Отправлен" : p.deadline_state === "overdue" ? "Просрочен" : p.deadline_state === "soon" ? "Срочно" : "В работе"}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                  {p.current_executor ? (
                    <>
                      <Avatar name={p.current_executor} color={p.current_executor_color} size={22} />
                      <span className="truncate">{p.current_executor}</span>
                    </>
                  ) : (
                    <span>исполнитель не назначен</span>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-muted">Текущий этап: {p.current_stage || "—"}</div>
                <Progress done={p.progress.done} total={p.progress.total} />
                <div className="mt-2 text-[11px] text-muted">
                  Создан {fmt(p.created_at)} · финальный дедлайн {fmt(p.final_deadline)}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
