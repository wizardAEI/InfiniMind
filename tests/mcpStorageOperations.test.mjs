import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applyOperation, applyOperations, validateWorkspace } from "../mcp/operations.mjs";
import {
  closeDatabase,
  createSnapshot,
  getImageAsset,
  importImageAsset,
  listImageAssets,
  listSnapshots,
  loadWorkspace,
  openDatabase,
  restoreSnapshot,
  saveWorkspace,
} from "../mcp/storage.mjs";
import { createDefaultWorkspaceState } from "../src/lib/workspaceModel.js";

test("operations create cards, connections, trash and restore items", () => {
  let workspace = createDefaultWorkspaceState();
  const projectId = workspace.activeProjectId;
  const originalSetId = workspace.projects[0].field.sets[0].id;

  let result = applyOperation(workspace, { type: "create_set", projectId, title: "Research" });
  workspace = result.workspace;
  const newSetId = workspace.projects[0].field.activeSetId;

  result = applyOperation(workspace, {
    type: "create_card",
    projectId,
    setId: newSetId,
    card: { type: "link", linkTitle: "Docs", linkUrl: "https://example.com" },
  });
  workspace = result.workspace;
  const cardId = workspace.projects[0].field.sets.find((set) => set.id === newSetId).activeId;

  result = applyOperation(workspace, { type: "create_connection", projectId, fromSetId: originalSetId, toSetId: newSetId });
  workspace = result.workspace;
  assert.equal(workspace.projects[0].field.connections.length, 1);

  assert.throws(() => applyOperation(workspace, { type: "trash_card", projectId, setId: newSetId, cardId }), /confirm/);
  result = applyOperation(workspace, { type: "trash_card", projectId, setId: newSetId, cardId, confirm: true });
  workspace = result.workspace;
  assert.equal(workspace.projects[0].field.trash.cards.length, 1);

  const trashId = workspace.projects[0].field.trash.cards[0].id;
  result = applyOperation(workspace, { type: "restore_card", projectId, trashId, targetSetId: originalSetId });
  workspace = result.workspace;
  assert.equal(workspace.projects[0].field.trash.cards.length, 0);
});

test("batch dry-run applies operations without mutating caller state", () => {
  const workspace = createDefaultWorkspaceState();
  const projectId = workspace.activeProjectId;
  const result = applyOperations(workspace, [
    { type: "create_set", projectId, title: "Batch 1" },
    { type: "layout_sets", projectId, layout: "timeline" },
  ]);

  assert.equal(workspace.projects[0].field.sets.length, 1);
  assert.equal(result.workspace.projects[0].field.sets.length, 2);
});

test("card operations can place their target set at canvas coordinates", () => {
  let workspace = createDefaultWorkspaceState();
  const projectId = workspace.activeProjectId;
  const originalSetId = workspace.projects[0].field.sets[0].id;

  let result = applyOperation(workspace, {
    type: "create_card",
    projectId,
    setId: originalSetId,
    position: { x: 120, y: -80 },
    card: { note: "Placed card" },
  });
  workspace = result.workspace;
  const originalSet = workspace.projects[0].field.sets.find((set) => set.id === originalSetId);
  assert.deepEqual(originalSet.position, { x: 120, y: -80 });
  const placedCardId = originalSet.activeId;

  result = applyOperation(workspace, {
    type: "create_set",
    projectId,
    title: "Target",
    position: { x: -20, y: 40 },
  });
  workspace = result.workspace;
  const targetSetId = workspace.projects[0].field.activeSetId;
  const sourcePositionBeforeMove = workspace.projects[0].field.sets.find((set) => set.id === originalSetId).position;

  result = applyOperation(workspace, {
    type: "move_card",
    projectId,
    sourceSetId: originalSetId,
    targetSetId,
    cardId: placedCardId,
    position: { x: 320, y: 140 },
  });
  workspace = result.workspace;
  const movedSourceSet = workspace.projects[0].field.sets.find((set) => set.id === originalSetId);
  const movedTargetSet = workspace.projects[0].field.sets.find((set) => set.id === targetSetId);
  assert.deepEqual(movedSourceSet.position, sourcePositionBeforeMove);
  assert.deepEqual(movedTargetSet.position, { x: 320, y: 140 });

  result = applyOperation(workspace, {
    type: "trash_card",
    projectId,
    setId: targetSetId,
    cardId: placedCardId,
    confirm: true,
  });
  workspace = result.workspace;
  const trashId = workspace.projects[0].field.trash.cards[0].id;

  result = applyOperation(workspace, {
    type: "restore_card",
    projectId,
    trashId,
    targetSetId,
    position: { x: -240, y: 220 },
  });
  workspace = result.workspace;
  const restoredTargetSet = workspace.projects[0].field.sets.find((set) => set.id === targetSetId);
  assert.deepEqual(restoredTargetSet.position, { x: -240, y: 220 });
});

test("batch dry-run card placement does not mutate caller state", () => {
  const workspace = createDefaultWorkspaceState();
  const projectId = workspace.activeProjectId;
  const setId = workspace.projects[0].field.sets[0].id;
  const originalPosition = { ...workspace.projects[0].field.sets[0].position };

  const result = applyOperations(workspace, [
    {
      type: "create_card",
      projectId,
      setId,
      position: { x: 480, y: -160 },
      card: { note: "Dry-run placement" },
    },
  ]);

  assert.deepEqual(workspace.projects[0].field.sets[0].position, originalPosition);
  assert.deepEqual(result.workspace.projects[0].field.sets[0].position, { x: 480, y: -160 });
  assert.equal(workspace.projects[0].field.sets[0].cards.length, 1);
  assert.equal(result.workspace.projects[0].field.sets[0].cards.length, 2);
});

test("organization operations group, rewire and validate scoped graph", () => {
  let workspace = createDefaultWorkspaceState();
  const projectId = workspace.activeProjectId;
  const originalSetId = workspace.projects[0].field.sets[0].id;

  let result = applyOperation(workspace, {
    type: "create_set",
    projectId,
    title: "Second",
    position: { x: 300, y: 0 },
  });
  workspace = result.workspace;
  const secondSetId = workspace.projects[0].field.activeSetId;

  result = applyOperation(workspace, {
    type: "create_set",
    projectId,
    title: "Outside",
    position: { x: 680, y: 0 },
  });
  workspace = result.workspace;
  const outsideSetId = workspace.projects[0].field.activeSetId;

  workspace = applyOperation(workspace, {
    type: "create_connection",
    projectId,
    fromNodeId: originalSetId,
    toNodeId: secondSetId,
  }).workspace;
  workspace = applyOperation(workspace, {
    type: "create_connection",
    projectId,
    fromNodeId: secondSetId,
    toNodeId: outsideSetId,
  }).workspace;

  result = applyOperation(workspace, {
    type: "group_nodes",
    projectId,
    nodeIds: [originalSetId, secondSetId],
    title: "Cluster",
  });
  workspace = result.workspace;

  const field = workspace.projects[0].field;
  const organization = field.organizations.find((item) => item.title === "Cluster");
  assert.ok(organization);
  assert.equal(field.sets.find((set) => set.id === originalSetId).parentId, organization.id);
  assert.equal(field.connections.some((connection) => connection.scopeId === organization.id), true);
  assert.equal(
    field.connections.some(
      (connection) =>
        (connection.scopeId || null) === null &&
        [connection.fromNodeId, connection.toNodeId].includes(organization.id) &&
        [connection.fromNodeId, connection.toNodeId].includes(outsideSetId)
    ),
    true
  );
  assert.equal(validateWorkspace(workspace).ok, true);
});

test("validation reports cross-scope organization connection errors", () => {
  let workspace = createDefaultWorkspaceState();
  const projectId = workspace.activeProjectId;
  workspace = applyOperation(workspace, {
    type: "create_organization",
    projectId,
    title: "Nested",
  }).workspace;
  const field = workspace.projects[0].field;
  const organizationId = field.organizations[0].id;
  field.sets[0].parentId = organizationId;
  field.connections.push({
    id: "connection-cross",
    scopeId: null,
    fromNodeId: field.sets[0].id,
    toNodeId: organizationId,
  });

  const result = validateWorkspace(workspace);

  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.code === "cross_scope_connection"), true);
});

test("storage snapshots and image pruning work in a temp database", async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "infinimind-mcp-test-"));
  const database = openDatabase(userDataDir);

  try {
    let workspace = createDefaultWorkspaceState();
    await saveWorkspace(database, workspace, { userDataDir });
    const snapshot = createSnapshot(database, "baseline");
    assert.equal(listSnapshots(database, 10)[0].id, snapshot.id);

    const asset = await importImageAsset(
      database,
      {
        dataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        name: "pixel.png",
      },
      { userDataDir }
    );
    assert.equal(listImageAssets(database).length, 1);
    assert.ok(getImageAsset(database, asset.id, userDataDir).path.endsWith(".png"));

    workspace.projects[0].field.sets[0].cards[0].type = "image";
    workspace.projects[0].field.sets[0].cards[0].imageUrl = asset.url;
    await saveWorkspace(database, workspace, { userDataDir });
    assert.equal(listImageAssets(database).length, 1);

    workspace.projects[0].field.sets[0].cards[0].imageUrl = "";
    await saveWorkspace(database, workspace, { userDataDir });
    assert.equal(listImageAssets(database).length, 0);

    await restoreSnapshot(database, snapshot.id, { userDataDir });
    assert.equal(loadWorkspace(database).projects[0].field.sets.length, 1);
  } finally {
    closeDatabase(database);
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});

test("validation reports missing managed images when asset list is known", () => {
  const workspace = createDefaultWorkspaceState();
  workspace.projects[0].field.sets[0].cards[0].type = "image";
  workspace.projects[0].field.sets[0].cards[0].imageUrl = "infinimind-image://missing";

  const result = validateWorkspace(workspace, { imageAssets: [] });
  assert.equal(result.ok, true);
  assert.equal(result.issues.some((issue) => issue.code === "missing_image_asset"), true);
});
