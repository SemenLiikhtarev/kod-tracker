const config = require("../config");
const { all, run } = require("../db");
const notify = require("./notifications");

/**
 * Фоновый монитор дедлайнов (аналог Celery beat).
 * Отправляет уведомления «дедлайн горит» (< 2 часов) и «просрочка» — по одному разу.
 */
function checkDeadlines() {
  const warnRows = all(
    `SELECT t.*, p.number, p.title, s.name AS stage_name
       FROM tasks t JOIN projects p ON p.id = t.project_id JOIN stages s ON s.id = t.stage_id
      WHERE t.status = 'in_progress' AND t.deadline_warned = 0 AND t.deadline_at IS NOT NULL
        AND datetime(t.deadline_at) > datetime('now')
        AND (julianday(t.deadline_at) - julianday('now')) * 24 < :alert`,
    { alert: config.deadlineAlertHours }
  );
  for (const t of warnRows) {
    notify.notifyDeadlineWarning(t, { number: t.number, title: t.title }, { name: t.stage_name });
    run("UPDATE tasks SET deadline_warned = 1 WHERE id = :id", { id: t.id });
  }

  const overdueRows = all(
    `SELECT t.*, p.number, p.title, s.name AS stage_name
       FROM tasks t JOIN projects p ON p.id = t.project_id JOIN stages s ON s.id = t.stage_id
      WHERE t.status = 'in_progress' AND t.overdue_notified = 0 AND t.deadline_at IS NOT NULL
        AND datetime(t.deadline_at) < datetime('now')`
  );
  for (const t of overdueRows) {
    notify.notifyOverdue(t, { number: t.number, title: t.title }, { name: t.stage_name });
    run("UPDATE tasks SET overdue_notified = 1 WHERE id = :id", { id: t.id });
  }

  return { warned: warnRows.length, overdue: overdueRows.length };
}

function startMonitor(intervalMs = 30_000) {
  checkDeadlines();
  setInterval(() => {
    try {
      checkDeadlines();
    } catch {}
  }, intervalMs);
}

module.exports = { checkDeadlines, startMonitor };
