const path = require("node:path");
const crypto = require("node:crypto");
const { all, get, run } = require("../db");
const { logIntegration } = require("./log");

/**
 * Мок-адаптер Яндекс.Диска (REST/WebDAV).
 * Файлы физически не хранятся — ведётся виртуальное дерево в таблице disk_files.
 * В продакшене методы заменяются на реальные вызовы Disc REST API.
 */

function stageNameById(stageId) {
  const s = get("SELECT name, order_index FROM stages WHERE id = :id", { id: stageId });
  return s ? `Этап ${s.order_index}. ${s.name}` : "Без этапа";
}

/** Создаёт древовидную структуру папок проекта: КОД / [Номер]_[Клиент] / Этап N. */
function createProjectStructure(project) {
  const base = `КОД / ${project.number}_${project.client_name}`;
  const folderId = `disk:${crypto.randomUUID()}`;
  const stages = all("SELECT * FROM stages ORDER BY order_index");
  const folders = stages.map((s) => `${base} / Этап ${s.order_index}. ${s.name}`);
  logIntegration("yandex_disk", "createProjectStructure", { folderId, base, folders }, "ok");
  return { folderId, base, folders };
}

/** Загружает файл в папку указанного этапа. */
function addFile(projectId, stageId, name, sizeBytes = 0) {
  const project = get("SELECT disk_path, number, client_name FROM projects WHERE id = :id", { id: projectId });
  if (!project) throw new Error("Проект не найден");
  const pathStr = `${project.disk_path} / ${stageNameById(stageId)} / ${name}`;
  const publicUrl = `https://disk.yandex.ru/d/${crypto.randomBytes(8).toString("hex")}/${encodeURIComponent(name)}`;
  const res = run(
    `INSERT INTO disk_files (project_id, stage_id, path, name, size_bytes, public_url)
     VALUES (:projectId, :stageId, :path, :name, :size, :url)`,
    { projectId, stageId, path: pathStr, name, size: sizeBytes, url: publicUrl }
  );
  logIntegration("yandex_disk", "upload", { path: pathStr, sizeBytes }, "ok");
  return get("SELECT * FROM disk_files WHERE id = :id", { id: res.lastInsertRowid });
}

function listFiles(projectId, stageId = null) {
  if (stageId == null) {
    return all("SELECT * FROM disk_files WHERE project_id = :p ORDER BY id", { p: projectId });
  }
  return all("SELECT * FROM disk_files WHERE project_id = :p AND stage_id = :s ORDER BY id", {
    p: projectId,
    s: stageId,
  });
}

/** Перемещает все файлы этапа в следующий этап (вызывается при завершении этапа). */
function moveStageFiles(projectId, fromStageId, toStageId) {
  const files = listFiles(projectId, fromStageId);
  for (const f of files) {
    const newPath = `${f.path.split(" / ").slice(0, -2).join(" / ")} / ${stageNameById(toStageId)} / ${f.name}`;
    run("UPDATE disk_files SET stage_id = :to, path = :path WHERE id = :id", {
      to: toStageId,
      path: newPath,
      id: f.id,
    });
  }
  logIntegration("yandex_disk", "moveStageFiles", { projectId, fromStageId, toStageId, count: files.length }, "ok");
  return files.length;
}

/** Генерирует/возвращает публичные ссылки на скачивание файлов. */
function getDownloadLinks(files) {
  const links = files.map((f) => ({ name: f.name, url: f.public_url }));
  logIntegration("yandex_disk", "getDownloadLinks", { count: links.length }, "ok");
  return links;
}

function folderTree(projectId) {
  const stageRows = all("SELECT * FROM stages ORDER BY order_index");
  return stageRows.map((s) => ({
    stage: s.name,
    order: s.order_index,
    path: `${get("SELECT disk_path FROM projects WHERE id = :id", { id: projectId })?.disk_path} / ${stageNameById(s.id)}`,
    files: listFiles(projectId, s.id),
  }));
}

module.exports = { createProjectStructure, addFile, listFiles, moveStageFiles, getDownloadLinks, folderTree, stageNameById };
