import { api } from "../api.js";
import { Card, EmptyState, Spinner, Stat } from "../components/ui.jsx";
import { navigate, usePoll } from "../lib.js";

const STATUS_LABEL = { waiting: "Заблокировано", pending: "Ожидает", in_progress: "В работе", done: "Завершено" };

export default function Analytics() {
  const { data, loading, error } = usePoll(() => api("/analytics"), [], 10000);

  if (loading) return <Spinner />;
  if (error) return <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error.message}</div>;

  const byStatus = Object.fromEntries((data.byStatus || []).map((r) => [r.status, r.n]));
  const projActive = (data.projectsByStatus || []).find((r) => r.status === "active")?.n || 0;
  const projDone = (data.projectsByStatus || []).find((r) => r.status === "done")?.n || 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Активные проекты" value={projActive} />
        <Stat label="Отправлено клиентам" value={projDone} tone="success" />
        <Stat label="Задач в работе" value={byStatus.in_progress || 0} tone="primary" />
        <Stat label="Просрочено" value={data.overdue?.length || 0} tone="danger" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="bg-white lg:col-span-2">
          <div className="mb-3 text-sm font-semibold">Загрузка по этапам конвейера</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5 text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Этап</th>
                  <th className="px-3 py-2 font-medium">Заблок.</th>
                  <th className="px-3 py-2 font-medium">Ожидает</th>
                  <th className="px-3 py-2 font-medium">В работе</th>
                  <th className="px-3 py-2 font-medium">Завершено</th>
                </tr>
              </thead>
              <tbody>
                {data.perStage.map((s) => (
                  <tr key={s.order_index} className="border-b border-black/5 last:border-0">
                    <td className="py-2 pr-3">
                      {s.order_index}. {s.stage}
                    </td>
                    <td className="px-3 py-2 text-muted">{s.waiting}</td>
                    <td className="px-3 py-2 text-[#8a6d00]">{s.pending}</td>
                    <td className="px-3 py-2 text-primary">{s.in_progress}</td>
                    <td className="px-3 py-2 text-success">{s.done}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-5">
          <Stat label="Среднее время этапа" value={`${data.avgCompletionHours} ч`} tone="ink" />
          <Card className="bg-white">
            <div className="mb-2 text-sm font-semibold">Очередь интеграций</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between"><span className="text-muted">Ожидает</span><span>{data.queue.queued}</span></div>
              <div className="flex justify-between"><span className="text-muted">Выполняется</span><span>{data.queue.running}</span></div>
              <div className="flex justify-between"><span className="text-muted">Готово</span><span className="text-success">{data.queue.done}</span></div>
              <div className="flex justify-between"><span className="text-muted">Ошибки</span><span className="text-danger">{data.queue.failed}</span></div>
            </div>
          </Card>
        </div>
      </div>

      <Card className="bg-white">
        <div className="mb-3 text-sm font-semibold">Просроченные задачи</div>
        {!data.overdue?.length ? (
          <EmptyState>Просроченных задач нет.</EmptyState>
        ) : (
          <div className="space-y-2">
            {data.overdue.map((t) => (
              <button
                key={t.id}
                onClick={() => navigate(`/project/${t.project_id}`)}
                className="flex w-full items-center justify-between rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-left text-sm hover:bg-danger/10"
              >
                <span>
                  <span className="font-medium text-primary">{t.number}</span> · этап {t.stage_name}
                </span>
                <span className="text-xs text-danger">дедлайн {t.deadline_at}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
