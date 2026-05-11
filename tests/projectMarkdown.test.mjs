import test from "node:test";
import assert from "node:assert/strict";
import { projectToMarkdown as mcpProjectToMarkdown } from "../mcp/operations.mjs";
import { createMarkdownFilename, projectToMarkdown } from "../src/lib/projectMarkdown.js";
import { createDefaultWorkspaceState } from "../src/lib/workspaceModel.js";

test("projectToMarkdown exports cards, organizations, connections, and trash", () => {
  const workspace = createDefaultWorkspaceState();
  const project = workspace.projects[0];
  const field = project.field;

  project.id = "project-a";
  project.name = "Knowledge Map";
  project.updatedAt = "2026-05-11T00:00:00.000Z";
  field.organizations = [
    {
      id: "organization-a",
      title: "Research Cluster",
      parentId: null,
      position: { x: 12, y: -35 },
      pan: { x: 0, y: 0 },
      zoom: 1,
    },
  ];
  field.sets = [
    {
      id: "set-a",
      title: "Sources",
      parentId: "organization-a",
      position: { x: 100, y: 50 },
      activeId: "card-text",
      cards: [
        { id: "card-text", type: "text", note: "Primary source note" },
        { id: "card-link", type: "link", linkTitle: "Docs", linkUrl: "https://example.com/docs" },
        { id: "card-image", type: "image", imageUrl: "infinimind-image://image-123", imageTone: "color" },
        {
          id: "card-attachment",
          type: "attachment",
          attachmentName: "brief.pdf",
          attachmentUrl: "infinimind-image://image-456",
          attachmentMime: "application/pdf",
          attachmentSize: 4096,
        },
      ],
    },
    {
      id: "set-b",
      title: "Findings",
      parentId: "organization-a",
      position: { x: 320, y: 50 },
      activeId: "card-finding",
      cards: [{ id: "card-finding", type: "text", note: "Connected finding" }],
    },
  ];
  field.connections = [
    {
      id: "connection-a",
      scopeId: "organization-a",
      fromNodeId: "set-a",
      toNodeId: "set-b",
    },
  ];
  field.trash = {
    cards: [
      {
        id: "trash-card-a",
        sourceSetId: "set-a",
        sourceSetTitle: "Sources",
        card: { id: "card-trash", type: "text", note: "Deleted idea" },
      },
    ],
    sets: [
      {
        id: "trash-set-a",
        set: {
          id: "set-trash",
          title: "Old Set",
          cards: [{ id: "card-old", type: "text", note: "Old note" }],
        },
      },
    ],
    organizations: [],
  };

  const markdown = projectToMarkdown(project, { includeTrash: true });

  assert.match(markdown, /^# Knowledge Map/m);
  assert.match(markdown, /- Sets: 2/);
  assert.match(markdown, /- Organizations: 1/);
  assert.match(markdown, /- Cards: 5/);
  assert.match(markdown, /## Organization: Research Cluster/);
  assert.match(markdown, /- Parent: organization-a/);
  assert.match(markdown, /### 1\. TEXT card-text/);
  assert.match(markdown, /URL: https:\/\/example\.com\/docs/);
  assert.match(markdown, /Image: infinimind-image:\/\/image-123/);
  assert.match(markdown, /Name: brief\.pdf/);
  assert.match(markdown, /- \[organization-a\] Sources -> Findings \(connection-a\)/);
  assert.match(markdown, /## Trash/);
  assert.match(markdown, /- Set: Old Set \(trash-set-a, 1 cards\)/);
  assert.match(markdown, /- Card: Deleted idea \(trash-card-a, from Sources\)/);
});

test("MCP operations continue to re-export projectToMarkdown", () => {
  const workspace = createDefaultWorkspaceState();

  assert.equal(
    mcpProjectToMarkdown(workspace.projects[0], { includeTrash: true }),
    projectToMarkdown(workspace.projects[0], { includeTrash: true })
  );
});

test("createMarkdownFilename produces safe Markdown filenames", () => {
  assert.equal(createMarkdownFilename(""), "infinimind-project.md");
  assert.equal(createMarkdownFilename("../Plan: Phase/1"), "Plan- Phase-1.md");
  assert.equal(createMarkdownFilename("Research.md"), "Research.md");
});
