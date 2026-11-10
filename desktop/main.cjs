const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { constants: fsConstants } = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const APP_FOLDER = "Excalidraw Drawings";
const INDEX_FILE = ".excalidraw-library.json";
const ID_PATTERN = /^[0-9a-f-]{36}$/i;
let libraryFolder;
const closeContexts = new WeakMap();
const drawingSaveQueues = new Map();

const getSettingsPath = () => path.join(app.getPath("userData"), "settings.json");

const getLibraryFolder = async () => {
  if (libraryFolder) return libraryFolder;
  try {
    const settings = JSON.parse(await fs.readFile(getSettingsPath(), "utf8"));
    if (typeof settings.libraryFolder === "string") {
      libraryFolder = settings.libraryFolder;
    }
  } catch {}
  libraryFolder ||= path.join(app.getPath("documents"), APP_FOLDER);
  await fs.mkdir(libraryFolder, { recursive: true });
  return libraryFolder;
};

const filePathFor = async (id) => {
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new Error("Invalid drawing id");
  }
  const folder = await getLibraryFolder();
  const index = await readIndex();
  const indexedName = index[id]?.fileName;
  if (typeof indexedName === "string" && path.basename(indexedName) === indexedName) {
    const indexedPath = path.join(folder, indexedName);
    try {
      await fs.access(indexedPath);
      return indexedPath;
    } catch {}
  }
  try {
    const names = await fs.readdir(folder);
    const existing = names.find(
      (name) =>
        name === `${id}.excalidraw` ||
        name.endsWith(`--${id}.excalidraw`),
    );
    if (existing) return path.join(folder, existing);
  } catch {}
  return path.join(folder, `${id}.excalidraw`);
};

const filenameFor = (id, name) => {
  let safeName = String(name || "Untitled drawing")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80)
    .replace(/[. ]+$/g, "") || "Untitled drawing";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safeName)) {
    safeName = `_${safeName}`;
  }
  return `${safeName}--${id}.excalidraw`;
};

const idFromFilename = (name) => {
  const match = name.match(/(?:^|--)([0-9a-f-]{36})\.excalidraw$/i);
  return match?.[1] || null;
};

const getSearchText = (data) => {
  const texts = Array.isArray(data?.elements)
    ? data.elements
        .filter((element) => !element?.isDeleted)
        .map((element) => element?.text || "")
        .filter(Boolean)
    : [];
  return texts.join(" ").slice(0, 100_000);
};

const readIndex = async () => {
  try {
    const index = JSON.parse(
      await fs.readFile(path.join(await getLibraryFolder(), INDEX_FILE), "utf8"),
    );
    return index && typeof index === "object" ? index : {};
  } catch {
    return {};
  }
};

const writeIndex = async (index) => {
  const folder = await getLibraryFolder();
  const indexPath = path.join(folder, INDEX_FILE);
  const tempPath = `${indexPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(index), "utf8");
  await fs.rename(tempPath, indexPath);
};

const listDrawings = async () => {
  const folder = await getLibraryFolder();
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const index = await readIndex();
  let indexChanged = false;
  const drawings = [];
  const foundIds = new Set();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".excalidraw")) continue;
    const id =
      idFromFilename(entry.name) ||
      Object.values(index).find((item) => item.fileName === entry.name)?.id ||
      crypto.randomUUID();
    if (!ID_PATTERN.test(id)) continue;
    foundIds.add(id);
    const filePath = path.join(folder, entry.name);
    try {
      const stat = await fs.stat(filePath);
      let item = index[id];
      if (!item || item.updatedAt !== stat.mtimeMs) {
        const data = JSON.parse(await fs.readFile(filePath, "utf8"));
        item = {
          id,
          name:
            data?.appState?.name ||
            entry.name.replace(/(?:--[0-9a-f-]{36})?\.excalidraw$/i, "") ||
            "Untitled drawing",
          updatedAt: stat.mtimeMs,
          searchText: getSearchText(data),
          fileName: entry.name,
        };
        index[id] = item;
        indexChanged = true;
      }
      drawings.push(item);
    } catch {
      index[id] = {
        id,
        name: entry.name,
        updatedAt: 0,
        searchText: "",
        fileName: entry.name,
      };
      indexChanged = true;
      drawings.push({
        id,
        name: entry.name,
        updatedAt: 0,
        searchText: "",
        unreadable: true,
      });
    }
  }
  for (const id of Object.keys(index)) {
    if (!foundIds.has(id)) {
      delete index[id];
      indexChanged = true;
    }
  }
  if (indexChanged) await writeIndex(index);
  return drawings.sort((a, b) => b.updatedAt - a.updatedAt);
};

ipcMain.handle("library:list", listDrawings);
ipcMain.handle("library:folder", getLibraryFolder);
ipcMain.handle("library:create", async () => ({ id: crypto.randomUUID() }));
ipcMain.handle("library:read", async (_event, id) => {
  return fs.readFile(await filePathFor(id), "utf8");
});
const saveDrawing = async (id, contents) => {
  if (typeof contents !== "string" || contents.length > 250 * 1024 * 1024) {
    throw new Error("Drawing is too large to save");
  }
  const filePath = await filePathFor(id);
  const data = JSON.parse(contents);
  const folder = await getLibraryFolder();
  const destination = path.join(
    folder,
    filenameFor(id, data?.appState?.name),
  );
  const tempPath = `${destination}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, contents, "utf8");
  await fs.rename(tempPath, destination);
  if (path.resolve(filePath) !== path.resolve(destination)) {
    await fs.rm(filePath, { force: true });
  }
  const stat = await fs.stat(destination);
  const index = await readIndex();
  index[id] = {
    id,
    name: data?.appState?.name || "Untitled drawing",
    updatedAt: stat.mtimeMs,
    searchText: getSearchText(data),
    fileName: path.basename(destination),
  };
  await writeIndex(index);
  return { updatedAt: stat.mtimeMs };
};

ipcMain.handle("library:save", async (_event, id, contents) => {
  const previousSave = drawingSaveQueues.get(id) || Promise.resolve();
  const currentSave = previousSave
    .catch(() => {})
    .then(() => saveDrawing(id, contents));
  drawingSaveQueues.set(id, currentSave);
  try {
    return await currentSave;
  } finally {
    if (drawingSaveQueues.get(id) === currentSave) {
      drawingSaveQueues.delete(id);
    }
  }
});
ipcMain.handle("library:rename", async (_event, id, name) => {
  if (typeof name !== "string" || !name.trim() || name.length > 120) {
    throw new Error("Enter a name up to 120 characters");
  }
  const filePath = await filePathFor(id);
  const data = JSON.parse(await fs.readFile(filePath, "utf8"));
  data.appState = { ...(data.appState || {}), name: name.trim() };
  const folder = await getLibraryFolder();
  const destination = path.join(folder, filenameFor(id, name));
  const tempPath = `${destination}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tempPath, destination);
  if (path.resolve(filePath) !== path.resolve(destination)) {
    await fs.rm(filePath, { force: true });
  }
  const stat = await fs.stat(destination);
  const index = await readIndex();
  index[id] = {
    id,
    name: name.trim(),
    updatedAt: stat.mtimeMs,
    searchText: getSearchText(data),
    fileName: path.basename(destination),
  };
  await writeIndex(index);
  return { name: name.trim() };
});
ipcMain.handle("library:choose-folder", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  if (result.canceled || !result.filePaths[0]) return null;
  const previousFolder = await getLibraryFolder();
  const nextFolder = result.filePaths[0];
  await fs.mkdir(nextFolder, { recursive: true });
  if (path.resolve(previousFolder) !== path.resolve(nextFolder)) {
    const entries = await fs.readdir(previousFolder, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".excalidraw"))
        .map(async (entry) => {
          try {
            await fs.copyFile(
              path.join(previousFolder, entry.name),
              path.join(nextFolder, entry.name),
              fsConstants.COPYFILE_EXCL,
            );
          } catch (error) {
            if (error.code !== "EEXIST") throw error;
          }
        }),
    );
  }
  libraryFolder = nextFolder;
  await fs.mkdir(path.dirname(getSettingsPath()), { recursive: true });
  await fs.writeFile(getSettingsPath(), JSON.stringify({ libraryFolder }, null, 2));
  return libraryFolder;
});
ipcMain.handle("library:open-folder", async () => {
  const folder = await getLibraryFolder();
  const error = await shell.openPath(folder);
  if (error) throw new Error(error);
  return folder;
});
ipcMain.on("app:ready-to-close", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const context = window && closeContexts.get(window);
  if (!window || !context) return;
  context.allowClose = true;
  window.close();
});

const createWindow = async () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 860,
    minHeight: 600,
    backgroundColor: "#121212",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const closeContext = { allowClose: false, waiting: false };
  closeContexts.set(window, closeContext);
  window.on("close", (event) => {
    if (closeContext.allowClose) return;
    event.preventDefault();
    if (closeContext.waiting) return;
    closeContext.waiting = true;
    if (window.webContents.isDestroyed()) {
      closeContext.allowClose = true;
      window.close();
      return;
    }
    window.webContents.send("app:prepare-close");
  });
  window.webContents.on("render-process-gone", () => {
    closeContext.allowClose = true;
    window.close();
  });

  if (process.env.EXCALIDRAW_DESKTOP_DEV_URL) {
    await window.loadURL(process.env.EXCALIDRAW_DESKTOP_DEV_URL);
  } else {
    await window.loadFile(path.join(__dirname, "../excalidraw-app/build/index.html"));
  }

};

app.whenReady().then(createWindow);
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
