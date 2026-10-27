const crypto = require("node:crypto");
const config = require("./config");
const { get } = require("./db");

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

/** Подписывает токен (мок-эмуляция OAuth-токена Яндекс ID). */
function signToken(user) {
  const payload = { uid: user.id, role: user.role, exp: Date.now() + config.tokenTtlHours * 36e5 };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", config.secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", config.secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Извлекает пользователя из заголовка Authorization. */
function userFromRequest(req) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return get("SELECT * FROM users WHERE id = :id AND active = 1", { id: payload.uid }) || null;
}

module.exports = { signToken, verifyToken, userFromRequest };
