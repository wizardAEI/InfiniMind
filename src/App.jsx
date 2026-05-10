import { MotionConfig, motion, useReducedMotion } from "framer-motion";
import {
  ArchiveRestore,
  ArrowUpRight,
  ChevronLeft,
  Clipboard,
  FileText,
  FolderOpen,
  ImageIcon,
  Layers3,
  Link2,
  Maximize2,
  Minimize2,
  Paperclip,
  Plus,
  RotateCcw,
  Settings,
  Trash2,
  Ungroup,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./components/Modal.jsx";
import {
  clamp,
  clampZoom,
  createBlankCard,
  createCardId,
  createCardSet,
  createConnectionId,
  createDefaultState,
  createDefaultWorkspaceState,
  createOrganization,
  createOrganizationId,
  createProject,
  createSetId,
  createTrashItemId,
  dedupeConnections,
  getCardPreview,
  getRandomImageStyle,
  getTrashCount,
  hasConnection,
  legacyStorageKey,
  minZoom,
  normalizeTrash,
  normalizeUrl,
  normalizeWorkspaceState,
  storageKey,
} from "./lib/workspaceModel.js";

const cardTypes = [
  { id: "text", label: "Text", icon: FileText },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "link", label: "Link", icon: Link2 },
  { id: "attachment", label: "Attachment", icon: Paperclip },
];

const typeMeta = {
  text: { title: "TEXT FIELD", glyph: "T", rhythm: "001" },
  image: { title: "IMAGE NODE", glyph: "I", rhythm: "010" },
  link: { title: "LINK VECTOR", glyph: "L", rhythm: "011" },
  attachment: { title: "ATTACHMENT", glyph: "A", rhythm: "100" },
};

const wallSetSize = { width: 268, height: 178 };
const organizationNodeSize = { width: 300, height: 216 };
const editorSetSize = { width: 760, height: 620 };
const zoomStep = 0.12;
const wheelZoomSensitivity = 0.0015;
const maxWheelZoomStep = 0.06;
const visibleCardBuffer = 1;

function App() {
  const { workspaceState, setWorkspaceState, ready } = usePersistentWorkspaceState();
  const [view, setView] = useState("projects");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const activeProject =
    workspaceState.projects.find((project) => project.id === workspaceState.activeProjectId) ||
    workspaceState.projects[0];
  const fieldState = activeProject?.field || createDefaultState();
  const activeSetId = fieldState.sets.some((set) => set.id === fieldState.activeSetId)
    ? fieldState.activeSetId
    : fieldState.sets[0]?.id;

  function patchFieldState(patch) {
    if (!activeProject) {
      return;
    }

    setWorkspaceState((current) => ({
      ...current,
      projects: current.projects.map((project) => {
        if (project.id !== activeProject.id) {
          return project;
        }

        const nextField = {
          ...project.field,
          ...(typeof patch === "function" ? patch(project.field) : patch),
        };
        const nextTitle = nextField.fieldTitle?.trim();

        return {
          ...project,
          name: nextTitle || project.name,
          updatedAt: new Date().toISOString(),
          field: nextField,
        };
      }),
    }));
  }

  function setFieldTitle(fieldTitle) {
    patchFieldState({ fieldTitle });
  }

  function createNewProject() {
    setWorkspaceState((current) => {
      const nextProject = createProject(current.projects.length);

      return {
        ...current,
        projects: [...current.projects, nextProject],
        activeProjectId: nextProject.id,
      };
    });
    setView("field");
  }

  function openProject(projectId) {
    setWorkspaceState((current) => ({
      ...current,
      activeProjectId: projectId,
    }));
    setView("field");
  }

  function deleteProject(projectId) {
    const project = workspaceState.projects.find((item) => item.id === projectId);
    if (!window.confirm(`Delete "${project?.name || "this project"}"?`)) {
      return;
    }

    setWorkspaceState((current) => {
      const projects = current.projects.filter((item) => item.id !== projectId);
      const activeProjectId = projects.some((item) => item.id === current.activeProjectId)
        ? current.activeProjectId
        : projects[0]?.id || null;

      return {
        ...current,
        projects,
        activeProjectId,
      };
    });
  }

  return (
    <MotionConfig transition={{ type: "spring", stiffness: 180, damping: 24, mass: 0.9 }}>
      <main className={`app-shell ${ready ? "is-ready" : ""}`}>
        {view === "projects" ? (
          <ProjectList
            projects={workspaceState.projects}
            activeProjectId={activeProject?.id}
            onCreateProject={createNewProject}
            onOpenProject={openProject}
            onDeleteProject={deleteProject}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        ) : (
          <section className="editorial-frame" aria-label="InfiniMind card field">
            <div className="window-drag-region" aria-hidden="true" />
            <header className="field-heading">
              <button
                className="back-to-projects"
                type="button"
                title="Project list"
                aria-label="Back to project list"
                onClick={() => setView("projects")}
              >
                <ChevronLeft size={18} />
              </button>
              <input
                className="field-title-input"
                aria-label="Field title"
                value={fieldState.fieldTitle}
                onChange={(event) => setFieldTitle(event.target.value)}
                onFocus={(event) => event.target.select()}
                spellCheck="false"
              />
            </header>

            <CardField
              fieldTitle={fieldState.fieldTitle}
              sets={fieldState.sets}
              organizations={fieldState.organizations}
              activeSetId={activeSetId}
              connections={fieldState.connections}
              trash={fieldState.trash}
              pan={fieldState.pan}
              zoom={fieldState.zoom}
              onChange={patchFieldState}
            />
          </section>
        )}
        {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
      </main>
    </MotionConfig>
  );
}

function ProjectList({ projects, activeProjectId, onCreateProject, onOpenProject, onDeleteProject, onOpenSettings }) {
  return (
    <section className="project-list-screen" aria-label="Project list">
      <div className="window-drag-region" aria-hidden="true" />
      <header className="project-list-heading">
        <div>
          <p>InfiniMind</p>
          <h1>Projects</h1>
        </div>
        <div className="project-heading-actions">
          <button className="settings-button" type="button" title="Settings" aria-label="Open settings" onClick={onOpenSettings}>
            <Settings size={18} />
          </button>
          <button className="new-project-button" type="button" onClick={onCreateProject}>
            <Plus size={18} />
            <span>New Project</span>
          </button>
        </div>
      </header>

      {projects.length === 0 ? (
        <div className="project-empty-state">
          <span>00</span>
          <p>No projects</p>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((project, index) => {
            const sets = project.field?.sets || [];
            const cardCount = sets.reduce((total, set) => total + set.cards.length, 0);
            const previewSet = sets.find((set) => set.id === project.field?.activeSetId) || sets[0];
            const previewCard =
              previewSet?.cards.find((card) => card.id === previewSet.activeId) || previewSet?.cards[0];

            return (
              <article
                className={`project-tile ${project.id === activeProjectId ? "is-current-project" : ""}`}
                key={project.id}
              >
                <button
                  className="project-open-button"
                  type="button"
                  onClick={() => onOpenProject(project.id)}
                  aria-label={`Open ${project.name}`}
                >
                  <span className="project-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="project-title">{project.name || "Untitled"}</span>
                  <span className="project-preview">{getCardPreview(previewCard)}</span>
                  <span className="project-meta">
                    <span>
                      <Layers3 size={14} />
                      {sets.length}
                    </span>
                    <span>{String(cardCount).padStart(2, "0")} cards</span>
                  </span>
                </button>
                <footer className="project-tile-actions">
                  <span>{formatProjectDate(project.updatedAt)}</span>
                  <div>
                    <button
                      type="button"
                      title="Open project"
                      aria-label={`Open ${project.name} from actions`}
                      onClick={() => onOpenProject(project.id)}
                    >
                      <FolderOpen size={15} />
                    </button>
                    <button
                      type="button"
                      title="Delete project"
                      aria-label={`Delete ${project.name}`}
                      onClick={() => onDeleteProject(project.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

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
  const panGesture = useRef(null);
  const setDrag = useRef(null);
  const connectionGesture = useRef(null);
  const dragFrame = useRef(null);
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
        (connection) =>
          (connection.scopeId || null) === activeScopeId &&
          nodeLookup.has(connection.fromNodeId || connection.fromSetId) &&
          nodeLookup.has(connection.toNodeId || connection.toSetId)
      ),
    [activeScopeId, connections, nodeLookup]
  );
  const selectedConnectionButton = useMemo(() => {
    const selectedConnection = visibleConnections.find((connection) => connection.id === selectedConnectionId);

    return getConnectionDeleteButtonPosition({
      connection: selectedConnection,
      nodeLookup,
      editingSetId,
      dragPreview,
      pan: scopePan,
      zoom: scopeZoom,
      viewportWidth: width,
    });
  }, [dragPreview, editingSetId, nodeLookup, scopePan, scopeZoom, selectedConnectionId, visibleConnections, width]);
  const selectedNodeCount = selectedNodeIds.size;
  viewRef.current = { pan: scopePan, zoom: scopeZoom };

  useEffect(() => {
    return () => {
      if (dragFrame.current) {
        window.cancelAnimationFrame(dragFrame.current);
      }
      if (wheelZoomFrame.current) {
        window.cancelAnimationFrame(wheelZoomFrame.current);
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

    onChange({
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

  function moveOrganizationOutOfGroup(organizationId) {
    const organization = organizationLookup.get(organizationId);
    const parentOrganization = organization?.parentId ? organizationLookup.get(organization.parentId) : null;
    if (!organization || !parentOrganization) {
      return;
    }

    const targetScopeId = parentOrganization.parentId || null;
    const nextPosition = getMovedOutNodePosition(organization, parentOrganization);

    setBirthSourceId(null);
    setFreshId(null);
    setEditingSetId(null);
    editorReturnView.current = null;
    setPendingConnection(null);
    setSelectedConnectionId(null);
    setConnectionSourceId(null);
    setSelectedNodeIds(new Set([organizationId]));
    setScopeTransition("exit");
    setActiveScopeId(targetScopeId);
    window.setTimeout(() => setScopeTransition(null), reduceMotion ? 120 : 640);

    onChange((current) => ({
      organizations: current.organizations.map((item) =>
        item.id === organizationId
          ? {
              ...item,
              parentId: targetScopeId,
              position: nextPosition,
            }
          : item
      ),
      connections: dedupeConnections(
        rewireConnectionsForMovedOutNode(current.connections, organizationId, parentOrganization.id, targetScopeId)
      ),
    }));
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
        (connection) => (connection.fromNodeId || connection.fromSetId) === setId || (connection.toNodeId || connection.toSetId) === setId
      );
      const currentTrash = normalizeTrash(current.trash);

      return {
        sets: nextSets,
        activeSetId: activeSetStillExists ? current.activeSetId : nextSets[fallbackActiveIndex].id,
        connections: current.connections.filter(
          (connection) => (connection.fromNodeId || connection.fromSetId) !== setId && (connection.toNodeId || connection.toSetId) !== setId
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
        const fromNodeId = connection.fromNodeId || connection.fromSetId;
        const toNodeId = connection.toNodeId || connection.toSetId;
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
        ".clue-set, .field-toolbar, .scope-breadcrumbs, button, input, textarea, a, .connection-line, .connection-line-hit"
      )
    ) {
      return;
    }

    panGesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
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

  function createConnection(fromSetId, toSetId) {
    if (!toSetId || fromSetId === toSetId || hasConnection(connections, fromSetId, toSetId, activeScopeId)) {
      return false;
    }

    const nextConnection = {
      id: createConnectionId(),
      scopeId: activeScopeId,
      fromNodeId: fromSetId,
      toNodeId: toSetId,
    };
    onChange({ connections: [...connections, nextConnection] });
    setSelectedConnectionId(nextConnection.id);
    setConnectionSourceId(null);
    setPendingConnection(null);
    return true;
  }

  function beginConnection(event, setId) {
    if (event.button !== 0) {
      return;
    }

    const node = nodeLookup.get(setId);
    if (!node) {
      return;
    }

    cancelActiveConnection();

    connectionGesture.current = {
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      setId,
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
      const node = nodeLookup.get(gesture.setId);
      const origin = getNodeCenter(node, editingSetId === gesture.setId);
      gesture.dragging = true;
      setSelectedConnectionId(null);
      setPendingConnection({
        fromNodeId: gesture.setId,
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

  function beginClickConnection(setId, event) {
    const sourceNode = nodeLookup.get(setId);
    if (!sourceNode) {
      return;
    }

    const origin = getNodeCenter(sourceNode, editingSetId === setId);
    const pointer =
      event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
        ? getCanvasPointFromClient(event.clientX, event.clientY, scopePan, scopeZoom)
        : origin;

    setConnectionSourceId(setId);
    setSelectedConnectionId(null);
    setPendingConnection({
      fromNodeId: setId,
      clickPreview: true,
      x: pointer.x,
      y: pointer.y,
    });
  }

  function clickConnection(setId, event) {
    if (!connectionSourceId) {
      beginClickConnection(setId, event);
      return;
    }

    if (connectionSourceId === setId || hasConnection(connections, connectionSourceId, setId, activeScopeId)) {
      setConnectionSourceId(null);
      setPendingConnection(null);
      return;
    }

    createConnection(connectionSourceId, setId);
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
      const targetSetId = getConnectionDropTargetId({
        clientX: event.clientX,
        clientY: event.clientY,
        fromNodeId: gesture.setId,
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
      createConnection(gesture.setId, targetSetId);
      return;
    }

    setPendingConnection(null);
    clickConnection(gesture.setId, event);
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
    if (node.kind === "organization") {
      enterOrganization(node.organization);
      return;
    }

    setActiveSet(node.id);
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
      <div className="field-toolbar">
        <button
          className="icon-button"
          type="button"
          title="Zoom out"
          aria-label="Zoom out"
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
          title="Reset zoom"
          aria-label="Reset zoom"
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
          title="Zoom in"
          aria-label="Zoom in"
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
          title="New card set"
          aria-label="Create card set"
          onClick={(event) => {
            event.stopPropagation();
            addCardSet();
          }}
        >
          <Plus size={18} />
        </button>
        <button
          className="icon-button"
          type="button"
          title="Create organization from selection"
          aria-label="Create organization from selection"
          disabled={selectedNodeCount === 0}
          onClick={(event) => {
            event.stopPropagation();
            createOrganizationFromSelection();
          }}
        >
          <Layers3 size={18} />
        </button>
        {activeScope?.parentId && (
          <button
            className="icon-button"
            type="button"
            title="Move this organization out of group"
            aria-label="Move this organization out of group"
            onClick={(event) => {
              event.stopPropagation();
              moveOrganizationOutOfGroup(activeScope.id);
            }}
          >
            <Ungroup size={18} />
          </button>
        )}
        <button
          className="icon-button trash-toolbar-button"
          type="button"
          title="Trash"
          aria-label={`Open trash with ${trashCount} item${trashCount === 1 ? "" : "s"}`}
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
          if (event.target.closest(".clue-set, .field-toolbar, .scope-breadcrumbs, button, input, textarea, a")) {
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
            onSelectConnection={setSelectedConnectionId}
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
                    childSets={sets.filter((set) => set.parentId === organization.id)}
                    childOrganizations={organizations.filter((item) => item.parentId === organization.id)}
                    connections={connections.filter((connection) => (connection.scopeId || null) === organization.id)}
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
        </motion.div>
        {selectedConnectionButton && (
          <button
            className="connection-delete-button"
            type="button"
            title="Delete line"
            aria-label="Delete selected line"
            style={{
              left: selectedConnectionButton.left,
              top: selectedConnectionButton.top,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              deleteSelectedConnection();
            }}
          >
            <Trash2 size={15} />
          </button>
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

function SettingsModal({ onClose }) {
  const [mcpConfig, setMcpConfig] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  useEffect(() => {
    let cancelled = false;

    loadMcpConfig().then((config) => {
      if (!cancelled) {
        setMcpConfig(config);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function copySnippet(key, value) {
    if (!value) return;
    await copyText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1200);
  }

  return (
    <Modal className="settings-modal" eyebrow="Preferences" title="Settings" onClose={onClose}>
      <div className="settings-shell">
        <nav className="settings-sidebar" aria-label="Settings sections">
          <button className="settings-nav-item active" type="button" aria-current="page">
            <span>MCP</span>
            <small>Local server</small>
          </button>
        </nav>

        <section className="settings-panel" aria-labelledby="mcp-settings-title">
          <header className="settings-panel-header">
            <div>
              <span>MCP</span>
              <h3 id="mcp-settings-title">Connection</h3>
            </div>
          </header>

          {!mcpConfig ? (
            <div className="mcp-empty-state">
              <p>MCP configuration is available in the desktop app.</p>
            </div>
          ) : (
            <div className="mcp-settings">
              <section className="mcp-path-row">
                <span>Install path</span>
                <code>{mcpConfig.appRoot}</code>
              </section>

              <McpSnippet
                title="Recommended JSON"
                value={mcpConfig.json}
                copied={copiedKey === "json"}
                onCopy={() => copySnippet("json", mcpConfig.json)}
              />
              <McpSnippet
                title="Codex TOML"
                value={mcpConfig.codexToml}
                copied={copiedKey === "toml"}
                onCopy={() => copySnippet("toml", mcpConfig.codexToml)}
              />
              <McpSnippet
                title="Fallback JSON"
                value={mcpConfig.fallbackJson}
                copied={copiedKey === "fallback"}
                onCopy={() => copySnippet("fallback", mcpConfig.fallbackJson)}
              />
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

function McpSnippet({ title, value, copied, onCopy }) {
  return (
    <section className="mcp-snippet">
      <header>
        <h3>{title}</h3>
        <button type="button" title={`Copy ${title}`} aria-label={`Copy ${title}`} onClick={onCopy}>
          <Clipboard size={15} />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </header>
      <pre>{value}</pre>
    </section>
  );
}

async function loadMcpConfig() {
  if (!window.infinimindStorage?.mcpConfig) {
    return null;
  }

  try {
    return window.infinimindStorage.mcpConfig();
  } catch {
    return null;
  }
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function ConfirmModal({ request, onCancel, onConfirm }) {
  return (
    <Modal
      className="confirm-modal"
      eyebrow="Confirm"
      title={request.title}
      onClose={onCancel}
      footer={
        <>
          <button className="secondary-modal-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="danger-modal-button" type="button" onClick={onConfirm}>
            {request.confirmLabel || "Confirm"}
          </button>
        </>
      }
    >
      <p>{request.body}</p>
    </Modal>
  );
}

function TrashModal({ trash, onClose, onRestoreCard, onRestoreSet, onRestoreOrganization, onPermanentDelete }) {
  const hasTrash = getTrashCount(trash) > 0;

  return (
    <Modal className="trash-modal" eyebrow="Recoverable" title="Trash" onClose={onClose}>
      {!hasTrash ? (
        <div className="empty-trash-state">
          <ArchiveRestore size={28} />
          <p>Trash is empty.</p>
        </div>
      ) : (
        <div className="trash-sections">
          <TrashSection title="Organizations" count={trash.organizations.length}>
            {trash.organizations.map((item) => (
              <TrashRow
                key={item.id}
                title={item.organization.title}
                meta={`${item.sets.length} card set${item.sets.length === 1 ? "" : "s"} · ${formatTrashDate(
                  item.deletedAt
                )}`}
                preview={`${item.organizations.length + 1} organization${
                  item.organizations.length === 0 ? "" : "s"
                } in subtree`}
                onRestore={() => onRestoreOrganization(item.id)}
                onDeleteForever={() => onPermanentDelete("organization", item.id)}
              />
            ))}
          </TrashSection>

          <TrashSection title="Card Sets" count={trash.sets.length}>
            {trash.sets.map((item) => (
              <TrashRow
                key={item.id}
                title={item.set.title}
                meta={`${item.set.cards.length} card${item.set.cards.length === 1 ? "" : "s"} · ${formatTrashDate(
                  item.deletedAt
                )}`}
                preview={getCardPreview(item.set.cards.find((card) => card.id === item.set.activeId) || item.set.cards[0])}
                onRestore={() => onRestoreSet(item.id)}
                onDeleteForever={() => onPermanentDelete("set", item.id)}
              />
            ))}
          </TrashSection>

          <TrashSection title="Cards" count={trash.cards.length}>
            {trash.cards.map((item) => (
              <TrashRow
                key={item.id}
                title={getCardPreview(item.card)}
                meta={`${item.sourceSetTitle || "Unknown set"} · ${formatTrashDate(item.deletedAt)}`}
                preview={item.card.type.toUpperCase()}
                onRestore={() => onRestoreCard(item.id)}
                onDeleteForever={() => onPermanentDelete("card", item.id)}
              />
            ))}
          </TrashSection>
        </div>
      )}
    </Modal>
  );
}

function TrashSection({ title, count, children }) {
  return (
    <section className="trash-section">
      <header>
        <h3>{title}</h3>
        <span>{String(count).padStart(2, "0")}</span>
      </header>
      {count > 0 ? <div className="trash-list">{children}</div> : <p className="trash-empty-line">No items.</p>}
    </section>
  );
}

function TrashRow({ title, meta, preview, onRestore, onDeleteForever }) {
  return (
    <article className="trash-row">
      <div>
        <strong>{title}</strong>
        <span>{meta}</span>
        <p>{preview}</p>
      </div>
      <footer>
        <button type="button" title="Restore" aria-label={`Restore ${title}`} onClick={onRestore}>
          <RotateCcw size={15} />
        </button>
        <button
          className="delete-button"
          type="button"
          title="Delete forever"
          aria-label={`Delete ${title} forever`}
          onClick={onDeleteForever}
        >
          <Trash2 size={15} />
        </button>
      </footer>
    </article>
  );
}

function CardCountBadge({ count }) {
  return (
    <span className="set-card-count" aria-label={`${count} card${count === 1 ? "" : "s"}`}>
      <FileText size={11} strokeWidth={2.4} />
      <span>{`${count} ${count === 1 ? "card" : "cards"}`}</span>
    </span>
  );
}

function ClueSetSummary({
  cardSet,
  isActiveSet,
  connectionSourceId,
  onEdit,
  onDelete,
  onDragStart,
  onConnectionStart,
  onConnectionMove,
  onConnectionEnd,
  onConnectionCancel,
  onConnectionClick,
}) {
  const activeCard = cardSet.cards.find((card) => card.id === cardSet.activeId) || cardSet.cards[0];
  const preview = getCardPreview(activeCard);

  return (
    <article className={`clue-set summary-set ${isActiveSet ? "is-active-set" : ""}`}>
      <header className="clue-set-header" onPointerDown={onDragStart}>
        <strong className="set-title-text">{cardSet.title}</strong>
        <CardCountBadge count={cardSet.cards.length} />
      </header>
      <div className="summary-set-body" onPointerDown={onDragStart}>
        <div className="summary-type-row" aria-hidden="true">
          {cardTypes.map((cardType) => (
            <span
              className={`summary-type-dot type-dot-${cardType.id}`}
              key={cardType.id}
              data-active={cardSet.cards.some((card) => card.type === cardType.id)}
            />
          ))}
        </div>
        <p>{preview}</p>
      </div>
      <footer className="summary-set-actions">
        <button
          type="button"
          title="Edit card set"
          aria-label="Edit card set"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
        >
          <Maximize2 size={15} />
        </button>
        <button
          className="delete-button"
          type="button"
          title="Delete card set"
          aria-label="Delete card set"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 size={14} />
        </button>
        <button
          className="connect-handle"
          type="button"
          title="Connect"
          aria-label={`Connect from ${cardSet.title}`}
          data-active-source={connectionSourceId === cardSet.id}
          onPointerDown={onConnectionStart}
          onPointerMove={onConnectionMove}
          onPointerUp={onConnectionEnd}
          onPointerCancel={onConnectionCancel}
          onClick={(event) => {
            event.stopPropagation();
            if (event.detail === 0) {
              onConnectionClick(event);
            }
          }}
        >
          <Link2 size={14} />
        </button>
      </footer>
    </article>
  );
}

function OrganizationSummary({
  organization,
  childSets,
  childOrganizations,
  connections,
  connectionSourceId,
  onOpen,
  onDelete,
  onDragStart,
  onConnectionStart,
  onConnectionMove,
  onConnectionEnd,
  onConnectionCancel,
  onConnectionClick,
  onMoveOut,
}) {
  const directNodeCount = childSets.length + childOrganizations.length;
  const cardCount = childSets.reduce((total, set) => total + set.cards.length, 0);

  return (
    <article className="clue-set organization-node">
      <header className="clue-set-header" onPointerDown={onDragStart}>
        <strong className="set-title-text">{organization.title}</strong>
        <span className="set-card-count" aria-label={`${directNodeCount} nodes`}>
          <Layers3 size={11} strokeWidth={2.4} />
          <span>{`${directNodeCount} node${directNodeCount === 1 ? "" : "s"}`}</span>
        </span>
      </header>
      <div className="organization-preview" onPointerDown={onDragStart}>
        <OrganizationMiniMap
          childSets={childSets}
          childOrganizations={childOrganizations}
          connections={connections}
        />
        <div className="organization-metrics">
          <span>{String(childOrganizations.length).padStart(2, "0")} org</span>
          <span>{String(childSets.length).padStart(2, "0")} sets</span>
          <span>{String(cardCount).padStart(2, "0")} cards</span>
        </div>
      </div>
      <footer className="summary-set-actions">
        <button
          type="button"
          title="Open organization"
          aria-label={`Open ${organization.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          <Maximize2 size={15} />
        </button>
        {organization.parentId && (
          <button
            type="button"
            title="Move organization out of group"
            aria-label={`Move ${organization.title} out of group`}
            onClick={(event) => {
              event.stopPropagation();
              onMoveOut();
            }}
          >
            <Ungroup size={14} />
          </button>
        )}
        <button
          className="delete-button"
          type="button"
          title="Delete organization"
          aria-label={`Delete ${organization.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 size={14} />
        </button>
        <button
          className="connect-handle"
          type="button"
          title="Connect"
          aria-label={`Connect from ${organization.title}`}
          data-active-source={connectionSourceId === organization.id}
          onPointerDown={onConnectionStart}
          onPointerMove={onConnectionMove}
          onPointerUp={onConnectionEnd}
          onPointerCancel={onConnectionCancel}
          onClick={(event) => {
            event.stopPropagation();
            if (event.detail === 0) {
              onConnectionClick(event);
            }
          }}
        >
          <Link2 size={14} />
        </button>
      </footer>
    </article>
  );
}

function OrganizationMiniMap({ childSets, childOrganizations, connections }) {
  const nodes = [
    ...childOrganizations.map((organization) => ({
      id: organization.id,
      kind: "organization",
      position: organization.position,
      title: organization.title,
    })),
    ...childSets.map((set) => ({
      id: set.id,
      kind: "set",
      position: set.position,
      title: set.title,
    })),
  ];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const projectedNodes = projectMiniMapNodes(nodes);

  return (
    <div className="organization-minimap" aria-hidden="true">
      <svg viewBox="0 0 220 112">
        {connections.map((connection) => {
          const from = projectedNodes.get(connection.fromNodeId || connection.fromSetId);
          const to = projectedNodes.get(connection.toNodeId || connection.toSetId);
          if (!from || !to) {
            return null;
          }

          return <line key={connection.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
        })}
      </svg>
      {nodes.map((node) => {
        const projected = projectedNodes.get(node.id) || { x: 110, y: 56 };

        return (
          <span
            className={`organization-mini-node ${node.kind === "organization" ? "is-mini-organization" : ""}`}
            key={node.id}
            style={{
              left: `${projected.x}px`,
              top: `${projected.y}px`,
            }}
            title={node.title}
          />
        );
      })}
      {nodeById.size === 0 && <span className="organization-empty-mark" />}
    </div>
  );
}

function CardSetEditor({
  cardSet,
  cardWidth,
  freshId,
  birthSourceId,
  isActiveSet,
  onActivate,
  onClose,
  onDeleteSet,
  onDeleteCard,
  onPatch,
  onFreshCard,
  onDragStart,
}) {
  const reduceMotion = useReducedMotion();
  const activeIndex = Math.max(
    0,
    cardSet.cards.findIndex((card) => card.id === cardSet.activeId)
  );
  const gap = cardWidth < 320 ? 22 : 34;
  const renderWindow = getCardRenderWindow({
    cardCount: cardSet.cards.length,
    activeIndex,
    cardWidth,
    gap,
  });
  const renderCards = cardSet.cards.slice(renderWindow.start, renderWindow.end + 1);
  const sourceIndex = birthSourceId ? cardSet.cards.findIndex((item) => item.id === birthSourceId) : activeIndex;
  const sourceDistance = sourceIndex - activeIndex;

  function setCards(updater) {
    onPatch((currentSet) => ({
      cards: typeof updater === "function" ? updater(currentSet.cards) : updater,
    }));
  }

  function setActiveId(nextActiveId) {
    onPatch({ activeId: nextActiveId });
  }

  function updateCard(id, patch) {
    setCards((current) => current.map((card) => (card.id === id ? { ...card, ...patch } : card)));
  }

  function convertCard(id, type) {
    setCards((current) =>
      current.map((card) => {
        if (card.id !== id) {
          return card;
        }

        return {
          ...card,
          type,
          imageStyle: type === "image" && !card.imageUrl ? getRandomImageStyle(card.imageStyle) : card.imageStyle,
        };
      })
    );
  }

  function addCard(afterId) {
    const nextId = createCardId();
    const nextCard = {
      id: nextId,
      type: "text",
      note: "",
      imageUrl: "",
      imageStyle: getRandomImageStyle(),
      imageTone: "mono",
      linkUrl: "",
      linkTitle: "",
      attachmentUrl: "",
      attachmentName: "",
      attachmentMime: "",
      attachmentSize: 0,
    };

    onPatch((currentSet) => {
      const current = currentSet.cards;
      const index = current.findIndex((card) => card.id === afterId);
      const insertionIndex = index === -1 ? current.length : index + 1;
      const nextCards = [...current.slice(0, insertionIndex), nextCard, ...current.slice(insertionIndex)];

      return {
        cards: nextCards,
        activeId: nextId,
      };
    });

    onFreshCard(nextId, afterId);
  }

  return (
    <div className={`clue-set editor-set ${isActiveSet ? "is-active-set" : ""}`}>
      <header className="clue-set-header" onPointerDown={onDragStart}>
        <input
          className="set-title-input"
          aria-label="Card set title"
          value={cardSet.title}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onPatch({ title: event.target.value })}
        />
        <CardCountBadge count={cardSet.cards.length} />
        <button
          className="set-header-button"
          type="button"
          title="Collapse card set"
          aria-label="Collapse card set"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <Minimize2 size={15} />
        </button>
        <button
          className="set-header-button delete-button"
          type="button"
          title="Delete card set"
          aria-label="Delete card set"
          onClick={(event) => {
            event.stopPropagation();
            onDeleteSet();
          }}
        >
          <Trash2 size={14} />
        </button>
      </header>
      <div className="card-set-cards" onClick={onActivate}>
        {renderCards.map((card, offset) => {
          const index = renderWindow.start + offset;
          const distance = index - activeIndex;
          const cardX = distance * (cardWidth + gap);
          const isActive = card.id === cardSet.activeId;
          const isFresh = card.id === freshId;

          return (
            <motion.div
              className="card-positioner"
              key={card.id}
              layout={false}
              initial={
                isFresh && !reduceMotion
                  ? {
                      x: sourceDistance * (cardWidth + gap),
                      y: 28,
                      scale: 0.72,
                      rotate: -11,
                      opacity: 0,
                    }
                  : false
              }
              animate={{
                x: cardX,
                y: isActive ? -6 : Math.abs(distance) * 9,
                scale: isActive ? 1 : 0.94,
                rotate: distance * 0.65,
                opacity: 1,
              }}
              transition={
                isFresh
                  ? { type: "spring", stiffness: 140, damping: 21, mass: 1.05 }
                  : { type: "spring", stiffness: 190, damping: 25, mass: 0.9 }
              }
              style={{
                width: cardWidth,
                marginLeft: -cardWidth / 2,
                zIndex: 100 - Math.abs(distance) + (isActive ? 20 : 0),
              }}
            >
              <FieldCard
                card={card}
                index={index}
                active={isActive}
                onSelect={() => {
                  onActivate();
                  setActiveId(card.id);
                }}
                onTypeChange={(type) => convertCard(card.id, type)}
                onAdd={() => addCard(card.id)}
                onDelete={() => onDeleteCard(card.id)}
                onUpdate={(patch) => updateCard(card.id, patch)}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function ConnectionLayer({
  connections,
  nodeLookup,
  editingSetId,
  pendingConnection,
  selectedConnectionId,
  dragPreview,
  onSelectConnection,
}) {
  function getLayerNode(nodeId) {
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

  const pendingFromNode = pendingConnection ? getLayerNode(pendingConnection.fromNodeId || pendingConnection.fromSetId) : null;
  const pendingFrom = pendingFromNode
    ? getNodeCenter(pendingFromNode, editingSetId === (pendingConnection.fromNodeId || pendingConnection.fromSetId))
    : { x: 0, y: 0 };

  return (
    <svg className="connection-layer" aria-hidden="true">
      {connections.map((connection) => {
        const fromNodeId = connection.fromNodeId || connection.fromSetId;
        const toNodeId = connection.toNodeId || connection.toSetId;
        const fromNode = getLayerNode(fromNodeId);
        const toNode = getLayerNode(toNodeId);
        if (!fromNode || !toNode) {
          return null;
        }

        const from = getNodeCenter(fromNode, editingSetId === fromNode.id);
        const to = getNodeCenter(toNode, editingSetId === toNode.id);
        const isSelected = connection.id === selectedConnectionId;

        return (
          <g key={connection.id}>
            <line
              className="connection-line-hit"
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              onClick={(event) => {
                event.stopPropagation();
                onSelectConnection(connection.id);
              }}
            />
            <line
              className={`connection-line ${isSelected ? "is-selected" : ""}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            />
          </g>
        );
      })}
      {pendingConnection && (
        <line
          className="connection-line pending-connection-line"
          x1={pendingFrom.x}
          y1={pendingFrom.y}
          x2={pendingConnection.x}
          y2={pendingConnection.y}
        />
      )}
    </svg>
  );
}

function getConnectionDeleteButtonPosition({
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

  const fromNodeId = connection.fromNodeId || connection.fromSetId;
  const toNodeId = connection.toNodeId || connection.toSetId;
  const fromNode = getConnectionLayerNode(fromNodeId, nodeLookup, dragPreview);
  const toNode = getConnectionLayerNode(toNodeId, nodeLookup, dragPreview);
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

function getConnectionLayerNode(nodeId, nodeLookup, dragPreview) {
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

function getConnectionDropTargetId({
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

function getCanvasPointFromClient(clientX, clientY, pan, zoom) {
  const safeZoom = Math.max(zoom || 1, 0.1);

  return {
    x: (clientX - window.innerWidth / 2 - pan.x) / safeZoom,
    y: (clientY - window.innerHeight / 2 - pan.y) / safeZoom,
  };
}

function getNodeHitBounds(node, { isEditing, editorWidth, editorHeight }) {
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

function usePersistentWorkspaceState() {
  const [workspaceState, setWorkspaceState] = useState(() => createDefaultWorkspaceState());
  const [ready, setReady] = useState(false);
  const storageRevision = useRef(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([loadWorkspaceState(), loadWorkspaceMetadata()]).then(([storedState, metadata]) => {
      if (cancelled) {
        return;
      }

      if (storedState) {
        setWorkspaceState(normalizeWorkspaceState(storedState));
      }
      storageRevision.current = metadata?.updatedAt || null;
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      saveWorkspaceState(normalizeWorkspaceState(workspaceState), storageRevision.current).then((result) => {
        if (result?.conflictState) {
          storageRevision.current = result.updatedAt || null;
          setWorkspaceState(normalizeWorkspaceState(result.conflictState));
          return;
        }

        if (result?.updatedAt) {
          storageRevision.current = result.updatedAt;
        }
      });
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [workspaceState, ready]);

  useEffect(() => {
    if (!ready || !window.infinimindStorage?.metadata) {
      return undefined;
    }

    const interval = window.setInterval(async () => {
      const metadata = await loadWorkspaceMetadata();
      if (!isNewerStorageRevision(metadata?.updatedAt, storageRevision.current)) {
        return;
      }

      const storedState = await loadWorkspaceState();
      if (!storedState) {
        return;
      }

      storageRevision.current = metadata.updatedAt;
      setWorkspaceState(normalizeWorkspaceState(storedState));
    }, 2000);

    return () => window.clearInterval(interval);
  }, [ready]);

  return { workspaceState, setWorkspaceState, ready };
}

async function loadWorkspaceState() {
  if (window.infinimindStorage?.load) {
    return window.infinimindStorage.load();
  }

  try {
    const raw = window.localStorage.getItem(storageKey) || window.localStorage.getItem(legacyStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function saveWorkspaceState(workspaceState, expectedRevision) {
  if (window.infinimindStorage?.save) {
    const currentMetadata = await loadWorkspaceMetadata();
    if (isNewerStorageRevision(currentMetadata?.updatedAt, expectedRevision)) {
      return {
        conflictState: await window.infinimindStorage.load(),
        updatedAt: currentMetadata.updatedAt,
      };
    }

    return window.infinimindStorage.save(workspaceState);
  }

  window.localStorage.setItem(storageKey, JSON.stringify(workspaceState));
  return { updatedAt: new Date().toISOString() };
}

async function loadWorkspaceMetadata() {
  if (!window.infinimindStorage?.metadata) {
    return null;
  }

  try {
    return window.infinimindStorage.metadata();
  } catch {
    return null;
  }
}

function isNewerStorageRevision(candidate, current) {
  if (!candidate) {
    return false;
  }
  if (!current) {
    return true;
  }

  const candidateTime = Date.parse(candidate);
  const currentTime = Date.parse(current);
  return Number.isFinite(candidateTime) && Number.isFinite(currentTime) && candidateTime > currentTime;
}

function FieldCard({ card, index, active, onSelect, onTypeChange, onAdd, onDelete, onUpdate }) {
  const [committedType, setCommittedType] = useState(card.type);
  const [pendingType, setPendingType] = useState(null);
  const [turn, setTurn] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const committedTypeRef = useRef(card.type);
  const pendingTypeRef = useRef(null);

  useEffect(() => {
    if (card.type === committedTypeRef.current || pendingTypeRef.current) {
      return undefined;
    }

    pendingTypeRef.current = card.type;
    setPendingType(card.type);
    setIsFlipping(true);
    setTurn((value) => value + 1);
    return undefined;
  }, [card.type]);

  const landingOnFront = turn % 2 === 0;
  const frontType = isFlipping ? (landingOnFront ? pendingType || committedType : committedType) : committedType;
  const backType = isFlipping ? (landingOnFront ? committedType : pendingType || committedType) : committedType;
  const visibleFaceKey = landingOnFront ? "front" : "back";
  const visibleFaceClass = landingOnFront ? "flip-face-front" : "flip-face-back";

  function completeFlip() {
    if (!isFlipping || !pendingTypeRef.current) {
      return;
    }

    committedTypeRef.current = pendingTypeRef.current;
    setCommittedType(pendingTypeRef.current);
    pendingTypeRef.current = null;
    setPendingType(null);
    setIsFlipping(false);
  }

  return (
    <motion.article
      className={`field-card ${active ? "is-active" : ""} ${isFlipping ? "is-flipping" : ""} ${
        isHovered ? "is-hovered" : ""
      } ${
        turn % 2 === 0 ? "is-front" : "is-back"
      }`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      animate={{ y: isHovered && !isFlipping ? -6 : 0 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      whileTap={{ scale: 0.985 }}
    >
      <div className="card-shadow" aria-hidden="true" />
      <motion.div
        className="card-flipper"
        animate={{
          rotateY: turn * -180,
          scale: isFlipping ? 1.012 : isHovered ? 1.01 : 1,
          z: isFlipping ? 18 : isHovered ? 10 : 0,
        }}
        transition={{
          rotateY: { duration: isFlipping ? 0.72 : 0.34, ease: isFlipping ? [0.16, 1, 0.3, 1] : [0.22, 1, 0.36, 1] },
          scale: { duration: 0.44, ease: [0.22, 1, 0.36, 1] },
          z: { duration: 0.44, ease: [0.22, 1, 0.36, 1] },
        }}
        onAnimationComplete={completeFlip}
      >
        {isFlipping ? (
          <>
            <CardFaceSurface
              key="front"
              className="flip-face-front"
              card={card}
              type={frontType}
              index={index}
              disabled={isFlipping}
              onTypeChange={onTypeChange}
              onAdd={onAdd}
              onDelete={onDelete}
              onUpdate={onUpdate}
            />
            <CardFaceSurface
              key="back"
              className="flip-face-back"
              card={card}
              type={backType}
              index={index}
              disabled={isFlipping}
              onTypeChange={onTypeChange}
              onAdd={onAdd}
              onDelete={onDelete}
              onUpdate={onUpdate}
            />
          </>
        ) : (
          <CardFaceSurface
            key={visibleFaceKey}
            className={visibleFaceClass}
            card={card}
            type={committedType}
            index={index}
            disabled={isFlipping}
            onTypeChange={onTypeChange}
            onAdd={onAdd}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
        )}
      </motion.div>
    </motion.article>
  );
}

function CardFaceSurface({ card, type, index, className, disabled, onTypeChange, onAdd, onDelete, onUpdate }) {
  const meta = typeMeta[type];
  const faceCard = { ...card, type };

  return (
    <div className={`card-face flip-face ${className}`}>
      <header className="card-topline">
        <div>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{meta.title}</strong>
        </div>
        <span className="microcode">{meta.rhythm}</span>
      </header>

      <div className="card-body">
        <TypeGlyph type={type} glyph={meta.glyph} />
        {type === "text" && <TextCard card={faceCard} onUpdate={onUpdate} />}
        {type === "image" && <ImageCard card={faceCard} onUpdate={onUpdate} />}
        {type === "link" && <LinkCard card={faceCard} onUpdate={onUpdate} />}
        {type === "attachment" && <AttachmentCard card={faceCard} onUpdate={onUpdate} />}
      </div>

      <footer className="card-actions">
        <div className="type-switch" aria-label="Card type">
          {cardTypes.map((cardType) => {
            const Icon = cardType.icon;
            return (
              <button
                className={type === cardType.id ? "is-selected" : ""}
                disabled={disabled}
                key={cardType.id}
                type="button"
                title={cardType.label}
                aria-label={`Convert to ${cardType.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onTypeChange(cardType.id);
                }}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
        <div className="card-command-row">
          <button
            className="delete-card-button"
            disabled={disabled}
            type="button"
            title="Delete card"
            aria-label="Delete card"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 size={16} />
          </button>
          <button
            className="add-card-button"
            disabled={disabled}
            type="button"
            title="Add card"
            aria-label="Add card to the right"
            onClick={(event) => {
              event.stopPropagation();
              onAdd();
            }}
          >
            <Plus size={17} />
          </button>
        </div>
      </footer>
    </div>
  );
}

function TypeGlyph({ type, glyph }) {
  return (
    <div className={`type-glyph type-${type}`} aria-hidden="true">
      <span>{glyph}</span>
      <span>{glyph}</span>
    </div>
  );
}

function TextCard({ card, onUpdate }) {
  return (
    <div className="text-surface" onClick={(event) => event.stopPropagation()}>
      <textarea
        aria-label="Card text"
        value={card.note}
        placeholder="Type into the field..."
        onChange={(event) => onUpdate({ note: event.target.value })}
      />
    </div>
  );
}

function ImageCard({ card, onUpdate }) {
  const fileInput = useRef(null);
  const imageTone = card.imageTone === "color" ? "color" : "mono";

  async function importFile(file) {
    if (!file) return;
    if (!window.infinimindStorage?.importImage) {
      window.alert("Image upload is available in the desktop app.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const asset = await window.infinimindStorage.importImage({
        dataUrl,
        mime: file.type || "application/octet-stream",
        name: file.name || "",
      });

      if (asset?.url) {
        onUpdate({ imageUrl: asset.url });
      }
    } catch (error) {
      console.error("Failed to import image", error);
      window.alert("Could not import this image.");
    } finally {
      if (fileInput.current) {
        fileInput.current.value = "";
      }
    }
  }

  return (
    <div className="image-surface" onClick={(event) => event.stopPropagation()}>
      <div className="image-preview">
        {card.imageUrl ? (
          <img src={card.imageUrl} alt="" data-tone={imageTone} loading="lazy" decoding="async" draggable="false" />
        ) : (
          <div className={`default-image default-image-${card.imageStyle || "scan"}`} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
      <div className="image-display-toggle" aria-label="Image display mode">
        <button
          type="button"
          aria-pressed={imageTone === "mono"}
          onClick={() => onUpdate({ imageTone: "mono" })}
        >
          GRAY
        </button>
        <button
          type="button"
          aria-pressed={imageTone === "color"}
          onClick={() => onUpdate({ imageTone: "color" })}
        >
          COLOR
        </button>
      </div>
      <div className="image-input-row">
        <input
          value={card.imageUrl}
          placeholder="Paste image URL"
          onChange={(event) => onUpdate({ imageUrl: event.target.value })}
        />
        <button type="button" title="Upload image" aria-label="Upload image" onClick={() => fileInput.current?.click()}>
          <Upload size={16} />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          onChange={(event) => importFile(event.target.files?.[0])}
        />
      </div>
    </div>
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Could not read file."));
    };

    reader.readAsDataURL(file);
  });
}

function LinkCard({ card, onUpdate }) {
  const href = normalizeUrl(card.linkUrl);

  return (
    <div className="link-surface" onClick={(event) => event.stopPropagation()}>
      <label>
        <span>TITLE</span>
        <input
          value={card.linkTitle}
          placeholder="Reference name"
          onChange={(event) => onUpdate({ linkTitle: event.target.value })}
        />
      </label>
      <label>
        <span>URL</span>
        <input
          value={card.linkUrl}
          placeholder="https://"
          onChange={(event) => onUpdate({ linkUrl: event.target.value })}
        />
      </label>
      <a href={href} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
        <span>{card.linkTitle || "Open vector"}</span>
        <ArrowUpRight size={17} />
      </a>
    </div>
  );
}

function AttachmentCard({ card, onUpdate }) {
  const fileInput = useRef(null);
  const attachmentUrl = card.attachmentUrl?.trim() || "";
  const displayName = card.attachmentName?.trim() || attachmentUrl || "Attachment";
  const displayMeta = [formatFileSize(card.attachmentSize), card.attachmentMime].filter(Boolean).join(" / ");

  async function importFile(file) {
    if (!file) return;
    if (!window.infinimindStorage?.importImage) {
      window.alert("Attachment upload is available in the desktop app.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const asset = await window.infinimindStorage.importImage({
        dataUrl,
        mime: file.type || "application/octet-stream",
        name: file.name || "",
      });

      if (asset?.url) {
        onUpdate({
          attachmentUrl: asset.url,
          attachmentName: file.name || card.attachmentName || "Attachment",
          attachmentMime: file.type || asset.mime || "",
          attachmentSize: Number.isFinite(asset.size) ? asset.size : file.size || 0,
        });
      }
    } catch (error) {
      console.error("Failed to import attachment", error);
      window.alert("Could not import this attachment.");
    } finally {
      if (fileInput.current) {
        fileInput.current.value = "";
      }
    }
  }

  async function openAttachment() {
    if (!attachmentUrl) return;
    const href = getAttachmentHref(attachmentUrl);

    if (window.infinimindStorage?.openAsset) {
      try {
        const result = await window.infinimindStorage.openAsset(href);
        if (result?.ok) {
          return;
        }
      } catch (error) {
        console.error("Failed to open attachment", error);
      }
    }

    window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="attachment-surface" onClick={(event) => event.stopPropagation()}>
      <div className="attachment-preview">
        <Paperclip size={28} strokeWidth={2.2} />
        <strong>{displayName}</strong>
        <span>{displayMeta || "ATTACHMENT"}</span>
      </div>
      <label>
        <span>NAME</span>
        <input
          value={card.attachmentName}
          placeholder="File name"
          onChange={(event) => onUpdate({ attachmentName: event.target.value })}
        />
      </label>
      <label>
        <span>SOURCE</span>
        <div className="attachment-input-row">
          <input
            value={card.attachmentUrl}
            placeholder="Paste file URL"
            onChange={(event) =>
              onUpdate({
                attachmentUrl: event.target.value,
                attachmentMime: "",
                attachmentSize: 0,
              })
            }
          />
          <button type="button" title="Upload attachment" aria-label="Upload attachment" onClick={() => fileInput.current?.click()}>
            <Upload size={16} />
          </button>
        </div>
      </label>
      <button
        className="attachment-open-button"
        disabled={!attachmentUrl}
        type="button"
        onClick={openAttachment}
      >
        <span>Open</span>
        <ArrowUpRight size={17} />
      </button>
      <input ref={fileInput} type="file" onChange={(event) => importFile(event.target.files?.[0])} />
    </div>
  );
}

function getAttachmentHref(value) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value;
  }

  return normalizeUrl(value);
}

function formatFileSize(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function useViewportWidth() {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));

  useEffect(() => {
    function handleResize() {
      setWidth(window.innerWidth);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return width;
}

function getCardRenderWindow({ cardCount, activeIndex, cardWidth, gap }) {
  if (cardCount <= 0) {
    return { start: 0, end: -1 };
  }

  const safeActiveIndex = Math.min(Math.max(activeIndex, 0), cardCount - 1);
  const radius = Math.max(1, Math.ceil(editorSetSize.width / Math.max(cardWidth + gap, 1)) + visibleCardBuffer);

  return {
    start: Math.max(0, safeActiveIndex - radius),
    end: Math.min(cardCount - 1, safeActiveIndex + radius),
  };
}

function getEditorFocusZoom(editorWidth, editorHeight) {
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 820 : window.innerHeight;
  const safeWidth = Math.max(320, viewportWidth - 96);
  const safeHeight = Math.max(360, viewportHeight - 142);
  const fitZoom = Math.min(safeWidth / editorWidth, safeHeight / editorHeight) * 0.98;

  return clampZoom(Math.min(1.12, Math.max(minZoom, fitZoom)));
}

function getEditorFocusYOffset() {
  if (typeof window === "undefined") {
    return 72;
  }

  return window.innerWidth < 760 ? 64 : 72;
}

function getWheelZoomDelta(event) {
  let deltaY = event.deltaY;

  if (event.deltaMode === 1) {
    deltaY *= 16;
  } else if (event.deltaMode === 2) {
    deltaY *= window.innerHeight;
  }

  return Math.min(Math.max(-deltaY * wheelZoomSensitivity, -maxWheelZoomStep), maxWheelZoomStep);
}

function clearTextSelection() {
  const selection = window.getSelection?.();
  if (selection && !selection.isCollapsed) {
    selection.removeAllRanges();
  }
}

function getNodeCenter(node, isEditing) {
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

function getScopePath(scopeId, organizationLookup) {
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

function collectDescendantOrganizationIds(organizationId, organizations) {
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

function isOrganizationDescendant(candidateId, ancestorId, organizations) {
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

function getNodeCentroid(nodes) {
  if (nodes.length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: nodes.reduce((total, node) => total + node.position.x, 0) / nodes.length,
    y: nodes.reduce((total, node) => total + node.position.y, 0) / nodes.length,
  };
}

function rebaseConnectionsForGroupedNodes(connections, selectedIds, sourceScopeId, organizationId) {
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

function rewireConnectionsForMovedNode(connections, nodeId, sourceScopeId, targetOrganizationId) {
  return connections
    .map((connection) => {
      const scopeId = connection.scopeId || null;
      const fromNodeId = connection.fromNodeId || connection.fromSetId;
      const toNodeId = connection.toNodeId || connection.toSetId;
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

function rewireConnectionsForMovedOutNode(connections, nodeId, sourceOrganizationId, targetScopeId) {
  return connections
    .map((connection) => {
      const scopeId = connection.scopeId || null;
      const fromNodeId = connection.fromNodeId || connection.fromSetId;
      const toNodeId = connection.toNodeId || connection.toSetId;
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

function getMovedOutNodePosition(node, parentOrganization) {
  return {
    x: parentOrganization.position.x + node.position.x,
    y: parentOrganization.position.y + node.position.y,
  };
}

function projectMiniMapNodes(nodes) {
  const projected = new Map();
  if (nodes.length === 0) {
    return projected;
  }

  const minX = Math.min(...nodes.map((node) => node.position.x));
  const maxX = Math.max(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxY = Math.max(...nodes.map((node) => node.position.y));
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);

  for (const node of nodes) {
    projected.set(node.id, {
      x: 22 + ((node.position.x - minX) / width) * 176,
      y: 18 + ((node.position.y - minY) / height) * 76,
    });
  }

  return projected;
}

function formatProjectDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Updated now";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTrashDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Deleted now";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default App;
