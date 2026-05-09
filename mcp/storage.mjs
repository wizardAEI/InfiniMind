import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  collectImageIds,
  createDefaultWorkspaceState,
  createImageId,
  getImageIdFromUrl,
  normalizeWorkspaceState,
} from "../src/lib/workspaceModel.js";

export const workspaceStateId = "workspace";
export const imageProtocol = "infinimind-image";
export const maxImportedImageBytes = 50 * 1024 * 1024;

export function getUserDataDir() {
  if (process.env.INFINIMIND_USER_DATA_DIR) {
    return path.resolve(process.env.INFINIMIND_USER_DATA_DIR);
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "infinimind");
  }

  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "infinimind");
  }

  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "infinimind");
}

export function getStoragePaths(userDataDir = getUserDataDir()) {
  return {
    userDataDir,
    databasePath: path.join(userDataDir, "field-state.sqlite"),
    imagesDir: path.join(userDataDir, "images"),
  };
}

export function openDatabase(userDataDir = getUserDataDir()) {
  const paths = getStoragePaths(userDataDir);
  fsSync.mkdirSync(paths.userDataDir, { recursive: true });
  const database = new DatabaseSync(paths.databasePath);
  ensureSchema(database);
  return database;
}

export function ensureSchema(database) {
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
    CREATE TABLE IF NOT EXISTS workspace_snapshots (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

export function closeDatabase(database) {
  database?.close();
}

export function getWorkspaceRecord(database) {
  const row = database
    .prepare("SELECT state_json, updated_at FROM workspace_state WHERE id = ?")
    .get(workspaceStateId);

  if (!row?.state_json) {
    return {
      state: createDefaultWorkspaceState(),
      updatedAt: null,
      exists: false,
    };
  }

  return {
    state: normalizeWorkspaceState(JSON.parse(row.state_json)),
    updatedAt: row.updated_at,
    exists: true,
  };
}

export function loadWorkspace(database) {
  return getWorkspaceRecord(database).state;
}

export function getWorkspaceMetadata(database, userDataDir = getUserDataDir()) {
  const paths = getStoragePaths(userDataDir);
  const row = database
    .prepare("SELECT length(state_json) AS state_size, updated_at FROM workspace_state WHERE id = ?")
    .get(workspaceStateId);
  const imageStats = database.prepare("SELECT count(*) AS count, coalesce(sum(size), 0) AS bytes FROM image_assets").get();
  const snapshotStats = database.prepare("SELECT count(*) AS count FROM workspace_snapshots").get();

  return {
    databasePath: paths.databasePath,
    imagesDir: paths.imagesDir,
    updatedAt: row?.updated_at || null,
    stateSize: row?.state_size || 0,
    imageCount: imageStats?.count || 0,
    imageBytes: imageStats?.bytes || 0,
    snapshotCount: snapshotStats?.count || 0,
  };
}

export async function saveWorkspace(database, state, options = {}) {
  const normalized = normalizeWorkspaceState(state);
  const stateJson = JSON.stringify(normalized);
  const updatedAt = new Date().toISOString();
  let unusedImageFiles = [];

  database.exec("BEGIN IMMEDIATE");
  try {
    if (options.snapshotLabel) {
      insertSnapshotFromCurrentState(database, options.snapshotLabel);
    }

    database
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

    unusedImageFiles = markUnusedImagesForDeletion(database, normalized, options.userDataDir);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  for (const filePath of unusedImageFiles) {
    await fs.rm(filePath, { force: true });
  }

  return {
    state: normalized,
    updatedAt,
    path: getStoragePaths(options.userDataDir).databasePath,
  };
}

export function createSnapshot(database, label = "Manual snapshot") {
  const record = getWorkspaceRecord(database);
  const snapshot = {
    id: createSnapshotId(),
    label: String(label || "Manual snapshot"),
    stateJson: JSON.stringify(record.state),
    createdAt: new Date().toISOString(),
  };

  database
    .prepare(
      `
        INSERT INTO workspace_snapshots (id, label, state_json, created_at)
        VALUES (?, ?, ?, ?)
      `
    )
    .run(snapshot.id, snapshot.label, snapshot.stateJson, snapshot.createdAt);

  return {
    id: snapshot.id,
    label: snapshot.label,
    createdAt: snapshot.createdAt,
  };
}

export function listSnapshots(database, limit = 25) {
  return database
    .prepare(
      `
        SELECT id, label, created_at AS createdAt, length(state_json) AS stateSize
        FROM workspace_snapshots
        ORDER BY created_at DESC
        LIMIT ?
      `
    )
    .all(Math.min(Math.max(Number(limit) || 25, 1), 100));
}

export async function restoreSnapshot(database, snapshotId, options = {}) {
  const row = database
    .prepare("SELECT id, label, state_json, created_at FROM workspace_snapshots WHERE id = ?")
    .get(snapshotId);

  if (!row?.state_json) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  const state = normalizeWorkspaceState(JSON.parse(row.state_json));
  const result = await saveWorkspace(database, state, {
    ...options,
    snapshotLabel: `Before restoring ${row.label || row.id}`,
  });

  return {
    ...result,
    restoredSnapshot: {
      id: row.id,
      label: row.label,
      createdAt: row.created_at,
    },
  };
}

export async function importImageAsset(database, input, options = {}) {
  const image = await decodeImageInput(input);
  const id = createImageId();
  const extension = getImageExtension(image.mime, image.name);
  const filename = `${id}${extension}`;
  const paths = getStoragePaths(options.userDataDir);
  const createdAt = new Date().toISOString();

  await fs.mkdir(paths.imagesDir, { recursive: true });
  await fs.writeFile(path.join(paths.imagesDir, filename), image.buffer);

  database
    .prepare(
      `
        INSERT INTO image_assets (id, filename, mime, original_name, size, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
    )
    .run(id, filename, image.mime, image.name || "", image.buffer.byteLength, createdAt);

  return {
    id,
    url: `${imageProtocol}://${id}`,
    mime: image.mime,
    size: image.buffer.byteLength,
    originalName: image.name || "",
    createdAt,
  };
}

export function listImageAssets(database) {
  return database
    .prepare(
      `
        SELECT id, filename, mime, original_name AS originalName, size, created_at AS createdAt
        FROM image_assets
        ORDER BY created_at DESC
      `
    )
    .all();
}

export function getImageAsset(database, imageId, userDataDir = getUserDataDir()) {
  const normalizedId = getImageIdFromUrl(imageId) || imageId;
  const row = database
    .prepare(
      `
        SELECT id, filename, mime, original_name AS originalName, size, created_at AS createdAt
        FROM image_assets
        WHERE id = ?
      `
    )
    .get(normalizedId);

  if (!row?.filename) {
    return null;
  }

  return {
    ...row,
    path: path.join(getStoragePaths(userDataDir).imagesDir, row.filename),
    url: `${imageProtocol}://${row.id}`,
  };
}

function insertSnapshotFromCurrentState(database, label) {
  const row = database
    .prepare("SELECT state_json FROM workspace_state WHERE id = ?")
    .get(workspaceStateId);

  if (!row?.state_json) {
    return;
  }

  database
    .prepare(
      `
        INSERT INTO workspace_snapshots (id, label, state_json, created_at)
        VALUES (?, ?, ?, ?)
      `
    )
    .run(createSnapshotId(), String(label || "Automatic snapshot"), row.state_json, new Date().toISOString());
}

function markUnusedImagesForDeletion(database, state, userDataDir) {
  const referencedIds = collectImageIds(state);
  const rows = database.prepare("SELECT id, filename FROM image_assets").all();
  const paths = getStoragePaths(userDataDir);
  const unusedFiles = [];

  for (const row of rows) {
    if (referencedIds.has(row.id)) {
      continue;
    }

    database.prepare("DELETE FROM image_assets WHERE id = ?").run(row.id);
    unusedFiles.push(path.join(paths.imagesDir, row.filename));
  }

  return unusedFiles;
}

async function decodeImageInput(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Missing image input.");
  }

  if (typeof input.filePath === "string" && input.filePath.trim()) {
    return readImageFile(input.filePath, input.mime);
  }

  if (typeof input.dataUrl === "string" && input.dataUrl.trim()) {
    return decodeDataUrlImage(input.dataUrl, input.mime, input.name);
  }

  if (typeof input.base64 === "string" && input.base64.trim()) {
    const mime = normalizeImageMime(input.mime);
    const buffer = Buffer.from(input.base64, "base64");
    validateImageBuffer(buffer, mime);
    return {
      buffer,
      mime,
      name: typeof input.name === "string" ? input.name : "",
    };
  }

  throw new Error("Provide filePath, dataUrl, or base64 image data.");
}

async function readImageFile(filePath, fallbackMime) {
  if (!path.isAbsolute(filePath)) {
    throw new Error("filePath must be absolute.");
  }

  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error("filePath must point to a file.");
  }
  if (stat.size <= 0) {
    throw new Error("Image file is empty.");
  }
  if (stat.size > maxImportedImageBytes) {
    throw new Error(`Image file exceeds ${maxImportedImageBytes} bytes.`);
  }

  const mime = normalizeImageMime(fallbackMime || getMimeFromPath(filePath));
  const buffer = await fs.readFile(filePath);
  validateImageBuffer(buffer, mime);

  return {
    buffer,
    mime,
    name: path.basename(filePath),
  };
}

function decodeDataUrlImage(dataUrl, fallbackMime, name) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) {
    throw new Error("Invalid image data URL.");
  }

  const mime = normalizeImageMime(match[1] || fallbackMime);
  const isBase64 = Boolean(match[2]);
  const data = match[3] || "";
  const buffer = isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data), "utf8");
  validateImageBuffer(buffer, mime);

  return {
    buffer,
    mime,
    name: typeof name === "string" ? name : "",
  };
}

function validateImageBuffer(buffer, mime) {
  if (buffer.byteLength <= 0) {
    throw new Error("Image file is empty.");
  }
  if (buffer.byteLength > maxImportedImageBytes) {
    throw new Error(`Image file exceeds ${maxImportedImageBytes} bytes.`);
  }
  if (!mime.startsWith("image/")) {
    throw new Error("Only image MIME types are supported.");
  }
}

function normalizeImageMime(mime) {
  if (typeof mime === "string" && /^image\/[-+.\w]+$/.test(mime)) {
    return mime;
  }

  return "image/png";
}

function getMimeFromPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeByExtension = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".avif": "image/avif",
  };

  return mimeByExtension[extension] || "image/png";
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

function createSnapshotId() {
  if (globalThis.crypto?.randomUUID) {
    return `snapshot-${globalThis.crypto.randomUUID()}`;
  }

  return `snapshot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
