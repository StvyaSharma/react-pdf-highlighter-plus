/**
 * Supported (and future) document formats. Kept as a string union so new
 * formats can be added without breaking existing consumers.
 */
export type DocumentFormat = "pdf" | "epub" | (string & {});

/**
 * A format-agnostic location inside a document.
 *
 * - PDF uses `pageNumber` + normalized (`0..1`) page coordinates.
 * - EPUB uses a `cfiRange` (EPUB CFI).
 * - Other formats can populate `rangeDescriptor` / `extra`.
 */
export interface DocumentPosition {
  format: DocumentFormat;
  /** 1-indexed page number (PDF and other paged formats). */
  pageNumber?: number;
  /** Normalized bounding rect (PDF). */
  scaledRect?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    width: number;
    height: number;
  };
  /** EPUB Canonical Fragment Identifier range. */
  cfiRange?: string;
  /** Generic serialized range descriptor for custom formats. */
  rangeDescriptor?: string;
  /** Escape hatch for format-specific data. */
  extra?: Record<string, unknown>;
}

/**
 * A text/area selection produced by a viewer.
 */
export interface DocumentSelection {
  format: DocumentFormat;
  position: DocumentPosition;
  content?: {
    text?: string;
    image?: string;
  };
  /** Hide the temporary selection UI (format-specific). */
  hide?: () => void;
}

/**
 * A format-agnostic highlight. Mirrors the library's `Highlight` shape but
 * with a `DocumentPosition` instead of a PDF-only `ScaledPosition`.
 */
export interface DocumentHighlight {
  id: string;
  type?: string;
  position: DocumentPosition;
  content?: Record<string, unknown>;
}
