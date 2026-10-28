// Собирает фронтенд и запускает backend, который отдаёт и API, и готовый UI (порт 8000).
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";

console.log("Сборка фронтенда...");
const build = spawnSync(npm, ["run", "build"], { cwd: path.join(root, "web"), stdio: "inherit", shell: isWin });
if (build.status !== 0) {
  console.error("Сборка фронтенда завершилась с ошибкой.");
  process.exit(build.status ?? 1);
}

console.log("Запуск сервера на http://localhost:8000 ...");
const server = spawnSync(process.execPath, [path.join(root, "server", "src", "index.js")], {
  cwd: root,
  stdio: "inherit",
});
process.exit(server.status ?? 0);
