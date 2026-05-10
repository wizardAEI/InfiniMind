const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("infinimindStorage", {
  load: () => ipcRenderer.invoke("field:load"),
  save: (state) => ipcRenderer.invoke("field:save", state),
  path: () => ipcRenderer.invoke("field:path"),
  metadata: () => ipcRenderer.invoke("field:metadata"),
  importImage: (image) => ipcRenderer.invoke("image:import", image),
  openAsset: (url) => ipcRenderer.invoke("asset:open", url),
  mcpConfig: () => ipcRenderer.invoke("app:mcp-config"),
});
