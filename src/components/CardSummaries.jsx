import { FileText, Link2, Maximize2, Trash2, Ungroup } from "lucide-react";
import { getCardPreview } from "../lib/workspaceModel.js";

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
  onMoveOut,
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
    <article className={`clue-set summary-set ${isActiveSet ? "is-active-set" : ""}`} data-card-color={activeCard?.color || "none"}>
      <header className="clue-set-header" onPointerDown={onDragStart}>
        <strong className="set-title-text">{cardSet.title}</strong>
        <CardCountBadge count={cardSet.cards.length} />
      </header>
      <div className="summary-set-body" onPointerDown={onDragStart}>
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
        {cardSet.parentId && (
          <button
            type="button"
            title="Move card set out of organization"
            aria-label={`Move ${cardSet.title} out of organization`}
            onClick={(event) => {
              event.stopPropagation();
              onMoveOut();
            }}
          >
            <Ungroup size={14} />
          </button>
        )}
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
  return (
    <article
      className="organization-node"
      aria-label={`Organization: ${organization.title || "Untitled"}`}
      onPointerDown={onDragStart}
    >
      <div className="organization-scope-mark">
        <span className="organization-scope-haze" aria-hidden="true" />
        <span className="organization-card-cluster" aria-hidden="true">
          {["base", "left", "right", "top", "front"].map((card) => (
            <span key={card} />
          ))}
        </span>
        <span className="organization-title-mark">{organization.title || "Untitled Organization"}</span>
      </div>
      <footer className="summary-set-actions organization-actions">
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

export { CardCountBadge, ClueSetSummary, OrganizationSummary };
