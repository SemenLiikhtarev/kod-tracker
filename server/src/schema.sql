-- Схема БД «КОД» (совместима с PostgreSQL, здесь выполняется в SQLite через node:sqlite)

CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  yandex_id         TEXT    NOT NULL UNIQUE,
  name              TEXT    NOT NULL,
  email             TEXT    NOT NULL UNIQUE,
  role              TEXT    NOT NULL CHECK (role IN ('manager', 'executor', 'observer')),
  processing_types  TEXT    NOT NULL DEFAULT '[]',   -- JSON-массив навыков (типов обработки данных)
  avatar_color      TEXT    NOT NULL DEFAULT '#005EB8',
  telegram_chat_id  TEXT,
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stages (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  name                      TEXT    NOT NULL,
  order_index               INTEGER NOT NULL,
  default_deadline_hours    INTEGER NOT NULL DEFAULT 24,
  required_processing_type  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  number            TEXT    NOT NULL UNIQUE,
  title             TEXT    NOT NULL,
  client_name       TEXT    NOT NULL,
  client_email      TEXT,
  yandex_folder_id  TEXT    NOT NULL,
  disk_path         TEXT    NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done')),
  source            TEXT    NOT NULL DEFAULT 'email',   -- email | manual
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  final_deadline    TEXT,
  sent_at           TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_id      INTEGER NOT NULL REFERENCES stages(id),
  status        TEXT    NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting', 'pending', 'in_progress', 'done')),
  executor_id   INTEGER REFERENCES users(id),
  taken_at      TEXT,
  deadline_at   TEXT,
  completed_at  TEXT,
  deadline_warned   INTEGER NOT NULL DEFAULT 0,
  overdue_notified  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, stage_id)
);

CREATE TABLE IF NOT EXISTS logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id),
  task_id    INTEGER REFERENCES tasks(id),
  action     TEXT    NOT NULL,
  details    TEXT,
  timestamp  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  text        TEXT    NOT NULL,
  kind        TEXT    NOT NULL DEFAULT 'info',   -- info | new_task | captured | warning | overdue | done
  channel     TEXT    NOT NULL DEFAULT 'ui',     -- ui | telegram | email
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Виртуальная файловая система Яндекс.Диска (в реальной системе файлы лежат на Диске)
CREATE TABLE IF NOT EXISTS disk_files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_id    INTEGER REFERENCES stages(id),
  path        TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  public_url  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integration_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  service     TEXT NOT NULL,   -- yandex_disk | yandex_mail | telegram | queue
  operation   TEXT NOT NULL,
  payload     TEXT,
  status      TEXT NOT NULL DEFAULT 'ok',  -- ok | error | retry
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  channel     TEXT NOT NULL,   -- mail | telegram
  to_addr     TEXT,
  subject     TEXT,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Входящие письма, разобранные парсером Яндекс.Почты (мок IMAP-воркера)
CREATE TABLE IF NOT EXISTS inbox_emails (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  from_addr       TEXT,
  subject         TEXT,
  body            TEXT,
  attachments     TEXT    NOT NULL DEFAULT '[]',   -- JSON-массив имён вложений
  project_id      INTEGER REFERENCES projects(id),
  status          TEXT    NOT NULL DEFAULT 'parsed',  -- parsed | processed | rejected
  received_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Исходящие сообщения Telegram-бота (мок Bot API)
CREATE TABLE IF NOT EXISTS telegram_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id     TEXT,
  user_id     INTEGER REFERENCES users(id),
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS queue_jobs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  payload      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued',  -- queued | running | done | failed
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_executor ON tasks(executor_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_logs_task ON logs(task_id);
