import test from "node:test";
import assert from "node:assert/strict";
import {
  collectImageIds,
  createConnectionId,
  createDefaultState,
  createDefaultWorkspaceState,
  createOrganization,
  dedupeConnections,
  getConnectionNodeIds,
  getImageIdFromUrl,
  normalizeConnection,
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

test("createDefaultState can intentionally create an empty canvas", () => {
  const field = createDefaultState("MCP Canvas", { includeStarterSet: false });
  const normalized = normalizeWorkspaceState({
    version: 1,
    activeProjectId: "project-empty",
    projects: [
      {
        id: "project-empty",
        name: "MCP Canvas",
        field,
      },
    ],
  });

  assert.deepEqual(normalized.projects[0].field.sets, []);
  assert.equal(normalized.projects[0].field.activeSetId, null);
});

test("dedupeConnections treats connections as undirected", () => {
  const connections = dedupeConnections([
    { id: "a", scopeId: null, fromNodeId: "set-1", toNodeId: "set-2", label: "depends on" },
    { id: "b", scopeId: null, fromNodeId: "set-2", toNodeId: "set-1" },
    { id: "c", scopeId: "organization-1", fromNodeId: "set-2", toNodeId: "set-1" },
  ]);

  assert.deepEqual(
    connections.map((connection) => connection.id),
    ["a", "c"]
  );
  assert.equal(connections[0].label, "depends on");
});

test("getConnectionNodeIds supports legacy set endpoints", () => {
  assert.deepEqual(getConnectionNodeIds({ fromSetId: "set-a", toSetId: "set-b" }), {
    fromNodeId: "set-a",
    toNodeId: "set-b",
  });
  assert.deepEqual(getConnectionNodeIds({ fromNodeId: "organization-a", toNodeId: "set-b" }), {
    fromNodeId: "organization-a",
    toNodeId: "set-b",
  });
});

test("normalizeConnection keeps a trimmed relationship label", () => {
  assert.deepEqual(
    normalizeConnection({ id: "connection-a", fromNodeId: "set-a", toNodeId: "set-b", label: "  supports  " }),
    {
      id: "connection-a",
      scopeId: null,
      fromNodeId: "set-a",
      toNodeId: "set-b",
      label: "supports",
    }
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
      label: "  invalid relation  ",
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
  workspace.projects[0].field.trash.cards.push({
    id: "trash-card-1",
    deletedAt: new Date().toISOString(),
    sourceSetId: "set-1",
    sourceSetTitle: "Set 01",
    card: {
      id: "card-attachment",
      type: "attachment",
      attachmentUrl: "infinimind-image://image-456",
      attachmentName: "brief.pdf",
    },
  });

  assert.equal(getImageIdFromUrl("infinimind-image://image-123"), "image-123");
  assert.deepEqual([...collectImageIds(workspace)], ["image-123", "image-456"]);
});

test("normalizeWorkspaceState keeps attachment cards", () => {
  const workspace = normalizeWorkspaceState({
    fieldTitle: "Attachments",
    cards: [
      {
        id: "card-attachment",
        type: "attachment",
        attachmentUrl: "https://example.com/brief.pdf",
        attachmentName: "brief.pdf",
        attachmentMime: "application/pdf",
        attachmentSize: 4096,
      },
    ],
    activeId: "card-attachment",
  });
  const card = workspace.projects[0].field.sets[0].cards[0];

  assert.equal(card.type, "attachment");
  assert.equal(card.attachmentName, "brief.pdf");
  assert.equal(card.attachmentSize, 4096);
});
