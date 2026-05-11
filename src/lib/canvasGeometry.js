import { clamp, clampZoom, getConnectionNodeIds, minZoom } from "./workspaceModel.js";

export const wallSetSize = { width: 184, height: 108 };

export const organizationNodeSize = { width: 300, height: 216 };

export const editorSetSize = { width: 760, height: 620 };

export const zoomStep = 0.12;

export const wheelZoomSensitivity = 0.0015;

export const maxWheelZoomStep = 0.06;

export const visibleCardBuffer = 1;

export function getConnectionDeleteButtonPosition({
  connection,
  nodeLookup,
  editingSetId,
  dragPreview,
  pan,
  zoom,
  viewportWidth,
}) {
  if (!connection) {
    return null;
  }

  const { fromNode, toNode } = getConnectionLayerNodes(connection, nodeLookup, dragPreview);
  if (!fromNode || !toNode) {
    return null;
  }

  const from = getNodeCenter(fromNode, editingSetId === fromNode.id);
  const to = getNodeCenter(toNode, editingSetId === toNode.id);
  const safeViewportWidth = viewportWidth || (typeof window === "undefined" ? 1280 : window.innerWidth);
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  const buttonSize = 34;
  const midpoint = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  };
  const screenX = safeViewportWidth / 2 + pan.x + midpoint.x * zoom + 12;
  const screenY = viewportHeight / 2 + pan.y + midpoint.y * zoom - buttonSize / 2;

  return {
    left: clamp(screenX, 8, Math.max(8, safeViewportWidth - buttonSize - 8)),
    top: clamp(screenY, 8, Math.max(8, viewportHeight - buttonSize - 8)),
  };
}

export function getConnectionControlPosition({
  connection,
  nodeLookup,
  editingSetId,
  dragPreview,
  pan,
  zoom,
  viewportWidth,
}) {
  if (!connection) {
    return null;
  }

  const { fromNode, toNode } = getConnectionLayerNodes(connection, nodeLookup, dragPreview);
  if (!fromNode || !toNode) {
    return null;
  }

  const from = getNodeCenter(fromNode, editingSetId === fromNode.id);
  const to = getNodeCenter(toNode, editingSetId === toNode.id);
  const safeViewportWidth = viewportWidth || (typeof window === "undefined" ? 1280 : window.innerWidth);
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  const controlWidth = 260;
  const controlHeight = 34;
  const midpoint = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  };
  const screenX = safeViewportWidth / 2 + pan.x + midpoint.x * zoom - controlWidth / 2;
  const screenY = viewportHeight / 2 + pan.y + midpoint.y * zoom - controlHeight / 2 - 42;

  return {
    left: clamp(screenX, 8, Math.max(8, safeViewportWidth - controlWidth - 8)),
    top: clamp(screenY, 8, Math.max(8, viewportHeight - controlHeight - 8)),
  };
}

export function getConnectionLayerNode(nodeId, nodeLookup, dragPreview) {
  const node = nodeLookup.get(nodeId);
  if (!node) {
    return null;
  }

  if (dragPreview?.nodeId !== nodeId) {
    return node;
  }

  return {
    ...node,
    position: dragPreview.position,
  };
}

export function getConnectionLayerNodes(connection, nodeLookup, dragPreview) {
  const { fromNodeId, toNodeId } = getConnectionNodeIds(connection);

  return {
    fromNodeId,
    toNodeId,
    fromNode: getConnectionLayerNode(fromNodeId, nodeLookup, dragPreview),
    toNode: getConnectionLayerNode(toNodeId, nodeLookup, dragPreview),
  };
}

export function getConnectionDropTargetId({
  clientX,
  clientY,
  fromNodeId,
  nodes,
  nodeLookup,
  editingSetId,
  activeSetId,
  dragPreview,
  pan,
  zoom,
  editorWidth,
  editorHeight,
}) {
  const domTargetNodeId = document.elementFromPoint?.(clientX, clientY)?.closest?.("[data-node-id]")?.dataset?.nodeId;
  if (domTargetNodeId && domTargetNodeId !== fromNodeId && nodeLookup.has(domTargetNodeId)) {
    return domTargetNodeId;
  }

  const pointer = getCanvasPointFromClient(clientX, clientY, pan, zoom);
  const hitTolerance = 24 / Math.max(zoom || 1, 0.1);

  return nodes
    .map((node, index) => {
      const layerNode = getConnectionLayerNode(node.id, nodeLookup, dragPreview);
      if (!layerNode || layerNode.id === fromNodeId) {
        return null;
      }

      return {
        id: layerNode.id,
        zIndex: editingSetId === layerNode.id ? 260 : activeSetId === layerNode.id ? 180 : 120 + index,
        bounds: getNodeHitBounds(layerNode, {
          isEditing: editingSetId === layerNode.id,
          editorWidth,
          editorHeight,
        }),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.zIndex - a.zIndex)
    .find(({ bounds }) => {
      return (
        pointer.x >= bounds.left - hitTolerance &&
        pointer.x <= bounds.right + hitTolerance &&
        pointer.y >= bounds.top - hitTolerance &&
        pointer.y <= bounds.bottom + hitTolerance
      );
    })?.id;
}

export function getCanvasPointFromClient(clientX, clientY, pan, zoom) {
  const safeZoom = Math.max(zoom || 1, 0.1);

  return {
    x: (clientX - window.innerWidth / 2 - pan.x) / safeZoom,
    y: (clientY - window.innerHeight / 2 - pan.y) / safeZoom,
  };
}

export function getNodeHitBounds(node, { isEditing, editorWidth, editorHeight }) {
  const isOrganization = node?.kind === "organization";
  const width = isOrganization ? organizationNodeSize.width : isEditing ? editorWidth || editorSetSize.width : wallSetSize.width;
  const height = isOrganization ? organizationNodeSize.height : isEditing ? editorHeight || editorSetSize.height : wallSetSize.height;

  return {
    left: node.position.x - width / 2,
    right: node.position.x + width / 2,
    top: node.position.y - height / 2,
    bottom: node.position.y + height / 2,
  };
}

export function getEditorFocusZoom(editorWidth, editorHeight) {
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 820 : window.innerHeight;
  const safeWidth = Math.max(320, viewportWidth - 96);
  const safeHeight = Math.max(360, viewportHeight - 142);
  const fitZoom = Math.min(safeWidth / editorWidth, safeHeight / editorHeight) * 0.98;

  return clampZoom(Math.min(1.12, Math.max(minZoom, fitZoom)));
}

export function getEditorFocusYOffset() {
  if (typeof window === "undefined") {
    return 72;
  }

  return window.innerWidth < 760 ? 64 : 72;
}

export function getWheelZoomDelta(event) {
  let deltaY = event.deltaY;

  if (event.deltaMode === 1) {
    deltaY *= 16;
  } else if (event.deltaMode === 2) {
    deltaY *= window.innerHeight;
  }

  return Math.min(Math.max(-deltaY * wheelZoomSensitivity, -maxWheelZoomStep), maxWheelZoomStep);
}

export function clearTextSelection() {
  const selection = window.getSelection?.();
  if (selection && !selection.isCollapsed) {
    selection.removeAllRanges();
  }
}

export function getNodeCenter(node, isEditing) {
  if (!node) {
    return { x: 0, y: 0 };
  }

  const isOrganization = node.kind === "organization";

  return {
    x: node.position.x,
    y: node.position.y,
    width: isOrganization ? organizationNodeSize.width : isEditing ? editorSetSize.width : wallSetSize.width,
    height: isOrganization ? organizationNodeSize.height : isEditing ? editorSetSize.height : wallSetSize.height,
  };
}
