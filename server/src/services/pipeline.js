const { all, get, run, transaction } = require("../db");
const config = require("../config");
const audit = require("./audit");
const notify = require("./notifications");
const disk = require("../integrations/yandexDisk");
const mail = require("../integrations/yandexMail");
const queue = require("../integrations/queue");

function nowIso() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function addHoursIso(hours) {
  return new Date(Date.now() + hours * 36e5).toISOString().slice(0, 19).replace("T", " ");
}

function stagesOrdered() {
  return all("SELECT * FROM stages ORDER BY order_index");
}

function getProject(id) {
  return get("SELECT * FROM projects WHERE id = :id", { id });
}

function projectDetail(id) {
  const project = getProject(id);
  if (!project) return null;
  const tasks = all(
    `SELECT t.*, s.name AS stage_name, s.order_index, s.required_processing_type,
            u.name AS executor_name, u.avatar_color AS executor_color, s.default_deadline_hours
       FROM tasks t
       JOIN stages s ON s.id = t.stage_id
       LEFT JOIN users u ON u.id = t.executor_id
      WHERE t.project_id = :id
      ORDER BY s.order_index`,
    { id }
  );
  return { ...project, tasks, files: disk.listFiles(id) };
}

/** Генерирует уникальный номер проекта. */
function nextNumber(subject = "") {
  const digits = (subject.match(/(\d{3,})/) || [])[1];
  if (digits) return `К-${digits}`;
  return `К-${Date.now().toString().slice(-6)}`;
}

/**
 * 4.1 Инициация проекта: создаёт карточку, структуру папок на Яндекс.Диске
 * и экземпляры этапов. Первый этап переходит в статус «Ожидает».
 */
function createProject(email) {
  const number = nextNumber(email.subject);
  const stages = stagesOrdered();
  const { folderId, base } = disk.createProjectStructure({ number: number, client_name: email.client_name });
  const totalHours = stages.reduce((acc, s) => acc + s.default_deadline_hours, 0);

  const res = run(
    `INSERT INTO projects (number, title, client_name, client_email, yandex_folder_id, disk_path, status, source, final_deadline)
     VALUES (:number, :title, :client, :email, :folder, :disk, 'active', :source, :deadline)`,
    {
      number,
      title: email.title || email.subject || "Обработка данных",
      client: email.client_name,
      email: email.client_email || null,
      folder: folderId,
      disk: base,
      source: email.source || "email",
      deadline: addHoursIso(totalHours),
    }
  );
  const projectId = res.lastInsertRowid;

  const firstStage = stages[0];
  for (const s of stages) {
    run(
      `INSERT INTO tasks (project_id, stage_id, status) VALUES (:p, :s, :status)`,
      { p: projectId, s: s.id, status: s.id === firstStage.id ? "pending" : "waiting" }
    );
  }

  if (Array.isArray(email.attachments)) {
    for (const name of email.attachments) {
      disk.addFile(projectId, firstStage.id, name, Math.floor(50_000 + Math.random() * 5_000_000));
    }
  }

  const project = getProject(projectId);
  audit.log(null, null, "project_created", { projectId, number, source: project.source });
  const firstTask = get("SELECT * FROM tasks WHERE project_id = :p AND stage_id = :s", { p: projectId, s: firstStage.id });
  notify.notifyNewStage(project, { ...firstStage, deadline_at: null });

  if (email.storeIncoming) {
    mail.storeIncoming(email, projectId, "processed");
  }
  return projectDetail(projectId);
}

function assert(cond, message) {
  if (!cond) {
    const err = new Error(message);
    err.status = 400;
    throw err;
  }
}

/**
 * 4.2 Захват задачи в работу (Pessimistic Locking через BEGIN IMMEDIATE).
 */
function captureTask(taskId, user) {
  assert(user.role === "executor", "Взять задачу в работу может только исполнитель");

  return transaction(() => {
    const task = get(
      `SELECT t.*, s.required_processing_type, s.name AS stage_name, s.id AS stage_id
         FROM tasks t JOIN stages s ON s.id = t.stage_id WHERE t.id = :id`,
      { id: taskId }
    );
    assert(task, "Задача не найдена");
    assert(task.status === "pending", "Задача уже не доступна в пуле");
    assert(
      JSON.parse(user.processing_types || "[]").includes(task.required_processing_type),
      `Для этого этапа требуется тип обработки «${task.required_processing_type}»`
    );

    const stage = get("SELECT * FROM stages WHERE id = :id", { id: task.stage_id });
    const deadline = addHoursIso(stage.default_deadline_hours);
    run(
      `UPDATE tasks SET status = 'in_progress', executor_id = :u, taken_at = :taken, deadline_at = :deadline,
              deadline_warned = 0, overdue_notified = 0
        WHERE id = :id`,
      { u: user.id, taken: nowIso(), deadline, id: taskId }
    );

    const project = getProject(task.project_id);
    audit.log(user.id, taskId, "capture", { project: project.number, stage: stage.name });
    notify.notifyCaptured(project, stage, user);
    return get("SELECT * FROM tasks WHERE id = :id", { id: taskId });
  });
}

/** Возврат задачи в пул (снятие захвата). */
function releaseTask(taskId, user) {
  return transaction(() => {
    const task = get("SELECT t.*, s.name AS stage_name FROM tasks t JOIN stages s ON s.id = t.stage_id WHERE t.id = :id", {
      id: taskId,
    });
    assert(task, "Задача не найдена");
    assert(task.status === "in_progress", "Снять захват можно только у задачи в работе");
    assert(
      user.role === "manager" || task.executor_id === user.id,
      "Недостаточно прав для снятия захвата"
    );
    run(
      `UPDATE tasks SET status = 'pending', executor_id = NULL, taken_at = NULL, deadline_at = NULL,
              deadline_warned = 0, overdue_notified = 0 WHERE id = :id`,
      { id: taskId }
    );
    const project = getProject(task.project_id);
    audit.log(user.id, taskId, "release", { project: project.number, stage: task.stage_name });
    return get("SELECT * FROM tasks WHERE id = :id", { id: taskId });
  });
}

/**
 * 4.3 Завершение этапа: файлы переносятся в папку следующего этапа, следующий
 * этап активируется и рассылаются уведомления.
 */
function completeTask(taskId, user) {
  return transaction(() => {
    const task = get("SELECT * FROM tasks WHERE id = :id", { id: taskId });
    assert(task, "Задача не найдена");
    assert(task.status === "in_progress", "Завершить можно только задачу в работе");
    assert(task.executor_id === user.id, "Завершить этап может только исполнитель, взявший задачу");

    run("UPDATE tasks SET status = 'done', completed_at = :now WHERE id = :id", { now: nowIso(), id: taskId });
    const project = getProject(task.project_id);

    const stage = get("SELECT * FROM stages WHERE id = :id", { id: task.stage_id });
    const nextStage = get("SELECT * FROM stages WHERE order_index = :o", { o: stage.order_index + 1 });

    audit.log(user.id, taskId, "complete", { project: project.number, stage: stage.name });

    if (nextStage) {
      const affected = disk.moveStageFiles(project.id, stage.id, nextStage.id);
      queue.enqueue("disk.moveStageFiles", { projectId: project.id, from: stage.id, to: nextStage.id, affected });
      run(
        "UPDATE tasks SET status = 'pending' WHERE project_id = :p AND stage_id = :s AND status = 'waiting'",
        { p: project.id, s: nextStage.id }
      );
      notify.notifyNewStage(project, { ...nextStage, deadline_at: null });
      audit.log(null, null, "stage_activated", { project: project.number, stage: nextStage.name });
    } else {
      audit.log(null, null, "project_ready_for_finalization", { project: project.number });
    }
    return get("SELECT * FROM tasks WHERE id = :id", { id: taskId });
  });
}

/** 4.3 Финализация: сбор файлов и отправка клиенту через Яндекс.Почту. */
function sendProjectToClient(projectId, user) {
  assert(user.role === "manager", "Отправить результат клиенту может только руководитель");
  return transaction(() => {
    const project = getProject(projectId);
    assert(project, "Проект не найден");
    assert(project.status === "active", "Проект уже отправлен");

    const tasks = all("SELECT * FROM tasks WHERE project_id = :p", { p: projectId });
    assert(tasks.every((t) => t.status === "done"), "Не все этапы завершены");

    const files = disk.listFiles(projectId);
    const links = disk.getDownloadLinks(files);
    const conclusion = `Обработка данных завершена. Обработано этапов: ${tasks.length}.`;
    queue.enqueue("mail.sendFinal", {
      projectId,
      to: project.client_email,
      project: { id: project.id, number: project.number, title: project.title },
      links,
      conclusion,
    });

    run("UPDATE projects SET status = 'done', sent_at = :now WHERE id = :id", { now: nowIso(), id: projectId });
    audit.log(user.id, null, "send_to_client", { project: project.number, files: files.length });
    return projectDetail(projectId);
  });
}

// --- Обработчики очереди (отказоустойчивость интеграций) ---
queue.registerHandler("disk.moveStageFiles", async (payload) => {
  // В реальной системе здесь повторяется вызов Яндекс.Диска при сбое.
  if (config.simulateIntegrationFailures && Math.random() < 0.5) {
    throw new Error("Яндекс.Диск временно недоступен");
  }
});

queue.registerHandler("mail.sendFinal", async (payload) => {
  if (config.simulateIntegrationFailures && Math.random() < 0.3) {
    throw new Error("SMTP Яндекс.Почты временно недоступен");
  }
  mail.sendFinalEmail(payload);
});

/** Прочие выборки для API. */
function poolForUser(user) {
  const types = JSON.parse(user.processing_types || "[]");
  return all(
    `SELECT t.*, p.number, p.title, p.client_name, s.name AS stage_name, s.order_index,
            s.required_processing_type, s.default_deadline_hours
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       JOIN stages s ON s.id = t.stage_id
      WHERE t.status = 'pending' AND p.status = 'active'
      ORDER BY s.order_index, p.id`
  ).filter((t) => types.includes(t.required_processing_type));
}

function myTasks(userId) {
  return all(
    `SELECT t.*, p.number, p.title, p.client_name, s.name AS stage_name, s.order_index,
            s.required_processing_type
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       JOIN stages s ON s.id = t.stage_id
      WHERE t.executor_id = :u AND t.status = 'in_progress'
      ORDER BY t.deadline_at`,
    { u: userId }
  );
}

function board() {
  const stages = stagesOrdered();
  const projects = all("SELECT * FROM projects ORDER BY id DESC");
  return stages.map((s) => ({
    stage: s,
    cells: projects.map((p) => {
      const task = get(
        `SELECT t.*, u.name AS executor_name, u.avatar_color AS executor_color
           FROM tasks t LEFT JOIN users u ON u.id = t.executor_id
          WHERE t.project_id = :p AND t.stage_id = :s`,
        { p: p.id, s: s.id }
      );
      return { project: p, task: task || null };
    }),
  }));
}

module.exports = {
  createProject,
  captureTask,
  releaseTask,
  completeTask,
  sendProjectToClient,
  projectDetail,
  poolForUser,
  myTasks,
  board,
  getProject,
  stagesOrdered,
  nextNumber,
  nowIso,
  addHoursIso,
};
