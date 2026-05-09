import test from "node:test";
import assert from "node:assert/strict";
import {
  collectImageIds,
  createConnectionId,
  createDefaultWorkspaceState,
  createOrganization,
  dedupeConnections,
  getImageIdFromUrl,
  normalizeWorkspaceState,
} from "../src/lib/workspaceModel.js";

test("normalizeWorkspaceState migrates legacy single-field state", () => {
  const workspace = normalizeWorkspaceState({
    fieldTitle: "Legacy",
    cards: [{ id: "card-a", type: "text", note: "hello" }],
    activeId: "card-a",
  });

  assert.equal(workspace.version, 1);
  assert.equal(workspace.projects.length, 1);
  assert.equal(workspace.projects[0].field.fieldTitle, "Legacy");
  assert.equal(workspace.projects[0].field.sets[0].cards[0].note, "hello");
  assert.equal(workspace.projects[0].field.version, 5);
  assert.equal(workspace.projects[0].field.sets[0].parentId, null);
  assert.deepEqual(workspace.projects[0].field.organizations, []);
});

test("dedupeConnections treats connections as undirected", () => {
  const connections = dedupeConnections([
    { id: "a", scopeId: null, fromNodeId: "set-1", toNodeId: "set-2" },
    { id: "b", scopeId: null, fromNodeId: "set-2", toNodeId: "set-1" },
    { id: "c", scopeId: "organization-1", fromNodeId: "set-2", toNodeId: "set-1" },
  ]);

  assert.deepEqual(
    connections.map((connection) => connection.id),
    ["a", "c"]
  );
});

test("normalizeWorkspaceState supports nested organizations and scoped connections", () => {
  const workspace = createDefaultWorkspaceState();
  const field = workspace.projects[0].field;
  const organization = createOrganization(0, "organization-a");
  field.organizations.push(organization);
  field.sets[0].parentId = organization.id;
  field.connections = [
    {
      id: createConnectionId(),
      scopeId: organization.id,
      fromNodeId: field.sets[0].id,
      toNodeId: field.sets[0].id,
    },
    {
      id: "connection-valid",
      scopeId: organization.id,
      fromNodeId: field.sets[0].id,
      toNodeId: "organization-missing",
    },
  ];

  const normalized = normalizeWorkspaceState(workspace);

  assert.equal(normalized.projects[0].field.organizations[0].id, organization.id);
  assert.equal(normalized.projects[0].field.sets[0].parentId, organization.id);
  assert.deepEqual(normalized.projects[0].field.connections, []);
});

test("collectImageIds finds nested InfiniMind image URLs", () => {
  const workspace = createDefaultWorkspaceState();
  workspace.projects[0].field.sets[0].cards[0].imageUrl = "infinimind-image://image-123";

  assert.equal(getImageIdFromUrl("infinimind-image://image-123"), "image-123");
  assert.deepEqual([...collectImageIds(workspace)], ["image-123"]);
});
