import { getConnectionNodeIds } from "./workspaceModel.js";

export function getScopePath(scopeId, organizationLookup) {
  const path = [];
  const seen = new Set();
  let current = scopeId ? organizationLookup.get(scopeId) : null;

  while (current && !seen.has(current.id)) {
    path.unshift(current);
    seen.add(current.id);
    current = current.parentId ? organizationLookup.get(current.parentId) : null;
  }

  return path;
}

export function collectDescendantOrganizationIds(organizationId, organizations) {
  if (!organizationId) {
    return [];
  }

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

export function isOrganizationDescendant(candidateId, ancestorId, organizations) {
  if (!candidateId || !ancestorId) {
    return false;
  }

  const organizationLookup = new Map(organizations.map((organization) => [organization.id, organization]));
  let current = organizationLookup.get(candidateId);
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    if (current.parentId === ancestorId) {
      return true;
    }
    seen.add(current.id);
    current = current.parentId ? organizationLookup.get(current.parentId) : null;
  }

  return false;
}

export function getNodeCentroid(nodes) {
  if (nodes.length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: nodes.reduce((total, node) => total + node.position.x, 0) / nodes.length,
    y: nodes.reduce((total, node) => total + node.position.y, 0) / nodes.length,
  };
}

export function rebaseConnectionsForGroupedNodes(connections, selectedIds, sourceScopeId, organizationId) {
  return connections
    .map((connection) => {
      const scopeId = connection.scopeId || null;
      const { fromNodeId, toNodeId } = getConnectionNodeIds(connection);

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

export function rewireConnectionsForMovedNode(connections, nodeId, sourceScopeId, targetOrganizationId) {
  return connections
    .map((connection) => {
      const scopeId = connection.scopeId || null;
      const { fromNodeId, toNodeId } = getConnectionNodeIds(connection);
      if (scopeId !== sourceScopeId || (fromNodeId !== nodeId && toNodeId !== nodeId)) {
        return { ...connection, scopeId, fromNodeId, toNodeId };
      }

      const nextConnection = {
        ...connection,
        scopeId,
        fromNodeId: fromNodeId === nodeId ? targetOrganizationId : fromNodeId,
        toNodeId: toNodeId === nodeId ? targetOrganizationId : toNodeId,
      };

      return nextConnection.fromNodeId === nextConnection.toNodeId ? null : nextConnection;
    })
    .filter(Boolean);
}

export function rewireConnectionsForMovedOutNode(connections, nodeId, sourceOrganizationId, targetScopeId) {
  return connections
    .map((connection) => {
      const scopeId = connection.scopeId || null;
      const { fromNodeId, toNodeId } = getConnectionNodeIds(connection);
      if (scopeId !== sourceOrganizationId || (fromNodeId !== nodeId && toNodeId !== nodeId)) {
        return { ...connection, scopeId, fromNodeId, toNodeId };
      }

      const nextConnection = {
        ...connection,
        scopeId: targetScopeId,
        fromNodeId: fromNodeId === nodeId ? nodeId : sourceOrganizationId,
        toNodeId: toNodeId === nodeId ? nodeId : sourceOrganizationId,
      };

      return nextConnection.fromNodeId === nextConnection.toNodeId ? null : nextConnection;
    })
    .filter(Boolean);
}

export function getMovedOutNodePosition(node, parentOrganization) {
  return {
    x: parentOrganization.position.x + node.position.x,
    y: parentOrganization.position.y + node.position.y,
  };
}
