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
  getRandomImageStyle,
  hasConnection,
  maxZoom,
  minZoom,
  normalizeCard,
  normalizeMarkerColor,
  normalizeConnectionLabel,
  normalizeTrash,
} from "../src/lib/workspaceModel.js";
import { getConnectionNodeIdsForOperations, getProjectOrThrow, workspaceResourceLinks } from "./operationShared.mjs";
import {
  collectDescendantOrganizationIdsForOperations,
  convertNodePositionBetweenScopes,
  getNodeCentroidForOperations,
  isDescendantOrganization,
  rebaseConnectionsForGroupedNodesForOperations,
  rewireConnectionsForMovedNodeForOperations,
} from "./operationScope.mjs";

function createProjectOperation(workspace, input) {
  const hasSeedNote = typeof input.seedNote === "string";
  const field = createDefaultState(input.name?.trim() || `Project ${String(workspace.projects.length + 1).padStart(2, "0")}`, {
    includeStarterSet: hasSeedNote,
  });
  if (hasSeedNote) {
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
  const requestedParentId = input.parentId === undefined ? undefined : input.parentId || null;
  if (requestedParentId !== undefined) {
    moveNodeOperation(workspace, {
      ...input,
      nodeId: input.setId,
      targetOrganizationId: requestedParentId,
    });
  }

  const set = getSetOrThrow(project, input.setId);
  if (typeof input.title === "string") {
    set.title = input.title;
  }
  if (input.position && requestedParentId === undefined) {
    set.position = normalizePosition(input.position, set.position);
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
    (connection) => {
      const { fromNodeId, toNodeId } = getConnectionNodeIdsForOperations(connection);
      return fromNodeId === input.setId || toNodeId === input.setId;
    }
  );
  const trash = normalizeTrash(field.trash);

  field.sets = nextSets;
  field.activeSetId = activeSetStillExists ? field.activeSetId : nextSets[fallbackActiveIndex].id;
  field.connections = field.connections.filter(
    (connection) => {
      const { fromNodeId, toNodeId } = getConnectionNodeIdsForOperations(connection);
      return fromNodeId !== input.setId && toNodeId !== input.setId;
    }
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
  const restoredConnections = item.connections
    .map((connection) => ({
      ...connection,
      id: createConnectionId(),
      fromNodeId: connection.fromNodeId === oldSetId ? restoredSet.id : connection.fromNodeId,
      toNodeId: connection.toNodeId === oldSetId ? restoredSet.id : connection.toNodeId,
    }));

  field.sets.push(restoredSet);
  field.activeSetId = restoredSet.id;
  field.connections = dedupeConnections([...field.connections, ...filterValidConnectionsForProject(project, restoredConnections)]);
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
  const requestedParentId = input.parentId === undefined ? undefined : input.parentId || null;
  if (requestedParentId !== undefined) {
    moveNodeOperation(workspace, {
      ...input,
      nodeId: input.organizationId,
      targetOrganizationId: requestedParentId,
    });
  }

  const organization = getOrganizationOrThrow(project, input.organizationId);
  if (typeof input.title === "string") {
    organization.title = input.title;
  }
  if (input.position && requestedParentId === undefined) {
    organization.position = normalizePosition(input.position, organization.position);
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
    const { fromNodeId, toNodeId } = getConnectionNodeIdsForOperations(connection);
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

  assertNoRestoreNodeConflicts(project, [item.organization, ...(item.organizations || [])], item.sets || []);
  field.organizations.push(item.organization, ...(item.organizations || []));
  field.sets.push(...(item.sets || []));
  const restoredConnections = (item.connections || []).map((connection) => ({
    ...connection,
    id: createConnectionId(),
  }));
  field.connections = dedupeConnections([...field.connections, ...filterValidConnectionsForProject(project, restoredConnections)]);
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

  if (cardTypeIds.includes(input.type)) {
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
  if (input.color !== undefined) {
    patch.color = normalizeMarkerColor(input.color);
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
  const { fromNodeId, toNodeId } = getConnectionNodeIdsForOperations(input);
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
    label: normalizeConnectionLabel(input.label),
    color: normalizeMarkerColor(input.color),
  };
  project.field.connections.push(connection);
  touchProject(project);
  return change("create_connection", project.id, "Created connection.", workspaceResourceLinks(project.id));
}

function updateConnectionOperation(workspace, input) {
  const project = getProjectOrThrow(workspace, input.projectId);
  const connection = getConnectionOrThrow(project, input.connectionId);
  if (input.label !== undefined) {
    connection.label = normalizeConnectionLabel(input.label);
  }
  if (input.color !== undefined) {
    connection.color = normalizeMarkerColor(input.color);
  }
  touchProject(project);
  return change("update_connection", project.id, "Updated connection.", workspaceResourceLinks(project.id));
}

function deleteConnectionOperation(workspace, input) {
  requireConfirm(input);
  const project = getProjectOrThrow(workspace, input.projectId);
  const beforeCount = project.field.connections.length;

  if (typeof input.connectionId === "string") {
    project.field.connections = project.field.connections.filter((connection) => connection.id !== input.connectionId);
  } else if ((typeof input.fromSetId === "string" && typeof input.toSetId === "string") || (typeof input.fromNodeId === "string" && typeof input.toNodeId === "string")) {
    const { fromNodeId, toNodeId } = getConnectionNodeIdsForOperations(input);
    const scopeId = input.scopeId || null;
    project.field.connections = project.field.connections.filter(
      (connection) => {
        const { fromNodeId: connectionFromNodeId, toNodeId: connectionToNodeId } = getConnectionNodeIdsForOperations(connection);
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

function getConnectionOrThrow(project, connectionId) {
  const connection = project.field?.connections?.find((item) => item.id === connectionId);
  if (!connection) {
    throw new Error(`Connection not found: ${connectionId}`);
  }
  return connection;
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
    color: normalizeMarkerColor(input.color),
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

function filterValidConnectionsForProject(project, connections = []) {
  const nodeParents = new Map([
    ...project.field.sets.map((set) => [set.id, set.parentId || null]),
    ...project.field.organizations.map((organization) => [organization.id, organization.parentId || null]),
  ]);

  return connections
    .map((connection) => {
      const { fromNodeId, toNodeId } = getConnectionNodeIdsForOperations(connection);
      return {
        ...connection,
        scopeId: connection.scopeId || null,
        fromNodeId,
        toNodeId,
      };
    })
    .filter((connection) => {
      if (!connection.fromNodeId || !connection.toNodeId || connection.fromNodeId === connection.toNodeId) {
        return false;
      }
      if (!nodeParents.has(connection.fromNodeId) || !nodeParents.has(connection.toNodeId)) {
        return false;
      }
      return (
        (nodeParents.get(connection.fromNodeId) || null) === connection.scopeId &&
        (nodeParents.get(connection.toNodeId) || null) === connection.scopeId
      );
    });
}

function assertNoRestoreNodeConflicts(project, organizations = [], sets = []) {
  const activeNodeIds = new Set([
    ...project.field.organizations.map((organization) => organization.id),
    ...project.field.sets.map((set) => set.id),
  ]);
  const conflicts = [...organizations.map((organization) => organization.id), ...sets.map((set) => set.id)].filter((id) =>
    activeNodeIds.has(id)
  );
  if (conflicts.length > 0) {
    throw new Error(`Cannot restore organization because active nodes already use: ${conflicts.join(", ")}`);
  }
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

export const operationHandlers = {
  "create_project": createProjectOperation,
  "rename_project": renameProjectOperation,
  "set_active_project": setActiveProjectOperation,
  "delete_project": deleteProjectOperation,
  "create_set": createSetOperation,
  "update_set": updateSetOperation,
  "layout_sets": layoutSetsOperation,
  "trash_set": trashSetOperation,
  "restore_set": restoreSetOperation,
  "create_organization": createOrganizationOperation,
  "update_organization": updateOrganizationOperation,
  "group_nodes": groupNodesOperation,
  "move_node": moveNodeOperation,
  "trash_organization": trashOrganizationOperation,
  "restore_organization": restoreOrganizationOperation,
  "delete_trash_item": deleteTrashItemOperation,
  "create_card": createCardOperation,
  "update_card": updateCardOperation,
  "reorder_cards": reorderCardsOperation,
  "move_card": moveCardOperation,
  "trash_card": trashCardOperation,
  "restore_card": restoreCardOperation,
  "create_connection": createConnectionOperation,
  "update_connection": updateConnectionOperation,
  "delete_connection": deleteConnectionOperation,
};
