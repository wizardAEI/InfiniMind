import { FileText, ImageIcon, Link2, Paperclip } from "lucide-react";

export const cardTypes = [
  { id: "text", label: "Text", icon: FileText },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "link", label: "Link", icon: Link2 },
  { id: "attachment", label: "Attachment", icon: Paperclip },
];

export const typeMeta = {
  text: { title: "TEXT FIELD", glyph: "T", rhythm: "001" },
  image: { title: "IMAGE NODE", glyph: "I", rhythm: "010" },
  link: { title: "LINK VECTOR", glyph: "L", rhythm: "011" },
  attachment: { title: "ATTACHMENT", glyph: "A", rhythm: "100" },
};
