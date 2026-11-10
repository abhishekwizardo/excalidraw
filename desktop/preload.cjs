const { contextBridge, ipcRenderer } = require("electron");

let closeRequested = false;
let beforeCloseCallback;

ipcRenderer.on("app:prepare-close", () => {
  closeRequested = true;
  beforeCloseCallback?.();
});

contextBridge.exposeInMainWorld("excalidrawDesktop", {
  getLibrary: () => ipcRenderer.invoke("library:list"),
  getFolder: () => ipcRenderer.invoke("library:folder"),
  createDrawing: () => ipcRenderer.invoke("library:create"),
  readDrawing: (id) => ipcRenderer.invoke("library:read", id),
  saveDrawing: (id, contents) =>
    ipcRenderer.invoke("library:save", id, contents),
  renameDrawing: (id, name) =>
    ipcRenderer.invoke("library:rename", id, name),
  chooseFolder: () => ipcRenderer.invoke("library:choose-folder"),
  openFolder: () => ipcRenderer.invoke("library:open-folder"),
  onBeforeClose: (callback) => {
    beforeCloseCallback = callback;
    if (closeRequested) callback();
    return () => {
      if (beforeCloseCallback === callback) beforeCloseCallback = undefined;
    };
  },
  readyToClose: () => ipcRenderer.send("app:ready-to-close"),
});
