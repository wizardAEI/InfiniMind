import {
  cardTypeIds,
  createBlankCard,
  createCardId,
  createCardSet,
  createConnectionId,
  createDefaultState,
  createOrganization,
  createOrganizationId,
  createProject,
  createSetId,
  createTrashItemId,
  dedupeConnections,
  getCardPreview,
  getImageIdFromUrl,
  getRandomImageStyle,
  getTrashCount,
  hasConnection,
  maxZoom,
  minZoom,
  normalizeCard,
  normalizeTrash,
  normalizeWorkspaceState,
} from "../src/lib/workspaceModel.js";

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

export function getProjectOrThrow(workspace, projectId) {
  const targetId = projectId || workspace.activeProjectId || workspace.projects?.[0]?.id;
  const project = workspace.projects?.find((item) => item.id === targetId);

  if (!project) {
    throw new Error(targetId ? `Project not found: ${targetId}` : "No project available.");
  }

  return project;
}

export function projectToMarkdown(project, options = {}) {
  const lines = [];
  const trash = normalizeTrash(project.field?.trash);
  const sets = project.field?.sets || [];
  const organizations = project.field?.organizations || [];
  const connections = project.field?.connections || [];

  lines.push(`# ${project.name || project.field?.fieldTitle || "Untitled Project"}`);
  lines.push("");
  lines.push(`- Project ID: ${project.id}`);
  lines.push(`- Updated: ${project.updatedAt || "unknown"}`);
  lines.push(`- Sets: ${sets.length}`);
  lines.push(`- Organizations: ${organizations.length}`);
  lines.push(`- Cards: ${sets.reduce((total, set) => total + set.cards.length, 0)}`);
  lines.push(`- Connections: ${connections.length}`);
  lines.push(`- Trash: ${getTrashCount(trash)}`);
  lines.push("");

  for (const organization of organizations) {
    lines.push(`## Organization: ${organization.title || "Untitled Organization"}`);
    lines.push("");
    lines.push(`- Organization ID: ${organization.id}`);
    lines.push(`- Parent: ${organization.parentId || "root"}`);
    lines.push(`- Position: ${Math.round(organization.position?.x || 0)}, ${Math.round(organization.position?.y || 0)}`);
    lines.push("");
  }

  for (const set of sets) {
    lines.push(`## ${set.title || "Untitled Set"}`);
    lines.push("");
    lines.push(`- Set ID: ${set.id}`);
    lines.push(`- Parent: ${set.parentId || "root"}`);
    lines.push(`- Position: ${Math.round(set.position?.x || 0)}, ${Math.round(set.position?.y || 0)}`);
    lines.push(`- Active Card: ${set.activeId}`);
    lines.push("");

    if (options.includeCards !== false) {
      for (const [index, card] of set.cards.entries()) {
        lines.push(`### ${index + 1}. ${card.type.toUpperCase()} ${card.id}`);
        if (card.type === "text") {
          lines.push(card.note || "_No memo yet_");
        } else if (card.type === "image") {
          lines.push(card.imageUrl ? `Image: ${card.imageUrl}` : "_Image placeholder_");
          lines.push(`Tone: ${card.imageTone || "mono"}`);
        } else if (card.type === "link") {
          lines.push(`Title: ${card.linkTitle || ""}`);
          lines.push(`URL: ${card.linkUrl || ""}`);
        } else if (card.type === "attachment") {
          lines.push(`Name: ${card.attachmentName || ""}`);
          lines.push(`URL: ${card.attachmentUrl || ""}`);
          lines.push(`MIME: ${card.attachmentMime || ""}`);
          lines.push(`Size: ${card.attachmentSize || 0}`);
        }
        lines.push("");
      }
    }
  }

  if (connections.length > 0) {
    const nodeById = new Map([
      ...sets.map((set) => [set.id, set]),
      ...organizations.map((organization) => [organization.id, organization]),
    ]);
    lines.push("## Connections");
    lines.push("");
    for (const connection of connections) {
      const fromNodeId = connection.fromNodeId || connection.fromSetId;
      const toNodeId = connection.toNodeId || connection.toSetId;
      const from = nodeById.get(fromNodeId);
      const to = nodeById.get(toNodeId);
      lines.push(`- [${connection.scopeId || "root"}] ${from?.title || fromNodeId} -> ${to?.title || toNodeId} (${connection.id})`);
    }
    lines.push("");
  }

  if (options.includeTrash && getTrashCount(trash) > 0) {
    lines.push("## Trash");
    lines.push("");
    for (const item of trash.sets) {
      lines.push(`- Set: ${item.set.title} (${item.id}, ${item.set.cards.length} cards)`);
    }
    for (const item of trash.cards) {
      lines.push(`- Card: ${getCardPreview(item.card)} (${item.id}, from ${item.sourceSetTitle || item.sourceSetId})`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
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
      .filter((connection) => nodeIds.has(connection.fromNodeId || connection.fromSetId) && nodeIds.has(connection.toNodeId || connection.toSetId))
      .map((connection) => ({
        id: connection.id,
        scopeId: connection.scopeId || null,
        fromNodeId: connection.fromNodeId || connection.fromSetId,
        toNodeId: connection.toNodeId || connection.toSetId,
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
      const fromNodeId = connection.fromNodeId || connection.fromSetId;
      const toNodeId = connection.toNodeId || connection.toSetId;
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
  const changes = [];

  switch (type) {
    case "create_project":
      changes.push(createProjectOperation(next, operation));
      break;
    case "rename_project":
      changes.push(renameProjectOperation(next, operation));
      break;
    case "set_active_project":
      changes.push(setActiveProjectOperation(next, operation));
      break;
    case "delete_project":
      changes.push(deleteProjectOperation(next, operation));
      break;
    case "create_set":
      changes.push(createSetOperation(next, operation));
      break;
    case "update_set":
      changes.push(updateSetOperation(next, operation));
      break;
    case "layout_sets":
      changes.push(layoutSetsOperation(next, operation));
      break;
    case "trash_set":
      changes.push(trashSetOperation(next, operation));
      break;
    case "restore_set":
      changes.push(restoreSetOperation(next, operation));
      break;
    case "create_organization":
      changes.push(createOrganizationOperation(next, operation));
      break;
    case "update_organization":
      changes.push(updateOrganizationOperation(next, operation));
      break;
    case "group_nodes":
      changes.push(groupNodesOperation(next, operation));
      break;
    case "move_node":
      changes.push(moveNodeOperation(next, operation));
      break;
    case "trash_organization":
      changes.push(trashOrganizationOperation(next, operation));
      break;
    case "restore_organization":
      changes.push(restoreOrganizationOperation(next, operation));
      break;
    case "delete_trash_item":
      changes.push(deleteTrashItemOperation(next, operation));
      break;
    case "create_card":
      changes.push(createCardOperation(next, operation));
      break;
    case "update_card":
      changes.push(updateCardOperation(next, operation));
      break;
    case "reorder_cards":
      changes.push(reorderCardsOperation(next, operation));
      break;
    case "move_card":
      changes.push(moveCardOperation(next, operation));
      break;
    case "trash_card":
      changes.push(trashCardOperation(next, operation));
      break;
    case "restore_card":
      changes.push(restoreCardOperation(next, operation));
      break;
    case "create_connection":
      changes.push(createConnectionOperation(next, operation));
      break;
    case "delete_connection":
      changes.push(deleteConnectionOperation(next, operation));
      break;
    default:
      throw new Error(`Unsupported operation type: ${operation.type || operation.tool || operation.name}`);
  }

  return {
    workspace: normalizeWorkspaceState(next),
    changes,
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

export function workspaceResourceLinks(projectId) {
  const links = {
    workspace: "infinimind://workspace/summary",
    raw: "infinimind://workspace/raw",
  };

  if (projectId) {
    links.project = `infinimind://project/${projectId}`;
    links.projectMarkdown = `infinimind://project/${projectId}/markdown`;
    links.graph = `infinimind://project/${projectId}/graph`;
    links.trash = `infinimind://project/${projectId}/trash`;
  }

  return links;
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

function createProjectOperation(workspace, input) {
  const field = createDefaultState(input.name?.trim() || `Project ${String(workspace.projects.length + 1).padStart(2, "0")}`);
  if (typeof input.seedNote === "string") {
    field.sets[0].cards[0].note = input.seedNote;
  }
  const project = createProject(workspace.projects.length, field);
  if (typeof input.name === "string" && input.name.trim()) {
    project.name = input.name.trim();
    project.field.fieldTitle = input.name.trim();
  }

  workspace.projects.push(project);
  if (input.makeActive !== false) {
    workspace.activeProjectId = project.id;
  }

  return change("create_project", project.id, `Created project "${project.name}".`, workspaceResourceLinks(project.id));
}

function renameProjectOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  const name = requireNonEmptyString(input.name, "name");
  project.name = name;
  project.field.fieldTitle = name;
  touchProject(project);
  return change("rename_project", project.id, `Renamed project to "${name}".`, workspaceResourceLinks(project.id));
}

function setActiveProjectOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  workspace.activeProjectId = project.id;
  return change("set_active_project", project.id, `Set "${project.name}" as active project.`, workspaceResourceLinks(project.id));
}

function deleteProjectOperation(workspace, input) {
  requireConfirm(input);
  const project = getProjectOrThrow(workspace, input.projectId);
  if (workspace.projects.length <= 1 && !input.allowEmptyWorkspace) {
    throw new Error("Deleting the last project is blocked unless allowEmptyWorkspace is true.");
  }

  workspace.projects = workspace.projects.filter((item) => item.id !== project.id);
  if (!workspace.projects.some((item) => item.id === workspace.activeProjectId)) {
    workspace.activeProjectId = workspace.projects[0]?.id || null;
  }

  return change("delete_project", project.id, `Deleted project "${project.name}".`, workspaceResourceLinks(workspace.activeProjectId));
}

function createSetOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  const field = project.field;
  const nextSet = {
    ...createCardSet(field.sets.length, createSetId()),
    title: typeof input.title === "string" && input.title.trim() ? input.title.trim() : `Set ${String(field.sets.length + 1).padStart(2, "0")}`,
  };

  if (input.position) {
    nextSet.position = normalizePosition(input.position, nextSet.position);
  }
  if (typeof input.parentId === "string") {
    getOrganizationOrThrow(project, input.parentId);
    nextSet.parentId = input.parentId;
  }
  if (Array.isArray(input.seedCards) && input.seedCards.length > 0) {
    nextSet.cards = input.seedCards.map((card) => createCardFromInput(card));
    nextSet.activeId = nextSet.cards[0].id;
  }

  field.sets.push(nextSet);
  field.activeSetId = nextSet.id;
  touchProject(project);
  return change("create_set", project.id, `Created set "${nextSet.title}".`, {
    ...workspaceResourceLinks(project.id),
    set: `infinimind://set/${project.id}/${nextSet.id}`,
  });
}

function updateSetOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  const set = getSetOrThrow(project, input.setId);
  if (typeof input.title === "string") {
    set.title = input.title;
  }
  if (input.position) {
    set.position = normalizePosition(input.position, set.position);
  }
  if (input.parentId !== undefined) {
    if (input.parentId !== null) {
      getOrganizationOrThrow(project, input.parentId);
    }
    set.parentId = input.parentId || null;
  }
  if (typeof input.activeCardId === "string") {
    if (!set.cards.some((card) => card.id === input.activeCardId)) {
      throw new Error(`Card not found in set: ${input.activeCardId}`);
    }
    set.activeId = input.activeCardId;
  }
  touchProject(project);
  return change("update_set", project.id, `Updated set "${set.title}".`, {
    ...workspaceResourceLinks(project.id),
    set: `infinimind://set/${project.id}/${set.id}`,
  });
}

function layoutSetsOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  const layout = input.layout || "grid";
  const sets = project.field.sets;

  if (layout === "grid") {
    const columns = Math.max(1, Math.ceil(Math.sqrt(sets.length)));
    sets.forEach((set, index) => {
      set.position = {
        x: (index % columns) * 360 - ((columns - 1) * 360) / 2,
        y: Math.floor(index / columns) * 260,
      };
    });
  } else if (layout === "radial") {
    const radius = Math.max(320, sets.length * 70);
    sets.forEach((set, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(sets.length, 1) - Math.PI / 2;
      set.position = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    });
  } else if (layout === "timeline") {
    sets.forEach((set, index) => {
      set.position = {
        x: (index - (sets.length - 1) / 2) * 360,
        y: 0,
      };
    });
  } else {
    throw new Error(`Unsupported layout: ${layout}`);
  }

  touchProject(project);
  return change("layout_sets", project.id, `Applied ${layout} layout to ${sets.length} sets.`, workspaceResourceLinks(project.id));
}

function trashSetOperation(workspace, input) {
  requireConfirm(input);
  const project = getProjectOrThrow(workspace, input.projectId);
  const field = project.field;
  const deleteIndex = field.sets.findIndex((set) => set.id === input.setId);
  const deletedSet = field.sets[deleteIndex];
  if (!deletedSet) {
    throw new Error(`Set not found: ${input.setId}`);
  }

  const remainingSets = field.sets.filter((set) => set.id !== input.setId);
  const nextSets = remainingSets.length > 0 ? remainingSets : [createCardSet(0, createSetId())];
  const activeSetStillExists = nextSets.some((set) => set.id === field.activeSetId);
  const fallbackActiveIndex = Math.max(0, Math.min(deleteIndex, nextSets.length - 1));
  const removedConnections = field.connections.filter(
    (connection) => (connection.fromNodeId || connection.fromSetId) === input.setId || (connection.toNodeId || connection.toSetId) === input.setId
  );
  const trash = normalizeTrash(field.trash);

  field.sets = nextSets;
  field.activeSetId = activeSetStillExists ? field.activeSetId : nextSets[fallbackActiveIndex].id;
  field.connections = field.connections.filter(
    (connection) => (connection.fromNodeId || connection.fromSetId) !== input.setId && (connection.toNodeId || connection.toSetId) !== input.setId
  );
  field.trash = {
    ...trash,
    sets: [
      {
        id: createTrashItemId("set"),
        deletedAt: new Date().toISOString(),
        set: deletedSet,
        connections: removedConnections,
      },
      ...trash.sets,
    ],
  };
  touchProject(project);
  return change("trash_set", project.id, `Moved set "${deletedSet.title}" to trash.`, workspaceResourceLinks(project.id));
}

function restoreSetOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  const field = project.field;
  const trash = normalizeTrash(field.trash);
  const item = trash.sets.find((trashItem) => trashItem.id === input.trashId);
  if (!item) {
    throw new Error(`Trash set not found: ${input.trashId}`);
  }

  const existingSetIds = new Set(field.sets.map((set) => set.id));
  const oldSetId = item.set.id;
  const restoredSet = existingSetIds.has(oldSetId)
    ? { ...item.set, id: createSetId(), title: `${item.set.title} Restored` }
    : item.set;
  const setIdsAfterRestore = new Set([...field.sets.map((set) => set.id), restoredSet.id]);
  const restoredConnections = item.connections
    .map((connection) => ({
      ...connection,
      id: createConnectionId(),
      fromNodeId: connection.fromNodeId === oldSetId ? restoredSet.id : connection.fromNodeId,
      toNodeId: connection.toNodeId === oldSetId ? restoredSet.id : connection.toNodeId,
    }))
    .filter(
      (connection) =>
        connection.fromNodeId !== connection.toNodeId &&
        setIdsAfterRestore.has(connection.fromNodeId) &&
        setIdsAfterRestore.has(connection.toNodeId)
    );

  field.sets.push(restoredSet);
  field.activeSetId = restoredSet.id;
  field.connections = dedupeConnections([...field.connections, ...restoredConnections]);
  field.trash = {
    ...trash,
    sets: trash.sets.filter((trashItem) => trashItem.id !== input.trashId),
  };
  touchProject(project);
  return change("restore_set", project.id, `Restored set "${restoredSet.title}".`, {
    ...workspaceResourceLinks(project.id),
    set: `infinimind://set/${project.id}/${restoredSet.id}`,
  });
}

function createOrganizationOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  const field = project.field;
  const organization = {
    ...createOrganization(field.organizations.length, createOrganizationId()),
    title:
      typeof input.title === "string" && input.title.trim()
        ? input.title.trim()
        : `Organization ${String(field.organizations.length + 1).padStart(2, "0")}`,
    parentId: input.parentId || null,
  };
  if (organization.parentId) {
    getOrganizationOrThrow(project, organization.parentId);
  }
  if (input.position) {
    organization.position = normalizePosition(input.position, organization.position);
  }

  field.organizations.push(organization);
  touchProject(project);
  return change("create_organization", project.id, `Created organization "${organization.title}".`, {
    ...workspaceResourceLinks(project.id),
    organization: `infinimind://organization/${project.id}/${organization.id}`,
  });
}

function updateOrganizationOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  const organization = getOrganizationOrThrow(project, input.organizationId);
  if (typeof input.title === "string") {
    organization.title = input.title;
  }
  if (input.position) {
    organization.position = normalizePosition(input.position, organization.position);
  }
  if (input.parentId !== undefined) {
    if (input.parentId !== null) {
      getOrganizationOrThrow(project, input.parentId);
      if (input.parentId === organization.id || isDescendantOrganization(input.parentId, organization.id, project.field.organizations)) {
        throw new Error("Cannot move an organization into itself or its descendant.");
      }
    }
    organization.parentId = input.parentId || null;
  }
  if (input.pan) {
    organization.pan = normalizePosition(input.pan, organization.pan);
  }
  if (Number.isFinite(input.zoom)) {
    organization.zoom = Math.min(Math.max(input.zoom, minZoom), maxZoom);
  }

  touchProject(project);
  return change("update_organization", project.id, `Updated organization "${organization.title}".`, workspaceResourceLinks(project.id));
}

function groupNodesOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  const field = project.field;
  const nodeIds = Array.isArray(input.nodeIds) ? input.nodeIds : [];
  if (nodeIds.length === 0) {
    throw new Error("nodeIds must include at least one node.");
  }

  const scopeId = input.scopeId || null;
  const nodes = nodeIds.map((nodeId) => getNodeOrThrow(project, nodeId));
  if (!nodes.every((node) => (node.parentId || null) === scopeId)) {
    throw new Error("All grouped nodes must share the requested scope.");
  }

  const center = input.position || getNodeCentroidForOperations(nodes);
  const organization = {
    ...createOrganization(field.organizations.length, createOrganizationId()),
    title:
      typeof input.title === "string" && input.title.trim()
        ? input.title.trim()
        : `Organization ${String(field.organizations.length + 1).padStart(2, "0")}`,
    parentId: scopeId,
    position: normalizePosition(center, { x: 0, y: 0 }),
  };
  const selectedIds = new Set(nodeIds);

  field.sets = field.sets.map((set) =>
    selectedIds.has(set.id)
      ? { ...set, parentId: organization.id, position: { x: set.position.x - organization.position.x, y: set.position.y - organization.position.y } }
      : set
  );
  field.organizations = [
    ...field.organizations.map((item) =>
      selectedIds.has(item.id)
        ? { ...item, parentId: organization.id, position: { x: item.position.x - organization.position.x, y: item.position.y - organization.position.y } }
        : item
    ),
    organization,
  ];
  field.connections = dedupeConnections(rebaseConnectionsForGroupedNodesForOperations(field.connections, selectedIds, scopeId, organization.id));
  touchProject(project);
  return change("group_nodes", project.id, `Grouped ${nodeIds.length} node${nodeIds.length === 1 ? "" : "s"} into "${organization.title}".`, {
    ...workspaceResourceLinks(project.id),
    organization: `infinimind://organization/${project.id}/${organization.id}`,
  });
}

function moveNodeOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  const node = getNodeOrThrow(project, input.nodeId);
  const sourceScopeId = node.parentId || null;
  const targetOrganizationId = input.targetOrganizationId || null;
  const sourceOrganization = sourceScopeId ? getOrganizationOrThrow(project, sourceScopeId) : null;
  let targetOrganization = null;
  if (targetOrganizationId) {
    targetOrganization = getOrganizationOrThrow(project, targetOrganizationId);
  }
  if (node.kind === "organization" && targetOrganizationId && (node.id === targetOrganizationId || isDescendantOrganization(targetOrganizationId, node.id, project.field.organizations))) {
    throw new Error("Cannot move an organization into itself or its descendant.");
  }
  const nextPosition = input.position
    ? normalizePosition(input.position, node.position)
    : convertNodePositionBetweenScopes(node.position, sourceScopeId, targetOrganizationId, project.field.organizations);
  const sourceContainerId =
    sourceOrganization && (sourceOrganization.parentId || null) === targetOrganizationId ? sourceOrganization.id : null;
  const targetContainerId =
    targetOrganization && (targetOrganization.parentId || null) === sourceScopeId ? targetOrganization.id : null;

  if (node.kind === "set") {
    const set = getSetOrThrow(project, node.id);
    set.parentId = targetOrganizationId;
    set.position = nextPosition;
  } else {
    const organization = getOrganizationOrThrow(project, node.id);
    organization.parentId = targetOrganizationId;
    organization.position = nextPosition;
  }

  if (sourceScopeId !== targetOrganizationId) {
    project.field.connections = dedupeConnections(
      rewireConnectionsForMovedNodeForOperations(project.field.connections, node.id, {
        sourceScopeId,
        targetScopeId: targetOrganizationId,
        sourceContainerId,
        targetContainerId,
      })
    );
  }
  touchProject(project);
  return change("move_node", project.id, `Moved node ${node.id}.`, workspaceResourceLinks(project.id));
}

function trashOrganizationOperation(workspace, input) {
  requireConfirm(input);
  const project = getProjectOrThrow(workspace, input.projectId);
  const organization = getOrganizationOrThrow(project, input.organizationId);
  const field = project.field;
  const descendantOrganizationIds = collectDescendantOrganizationIdsForOperations(organization.id, field.organizations);
  const organizationIds = new Set([organization.id, ...descendantOrganizationIds]);
  const removedOrganizations = field.organizations.filter((item) => organizationIds.has(item.id));
  const removedSets = field.sets.filter((set) => organizationIds.has(set.parentId));
  const removedSetIds = new Set(removedSets.map((set) => set.id));
  const removedNodeIds = new Set([...organizationIds, ...removedSetIds]);
  const removedConnections = field.connections.filter((connection) => {
    const fromNodeId = connection.fromNodeId || connection.fromSetId;
    const toNodeId = connection.toNodeId || connection.toSetId;
    return removedNodeIds.has(fromNodeId) || removedNodeIds.has(toNodeId) || organizationIds.has(connection.scopeId);
  });
  const trash = normalizeTrash(field.trash);

  field.organizations = field.organizations.filter((item) => !organizationIds.has(item.id));
  field.sets = field.sets.filter((set) => !removedSetIds.has(set.id));
  if (field.sets.length === 0) {
    field.sets = [createCardSet(0, createSetId())];
    field.activeSetId = field.sets[0].id;
  } else if (!field.sets.some((set) => set.id === field.activeSetId)) {
    field.activeSetId = field.sets[0].id;
  }
  field.connections = field.connections.filter((connection) => !removedConnections.includes(connection));
  field.trash = {
    ...trash,
    organizations: [
      {
        id: createTrashItemId("organization"),
        deletedAt: new Date().toISOString(),
        organization,
        organizations: removedOrganizations.filter((item) => item.id !== organization.id),
        sets: removedSets,
        connections: removedConnections,
      },
      ...trash.organizations,
    ],
  };
  touchProject(project);
  return change("trash_organization", project.id, `Moved organization "${organization.title}" to trash.`, workspaceResourceLinks(project.id));
}

function restoreOrganizationOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  const field = project.field;
  const trash = normalizeTrash(field.trash);
  const item = trash.organizations.find((trashItem) => trashItem.id === input.trashId);
  if (!item?.organization) {
    throw new Error(`Trash organization not found: ${input.trashId}`);
  }

  field.organizations.push(item.organization, ...(item.organizations || []));
  field.sets.push(...(item.sets || []));
  field.connections = dedupeConnections([...field.connections, ...(item.connections || [])]);
  field.trash = {
    ...trash,
    organizations: trash.organizations.filter((trashItem) => trashItem.id !== input.trashId),
  };
  touchProject(project);
  return change("restore_organization", project.id, `Restored organization "${item.organization.title}".`, workspaceResourceLinks(project.id));
}

function deleteTrashItemOperation(workspace, input) {
  requireConfirm(input);
  requireDeleteText(input);
  const project = getProjectOrThrow(workspace, input.projectId);
  const trash = normalizeTrash(project.field.trash);
  const kind = input.kind;
  if (!["card", "set", "organization"].includes(kind)) {
    throw new Error('kind must be "card", "set", or "organization".');
  }

  const beforeCount = kind === "card" ? trash.cards.length : kind === "set" ? trash.sets.length : trash.organizations.length;
  project.field.trash = {
    ...trash,
    cards: kind === "card" ? trash.cards.filter((item) => item.id !== input.trashId) : trash.cards,
    sets: kind === "set" ? trash.sets.filter((item) => item.id !== input.trashId) : trash.sets,
    organizations:
      kind === "organization" ? trash.organizations.filter((item) => item.id !== input.trashId) : trash.organizations,
  };
  const afterCount =
    kind === "card"
      ? project.field.trash.cards.length
      : kind === "set"
        ? project.field.trash.sets.length
        : project.field.trash.organizations.length;
  if (beforeCount === afterCount) {
    throw new Error(`Trash ${kind} not found: ${input.trashId}`);
  }

  touchProject(project);
  return change("delete_trash_item", project.id, `Permanently deleted ${kind} trash item.`, workspaceResourceLinks(project.id));
}

function createCardOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  const set = getSetOrThrow(project, input.setId);
  const card = createCardFromInput(input.card || input);
  let insertionIndex = set.cards.length;

  if (typeof input.afterCardId === "string") {
    const afterIndex = set.cards.findIndex((item) => item.id === input.afterCardId);
    if (afterIndex === -1) {
      throw new Error(`afterCardId not found: ${input.afterCardId}`);
    }
    insertionIndex = afterIndex + 1;
  } else if (Number.isInteger(input.index)) {
    insertionIndex = Math.min(Math.max(input.index, 0), set.cards.length);
  }

  set.cards.splice(insertionIndex, 0, card);
  if (input.position) {
    set.position = normalizePosition(input.position, set.position);
  }
  set.activeId = card.id;
  project.field.activeSetId = set.id;
  touchProject(project);
  return change("create_card", project.id, `Created ${card.type} card in "${set.title}".`, {
    ...workspaceResourceLinks(project.id),
    card: `infinimind://card/${project.id}/${set.id}/${card.id}`,
  });
}

function updateCardOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  const { set, card } = getCardOrThrow(project, input.setId, input.cardId);
  const patch = {};

  if (input.type !== undefined) {
    if (!cardTypeIds.includes(input.type)) {
      throw new Error(`Unsupported card type: ${input.type}`);
    }
    patch.type = input.type;
  }
  for (const key of ["note", "imageUrl", "linkTitle", "linkUrl", "attachmentUrl", "attachmentName", "attachmentMime"]) {
    if (input[key] !== undefined) {
      patch[key] = String(input[key]);
    }
  }
  if (input.attachmentSize !== undefined) {
    patch.attachmentSize = Number.isFinite(input.attachmentSize) ? input.attachmentSize : 0;
  }
  if (input.imageTone !== undefined) {
    patch.imageTone = input.imageTone === "color" ? "color" : "mono";
  }
  if (input.imageStyle !== undefined) {
    patch.imageStyle = String(input.imageStyle);
  }

  Object.assign(card, normalizeCard({ ...card, ...patch }));
  set.activeId = card.id;
  project.field.activeSetId = set.id;
  touchProject(project);
  return change("update_card", project.id, `Updated ${card.type} card in "${set.title}".`, {
    ...workspaceResourceLinks(project.id),
    card: `infinimind://card/${project.id}/${set.id}/${card.id}`,
  });
}

function reorderCardsOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  const set = getSetOrThrow(project, input.setId);
  const cardIds = input.cardIds;
  if (!Array.isArray(cardIds)) {
    throw new Error("cardIds must be an array.");
  }
  if (cardIds.length !== set.cards.length) {
    throw new Error("cardIds must include every card in the set exactly once.");
  }

  const cardById = new Map(set.cards.map((card) => [card.id, card]));
  const seen = new Set();
  set.cards = cardIds.map((cardId) => {
    if (seen.has(cardId) || !cardById.has(cardId)) {
      throw new Error(`Invalid card id in order: ${cardId}`);
    }
    seen.add(cardId);
    return cardById.get(cardId);
  });
  if (!set.cards.some((card) => card.id === set.activeId)) {
    set.activeId = set.cards[0]?.id;
  }
  touchProject(project);
  return change("reorder_cards", project.id, `Reordered ${set.cards.length} cards in "${set.title}".`, {
    ...workspaceResourceLinks(project.id),
    set: `infinimind://set/${project.id}/${set.id}`,
  });
}

function moveCardOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  if (input.sourceSetId === input.targetSetId) {
    throw new Error("sourceSetId and targetSetId must be different. Use reorder_cards within one set.");
  }
  const sourceSet = getSetOrThrow(project, input.sourceSetId);
  const targetSet = getSetOrThrow(project, input.targetSetId);
  const cardIndex = sourceSet.cards.findIndex((card) => card.id === input.cardId);
  if (cardIndex === -1) {
    throw new Error(`Card not found: ${input.cardId}`);
  }

  const [card] = sourceSet.cards.splice(cardIndex, 1);
  if (sourceSet.cards.length === 0) {
    const blank = createBlankCard();
    sourceSet.cards.push(blank);
    sourceSet.activeId = blank.id;
  } else if (sourceSet.activeId === card.id) {
    sourceSet.activeId = sourceSet.cards[Math.max(0, Math.min(cardIndex, sourceSet.cards.length - 1))].id;
  }

  const targetIndex = Number.isInteger(input.index) ? Math.min(Math.max(input.index, 0), targetSet.cards.length) : targetSet.cards.length;
  targetSet.cards.splice(targetIndex, 0, card);
  if (input.position) {
    targetSet.position = normalizePosition(input.position, targetSet.position);
  }
  targetSet.activeId = card.id;
  project.field.activeSetId = targetSet.id;
  touchProject(project);
  return change("move_card", project.id, `Moved card to "${targetSet.title}".`, {
    ...workspaceResourceLinks(project.id),
    card: `infinimind://card/${project.id}/${targetSet.id}/${card.id}`,
  });
}

function trashCardOperation(workspace, input) {
  requireConfirm(input);
  const project = getProjectOrThrow(workspace, input.projectId);
  const set = getSetOrThrow(project, input.setId);
  const cardIndex = set.cards.findIndex((card) => card.id === input.cardId);
  const card = set.cards[cardIndex];
  if (!card) {
    throw new Error(`Card not found: ${input.cardId}`);
  }

  const remainingCards = set.cards.filter((item) => item.id !== input.cardId);
  const nextCards = remainingCards.length > 0 ? remainingCards : [createBlankCard()];
  const fallbackActiveIndex = Math.max(0, Math.min(cardIndex, nextCards.length - 1));
  const trash = normalizeTrash(project.field.trash);

  set.cards = nextCards;
  if (set.activeId === input.cardId) {
    set.activeId = nextCards[fallbackActiveIndex].id;
  }
  project.field.trash = {
    ...trash,
    cards: [
      {
        id: createTrashItemId("card"),
        deletedAt: new Date().toISOString(),
        sourceSetId: set.id,
        sourceSetTitle: set.title,
        card,
      },
      ...trash.cards,
    ],
  };
  touchProject(project);
  return change("trash_card", project.id, `Moved card from "${set.title}" to trash.`, workspaceResourceLinks(project.id));
}

function restoreCardOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  const trash = normalizeTrash(project.field.trash);
  const item = trash.cards.find((trashItem) => trashItem.id === input.trashId);
  if (!item) {
    throw new Error(`Trash card not found: ${input.trashId}`);
  }

  const existingCardIds = new Set(project.field.sets.flatMap((set) => set.cards.map((card) => card.id)));
  const restoredCard = existingCardIds.has(item.card.id) ? { ...item.card, id: createCardId() } : item.card;
  const targetSet =
    project.field.sets.find((set) => set.id === item.sourceSetId) ||
    project.field.sets.find((set) => set.id === input.targetSetId) ||
    project.field.sets.find((set) => set.id === project.field.activeSetId) ||
    project.field.sets[0];
  if (!targetSet) {
    throw new Error("No target set is available for restored card.");
  }

  targetSet.cards.push(restoredCard);
  if (input.position) {
    targetSet.position = normalizePosition(input.position, targetSet.position);
  }
  targetSet.activeId = restoredCard.id;
  project.field.activeSetId = targetSet.id;
  project.field.trash = {
    ...trash,
    cards: trash.cards.filter((trashItem) => trashItem.id !== input.trashId),
  };
  touchProject(project);
  return change("restore_card", project.id, `Restored card into "${targetSet.title}".`, {
    ...workspaceResourceLinks(project.id),
    card: `infinimind://card/${project.id}/${targetSet.id}/${restoredCard.id}`,
  });
}

function createConnectionOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  const fromNodeId = input.fromNodeId || input.fromSetId;
  const toNodeId = input.toNodeId || input.toSetId;
  const fromNode = getNodeOrThrow(project, fromNodeId);
  const toNode = getNodeOrThrow(project, toNodeId);
  const scopeId = input.scopeId !== undefined ? input.scopeId || null : fromNode.parentId || null;
  if (fromNodeId === toNodeId) {
    throw new Error("Cannot connect a node to itself.");
  }
  if ((fromNode.parentId || null) !== scopeId || (toNode.parentId || null) !== scopeId) {
    throw new Error("Connected nodes must both be direct children of the connection scope.");
  }
  if (hasConnection(project.field.connections, fromNodeId, toNodeId, scopeId)) {
    throw new Error("Connection already exists.");
  }

  const connection = {
    id: createConnectionId(),
    scopeId,
    fromNodeId,
    toNodeId,
  };
  project.field.connections.push(connection);
  touchProject(project);
  return change("create_connection", project.id, "Created connection.", workspaceResourceLinks(project.id));
}

function deleteConnectionOperation(workspace, input) {
  requireConfirm(input);
  const project = getProjectOrThrow(workspace, input.projectId);
  const beforeCount = project.field.connections.length;

  if (typeof input.connectionId === "string") {
    project.field.connections = project.field.connections.filter((connection) => connection.id !== input.connectionId);
  } else if ((typeof input.fromSetId === "string" && typeof input.toSetId === "string") || (typeof input.fromNodeId === "string" && typeof input.toNodeId === "string")) {
    const fromNodeId = input.fromNodeId || input.fromSetId;
    const toNodeId = input.toNodeId || input.toSetId;
    const scopeId = input.scopeId || null;
    project.field.connections = project.field.connections.filter(
      (connection) => {
        const connectionFromNodeId = connection.fromNodeId || connection.fromSetId;
        const connectionToNodeId = connection.toNodeId || connection.toSetId;
        return !(
          (connection.scopeId || null) === scopeId &&
          ((connectionFromNodeId === fromNodeId && connectionToNodeId === toNodeId) ||
            (connectionFromNodeId === toNodeId && connectionToNodeId === fromNodeId))
        );
      }
    );
  } else {
    throw new Error("Provide connectionId or fromNodeId/fromSetId plus toNodeId/toSetId.");
  }

  if (beforeCount === project.field.connections.length) {
    throw new Error("Connection not found.");
  }
  touchProject(project);
  return change("delete_connection", project.id, "Deleted connection.", workspaceResourceLinks(project.id));
}

function getSetOrThrow(project, setId) {
  const set = project.field?.sets?.find((item) => item.id === setId);
  if (!set) {
    throw new Error(`Set not found: ${setId}`);
  }
  return set;
}

function getOrganizationOrThrow(project, organizationId) {
  const organization = project.field?.organizations?.find((item) => item.id === organizationId);
  if (!organization) {
    throw new Error(`Organization not found: ${organizationId}`);
  }
  return organization;
}

function getNodeOrThrow(project, nodeId) {
  const set = project.field?.sets?.find((item) => item.id === nodeId);
  if (set) {
    return { ...set, kind: "set" };
  }
  const organization = project.field?.organizations?.find((item) => item.id === nodeId);
  if (organization) {
    return { ...organization, kind: "organization" };
  }
  throw new Error(`Node not found: ${nodeId}`);
}

function getCardOrThrow(project, setId, cardId) {
  const set = getSetOrThrow(project, setId);
  const card = set.cards.find((item) => item.id === cardId);
  if (!card) {
    throw new Error(`Card not found: ${cardId}`);
  }
  return { set, card };
}

function createCardFromInput(input = {}) {
  const type = cardTypeIds.includes(input.type) ? input.type : "text";
  return normalizeCard({
    id: createCardId(),
    type,
    note: typeof input.note === "string" ? input.note : "",
    imageUrl: typeof input.imageUrl === "string" ? input.imageUrl : "",
    imageStyle: typeof input.imageStyle === "string" ? input.imageStyle : getRandomImageStyle(),
    imageTone: input.imageTone === "color" ? "color" : "mono",
    linkUrl: typeof input.linkUrl === "string" ? input.linkUrl : "",
    linkTitle: typeof input.linkTitle === "string" ? input.linkTitle : "",
    attachmentUrl: typeof input.attachmentUrl === "string" ? input.attachmentUrl : "",
    attachmentName: typeof input.attachmentName === "string" ? input.attachmentName : "",
    attachmentMime: typeof input.attachmentMime === "string" ? input.attachmentMime : "",
    attachmentSize: Number.isFinite(input.attachmentSize) ? input.attachmentSize : 0,
  });
}

function normalizePosition(position, fallback) {
  return {
    x: Number.isFinite(position?.x) ? position.x : fallback.x,
    y: Number.isFinite(position?.y) ? position.y : fallback.y,
  };
}

function touchProject(project) {
  project.updatedAt = new Date().toISOString();
  if (project.field?.fieldTitle?.trim()) {
    project.name = project.field.fieldTitle.trim();
  }
}

function change(type, projectId, summary, resources = {}) {
  return {
    type,
    projectId,
    summary,
    resources,
  };
}

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function requireConfirm(input) {
  if (input.confirm !== true) {
    throw new Error("confirm: true is required for this operation.");
  }
}

function requireDeleteText(input) {
  if (input.confirmText !== "DELETE") {
    throw new Error('confirmText: "DELETE" is required for permanent deletion.');
  }
}

function normalizeOperationType(type) {
  if (typeof type !== "string") {
    throw new Error("Operation type is required.");
  }
  return type.replace(/^infinimind_/, "");
}

function isDescendantOrganization(candidateId, ancestorId, organizations = []) {
  if (!candidateId || !ancestorId) {
    return false;
  }

  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));
  let current = organizationById.get(candidateId);
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    if (current.parentId === ancestorId) {
      return true;
    }
    seen.add(current.id);
    current = current.parentId ? organizationById.get(current.parentId) : null;
  }

  return false;
}

function collectDescendantOrganizationIdsForOperations(organizationId, organizations = []) {
  const result = [];
  const queue = [organizationId];
  while (queue.length > 0) {
    const parentId = queue.shift();
    for (const organization of organizations) {
      if (organization.parentId === parentId) {
        result.push(organization.id);
        queue.push(organization.id);
      }
    }
  }
  return result;
}

function getNodeCentroidForOperations(nodes) {
  return {
    x: nodes.reduce((total, node) => total + node.position.x, 0) / nodes.length,
    y: nodes.reduce((total, node) => total + node.position.y, 0) / nodes.length,
  };
}

function rebaseConnectionsForGroupedNodesForOperations(connections, selectedIds, sourceScopeId, organizationId) {
  return connections
    .map((connection) => {
      const scopeId = connection.scopeId || null;
      const fromNodeId = connection.fromNodeId || connection.fromSetId;
      const toNodeId = connection.toNodeId || connection.toSetId;
      if (scopeId !== sourceScopeId) {
        return { ...connection, scopeId, fromNodeId, toNodeId };
      }

      const fromSelected = selectedIds.has(fromNodeId);
      const toSelected = selectedIds.has(toNodeId);
      if (fromSelected && toSelected) {
        return { ...connection, scopeId: organizationId, fromNodeId, toNodeId };
      }
      if (fromSelected || toSelected) {
        const nextConnection = {
          ...connection,
          scopeId,
          fromNodeId: fromSelected ? organizationId : fromNodeId,
          toNodeId: toSelected ? organizationId : toNodeId,
        };
        return nextConnection.fromNodeId === nextConnection.toNodeId ? null : nextConnection;
      }

      return { ...connection, scopeId, fromNodeId, toNodeId };
    })
    .filter(Boolean);
}

function rewireConnectionsForMovedNodeForOperations(
  connections,
  nodeId,
  { sourceScopeId, targetScopeId, sourceContainerId, targetContainerId }
) {
  return connections
    .map((connection) => {
      const scopeId = connection.scopeId || null;
      const fromNodeId = connection.fromNodeId || connection.fromSetId;
      const toNodeId = connection.toNodeId || connection.toSetId;
      if (scopeId !== sourceScopeId || (fromNodeId !== nodeId && toNodeId !== nodeId)) {
        return { ...connection, scopeId, fromNodeId, toNodeId };
      }

      const nextConnection = sourceContainerId
        ? {
            ...connection,
            scopeId: targetScopeId,
            fromNodeId: fromNodeId === nodeId ? nodeId : sourceContainerId,
            toNodeId: toNodeId === nodeId ? nodeId : sourceContainerId,
          }
        : targetContainerId
          ? {
              ...connection,
              scopeId,
              fromNodeId: fromNodeId === nodeId ? targetContainerId : fromNodeId,
              toNodeId: toNodeId === nodeId ? targetContainerId : toNodeId,
            }
          : null;

      return nextConnection && nextConnection.fromNodeId !== nextConnection.toNodeId ? nextConnection : null;
    })
    .filter(Boolean);
}

function convertNodePositionBetweenScopes(position, sourceScopeId, targetScopeId, organizations = []) {
  const rootPosition = convertScopedPositionToRoot(position, sourceScopeId, organizations);
  return convertRootPositionToScoped(rootPosition, targetScopeId, organizations);
}

function convertScopedPositionToRoot(position, scopeId, organizations = []) {
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));
  const result = { x: position.x, y: position.y };
  const seen = new Set();
  let currentScopeId = scopeId;

  while (currentScopeId && !seen.has(currentScopeId)) {
    const organization = organizationById.get(currentScopeId);
    if (!organization) {
      break;
    }
    result.x += organization.position.x;
    result.y += organization.position.y;
    seen.add(currentScopeId);
    currentScopeId = organization.parentId || null;
  }

  return result;
}

function convertRootPositionToScoped(position, scopeId, organizations = []) {
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));
  const result = { x: position.x, y: position.y };
  const seen = new Set();
  let currentScopeId = scopeId;

  while (currentScopeId && !seen.has(currentScopeId)) {
    const organization = organizationById.get(currentScopeId);
    if (!organization) {
      break;
    }
    result.x -= organization.position.x;
    result.y -= organization.position.y;
    seen.add(currentScopeId);
    currentScopeId = organization.parentId || null;
  }

  return result;
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

function trackId(seenIds, issues, id, label) {
  if (!id) {
    issues.push({ severity: "error", code: "missing_id", message: `${label} is missing an id.` });
    return;
  }
  if (seenIds.has(id)) {
    issues.push({
      severity: "error",
      code: "duplicate_id",
      id,
      message: `Duplicate id ${id} seen in ${seenIds.get(id)} and ${label}.`,
    });
    return;
  }
  seenIds.set(id, label);
}

function validateCard(projectId, setId, card, knownImageIds, issues, trashId) {
  if (!cardTypeIds.includes(card.type)) {
    issues.push({ severity: "error", code: "invalid_card_type", projectId, setId, cardId: card.id, trashId });
  }
  const imageId = getImageIdFromUrl(card.imageUrl);
  if (imageId && knownImageIds && !knownImageIds.has(imageId)) {
    issues.push({
      severity: "warning",
      code: "missing_image_asset",
      projectId,
      setId,
      cardId: card.id,
      trashId,
      imageId,
      message: `Card references missing image asset ${imageId}.`,
    });
  }
  const attachmentId = getImageIdFromUrl(card.attachmentUrl);
  if (attachmentId && knownImageIds && !knownImageIds.has(attachmentId)) {
    issues.push({
      severity: "warning",
      code: "missing_attachment_asset",
      projectId,
      setId,
      cardId: card.id,
      trashId,
      imageId: attachmentId,
      message: `Card references missing attachment asset ${attachmentId}.`,
    });
  }
}
