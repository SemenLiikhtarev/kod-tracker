import { Avatar, Card, DeadlineText, EmptyState, StatusPill, Spinner } from "../components/ui.jsx";
import { api } from "../api.js";
import { fmt, navigate, usePoll } from "../lib.js";

function Cell({ project, task }) {
  const dot = { overdue: "border-l-danger", soon: "border-l-warning", ok: "border-l-success", none: "border-l-black/10" };
  const state =
    task?.status === "in_progress" && task.deadline_at
      ? (() => {
          const diff = new Date(task.deadline_at.replace(" ", "T") + "Z").getTime() - Date.now();
          if (diff < 0) return "overdue";
          if (diff < 4 * 36e5) return "soon";
          return "ok";
        })()
      : "none";

  return (
    <button
      onClick={() => navigate(`/project/${project.id}`)}
      className={`w-full rounded-lg border border-black/5 border-l-4 bg-white p-3 text-left shadow-sm transition hover:shadow-md ${dot[state]}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-primary">{project.number}</span>
        <StatusPill status={task?.status || "waiting"} />
      </div>
      <div className="mt-1 line-clamp-2 text-xs text-ink">{project.title}</div>
      <div className="mt-0.5 truncate text-[11px] text-muted">{project.client_name}</div>
      <div className="mt-2 flex items-center justify-between">
        {task?.executor_name ? (
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <Avatar name={task.executor_name} color={task.executor_color} size={20} />
            <span className="truncate">{task.executor_name}</span>
          </span>
        ) : (
          <span className="text-[11px] text-muted">исполнитель не назначен</span>
        )}
        {task?.status === "in_progress" && <DeadlineText value={task.deadline_at} status={task.status} />}
      </div>
      {project.status === "done" && <div className="mt-2 text-[11px] font-medium text-success">Отправлено {fmt(project.sent_at)}</div>}
    </button>
  );
}

export default function Board() {
  const { data, loading, error } = usePoll(() => api("/tasks/board"), [], 10000);

  if (loading) return <Spinner />;
  if (error) return <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error.message}</div>;
  if (!data?.length) return <EmptyState>Проектов пока нет.</EmptyState>;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {data.map((col) => (
        <div key={col.stage.id} className="w-72 shrink-0">
          <div className="mb-2 flex items-center justify-between rounded-lg bg-sky-light px-3 py-2">
            <span className="text-sm font-semibold text-primary">
              {col.stage.order_index}. {col.stage.name}
            </span>
            <span className="text-xs text-muted">{col.cells.length}</span>
          </div>
          <div className="mb-2 text-[11px] text-muted">Тип: {col.stage.required_processing_type} · дедлайн {col.stage.default_deadline_hours} ч</div>
          <div className="space-y-2">
            {col.cells.map(({ project, task }) => (
              <Cell key={project.id} project={project} task={task} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
