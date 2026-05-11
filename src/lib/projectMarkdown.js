import { getCardPreview, getConnectionNodeIds, getTrashCount, normalizeTrash } from "./workspaceModel.js";

const fallbackMarkdownFilename = "infinimind-project";

export function projectToMarkdown(project, options = {}) {
  const lines = [];
  const trash = normalizeTrash(project.field?.trash);
  const sets = project.field?.sets || [];
  const organizations = project.field?.organizations || [];
  const connections = project.field?.connections || [];

  lines.push(`# ${project.name || project.field?.fieldTitle || "Untitled Project"}`);
  lines.push("");
  lines.push(`- Project ID: ${project.id}`);
  lines.push(`- Updated: ${project.updatedAt || "unknown"}`);
  lines.push(`- Sets: ${sets.length}`);
  lines.push(`- Organizations: ${organizations.length}`);
  lines.push(`- Cards: ${sets.reduce((total, set) => total + set.cards.length, 0)}`);
  lines.push(`- Connections: ${connections.length}`);
  lines.push(`- Trash: ${getTrashCount(trash)}`);
  lines.push("");

  for (const organization of organizations) {
    lines.push(`## Organization: ${organization.title || "Untitled Organization"}`);
    lines.push("");
    lines.push(`- Organization ID: ${organization.id}`);
    lines.push(`- Parent: ${organization.parentId || "root"}`);
    lines.push(`- Position: ${Math.round(organization.position?.x || 0)}, ${Math.round(organization.position?.y || 0)}`);
    lines.push("");
  }

  for (const set of sets) {
    lines.push(`## ${set.title || "Untitled Set"}`);
    lines.push("");
    lines.push(`- Set ID: ${set.id}`);
    lines.push(`- Parent: ${set.parentId || "root"}`);
    lines.push(`- Position: ${Math.round(set.position?.x || 0)}, ${Math.round(set.position?.y || 0)}`);
    lines.push(`- Active Card: ${set.activeId}`);
    lines.push("");

    if (options.includeCards !== false) {
      for (const [index, card] of set.cards.entries()) {
        lines.push(`### ${index + 1}. ${card.type.toUpperCase()} ${card.id}`);
        if (card.type === "text") {
          lines.push(card.note || "_No memo yet_");
        } else if (card.type === "image") {
          lines.push(card.imageUrl ? `Image: ${card.imageUrl}` : "_Image placeholder_");
          lines.push(`Tone: ${card.imageTone || "mono"}`);
        } else if (card.type === "link") {
          lines.push(`Title: ${card.linkTitle || ""}`);
          lines.push(`URL: ${card.linkUrl || ""}`);
        } else if (card.type === "attachment") {
          lines.push(`Name: ${card.attachmentName || ""}`);
          lines.push(`URL: ${card.attachmentUrl || ""}`);
          lines.push(`MIME: ${card.attachmentMime || ""}`);
          lines.push(`Size: ${card.attachmentSize || 0}`);
        }
        lines.push("");
      }
    }
  }

  if (connections.length > 0) {
    const nodeById = new Map([
      ...sets.map((set) => [set.id, set]),
      ...organizations.map((organization) => [organization.id, organization]),
    ]);
    lines.push("## Connections");
    lines.push("");
    for (const connection of connections) {
      const { fromNodeId, toNodeId } = getConnectionNodeIds(connection);
      const from = nodeById.get(fromNodeId);
      const to = nodeById.get(toNodeId);
      const label = connection.label ? ` - ${connection.label}` : "";
      lines.push(`- [${connection.scopeId || "root"}] ${from?.title || fromNodeId} -> ${to?.title || toNodeId}${label} (${connection.id})`);
    }
    lines.push("");
  }

  if (options.includeTrash && getTrashCount(trash) > 0) {
    lines.push("## Trash");
    lines.push("");
    for (const item of trash.sets) {
      lines.push(`- Set: ${item.set.title} (${item.id}, ${item.set.cards.length} cards)`);
    }
    for (const item of trash.cards) {
      lines.push(`- Card: ${getCardPreview(item.card)} (${item.id}, from ${item.sourceSetTitle || item.sourceSetId})`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function createMarkdownFilename(projectName) {
  const baseName = String(projectName || "").trim() || fallbackMarkdownFilename;
  const safeName =
    baseName
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
      .replace(/\s+/g, " ")
      .replace(/^[.\s-]+/, "")
      .replace(/[. ]+$/g, "")
      .trim() || fallbackMarkdownFilename;

  return safeName.toLowerCase().endsWith(".md") ? safeName : `${safeName}.md`;
}
