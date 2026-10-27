const path = require("node:path");

const config = {
  port: Number(process.env.PORT || 8000),
  host: process.env.HOST || "127.0.0.1",
  dbPath: process.env.DB_PATH || path.join(__dirname, "..", "data", "kod.sqlite"),
  secret: process.env.KOD_SECRET || "kod-dev-secret-change-me",
  tokenTtlHours: 12,
  // Порог предупреждения о дедлайне (часы): жёлтая индикация.
  deadlineWarningHours: Number(process.env.DEADLINE_WARNING_HOURS || 4),
  // Порог уведомления «дедлайн горит» (часы), по ТЗ — менее 2 часов.
  deadlineAlertHours: Number(process.env.DEADLINE_ALERT_HOURS || 2),
  // Имитация нестабильности интеграций Яндекс (для демонстрации ретраев очереди).
  simulateIntegrationFailures: process.env.SIMULATE_INTEGRATION_FAILURES === "1",
  webDist: path.join(__dirname, "..", "..", "web", "dist"),
};

module.exports = config;
