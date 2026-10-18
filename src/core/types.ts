import React from "react";
import type {
  DocumentFormat,
  DocumentPosition,
  DocumentSelection,
  DocumentHighlight,
} from "./document";
export * from "./document";

/**
 * Common props shared by every format-specific highlighter component.
 */
export interface DocumentHighlighterProps<
  H extends DocumentHighlight = DocumentHighlight,
> {
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
  currentLocation(): {
    page?: number;
    cfi?: string;
    percentage?: number;
  } | null;

  /** Subscribe to text/area selections. Returns an unsubscribe function. */
  onSelection(handler: (selection: DocumentSelection) => void): () => void;

  /** Add a visual highlight for a position. Returns a handle. */
  addHighlight(
    position: DocumentPosition,
    style?: Record<string, string>,
  ): string;

  /** Remove a previously added highlight by handle. */
  removeHighlight(handle: string): void;

  /** Optional: document outline / table of contents. */
  getOutline?(): Promise<unknown[]>;

  /** Optional: full-text search returning matches with locators. */
  search?(
    query: string,
  ): Promise<Array<{ cfi?: string; excerpt?: string; href?: string }>>;

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
