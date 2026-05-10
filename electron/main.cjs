const { app, BrowserWindow, ipcMain, protocol, shell } = require("electron");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const isDev = process.env.ELECTRON_DEV === "1";
const workspaceStateId = "workspace";
const imageProtocol = "infinimind-image";
let database = null;
app.setName("InfiniMind");

protocol.registerSchemesAsPrivileged([
  {
    scheme: imageProtocol,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function getStatePath() {
  return path.join(app.getPath("userData"), "field-state.sqlite");
}

function getImagesDir() {
  return path.join(app.getPath("userData"), "images");
}

function getAppRoot() {
  return path.join(__dirname, "..");
}

function getMcpLauncherPath() {
  return path.join(getAppRoot(), "mcp", "start.cjs");
}

function readMcpConfig() {
  const launcherPath = getMcpLauncherPath();
  const jsonConfig = {
    mcpServers: {
      infinimind: {
        command: launcherPath,
      },
    },
  };
  const fallbackConfig = {
    mcpServers: {
      infinimind: {
        command: "node",
        args: [launcherPath],
      },
    },
  };

  return {
    appRoot: getAppRoot(),
    command: launcherPath,
    json: JSON.stringify(jsonConfig, null, 2),
    codexToml: `[mcp_servers.infinimind]\ncommand = "${escapeTomlString(launcherPath)}"`,
    fallbackJson: JSON.stringify(fallbackConfig, null, 2),
  };
}

function escapeTomlString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getDatabase() {
  if (database) {
    return database;
  }

  fsSync.mkdirSync(app.getPath("userData"), { recursive: true });
  database = new DatabaseSync(getStatePath());
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS workspace_state (
      id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS image_assets (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      original_name TEXT,
      size INTEGER,
      created_at TEXT NOT NULL
    );
  `);
  return database;
}

async function readFieldState() {
  const row = getDatabase()
    .prepare("SELECT state_json FROM workspace_state WHERE id = ?")
    .get(workspaceStateId);

  if (!row?.state_json) {
    return null;
  }

  return JSON.parse(row.state_json);
}

async function writeFieldState(state) {
  const stateJson = JSON.stringify(state);
  const updatedAt = new Date().toISOString();
  getDatabase()
    .prepare(
      `
        INSERT INTO workspace_state (id, state_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `
    )
    .run(workspaceStateId, stateJson, updatedAt);

  await pruneUnusedImages(state);
  return { ok: true, path: getStatePath(), updatedAt };
}

async function readFieldMetadata() {
  const row = getDatabase()
    .prepare("SELECT updated_at, length(state_json) AS state_size FROM workspace_state WHERE id = ?")
    .get(workspaceStateId);
  const imageStats = getDatabase()
    .prepare("SELECT count(*) AS count, coalesce(sum(size), 0) AS bytes FROM image_assets")
    .get();

  return {
    path: getStatePath(),
    imagesDir: getImagesDir(),
    updatedAt: row?.updated_at || null,
    stateSize: row?.state_size || 0,
    imageCount: imageStats?.count || 0,
    imageBytes: imageStats?.bytes || 0,
  };
}

async function importImage(_event, image) {
  if (!image || typeof image !== "object") {
    throw new Error("Missing image data.");
  }

  const { buffer, mime } = decodeImagePayload(image);
  const id = createImageId();
  const extension = getImageExtension(mime, image.name);
  const filename = `${id}${extension}`;
  const createdAt = new Date().toISOString();

  await fs.mkdir(getImagesDir(), { recursive: true });
  await fs.writeFile(path.join(getImagesDir(), filename), buffer);

  getDatabase()
    .prepare(
      `
        INSERT INTO image_assets (id, filename, mime, original_name, size, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
    )
    .run(id, filename, mime, typeof image.name === "string" ? image.name : "", buffer.byteLength, createdAt);

  return {
    id,
    url: `${imageProtocol}://${id}`,
    size: buffer.byteLength,
    mime,
  };
}

async function handleImageRequest(request) {
  const imageId = getImageIdFromUrl(request.url);
  if (!imageId) {
    return new Response("Not found", { status: 404 });
  }

  const row = getDatabase()
    .prepare("SELECT filename, mime FROM image_assets WHERE id = ?")
    .get(imageId);

  if (!row?.filename) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.join(getImagesDir(), row.filename);
  try {
    const bytes = await fs.readFile(filePath);
    return new Response(bytes, {
      headers: {
        "content-type": row.mime || "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}

async function openAsset(_event, targetUrl) {
  const value = typeof targetUrl === "string" ? targetUrl.trim() : "";
  if (!value) {
    return { ok: false, error: "Missing asset URL." };
  }

  const imageId = getImageIdFromUrl(value);
  if (imageId) {
    const row = getDatabase()
      .prepare("SELECT filename FROM image_assets WHERE id = ?")
      .get(imageId);

    if (!row?.filename) {
      return { ok: false, error: "Asset not found." };
    }

    const filePath = path.join(getImagesDir(), row.filename);
    const error = await shell.openPath(filePath);
    return { ok: !error, error, path: filePath };
  }

  await shell.openExternal(value);
  return { ok: true };
}

async function pruneUnusedImages(state) {
  const referencedIds = collectImageIds(state);
  const rows = getDatabase().prepare("SELECT id, filename FROM image_assets").all();

  for (const row of rows) {
    if (referencedIds.has(row.id)) {
      continue;
    }

    getDatabase().prepare("DELETE FROM image_assets WHERE id = ?").run(row.id);
    await fs.rm(path.join(getImagesDir(), row.filename), { force: true });
  }
}

function collectImageIds(value, ids = new Set()) {
  if (!value || typeof value !== "object") {
    return ids;
  }

  for (const assetUrl of [value.imageUrl, value.attachmentUrl]) {
    const imageId = getImageIdFromUrl(assetUrl);
    if (imageId) {
      ids.add(imageId);
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectImageIds(item, ids);
    }
    return ids;
  }

  for (const item of Object.values(value)) {
    collectImageIds(item, ids);
  }
  return ids;
}

function getImageIdFromUrl(value) {
  if (typeof value !== "string" || !value.startsWith(`${imageProtocol}://`)) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.hostname || url.pathname.replace(/^\/+/, "") || null;
  } catch {
    return null;
  }
}

function getImageExtension(mime, name) {
  const extensionFromName = typeof name === "string" ? path.extname(name).toLowerCase() : "";
  if (/^\.[a-z0-9]{1,8}$/.test(extensionFromName)) {
    return extensionFromName;
  }

  const extensionByMime = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/avif": ".avif",
  };
  return extensionByMime[mime] || ".img";
}

function decodeImagePayload(image) {
  if (typeof image.dataUrl === "string") {
    return decodeDataUrlImage(image.dataUrl, image.mime);
  }

  if (image.bytes) {
    return {
      buffer: Buffer.from(image.bytes),
      mime: normalizeImageMime(image.mime),
    };
  }

  throw new Error("Missing image data.");
}

function decodeDataUrlImage(dataUrl, fallbackMime) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) {
    throw new Error("Invalid image data.");
  }

  const mime = normalizeImageMime(match[1] || fallbackMime);
  const isBase64 = Boolean(match[2]);
  const data = match[3] || "";
  const buffer = isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data), "utf8");

  if (buffer.byteLength === 0) {
    throw new Error("Image file is empty.");
  }

  return { buffer, mime };
}

function normalizeImageMime(mime) {
  if (typeof mime === "string" && /^image\/[-+.\w]+$/.test(mime)) {
    return mime;
  }

  return "application/octet-stream";
}

function createImageId() {
  if (globalThis.crypto?.randomUUID) {
    return `image-${globalThis.crypto.randomUUID()}`;
  }

  return `image-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createWindow() {
  const pngIconPath = path.join(__dirname, "..", "assets", "icon.png");
  const icnsIconPath = path.join(__dirname, "..", "assets", "icon.icns");

  const window = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: "InfiniMind",
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
ipcMain.handle("field:metadata", readFieldMetadata);
ipcMain.handle("image:import", importImage);
ipcMain.handle("asset:open", openAsset);
ipcMain.handle("app:mcp-config", readMcpConfig);

app.whenReady().then(() => {
  getDatabase();
  protocol.handle(imageProtocol, handleImageRequest);
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

app.on("before-quit", () => {
  database?.close();
  database = null;
});
