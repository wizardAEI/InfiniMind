#!/usr/bin/env node
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const launcherPath = path.join(repoRoot, "mcp", "start.cjs");

const genericConfig = {
  mcpServers: {
    infinimind: {
      command: launcherPath,
    },
  },
};

const codexToml = `[mcp_servers.infinimind]
command = "${escapeTomlString(launcherPath)}"`;

console.log("InfiniMind MCP connection config");
console.log("");
console.log("Recommended JSON config:");
console.log(JSON.stringify(genericConfig, null, 2));
console.log("");
console.log("Codex TOML config:");
console.log(codexToml);
console.log("");
console.log("Smoke test:");
console.log(`"${launcherPath}"`);
console.log("");
console.log("After connecting, ask your MCP client:");
console.log('- "Use InfiniMind MCP to open the app, list my projects, and create a new board for ..."');
console.log('- "Use InfiniMind MCP to add cards and connections to the active project."');

function escapeTomlString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
