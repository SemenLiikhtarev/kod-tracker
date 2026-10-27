const { all, run, get } = require("../db");

/** Пишет запись в журнал активности внешних интеграций (для UI-вкладки «Интеграции»). */
function logIntegration(service, operation, payload, status = "ok") {
  run(
    "INSERT INTO integration_log (service, operation, payload, status) VALUES (:service, :operation, :payload, :status)",
    {
      service,
      operation,
      payload: payload == null ? null : typeof payload === "string" ? payload : JSON.stringify(payload),
      status,
    }
  );
}

function recent(limit = 100) {
  return all("SELECT * FROM integration_log ORDER BY id DESC LIMIT :limit", { limit });
}

function count() {
  return get("SELECT COUNT(*) AS n FROM integration_log").n;
}

module.exports = { logIntegration, recent, count };
