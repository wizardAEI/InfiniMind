export const cardTypeIds = ["text", "image", "link", "attachment"];
export const imageStyles = ["scan", "topography", "wave", "cells", "portal", "signal"];
export const markerColors = [
  { id: "none", label: "No marker" },
  { id: "blue", label: "Blue marker" },
  { id: "green", label: "Green marker" },
  { id: "amber", label: "Amber marker" },
  { id: "rose", label: "Rose marker" },
  { id: "violet", label: "Violet marker" },
  { id: "slate", label: "Slate marker" },
];
export const markerColorIds = markerColors.map((color) => color.id);
export const storageKey = "infinimind.workspace-state.v1";
export const legacyStorageKey = "infinimind.field-state.v1";
export const workspaceVersion = 1;
export const storageVersion = 5;
export const minZoom = 0.45;
export const maxZoom = 1.8;

export function createSeedCard(id = "card-1", note) {
  return {
    id,
    type: "text",
    note:
      note ||
      "A field begins as one surface. Click, add, flip, and let the archive unfold from the center.",
    imageUrl: "",
    imageStyle: getRandomImageStyle(),
    imageTone: "mono",
    color: "none",
    linkUrl: "https://example.com",
    linkTitle: "Reference path",
    attachmentUrl: "",
    attachmentName: "",
    attachmentMime: "",
    attachmentSize: 0,
  };
}

export function createBlankCard(id = createCardId()) {
  return {
    id,
    type: "text",
    note: "",
    imageUrl: "",
    imageStyle: getRandomImageStyle(),
    imageTone: "mono",
    color: "none",
    linkUrl: "",
    linkTitle: "",
    attachmentUrl: "",
    attachmentName: "",
    attachmentMime: "",
    attachmentSize: 0,
  };
}

export function createCardSet(index = 0, id = `set-${index + 1}`) {
  const cardId = index === 0 ? "card-1" : createCardId();

  return {
    id,
    title: `Set ${String(index + 1).padStart(2, "0")}`,
    position: getDefaultSetPosition(index),
    parentId: null,
    cards: [
      createSeedCard(
        cardId,
        index === 0
          ? undefined
          : "A new card set keeps its cards ready while the larger canvas opens around it."
      ),
    ],
    activeId: cardId,
  };
}

export function createOrganization(index = 0, id = createOrganizationId()) {
  return {
    id,
    title: `Organization ${String(index + 1).padStart(2, "0")}`,
    position: getDefaultOrganizationPosition(index),
    parentId: null,
    pan: { x: 0, y: 0 },
    zoom: 1,
  };
}

export function createDefaultState(fieldTitle = "Title", options = {}) {
  const firstSet = options.includeStarterSet === false ? null : createCardSet();

  return {
    version: storageVersion,
    fieldTitle,
    sets: firstSet ? [firstSet] : [],
    organizations: [],
    activeSetId: firstSet?.id || null,
    connections: [],
    trash: createEmptyTrash(),
    pan: { x: 0, y: 0 },
    zoom: 1,
  };
}

export function createProject(index = 0, field = createDefaultState(`Project ${String(index + 1).padStart(2, "0")}`)) {
  const timestamp = new Date().toISOString();
  const name = field.fieldTitle?.trim() || `Project ${String(index + 1).padStart(2, "0")}`;

  return {
    id: createProjectId(),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    field: {
      ...field,
      fieldTitle: name,
    },
  };
}

export function createEmptyTrash() {
  return {
    cards: [],
    sets: [],
    organizations: [],
  };
}

export function createDefaultWorkspaceState() {
  const firstProject = createProject(0, createDefaultState("Title"));

  return {
    version: workspaceVersion,
    projects: [firstProject],
    activeProjectId: firstProject.id,
  };
}

export function normalizeWorkspaceState(value) {
  const hasProjectList = Array.isArray(value?.projects);
  const rawProjects = hasProjectList ? value.projects : [createProject(0, normalizeFieldState(value))];
  const projects = rawProjects.map(normalizeProject).filter(Boolean);
  const activeProjectId = projects.some((project) => project.id === value?.activeProjectId)
    ? value.activeProjectId
    : projects[0]?.id || null;

  return {
    version: workspaceVersion,
    projects,
    activeProjectId,
  };
}

export function normalizeProject(project, index) {
  const field = normalizeFieldState(project?.field || project);
  const fallbackName = `Project ${String(index + 1).padStart(2, "0")}`;
  const name =
    typeof project?.name === "string" && project.name.trim()
      ? project.name.trim()
      : field.fieldTitle?.trim() || fallbackName;

  return {
    id: typeof project?.id === "string" ? project.id : createProjectId(),
    name,
    createdAt: normalizeTimestamp(project?.createdAt),
    updatedAt: normalizeTimestamp(project?.updatedAt || project?.createdAt),
    field: {
      ...field,
      fieldTitle: field.fieldTitle?.trim() ? field.fieldTitle : name,
    },
  };
}

export function normalizeFieldState(value) {
  const fallback = createDefaultState();
  const migratedSet =
    Array.isArray(value?.cards) && value.cards.length > 0
      ? {
          id: "set-1",
          title: "Set 01",
          cards: value.cards,
          activeId: value.activeId,
        }
      : null;
  const rawSets = Array.isArray(value?.sets) ? value.sets : migratedSet ? [migratedSet] : null;
  let sets = rawSets ? rawSets.map(normalizeCardSet) : fallback.sets;
  const rawOrganizations = Array.isArray(value?.organizations) ? value.organizations : [];
  const organizations = normalizeOrganizations(rawOrganizations);
  const organizationIds = new Set(organizations.map((organization) => organization.id));
  sets = sets.map((set) => (set.parentId && !organizationIds.has(set.parentId) ? { ...set, parentId: null } : set));
  const nodeParents = new Map([
    ...sets.map((set) => [set.id, set.parentId || null]),
    ...organizations.map((organization) => [organization.id, organization.parentId || null]),
  ]);
  const activeSetId = sets.some((set) => set.id === value?.activeSetId) ? value.activeSetId : sets[0]?.id || null;
  const connections = Array.isArray(value?.connections)
    ? value.connections.map(normalizeConnection).filter((connection) => {
        if (!connection) return false;
        return (
          nodeParents.has(connection.fromNodeId) &&
          nodeParents.has(connection.toNodeId) &&
          connection.fromNodeId !== connection.toNodeId
        );
      })
    : fallback.connections;
  const pan = {
    x: Number.isFinite(value?.pan?.x) ? value.pan.x : 0,
    y: Number.isFinite(value?.pan?.y) ? value.pan.y : 0,
  };

  return {
    version: storageVersion,
    fieldTitle: typeof value?.fieldTitle === "string" ? value.fieldTitle : fallback.fieldTitle,
    sets,
    organizations,
    activeSetId,
    connections: dedupeConnections(connections),
    trash: normalizeTrash(value?.trash),
    pan,
    zoom: clampZoom(Number.isFinite(value?.zoom) ? value.zoom : fallback.zoom),
  };
}

export function normalizeCardSet(cardSet, index) {
  const fallback = createCardSet(index);
  const cards = Array.isArray(cardSet?.cards) && cardSet.cards.length > 0 ? cardSet.cards.map(normalizeCard) : fallback.cards;
  const activeId = cards.some((card) => card.id === cardSet?.activeId) ? cardSet.activeId : cards[0].id;
  const position = {
    x: Number.isFinite(cardSet?.position?.x) ? cardSet.position.x : fallback.position.x,
    y: Number.isFinite(cardSet?.position?.y) ? cardSet.position.y : fallback.position.y,
  };

  return {
    id: typeof cardSet?.id === "string" ? cardSet.id : fallback.id,
    title: typeof cardSet?.title === "string" ? cardSet.title : fallback.title,
    position,
    parentId: typeof cardSet?.parentId === "string" ? cardSet.parentId : null,
    cards,
    activeId,
  };
}

export function normalizeOrganization(organization, index) {
  const fallback = createOrganization(index);
  const position = {
    x: Number.isFinite(organization?.position?.x) ? organization.position.x : fallback.position.x,
    y: Number.isFinite(organization?.position?.y) ? organization.position.y : fallback.position.y,
  };
  const pan = {
    x: Number.isFinite(organization?.pan?.x) ? organization.pan.x : 0,
    y: Number.isFinite(organization?.pan?.y) ? organization.pan.y : 0,
  };

  return {
    id: typeof organization?.id === "string" ? organization.id : fallback.id,
    title: typeof organization?.title === "string" ? organization.title : fallback.title,
    position,
    parentId: typeof organization?.parentId === "string" ? organization.parentId : null,
    pan,
    zoom: clampZoom(Number.isFinite(organization?.zoom) ? organization.zoom : 1),
  };
}

export function normalizeOrganizations(value) {
  const organizations = value.map(normalizeOrganization);
  const organizationIds = new Set(organizations.map((organization) => organization.id));

  return organizations.map((organization) => {
    if (!organization.parentId || !organizationIds.has(organization.parentId)) {
      return { ...organization, parentId: null };
    }

    return createsOrganizationCycle(organization.id, organization.parentId, organizations)
      ? { ...organization, parentId: null }
      : organization;
  });
}

export function normalizeCard(card) {
  return {
    id: typeof card?.id === "string" ? card.id : createCardId(),
    type: cardTypeIds.includes(card?.type) ? card.type : "text",
    note: typeof card?.note === "string" ? card.note : "",
    imageUrl: typeof card?.imageUrl === "string" ? card.imageUrl : "",
    imageStyle: imageStyles.includes(card?.imageStyle) ? card.imageStyle : getRandomImageStyle(),
    imageTone: card?.imageTone === "color" ? "color" : "mono",
    color: normalizeMarkerColor(card?.color),
    linkUrl: typeof card?.linkUrl === "string" ? card.linkUrl : "",
    linkTitle: typeof card?.linkTitle === "string" ? card.linkTitle : "",
    attachmentUrl: typeof card?.attachmentUrl === "string" ? card.attachmentUrl : "",
    attachmentName: typeof card?.attachmentName === "string" ? card.attachmentName : "",
    attachmentMime: typeof card?.attachmentMime === "string" ? card.attachmentMime : "",
    attachmentSize: Number.isFinite(card?.attachmentSize) ? card.attachmentSize : 0,
  };
}

export function normalizeConnection(connection) {
  const { fromNodeId, toNodeId } = getConnectionNodeIds(connection);

  if (!fromNodeId || !toNodeId) {
    return null;
  }

  return {
    id: typeof connection?.id === "string" ? connection.id : createConnectionId(),
    scopeId: typeof connection?.scopeId === "string" ? connection.scopeId : null,
    fromNodeId,
    toNodeId,
    label: normalizeConnectionLabel(connection?.label),
    color: normalizeMarkerColor(connection?.color),
  };
}

export function normalizeConnectionLabel(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeMarkerColor(value) {
  return markerColorIds.includes(value) ? value : "none";
}

export function getConnectionNodeIds(connection) {
  return {
    fromNodeId:
      typeof connection?.fromNodeId === "string"
        ? connection.fromNodeId
        : typeof connection?.fromSetId === "string"
          ? connection.fromSetId
          : null,
    toNodeId:
      typeof connection?.toNodeId === "string"
        ? connection.toNodeId
        : typeof connection?.toSetId === "string"
          ? connection.toSetId
          : null,
  };
}

export function normalizeTrash(value) {
  return {
    cards: Array.isArray(value?.cards)
      ? value.cards
          .map((item) => {
            if (!item?.card) {
              return null;
            }

            return {
              id: typeof item.id === "string" ? item.id : createTrashItemId("card"),
              deletedAt: normalizeTimestamp(item.deletedAt),
              sourceSetId: typeof item.sourceSetId === "string" ? item.sourceSetId : "",
              sourceSetTitle: typeof item.sourceSetTitle === "string" ? item.sourceSetTitle : "Unknown set",
              card: normalizeCard(item.card),
            };
          })
          .filter(Boolean)
      : [],
    sets: Array.isArray(value?.sets)
      ? value.sets
          .map((item, index) => {
            if (!item?.set) {
              return null;
            }

            return {
              id: typeof item.id === "string" ? item.id : createTrashItemId("set"),
              deletedAt: normalizeTimestamp(item.deletedAt),
              set: normalizeCardSet(item.set, index),
              connections: Array.isArray(item.connections) ? item.connections.map(normalizeConnection).filter(Boolean) : [],
            };
          })
          .filter(Boolean)
      : [],
    organizations: Array.isArray(value?.organizations)
      ? value.organizations
          .map((item) => {
            if (!item?.organization) {
              return null;
            }
            const organizationTree = normalizeOrganizations([
              item.organization,
              ...(Array.isArray(item.organizations) ? item.organizations : []),
            ]);
            const rootOrganization = organizationTree[0] || normalizeOrganization(item.organization);

            return {
              id: typeof item.id === "string" ? item.id : createTrashItemId("organization"),
              deletedAt: normalizeTimestamp(item.deletedAt),
              organization: rootOrganization,
              organizations: organizationTree.slice(1),
              sets: Array.isArray(item.sets)
                ? item.sets.map(normalizeCardSet)
                : [],
              connections: Array.isArray(item.connections) ? item.connections.map(normalizeConnection).filter(Boolean) : [],
            };
          })
          .filter(Boolean)
      : [],
  };
}

export function normalizeUrl(value) {
  if (!value) return "#";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export function getRandomImageStyle(exclude) {
  const pool = imageStyles.filter((style) => style !== exclude);
  return pool[Math.floor(Math.random() * pool.length)] || imageStyles[0];
}

export function clampZoom(value) {
  return Math.min(Math.max(value, minZoom), maxZoom);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function getDefaultSetPosition(index) {
  return {
    x: (index % 3) * 340 - 220,
    y: Math.floor(index / 3) * 240 - 40,
  };
}

export function getDefaultOrganizationPosition(index) {
  return {
    x: (index % 3) * 360 - 120,
    y: Math.floor(index / 3) * 260 + 80,
  };
}

export function getCardPreview(card) {
  if (!card) return "Empty clue set";
  if (card.type === "image") return card.imageUrl ? "Image evidence attached" : "Image placeholder";
  if (card.type === "link") return card.linkTitle || card.linkUrl || "Reference link";
  if (card.type === "attachment") return card.attachmentName || card.attachmentUrl || "Attachment";
  return card.note || "No memo yet";
}

export function getTrashCount(trash) {
  return (trash?.cards?.length || 0) + (trash?.sets?.length || 0) + (trash?.organizations?.length || 0);
}

export function hasConnection(connections, fromNodeId, toNodeId, scopeId = null) {
  const normalizedScopeId = typeof scopeId === "string" ? scopeId : null;
  return connections.some((connection) => {
    const connectionScopeId = typeof connection.scopeId === "string" ? connection.scopeId : null;
    if (connectionScopeId !== normalizedScopeId) {
      return false;
    }

    const { fromNodeId: from, toNodeId: to } = getConnectionNodeIds(connection);
    return (
      (from === fromNodeId && to === toNodeId) ||
      (from === toNodeId && to === fromNodeId)
    );
  });
}

export function dedupeConnections(connections) {
  const seen = new Set();
  return connections.filter((connection) => {
    const normalized = normalizeConnection(connection);
    if (!normalized) {
      return false;
    }
    const key = `${normalized.scopeId || "root"}:${[normalized.fromNodeId, normalized.toNodeId].sort().join("--")}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function normalizeTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function getImageIdFromUrl(value) {
  if (typeof value !== "string" || !value.startsWith("infinimind-image://")) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.hostname || url.pathname.replace(/^\/+/, "") || null;
  } catch {
    return null;
  }
}

export function collectImageIds(value, ids = new Set()) {
  if (!value || typeof value !== "object") {
    return ids;
  }

  for (const assetUrl of [value.imageUrl, value.attachmentUrl]) {
    const imageId = getImageIdFromUrl(assetUrl);
    if (imageId) {
      ids.add(imageId);
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectImageIds(item, ids);
    }
    return ids;
  }

  for (const item of Object.values(value)) {
    collectImageIds(item, ids);
  }
  return ids;
}

export function createProjectId() {
  return `project-${createUuidLikeId()}`;
}

export function createCardId() {
  return `card-${createUuidLikeId()}`;
}

export function createSetId() {
  return `set-${createUuidLikeId()}`;
}

export function createOrganizationId() {
  return `organization-${createUuidLikeId()}`;
}

export function createConnectionId() {
  return `connection-${createUuidLikeId()}`;
}

export function createTrashItemId(kind) {
  return `trash-${kind}-${createUuidLikeId()}`;
}

export function createImageId() {
  return `image-${createUuidLikeId()}`;
}

function createUuidLikeId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createsOrganizationCycle(organizationId, parentId, organizations) {
  let currentParentId = parentId;
  const visited = new Set([organizationId]);
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));

  while (currentParentId) {
    if (visited.has(currentParentId)) {
      return true;
    }
    visited.add(currentParentId);
    currentParentId = organizationById.get(currentParentId)?.parentId || null;
  }

  return false;
}
