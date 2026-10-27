const { all, get, run } = require("../db");
const telegram = require("../integrations/telegram");

/** Пользователи с ролью executor, владеющие нужным типом обработки данных. */
function executorsByProcessingType(processingType) {
  return all("SELECT * FROM users WHERE role = 'executor' AND active = 1").filter((u) => {
    try {
      return JSON.parse(u.processing_types || "[]").includes(processingType);
    } catch {
      return false;
    }
  });
}

function managers() {
  return all("SELECT * FROM users WHERE role = 'manager' AND active = 1");
}

function unreadCount(userId) {
  return get("SELECT COUNT(*) AS n FROM notifications WHERE user_id = :u AND is_read = 0", { u: userId }).n;
}

/**
 * Создаёт уведомление в UI и дублирует его в Telegram (по ТЗ канал дублируется).
 */
function createNotification(userId, text, kind = "info") {
  run(
    "INSERT INTO notifications (user_id, text, kind, channel) VALUES (:u, :text, :kind, 'ui')",
    { u: userId, text, kind }
  );
  telegram.sendMessage(userId, text);
  return unreadCount(userId);
}

/** 🔔 Новый этап готов — исполнителям следующего этапа. */
function notifyNewStage(project, stage) {
  const text = `🔔 [КОД] Новая задача: ${project.number} — ${project.title}. Этап: ${stage.name}. Дедлайн: ${formatDeadline(stage.deadline_at)}. Проект #${project.id}`;
  for (const u of executorsByProcessingType(stage.required_processing_type)) {
    createNotification(u.id, text, "new_task");
  }
}

/** 🔒 Задача взята в работу — руководителю и другим исполнителям этой роли. */
function notifyCaptured(project, stage, user) {
  const text = `🔒 [КОД] ${user.name} взял в работу задачу по проекту ${project.number} — ${project.title} (этап: ${stage.name}).`;
  const targets = new Set(managers().map((m) => m.id));
  for (const u of executorsByProcessingType(stage.required_processing_type)) targets.add(u.id);
  targets.delete(user.id);
  for (const id of targets) createNotification(id, text, "captured");
}

/** ⚠️ Дедлайн горит — исполнителю и руководителю. */
function notifyDeadlineWarning(task, project, stage) {
  const text = `⚠️ [КОД] До дедлайна по задаче ${project.number} осталось менее ${hoursLeft(task.deadline_at)} ч. Этап: ${stage.name}.`;
  const ids = new Set(managers().map((m) => m.id));
  if (task.executor_id) ids.add(task.executor_id);
  for (const id of ids) createNotification(id, text, "warning");
}

/** 🚨 Просрочка — руководителю. */
function notifyOverdue(task, project, stage) {
  const executor = task.executor_id ? get("SELECT name FROM users WHERE id = :id", { id: task.executor_id })?.name : "—";
  const text = `🚨 [КОД] Просрочен дедлайн: ${project.number} — ${project.title}, этап ${stage.name}, исполнитель ${executor}.`;
  for (const m of managers()) createNotification(m.id, text, "overdue");
}

function notifyExecutor(userId, text, kind = "info") {
  return createNotification(userId, text, kind);
}

function formatDeadline(value) {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 16);
}

function hoursLeft(deadline) {
  const diff = new Date(deadline.replace(" ", "T") + "Z").getTime() - Date.now();
  return Math.max(0, Math.round(diff / 36e5));
}

module.exports = {
  executorsByProcessingType,
  managers,
  createNotification,
  notifyNewStage,
  notifyCaptured,
  notifyDeadlineWarning,
  notifyOverdue,
  notifyExecutor,
  unreadCount,
  formatDeadline,
};
