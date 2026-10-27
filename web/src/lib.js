import { useEffect, useState } from "react";

export const ROLE_LABEL = { manager: "Руководитель", executor: "Исполнитель", observer: "Наблюдатель" };

export const TASK_STATUS = {
  waiting: { label: "Заблокирован", cls: "bg-surface text-muted border border-black/10" },
  pending: { label: "Ожидает", cls: "bg-warning/20 text-[#8a6d00] border border-warning/40" },
  in_progress: { label: "В работе", cls: "bg-primary/10 text-primary border border-primary/30" },
  done: { label: "Завершено", cls: "bg-success/10 text-success border border-success/30" },
};

export function deadlineMeta(value, status) {
  if (!value || status !== "in_progress") {
    return { tone: "none", label: "—", cls: "text-muted" };
  }
  const diffMs = new Date(value.replace(" ", "T") + "Z").getTime() - Date.now();
  const hours = diffMs / 36e5;
  if (diffMs < 0) return { tone: "overdue", label: "Просрочено", cls: "text-danger" };
  if (hours < 4) return { tone: "soon", label: `≈${Math.max(1, Math.round(hours))} ч`, cls: "text-[#b8860b]" };
  return { tone: "ok", label: `${Math.round(hours)} ч`, cls: "text-success" };
}

export const DEADLINE_DOT = { overdue: "bg-danger", soon: "bg-warning", ok: "bg-success", none: "bg-muted/40" };

export function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function fmt(value) {
  if (!value) return "—";
  const d = new Date(value.replace(" ", "T") + (value.length <= 19 ? "Z" : ""));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function fmtSize(bytes) {
  if (!bytes) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
}

/** Простой hash-роутер без внешних зависимостей. */
export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const path = hash.replace(/^#/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  return { path, parts };
}

export function navigate(to) {
  window.location.hash = to.startsWith("#") ? to : `#${to}`;
}

/** Периодический опрос данных (для живого обновления дашборда). */
export function usePoll(fetcher, deps = [], intervalMs = 10000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const result = await fetcher();
        if (alive) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (alive) setError(err);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const id = intervalMs ? setInterval(load, intervalMs) : null;
    return () => {
      alive = false;
      if (id) clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
}
