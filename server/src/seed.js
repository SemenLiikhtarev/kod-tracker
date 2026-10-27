const { db, get, run, transaction } = require("./db");
const pipeline = require("./services/pipeline");
const notify = require("./services/notifications");

const STAGES = [
  { name: "Приём и регистрация данных", order_index: 1, default_deadline_hours: 24, required_processing_type: "Регистрация" },
  { name: "Первичная обработка", order_index: 2, default_deadline_hours: 48, required_processing_type: "Обработка данных" },
  { name: "Анализ и расчёты", order_index: 3, default_deadline_hours: 40, required_processing_type: "Аналитика" },
  { name: "Контроль качества", order_index: 4, default_deadline_hours: 24, required_processing_type: "Контроль качества" },
  { name: "Формирование заключения", order_index: 5, default_deadline_hours: 24, required_processing_type: "Формирование заключения" },
];

const USERS = [
  { name: "Смирнов Алексей", email: "smirnov@kod.ru", role: "manager", types: ["Регистрация", "Обработка данных", "Аналитика", "Контроль качества", "Формирование заключения"], color: "#1E3A8A" },
  { name: "Ковалёв Дмитрий", email: "kovalev@kod.ru", role: "executor", types: ["Регистрация", "Обработка данных"], color: "#005EB8" },
  { name: "Петрова Анна", email: "petrova@kod.ru", role: "executor", types: ["Обработка данных"], color: "#0D9488" },
  { name: "Иванов Сергей", email: "ivanov@kod.ru", role: "executor", types: ["Обработка данных", "Аналитика"], color: "#7C3AED" },
  { name: "Соколова Мария", email: "sokolova@kod.ru", role: "executor", types: ["Аналитика", "Формирование заключения"], color: "#C2410C" },
  { name: "Кузнецов Игорь", email: "kuznetsov@kod.ru", role: "executor", types: ["Контроль качества"], color: "#B91C1C" },
  { name: "Орлова Елена", email: "orlova@kod.ru", role: "observer", types: [], color: "#6C757D" },
];

function reset() {
  transaction(() => {
    for (const t of [
      "logs",
      "notifications",
      "disk_files",
      "integration_log",
      "outbox",
      "inbox_emails",
      "telegram_outbox",
      "queue_jobs",
      "tasks",
      "projects",
    ]) {
      db.exec(`DELETE FROM ${t}`);
    }
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('projects','tasks','logs','notifications','disk_files','integration_log','outbox','inbox_emails','telegram_outbox','queue_jobs')");
  });
}

function seedStages() {
  if (get("SELECT COUNT(*) AS n FROM stages").n > 0) return;
  transaction(() => {
    for (const s of STAGES) {
      run(
        `INSERT INTO stages (name, order_index, default_deadline_hours, required_processing_type)
         VALUES (:name, :order_index, :default_deadline_hours, :required_processing_type)`,
        s
      );
    }
  });
}

function seedUsers() {
  if (get("SELECT COUNT(*) AS n FROM users").n > 0) return;
  transaction(() => {
    for (const u of USERS) {
      run(
        `INSERT INTO users (yandex_id, name, email, role, processing_types, avatar_color, telegram_chat_id)
         VALUES (:yid, :name, :email, :role, :types, :color, :chat)`,
        {
          yid: `yandex:${u.email}`,
          name: u.name,
          email: u.email,
          role: u.role,
          types: JSON.stringify(u.types),
          color: u.color,
          chat: `chat-${u.email.split("@")[0]}`,
        }
      );
    }
  });
}

function userByEmail(email) {
  return get("SELECT * FROM users WHERE email = :email", { email });
}

function taskFor(projectId, order) {
  return get(
    `SELECT t.* FROM tasks t JOIN stages s ON s.id = t.stage_id
      WHERE t.project_id = :p AND s.order_index = :o`,
    { p: projectId, o: order }
  );
}

/** Прогоняет этапы проекта до указанного order (включительно), завершая каждый. */
function advanceThrough(projectId, upToOrder) {
  for (let order = 1; order <= upToOrder; order++) {
    const task = taskFor(projectId, order);
    if (!task || task.status === "done") continue;
    const stage = get("SELECT * FROM stages WHERE id = :id", { id: task.stage_id });
    let executor = notify.executorsByProcessingType(stage.required_processing_type)[0];
    if (!executor) executor = userByEmail("kovalev@kod.ru");
    pipeline.captureTask(task.id, executor);
    pipeline.completeTask(task.id, executor);
  }
}

function seedDemoProjects() {
  if (get("SELECT COUNT(*) AS n FROM projects").n > 0) return;

  // A) Свежий проект — этап 1 в пуле.
  pipeline.createProject({
    subject: "Новый заказ №401",
    title: "Съёмка участка 42-Б",
    client_name: "ООО «Ромашка»",
    client_email: "zakaz@romashka.ru",
    attachments: ["syomka_field.dwg", "koordinaty.txt"],
  });

  // B) Проект в середине конвейера — этап 2 в работе.
  const b = pipeline.createProject({
    subject: "Новый заказ №402",
    title: "Топоплан квартала Северный",
    client_name: "АО «Севергео»",
    client_email: "geo@severgeo.ru",
    attachments: ["model.obj", "otchet_chernoiy.docx", "scan_polevoy_zhurnal.pdf"],
  });
  advanceThrough(b.id, 1);
  const bTask2 = taskFor(b.id, 2);
  const petrova = userByEmail("petrova@kod.ru");
  pipeline.captureTask(bTask2.id, petrova);

  // C) Проект со всеми завершёнными этапами — ждёт финализации.
  const c = pipeline.createProject({
    subject: "Новый заказ №403",
    title: "Модель рельефа участка 12",
    client_name: "ООО «ГеоПлан»",
    client_email: "info@geoplan.ru",
    attachments: ["model.obj"],
  });
  advanceThrough(c.id, 5);

  // D) Проект с просроченным дедлайном на этапе 1.
  const d = pipeline.createProject({
    subject: "Новый заказ №404",
    title: "Проверка координат выноса",
    client_name: "ЗАО «Топосъёмка»",
    client_email: "orders@topo.ru",
    attachments: ["koordinaty.txt", "scan_polevoy_zhurnal.pdf"],
  });
  const dTask1 = taskFor(d.id, 1);
  pipeline.captureTask(dTask1.id, userByEmail("kovalev@kod.ru"));
  run("UPDATE tasks SET deadline_at = datetime('now', '-3 hours') WHERE id = :id", { id: dTask1.id });

  // E) Проект, прошедший конвейер и уже отправленный клиенту.
  const e = pipeline.createProject({
    subject: "Новый заказ №400",
    title: "Обработка данных промплощадки",
    client_name: "ООО «СибирьРесурс»",
    client_email: "sib.res@mail.ru",
    attachments: ["otchet_chernoiy.docx"],
  });
  advanceThrough(e.id, 5);
  pipeline.sendProjectToClient(e.id, userByEmail("smirnov@kod.ru"));
}

function seed({ force = false } = {}) {
  seedStages();
  seedUsers();
  if (force) reset();
  seedDemoProjects();
  return {
    stages: get("SELECT COUNT(*) AS n FROM stages").n,
    users: get("SELECT COUNT(*) AS n FROM users").n,
    projects: get("SELECT COUNT(*) AS n FROM projects").n,
  };
}

module.exports = { seed, reset };

if (require.main === module) {
  const force = process.argv.includes("--reset");
  if (force) {
    seedStages();
    seedUsers();
    reset();
  }
  const result = seed({ force: false });
  console.log("Сидирование выполнено:", result);
}
