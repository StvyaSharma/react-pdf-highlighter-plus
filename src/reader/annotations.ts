import type { DocumentHighlight } from "../core/document";

export interface AnnotationRecord {
  cfi: string;
  type: string;
  signature: string;
  data?: Record<string, unknown>;
}
/** EPUB.js stores notes and highlights under the same native CFI/type key. */
export function desiredAnnotations(
  highlights: DocumentHighlight[] = [],
  enabled = true,
): Map<string, AnnotationRecord> {
  const desired = new Map<string, AnnotationRecord>();
  if (!enabled) return desired;
  for (const highlight of highlights) {
    if (highlight.position.format !== "epub" || !highlight.position.cfiRange)
      continue;
    const type =
      !highlight.type || highlight.type === "text"
        ? "highlight"
        : highlight.type;
    if (!["highlight", "underline", "mark", "note"].includes(type))
      throw new Error(`Unsupported EPUB annotation type: ${type}`);
    const cfi = highlight.position.cfiRange;
    desired.set(`${type === "note" ? "highlight" : type}:${cfi}`, {
      cfi,
      type,
      data: highlight.content,
      signature: JSON.stringify(highlight),
    });
  }
  return desired;
}
