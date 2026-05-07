const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const isDev = process.env.ELECTRON_DEV === "1";

function getStatePath() {
  return path.join(app.getPath("userData"), "field-state.json");
}

async function readFieldState() {
  try {
    const raw = await fs.readFile(getStatePath(), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeFieldState(state) {
  const statePath = getStatePath();
  const tempPath = `${statePath}.tmp`;
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tempPath, statePath);
  return { ok: true, path: statePath };
}

function createWindow() {
  const pngIconPath = path.join(__dirname, "..", "assets", "icon.png");
  const icnsIconPath = path.join(__dirname, "..", "assets", "icon.icns");

  const window = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: "Infinimind",
    backgroundColor: "#f4f4f0",
    frame: false,
    icon: process.platform === "darwin" ? icnsIconPath : pngIconPath,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(pngIconPath);
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

ipcMain.handle("field:load", readFieldState);
ipcMain.handle("field:save", (_event, state) => writeFieldState(state));
ipcMain.handle("field:path", () => getStatePath());

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
