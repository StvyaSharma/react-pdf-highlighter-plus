import type { Book as BookType, Rendition as RenditionType } from "epubjs";
import type { DocumentAdapter, DocumentPosition, DocumentSelection } from "../core/types";

export interface EpubAdapterOptions {
  width?: number | string;
  height?: number | string;
  flow?: string;
}

export class EpubAdapter implements DocumentAdapter {
  readonly format = "epub";

  private book: BookType | null = null;
  private rendition: RenditionType | null = null;

  private selectionHandlers = new Set<(s: DocumentSelection) => void>();

  constructor(private options: EpubAdapterOptions = {}) {}

  async load(source: string | ArrayBuffer | Record<string, unknown>): Promise<void> {
    this.destroy();
    const ePub = (await import("epubjs")).default as unknown as (
      src: unknown,
      opts?: unknown,
    ) => BookType;
    let book: BookType;
    if (typeof source === "string") {
      book = ePub(source);
    } else if (source instanceof ArrayBuffer) {
      book = ePub(source);
    } else if (source && typeof source === "object" && "url" in source && typeof (source as { url: unknown }).url === "string") {
      book = ePub((source as { url: string }).url);
    } else {
      book = ePub(source as never);
    }
    this.book = book;
    await book.ready;
  }

  async render(container: HTMLElement): Promise<void> {
    if (!this.book) throw new Error("EpubAdapter: load() must be called before render()");
    const rendition = this.book.renderTo(container, {
      width: this.options.width ?? "100%",
      height: this.options.height ?? "100%",
      flow: this.options.flow ?? "paginated",
    });
    this.rendition = rendition;
    // Forward selections.
    rendition.on("selected", (cfiRange: string, contents: unknown) => {
      const text = this.extractText(cfiRange);
      const selection: DocumentSelection = {
        format: "epub",
        position: { format: "epub", cfiRange },
        content: text ? { text } : undefined,
      };
      this.selectionHandlers.forEach((h) => h(selection));
    });
    await rendition.display();
  }

  destroy(): void {
    if (this.rendition) {
      try {
        this.rendition.destroy();
      } catch {
        /* ignore */
      }
      this.rendition = null;
    }
    if (this.book) {
      try {
        this.book.destroy();
      } catch {
        /* ignore */
      }
      this.book = null;
    }
  }

  async next(): Promise<void> {
    await this.rendition?.next();
  }

  async prev(): Promise<void> {
    await this.rendition?.prev();
  }

  async display(target?: string | number): Promise<void> {
    if (!this.rendition) return;
    await this.rendition.display(target as never);
  }

  currentLocation(): { page?: number; cfi?: string; percentage?: number } | null {
    const loc = this.rendition?.location;
    if (!loc) return null;
    return {
      cfi: loc.start?.cfi,
      percentage: loc.start?.percentage,
    };
  }

  onSelection(handler: (selection: DocumentSelection) => void): () => void {
    this.selectionHandlers.add(handler);
    return () => {
      this.selectionHandlers.delete(handler);
    };
  }

  addHighlight(position: DocumentPosition, style?: Record<string, string>): string {
    const cfi = position.cfiRange;
    if (!cfi || !this.rendition) return "";
    const className = "epub-highlight";
    this.rendition.annotations.highlight(cfi, {}, (e: Event) => {
      /* click handler placeholder */
    }, className, style ?? { fill: "yellow", "fill-opacity": "0.3", mixBlendMode: "multiply" });
    return cfi;
  }

  removeHighlight(handle: string): void {
    if (!this.rendition || !handle) return;
    try {
      this.rendition.annotations.remove(handle, "highlight");
    } catch {
      /* ignore */
    }
  }

  annotate(
    type: string,
    cfiRange: string,
    data?: Record<string, unknown>,
    styles?: Record<string, string | number>,
  ): string {
    if (!this.rendition || !cfiRange) return "";
    const t = type || "highlight";
    const className = `epub-${t}`;
    const cb = () => {
      /* annotation interaction placeholder */
    };
    const defaultStyles: Record<string, string | number> =
      t === "underline"
        ? { stroke: "blue", "stroke-opacity": 0.8 }
        : t === "note"
          ? { fill: "rgba(255, 200, 100, 0.4)" }
          : { fill: "rgba(255, 226, 143, 0.5)", "fill-opacity": 0.4, mixBlendMode: "multiply" };
    try {
      if (t === "underline") {
        this.rendition.annotations.underline(cfiRange, data ?? {}, cb, className, styles ?? defaultStyles);
      } else if (t === "mark") {
        this.rendition.annotations.mark(cfiRange, data ?? {}, cb);
      } else {
        this.rendition.annotations.highlight(cfiRange, data ?? {}, cb, className, styles ?? defaultStyles);
      }
    } catch {
      /* ignore */
    }
    return cfiRange;
  }

  removeAnnotation(cfiRange: string, type: string): void {
    if (!this.rendition || !cfiRange) return;
    const t = type === "underline" ? "underline" : type === "mark" ? "mark" : "highlight";
    try {
      this.rendition.annotations.remove(cfiRange, t);
    } catch {
      /* ignore */
    }
  }

  async getOutline(): Promise<unknown[]> {
    if (!this.book) return [];
    try {
      const toc = await this.book.loaded.navigation;
      return (toc as { toc?: unknown[] })?.toc ?? [];
    } catch {
      return [];
    }
  }

  async search(query: string): Promise<Array<{ cfi?: string; excerpt?: string; href?: string }>> {
    if (!this.book || !query) return [];
    const results: Array<{ cfi?: string; excerpt?: string; href?: string }> = [];
    const spine = (this.book.spine as { spineItems?: Array<{ href: string; load: (fn: (u: string) => Promise<unknown>) => Promise<unknown>; unload: () => void; find: (q: string) => Array<{ cfi: string; excerpt: string }> }> }).spineItems ?? [];
    for (const item of spine) {
      try {
        await item.load(this.book.load.bind(this.book));
        const matches = item.find(query) ?? [];
        for (const m of matches) {
          results.push({ cfi: m.cfi, excerpt: m.excerpt, href: item.href });
        }
        item.unload();
      } catch {
        try {
          item.unload();
        } catch {
          /* ignore */
        }
      }
    }
    return results;
  }

  setStyles(styles: Record<string, string | number>): void {
    if (!this.rendition) return;
    try {
      const themes = this.rendition.themes as {
        fontSize?: (size: string) => void;
        fontFamily?: (name: string) => void;
        register?: (name: string, styles: Record<string, unknown>) => void;
        select?: (name: string) => void;
      };
      if (styles.fontSize != null && typeof themes.fontSize === "function") {
        themes.fontSize(String(styles.fontSize));
      }
      if (styles.fontFamily != null && typeof themes.fontFamily === "function") {
        themes.fontFamily(String(styles.fontFamily));
      }
      const css: Record<string, unknown> = {};
      if (styles.lineHeight != null) css["line-height"] = styles.lineHeight;
      if (styles.color != null) css.color = styles.color;
      if (styles.background != null) css.background = styles.background;
      if (Object.keys(css).length) {
        themes.register?.("custom", css);
        themes.select?.("custom");
      }
    } catch {
      /* ignore */
    }
  }

  injectCss(css: string): void {
    if (!this.rendition) return;
    try {
      // Inject into every (current and future) section document.
      const hook = (contents: { document?: Document }) => {
        const doc = contents?.document;
        if (!doc?.head) return;
        const style = doc.createElement("style");
        style.textContent = css;
        doc.head.appendChild(style);
      };
      this.rendition.hooks.content.register(hook);
      // Also inject into currently rendered views.
      const views = (this.rendition as { views?: () => Array<{ document?: Document }> }).views?.() ?? [];
      for (const v of views) {
        const doc = v.document;
        if (!doc?.head) continue;
        const style = doc.createElement("style");
        style.textContent = css;
        doc.head.appendChild(style);
      }
    } catch {
      /* ignore */
    }
  }

  private extractText(cfiRange: string): string | undefined {
    if (!this.rendition) return undefined;
    try {
      const range = this.rendition.getRange(cfiRange);
      return range?.toString();
    } catch {
      return undefined;
    }
  }
}
