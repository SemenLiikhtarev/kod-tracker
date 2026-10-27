const { randomUUID } = require("node:crypto");

function sendJson(res, status, data) {
  const body = JSON.stringify(data ?? null);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 5_000_000) reject(new Error("Слишком большой запрос"));
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(Object.assign(new Error("Некорректный JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

/** Публичное представление пользователя (processing_types — массив, без секретов). */
function publicUser(u) {
  if (!u) return null;
  let types = [];
  try {
    types = JSON.parse(u.processing_types || "[]");
  } catch {}
  return {
    id: u.id,
    yandex_id: u.yandex_id,
    name: u.name,
    email: u.email,
    role: u.role,
    processing_types: types,
    avatar_color: u.avatar_color,
  };
}

function uid() {
  return randomUUID();
}

/** Мини-роутер: поддерживает параметры вида /api/tasks/:id/capture. */
function createRouter() {
  const routes = [];
  const add = (method) => (path, handler) => routes.push({ method, path, handler, parts: path.split("/").filter(Boolean) });

  return {
    get: add("GET"),
    post: add("POST"),
    patch: add("PATCH"),
    delete: add("DELETE"),
    routes,
    match(method, pathname) {
      const parts = pathname.split("/").filter(Boolean);
      for (const route of routes) {
        if (route.method !== method) continue;
        if (route.parts.length !== parts.length) continue;
        const params = {};
        let ok = true;
        for (let i = 0; i < route.parts.length; i++) {
          const rp = route.parts[i];
          if (rp.startsWith(":")) params[rp.slice(1)] = decodeURIComponent(parts[i]);
          else if (rp !== parts[i]) {
            ok = false;
            break;
          }
        }
        if (ok) return { handler: route.handler, params };
      }
      return null;
    },
  };
}

module.exports = { sendJson, readBody, publicUser, uid, createRouter };
