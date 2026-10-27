const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const config = require("./config");
const { createRouter, sendJson, readBody } = require("./util");
const { userFromRequest } = require("./auth");
const { registerRoutes } = require("./routes");
const seed = require("./seed");
const queue = require("./integrations/queue");
const deadlines = require("./services/deadlines");

const router = createRouter();
registerRoutes(router);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

const INFO_DIR = path.join(__dirname, "..", "..", "info");

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return false;
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(data);
    return true;
  });
  return true;
}

function serveStatic(pathname, res) {
  // Логотип из ТЗ (info/logo_tracker_data.png)
  if (pathname === "/logo.png" || pathname === "/favicon.ico") {
    return serveFile(res, path.join(INFO_DIR, "logo_tracker_data.png"));
  }
  if (!fs.existsSync(config.webDist)) return false;

  const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(config.webDist, safe);
  if (!filePath.startsWith(config.webDist)) return false;

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return serveFile(res, filePath);
  // SPA-фолбэк: любой не-API маршрут отдаёт index.html
  return serveFile(res, path.join(config.webDist, "index.html"));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    });
    return res.end();
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  if (!pathname.startsWith("/api/")) {
    if (serveStatic(pathname, res)) return;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(
      "<h1>КОД — Конвейер Обработки Данных</h1><p>API работает. Соберите фронтенд (npm run build) или запустите <code>npm run dev</code> для UI на порту 5173.</p>"
    );
  }

  const match = router.match(req.method, pathname);
  if (!match) return sendJson(res, 404, { error: "Маршрут не найден", path: pathname });

  const ctx = {
    req,
    res,
    params: match.params,
    query: Object.fromEntries(url.searchParams.entries()),
    body: {},
    user: userFromRequest(req),
  };

  try {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
      ctx.body = await readBody(req);
    }
    const result = await match.handler(ctx);
    if (!res.writableEnded) sendJson(res, 200, result ?? { ok: true });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[api]", err);
    if (!res.writableEnded) sendJson(res, status, { error: err.message || "Внутренняя ошибка" });
  }
});

seed.seed();
queue.startWorker();
deadlines.startMonitor();

server.listen(config.port, config.host, () => {
  console.log(`КОД API: http://${config.host}:${config.port}`);
  console.log(`БД: ${config.dbPath}`);
});
