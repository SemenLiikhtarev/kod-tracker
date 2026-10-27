# Запускает backend (порт 8000) и Vite dev-сервер (порт 5173) параллельно.
const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";

const children = [];

function run(name, command, args, cwd, color) {
  const child = spawn(command, args, { cwd, shell: isWin, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => process.stdout.write(`${color}[${name}]${"\u001b[0m"} ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`${color}[${name}]${"\u001b[0m"} ${d}`));
  child.on("exit", (code) => {
    process.stdout.write(`${color}[${name}]${"\u001b[0m"} завершился с кодом ${code}\n`);
    shutdown();
  });
  children.push(child);
  return child;
}

function shutdown() {
  for (const c of children) {
    if (!c.killed) {
      try {
        c.kill();
      } catch {}
    }
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

console.log("\u001b[36mЗапуск КОД: API на http://localhost:8000, UI на http://localhost:5173\u001b[0m");
run("api", process.execPath, [path.join(root, "server", "src", "index.js")], root, "\u001b[34m");
run("web", npm, ["run", "dev"], path.join(root, "web"), "\u001b[35m");
