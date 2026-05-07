import { MotionConfig, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  ChevronLeft,
  FileText,
  FolderOpen,
  ImageIcon,
  Layers3,
  Link2,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const cardTypes = [
  { id: "text", label: "Text", icon: FileText },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "link", label: "Link", icon: Link2 },
];

const typeMeta = {
  text: { title: "TEXT FIELD", glyph: "T", rhythm: "001" },
  image: { title: "IMAGE NODE", glyph: "I", rhythm: "010" },
  link: { title: "LINK VECTOR", glyph: "L", rhythm: "011" },
};

const imageStyles = ["scan", "topography", "wave", "cells", "portal", "signal"];
const storageKey = "infinimind.workspace-state.v1";
const legacyStorageKey = "infinimind.field-state.v1";
const workspaceVersion = 1;
const storageVersion = 3;
const wallSetSize = { width: 268, height: 178 };
const editorSetSize = { width: 760, height: 620 };
const minZoom = 0.45;
const maxZoom = 1.8;
const zoomStep = 0.12;

function createSeedCard(id = "card-1", note) {
  return {
    id,
    type: "text",
    note:
      note ||
      "A field begins as one surface. Click, add, flip, and let the archive unfold from the center.",
    imageUrl: "",
    imageStyle: getRandomImageStyle(),
    linkUrl: "https://example.com",
    linkTitle: "Reference path",
  };
}

function createCardSet(index = 0, id = `set-${index + 1}`) {
  const cardId = index === 0 ? "card-1" : createCardId();

  return {
    id,
    title: `Set ${String(index + 1).padStart(2, "0")}`,
    position: getDefaultSetPosition(index),
    cards: [
      createSeedCard(
        cardId,
        index === 0
          ? undefined
          : "A new card set keeps its own 2D stack while the larger canvas opens around it."
      ),
    ],
    activeId: cardId,
    isSpread: false,
  };
}

function createDefaultState(fieldTitle = "Title") {
  const firstSet = createCardSet();

  return {
    version: storageVersion,
    fieldTitle,
    sets: [firstSet],
    activeSetId: firstSet.id,
    connections: [],
    pan: { x: 0, y: 0 },
    zoom: 1,
  };
}

function createProject(index = 0, field = createDefaultState(`Project ${String(index + 1).padStart(2, "0")}`)) {
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

function createDefaultWorkspaceState() {
  const firstProject = createProject(0, createDefaultState("Title"));

  return {
    version: workspaceVersion,
    projects: [firstProject],
    activeProjectId: firstProject.id,
  };
}

function App() {
  const { workspaceState, setWorkspaceState, ready } = usePersistentWorkspaceState();
  const [view, setView] = useState("projects");
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
    if (workspaceState.projects.length <= 1) {
      return;
    }

    const project = workspaceState.projects.find((item) => item.id === projectId);
    if (!window.confirm(`Delete "${project?.name || "this project"}"?`)) {
      return;
    }

    setWorkspaceState((current) => {
      const projects = current.projects.filter((item) => item.id !== projectId);
      const activeProjectId = projects.some((item) => item.id === current.activeProjectId)
        ? current.activeProjectId
        : projects[0].id;

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
          />
        ) : (
          <section className="editorial-frame" aria-label="Infinimind card field">
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
              sets={fieldState.sets}
              activeSetId={activeSetId}
              connections={fieldState.connections}
              pan={fieldState.pan}
              zoom={fieldState.zoom}
              onChange={patchFieldState}
            />
          </section>
        )}
      </main>
    </MotionConfig>
  );
}

function ProjectList({ projects, activeProjectId, onCreateProject, onOpenProject, onDeleteProject }) {
  return (
    <section className="project-list-screen" aria-label="Project list">
      <div className="window-drag-region" aria-hidden="true" />
      <header className="project-list-heading">
        <div>
          <p>INFINIMIND</p>
          <h1>Projects</h1>
        </div>
        <button className="new-project-button" type="button" onClick={onCreateProject}>
          <Plus size={18} />
          <span>New Project</span>
        </button>
      </header>

      <div className="project-grid">
        {projects.map((project, index) => {
          const sets = project.field?.sets || [];
          const cardCount = sets.reduce((total, set) => total + set.cards.length, 0);
          const previewSet = sets.find((set) => set.id === project.field?.activeSetId) || sets[0];
          const previewCard = previewSet?.cards.find((card) => card.id === previewSet.activeId) || previewSet?.cards[0];

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
                    aria-label={`Open ${project.name}`}
                    onClick={() => onOpenProject(project.id)}
                  >
                    <FolderOpen size={15} />
                  </button>
                  <button
                    type="button"
                    title="Delete project"
                    aria-label={`Delete ${project.name}`}
                    disabled={projects.length <= 1}
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
    </section>
  );
}

function CardField({ sets, activeSetId, connections, pan, zoom, onChange }) {
  const [freshId, setFreshId] = useState(null);
  const [birthSourceId, setBirthSourceId] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [editingSetId, setEditingSetId] = useState(null);
  const [pendingConnection, setPendingConnection] = useState(null);
  const [connectionSourceId, setConnectionSourceId] = useState(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);
  const panGesture = useRef(null);
  const setDrag = useRef(null);
  const width = useViewportWidth();
  const cardWidth = Math.min(Math.max(width * 0.72, 284), 384);
  const editorWidth = Math.min(Math.max(width * 0.72, 620), editorSetSize.width);
  const editorHeight = width < 740 ? 600 : editorSetSize.height;
  const activeSetIndex = Math.max(0, sets.findIndex((set) => set.id === activeSetId));
  const activeSet = sets[activeSetIndex] || sets[0];
  const editingSet = sets.find((set) => set.id === editingSetId);
  const visibleConnections = connections.filter(
    (connection) =>
      sets.some((set) => set.id === connection.fromSetId) && sets.some((set) => set.id === connection.toSetId)
  );

  useEffect(() => {
    if (editingSetId && !sets.some((set) => set.id === editingSetId)) {
      setEditingSetId(null);
    }
  }, [editingSetId, sets]);

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
        return { ...set, ...nextPatch };
      }),
    }));
  }

  function setPan(nextPan) {
    onChange({ pan: nextPan });
  }

  function setZoom(nextZoom, anchor) {
    const clampedZoom = clampZoom(nextZoom);
    const anchorPoint = anchor || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const viewportX = anchorPoint.x - window.innerWidth / 2;
    const viewportY = anchorPoint.y - window.innerHeight / 2;
    const localX = (viewportX - pan.x) / zoom;
    const localY = (viewportY - pan.y) / zoom;

    onChange({
      zoom: clampedZoom,
      pan: {
        x: viewportX - localX * clampedZoom,
        y: viewportY - localY * clampedZoom,
      },
    });
  }

  function zoomBy(delta, anchor) {
    setZoom(zoom + delta, anchor);
  }

  function resetZoom() {
    onChange({ zoom: 1, pan: { x: 0, y: 0 } });
  }

  function setActiveSet(setId) {
    onChange({ activeSetId: setId });
  }

  function setActiveSetSpread(nextIsSpread) {
    const targetSet = editingSet || activeSet;
    if (!targetSet) {
      return;
    }

    patchSet(targetSet.id, {
      isSpread: typeof nextIsSpread === "function" ? nextIsSpread(targetSet.isSpread) : nextIsSpread,
    });
  }

  function addCardSet() {
    const nextSet = {
      ...createCardSet(sets.length, createSetId()),
      position: {
        x: -pan.x / zoom + 120 + sets.length * 24,
        y: -pan.y / zoom + 96 + sets.length * 18,
      },
    };
    setBirthSourceId(null);
    setFreshId(nextSet.cards[0].id);
    onChange((current) => ({
      sets: [...current.sets, nextSet],
      activeSetId: nextSet.id,
    }));
    setEditingSetId(null);
    window.setTimeout(() => setFreshId(null), 760);
  }

  function deleteCardSet(setId) {
    setBirthSourceId(null);
    setFreshId(null);
    setPendingConnection(null);
    setSelectedConnectionId(null);
    setConnectionSourceId((current) => (current === setId ? null : current));
    setEditingSetId((current) => (current === setId ? null : current));

    onChange((current) => {
      const deleteIndex = current.sets.findIndex((set) => set.id === setId);
      const remainingSets = current.sets.filter((set) => set.id !== setId);
      const nextSets = remainingSets.length > 0 ? remainingSets : [createCardSet(0, createSetId())];
      const activeSetStillExists = nextSets.some((set) => set.id === current.activeSetId);
      const fallbackActiveIndex = Math.max(0, Math.min(deleteIndex, nextSets.length - 1));

      return {
        sets: nextSets,
        activeSetId: activeSetStillExists ? current.activeSetId : nextSets[fallbackActiveIndex].id,
        connections: current.connections.filter(
          (connection) => connection.fromSetId !== setId && connection.toSetId !== setId
        ),
      };
    });
  }

  function handleStageClick() {
    if (panGesture.current?.dragged) {
      panGesture.current = null;
      return;
    }

    panGesture.current = null;
    setSelectedConnectionId(null);
    setConnectionSourceId(null);
  }

  function handlePointerDown(event) {
    if (event.button !== 0 || event.target.closest(".clue-set, .field-toolbar, button, input, textarea, a, .connection-line")) {
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

  function beginSetDrag(event, setId) {
    if (event.button !== 0 || event.target.closest("button, textarea, a")) {
      return;
    }

    const cardSet = sets.find((set) => set.id === setId);
    if (!cardSet) {
      return;
    }

    setDrag.current = {
      pointerId: event.pointerId,
      setId,
      startX: event.clientX,
      startY: event.clientY,
      originX: cardSet.position.x,
      originY: cardSet.position.y,
      dragged: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveSetDrag(event) {
    const drag = setDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const nextY = drag.originY + (event.clientY - drag.startY) / zoom;
    const correctedNextX = drag.originX + (event.clientX - drag.startX) / zoom;
    if (Math.abs(correctedNextX - drag.originX) > 3 || Math.abs(nextY - drag.originY) > 3) {
      drag.dragged = true;
    }
    patchSet(drag.setId, { position: { x: correctedNextX, y: nextY } });
  }

  function endSetDrag(event) {
    const drag = setDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag.current = null;
  }

  function beginConnection(event, setId) {
    if (event.button !== 0) {
      return;
    }

    const cardSet = sets.find((set) => set.id === setId);
    if (!cardSet) {
      return;
    }

    const origin = getSetCenter(cardSet, editingSetId === setId);
    setPendingConnection({
      fromSetId: setId,
      pointerId: event.pointerId,
      x: origin.x,
      y: origin.y,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
    event.preventDefault();
  }

  function moveConnection(event) {
    if (!pendingConnection || pendingConnection.pointerId !== event.pointerId) {
      return;
    }

    setPendingConnection((current) =>
      current
        ? {
            ...current,
            x: (event.clientX - window.innerWidth / 2 - pan.x) / zoom,
            y: (event.clientY - window.innerHeight / 2 - pan.y) / zoom,
          }
        : current
    );
  }

  function clickConnection(setId) {
    if (!connectionSourceId) {
      setConnectionSourceId(setId);
      return;
    }

    if (connectionSourceId === setId || hasConnection(connections, connectionSourceId, setId)) {
      setConnectionSourceId(null);
      return;
    }

    const nextConnection = {
      id: createConnectionId(),
      fromSetId: connectionSourceId,
      toSetId: setId,
    };
    onChange({ connections: [...connections, nextConnection] });
    setSelectedConnectionId(nextConnection.id);
    setConnectionSourceId(null);
  }

  function endConnection(event) {
    if (!pendingConnection || pendingConnection.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    const fromSetId = pendingConnection.fromSetId;
    const dropTarget = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-set-id]");
    const targetSetId = dropTarget?.dataset?.setId;
    setPendingConnection(null);

    if (!targetSetId || targetSetId === fromSetId || hasConnection(connections, fromSetId, targetSetId)) {
      return;
    }

    const nextConnection = {
      id: createConnectionId(),
      fromSetId,
      toSetId: targetSetId,
    };
    onChange({ connections: [...connections, nextConnection] });
    setSelectedConnectionId(nextConnection.id);
    setConnectionSourceId(null);
  }

  return (
    <section className="field-panel" onClick={handleStageClick}>
      <div className="field-toolbar">
        <button
          className="icon-button"
          type="button"
          title={(editingSet || activeSet)?.isSpread ? "Stack cards" : "Spread cards"}
          aria-label={(editingSet || activeSet)?.isSpread ? "Stack cards" : "Spread cards"}
          disabled={!editingSet || !activeSet}
          onClick={(event) => {
            event.stopPropagation();
            setActiveSetSpread((value) => !value);
          }}
        >
          {(editingSet || activeSet)?.isSpread ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
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
          {Math.round(zoom * 100)}%
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
        <div className="card-count" aria-label={`${sets.length} card sets`}>
          <Layers3 size={16} />
          <span>{String(sets.length).padStart(2, "0")}</span>
        </div>
      </div>

      <div
        className={`field-stage clue-wall ${isPanning ? "is-panning" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onWheel={(event) => {
          if (event.target.closest(".clue-set, .field-toolbar, button, input, textarea, a")) {
            return;
          }

          event.preventDefault();
          zoomBy(event.deltaY > 0 ? -zoomStep : zoomStep, { x: event.clientX, y: event.clientY });
        }}
        style={{
          "--canvas-x": `${pan.x}px`,
          "--canvas-y": `${pan.y}px`,
          "--canvas-zoom": zoom,
        }}
      >
        <div className="canvas-origin" aria-hidden="true" />
        <div className="canvas-world" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}>
          <ConnectionLayer
            connections={visibleConnections}
            sets={sets}
            editingSetId={editingSetId}
            pendingConnection={pendingConnection}
            selectedConnectionId={selectedConnectionId}
            onSelectConnection={setSelectedConnectionId}
          />
          {sets.map((cardSet, index) => {
            const isActiveSet = cardSet.id === activeSetId;
            const isEditing = cardSet.id === editingSetId;
            const setWidth = isEditing ? editorWidth : wallSetSize.width;
            const setHeight = isEditing ? editorHeight : wallSetSize.height;

            return (
              <motion.section
                className={`clue-set-positioner ${isActiveSet ? "is-active-set" : ""} ${
                  isEditing ? "is-editing-set" : ""
                }`}
                data-set-id={cardSet.id}
                key={cardSet.id}
                layout
                animate={{
                  x: cardSet.position.x,
                  y: cardSet.position.y,
                  scale: 1,
                  opacity: 1,
                }}
                transition={{ type: "spring", stiffness: 150, damping: 28, mass: 1 }}
                style={{
                  width: setWidth,
                  height: setHeight,
                  marginLeft: -setWidth / 2,
                  marginTop: -setHeight / 2,
                  zIndex: isEditing ? 260 : isActiveSet ? 180 : 120 + index,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveSet(cardSet.id);
                  setSelectedConnectionId(null);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  setEditingSetId(cardSet.id);
                  setActiveSet(cardSet.id);
                }}
                onPointerMove={moveSetDrag}
                onPointerUp={endSetDrag}
                onPointerCancel={endSetDrag}
              >
                {isEditing ? (
                  <CardSetEditor
                    cardSet={cardSet}
                    cardWidth={cardWidth}
                    freshId={isActiveSet ? freshId : null}
                    birthSourceId={isActiveSet ? birthSourceId : null}
                    isActiveSet={isActiveSet}
                    connectionSourceId={connectionSourceId}
                    onActivate={() => setActiveSet(cardSet.id)}
                    onClose={() => setEditingSetId(null)}
                    onDeleteSet={() => deleteCardSet(cardSet.id)}
                    onPatch={(patch) => patchSet(cardSet.id, patch)}
                    onFreshCard={(cardId, sourceId) => {
                      setBirthSourceId(sourceId);
                      setFreshId(cardId);
                      window.setTimeout(() => setFreshId(null), 760);
                    }}
                    onDragStart={(event) => beginSetDrag(event, cardSet.id)}
                    onConnectionStart={(event) => beginConnection(event, cardSet.id)}
                    onConnectionMove={moveConnection}
                    onConnectionEnd={endConnection}
                    onConnectionClick={() => clickConnection(cardSet.id)}
                  />
                ) : (
                  <ClueSetSummary
                    cardSet={cardSet}
                    isActiveSet={isActiveSet}
                    connectionSourceId={connectionSourceId}
                    onEdit={() => {
                      setEditingSetId(cardSet.id);
                      setActiveSet(cardSet.id);
                    }}
                    onDelete={() => deleteCardSet(cardSet.id)}
                    onDragStart={(event) => beginSetDrag(event, cardSet.id)}
                    onConnectionStart={(event) => beginConnection(event, cardSet.id)}
                    onConnectionMove={moveConnection}
                    onConnectionEnd={endConnection}
                    onConnectionClick={() => clickConnection(cardSet.id)}
                  />
                )}
              </motion.section>
            );
          })}
        </div>
      </div>
    </section>
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
  onConnectionClick,
}) {
  const activeCard = cardSet.cards.find((card) => card.id === cardSet.activeId) || cardSet.cards[0];
  const preview = getCardPreview(activeCard);

  return (
    <article className={`clue-set summary-set ${isActiveSet ? "is-active-set" : ""}`}>
      <header className="clue-set-header" onPointerDown={onDragStart}>
        <input
          className="set-title-input"
          aria-label="Card set title"
          value={cardSet.title}
          readOnly
          onClick={(event) => event.stopPropagation()}
        />
        <span>{String(cardSet.cards.length).padStart(2, "0")}</span>
      </header>
      <div className="summary-set-body">
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
          onPointerCancel={onConnectionEnd}
          onClick={(event) => {
            event.stopPropagation();
            onConnectionClick();
          }}
        >
          <Link2 size={14} />
        </button>
      </footer>
    </article>
  );
}

function CardSetEditor({
  cardSet,
  cardWidth,
  freshId,
  birthSourceId,
  isActiveSet,
  connectionSourceId,
  onActivate,
  onClose,
  onDeleteSet,
  onPatch,
  onFreshCard,
  onDragStart,
  onConnectionStart,
  onConnectionMove,
  onConnectionEnd,
  onConnectionClick,
}) {
  const reduceMotion = useReducedMotion();
  const activeIndex = Math.max(
    0,
    cardSet.cards.findIndex((card) => card.id === cardSet.activeId)
  );
  const gap = cardWidth < 320 ? 22 : 34;

  function setCards(updater) {
    onPatch((currentSet) => ({
      cards: typeof updater === "function" ? updater(currentSet.cards) : updater,
    }));
  }

  function setActiveId(nextActiveId) {
    onPatch({ activeId: nextActiveId });
  }

  function setIsSpread(nextIsSpread) {
    onPatch((currentSet) => ({
      isSpread: typeof nextIsSpread === "function" ? nextIsSpread(currentSet.isSpread) : nextIsSpread,
    }));
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
      linkUrl: "",
      linkTitle: "",
    };

    onPatch((currentSet) => {
      const current = currentSet.cards;
      const index = current.findIndex((card) => card.id === afterId);
      const insertionIndex = index === -1 ? current.length : index + 1;
      const nextCards = [...current.slice(0, insertionIndex), nextCard, ...current.slice(insertionIndex)];

      return {
        cards: nextCards,
        activeId: nextId,
        isSpread: true,
      };
    });

    onFreshCard(nextId, afterId);
  }

  function deleteCard(cardId) {
    if (cardSet.cards.length <= 1) {
      onDeleteSet();
      return;
    }

    onPatch((currentSet) => {
      const deleteIndex = currentSet.cards.findIndex((card) => card.id === cardId);
      if (deleteIndex === -1 || currentSet.cards.length <= 1) {
        return {};
      }

      const nextCards = currentSet.cards.filter((card) => card.id !== cardId);
      const fallbackActiveIndex = Math.max(0, Math.min(deleteIndex, nextCards.length - 1));

      return {
        cards: nextCards,
        activeId: currentSet.activeId === cardId ? nextCards[fallbackActiveIndex].id : currentSet.activeId,
        isSpread: nextCards.length > 1 ? currentSet.isSpread : false,
      };
    });
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
        <span>{String(cardSet.cards.length).padStart(2, "0")}</span>
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
        <button
          className="set-header-button connect-handle"
          type="button"
          title="Connect"
          aria-label={`Connect from ${cardSet.title}`}
          data-active-source={connectionSourceId === cardSet.id}
          onPointerDown={onConnectionStart}
          onPointerMove={onConnectionMove}
          onPointerUp={onConnectionEnd}
          onPointerCancel={onConnectionEnd}
          onClick={(event) => {
            event.stopPropagation();
            onConnectionClick();
          }}
        >
          <Link2 size={14} />
        </button>
      </header>
      <div className="card-set-stack" onClick={onActivate}>
        {cardSet.cards.map((card, index) => {
          const distance = index - activeIndex;
          const sourceIndex = birthSourceId ? cardSet.cards.findIndex((item) => item.id === birthSourceId) : activeIndex;
          const sourceDistance = sourceIndex - activeIndex;
          const spreadX = distance * (cardWidth + gap);
          const stackX = distance * 13;
          const isActive = card.id === cardSet.activeId;
          const isFresh = card.id === freshId;

          return (
            <motion.div
              className="card-positioner"
              key={card.id}
              layout
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
                x: cardSet.isSpread ? spreadX : stackX,
                y: cardSet.isSpread ? (isActive ? -6 : Math.abs(distance) * 9) : Math.abs(distance) * 5,
                scale: cardSet.isSpread ? (isActive ? 1 : 0.94) : isActive ? 1 : 0.92 - Math.min(Math.abs(distance) * 0.05, 0.18),
                rotate: cardSet.isSpread ? distance * 0.65 : distance * -3.2,
                opacity: cardSet.isSpread ? 1 : isActive ? 1 : 0.72 - Math.min(Math.abs(distance) * 0.12, 0.4),
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
                  setIsSpread(true);
                }}
                onTypeChange={(type) => convertCard(card.id, type)}
                onAdd={() => addCard(card.id)}
                onDelete={() => deleteCard(card.id)}
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
  sets,
  editingSetId,
  pendingConnection,
  selectedConnectionId,
  onSelectConnection,
}) {
  return (
    <svg className="connection-layer" aria-hidden="true">
      {connections.map((connection) => {
        const fromSet = sets.find((set) => set.id === connection.fromSetId);
        const toSet = sets.find((set) => set.id === connection.toSetId);
        if (!fromSet || !toSet) {
          return null;
        }

        const from = getSetCenter(fromSet, editingSetId === fromSet.id);
        const to = getSetCenter(toSet, editingSetId === toSet.id);
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
          x1={
            getSetCenter(
              sets.find((set) => set.id === pendingConnection.fromSetId),
              editingSetId === pendingConnection.fromSetId
            ).x
          }
          y1={
            getSetCenter(
              sets.find((set) => set.id === pendingConnection.fromSetId),
              editingSetId === pendingConnection.fromSetId
            ).y
          }
          x2={pendingConnection.x}
          y2={pendingConnection.y}
        />
      )}
    </svg>
  );
}

function usePersistentWorkspaceState() {
  const [workspaceState, setWorkspaceState] = useState(() => createDefaultWorkspaceState());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadWorkspaceState().then((storedState) => {
      if (cancelled) {
        return;
      }

      if (storedState) {
        setWorkspaceState(normalizeWorkspaceState(storedState));
      }
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
      saveWorkspaceState(normalizeWorkspaceState(workspaceState));
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [workspaceState, ready]);

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

async function saveWorkspaceState(workspaceState) {
  if (window.infinimindStorage?.save) {
    await window.infinimindStorage.save(workspaceState);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(workspaceState));
}

function normalizeWorkspaceState(value) {
  const fallback = createDefaultWorkspaceState();
  const hasProjects = Array.isArray(value?.projects) && value.projects.length > 0;
  const rawProjects = hasProjects ? value.projects : [createProject(0, normalizeFieldState(value))];
  const projects = rawProjects.map(normalizeProject).filter(Boolean);
  const safeProjects = projects.length > 0 ? projects : fallback.projects;
  const activeProjectId = safeProjects.some((project) => project.id === value?.activeProjectId)
    ? value.activeProjectId
    : safeProjects[0].id;

  return {
    version: workspaceVersion,
    projects: safeProjects,
    activeProjectId,
  };
}

function normalizeProject(project, index) {
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

function normalizeFieldState(value) {
  const fallback = createDefaultState();
  const migratedSet =
    Array.isArray(value?.cards) && value.cards.length > 0
      ? {
          id: "set-1",
          title: "Set 01",
          cards: value.cards,
          activeId: value.activeId,
          isSpread: value.isSpread,
        }
      : null;
  const rawSets = Array.isArray(value?.sets) && value.sets.length > 0 ? value.sets : migratedSet ? [migratedSet] : null;
  const sets = rawSets ? rawSets.map(normalizeCardSet) : fallback.sets;
  const activeSetId = sets.some((set) => set.id === value?.activeSetId) ? value.activeSetId : sets[0].id;
  const connections = Array.isArray(value?.connections)
    ? value.connections.map(normalizeConnection).filter((connection) => {
        if (!connection) return false;
        return (
          sets.some((set) => set.id === connection.fromSetId) &&
          sets.some((set) => set.id === connection.toSetId) &&
          connection.fromSetId !== connection.toSetId
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
    activeSetId,
    connections: dedupeConnections(connections),
    pan,
    zoom: clampZoom(Number.isFinite(value?.zoom) ? value.zoom : fallback.zoom),
  };
}

function normalizeCardSet(cardSet, index) {
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
    cards,
    activeId,
    isSpread: Boolean(cardSet?.isSpread),
  };
}

function normalizeCard(card) {
  return {
    id: typeof card?.id === "string" ? card.id : createCardId(),
    type: cardTypes.some((type) => type.id === card?.type) ? card.type : "text",
    note: typeof card?.note === "string" ? card.note : "",
    imageUrl: typeof card?.imageUrl === "string" ? card.imageUrl : "",
    imageStyle: imageStyles.includes(card?.imageStyle) ? card.imageStyle : getRandomImageStyle(),
    linkUrl: typeof card?.linkUrl === "string" ? card.linkUrl : "",
    linkTitle: typeof card?.linkTitle === "string" ? card.linkTitle : "",
  };
}

function normalizeConnection(connection) {
  if (typeof connection?.fromSetId !== "string" || typeof connection?.toSetId !== "string") {
    return null;
  }

  return {
    id: typeof connection?.id === "string" ? connection.id : createConnectionId(),
    fromSetId: connection.fromSetId,
    toSetId: connection.toSetId,
  };
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
      animate={{ y: isHovered && !isFlipping ? -8 : 0 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      whileTap={{ scale: 0.985 }}
    >
      <div className="card-shadow" aria-hidden="true" />
      <motion.div
        className="card-flipper"
        animate={{
          rotateY: turn * -180,
          scale: isFlipping ? 1.012 : isHovered ? 1.006 : 1,
          z: isFlipping ? 18 : isHovered ? 14 : 0,
        }}
        transition={{
          rotateY: { duration: isFlipping ? 0.72 : 0.34, ease: isFlipping ? [0.16, 1, 0.3, 1] : [0.22, 1, 0.36, 1] },
          scale: { duration: 0.44, ease: [0.22, 1, 0.36, 1] },
          z: { duration: 0.44, ease: [0.22, 1, 0.36, 1] },
        }}
        onAnimationComplete={completeFlip}
      >
        <CardFaceSurface
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
    <label className="text-surface" onClick={(event) => event.stopPropagation()}>
      <span>MEMO</span>
      <textarea
        value={card.note}
        placeholder="Type into the field..."
        onChange={(event) => onUpdate({ note: event.target.value })}
      />
    </label>
  );
}

function ImageCard({ card, onUpdate }) {
  const fileInput = useRef(null);

  function readFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onUpdate({ imageUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return (
    <div className="image-surface" onClick={(event) => event.stopPropagation()}>
      <div className="image-preview">
        {card.imageUrl ? (
          <img src={card.imageUrl} alt="" />
        ) : (
          <div className={`default-image default-image-${card.imageStyle || "scan"}`} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}
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
          onChange={(event) => readFile(event.target.files?.[0])}
        />
      </div>
    </div>
  );
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

function normalizeUrl(value) {
  if (!value) return "#";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function getRandomImageStyle(exclude) {
  const pool = imageStyles.filter((style) => style !== exclude);
  return pool[Math.floor(Math.random() * pool.length)] || imageStyles[0];
}

function clampZoom(value) {
  return Math.min(Math.max(value, minZoom), maxZoom);
}

function getDefaultSetPosition(index) {
  return {
    x: (index % 3) * 340 - 220,
    y: Math.floor(index / 3) * 240 - 40,
  };
}

function getSetCenter(cardSet, isEditing) {
  if (!cardSet) {
    return { x: 0, y: 0 };
  }

  return {
    x: cardSet.position.x,
    y: cardSet.position.y,
    width: isEditing ? editorSetSize.width : wallSetSize.width,
    height: isEditing ? editorSetSize.height : wallSetSize.height,
  };
}

function getCardPreview(card) {
  if (!card) return "Empty clue set";
  if (card.type === "image") return card.imageUrl ? "Image evidence attached" : "Image placeholder";
  if (card.type === "link") return card.linkTitle || card.linkUrl || "Reference link";
  return card.note || "No memo yet";
}

function hasConnection(connections, fromSetId, toSetId) {
  return connections.some((connection) => {
    return (
      (connection.fromSetId === fromSetId && connection.toSetId === toSetId) ||
      (connection.fromSetId === toSetId && connection.toSetId === fromSetId)
    );
  });
}

function dedupeConnections(connections) {
  const seen = new Set();
  return connections.filter((connection) => {
    const key = [connection.fromSetId, connection.toSetId].sort().join("--");
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function createCardId() {
  if (window.crypto?.randomUUID) {
    return `card-${window.crypto.randomUUID()}`;
  }

  return `card-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createSetId() {
  if (window.crypto?.randomUUID) {
    return `set-${window.crypto.randomUUID()}`;
  }

  return `set-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createConnectionId() {
  if (window.crypto?.randomUUID) {
    return `connection-${window.crypto.randomUUID()}`;
  }

  return `connection-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default App;
