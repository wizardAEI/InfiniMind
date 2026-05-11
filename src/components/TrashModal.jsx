import { ArchiveRestore, RotateCcw, Trash2 } from "lucide-react";
import { formatTrashDate } from "../lib/dateFormat.js";
import { getCardPreview, getTrashCount } from "../lib/workspaceModel.js";
import Modal from "./Modal.jsx";

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

export default TrashModal;
