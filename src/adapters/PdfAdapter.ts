import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PDFViewer } from "pdfjs-dist/types/web/pdf_viewer";
import type { DocumentAdapter, DocumentSelection } from "../core/types";

export interface PdfAdapterOptions {
  viewer: PDFViewer;
  pdfDocument: PDFDocumentProxy;
  eventBus?: any;
  findController?: unknown;
}

/**
 * Adapter that exposes a PDF.js viewer through the format-agnostic
 * {@link DocumentAdapter} contract. Highlight rendering itself stays in
 * `PdfHighlighter` (props-driven); this adapter covers document-level
 * operations so PDF and EPUB share one interface.
 */
export class PdfAdapter implements DocumentAdapter {
  readonly format = "pdf";

  private selectionHandlers = new Set<(s: DocumentSelection) => void>();

  constructor(private opts: PdfAdapterOptions) {}

  get viewer(): PDFViewer {
    return this.opts.viewer;
  }

  get pdfDocument(): PDFDocumentProxy {
    return this.opts.pdfDocument;
  }

  async load(): Promise<void> {
    // Document is loaded by PdfLoader; nothing to do here.
  }

  async render(): Promise<void> {
    // Viewer is rendered by PdfHighlighter; nothing to do here.
  }

  destroy(): void {
    this.selectionHandlers.clear();
  }

  async next(): Promise<void> {
    // PDF.js viewer exposes currentPageNumber
    const v = this.opts.viewer as PDFViewer & { nextPage?: () => void };
    if (typeof v.nextPage === "function") v.nextPage();
  }

  async prev(): Promise<void> {
    const v = this.opts.viewer as PDFViewer & { previousPage?: () => void };
    if (typeof v.previousPage === "function") v.previousPage();
  }

  async display(target?: string | number): Promise<void> {
    if (typeof target === "number") {
      const v = this.opts.viewer as PDFViewer & { currentPageNumber?: number };
      if (v && "currentPageNumber" in v) v.currentPageNumber = target;
    }
  }

  currentLocation(): { page?: number; cfi?: string; percentage?: number } | null {
    const v = this.opts.viewer as PDFViewer & { currentPageNumber?: number; pagesCount?: number };
    return { page: v.currentPageNumber ?? undefined };
  }

  onSelection(handler: (selection: DocumentSelection) => void): () => void {
    this.selectionHandlers.add(handler);
    return () => this.selectionHandlers.delete(handler);
  }

  /** Called by PdfHighlighter when a selection finishes, to notify adapter subscribers. */
  emitSelection(selection: DocumentSelection): void {
    this.selectionHandlers.forEach((h) => h(selection));
  }

  addHighlight(): string {
    return `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  removeHighlight(): void {
    // Rendering is props-driven in PdfHighlighter; nothing to remove here.
  }

  async getOutline(): Promise<unknown[]> {
    try {
      const doc = this.opts.pdfDocument as PDFDocumentProxy & { getOutline?: () => Promise<unknown[]> };
      if (typeof doc.getOutline === "function") {
        return (await doc.getOutline()) ?? [];
      }
    } catch {
      /* ignore */
    }
    return [];
  }

  async search(query: string): Promise<Array<{ cfi?: string; excerpt?: string; href?: string }>> {
    const eb = this.opts.eventBus;
    if (eb && typeof eb.dispatch === "function") {
      try {
        eb.dispatch("find", { query, highlightAll: true });
      } catch {
        /* ignore */
      }
    }
    return [];
  }
}
