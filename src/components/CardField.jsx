import { motion, useReducedMotion } from "framer-motion";
import { ArchiveRestore, ChevronLeft, FolderOpen, Layers3, Pencil, Plus, Trash2, Ungroup, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useViewportWidth } from "../hooks/useViewportWidth.js";
import {
  clearTextSelection,
  editorSetSize,
  getCanvasPointFromClient,
  getConnectionControlPosition,
  getConnectionDropTargetId,
  getConnectionLayerNodes,
  getEditorFocusYOffset,
  getEditorFocusZoom,
  getNodeCenter,
  getNodeHitBounds,
  getWheelZoomDelta,
  organizationNodeSize,
  wallSetSize,
  zoomStep,
} from "../lib/canvasGeometry.js";
import {
  collectDescendantOrganizationIds,
  getMovedOutNodePosition,
  getNodeCentroid,
  getScopePath,
  isOrganizationDescendant,
  rebaseConnectionsForGroupedNodes,
  rewireConnectionsForMovedNode,
  rewireConnectionsForMovedOutNode,
} from "../lib/organizationScope.js";
import {
  createBlankCard,
  createCardId,
  createCardSet,
  createConnectionId,
  createOrganization,
  createOrganizationId,
  createSetId,
  createTrashItemId,
  clampZoom,
  dedupeConnections,
  getConnectionNodeIds,
  getCardPreview,
  getTrashCount,
  hasConnection,
  normalizeConnectionLabel,
  normalizeTrash,
} from "../lib/workspaceModel.js";
import CardSetEditor from "./CardSetEditor.jsx";
import { ClueSetSummary, OrganizationSummary } from "./CardSummaries.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import ConnectionLayer from "./ConnectionLayer.jsx";
import TrashModal from "./TrashModal.jsx";

function CardField({
  fieldTitle,
  sets,
  organizations = [],
  activeSetId,
  connections,
  trash: fieldTrash,
  pan,
  zoom,
  onChange,
}) {
  const reduceMotion = useReducedMotion();
  const [freshId, setFreshId] = useState(null);
  const [birthSourceId, setBirthSourceId] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [activeScopeId, setActiveScopeId] = useState(null);
  const [editingSetId, setEditingSetId] = useState(null);
  const [pendingConnection, setPendingConnection] = useState(null);
  const [connectionSourceId, setConnectionSourceId] = useState(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState(() => new Set());
  const [dragPreview, setDragPreview] = useState(null);
  const [dropTargetOrganizationId, setDropTargetOrganizationId] = useState(null);
  const [scopeTransition, setScopeTransition] = useState(null);
  const [confirmRequest, setConfirmRequest] = useState(null);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [renderedToolbarActions, setRenderedToolbarActions] = useState([]);
  const [toolbarTooltip, setToolbarTooltip] = useState(null);
  const toolbarRef = useRef(null);
  const panGesture = useRef(null);
  const setDrag = useRef(null);
  const connectionGesture = useRef(null);
  const dragFrame = useRef(null);
  const toolbarActionsClearTimer = useRef(null);
  const toolbarTooltipTimer = useRef(null);
  const suppressSetClick = useRef(false);
  const editorReturnView = useRef(null);
  const viewRef = useRef({ pan, zoom });
  const wheelZoomFrame = useRef(null);
  const wheelZoomDelta = useRef(0);
  const wheelZoomAnchor = useRef(null);
  const width = useViewportWidth();
  const cardWidth = Math.min(Math.max(width * 0.72, 284), 384);
  const editorWidth = Math.min(Math.max(width * 0.72, 620), editorSetSize.width);
  const editorHeight = width < 740 ? 600 : editorSetSize.height;
  const organizationLookup = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations]
  );
  const activeScope = activeScopeId ? organizationLookup.get(activeScopeId) : null;
  const scopePan = activeScope?.pan || pan;
  const scopeZoom = activeScope?.zoom || zoom;
  const scopePath = useMemo(() => getScopePath(activeScopeId, organizationLookup), [activeScopeId, organizationLookup]);
  const scopeSets = useMemo(
    () => sets.filter((set) => (set.parentId || null) === activeScopeId),
    [activeScopeId, sets]
  );
  const scopeOrganizations = useMemo(
    () => organizations.filter((organization) => (organization.parentId || null) === activeScopeId),
    [activeScopeId, organizations]
  );
  const displaySets = scopeSets;
  const displayNodes = useMemo(
    () => [
      ...scopeOrganizations.map((organization) => ({
        id: organization.id,
        kind: "organization",
        title: organization.title,
        position: organization.position,
        parentId: organization.parentId || null,
        organization,
      })),
      ...scopeSets.map((set) => ({
        id: set.id,
        kind: "set",
        title: set.title,
        position: set.position,
        parentId: set.parentId || null,
        set,
      })),
    ],
    [scopeOrganizations, scopeSets]
  );
  const nodeLookup = useMemo(() => new Map(displayNodes.map((node) => [node.id, node])), [displayNodes]);
  const setLookup = useMemo(() => new Map(displaySets.map((set) => [set.id, set])), [displaySets]);
  const isDraggingSet = Boolean(dragPreview);
  const trash = normalizeTrash(fieldTrash);
  const trashCount = getTrashCount(trash);
  const visibleConnections = useMemo(
    () =>
      connections.filter(
        (connection) => {
          const { fromNodeId, toNodeId } = getConnectionNodeIds(connection);
          return (connection.scopeId || null) === activeScopeId && nodeLookup.has(fromNodeId) && nodeLookup.has(toNodeId);
        }
      ),
    [activeScopeId, connections, nodeLookup]
  );
  const selectedConnection = useMemo(
    () => visibleConnections.find((connection) => connection.id === selectedConnectionId) || null,
    [selectedConnectionId, visibleConnections]
  );
  const selectedConnectionControl = useMemo(() => {
    return getConnectionControlPosition({
      connection: selectedConnection,
      nodeLookup,
      editingSetId,
      dragPreview,
      pan: scopePan,
      zoom: scopeZoom,
      viewportWidth: width,
    });
  }, [dragPreview, editingSetId, nodeLookup, scopePan, scopeZoom, selectedConnection, width]);
  const connectionLabels = useMemo(
    () =>
      visibleConnections
        .map((connection) => {
          const label = normalizeConnectionLabel(connection.label);
          if (!label) {
            return null;
          }

          const { fromNode, toNode } = getConnectionLayerNodes(connection, nodeLookup, dragPreview);
          if (!fromNode || !toNode) {
            return null;
          }

          const from = getNodeCenter(fromNode, editingSetId === fromNode.id);
          const to = getNodeCenter(toNode, editingSetId === toNode.id);
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const distance = Math.hypot(dx, dy);
          const lift = distance < 220 ? { x: 0, y: -78 } : { x: (-dy / distance) * 20, y: (dx / distance) * 20 };

          return {
            id: connection.id,
            label: label.length > 80 ? `${label.slice(0, 77)}...` : label,
            isSelected: connection.id === selectedConnectionId,
            x: (from.x + to.x) / 2 + lift.x,
            y: (from.y + to.y) / 2 + lift.y,
          };
        })
        .filter(Boolean),
    [dragPreview, editingSetId, nodeLookup, selectedConnectionId, visibleConnections]
  );
  const selectedNodes = useMemo(
    () => displayNodes.filter((node) => selectedNodeIds.has(node.id)),
    [displayNodes, selectedNodeIds]
  );
  const selectedNodeCount = selectedNodes.length;
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const selectedSetNode = selectedNode?.kind === "set" ? selectedNode : null;
  const selectedOrganizationNode = selectedNode?.kind === "organization" ? selectedNode : null;
  const shouldShowActiveScopeActions = Boolean(activeScope && selectedNodeCount === 0 && !selectedConnectionId);
  const toolbarActionTransition = reduceMotion
    ? { duration: 0 }
    : { type: "tween", duration: 0.42, ease: [0.22, 1, 0.36, 1] };
  viewRef.current = { pan: scopePan, zoom: scopeZoom };

  useEffect(() => {
    return () => {
      if (dragFrame.current) {
        window.cancelAnimationFrame(dragFrame.current);
      }
      if (wheelZoomFrame.current) {
        window.cancelAnimationFrame(wheelZoomFrame.current);
      }
      if (toolbarActionsClearTimer.current) {
        window.clearTimeout(toolbarActionsClearTimer.current);
      }
      if (toolbarTooltipTimer.current) {
        window.clearTimeout(toolbarTooltipTimer.current);
      }
      if (connectionGesture.current) {
        const gesture = connectionGesture.current;
        if (gesture.captureTarget?.hasPointerCapture?.(gesture.pointerId)) {
          gesture.captureTarget.releasePointerCapture(gesture.pointerId);
        }
        removeConnectionListeners();
        connectionGesture.current = null;
      }
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("is-set-dragging", isDraggingSet);
    return () => document.body.classList.remove("is-set-dragging");
  }, [isDraggingSet]);

  useEffect(() => {
    if (!setDrag.current) {
      return undefined;
    }

    window.addEventListener("pointermove", moveSetDrag, { passive: false });
    window.addEventListener("pointerup", endSetDrag);
    window.addEventListener("pointercancel", endSetDrag);
    window.addEventListener("blur", cancelSetDrag);

    return () => {
      window.removeEventListener("pointermove", moveSetDrag);
      window.removeEventListener("pointerup", endSetDrag);
      window.removeEventListener("pointercancel", endSetDrag);
      window.removeEventListener("blur", cancelSetDrag);
    };
  }, [isDraggingSet]);

  useEffect(() => {
    if (editingSetId && !sets.some((set) => set.id === editingSetId)) {
      setEditingSetId(null);
      restoreEditorCamera();
    }
  }, [editingSetId, sets]);

  useEffect(() => {
    if (activeScopeId && !organizations.some((organization) => organization.id === activeScopeId)) {
      setActiveScopeId(null);
      setSelectedNodeIds(new Set());
      setEditingSetId(null);
      editorReturnView.current = null;
    }
  }, [activeScopeId, organizations]);

  useEffect(() => {
    if (!connectionSourceId || !pendingConnection?.clickPreview) {
      return undefined;
    }

    window.addEventListener("pointermove", moveClickConnectionPreview, { passive: true });
    return () => window.removeEventListener("pointermove", moveClickConnectionPreview);
  }, [connectionSourceId, pendingConnection?.clickPreview, scopePan, scopeZoom]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (!selectedConnectionId || event.target.closest?.("input, textarea")) {
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        onChange({
          connections: connections.filter((connection) => connection.id !== selectedConnectionId),
        });
        setSelectedConnectionId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [connections, onChange, selectedConnectionId]);

  function patchSet(setId, patch) {
    onChange((current) => ({
      sets: current.sets.map((set) => {
        if (set.id !== setId) {
          return set;
        }

        const nextPatch = typeof patch === "function" ? patch(set, current) : patch;
        return { ...set, ...(nextPatch || {}) };
      }),
    }));
  }

  function patchOrganization(organizationId, patch) {
    onChange((current) => ({
      organizations: current.organizations.map((organization) => {
        if (organization.id !== organizationId) {
          return organization;
        }

        const nextPatch = typeof patch === "function" ? patch(organization, current) : patch;
        return { ...organization, ...(nextPatch || {}) };
      }),
    }));
  }

  function setPan(nextPan) {
    if (activeScopeId) {
      patchOrganization(activeScopeId, { pan: nextPan });
      return;
    }

    onChange({ pan: nextPan });
  }

  function setZoom(nextZoom, anchor, baseView = viewRef.current) {
    const clampedZoom = clampZoom(nextZoom);
    const anchorPoint = anchor || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const viewportX = anchorPoint.x - window.innerWidth / 2;
    const viewportY = anchorPoint.y - window.innerHeight / 2;
    const localX = (viewportX - baseView.pan.x) / baseView.zoom;
    const localY = (viewportY - baseView.pan.y) / baseView.zoom;

    setCamera({
      zoom: clampedZoom,
      pan: {
        x: viewportX - localX * clampedZoom,
        y: viewportY - localY * clampedZoom,
      },
    });
  }

  function zoomBy(delta, anchor) {
    setZoom(scopeZoom + delta, anchor);
  }

  function flushWheelZoom() {
    wheelZoomFrame.current = null;
    const delta = wheelZoomDelta.current;
    const anchor = wheelZoomAnchor.current;
    const baseView = viewRef.current;
    wheelZoomDelta.current = 0;
    wheelZoomAnchor.current = null;

    if (!delta) {
      return;
    }

    setZoom(baseView.zoom + delta, anchor, baseView);
  }

  function scheduleWheelZoom(delta, anchor) {
    wheelZoomDelta.current += delta;
    wheelZoomAnchor.current = anchor;

    if (!wheelZoomFrame.current) {
      wheelZoomFrame.current = window.requestAnimationFrame(flushWheelZoom);
    }
  }

  function resetZoom() {
    editorReturnView.current = null;
    setCamera({ zoom: 1, pan: { x: 0, y: 0 } });
  }

  function setActiveSet(setId) {
    onChange({ activeSetId: setId });
  }

  function setCamera(nextView) {
    const nextCamera = {
      zoom: clampZoom(nextView.zoom),
      pan: nextView.pan,
    };

    if (activeScopeId) {
      patchOrganization(activeScopeId, nextCamera);
      return;
    }

    onChange(nextCamera);
  }

  function getEditorCamera(cardSet) {
    const focusZoom = getEditorFocusZoom(editorWidth, editorHeight);

    return {
      zoom: focusZoom,
      pan: {
        x: -cardSet.position.x * focusZoom,
        y: -cardSet.position.y * focusZoom + getEditorFocusYOffset(),
      },
    };
  }

  function openEditor(cardSet) {
    if (!cardSet) {
      return;
    }

    if (!editingSetId) {
      editorReturnView.current = viewRef.current;
    }

    setEditingSetId(cardSet.id);
    setActiveSet(cardSet.id);
    setSelectedConnectionId(null);
    setConnectionSourceId(null);
    setCamera(getEditorCamera(cardSet));
  }

  function restoreEditorCamera() {
    const returnView = editorReturnView.current;
    editorReturnView.current = null;

    if (returnView) {
      setCamera(returnView);
    }
  }

  function closeEditor() {
    setEditingSetId(null);
    restoreEditorCamera();
  }

  function addCardSet() {
    const nextSet = {
      ...createCardSet(sets.length, createSetId()),
      parentId: activeScopeId,
      position: {
        x: -scopePan.x / scopeZoom + 120 + scopeSets.length * 24,
        y: -scopePan.y / scopeZoom + 96 + scopeSets.length * 18,
      },
    };
    setBirthSourceId(null);
    setFreshId(nextSet.cards[0].id);
    onChange((current) => ({
      sets: [...current.sets, nextSet],
      activeSetId: nextSet.id,
    }));
    editorReturnView.current = null;
    setEditingSetId(null);
    window.setTimeout(() => setFreshId(null), 760);
  }

  function createOrganizationFromSelection() {
    const selectedNodes = displayNodes.filter((node) => selectedNodeIds.has(node.id));
    if (selectedNodes.length === 0) {
      return;
    }

    const center = getNodeCentroid(selectedNodes);
    const organization = {
      ...createOrganization(organizations.length, createOrganizationId()),
      parentId: activeScopeId,
      position: center,
    };
    const selectedIds = new Set(selectedNodes.map((node) => node.id));

    onChange((current) => ({
      sets: current.sets.map((set) =>
        selectedIds.has(set.id) && (set.parentId || null) === activeScopeId
          ? {
              ...set,
              parentId: organization.id,
              position: {
                x: set.position.x - center.x,
                y: set.position.y - center.y,
              },
            }
          : set
      ),
      organizations: [
        ...current.organizations.map((item) =>
          selectedIds.has(item.id) && (item.parentId || null) === activeScopeId
            ? {
                ...item,
                parentId: organization.id,
                position: {
                  x: item.position.x - center.x,
                  y: item.position.y - center.y,
                },
              }
            : item
        ),
        organization,
      ],
      connections: dedupeConnections(rebaseConnectionsForGroupedNodes(current.connections, selectedIds, activeScopeId, organization.id)),
    }));

    setEditingSetId(null);
    setSelectedConnectionId(null);
    setSelectedNodeIds(new Set([organization.id]));
  }

  function moveNodeOutOfOrganization(nodeId) {
    const cardSet = sets.find((set) => set.id === nodeId);
    const organization = organizationLookup.get(nodeId);
    const node = cardSet || organization;
    const parentOrganization = node?.parentId ? organizationLookup.get(node.parentId) : null;
    if (!node || !parentOrganization) {
      return;
    }

    const targetScopeId = parentOrganization.parentId || null;
    const nextPosition = getMovedOutNodePosition(node, parentOrganization);

    setBirthSourceId(null);
    setFreshId(null);
    setEditingSetId(null);
    editorReturnView.current = null;
    setPendingConnection(null);
    setSelectedConnectionId(null);
    setConnectionSourceId(null);
    setSelectedNodeIds(new Set([nodeId]));
    setScopeTransition("exit");
    setActiveScopeId(targetScopeId);
    window.setTimeout(() => setScopeTransition(null), reduceMotion ? 120 : 640);

    onChange((current) => ({
      sets: current.sets.map((set) =>
        set.id === nodeId
          ? {
              ...set,
              parentId: targetScopeId,
              position: nextPosition,
            }
          : set
      ),
      organizations: current.organizations.map((item) =>
        item.id === nodeId
          ? {
              ...item,
              parentId: targetScopeId,
              position: nextPosition,
            }
          : item
      ),
      connections: dedupeConnections(
        rewireConnectionsForMovedOutNode(current.connections, nodeId, parentOrganization.id, targetScopeId)
      ),
    }));
  }

  function moveOrganizationOutOfGroup(organizationId) {
    moveNodeOutOfOrganization(organizationId);
  }

  function moveCardSetOutOfOrganization(setId) {
    moveNodeOutOfOrganization(setId);
  }

  function requestDeleteCardSet(setId) {
    const cardSet = setLookup.get(setId);
    if (!cardSet) {
      return;
    }

    setConfirmRequest({
      title: "Move card set to trash?",
      body: `"${cardSet.title}" and ${cardSet.cards.length} card${
        cardSet.cards.length === 1 ? "" : "s"
      } will leave the canvas and stay recoverable in Trash.`,
      confirmLabel: "Move to Trash",
      onConfirm: () => moveCardSetToTrash(setId),
    });
  }

  function requestDeleteCard(setId, cardId) {
    const cardSet = setLookup.get(setId);
    const card = cardSet?.cards.find((item) => item.id === cardId);
    if (!cardSet || !card) {
      return;
    }

    setConfirmRequest({
      title: "Move card to trash?",
      body:
        cardSet.cards.length <= 1
          ? "This is the last card in the set. A blank card will stay here so the set remains usable."
          : `"${getCardPreview(card)}" will be removed from "${cardSet.title}" and can be restored from Trash.`,
      confirmLabel: "Move to Trash",
      onConfirm: () => moveCardToTrash(setId, cardId),
    });
  }

  function moveCardToTrash(setId, cardId) {
    setBirthSourceId(null);
    setFreshId(null);

    onChange((current) => {
      const sourceSet = current.sets.find((set) => set.id === setId);
      const card = sourceSet?.cards.find((item) => item.id === cardId);
      if (!sourceSet || !card) {
        return {};
      }

      const deleteIndex = sourceSet.cards.findIndex((item) => item.id === cardId);
      const remainingCards = sourceSet.cards.filter((item) => item.id !== cardId);
      const nextCards = remainingCards.length > 0 ? remainingCards : [createBlankCard()];
      const fallbackActiveIndex = Math.max(0, Math.min(deleteIndex, nextCards.length - 1));
      const currentTrash = normalizeTrash(current.trash);

      return {
        sets: current.sets.map((set) => {
          if (set.id !== setId) {
            return set;
          }

          return {
            ...set,
            cards: nextCards,
            activeId: set.activeId === cardId ? nextCards[fallbackActiveIndex].id : set.activeId,
          };
        }),
        trash: {
          ...currentTrash,
          cards: [
            {
              id: createTrashItemId("card"),
              deletedAt: new Date().toISOString(),
              sourceSetId: sourceSet.id,
              sourceSetTitle: sourceSet.title,
              card,
            },
            ...currentTrash.cards,
          ],
        },
      };
    });
  }

  function moveCardSetToTrash(setId) {
    const shouldRestoreEditorCamera = editingSetId === setId;

    setBirthSourceId(null);
    setFreshId(null);
    setPendingConnection(null);
    setSelectedConnectionId(null);
    setConnectionSourceId((current) => (current === setId ? null : current));
    setEditingSetId((current) => (current === setId ? null : current));

    onChange((current) => {
      const deleteIndex = current.sets.findIndex((set) => set.id === setId);
      const deletedSet = current.sets[deleteIndex];
      if (!deletedSet) {
        return {};
      }

      const remainingSets = current.sets.filter((set) => set.id !== setId);
      const nextSets = remainingSets.length > 0 ? remainingSets : [createCardSet(0, createSetId())];
      const activeSetStillExists = nextSets.some((set) => set.id === current.activeSetId);
      const fallbackActiveIndex = Math.max(0, Math.min(deleteIndex, nextSets.length - 1));
      const removedConnections = current.connections.filter(
        (connection) => {
          const { fromNodeId, toNodeId } = getConnectionNodeIds(connection);
          return fromNodeId === setId || toNodeId === setId;
        }
      );
      const currentTrash = normalizeTrash(current.trash);

      return {
        sets: nextSets,
        activeSetId: activeSetStillExists ? current.activeSetId : nextSets[fallbackActiveIndex].id,
        connections: current.connections.filter(
          (connection) => {
            const { fromNodeId, toNodeId } = getConnectionNodeIds(connection);
            return fromNodeId !== setId && toNodeId !== setId;
          }
        ),
        trash: {
          ...currentTrash,
          sets: [
            {
              id: createTrashItemId("set"),
              deletedAt: new Date().toISOString(),
              set: deletedSet,
              connections: removedConnections,
            },
            ...currentTrash.sets,
          ],
        },
      };
    });

    if (shouldRestoreEditorCamera) {
      restoreEditorCamera();
    }
  }

  function requestDeleteOrganization(organizationId) {
    const organization = organizationLookup.get(organizationId);
    if (!organization) {
      return;
    }
    const descendantOrganizationIds = collectDescendantOrganizationIds(organizationId, organizations);
    const organizationIds = new Set([organizationId, ...descendantOrganizationIds]);
    const descendantSetCount = sets.filter((set) => organizationIds.has(set.parentId)).length;

    setConfirmRequest({
      title: "Move organization to trash?",
      body: `"${organization.title}" and its ${descendantSetCount} card set${
        descendantSetCount === 1 ? "" : "s"
      } will leave this canvas and stay recoverable in Trash.`,
      confirmLabel: "Move to Trash",
      onConfirm: () => moveOrganizationToTrash(organizationId),
    });
  }

  function moveOrganizationToTrash(organizationId) {
    const organization = organizationLookup.get(organizationId);
    if (!organization) {
      return;
    }
    const shouldExitScope = activeScopeId === organizationId || isOrganizationDescendant(activeScopeId, organizationId, organizations);

    setBirthSourceId(null);
    setFreshId(null);
    setPendingConnection(null);
    setSelectedConnectionId(null);
    setConnectionSourceId(null);
    setSelectedNodeIds(new Set());
    if (shouldExitScope) {
      setActiveScopeId(organization.parentId || null);
      setEditingSetId(null);
      editorReturnView.current = null;
    }

    onChange((current) => {
      const descendantOrganizationIds = collectDescendantOrganizationIds(organizationId, current.organizations);
      const organizationIds = new Set([organizationId, ...descendantOrganizationIds]);
      const removedOrganizations = current.organizations.filter((item) => organizationIds.has(item.id));
      const removedSets = current.sets.filter((set) => organizationIds.has(set.parentId));
      const removedSetIds = new Set(removedSets.map((set) => set.id));
      const removedNodeIds = new Set([...organizationIds, ...removedSetIds]);
      const removedConnections = current.connections.filter((connection) => {
        const { fromNodeId, toNodeId } = getConnectionNodeIds(connection);
        return removedNodeIds.has(fromNodeId) || removedNodeIds.has(toNodeId) || organizationIds.has(connection.scopeId);
      });
      const nextSets = current.sets.filter((set) => !removedSetIds.has(set.id));
      const safeSets = nextSets.length > 0 ? nextSets : [createCardSet(0, createSetId())];
      const currentTrash = normalizeTrash(current.trash);
      const activeSetStillExists = safeSets.some((set) => set.id === current.activeSetId);

      return {
        sets: safeSets,
        organizations: current.organizations.filter((item) => !organizationIds.has(item.id)),
        activeSetId: activeSetStillExists ? current.activeSetId : safeSets[0]?.id,
        connections: current.connections.filter((connection) => !removedConnections.includes(connection)),
        trash: {
          ...currentTrash,
          organizations: [
            {
              id: createTrashItemId("organization"),
              deletedAt: new Date().toISOString(),
              organization: removedOrganizations.find((item) => item.id === organizationId),
              organizations: removedOrganizations.filter((item) => item.id !== organizationId),
              sets: removedSets,
              connections: removedConnections,
            },
            ...currentTrash.organizations,
          ],
        },
      };
    });
  }

  function restoreTrashCard(trashId) {
    onChange((current) => {
      const currentTrash = normalizeTrash(current.trash);
      const trashItem = currentTrash.cards.find((item) => item.id === trashId);
      if (!trashItem) {
        return {};
      }

      const existingCardIds = new Set(current.sets.flatMap((set) => set.cards.map((card) => card.id)));
      const restoredCard = existingCardIds.has(trashItem.card.id)
        ? { ...trashItem.card, id: createCardId() }
        : trashItem.card;
      const targetSet =
        current.sets.find((set) => set.id === trashItem.sourceSetId) ||
        current.sets.find((set) => set.id === current.activeSetId) ||
        current.sets[0];

      if (!targetSet) {
        return {};
      }

      return {
        sets: current.sets.map((set) => {
          if (set.id !== targetSet.id) {
            return set;
          }

          return {
            ...set,
            cards: [...set.cards, restoredCard],
            activeId: restoredCard.id,
          };
        }),
        activeSetId: targetSet.id,
        trash: {
          ...currentTrash,
          cards: currentTrash.cards.filter((item) => item.id !== trashId),
        },
      };
    });
  }

  function restoreTrashSet(trashId) {
    onChange((current) => {
      const currentTrash = normalizeTrash(current.trash);
      const trashItem = currentTrash.sets.find((item) => item.id === trashId);
      if (!trashItem) {
        return {};
      }

      const existingSetIds = new Set(current.sets.map((set) => set.id));
      const oldSetId = trashItem.set.id;
      const restoredSet = existingSetIds.has(oldSetId)
        ? { ...trashItem.set, id: createSetId(), title: `${trashItem.set.title} Restored` }
        : trashItem.set;
      const setIdsAfterRestore = new Set([...current.sets.map((set) => set.id), restoredSet.id]);
      const restoredConnections = trashItem.connections
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

      return {
        sets: [...current.sets, restoredSet],
        activeSetId: restoredSet.id,
        connections: dedupeConnections([...current.connections, ...restoredConnections]),
        trash: {
          ...currentTrash,
          sets: currentTrash.sets.filter((item) => item.id !== trashId),
        },
      };
    });
  }

  function restoreTrashOrganization(trashId) {
    onChange((current) => {
      const currentTrash = normalizeTrash(current.trash);
      const trashItem = currentTrash.organizations.find((item) => item.id === trashId);
      if (!trashItem?.organization) {
        return {};
      }

      const existingOrganizationIds = new Set(current.organizations.map((organization) => organization.id));
      const existingSetIds = new Set(current.sets.map((set) => set.id));
      const organizationItems = [trashItem.organization, ...(trashItem.organizations || [])];
      const organizationIdMap = new Map();
      for (const organization of organizationItems) {
        organizationIdMap.set(
          organization.id,
          existingOrganizationIds.has(organization.id) ? createOrganizationId() : organization.id
        );
      }
      const setIdMap = new Map();
      for (const set of trashItem.sets || []) {
        setIdMap.set(set.id, existingSetIds.has(set.id) ? createSetId() : set.id);
      }

      const restoredOrganizations = organizationItems.map((organization) => {
        const parentId = organization.parentId ? organizationIdMap.get(organization.parentId) || organization.parentId : null;
        return {
          ...organization,
          id: organizationIdMap.get(organization.id),
          parentId,
        };
      });
      const restoredOrganizationIds = new Set(restoredOrganizations.map((organization) => organization.id));
      const safeOrganizations = restoredOrganizations.map((organization) => {
        if (!organization.parentId || existingOrganizationIds.has(organization.parentId) || restoredOrganizationIds.has(organization.parentId)) {
          return organization;
        }

        return { ...organization, parentId: null };
      });
      const restoredSets = (trashItem.sets || []).map((set) => ({
        ...set,
        id: setIdMap.get(set.id),
        parentId: organizationIdMap.get(set.parentId) || set.parentId || null,
      }));
      const nodeIdsAfterRestore = new Set([
        ...current.sets.map((set) => set.id),
        ...current.organizations.map((organization) => organization.id),
        ...safeOrganizations.map((organization) => organization.id),
        ...restoredSets.map((set) => set.id),
      ]);
      const restoredConnections = (trashItem.connections || [])
        .map((connection) => ({
          ...connection,
          id: createConnectionId(),
          scopeId: organizationIdMap.get(connection.scopeId) || connection.scopeId || null,
          fromNodeId:
            organizationIdMap.get(connection.fromNodeId) || setIdMap.get(connection.fromNodeId) || connection.fromNodeId,
          toNodeId:
            organizationIdMap.get(connection.toNodeId) || setIdMap.get(connection.toNodeId) || connection.toNodeId,
        }))
        .filter(
          (connection) =>
            connection.fromNodeId !== connection.toNodeId &&
            nodeIdsAfterRestore.has(connection.fromNodeId) &&
            nodeIdsAfterRestore.has(connection.toNodeId)
        );

      return {
        organizations: [...current.organizations, ...safeOrganizations],
        sets: [...current.sets, ...restoredSets],
        activeSetId: restoredSets[0]?.id || current.activeSetId,
        connections: dedupeConnections([...current.connections, ...restoredConnections]),
        trash: {
          ...currentTrash,
          organizations: currentTrash.organizations.filter((item) => item.id !== trashId),
        },
      };
    });
  }

  function requestPermanentDeleteTrashItem(kind, trashId) {
    const trashItem =
      kind === "organization"
        ? trash.organizations.find((item) => item.id === trashId)
        : kind === "set"
          ? trash.sets.find((item) => item.id === trashId)
          : trash.cards.find((item) => item.id === trashId);
    if (!trashItem) {
      return;
    }

    setConfirmRequest({
      title: "Delete forever?",
      body:
        kind === "organization"
          ? `"${trashItem.organization.title}" will be permanently removed from Trash.`
          : kind === "set"
          ? `"${trashItem.set.title}" will be permanently removed from Trash.`
          : `"${getCardPreview(trashItem.card)}" will be permanently removed from Trash.`,
      confirmLabel: "Delete Forever",
      onConfirm: () => permanentlyDeleteTrashItem(kind, trashId),
    });
  }

  function permanentlyDeleteTrashItem(kind, trashId) {
    onChange((current) => {
      const currentTrash = normalizeTrash(current.trash);

      return {
        trash: {
          ...currentTrash,
          cards: kind === "card" ? currentTrash.cards.filter((item) => item.id !== trashId) : currentTrash.cards,
          sets: kind === "set" ? currentTrash.sets.filter((item) => item.id !== trashId) : currentTrash.sets,
          organizations:
            kind === "organization"
              ? currentTrash.organizations.filter((item) => item.id !== trashId)
              : currentTrash.organizations,
        },
      };
    });
  }

  function deleteSelectedConnection() {
    if (!selectedConnectionId) {
      return;
    }

    onChange({
      connections: connections.filter((connection) => connection.id !== selectedConnectionId),
    });
    setSelectedConnectionId(null);
  }

  function patchSelectedConnectionLabel(value) {
    if (!selectedConnectionId) {
      return;
    }

    const label = normalizeConnectionLabel(value);
    onChange({
      connections: connections.map((connection) =>
        connection.id === selectedConnectionId ? { ...connection, label } : connection
      ),
    });
  }

  function hideToolbarTooltip() {
    if (toolbarTooltipTimer.current) {
      window.clearTimeout(toolbarTooltipTimer.current);
      toolbarTooltipTimer.current = null;
    }
    setToolbarTooltip(null);
  }

  function queueToolbarTooltip(event, label) {
    const button = event.currentTarget;
    if (!label || !button) {
      return;
    }

    hideToolbarTooltip();
    toolbarTooltipTimer.current = window.setTimeout(() => {
      const toolbarRect = toolbarRef.current?.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      if (!toolbarRect || !buttonRect.width) {
        return;
      }

      const center = buttonRect.left + buttonRect.width / 2 - toolbarRect.left;
      const safeLeft = Math.min(Math.max(center, 72), Math.max(72, toolbarRect.width - 72));
      setToolbarTooltip({
        label,
        left: safeLeft,
        top: buttonRect.bottom - toolbarRect.top + 9,
      });
      toolbarTooltipTimer.current = null;
    }, 650);
  }

  function getToolbarTooltipProps(label) {
    return {
      "data-toolbar-tooltip": label,
      onBlur: hideToolbarTooltip,
      onFocus: (event) => queueToolbarTooltip(event, label),
      onMouseEnter: (event) => queueToolbarTooltip(event, label),
      onMouseLeave: hideToolbarTooltip,
      onPointerDown: hideToolbarTooltip,
      onPointerEnter: (event) => queueToolbarTooltip(event, label),
      onPointerLeave: hideToolbarTooltip,
    };
  }

  function handleStageClick() {
    if (panGesture.current?.dragged) {
      panGesture.current = null;
      return;
    }

    panGesture.current = null;
    setSelectedConnectionId(null);
    setConnectionSourceId(null);
    setPendingConnection(null);
    setSelectedNodeIds(new Set());
  }

  function handlePointerDown(event) {
    if (
      event.button !== 0 ||
      event.target.closest(
        ".clue-set, .organization-node, .field-toolbar, .scope-breadcrumbs, button, input, textarea, a, .connection-line, .connection-line-hit"
      )
    ) {
      return;
    }

    panGesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: scopePan.x,
      originY: scopePan.y,
      dragged: false,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event) {
    const gesture = panGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    const nextX = gesture.originX + event.clientX - gesture.startX;
    const nextY = gesture.originY + event.clientY - gesture.startY;
    if (Math.abs(nextX - gesture.originX) > 3 || Math.abs(nextY - gesture.originY) > 3) {
      gesture.dragged = true;
    }
    setPan({ x: nextX, y: nextY });
  }

  function endPan(event) {
    const gesture = panGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    setIsPanning(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function beginSetDrag(event, nodeId) {
    if (
      event.button !== 0 ||
      event.target.closest("button, textarea, a, input:not([readonly]), [contenteditable='true']")
    ) {
      return;
    }

    const node = nodeLookup.get(nodeId);
    if (!node) {
      return;
    }

    setDrag.current = {
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      setId: nodeId,
      kind: node.kind,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.position.x,
      originY: node.position.y,
      nextPosition: node.position,
      active: false,
      dragged: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  }

  function flushDragPreview() {
    dragFrame.current = null;
    const drag = setDrag.current;
    if (!drag) {
      return;
    }

    setDragPreview({
      nodeId: drag.setId,
      position: drag.nextPosition,
    });
  }

  function moveSetDrag(event) {
    const drag = setDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const nextY = drag.originY + (event.clientY - drag.startY) / scopeZoom;
    const correctedNextX = drag.originX + (event.clientX - drag.startX) / scopeZoom;
    if (Math.abs(correctedNextX - drag.originX) > 3 || Math.abs(nextY - drag.originY) > 3) {
      drag.dragged = true;
    }
    drag.nextPosition = { x: correctedNextX, y: nextY };

    if (!drag.active) {
      if (!drag.dragged) {
        return;
      }
      drag.active = true;
      clearTextSelection();
      setDragPreview({ nodeId: drag.setId, position: drag.nextPosition });
    }

    setDropTargetOrganizationId(getOrganizationDropTargetId(event.clientX, event.clientY, drag.setId));

    if (event.cancelable) {
      event.preventDefault();
    }
    clearTextSelection();
    if (!dragFrame.current) {
      dragFrame.current = window.requestAnimationFrame(flushDragPreview);
    }
  }

  function endSetDrag(event) {
    const drag = setDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    finishSetDrag();
  }

  function cancelSetDrag() {
    if (!setDrag.current) {
      return;
    }

    finishSetDrag();
  }

  function finishSetDrag() {
    const drag = setDrag.current;
    if (!drag) {
      return;
    }

    if (drag.captureTarget?.hasPointerCapture?.(drag.pointerId)) {
      drag.captureTarget.releasePointerCapture(drag.pointerId);
    }
    if (dragFrame.current) {
      window.cancelAnimationFrame(dragFrame.current);
      dragFrame.current = null;
    }
    const nextPosition = drag.nextPosition || { x: drag.originX, y: drag.originY };
    const dropTargetId = dropTargetOrganizationId;
    setDrag.current = null;
    setDragPreview(null);
    setDropTargetOrganizationId(null);
    clearTextSelection();
    if (drag.dragged) {
      suppressSetClick.current = true;
      window.setTimeout(() => {
        suppressSetClick.current = false;
      }, 120);
    }
    if (drag.active && (nextPosition.x !== drag.originX || nextPosition.y !== drag.originY)) {
      if (dropTargetId) {
        moveNodeIntoOrganization(drag.setId, dropTargetId, nextPosition);
      } else if (drag.kind === "organization") {
        patchOrganization(drag.setId, { position: nextPosition });
      } else {
        patchSet(drag.setId, { position: nextPosition });
      }
    }
  }

  function moveNodeIntoOrganization(nodeId, targetOrganizationId, nextPosition) {
    const node = nodeLookup.get(nodeId);
    const targetOrganization = organizationLookup.get(targetOrganizationId);
    if (!node || !targetOrganization || (targetOrganization.parentId || null) !== activeScopeId) {
      return;
    }
    if (node.kind === "organization" && (nodeId === targetOrganizationId || isOrganizationDescendant(targetOrganizationId, nodeId, organizations))) {
      return;
    }

    const localPosition = {
      x: nextPosition.x - targetOrganization.position.x,
      y: nextPosition.y - targetOrganization.position.y,
    };

    onChange((current) => ({
      sets: current.sets.map((set) =>
        set.id === nodeId ? { ...set, parentId: targetOrganizationId, position: localPosition } : set
      ),
      organizations: current.organizations.map((organization) =>
        organization.id === nodeId
          ? { ...organization, parentId: targetOrganizationId, position: localPosition }
          : organization
      ),
      connections: dedupeConnections(rewireConnectionsForMovedNode(current.connections, nodeId, activeScopeId, targetOrganizationId)),
    }));

    setSelectedNodeIds(new Set([nodeId]));
  }

  function getOrganizationDropTargetId(clientX, clientY, draggingNodeId) {
    const domOrganizationId = document
      .elementFromPoint?.(clientX, clientY)
      ?.closest?.("[data-organization-id]")
      ?.dataset?.organizationId;
    if (isValidOrganizationDropTarget(draggingNodeId, domOrganizationId)) {
      return domOrganizationId;
    }

    const pointer = getCanvasPointFromClient(clientX, clientY, scopePan, scopeZoom);
    const hitTolerance = 18 / Math.max(scopeZoom || 1, 0.1);

    return scopeOrganizations
      .map((organization, index) => ({
        id: organization.id,
        zIndex: 220 + index,
        bounds: getNodeHitBounds({ kind: "organization", position: organization.position }, {}),
      }))
      .filter(({ id }) => isValidOrganizationDropTarget(draggingNodeId, id))
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

  function isValidOrganizationDropTarget(draggingNodeId, organizationId) {
    if (!organizationId || draggingNodeId === organizationId || !organizationLookup.has(organizationId)) {
      return false;
    }

    const draggingNode = nodeLookup.get(draggingNodeId);
    if (!draggingNode) {
      return false;
    }

    return draggingNode.kind !== "organization" || !isOrganizationDescendant(organizationId, draggingNodeId, organizations);
  }

  function createConnection(fromNodeId, toNodeId) {
    if (!toNodeId || fromNodeId === toNodeId || hasConnection(connections, fromNodeId, toNodeId, activeScopeId)) {
      return false;
    }

    const nextConnection = {
      id: createConnectionId(),
      scopeId: activeScopeId,
      fromNodeId,
      toNodeId,
    };
    onChange({ connections: [...connections, nextConnection] });
    setSelectedConnectionId(nextConnection.id);
    setConnectionSourceId(null);
    setPendingConnection(null);
    return true;
  }

  function beginConnection(event, nodeId) {
    if (event.button !== 0) {
      return;
    }

    const node = nodeLookup.get(nodeId);
    if (!node) {
      return;
    }

    cancelActiveConnection();

    connectionGesture.current = {
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      nodeId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", moveConnection, { passive: false });
    window.addEventListener("pointerup", endConnection);
    window.addEventListener("pointercancel", cancelConnection);
    window.addEventListener("blur", cancelActiveConnection);
    event.stopPropagation();
  }

  function moveConnection(event) {
    const gesture = connectionGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    const pointerDistance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (!gesture.dragging && pointerDistance <= 4) {
      return;
    }

    if (!gesture.dragging) {
      const node = nodeLookup.get(gesture.nodeId);
      const origin = getNodeCenter(node, editingSetId === gesture.nodeId);
      gesture.dragging = true;
      setSelectedConnectionId(null);
      setPendingConnection({
        fromNodeId: gesture.nodeId,
        pointerId: gesture.pointerId,
        x: origin.x,
        y: origin.y,
      });
    }

    if (event.cancelable) {
      event.preventDefault();
    }
    const pointer = getCanvasPointFromClient(event.clientX, event.clientY, scopePan, scopeZoom);
    setPendingConnection((current) =>
      current
        ? {
            ...current,
            x: pointer.x,
            y: pointer.y,
          }
        : current
    );
  }

  function moveClickConnectionPreview(event) {
    const pointer = getCanvasPointFromClient(event.clientX, event.clientY, scopePan, scopeZoom);

    setPendingConnection((current) =>
      current?.clickPreview
        ? {
            ...current,
            x: pointer.x,
            y: pointer.y,
          }
        : current
    );
  }

  function beginClickConnection(nodeId, event) {
    const sourceNode = nodeLookup.get(nodeId);
    if (!sourceNode) {
      return;
    }

    const origin = getNodeCenter(sourceNode, editingSetId === nodeId);
    const pointer =
      event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
        ? getCanvasPointFromClient(event.clientX, event.clientY, scopePan, scopeZoom)
        : origin;

    setConnectionSourceId(nodeId);
    setSelectedConnectionId(null);
    setPendingConnection({
      fromNodeId: nodeId,
      clickPreview: true,
      x: pointer.x,
      y: pointer.y,
    });
  }

  function clickConnection(nodeId, event) {
    if (!connectionSourceId) {
      beginClickConnection(nodeId, event);
      return;
    }

    if (connectionSourceId === nodeId || hasConnection(connections, connectionSourceId, nodeId, activeScopeId)) {
      setConnectionSourceId(null);
      setPendingConnection(null);
      return;
    }

    createConnection(connectionSourceId, nodeId);
  }

  function endConnection(event) {
    const gesture = connectionGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    if (gesture.captureTarget?.hasPointerCapture?.(gesture.pointerId)) {
      gesture.captureTarget.releasePointerCapture(gesture.pointerId);
    }
    removeConnectionListeners();
    connectionGesture.current = null;
    event.stopPropagation();

    if (gesture.dragging) {
      const targetNodeId = getConnectionDropTargetId({
        clientX: event.clientX,
        clientY: event.clientY,
        fromNodeId: gesture.nodeId,
        nodes: displayNodes,
        nodeLookup,
        editingSetId,
        activeSetId,
        dragPreview,
        pan: scopePan,
        zoom: scopeZoom,
        editorWidth,
        editorHeight,
      });
      setPendingConnection(null);
      createConnection(gesture.nodeId, targetNodeId);
      return;
    }

    setPendingConnection(null);
    clickConnection(gesture.nodeId, event);
  }

  function cancelConnection(event) {
    const gesture = connectionGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    if (gesture.captureTarget?.hasPointerCapture?.(gesture.pointerId)) {
      gesture.captureTarget.releasePointerCapture(gesture.pointerId);
    }
    removeConnectionListeners();
    connectionGesture.current = null;
    setPendingConnection(null);
    event.stopPropagation();
  }

  function cancelActiveConnection() {
    const gesture = connectionGesture.current;
    if (!gesture) {
      return;
    }

    if (gesture.captureTarget?.hasPointerCapture?.(gesture.pointerId)) {
      gesture.captureTarget.releasePointerCapture(gesture.pointerId);
    }
    removeConnectionListeners();
    connectionGesture.current = null;
    setPendingConnection(null);
  }

  function removeConnectionListeners() {
    window.removeEventListener("pointermove", moveConnection);
    window.removeEventListener("pointerup", endConnection);
    window.removeEventListener("pointercancel", cancelConnection);
    window.removeEventListener("blur", cancelActiveConnection);
  }

  function handleNodeClick(event, node) {
    event.stopPropagation();
    if (suppressSetClick.current) {
      suppressSetClick.current = false;
      return;
    }

    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      setSelectedNodeIds((current) => {
        const next = new Set(current);
        if (next.has(node.id)) {
          next.delete(node.id);
        } else {
          next.add(node.id);
        }
        return next;
      });
      if (node.kind === "set") {
        setActiveSet(node.id);
      }
      setSelectedConnectionId(null);
      return;
    }

    setSelectedNodeIds(new Set([node.id]));
    setSelectedConnectionId(null);
    if (node.kind === "set") {
      setActiveSet(node.id);
    }
  }

  function enterOrganization(organization) {
    if (!organization) {
      return;
    }
    setEditingSetId(null);
    editorReturnView.current = null;
    setSelectedConnectionId(null);
    setConnectionSourceId(null);
    setPendingConnection(null);
    setSelectedNodeIds(new Set());
    setScopeTransition("enter");
    setActiveScopeId(organization.id);
    window.setTimeout(() => setScopeTransition(null), reduceMotion ? 120 : 640);
  }

  function goToScope(scopeId) {
    if ((scopeId || null) === activeScopeId) {
      return;
    }
    setEditingSetId(null);
    editorReturnView.current = null;
    setSelectedConnectionId(null);
    setConnectionSourceId(null);
    setPendingConnection(null);
    setSelectedNodeIds(new Set());
    setScopeTransition(scopeId ? "enter" : "exit");
    setActiveScopeId(scopeId || null);
    window.setTimeout(() => setScopeTransition(null), reduceMotion ? 120 : 640);
  }

  function setScopeTitle(nextTitle) {
    if (activeScopeId) {
      patchOrganization(activeScopeId, { title: nextTitle });
    }
  }

  const contextualToolbarActions = [];
  if (selectedNodeCount > 0) {
    contextualToolbarActions.push({
      slot: "group",
      subject: selectedNodes.map((node) => node.id).join("|"),
      title: "Create organization from selection",
      label: "Create organization from selection",
      icon: Layers3,
      onClick: createOrganizationFromSelection,
    });
  }
  if (selectedSetNode) {
    contextualToolbarActions.push({
      slot: "primary",
      subject: selectedSetNode.id,
      title: "Edit selected card set",
      label: "Edit selected card set",
      icon: Pencil,
      iconSize: 17,
      onClick: () => openEditor(selectedSetNode.set),
    });
    if (selectedSetNode.parentId) {
      contextualToolbarActions.push({
        slot: "ungroup",
        subject: selectedSetNode.id,
        title: "Move selected card set out of organization",
        label: "Move selected card set out of organization",
        icon: Ungroup,
        onClick: () => moveCardSetOutOfOrganization(selectedSetNode.id),
      });
    }
    contextualToolbarActions.push({
      slot: "delete",
      subject: selectedSetNode.id,
      title: "Move selected card set to trash",
      label: "Move selected card set to trash",
      icon: Trash2,
      danger: true,
      onClick: () => requestDeleteCardSet(selectedSetNode.id),
    });
  }
  if (selectedOrganizationNode) {
    contextualToolbarActions.push({
      slot: "primary",
      subject: selectedOrganizationNode.id,
      title: "Open selected organization",
      label: "Open selected organization",
      icon: FolderOpen,
      onClick: () => enterOrganization(selectedOrganizationNode.organization),
    });
    if (selectedOrganizationNode.parentId) {
      contextualToolbarActions.push({
        slot: "ungroup",
        subject: selectedOrganizationNode.id,
        title: "Move selected organization out of group",
        label: "Move selected organization out of group",
        icon: Ungroup,
        onClick: () => moveOrganizationOutOfGroup(selectedOrganizationNode.id),
      });
    }
    contextualToolbarActions.push({
      slot: "delete",
      subject: selectedOrganizationNode.id,
      title: "Move selected organization to trash",
      label: "Move selected organization to trash",
      icon: Trash2,
      danger: true,
      onClick: () => requestDeleteOrganization(selectedOrganizationNode.id),
    });
  }
  if (shouldShowActiveScopeActions) {
    if (activeScope.parentId) {
      contextualToolbarActions.push({
        slot: "scope-ungroup",
        subject: activeScope.id,
        title: "Move this organization out of group",
        label: "Move this organization out of group",
        icon: Ungroup,
        onClick: () => moveOrganizationOutOfGroup(activeScope.id),
      });
    }
    contextualToolbarActions.push({
      slot: "scope-delete",
      subject: activeScope.id,
      title: "Remove this organization",
      label: "Remove this organization",
      icon: Trash2,
      danger: true,
      onClick: () => requestDeleteOrganization(activeScope.id),
    });
  }
  const contextualToolbarWidth =
    contextualToolbarActions.length > 0
      ? contextualToolbarActions.length * 38 + (contextualToolbarActions.length - 1) * 10
      : 0;
  const contextualToolbarSignature = contextualToolbarActions
    .map((action) => `${action.slot}:${action.subject || ""}`)
    .join("|");

  useEffect(() => {
    if (toolbarActionsClearTimer.current) {
      window.clearTimeout(toolbarActionsClearTimer.current);
      toolbarActionsClearTimer.current = null;
    }

    if (contextualToolbarActions.length > 0 || reduceMotion) {
      setRenderedToolbarActions(contextualToolbarActions);
      return undefined;
    }

    const clearTimer = window.setTimeout(() => {
      setRenderedToolbarActions([]);
      toolbarActionsClearTimer.current = null;
    }, 460);
    toolbarActionsClearTimer.current = clearTimer;

    return () => {
      window.clearTimeout(clearTimer);
      if (toolbarActionsClearTimer.current === clearTimer) {
        toolbarActionsClearTimer.current = null;
      }
    };
  }, [contextualToolbarSignature, reduceMotion]);
  const visibleToolbarActions =
    contextualToolbarActions.length > 0 ? contextualToolbarActions : renderedToolbarActions;

  return (
    <section className="field-panel" onClick={handleStageClick}>
      {activeScope && (
        <div className="scope-breadcrumbs" onClick={(event) => event.stopPropagation()}>
          <button type="button" aria-label="Back to parent organization" onClick={() => goToScope(activeScope.parentId || null)}>
            <ChevronLeft size={15} />
          </button>
          {scopePath.slice(0, -1).map((organization) => (
            <button type="button" key={organization.id} onClick={() => goToScope(organization.id)}>
              {organization.title || "Untitled"}
            </button>
          ))}
          <input
            aria-label="Organization title"
            value={activeScope.title || ""}
            onChange={(event) => setScopeTitle(event.target.value)}
            onFocus={(event) => event.target.select()}
          />
        </div>
      )}
      <div className="field-toolbar" ref={toolbarRef}>
        <button
          className="icon-button"
          type="button"
          aria-label="Zoom out"
          {...getToolbarTooltipProps("Zoom out")}
          onClick={(event) => {
            event.stopPropagation();
            zoomBy(-zoomStep);
          }}
        >
          <ZoomOut size={18} />
        </button>
        <button
          className="zoom-readout"
          type="button"
          aria-label="Reset zoom"
          {...getToolbarTooltipProps("Reset zoom")}
          onClick={(event) => {
            event.stopPropagation();
            resetZoom();
          }}
        >
          {Math.round(scopeZoom * 100)}%
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Zoom in"
          {...getToolbarTooltipProps("Zoom in")}
          onClick={(event) => {
            event.stopPropagation();
            zoomBy(zoomStep);
          }}
        >
          <ZoomIn size={18} />
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Create card set"
          {...getToolbarTooltipProps("New card set")}
          onClick={(event) => {
            event.stopPropagation();
            addCardSet();
          }}
        >
          <Plus size={18} />
        </button>
        <motion.div
          className="contextual-toolbar-actions"
          initial={false}
          animate={{
            width: contextualToolbarWidth,
            marginLeft: contextualToolbarActions.length > 0 ? 10 : 0,
            opacity: contextualToolbarActions.length > 0 ? 1 : 0,
          }}
          transition={toolbarActionTransition}
          aria-hidden={contextualToolbarActions.length === 0}
          style={{ pointerEvents: contextualToolbarActions.length > 0 ? "auto" : "none" }}
        >
          {visibleToolbarActions.map((action) => {
            const Icon = action.icon;

            return (
              <button
                className={`icon-button contextual-toolbar-button ${action.danger ? "danger-icon-button" : ""}`}
                type="button"
                aria-label={action.label}
                key={action.slot}
                {...getToolbarTooltipProps(action.title)}
                onClick={(event) => {
                  event.stopPropagation();
                  action.onClick();
                }}
              >
                <Icon size={action.iconSize || 18} />
              </button>
            );
          })}
        </motion.div>
        <button
          className="icon-button trash-toolbar-button"
          type="button"
          aria-label={`Open trash with ${trashCount} item${trashCount === 1 ? "" : "s"}`}
          {...getToolbarTooltipProps("Trash")}
          onClick={(event) => {
            event.stopPropagation();
            setIsTrashOpen(true);
          }}
        >
          <ArchiveRestore size={18} />
        </button>
        <div className="card-count" aria-label={`${scopeSets.length} card sets and ${scopeOrganizations.length} organizations`}>
          <Layers3 size={16} />
          <span>{String(scopeSets.length + scopeOrganizations.length).padStart(2, "0")}</span>
        </div>
        {toolbarTooltip && (
          <div
            className="field-toolbar-tooltip"
            role="tooltip"
            style={{ left: toolbarTooltip.left, top: toolbarTooltip.top }}
          >
            {toolbarTooltip.label}
          </div>
        )}
      </div>

      <div
        className={`field-stage clue-wall ${isPanning ? "is-panning" : ""} ${
          editingSetId ? "is-inspecting" : ""
        } ${
          isDraggingSet ? "is-set-dragging" : ""
        } ${
          scopeTransition ? `is-scope-${scopeTransition}` : ""
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onWheel={(event) => {
          if (event.target.closest(".clue-set, .organization-node, .field-toolbar, .scope-breadcrumbs, button, input, textarea, a")) {
            return;
          }

          event.preventDefault();
          scheduleWheelZoom(getWheelZoomDelta(event), { x: event.clientX, y: event.clientY });
        }}
      >
        <motion.div
          className="canvas-world"
          initial={false}
          animate={{ x: scopePan.x, y: scopePan.y, scale: scopeZoom }}
          transition={
            reduceMotion || isPanning || dragPreview
              ? { duration: 0 }
              : {
                  type: "spring",
                  stiffness: editingSetId ? 86 : 100,
                  damping: editingSetId ? 22 : 24,
                  mass: editingSetId ? 1.18 : 1,
                  restDelta: 0.001,
                }
          }
          style={{ transformOrigin: "50% 50%" }}
        >
          <div className="canvas-grid" aria-hidden="true" />
          <ConnectionLayer
            connections={visibleConnections}
            nodeLookup={nodeLookup}
            editingSetId={editingSetId}
            pendingConnection={pendingConnection}
            selectedConnectionId={selectedConnectionId}
            dragPreview={dragPreview}
            onSelectConnection={(connectionId) => {
              setSelectedConnectionId(connectionId);
              setSelectedNodeIds(new Set());
            }}
          />
          {displayNodes.map((node, index) => {
            const cardSet = node.set;
            const organization = node.organization;
            const isSetNode = node.kind === "set";
            const isOrganizationNode = node.kind === "organization";
            const isActiveSet = isSetNode && node.id === activeSetId;
            const isEditing = isSetNode && node.id === editingSetId;
            const isDraggingNode = dragPreview?.nodeId === node.id;
            const isSelectedNode = selectedNodeIds.has(node.id);
            const isDropTarget = isOrganizationNode && dropTargetOrganizationId === node.id;
            const nodePosition = isDraggingNode ? dragPreview.position : node.position;
            const nodeWidth = isSetNode ? (isEditing ? editorWidth : wallSetSize.width) : organizationNodeSize.width;
            const nodeHeight = isSetNode ? (isEditing ? editorHeight : wallSetSize.height) : organizationNodeSize.height;

            return (
              <motion.section
                className={`clue-set-positioner ${isOrganizationNode ? "is-organization-positioner" : ""} ${
                  isActiveSet ? "is-active-set" : ""
                } ${
                  isSelectedNode ? "is-selected-node" : ""
                } ${
                  isDropTarget ? "is-drop-target" : ""
                } ${
                  isEditing ? "is-editing-set" : ""
                } ${
                  isDraggingNode ? "is-dragging-set" : ""
                }`}
                data-node-id={node.id}
                data-set-id={isSetNode ? node.id : undefined}
                data-organization-id={isOrganizationNode ? node.id : undefined}
                key={node.id}
                initial={false}
                layout={false}
                animate={{
                  x: nodePosition.x,
                  y: nodePosition.y,
                  width: nodeWidth,
                  height: nodeHeight,
                  marginLeft: -nodeWidth / 2,
                  marginTop: -nodeHeight / 2,
                  scale: 1,
                  opacity: 1,
                }}
                transition={
                  isDraggingNode
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 150, damping: 28, mass: 1 }
                }
                style={{
                  zIndex: isEditing ? 260 : isDropTarget ? 235 : isOrganizationNode ? 150 + index : isActiveSet ? 180 : 120 + index,
                }}
                onClick={(event) => handleNodeClick(event, node)}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  if (isSetNode) {
                    openEditor(cardSet);
                  } else {
                    enterOrganization(organization);
                  }
                }}
                onPointerMove={moveSetDrag}
                onPointerUp={endSetDrag}
                onPointerCancel={endSetDrag}
              >
                {isSetNode && isEditing ? (
                  <CardSetEditor
                    cardSet={cardSet}
                    cardWidth={cardWidth}
                    freshId={isActiveSet ? freshId : null}
                    birthSourceId={isActiveSet ? birthSourceId : null}
                    isActiveSet={isActiveSet}
                    onActivate={() => setActiveSet(cardSet.id)}
                    onClose={closeEditor}
                    onDeleteSet={() => requestDeleteCardSet(cardSet.id)}
                    onDeleteCard={(cardId) => requestDeleteCard(cardSet.id, cardId)}
                    onPatch={(patch) => patchSet(cardSet.id, patch)}
                    onFreshCard={(cardId, sourceId) => {
                      setBirthSourceId(sourceId);
                      setFreshId(cardId);
                      window.setTimeout(() => setFreshId(null), 760);
                    }}
                    onDragStart={(event) => beginSetDrag(event, cardSet.id)}
                  />
                ) : isSetNode ? (
                  <ClueSetSummary
                    cardSet={cardSet}
                    isActiveSet={isActiveSet}
                    connectionSourceId={connectionSourceId}
                    onEdit={() => {
                      openEditor(cardSet);
                    }}
                    onDelete={() => requestDeleteCardSet(cardSet.id)}
                    onMoveOut={() => moveCardSetOutOfOrganization(cardSet.id)}
                    onDragStart={(event) => beginSetDrag(event, cardSet.id)}
                    onConnectionStart={(event) => beginConnection(event, cardSet.id)}
                    onConnectionMove={moveConnection}
                    onConnectionEnd={endConnection}
                    onConnectionCancel={cancelConnection}
                    onConnectionClick={(event) => clickConnection(cardSet.id, event)}
                  />
                ) : (
                  <OrganizationSummary
                    organization={organization}
                    connectionSourceId={connectionSourceId}
                    onOpen={() => enterOrganization(organization)}
                    onDelete={() => requestDeleteOrganization(organization.id)}
                    onDragStart={(event) => beginSetDrag(event, organization.id)}
                    onConnectionStart={(event) => beginConnection(event, organization.id)}
                    onConnectionMove={moveConnection}
                    onConnectionEnd={endConnection}
                    onConnectionCancel={cancelConnection}
                    onConnectionClick={(event) => clickConnection(organization.id, event)}
                    onMoveOut={() => moveOrganizationOutOfGroup(organization.id)}
                  />
                )}
              </motion.section>
            );
          })}
          {connectionLabels.map((connectionLabel) => (
            <div
              className={`connection-label-pill ${connectionLabel.isSelected ? "is-selected" : ""}`}
              key={connectionLabel.id}
              style={{
                transform: `translate(${connectionLabel.x}px, ${connectionLabel.y}px) translate(-50%, -50%)`,
              }}
            >
              {connectionLabel.label}
            </div>
          ))}
        </motion.div>
        {selectedConnection && selectedConnectionControl && (
          <div
            className="connection-control"
            style={{
              left: selectedConnectionControl.left,
              top: selectedConnectionControl.top,
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Pencil size={14} aria-hidden="true" />
            <input
              className="connection-name-input"
              type="text"
              aria-label="Relationship name"
              value={selectedConnection.label || ""}
              maxLength={80}
              placeholder="Relationship"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => patchSelectedConnectionLabel(event.target.value)}
            />
            <button
              type="button"
              title="Delete line"
              aria-label="Delete selected line"
              onClick={(event) => {
                event.stopPropagation();
                deleteSelectedConnection();
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>
      {isTrashOpen && (
        <TrashModal
          trash={trash}
          onClose={() => setIsTrashOpen(false)}
          onRestoreCard={restoreTrashCard}
          onRestoreSet={restoreTrashSet}
          onRestoreOrganization={restoreTrashOrganization}
          onPermanentDelete={requestPermanentDeleteTrashItem}
        />
      )}
      {confirmRequest && (
        <ConfirmModal
          request={confirmRequest}
          onCancel={() => setConfirmRequest(null)}
          onConfirm={() => {
            confirmRequest.onConfirm();
            setConfirmRequest(null);
          }}
        />
      )}
    </section>
  );
}

export default CardField;
