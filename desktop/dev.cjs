const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";
const yarn = isWindows ? "yarn.cmd" : "yarn";
const url = "http://127.0.0.1:3000";
const vite = spawn(
  yarn,
  ["--cwd", "./excalidraw-app", "vite", "--mode", "desktop", "--host", "127.0.0.1", "--strictPort"],
  {
    cwd: root,
    stdio: "inherit",
    shell: isWindows,
    env: { ...process.env, BROWSER: "none" },
  },
);

let electron;
let shuttingDown = false;

const shutdown = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  vite.kill();
  if (electron && !electron.killed) electron.kill();
  process.exitCode = code;
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
vite.on("exit", (code) => {
  if (!shuttingDown) shutdown(code || 1);
});
vite.on("error", (error) => {
  console.error("Could not start the desktop development server:", error);
  shutdown(1);
});

const startElectron = async () => {
  const startedAt = Date.now();
  while (!shuttingDown) {
    try {
      const response = await fetch(url);
      if (response.ok) break;
    } catch {}
    if (Date.now() - startedAt > 120_000) {
      console.error("Timed out waiting for Vite on port 3000");
      shutdown(1);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (shuttingDown) return;
  const electronCli = require.resolve("electron/cli.js", { paths: [root] });
  electron = spawn(process.execPath, [electronCli, path.join(__dirname, "main.cjs")], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, EXCALIDRAW_DESKTOP_DEV_URL: url },
  });
  electron.on("exit", (code) => shutdown(code || 0));
  electron.on("error", (error) => {
    console.error("Could not start Electron:", error);
    shutdown(1);
  });
};

void startElectron();
