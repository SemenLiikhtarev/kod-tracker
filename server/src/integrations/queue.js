const crypto = require("node:crypto");
const { all, get, run } = require("../db");
const { logIntegration } = require("./log");

/**
 * Очередь задач (аналог Celery/RabbitMQ) с ретраями для отказоустойчивости
 * операций с Яндекс.Диском и Почтой. Задания сохраняются в БД (queue_jobs),
 * поэтому переживают перезапуск процесса.
 */
const handlers = new Map();
let processing = false;

function registerHandler(name, fn) {
  handlers.set(name, fn);
}

function enqueue(name, payload) {
  const res = run(
    "INSERT INTO queue_jobs (name, payload) VALUES (:name, :payload)",
    { name, payload: JSON.stringify(payload ?? {}) }
  );
  logIntegration("queue", `enqueue:${name}`, payload, "ok");
  return res.lastInsertRowid;
}

function pendingCount() {
  return get("SELECT COUNT(*) AS n FROM queue_jobs WHERE status IN ('queued','running')").n;
}

async function processOnce() {
  const job = get("SELECT * FROM queue_jobs WHERE status = 'queued' ORDER BY id LIMIT 1");
  if (!job) return false;

  run("UPDATE queue_jobs SET status = 'running', updated_at = datetime('now') WHERE id = :id", { id: job.id });
  const handler = handlers.get(job.name);
  const payload = JSON.parse(job.payload || "{}");

  try {
    if (!handler) throw new Error(`Нет обработчика для задания «${job.name}»`);
    await handler(payload);
    run("UPDATE queue_jobs SET status = 'done', updated_at = datetime('now') WHERE id = :id", { id: job.id });
    logIntegration("queue", `done:${job.name}`, payload, "ok");
  } catch (err) {
    const attempts = job.attempts + 1;
    const failed = attempts >= job.max_attempts;
    run(
      `UPDATE queue_jobs
         SET attempts = :attempts, status = :status, last_error = :err, updated_at = datetime('now')
       WHERE id = :id`,
      { attempts, status: failed ? "failed" : "queued", err: String(err.message || err), id: job.id }
    );
    logIntegration("queue", `${failed ? "failed" : "retry"}:${job.name}`, { attempts, error: String(err.message || err) }, failed ? "error" : "retry");
  }
  return true;
}

async function drain() {
  if (processing) return;
  processing = true;
  try {
    // Ограничиваем работу за один проход, чтобы не блокировать цикл.
    for (let i = 0; i < 25; i++) {
      const did = await processOnce();
      if (!did) break;
    }
  } finally {
    processing = false;
  }
}

/** Запускает фоновый воркер очереди. */
function startWorker(intervalMs = 1500) {
  setInterval(() => {
    if (pendingCount() === 0) return;
    drain().catch(() => {});
  }, intervalMs);
}

function stats() {
  return {
    queued: get("SELECT COUNT(*) AS n FROM queue_jobs WHERE status = 'queued'").n,
    running: get("SELECT COUNT(*) AS n FROM queue_jobs WHERE status = 'running'").n,
    done: get("SELECT COUNT(*) AS n FROM queue_jobs WHERE status = 'done'").n,
    failed: get("SELECT COUNT(*) AS n FROM queue_jobs WHERE status = 'failed'").n,
    jobs: all("SELECT * FROM queue_jobs ORDER BY id DESC LIMIT 50"),
  };
}

module.exports = { registerHandler, enqueue, processOnce, drain, startWorker, stats, pendingCount };
