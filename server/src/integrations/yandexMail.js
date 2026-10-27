const { get, run } = require("../db");
const { logIntegration } = require("./log");

/**
 * Мок-адаптер Яндекс.Почты (IMAP/SMTP).
 * Входящие заказы парсятся фоновым воркером, финальные письма отправляются клиенту.
 */

const CLIENTS = [
  { client_name: "ООО «Ромашка»", client_email: "zakaz@romashka.ru" },
  { client_name: "АО «Севергео»", client_email: "geo@severgeo.ru" },
  { client_name: "ООО «ГеоПлан»", client_email: "info@geoplan.ru" },
  { client_name: "ЗАО «Топосъёмка»", client_email: "orders@topo.ru" },
  { client_name: "ООО «СибирьРесурс»", client_email: "sib.res@mail.ru" },
];

const ATTACHMENTS = [
  "syomka_field.dwg",
  "koordinaty.txt",
  "model.obj",
  "otchet_chernoiy.docx",
  "scan_polevoy_zhurnal.pdf",
];

let counter = 0;

/** Имитирует получение и разбор письма «Новый заказ» из Яндекс.Почты. */
function simulateIncomingOrder(overrides = {}) {
  counter += 1;
  const client = CLIENTS[Math.floor(Math.random() * CLIENTS.length)];
  const stamp = Date.now().toString().slice(-6);
  const attachmentCount = 1 + Math.floor(Math.random() * 3);
  const attachments = ATTACHMENTS.slice(0, attachmentCount);
  const email = {
    from_addr: overrides.from_addr || client.client_email,
    subject: overrides.subject || `Новый заказ №${stamp}`,
    body: overrides.body || `Просим выполнить обработку данных. Вложения во письме.`,
    client_name: overrides.client_name || client.client_name,
    client_email: overrides.client_email || client.client_email,
    attachments,
  };
  logIntegration("yandex_mail", "receive", { from: email.from_addr, subject: email.subject, attachments }, "ok");
  return email;
}

/** Сохраняет разобранное письмо в БД. */
function storeIncoming(email, projectId = null, status = "parsed") {
  const res = run(
    `INSERT INTO inbox_emails (from_addr, subject, body, attachments, project_id, status)
     VALUES (:from, :subject, :body, :attachments, :projectId, :status)`,
    {
      from: email.from_addr,
      subject: email.subject,
      body: email.body,
      attachments: JSON.stringify(email.attachments || []),
      projectId,
      status,
    }
  );
  return get("SELECT * FROM inbox_emails WHERE id = :id", { id: res.lastInsertRowid });
}

/**
 * Отправляет клиенту финальное письмо с заключением и ссылками на Яндекс.Диск.
 * Возвращает запись из outbox.
 */
function sendFinalEmail({ to, project, conclusion, links }) {
  const linkList = (links || []).map((l) => `• ${l.name}: ${l.url}`).join("\n");
  const body = [
    `Уважаемые коллеги!`,
    ``,
    `Направляем результаты обработки по проекту ${project.number} — ${project.title}.`,
    ``,
    `Заключение:`,
    conclusion || "Данные обработаны, замечаний нет.",
    ``,
    `Ссылки на файлы (Яндекс.Диск):`,
    linkList || "• файлы во вложении",
    ``,
    `С уважением, служба обработки данных «КОД».`,
  ].join("\n");

  const res = run(
    `INSERT INTO outbox (channel, to_addr, subject, body) VALUES ('mail', :to, :subject, :body)`,
    { to, subject: `[КОД] Результаты по проекту ${project.number}`, body }
  );
  logIntegration("yandex_mail", "send", { to, subject: `Результаты ${project.number}` }, "ok");
  return get("SELECT * FROM outbox WHERE id = :id", { id: res.lastInsertRowid });
}

module.exports = { simulateIncomingOrder, storeIncoming, sendFinalEmail, CLIENTS };
