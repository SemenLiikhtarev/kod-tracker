const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const config = require("./config");

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new DatabaseSync(config.dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
db.exec(schema);

/** Выполняет функцию внутри транзакции. При ошибке — откат. */
function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw err;
  }
}

function all(sql, params = {}) {
  return db.prepare(sql).all(params);
}

function get(sql, params = {}) {
  return db.prepare(sql).get(params);
}

function run(sql, params = {}) {
  return db.prepare(sql).run(params);
}

const isSeeded = get("SELECT COUNT(*) AS n FROM stages").n > 0;

module.exports = { db, transaction, all, get, run, isSeeded };
