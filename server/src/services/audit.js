const { all, run } = require("../db");

/** Аудит действий (таблица logs). */
function log(userId, taskId, action, details = null) {
  run(
    "INSERT INTO logs (user_id, task_id, action, details) VALUES (:user, :task, :action, :details)",
    {
      user: userId ?? null,
      task: taskId ?? null,
      action,
      details: details == null ? null : typeof details === "string" ? details : JSON.stringify(details),
    }
  );
}

function recent(limit = 100) {
  return all(
    `SELECT l.*, u.name AS user_name, t.project_id
       FROM logs l
       LEFT JOIN users u ON u.id = l.user_id
       LEFT JOIN tasks t ON t.id = l.task_id
      ORDER BY l.id DESC LIMIT :limit`,
    { limit }
  );
}

module.exports = { log, recent };
