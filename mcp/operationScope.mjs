import { getConnectionNodeIdsForOperations } from "./operationShared.mjs";

export function isDescendantOrganization(candidateId, ancestorId, organizations = []) {
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

export function collectDescendantOrganizationIdsForOperations(organizationId, organizations = []) {
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

export function getNodeCentroidForOperations(nodes) {
  return {
    x: nodes.reduce((total, node) => total + node.position.x, 0) / nodes.length,
    y: nodes.reduce((total, node) => total + node.position.y, 0) / nodes.length,
  };
}

export function rebaseConnectionsForGroupedNodesForOperations(connections, selectedIds, sourceScopeId, organizationId) {
  return connections
    .map((connection) => {
      const scopeId = connection.scopeId || null;
      const { fromNodeId, toNodeId } = getConnectionNodeIdsForOperations(connection);
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

export function rewireConnectionsForMovedNodeForOperations(
  connections,
  nodeId,
  { sourceScopeId, targetScopeId, sourceContainerId, targetContainerId }
) {
  return connections
    .map((connection) => {
      const scopeId = connection.scopeId || null;
      const { fromNodeId, toNodeId } = getConnectionNodeIdsForOperations(connection);
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

export function convertNodePositionBetweenScopes(position, sourceScopeId, targetScopeId, organizations = []) {
  const rootPosition = convertScopedPositionToRoot(position, sourceScopeId, organizations);
  return convertRootPositionToScoped(rootPosition, targetScopeId, organizations);
}

export function convertScopedPositionToRoot(position, scopeId, organizations = []) {
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

export function convertRootPositionToScoped(position, scopeId, organizations = []) {
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
