const config = require("../config");
const { all, get, run } = require("../db");
const { signToken, userFromRequest } = require("../auth");
const { publicUser } = require("../util");
const pipeline = require("../services/pipeline");
const notify = require("../services/notifications");
const audit = require("../services/audit");
const disk = require("../integrations/yandexDisk");
const mail = require("../integrations/yandexMail");
const telegram = require("../integrations/telegram");
const queue = require("../integrations/queue");
const intlog = require("../integrations/log");

function requireAuth(ctx) {
  if (!ctx.user) {
    const err = new Error("Требуется авторизация");
    err.status = 401;
    throw err;
  }
  return ctx.user;
}

function requireRole(ctx, ...roles) {
  const user = requireAuth(ctx);
  if (!roles.includes(user.role)) {
    const err = new Error("Недостаточно прав");
    err.status = 403;
    throw err;
  }
  return user;
}

/** Статус дедлайна: ok | soon | overdue. */
function deadlineState(task) {
  if (!task || task.status !== "in_progress" || !task.deadline_at) return "none";
  const diffMs = new Date(task.deadline_at.replace(" ", "T") + "Z").getTime() - Date.now();
  if (diffMs < 0) return "overdue";
  if (diffMs < config.deadlineWarningHours * 36e5) return "soon";
  return "ok";
}

function projectSummary(project) {
  const tasks = all(
    `SELECT t.*, s.name AS stage_name, s.order_index, u.name AS executor_name, u.avatar_color AS executor_color
       FROM tasks t JOIN stages s ON s.id = t.stage_id
       LEFT JOIN users u ON u.id = t.executor_id
      WHERE t.project_id = :p ORDER BY s.order_index`,
    { p: project.id }
  );
  const active = tasks.find((t) => t.status === "in_progress") || tasks.find((t) => t.status === "pending");
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const states = tasks.map((t) => deadlineState(t));
  const worst = states.includes("overdue") ? "overdue" : states.includes("soon") ? "soon" : "ok";
  return {
    ...project,
    tasks,
    progress: { done: doneCount, total: tasks.length },
    current_stage: active ? active.stage_name : null,
    current_order: active ? active.order_index : null,
    current_executor: active ? active.executor_name : null,
    current_executor_color: active ? active.executor_color : null,
    deadline_state: worst,
  };
}

function registerRoutes(router) {
  // --- Авторизация (мок Яндекс ID SSO) ---
  router.post("/api/auth/login", (ctx) => {
    const { email } = ctx.body || {};
    const user = email
      ? get("SELECT * FROM users WHERE email = :email AND active = 1", { email })
      : null;
    if (!user) {
      const err = new Error("Пользователь не найден в корпоративном Яндекс ID");
      err.status = 401;
      throw err;
    }
    audit.log(user.id, null, "login", { email });
    return { token: signToken(user), user: publicUser(user) };
  });

  router.get("/api/auth/me", (ctx) => {
    const user = requireAuth(ctx);
    return { user: publicUser(user) };
  });

  router.get("/api/auth/demo-users", () => {
    return all("SELECT * FROM users WHERE active = 1 ORDER BY role, name").map(publicUser);
  });

  // --- Пользователи ---
  router.get("/api/users", (ctx) => {
    requireAuth(ctx);
    return all("SELECT * FROM users ORDER BY role, name").map(publicUser);
  });

  router.post("/api/users", (ctx) => {
    requireRole(ctx, "manager");
    const { name, email, role, processing_types = [], telegram_chat_id = null } = ctx.body || {};
    if (!name || !email || !role) {
      const err = new Error("Поля name, email, role обязательны");
      err.status = 400;
      throw err;
    }
    const res = run(
      `INSERT INTO users (yandex_id, name, email, role, processing_types, telegram_chat_id)
       VALUES (:yid, :name, :email, :role, :types, :chat)`,
      {
        yid: `yandex:${email}`,
        name,
        email,
        role,
        types: JSON.stringify(processing_types),
        chat: telegram_chat_id,
      }
    );
    return publicUser(get("SELECT * FROM users WHERE id = :id", { id: res.lastInsertRowid }));
  });

  router.patch("/api/users/:id", (ctx) => {
    requireRole(ctx, "manager");
    const user = get("SELECT * FROM users WHERE id = :id", { id: Number(ctx.params.id) });
    if (!user) {
      const err = new Error("Пользователь не найден");
      err.status = 404;
      throw err;
    }
    const body = ctx.body || {};
    run(
      `UPDATE users SET name = :name, role = :role, processing_types = :types, active = :active WHERE id = :id`,
      {
        id: user.id,
        name: body.name ?? user.name,
        role: body.role ?? user.role,
        types: JSON.stringify(body.processing_types ?? JSON.parse(user.processing_types)),
        active: body.active === undefined ? user.active : body.active ? 1 : 0,
      }
    );
    return publicUser(get("SELECT * FROM users WHERE id = :id", { id: user.id }));
  });

  // --- Шаблоны этапов ---
  router.get("/api/stages", (ctx) => {
    requireAuth(ctx);
    return all("SELECT * FROM stages ORDER BY order_index");
  });

  // --- Проекты ---
  router.get("/api/projects", (ctx) => {
    requireAuth(ctx);
    return all("SELECT * FROM projects ORDER BY id DESC").map(projectSummary);
  });

  router.get("/api/projects/:id", (ctx) => {
    requireAuth(ctx);
    const project = pipeline.projectDetail(Number(ctx.params.id));
    if (!project) {
      const err = new Error("Проект не найден");
      err.status = 404;
      throw err;
    }
    return {
      ...project,
      deadline_state: project.tasks.reduce(
        (acc, t) => (deadlineState(t) === "overdue" ? "overdue" : deadlineState(t) === "soon" ? "soon" : acc),
        "ok"
      ),
      disk: disk.folderTree(project.id),
    };
  });

  router.post("/api/projects", (ctx) => {
    requireRole(ctx, "manager");
    const { client_name, client_email = null, title = "Обработка данных", attachments = [] } = ctx.body || {};
    if (!client_name) {
      const err = new Error("Поле client_name обязательно");
      err.status = 400;
      throw err;
    }
    return pipeline.createProject({ client_name, client_email, title, subject: title, attachments, source: "manual" });
  });

  router.get("/api/projects/:id/disk", (ctx) => {
    requireAuth(ctx);
    return disk.folderTree(Number(ctx.params.id));
  });

  router.post("/api/projects/:id/send-to-client", async (ctx) => {
    const user = requireRole(ctx, "manager");
    const project = pipeline.sendProjectToClient(Number(ctx.params.id), user);
    await queue.drain();
    return project;
  });

  // --- Задачи ---
  router.get("/api/tasks/board", (ctx) => {
    requireRole(ctx, "manager", "observer");
    return pipeline.board();
  });

  router.get("/api/tasks/pool", (ctx) => {
    const user = requireRole(ctx, "executor");
    return pipeline.poolForUser(user).map((t) => ({ ...t, deadline_state: "none" }));
  });

  router.get("/api/tasks/my", (ctx) => {
    const user = requireRole(ctx, "executor");
    return pipeline.myTasks(user.id).map((t) => ({ ...t, deadline_state: deadlineState(t) }));
  });

  router.post("/api/tasks/:id/capture", (ctx) => {
    const user = requireRole(ctx, "executor");
    return pipeline.captureTask(Number(ctx.params.id), user);
  });

  router.post("/api/tasks/:id/release", (ctx) => {
    const user = requireAuth(ctx);
    return pipeline.releaseTask(Number(ctx.params.id), user);
  });

  router.post("/api/tasks/:id/complete", async (ctx) => {
    const user = requireRole(ctx, "executor");
    const task = pipeline.completeTask(Number(ctx.params.id), user);
    await queue.drain();
    return task;
  });

  // --- Уведомления ---
  router.get("/api/notifications", (ctx) => {
    const user = requireAuth(ctx);
    return {
      unread: notify.unreadCount(user.id),
      items: all("SELECT * FROM notifications WHERE user_id = :u ORDER BY id DESC LIMIT 50", { u: user.id }),
    };
  });

  router.post("/api/notifications/read-all", (ctx) => {
    const user = requireAuth(ctx);
    run("UPDATE notifications SET is_read = 1 WHERE user_id = :u", { u: user.id });
    return { unread: 0 };
  });

  router.post("/api/notifications/:id/read", (ctx) => {
    const user = requireAuth(ctx);
    run("UPDATE notifications SET is_read = 1 WHERE id = :id AND user_id = :u", {
      id: Number(ctx.params.id),
      u: user.id,
    });
    return { ok: true };
  });

  // --- Аналитика ---
  router.get("/api/analytics", (ctx) => {
    requireRole(ctx, "manager", "observer");
    const byStatus = all("SELECT status, COUNT(*) AS n FROM tasks GROUP BY status");
    const projectsByStatus = all("SELECT status, COUNT(*) AS n FROM projects GROUP BY status");
    const perStage = all(
      `SELECT s.name AS stage, s.order_index,
              SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
              SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN t.status = 'waiting' THEN 1 ELSE 0 END) AS waiting
         FROM stages s LEFT JOIN tasks t ON t.stage_id = s.id
        GROUP BY s.id ORDER BY s.order_index`
    );
    const overdue = all(
      `SELECT t.*, p.number, s.name AS stage_name FROM tasks t
         JOIN projects p ON p.id = t.project_id JOIN stages s ON s.id = t.stage_id
        WHERE t.status = 'in_progress' AND t.deadline_at IS NOT NULL
          AND datetime(t.deadline_at) < datetime('now')`
    );
    const completed = all(
      "SELECT * FROM tasks WHERE status = 'done' AND taken_at IS NOT NULL AND completed_at IS NOT NULL"
    );
    const avgHours = completed.length
      ? completed.reduce(
          (acc, t) =>
            acc + (new Date(t.completed_at.replace(" ", "T") + "Z") - new Date(t.taken_at.replace(" ", "T") + "Z")) / 36e5,
          0
        ) / completed.length
      : 0;
    return {
      byStatus,
      projectsByStatus,
      perStage,
      overdue,
      avgCompletionHours: Math.round(avgHours * 10) / 10,
      queue: queue.stats(),
    };
  });

  // --- Интеграции (демонстрация и журнал) ---
  router.post("/api/dev/incoming-email", async (ctx) => {
    requireRole(ctx, "manager");
    const overrides = ctx.body || {};
    const email = mail.simulateIncomingOrder(overrides);
    const project = pipeline.createProject({ ...email, storeIncoming: true });
    await queue.drain();
    return { email: { from_addr: email.from_addr, subject: email.subject, attachments: email.attachments }, project };
  });

  router.get("/api/integrations/log", (ctx) => {
    requireAuth(ctx);
    return intlog.recent(Number(ctx.query.limit || 120));
  });

  router.get("/api/integrations/outbox", (ctx) => {
    requireRole(ctx, "manager", "observer");
    return all("SELECT * FROM outbox ORDER BY id DESC LIMIT 50");
  });

  router.get("/api/integrations/inbox", (ctx) => {
    requireRole(ctx, "manager", "observer");
    return all("SELECT * FROM inbox_emails ORDER BY id DESC LIMIT 50");
  });

  router.get("/api/integrations/telegram", (ctx) => {
    requireRole(ctx, "manager", "observer");
    return all(
      `SELECT tg.*, u.name AS user_name FROM telegram_outbox tg LEFT JOIN users u ON u.id = tg.user_id
        ORDER BY tg.id DESC LIMIT 50`
    );
  });

  router.get("/api/integrations/queue", (ctx) => {
    requireRole(ctx, "manager", "observer");
    return queue.stats();
  });

  router.get("/api/audit", (ctx) => {
    requireRole(ctx, "manager");
    return audit.recent(Number(ctx.query.limit || 100));
  });
}

module.exports = { registerRoutes, projectSummary, deadlineState };
