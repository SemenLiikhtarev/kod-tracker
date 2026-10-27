const { get, run } = require("../db");
const { logIntegration } = require("./log");

/**
 * Мок-адаптер Telegram Bot API.
 * Отправка сообщений исполнителям дублируется в таблицу telegram_outbox (видно в UI).
 */
function sendMessage(userId, text) {
  const user = get("SELECT id, name, telegram_chat_id, email FROM users WHERE id = :id", { id: userId });
  if (!user) return null;
  const res = run(
    "INSERT INTO telegram_outbox (chat_id, user_id, text) VALUES (:chat, :user, :text)",
    { chat: user.telegram_chat_id || `chat-${user.id}`, user: user.id, text }
  );
  logIntegration("telegram", "sendMessage", { to: user.name, text }, "ok");
  return get("SELECT * FROM telegram_outbox WHERE id = :id", { id: res.lastInsertRowid });
}

module.exports = { sendMessage };
