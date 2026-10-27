import { initials, TASK_STATUS, deadlineMeta } from "../lib.js";

export function Avatar({ name, color = "#005EB8", size = 32, className = "" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export function Badge({ children, className = "" }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export function StatusPill({ status }) {
  const meta = TASK_STATUS[status] || TASK_STATUS.waiting;
  return <Badge className={meta.cls}>{meta.label}</Badge>;
}

export function DeadlineText({ value, status, className = "" }) {
  const meta = deadlineMeta(value, status);
  const dot = { overdue: "bg-danger", soon: "bg-warning", ok: "bg-success", none: "bg-muted/40" }[meta.tone];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.cls} ${className}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {meta.label}
    </span>
  );
}

export function Card({ children, className = "" }) {
  return <div className={`rounded-xl border border-black/5 bg-surface p-4 ${className}`}>{children}</div>;
}

export function Button({ variant = "primary", size = "md", className = "", ...props }) {
  const variants = {
    primary: "bg-primary text-white hover:bg-primary-dark",
    ghost: "bg-white text-ink border border-black/10 hover:bg-sky-light",
    danger: "bg-danger text-white hover:brightness-95",
    success: "bg-success text-white hover:brightness-95",
    subtle: "bg-sky-light text-primary hover:bg-primary/15",
  };
  const sizes = { sm: "px-2.5 py-1 text-xs", md: "px-3.5 py-2 text-sm" };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 border-b border-black/10">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
            active === t.id ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {t.label}
          {t.count != null && (
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${active === t.id ? "bg-sky-light text-primary" : "bg-black/5 text-muted"}`}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ label = "Загрузка…" }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      {label}
    </div>
  );
}

export function EmptyState({ children }) {
  return <div className="rounded-xl border border-dashed border-black/10 bg-white p-8 text-center text-sm text-muted">{children}</div>;
}

export function Stat({ label, value, tone = "primary" }) {
  const tones = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-[#b8860b]",
    danger: "text-danger",
    ink: "text-ink",
  };
  return (
    <Card className="bg-white">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tones[tone]}`}>{value}</div>
    </Card>
  );
}

export function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button className="text-muted hover:text-ink" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-black/5 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
