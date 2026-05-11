const { contextBridge, ipcRenderer } = require("electron");

/**
 * @typedef {Object} InfiniMindStorageBridge
 * @property {() => Promise<unknown>} load
 * @property {(state: unknown) => Promise<unknown>} save
 * @property {() => Promise<string>} path
 * @property {() => Promise<unknown>} metadata
 * @property {(image: { dataUrl: string, mime?: string, name?: string }) => Promise<unknown>} importImage
 * @property {(url: string) => Promise<unknown>} openAsset
 * @property {(payload: { suggestedFilename: string, markdown: string }) => Promise<unknown>} exportMarkdown
 * @property {(callback: () => void) => (() => void)} onExportMarkdownRequest
 * @property {() => Promise<unknown>} mcpConfig
 */

/** @type {InfiniMindStorageBridge} */
const storageBridge = {
  load: () => ipcRenderer.invoke("field:load"),
  save: (state) => ipcRenderer.invoke("field:save", state),
  path: () => ipcRenderer.invoke("field:path"),
  metadata: () => ipcRenderer.invoke("field:metadata"),
  importImage: (image) => ipcRenderer.invoke("image:import", image),
  openAsset: (url) => ipcRenderer.invoke("asset:open", url),
  exportMarkdown: (payload) => ipcRenderer.invoke("markdown:export", payload),
  onExportMarkdownRequest: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = () => callback();
    ipcRenderer.on("markdown:export-requested", listener);
    return () => ipcRenderer.removeListener("markdown:export-requested", listener);
  },
  mcpConfig: () => ipcRenderer.invoke("app:mcp-config"),
};

contextBridge.exposeInMainWorld("infinimindStorage", {
  ...storageBridge,
});
