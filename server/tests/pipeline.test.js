const path = require("node:path");
const fs = require("node:fs");
const test = require("node:test");
const assert = require("node:assert");

// Изолированная БД для тестов.
const testDb = path.join(__dirname, "..", "data", "test.sqlite");
for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  try {
    fs.unlinkSync(testDb + suffix);
  } catch {}
}
process.env.DB_PATH = testDb;
process.env.SIMULATE_INTEGRATION_FAILURES = "0";

const seed = require("../src/seed");
const { get, all } = require("../src/db");
const pipeline = require("../src/services/pipeline");
const queue = require("../src/integrations/queue");

seed.seed({ force: true });

const smirnov = () => get("SELECT * FROM users WHERE email = 'smirnov@kod.ru'");
const kovalev = () => get("SELECT * FROM users WHERE email = 'kovalev@kod.ru'");
const petrova = () => get("SELECT * FROM users WHERE email = 'petrova@kod.ru'");
const kuznetsov = () => get("SELECT * FROM users WHERE email = 'kuznetsov@kod.ru'");

function taskOf(projectId, order) {
  return get(
    `SELECT t.* FROM tasks t JOIN stages s ON s.id = t.stage_id
      WHERE t.project_id = :p AND s.order_index = :o`,
    { p: projectId, o: order }
  );
}

function freshProject(title) {
  return pipeline.createProject({
    subject: title,
    title,
    client_name: "Тестовый клиент",
    client_email: "client@test.ru",
    attachments: ["data.dwg", "coords.txt"],
  });
}

test("инициация проекта: создаёт папки на Диске и задачи конвейера", () => {
  const project = freshProject("Тест инициации");
  const tasks = all("SELECT * FROM tasks WHERE project_id = :p", { p: project.id });
  assert.strictEqual(tasks.length, 5);
  assert.strictEqual(taskOf(project.id, 1).status, "pending");
  assert.strictEqual(taskOf(project.id, 2).status, "waiting");
  assert.ok(project.yandex_folder_id.startsWith("disk:"));
  assert.strictEqual(project.files.length, 2, "вложения загружены в папку этапа 1");
});

test("пул задач фильтруется по типу обработки данных исполнителя", () => {
  const project = freshProject("Тест пула");
  const kovPool = pipeline.poolForUser(kovalev()).map((t) => t.id);
  const kuzPool = pipeline.poolForUser(kuznetsov()).map((t) => t.id);
  const stage1 = taskOf(project.id, 1).id;
  assert.ok(kovPool.includes(stage1), "Ковалёв (Регистрация) видит этап 1");
  assert.ok(!kuzPool.includes(stage1), "Кузнецов (Контроль качества) не видит этап 1");
});

test("захват задачи: второй исполнитель получает отказ", () => {
  const project = freshProject("Тест захвата");
  const stage1 = taskOf(project.id, 1);
  pipeline.captureTask(stage1.id, kovalev());
  assert.strictEqual(get("SELECT status FROM tasks WHERE id = :id", { id: stage1.id }).status, "in_progress");
  assert.strictEqual(get("SELECT executor_id FROM tasks WHERE id = :id", { id: stage1.id }).executor_id, kovalev().id);
  assert.throws(() => pipeline.captureTask(stage1.id, petrova()), /не доступна/);
});

test("исполнитель без нужного навыка не может взять этап", () => {
  const project = freshProject("Тест навыка");
  const stage1 = taskOf(project.id, 1);
  assert.throws(() => pipeline.captureTask(stage1.id, kuznetsov()), /требуется тип обработки/);
});

test("завершение этапа активирует следующий и уведомляет исполнителей", () => {
  const project = freshProject("Тест конвейера");
  pipeline.captureTask(taskOf(project.id, 1).id, kovalev());
  pipeline.completeTask(taskOf(project.id, 1).id, kovalev());

  assert.strictEqual(taskOf(project.id, 1).status, "done");
  assert.strictEqual(taskOf(project.id, 2).status, "pending", "этап 2 перешёл в пул");

  const note = get(
    `SELECT * FROM notifications WHERE user_id = :u AND kind = 'new_task' AND text LIKE '%Тест конвейера%'
      ORDER BY id DESC`,
    { u: petrova().id }
  );
  assert.ok(note, "Петрова получила уведомление о новом этапе");
});

test("отправка клиенту недоступна, пока не завершены все этапы", () => {
  const project = freshProject("Тест финализации-раньше");
  assert.throws(() => pipeline.sendProjectToClient(project.id, smirnov()), /Не все этапы завершены/);
});

test("полный проход конвейера и отправка результата клиенту", async () => {
  const project = freshProject("Тест финализации");
  const executors = {
    1: kovalev(),
    2: petrova(),
    3: get("SELECT * FROM users WHERE email = 'ivanov@kod.ru'"),
    4: kuznetsov(),
    5: get("SELECT * FROM users WHERE email = 'sokolova@kod.ru'"),
  };
  for (let order = 1; order <= 5; order++) {
    const task = taskOf(project.id, order);
    pipeline.captureTask(task.id, executors[order]);
    pipeline.completeTask(task.id, executors[order]);
  }
  const done = pipeline.sendProjectToClient(project.id, smirnov());
  assert.strictEqual(done.status, "done");

  await queue.drain();
  const mail = get("SELECT * FROM outbox WHERE channel = 'mail' AND body LIKE '%Тест финализации%'");
  assert.ok(mail, "клиенту отправлено письмо");
  assert.strictEqual(mail.to_addr, "client@test.ru");
});

test("руководитель может снять захват (вернуть задачу в пул)", () => {
  const project = freshProject("Тест снятия захвата");
  const stage1 = taskOf(project.id, 1);
  pipeline.captureTask(stage1.id, kovalev());
  pipeline.releaseTask(stage1.id, smirnov());
  const after = get("SELECT * FROM tasks WHERE id = :id", { id: stage1.id });
  assert.strictEqual(after.status, "pending");
  assert.strictEqual(after.executor_id, null);
});

test("очередь ретраит недоступные интеграции с повторными попытками", async () => {
  const before = get("SELECT COUNT(*) AS n FROM integration_log").n;
  const id = queue.enqueue("nonexistent.handler", { any: true });
  await queue.drain();
  const job = get("SELECT * FROM queue_jobs WHERE id = :id", { id });
  assert.ok(job.attempts >= 1, "попытки зафиксированы");
  assert.strictEqual(job.status, "failed", "после исчерпания попыток — failed");
  assert.ok(get("SELECT COUNT(*) AS n FROM integration_log").n > before);
});
