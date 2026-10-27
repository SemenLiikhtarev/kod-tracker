import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Avatar, Badge, Button, Card, DeadlineText, Spinner, StatusPill } from "../components/ui.jsx";
import { fmt, fmtSize, navigate, usePoll } from "../lib.js";

const FOLDER_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-primary">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function ProjectDetail({ id }) {
  const { user } = useAuth();
  const { data: project, loading, error, reload } = usePoll(() => api(`/projects/${id}`), [id], 8000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const act = async (taskId, action) => {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/tasks/${taskId}/${action}`, { method: "POST" });
      reload();
    } catch (err) {
      setMsg(`Ошибка: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const sendToClient = async () => {
    if (!window.confirm("Отправить результат клиенту через Яндекс.Почту?")) return;
    setBusy(true);
    setMsg(null);
    try {
      await api(`/projects/${id}/send-to-client`, { method: "POST" });
      setMsg("Результат отправлен клиенту. Письмо поставлено в очередь Яндекс.Почты.");
      reload();
    } catch (err) {
      setMsg(`Ошибка: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error.message}</div>;
  if (!project) return null;

  const allDone = project.tasks.every((t) => t.status === "done");
  const myTypes = user.processing_types || [];

  return (
    <div className="mx-auto max-w-6xl">
      <button className="mb-3 text-sm text-primary hover:underline" onClick={() => history.back()}>
        ← Назад
      </button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{project.number} — {project.title}</h2>
            <Badge className={project.status === "done" ? "bg-success/10 text-success" : "bg-sky-light text-primary"}>
              {project.status === "done" ? "Отправлен клиенту" : "В работе"}
            </Badge>
          </div>
          <div className="mt-1 text-sm text-muted">
            Клиент: {project.client_name} {project.client_email ? `· ${project.client_email}` : ""} · источник: {project.source === "email" ? "Яндекс.Почта" : "вручную"}
          </div>
        </div>
        {user.role === "manager" && project.status === "active" && (
          <Button onClick={sendToClient} disabled={!allDone || busy} title={allDone ? "" : "Не все этапы завершены"}>
            {allDone ? "Отправить клиенту" : "Не все этапы завершены"}
          </Button>
        )}
      </div>

      {msg && <div className="mb-4 rounded-lg bg-sky-light px-3 py-2 text-sm text-primary">{msg}</div>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="bg-white">
            <div className="mb-3 text-sm font-semibold">Таймлайн этапов конвейера</div>
            <div className="space-y-3">
              {project.tasks.map((t) => {
                const canCapture = user.role === "executor" && t.status === "pending" && myTypes.includes(t.required_processing_type);
                const isMine = t.status === "in_progress" && t.executor_id === user.id;
                return (
                  <div key={t.id} className={`rounded-lg border p-3 ${t.status === "in_progress" ? "border-primary/30 bg-sky-light/40" : "border-black/5"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${t.status === "done" ? "bg-success text-white" : t.status === "in_progress" ? "bg-primary text-white" : "bg-black/10 text-muted"}`}>
                          {t.order_index}
                        </span>
                        <div>
                          <div className="text-sm font-medium">{t.stage_name}</div>
                          <div className="text-[11px] text-muted">Требуемый тип: {t.required_processing_type} · норматив {t.default_deadline_hours} ч</div>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted">
                            {t.executor_name && (
                              <span className="flex items-center gap-1.5">
                                <Avatar name={t.executor_name} color={t.executor_color} size={18} />
                                {t.executor_name}
                              </span>
                            )}
                            {t.taken_at && <span>Взято: {fmt(t.taken_at)}</span>}
                            {t.status === "in_progress" && <DeadlineText value={t.deadline_at} status={t.status} />}
                            {t.completed_at && <span>Завершено: {fmt(t.completed_at)}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusPill status={t.status} />
                        <div className="flex gap-2">
                          {canCapture && (
                            <Button size="sm" onClick={() => act(t.id, "capture")} disabled={busy}>
                              Взять в работу
                            </Button>
                          )}
                          {isMine && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => act(t.id, "release")} disabled={busy}>
                                Вернуть в пул
                              </Button>
                              <Button size="sm" variant="success" onClick={() => act(t.id, "complete")} disabled={busy}>
                                Завершить
                              </Button>
                            </>
                          )}
                          {user.role === "manager" && t.status === "in_progress" && (
                            <Button size="sm" variant="danger" onClick={() => act(t.id, "release")} disabled={busy}>
                              Сбросить захват
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="bg-white">
            <div className="mb-2 text-sm font-semibold">Метаданные проекта</div>
            <dl className="space-y-1.5 text-xs">
              {[
                ["Номер", project.number],
                ["Статус", project.status === "done" ? "Отправлен" : "Активен"],
                ["Источник", project.source === "email" ? "Яндекс.Почта" : "Создан вручную"],
                ["Создан", fmt(project.created_at)],
                ["Финальный дедлайн", fmt(project.final_deadline)],
                ["Отправлен", project.sent_at ? fmt(project.sent_at) : "—"],
                ["Папка на Диске", project.disk_path],
                ["ID папки", project.yandex_folder_id],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="max-w-[60%] break-words text-right text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="bg-white">
            <div className="mb-2 text-sm font-semibold">Файлы (Яндекс.Диск)</div>
            <div className="space-y-3">
              {(project.disk || []).map((folder) => (
                <div key={folder.order}>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                    {FOLDER_ICON}
                    Этап {folder.order}
                  </div>
                  <div className="mt-1 space-y-1 pl-5">
                    {folder.files.length === 0 && <div className="text-[11px] text-muted">файлов нет</div>}
                    {folder.files.map((f) => (
                      <div key={f.id} className="flex items-center justify-between gap-2 text-[11px]">
                        <a className="truncate text-ink hover:text-primary hover:underline" href={f.public_url} target="_blank" rel="noreferrer" title={f.path}>
                          {f.name}
                        </a>
                        <span className="shrink-0 text-muted">{fmtSize(f.size_bytes)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
