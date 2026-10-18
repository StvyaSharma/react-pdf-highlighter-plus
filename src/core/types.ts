import React from "react";

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

/**
 * Common props shared by every format-specific highlighter component.
 */
export interface DocumentHighlighterProps<H extends DocumentHighlight = DocumentHighlight> {
  /** Source document (URL, ArrayBuffer, or format-specific init params). */
  source: string | ArrayBuffer | Record<string, unknown>;
  highlights: H[];
  onSelection?: (selection: DocumentSelection) => void;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The contract every document format must implement to be usable by the
 * generic highlighter infrastructure. Implement this interface to add a new
 * format (e.g. MOBI, DOCX, HTML) without touching the React layer.
 */
export interface DocumentAdapter {
  /** Format identifier. */
  readonly format: DocumentFormat;

  /** Load the document from a source. */
  load(source: string | ArrayBuffer | Record<string, unknown>): Promise<void>;

  /** Render the loaded document into the given container element. */
  render(container: HTMLElement): Promise<void>;

  /** Tear down rendering and release resources. */
  destroy(): void;

  /** Navigate one step forward. */
  next(): Promise<void>;

  /** Navigate one step backward. */
  prev(): Promise<void>;

  /** Display a specific target (page number, CFI, anchor, ...). */
  display(target?: string | number): Promise<void>;

  /** Current location, if available. */
  currentLocation(): { page?: number; cfi?: string; percentage?: number } | null;

  /** Subscribe to text/area selections. Returns an unsubscribe function. */
  onSelection(handler: (selection: DocumentSelection) => void): () => void;

  /** Add a visual highlight for a position. Returns a handle. */
  addHighlight(position: DocumentPosition, style?: Record<string, string>): string;

  /** Remove a previously added highlight by handle. */
  removeHighlight(handle: string): void;

  /** Optional: document outline / table of contents. */
  getOutline?(): Promise<unknown[]>;

  /** Optional: full-text search returning matches with locators. */
  search?(query: string): Promise<Array<{ cfi?: string; excerpt?: string; href?: string }>>;

  /** Optional: apply typography/theme styles (e.g. fontSize, fontFamily, lineHeight, colors). */
  setStyles?(styles: Record<string, string | number>): void;

  /** Optional: inject a raw CSS string into the rendered document. */
  injectCss?(css: string): void;

  /** Optional: add a typed annotation (highlight/underline/mark/note) at a CFI range. */
  annotate?(
    type: string,
    cfiRange: string,
    data?: Record<string, unknown>,
    styles?: Record<string, string | number>,
  ): string;

  /** Optional: remove a typed annotation. */
  removeAnnotation?(cfiRange: string, type: string): void;
}
