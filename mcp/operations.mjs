import {
  createDefaultState,
  getCardPreview,
  getTrashCount,
  maxZoom,
  minZoom,
  normalizeTrash,
  normalizeWorkspaceState,
} from "../src/lib/workspaceModel.js";
import { operationHandlers } from "./operationHandlers.mjs";
import { getConnectionNodeIdsForOperations, getProjectOrThrow, workspaceResourceLinks } from "./operationShared.mjs";
import { isDescendantOrganization } from "./operationScope.mjs";
import { trackId, validateCard } from "./operationValidation.mjs";
export { projectToMarkdown } from "../src/lib/projectMarkdown.js";
export { getProjectOrThrow, workspaceResourceLinks };

export const operationTypes = [
  "create_project",
  "rename_project",
  "set_active_project",
  "delete_project",
  "create_set",
  "update_set",
  "layout_sets",
  "trash_set",
  "restore_set",
  "create_organization",
  "update_organization",
  "group_nodes",
  "move_node",
  "trash_organization",
  "restore_organization",
  "delete_trash_item",
  "create_card",
  "update_card",
  "reorder_cards",
  "move_card",
  "trash_card",
  "restore_card",
  "create_connection",
  "delete_connection",
];

export function listProjectSummaries(workspace) {
  return normalizeWorkspaceState(workspace).projects.map((project) => summarizeProject(project, workspace.activeProjectId));
}

export function summarizeWorkspace(workspace, metadata = {}) {
  const normalized = normalizeWorkspaceState(workspace);

  return {
    version: normalized.version,
    activeProjectId: normalized.activeProjectId,
    projectCount: normalized.projects.length,
    projects: normalized.projects.map((project) => summarizeProject(project, normalized.activeProjectId)),
    storage: metadata,
  };
}

export function summarizeProject(project, activeProjectId) {
  const sets = project.field?.sets || [];
  const organizations = project.field?.organizations || [];
  const cardCount = sets.reduce((total, set) => total + set.cards.length, 0);
  const trash = normalizeTrash(project.field?.trash);

  return {
    id: project.id,
    name: project.name,
    fieldTitle: project.field?.fieldTitle || project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    isActive: project.id === activeProjectId,
    setCount: sets.length,
    organizationCount: organizations.length,
    cardCount,
    connectionCount: project.field?.connections?.length || 0,
    trashCount: getTrashCount(trash),
    resource: `infinimind://project/${project.id}`,
  };
}

export function projectToGraph(project) {
  const sets = project.field?.sets || [];
  const organizations = project.field?.organizations || [];
  const nodeIds = new Set([...sets.map((set) => set.id), ...organizations.map((organization) => organization.id)]);

  return {
    nodes: [
      ...organizations.map((organization) => ({
        id: organization.id,
        type: "organization",
        title: organization.title,
        parentId: organization.parentId || null,
        x: organization.position?.x || 0,
        y: organization.position?.y || 0,
        childSetCount: sets.filter((set) => set.parentId === organization.id).length,
        childOrganizationCount: organizations.filter((item) => item.parentId === organization.id).length,
      })),
      ...sets.map((set) => ({
        id: set.id,
        type: "set",
        title: set.title,
        parentId: set.parentId || null,
        x: set.position?.x || 0,
        y: set.position?.y || 0,
        cardCount: set.cards.length,
        preview: getCardPreview(set.cards.find((card) => card.id === set.activeId) || set.cards[0]),
      })),
    ],
    edges: (project.field?.connections || [])
      .map((connection) => ({ connection, ...getConnectionNodeIdsForOperations(connection) }))
      .filter(({ fromNodeId, toNodeId }) => nodeIds.has(fromNodeId) && nodeIds.has(toNodeId))
      .map(({ connection, fromNodeId, toNodeId }) => ({
        id: connection.id,
        scopeId: connection.scopeId || null,
        fromNodeId,
        toNodeId,
      })),
  };
}

export function searchWorkspace(workspace, options = {}) {
  const normalized = normalizeWorkspaceState(workspace);
  const query = String(options.query || "").trim().toLowerCase();
  const projectFilter = options.projectId ? new Set([options.projectId]) : null;
  const typeFilter = options.cardType ? new Set([options.cardType]) : null;
  const includeTrash = options.includeTrash !== false;
  const matches = [];

  if (!query && !typeFilter) {
    return matches;
  }

  for (const project of normalized.projects) {
    if (projectFilter && !projectFilter.has(project.id)) {
      continue;
    }

    if (matchesText(project.name, query) || matchesText(project.field?.fieldTitle, query)) {
      matches.push({
        kind: "project",
        projectId: project.id,
        title: project.name,
        preview: project.field?.fieldTitle || project.name,
        resource: `infinimind://project/${project.id}`,
      });
    }

    for (const organization of project.field?.organizations || []) {
      if (matchesText(organization.title, query)) {
        matches.push({
          kind: "organization",
          projectId: project.id,
          organizationId: organization.id,
          title: organization.title,
          preview: organization.parentId ? `Inside ${organization.parentId}` : "Root organization",
          resource: `infinimind://organization/${project.id}/${organization.id}`,
        });
      }
    }

    for (const set of project.field?.sets || []) {
      if (matchesText(set.title, query)) {
        matches.push({
          kind: "set",
          projectId: project.id,
          setId: set.id,
          title: set.title,
          preview: getCardPreview(set.cards.find((card) => card.id === set.activeId) || set.cards[0]),
          resource: `infinimind://set/${project.id}/${set.id}`,
        });
      }

      for (const card of set.cards) {
        if (typeFilter && !typeFilter.has(card.type)) {
          continue;
        }

        const text = getSearchableCardText(card);
        if (!query || matchesText(text, query)) {
          matches.push({
            kind: "card",
            projectId: project.id,
            setId: set.id,
            cardId: card.id,
            cardType: card.type,
            title: set.title,
            preview: getCardPreview(card),
            resource: `infinimind://card/${project.id}/${set.id}/${card.id}`,
          });
        }
      }
    }

    if (!includeTrash) {
      continue;
    }

    const trash = normalizeTrash(project.field?.trash);
    for (const item of trash.cards) {
      if (typeFilter && !typeFilter.has(item.card.type)) {
        continue;
      }
      if (!query || matchesText(getSearchableCardText(item.card), query)) {
        matches.push({
          kind: "trash-card",
          projectId: project.id,
          trashId: item.id,
          cardType: item.card.type,
          title: item.sourceSetTitle || item.sourceSetId,
          preview: getCardPreview(item.card),
          resource: `infinimind://project/${project.id}/trash`,
        });
      }
    }

    for (const item of trash.sets) {
      if (matchesText(item.set.title, query)) {
        matches.push({
          kind: "trash-set",
          projectId: project.id,
          trashId: item.id,
          title: item.set.title,
          preview: `${item.set.cards.length} cards`,
          resource: `infinimind://project/${project.id}/trash`,
        });
      }
    }
  }

  return matches.slice(0, Math.min(Math.max(Number(options.limit) || 50, 1), 200));
}

export function validateWorkspace(workspace, options = {}) {
  const normalized = normalizeWorkspaceState(workspace);
  const issues = [];
  const seenIds = new Map();
  const knownImageIds = Array.isArray(options.imageAssets) ? new Set(options.imageAssets.map((asset) => asset.id)) : null;

  if (normalized.projects.length === 0) {
    issues.push({ severity: "warning", code: "empty_workspace", message: "Workspace has no projects." });
  }

  if (normalized.activeProjectId && !normalized.projects.some((project) => project.id === normalized.activeProjectId)) {
    issues.push({ severity: "error", code: "missing_active_project", message: "Active project does not exist." });
  }

  for (const project of normalized.projects) {
    trackId(seenIds, issues, project.id, `project:${project.name}`);
    const field = project.field || createDefaultState(project.name);

    if (field.zoom < minZoom || field.zoom > maxZoom) {
      issues.push({
        severity: "error",
        code: "invalid_zoom",
        projectId: project.id,
        message: `Project zoom ${field.zoom} is outside ${minZoom}-${maxZoom}.`,
      });
    }
    if (!Number.isFinite(field.pan?.x) || !Number.isFinite(field.pan?.y)) {
      issues.push({ severity: "error", code: "invalid_pan", projectId: project.id, message: "Project pan is invalid." });
    }

    const organizationIds = new Set((field.organizations || []).map((organization) => organization.id));
    const setIds = new Set(field.sets.map((set) => set.id));
    const nodeParents = new Map([
      ...field.sets.map((set) => [set.id, set.parentId || null]),
      ...(field.organizations || []).map((organization) => [organization.id, organization.parentId || null]),
    ]);
    const nodeIds = new Set(nodeParents.keys());
    if (field.activeSetId && !setIds.has(field.activeSetId)) {
      issues.push({
        severity: "error",
        code: "missing_active_set",
        projectId: project.id,
        message: "Active set does not exist.",
      });
    }

    for (const organization of field.organizations || []) {
      trackId(seenIds, issues, organization.id, `organization:${organization.title}`);
      if (organization.parentId && !organizationIds.has(organization.parentId)) {
        issues.push({
          severity: "error",
          code: "orphan_organization",
          projectId: project.id,
          organizationId: organization.id,
          message: "Organization parent does not exist.",
        });
      }
      if (organization.parentId && isDescendantOrganization(organization.parentId, organization.id, field.organizations || [])) {
        issues.push({
          severity: "error",
          code: "organization_cycle",
          projectId: project.id,
          organizationId: organization.id,
          message: "Organization hierarchy contains a cycle.",
        });
      }
    }

    for (const set of field.sets) {
      trackId(seenIds, issues, set.id, `set:${set.title}`);
      if (set.parentId && !organizationIds.has(set.parentId)) {
        issues.push({
          severity: "error",
          code: "orphan_set_parent",
          projectId: project.id,
          setId: set.id,
          message: "Set parent organization does not exist.",
        });
      }
      const cardIds = new Set(set.cards.map((card) => card.id));
      if (set.activeId && !cardIds.has(set.activeId)) {
        issues.push({
          severity: "error",
          code: "missing_active_card",
          projectId: project.id,
          setId: set.id,
          message: "Set active card does not exist.",
        });
      }
      for (const card of set.cards) {
        trackId(seenIds, issues, card.id, `card:${card.type}`);
        validateCard(project.id, set.id, card, knownImageIds, issues);
      }
    }

    const connectionKeys = new Set();
    for (const connection of field.connections) {
      trackId(seenIds, issues, connection.id, "connection");
      const { fromNodeId, toNodeId } = getConnectionNodeIdsForOperations(connection);
      const scopeId = connection.scopeId || null;
      if (fromNodeId === toNodeId) {
        issues.push({ severity: "error", code: "self_connection", projectId: project.id, connectionId: connection.id });
      }
      if (!nodeIds.has(fromNodeId) || !nodeIds.has(toNodeId)) {
        issues.push({ severity: "error", code: "orphan_connection", projectId: project.id, connectionId: connection.id });
      }
      if ((nodeParents.get(fromNodeId) || null) !== scopeId || (nodeParents.get(toNodeId) || null) !== scopeId) {
        issues.push({ severity: "error", code: "cross_scope_connection", projectId: project.id, connectionId: connection.id });
      }
      const key = `${scopeId || "root"}:${[fromNodeId, toNodeId].sort().join("--")}`;
      if (connectionKeys.has(key)) {
        issues.push({ severity: "warning", code: "duplicate_connection", projectId: project.id, connectionId: connection.id });
      }
      connectionKeys.add(key);
    }

    const trash = normalizeTrash(field.trash);
    for (const item of trash.cards) {
      trackId(seenIds, issues, item.id, "trash-card");
      validateCard(project.id, item.sourceSetId, item.card, knownImageIds, issues, item.id);
    }
    for (const item of trash.sets) {
      trackId(seenIds, issues, item.id, "trash-set");
      trackId(seenIds, issues, item.set.id, `trash-set-original:${item.set.title}`);
    }
    for (const item of trash.organizations) {
      trackId(seenIds, issues, item.id, "trash-organization");
      trackId(seenIds, issues, item.organization.id, `trash-organization-original:${item.organization.title}`);
    }
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issueCount: issues.length,
    issues,
  };
}

export function applyOperation(workspace, operation) {
  const next = normalizeWorkspaceState(structuredCloneJson(workspace));
  const type = normalizeOperationType(operation.type || operation.tool || operation.name);
  const handler = operationHandlers[type];

  if (!handler) {
    throw new Error(`Unsupported operation type: ${operation.type || operation.tool || operation.name}`);
  }

  const change = handler(next, operation);

  return {
    workspace: normalizeWorkspaceState(next),
    changes: [change],
  };
}

export function applyOperations(workspace, operations) {
  if (!Array.isArray(operations)) {
    throw new Error("operations must be an array.");
  }
  if (operations.length > 50) {
    throw new Error("A batch can include at most 50 operations.");
  }

  let current = normalizeWorkspaceState(workspace);
  const changes = [];
  for (const operation of operations) {
    const result = applyOperation(current, operation);
    current = result.workspace;
    changes.push(...result.changes);
  }

  return {
    workspace: current,
    changes,
  };
}

export function workspaceSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "InfiniMind Workspace State v1",
    type: "object",
    required: ["version", "projects", "activeProjectId"],
    properties: {
      version: { const: 1 },
      activeProjectId: { type: ["string", "null"] },
      projects: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "name", "createdAt", "updatedAt", "field"],
          properties: {
            id: { type: "string", pattern: "^project-" },
            name: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            field: {
              type: "object",
              required: ["version", "fieldTitle", "sets", "organizations", "activeSetId", "connections", "trash", "pan", "zoom"],
              properties: {
                version: { const: 5 },
                fieldTitle: { type: "string" },
                sets: { type: "array" },
                organizations: { type: "array" },
                activeSetId: { type: "string" },
                connections: { type: "array" },
                trash: { type: "object" },
                pan: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
                zoom: { type: "number", minimum: minZoom, maximum: maxZoom },
              },
            },
          },
        },
      },
    },
  };
}

function normalizeOperationType(type) {
  if (typeof type !== "string") {
    throw new Error("Operation type is required.");
  }
  return type.replace(/^infinimind_/, "");
}

function structuredCloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function matchesText(value, query) {
  if (!query) {
    return false;
  }
  return String(value || "").toLowerCase().includes(query);
}

function getSearchableCardText(card) {
  return [
    card.note,
    card.imageUrl,
    card.imageTone,
    card.linkTitle,
    card.linkUrl,
    card.attachmentName,
    card.attachmentUrl,
    card.attachmentMime,
  ]
    .filter(Boolean)
    .join("\n");
}
