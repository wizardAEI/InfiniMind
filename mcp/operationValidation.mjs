import { cardTypeIds, getImageIdFromUrl } from "../src/lib/workspaceModel.js";

export function trackId(seenIds, issues, id, label) {
  if (!id) {
    issues.push({ severity: "error", code: "missing_id", message: `${label} is missing an id.` });
    return;
  }
  if (seenIds.has(id)) {
    issues.push({
      severity: "error",
      code: "duplicate_id",
      id,
      message: `Duplicate id ${id} seen in ${seenIds.get(id)} and ${label}.`,
    });
    return;
  }
  seenIds.set(id, label);
}

export function validateCard(projectId, setId, card, knownImageIds, issues, trashId) {
  if (!cardTypeIds.includes(card.type)) {
    issues.push({ severity: "error", code: "invalid_card_type", projectId, setId, cardId: card.id, trashId });
  }
  const imageId = getImageIdFromUrl(card.imageUrl);
  if (imageId && knownImageIds && !knownImageIds.has(imageId)) {
    issues.push({
      severity: "warning",
      code: "missing_image_asset",
      projectId,
      setId,
      cardId: card.id,
      trashId,
      imageId,
      message: `Card references missing image asset ${imageId}.`,
    });
  }
  const attachmentId = getImageIdFromUrl(card.attachmentUrl);
  if (attachmentId && knownImageIds && !knownImageIds.has(attachmentId)) {
    issues.push({
      severity: "warning",
      code: "missing_attachment_asset",
      projectId,
      setId,
      cardId: card.id,
      trashId,
      imageId: attachmentId,
      message: `Card references missing attachment asset ${attachmentId}.`,
    });
  }
}
