import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Minimize2, Paperclip, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cardTypes, typeMeta } from "../lib/cardDisplay.js";
import { editorSetSize, visibleCardBuffer } from "../lib/canvasGeometry.js";
import { createCardId, getRandomImageStyle, normalizeUrl } from "../lib/workspaceModel.js";
import { CardCountBadge } from "./CardSummaries.jsx";

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

export default CardSetEditor;
