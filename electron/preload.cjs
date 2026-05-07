const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("infinimindStorage", {
  load: () => ipcRenderer.invoke("field:load"),
  save: (state) => ipcRenderer.invoke("field:save", state),
  path: () => ipcRenderer.invoke("field:path"),
});
