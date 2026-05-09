#!/usr/bin/env node
const { spawn } = require("node:child_process");
const path = require("node:path");

const serverPath = path.join(__dirname, "infinimind-server.mjs");
const child = spawn(process.execPath, ["--no-warnings=ExperimentalWarning", serverPath], {
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
