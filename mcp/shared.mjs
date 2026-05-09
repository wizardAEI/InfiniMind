import {
  closeDatabase,
  openDatabase,
} from "./storage.mjs";

export function safeTool(handler) {
  return async (input) => {
    try {
      const data = await handler(input || {});
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        structuredContent: isPlainRecord(data) ? data : { result: data },
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
      };
    }
  };
}

export function withDatabase(callback) {
  const database = openDatabase();
  try {
    return callback(database);
  } finally {
    closeDatabase(database);
  }
}

export async function withDatabaseAsync(callback) {
  const database = openDatabase();
  try {
    return await callback(database);
  } finally {
    closeDatabase(database);
  }
}

export function jsonResource(uri, value) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function textResource(uri, text, mimeType = "text/plain") {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType,
        text,
      },
    ],
  };
}

export function resourceNotFound(message) {
  throw new Error(message);
}

export function requireConfirmInput(input) {
  if (input.confirm !== true) {
    throw new Error("confirm: true is required for this operation.");
  }
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
