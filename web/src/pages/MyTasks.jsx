import { useState } from "react";
import { api } from "../api.js";
import { Button, Card, DeadlineText, EmptyState, Spinner, StatusPill, Tabs } from "../components/ui.jsx";
import { fmt, navigate, usePoll } from "../lib.js";

function TaskCard({ task, onAction, busy, actionType }) {
  return (
    <Card className="bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button className="truncate text-left text-sm font-semibold text-primary hover:underline" onClick={() => navigate(`/project/${task.project_id}`)}>
            {task.number} — {task.title}
          </button>
          <div className="mt-1 text-xs text-muted">
            Клиент: {task.client_name}
            <span className="mx-1.5">•</span>
            Этап {task.order_index}: {task.stage_name}
          </div>
        </div>
        <StatusPill status={task.status} />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-3">
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>Тип: <span className="text-ink">{task.required_processing_type}</span></span>
          {task.status === "in_progress" && (
            <>
              <span>Взято: {fmt(task.taken_at)}</span>
              <span>
                Дедлайн: <DeadlineText value={task.deadline_at} status={task.status} />
              </span>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {actionType === "pool" && (
            <Button size="sm" onClick={() => onAction("capture", task)} disabled={busy}>
              Взять в работу
            </Button>
          )}
          {actionType === "mine" && (
            <>
              <Button size="sm" variant="ghost" onClick={() => onAction("release", task)} disabled={busy}>
                Вернуть в пул
              </Button>
              <Button size="sm" variant="success" onClick={() => onAction("complete", task)} disabled={busy}>
                Завершить этап
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function MyTasks() {
  const [tab, setTab] = useState("mine");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { data: mine, reload: reloadMine, loading: lm } = usePoll(() => api("/tasks/my"), [], 10000);
  const { data: pool, reload: reloadPool, loading: lp } = usePoll(() => api("/tasks/pool"), [], 10000);

  const act = async (action, task) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/tasks/${task.id}/${action}`, { method: "POST" });
      reloadMine();
      reloadPool();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const mineList = mine || [];
  const poolList = pool || [];

  return (
    <div className="mx-auto max-w-5xl">
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "mine", label: "В работе", count: mineList.length },
          { id: "pool", label: "Пул задач", count: poolList.length },
        ]}
      />
      {error && <div className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      <div className="mt-4 space-y-3">
        {tab === "mine" &&
          (lm ? <Spinner /> : mineList.length === 0 ? <EmptyState>Нет задач в работе. Возьмите задачу из пула.</EmptyState> : mineList.map((t) => <TaskCard key={t.id} task={t} onAction={act} busy={busy} actionType="mine" />))}
        {tab === "pool" &&
          (lp ? <Spinner /> : poolList.length === 0 ? <EmptyState>В пуле нет задач, соответствующих вашим типам обработки данных.</EmptyState> : poolList.map((t) => <TaskCard key={t.id} task={t} onAction={act} busy={busy} actionType="pool" />))}
      </div>
    </div>
  );
}
