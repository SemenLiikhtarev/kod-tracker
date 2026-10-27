import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Avatar, Badge, Button, Card, Modal, Spinner } from "../components/ui.jsx";
import { ROLE_LABEL, usePoll } from "../lib.js";

const ALL_TYPES = ["Регистрация", "Обработка данных", "Аналитика", "Контроль качества", "Формирование заключения"];

export default function Users() {
  const { user } = useAuth();
  const { data, loading, error, reload } = usePoll(() => api("/users"), [], 15000);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "executor", processing_types: [] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const toggleType = (t) =>
    setForm((f) => ({
      ...f,
      processing_types: f.processing_types.includes(t) ? f.processing_types.filter((x) => x !== t) : [...f.processing_types, t],
    }));

  const create = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api("/users", { method: "POST", body: form });
      setOpen(false);
      setForm({ name: "", email: "", role: "executor", processing_types: [] });
      reload();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error.message}</div>;

  const groups = ["manager", "executor", "observer"];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-muted">
          Авторизация через корпоративный Яндекс ID. Исполнители видят задачи только своего типа обработки данных.
        </div>
        <Button onClick={() => setOpen(true)}>Добавить сотрудника</Button>
      </div>

      <div className="space-y-6">
        {groups.map((role) => (
          <div key={role}>
            <div className="mb-2 text-sm font-semibold">{ROLE_LABEL[role]}</div>
            <div className="grid gap-3 md:grid-cols-2">
              {(data || [])
                .filter((u) => u.role === role)
                .map((u) => (
                  <Card key={u.id} className="flex items-center gap-3 bg-white">
                    <Avatar name={u.name} color={u.avatar_color} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{u.name}</div>
                      <div className="truncate text-[11px] text-muted">{u.email}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {u.processing_types.length === 0 && <span className="text-[11px] text-muted">—</span>}
                        {u.processing_types.map((t) => (
                          <Badge key={t} className="bg-sky-light text-primary">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {u.email === user.email && <Badge className="bg-black/5 text-muted">это вы</Badge>}
                  </Card>
                ))}
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Новый сотрудник"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button onClick={create} disabled={busy || !form.name || !form.email}>
              Создать
            </Button>
          </>
        }
      >
        {msg && <div className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</div>}
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">ФИО</span>
            <input className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Почта (Яндекс ID)</span>
            <input className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Роль</span>
            <select className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="executor">Исполнитель</option>
              <option value="manager">Руководитель</option>
              <option value="observer">Наблюдатель</option>
            </select>
          </label>
          {form.role === "executor" && (
            <div>
              <span className="mb-1 block text-xs text-muted">Типы обработки данных (навыки)</span>
              <div className="flex flex-wrap gap-2">
                {ALL_TYPES.map((t) => {
                  const on = form.processing_types.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleType(t)}
                      className={`rounded-full px-3 py-1 text-xs transition ${on ? "bg-primary text-white" : "border border-black/10 bg-white text-muted hover:bg-sky-light"}`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
