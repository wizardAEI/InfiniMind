import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";
import {
  applyOperation,
  applyOperations,
  getProjectOrThrow,
  listProjectSummaries,
  projectToMarkdown,
  searchWorkspace,
  summarizeWorkspace,
  validateWorkspace,
  workspaceResourceLinks,
} from "./operations.mjs";
import {
  createSnapshot,
  getStoragePaths,
  getUserDataDir,
  getWorkspaceMetadata,
  importImageAsset,
  listImageAssets,
  listSnapshots,
  loadWorkspace,
  restoreSnapshot,
  saveWorkspace,
} from "./storage.mjs";
import {
  requireConfirmInput,
  safeTool,
  withDatabase,
  withDatabaseAsync,
} from "./shared.mjs";

const confirmSchema = { confirm: z.boolean().optional(), confirmText: z.string().optional() };
const cardInputSchema = z.object({
  type: z.enum(["text", "image", "link", "attachment"]).optional(),
  note: z.string().optional(),
  imageUrl: z.string().optional(),
  imageTone: z.enum(["mono", "color"]).optional(),
  imageStyle: z.string().optional(),
  linkTitle: z.string().optional(),
  linkUrl: z.string().optional(),
  attachmentUrl: z.string().optional(),
  attachmentName: z.string().optional(),
  attachmentMime: z.string().optional(),
  attachmentSize: z.number().optional(),
});
const positionSchema = z.object({ x: z.number(), y: z.number() });

export function registerTools(server, { repoRoot }) {
  server.registerTool(
    "infinimind_open_app",
    {
      title: "Open InfiniMind App",
      description: "Open the local InfiniMind desktop app so MCP changes are visible on screen.",
      inputSchema: z.object({ buildFirst: z.boolean().optional() }),
    },
    safeTool(async (input) => launchInfiniMindApp(input, repoRoot))
  );

  server.registerTool(
    "infinimind_list_projects",
    {
      title: "List InfiniMind Projects",
      description: "List projects with set/card/connection/trash counts.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeTool(async () => withDatabase((database) => listProjectSummaries(loadWorkspace(database))))
  );

  server.registerTool(
    "infinimind_get_project",
    {
      title: "Get InfiniMind Project",
      description: "Read a project as JSON or Markdown.",
      inputSchema: z.object({
        projectId: z.string().optional(),
        includeCards: z.boolean().optional(),
        includeTrash: z.boolean().optional(),
        format: z.enum(["json", "markdown"]).optional(),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeTool(async (input) =>
      withDatabase((database) => {
        const workspace = loadWorkspace(database);
        const project = getProjectOrThrow(workspace, input.projectId);
        if (input.format === "markdown") {
          return {
            projectId: project.id,
            format: "markdown",
            markdown: projectToMarkdown(project, {
              includeCards: input.includeCards !== false,
              includeTrash: input.includeTrash === true,
            }),
            resources: workspaceResourceLinks(project.id),
          };
        }
        return {
          project,
          resources: workspaceResourceLinks(project.id),
        };
      })
    )
  );

  server.registerTool(
    "infinimind_search",
    {
      title: "Search InfiniMind",
      description: "Search projects, sets, cards, links, images, and optionally trash.",
      inputSchema: z.object({
        query: z.string().optional(),
        projectId: z.string().optional(),
        cardType: z.enum(["text", "image", "link", "attachment"]).optional(),
        includeTrash: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeTool(async (input) => withDatabase((database) => ({ matches: searchWorkspace(loadWorkspace(database), input) })))
  );

  server.registerTool(
    "infinimind_validate_workspace",
    {
      title: "Validate InfiniMind Workspace",
      description: "Validate workspace structure, connections, IDs, camera state, and image references.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeTool(async () =>
      withDatabase((database) =>
        validateWorkspace(loadWorkspace(database), {
          imageAssets: listImageAssets(database),
        })
      )
    )
  );

  server.registerTool(
    "infinimind_create_snapshot",
    {
      title: "Create InfiniMind Snapshot",
      description: "Create a local restore point for the current workspace.",
      inputSchema: z.object({ label: z.string().optional() }),
    },
    safeTool(async (input) => withDatabase((database) => createSnapshot(database, input.label)))
  );

  server.registerTool(
    "infinimind_list_snapshots",
    {
      title: "List InfiniMind Snapshots",
      description: "List local restore points.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(100).optional() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeTool(async (input) => withDatabase((database) => ({ snapshots: listSnapshots(database, input.limit) })))
  );

  server.registerTool(
    "infinimind_restore_snapshot",
    {
      title: "Restore InfiniMind Snapshot",
      description: "Restore a local snapshot. This creates an automatic snapshot before restoring.",
      inputSchema: z.object({ snapshotId: z.string(), confirm: z.boolean() }),
    },
    safeTool(async (input) => {
      requireConfirmInput(input);
      return withDatabaseAsync(async (database) => {
        const result = await restoreSnapshot(database, input.snapshotId, { userDataDir: getUserDataDir() });
        return writeResult(
          "restore_snapshot",
          result.state,
          result.updatedAt,
          result.state.activeProjectId,
          result.restoredSnapshot,
          getWorkspaceMetadata(database)
        );
      });
    })
  );

  registerOperationTool(server, "infinimind_create_project", "Create an InfiniMind project.", z.object({
    name: z.string().optional(),
    seedNote: z.string().optional(),
    makeActive: z.boolean().optional(),
  }));
  registerOperationTool(server, "infinimind_rename_project", "Rename a project and its field title.", z.object({
    projectId: z.string(),
    name: z.string(),
  }));
  registerOperationTool(server, "infinimind_set_active_project", "Set the active project.", z.object({ projectId: z.string() }));
  registerOperationTool(server, "infinimind_delete_project", "Delete a project.", z.object({
    projectId: z.string(),
    allowEmptyWorkspace: z.boolean().optional(),
    ...confirmSchema,
  }));
  registerOperationTool(server, "infinimind_create_set", "Create a card set on a project canvas.", z.object({
    projectId: z.string().optional(),
    title: z.string().optional(),
    parentId: z.string().optional(),
    position: positionSchema.optional(),
    seedCards: z.array(cardInputSchema).optional(),
  }));
  registerOperationTool(server, "infinimind_update_set", "Update set title, position, or active card.", z.object({
    projectId: z.string().optional(),
    setId: z.string(),
    title: z.string().optional(),
    parentId: z.string().nullable().optional(),
    position: positionSchema.optional(),
    activeCardId: z.string().optional(),
  }));
  registerOperationTool(server, "infinimind_layout_sets", "Automatically lay out project sets.", z.object({
    projectId: z.string().optional(),
    layout: z.enum(["grid", "radial", "timeline"]).optional(),
  }));
  registerOperationTool(server, "infinimind_trash_set", "Move a set to recoverable trash.", z.object({
    projectId: z.string().optional(),
    setId: z.string(),
    ...confirmSchema,
  }));
  registerOperationTool(server, "infinimind_restore_set", "Restore a set from trash.", z.object({
    projectId: z.string().optional(),
    trashId: z.string(),
  }));
  registerOperationTool(server, "infinimind_create_organization", "Create an organization on a project canvas.", z.object({
    projectId: z.string().optional(),
    title: z.string().optional(),
    parentId: z.string().optional(),
    position: positionSchema.optional(),
  }));
  registerOperationTool(server, "infinimind_update_organization", "Update organization title, position, parent, or camera.", z.object({
    projectId: z.string().optional(),
    organizationId: z.string(),
    title: z.string().optional(),
    parentId: z.string().nullable().optional(),
    position: positionSchema.optional(),
    pan: positionSchema.optional(),
    zoom: z.number().optional(),
  }));
  registerOperationTool(server, "infinimind_group_nodes", "Group sibling sets or organizations into a new organization.", z.object({
    projectId: z.string().optional(),
    scopeId: z.string().nullable().optional(),
    nodeIds: z.array(z.string()),
    title: z.string().optional(),
    position: positionSchema.optional(),
  }));
  registerOperationTool(server, "infinimind_move_node", "Move a set or organization into an organization or root.", z.object({
    projectId: z.string().optional(),
    nodeId: z.string(),
    targetOrganizationId: z.string().nullable().optional(),
    position: positionSchema.optional(),
  }));
  registerOperationTool(server, "infinimind_trash_organization", "Move an organization subtree to recoverable trash.", z.object({
    projectId: z.string().optional(),
    organizationId: z.string(),
    ...confirmSchema,
  }));
  registerOperationTool(server, "infinimind_restore_organization", "Restore an organization subtree from trash.", z.object({
    projectId: z.string().optional(),
    trashId: z.string(),
  }));
  registerOperationTool(server, "infinimind_delete_trash_item", "Permanently delete a trash item.", z.object({
    projectId: z.string().optional(),
    kind: z.enum(["card", "set", "organization"]),
    trashId: z.string(),
    ...confirmSchema,
  }));
  registerOperationTool(server, "infinimind_create_card", "Create a card in a set. Optional position moves the target set in canvas/world coordinates.", z.object({
    projectId: z.string().optional(),
    setId: z.string(),
    index: z.number().int().optional(),
    afterCardId: z.string().optional(),
    position: positionSchema.optional(),
    card: cardInputSchema.optional(),
    type: z.enum(["text", "image", "link", "attachment"]).optional(),
    note: z.string().optional(),
    imageUrl: z.string().optional(),
    imageTone: z.enum(["mono", "color"]).optional(),
    linkTitle: z.string().optional(),
    linkUrl: z.string().optional(),
    attachmentUrl: z.string().optional(),
    attachmentName: z.string().optional(),
    attachmentMime: z.string().optional(),
    attachmentSize: z.number().optional(),
  }));
  registerOperationTool(server, "infinimind_update_card", "Update card type and content.", z.object({
    projectId: z.string().optional(),
    setId: z.string(),
    cardId: z.string(),
    type: z.enum(["text", "image", "link", "attachment"]).optional(),
    note: z.string().optional(),
    imageUrl: z.string().optional(),
    imageTone: z.enum(["mono", "color"]).optional(),
    imageStyle: z.string().optional(),
    linkTitle: z.string().optional(),
    linkUrl: z.string().optional(),
    attachmentUrl: z.string().optional(),
    attachmentName: z.string().optional(),
    attachmentMime: z.string().optional(),
    attachmentSize: z.number().optional(),
  }));
  registerOperationTool(server, "infinimind_reorder_cards", "Reorder cards within one set.", z.object({
    projectId: z.string().optional(),
    setId: z.string(),
    cardIds: z.array(z.string()),
  }));
  registerOperationTool(server, "infinimind_move_card", "Move a card between sets. Optional position moves the target set in canvas/world coordinates.", z.object({
    projectId: z.string().optional(),
    sourceSetId: z.string(),
    targetSetId: z.string(),
    cardId: z.string(),
    index: z.number().int().optional(),
    position: positionSchema.optional(),
  }));
  registerOperationTool(server, "infinimind_trash_card", "Move a card to recoverable trash.", z.object({
    projectId: z.string().optional(),
    setId: z.string(),
    cardId: z.string(),
    ...confirmSchema,
  }));
  registerOperationTool(server, "infinimind_restore_card", "Restore a card from trash. Optional position moves the resolved target set in canvas/world coordinates.", z.object({
    projectId: z.string().optional(),
    trashId: z.string(),
    targetSetId: z.string().optional(),
    position: positionSchema.optional(),
  }));
  registerOperationTool(server, "infinimind_create_connection", "Create a deduped undirected connection between two nodes.", z.object({
    projectId: z.string().optional(),
    scopeId: z.string().nullable().optional(),
    fromSetId: z.string().optional(),
    toSetId: z.string().optional(),
    fromNodeId: z.string().optional(),
    toNodeId: z.string().optional(),
  }));
  registerOperationTool(server, "infinimind_delete_connection", "Delete a connection by ID or node pair.", z.object({
    projectId: z.string().optional(),
    connectionId: z.string().optional(),
    scopeId: z.string().nullable().optional(),
    fromSetId: z.string().optional(),
    toSetId: z.string().optional(),
    fromNodeId: z.string().optional(),
    toNodeId: z.string().optional(),
    ...confirmSchema,
  }));

  server.registerTool(
    "infinimind_import_image_asset",
    {
      title: "Import InfiniMind Image Asset",
      description: "Import an image file, data URL, or base64 payload into InfiniMind image storage.",
      inputSchema: z.object({
        filePath: z.string().optional(),
        dataUrl: z.string().optional(),
        base64: z.string().optional(),
        mime: z.string().optional(),
        name: z.string().optional(),
      }),
    },
    safeTool(async (input) => withDatabaseAsync(async (database) => ({ asset: await importImageAsset(database, input, { userDataDir: getUserDataDir() }) })))
  );

  server.registerTool(
    "infinimind_apply_operations",
    {
      title: "Apply InfiniMind Operations",
      description: "Apply up to 50 InfiniMind domain operations in order. Supports dryRun.",
      inputSchema: z.object({
        dryRun: z.boolean().optional(),
        includeWorkspace: z.boolean().optional(),
        operations: z.array(z.object({ type: z.string() }).passthrough()).max(50),
      }),
    },
    safeTool(async (input) =>
      withDatabaseAsync(async (database) => {
        const current = loadWorkspace(database);
        const result = applyOperations(current, input.operations);
        if (input.dryRun) {
          return {
            dryRun: true,
            changes: result.changes,
            workspaceSummary: summarizeWorkspace(result.workspace, getWorkspaceMetadata(database)),
            workspace: input.includeWorkspace ? result.workspace : undefined,
          };
        }

        const saved = await saveWorkspace(database, result.workspace, {
          snapshotLabel: "MCP before batch operations",
          userDataDir: getUserDataDir(),
        });
        return {
          dryRun: false,
          updatedAt: saved.updatedAt,
          changes: result.changes,
          workspaceSummary: summarizeWorkspace(saved.state, getWorkspaceMetadata(database)),
          workspace: input.includeWorkspace ? saved.state : undefined,
        };
      })
    )
  );
}

function registerOperationTool(server, name, description, inputSchema) {
  server.registerTool(
    name,
    {
      title: name,
      description,
      inputSchema,
    },
    safeTool(async (input) =>
      withDatabaseAsync(async (database) => {
        const current = loadWorkspace(database);
        const operation = { ...input, type: name.replace(/^infinimind_/, "") };
        const result = applyOperation(current, operation);
        const saved = await saveWorkspace(database, result.workspace, {
          snapshotLabel: `MCP before ${operation.type}`,
          userDataDir: getUserDataDir(),
        });
        return writeResult(
          operation.type,
          saved.state,
          saved.updatedAt,
          result.changes[0]?.projectId,
          {
            changes: result.changes,
          },
          getWorkspaceMetadata(database)
        );
      })
    )
  );
}

async function launchInfiniMindApp(input = {}, repoRoot) {
  const scriptPath = path.join(repoRoot, "scripts", "run-desktop.cjs");
  await fs.access(scriptPath);

  const command = input.buildFirst ? (process.platform === "win32" ? "npm.cmd" : "npm") : process.execPath;
  const args = input.buildFirst ? ["run", "desktop"] : [scriptPath];
  const child = spawn(command, args, {
    cwd: repoRoot,
    detached: true,
    env: process.env,
    stdio: "ignore",
  });

  child.unref();

  return {
    ok: true,
    pid: child.pid,
    app: "InfiniMind",
    mode: input.buildFirst ? "build-and-open" : "open-existing-build",
    message: "InfiniMind is opening. MCP writes are reflected in the app through the shared workspace database.",
  };
}

function writeResult(type, state, updatedAt, projectId, extra = {}, metadata = getStoragePaths()) {
  return {
    type,
    projectId,
    updatedAt,
    workspaceSummary: summarizeWorkspace(state, metadata),
    resources: workspaceResourceLinks(projectId),
    ...extra,
  };
}
