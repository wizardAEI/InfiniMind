#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerPrompts } from "./prompts.mjs";
import { registerResources } from "./resources.mjs";
import { registerTools } from "./tools.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const server = new McpServer(
  {
    name: "infinimind",
    version: "0.1.0",
  },
  {
    instructions:
      "Use InfiniMind tools to inspect and update the local InfiniMind workspace. Read resources before writing. Destructive actions require confirm: true, and permanent trash deletion also requires confirmText: DELETE.",
  }
);

registerTools(server, { repoRoot });
registerResources(server);
registerPrompts(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("InfiniMind MCP Server running on stdio");
