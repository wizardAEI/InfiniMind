# InfiniMind MCP Server

InfiniMind exposes a local stdio MCP server through `mcp/start.cjs`.

## Run

Open InfiniMind, then use **Settings -> MCP** to copy a config generated from the current app install path.

The generated JSON has this shape:

```json
{
  "mcpServers": {
    "infinimind": {
      "command": "<InfiniMind install path>/mcp/start.cjs"
    }
  }
}
```

Once this is configured and the client is restarted, the model can control InfiniMind by calling MCP tools. It does not need the desktop app to already be open. If visual feedback is useful, ask the model to call `infinimind_open_app` first; subsequent MCP writes update the shared workspace database and the open app refreshes from that database.

Generate the current machine's config snippets:

```sh
npm run mcp:config
```

The generated Codex TOML has this shape:

```toml
[mcp_servers.infinimind]
command = "<InfiniMind install path>/mcp/start.cjs"
```

Fallback direct Node command:

```json
{
  "command": "node",
  "args": [
    "--no-warnings=ExperimentalWarning",
    "<InfiniMind install path>/mcp/infinimind-server.mjs"
  ]
}
```

For local development:

```sh
npm run -s mcp
npm run mcp:inspect
```

Example user prompts in any MCP-capable client:

```text
Use InfiniMind MCP to open the app, list my projects, and create a new project for planning a product launch.
```

```text
Use InfiniMind MCP to add five connected card sets to the active project, then lay them out as a timeline.
```

```text
Use InfiniMind MCP to create a card set at canvas position { "x": 120, "y": -80 } with one seed card about launch risks.
```

```text
Use InfiniMind MCP to add a card to set-123 and place that visible set at canvas position { "x": 320, "y": 140 }.
```

```text
Use InfiniMind MCP to review the active project and clean up empty cards, but only run destructive actions after asking me.
```

Coordinates use the same canvas/world coordinate system exposed by `infinimind://project/{projectId}/graph`.
Individual cards inside a set still use order, index, and active-card state; `position` on card create/move/restore tools moves the target set. Automatic layouts can overwrite manual coordinates, so call `infinimind_layout_sets` before manual placement or skip layout when the client controls positions.

Set `INFINIMIND_USER_DATA_DIR=/path/to/user-data` to point the server at a test workspace instead of the default Electron user data directory.

## Safety Model

- Read tools are non-mutating.
- Write tools create an automatic SQLite snapshot before saving workspace changes.
- Trash and delete operations require `confirm: true`.
- Permanent trash deletion also requires `confirmText: "DELETE"`.
- `infinimind_apply_operations` supports `dryRun: true` for batch previews.
