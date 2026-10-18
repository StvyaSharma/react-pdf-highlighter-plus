import type {
  Book as BookType,
  Contents,
  Rendition as RenditionType,
} from "epubjs";
import type {
  DocumentAdapter,
  DocumentPosition,
  DocumentSelection,
} from "../core/types";

export interface EpubAdapterOptions {
  width?: number | string;
  height?: number | string;
  flow?: string;
}

export class EpubAdapter implements DocumentAdapter {
  readonly format = "epub";

  private book: BookType | null = null;
  private rendition: RenditionType | null = null;
  private generation = 0;
  // epub.js cannot safely destroy a book while open/render/search is using it.
  private pending = new Map<BookType, number>();
  private css = "";
  private appliedStyles = new Set<string>();
  private selectionHandlers = new Set<(s: DocumentSelection) => void>();

  constructor(private options: EpubAdapterOptions = {}) {}

  private async useBook<T>(
    book: BookType,
    operation: () => Promise<T>,
  ): Promise<T> {
    this.pending.set(book, (this.pending.get(book) ?? 0) + 1);
    try {
      return await operation();
    } finally {
      const remaining = (this.pending.get(book) ?? 1) - 1;
      if (remaining) this.pending.set(book, remaining);
      else {
        this.pending.delete(book);
        if (this.book !== book) book.destroy();
      }
    }
  }

  async load(
    source: string | ArrayBuffer | Record<string, unknown>,
  ): Promise<void> {
    this.destroy();
    const generation = this.generation;
    const { default: ePub } = await import("epubjs");
    if (generation !== this.generation) return;
    const { url, ...options } =
      typeof source === "object" && !(source instanceof ArrayBuffer)
        ? source
        : { url: source };
    if (
      !(url instanceof ArrayBuffer) &&
      (typeof url !== "string" || !url.trim())
    ) {
      throw new Error(
        "EpubAdapter: source must be a URL, ArrayBuffer, or { url, ...options }",
      );
    }
    // Calling open explicitly propagates network/parsing failures. book.ready
    // alone never rejects when opening fails in epub.js 0.3.
    const book = ePub(options);
    this.book = book;
    try {
      await this.useBook(book, async () => {
        if (url instanceof ArrayBuffer) await book.open(url);
        else
          await book.open(
            url,
            typeof options.openAs === "string" ? options.openAs : undefined,
          );
        await book.ready;
      });
    } catch (error) {
      if (this.book === book) this.destroy();
      throw error;
    }
  }

  async render(container: HTMLElement): Promise<void> {
    const book = this.book;
    if (!book)
      throw new Error("EpubAdapter: load() must be called before render()");
    if (this.rendition) throw new Error("EpubAdapter: already rendered");
    await this.useBook(book, async () => {
      const rendition = book.renderTo(container, {
        width: this.options.width ?? "100%",
        height: this.options.height ?? "100%",
        flow: this.options.flow ?? "paginated",
      });
      this.rendition = rendition;
      rendition.hooks.content.register(this.applyCss);
      // Annotations are reattached by epub.js's earlier render hook.
      rendition.hooks.render.register(this.decorateMarks);
      rendition.on("selected", (cfiRange: string, contents: Contents) => {
        if (this.rendition !== rendition) return;
        const selection: DocumentSelection = {
          format: "epub",
          position: { format: "epub", cfiRange },
          content: { text: contents.range(cfiRange).toString() },
          hide: () => contents.window.getSelection()?.removeAllRanges(),
        };
        this.selectionHandlers.forEach((handler) => handler(selection));
      });
      await rendition.display();
    });
  }

  destroy(): void {
    this.generation += 1;
    const book = this.book;
    this.book = null;
    this.rendition = null;
    this.css = "";
    this.appliedStyles.clear();
    // Book.destroy also destroys its rendition; don't destroy it twice.
    if (book && !this.pending.has(book)) book.destroy();
  }

  async next(): Promise<void> {
    const book = this.book;
    const rendition = this.rendition;
    if (book && rendition) await this.useBook(book, () => rendition.next());
  }

  async prev(): Promise<void> {
    const book = this.book;
    const rendition = this.rendition;
    if (book && rendition) await this.useBook(book, () => rendition.prev());
  }

  async display(target?: string | number): Promise<void> {
    const book = this.book;
    const rendition = this.rendition;
    if (book && rendition)
      await this.useBook(book, () => rendition.display(target as string));
  }

  currentLocation(): {
    page?: number;
    cfi?: string;
    percentage?: number;
  } | null {
    const loc = this.rendition?.location;
    if (!loc) return null;
    return {
      cfi: loc.start?.cfi,
      percentage: loc.start?.percentage,
      page: loc.start?.displayed?.page,
    };
  }

  onSelection(handler: (selection: DocumentSelection) => void): () => void {
    this.selectionHandlers.add(handler);
    return () => {
      this.selectionHandlers.delete(handler);
    };
  }

  addHighlight(
    position: DocumentPosition,
    style?: Record<string, string>,
  ): string {
    if (position.format !== "epub" || !position.cfiRange || !this.rendition)
      return "";
    return this.annotate("highlight", position.cfiRange, {}, style);
  }

  removeHighlight(handle: string): void {
    this.removeAnnotation(handle, "highlight");
  }

  annotate(
    type: string,
    cfiRange: string,
    data?: Record<string, unknown>,
    styles?: Record<string, string | number>,
  ): string {
    if (!this.rendition || !cfiRange) return "";
    const t = type || "highlight";
    if (!["highlight", "text", "underline", "mark", "note"].includes(t)) {
      throw new Error(`EpubAdapter: unsupported annotation type "${t}"`);
    }
    // epub.js keys annotations by CFI + type. Remove before replacing to avoid
    // leaving an orphaned SVG mark in the current view.
    this.removeAnnotation(cfiRange, t);
    if (t === "underline") {
      this.rendition.annotations.underline(
        cfiRange,
        data ?? {},
        undefined,
        "epub-underline",
        {
          stroke: "blue",
          "stroke-opacity": 0.8,
          ...styles,
        },
      );
    } else if (t === "mark") {
      this.rendition.annotations.mark(cfiRange, data ?? {});
      this.rendition
        .views()
        .forEach((view) =>
          this.decorateMarks(view as unknown as { element: HTMLElement }),
        );
    } else {
      this.rendition.annotations.highlight(
        cfiRange,
        data ?? {},
        undefined,
        `epub-${t}`,
        {
          fill: "yellow",
          "fill-opacity": 0.3,
          "mix-blend-mode": "multiply",
          ...styles,
        },
      );
    }
    return cfiRange;
  }

  removeAnnotation(cfiRange: string, type: string): void {
    if (!this.rendition || !cfiRange) return;
    const t =
      type === "underline"
        ? "underline"
        : type === "mark"
          ? "mark"
          : "highlight";
    this.rendition.annotations.remove(cfiRange, t);
  }

  async getOutline(): Promise<unknown[]> {
    const book = this.book;
    if (!book) return [];
    const navigation = await book.loaded.navigation;
    return this.book === book ? navigation.toc : [];
  }

  async search(
    query: string,
  ): Promise<Array<{ cfi?: string; excerpt?: string; href?: string }>> {
    const book = this.book;
    if (!book || !query.trim()) return [];
    return this.useBook(book, async () => {
      const results: Array<{ cfi?: string; excerpt?: string; href?: string }> =
        [];
      // Don't load/unload the live spine sections: concurrent searches and
      // navigation use them too. Search isolated section documents instead.
      const items: Array<{ href: string; constructor: Function }> = [];
      book.spine.each((item: { href: string; constructor: Function }) =>
        items.push(item),
      );
      for (const item of items) {
        if (this.book !== book) return [];
        // Reuse epub.js's Section constructor without importing a second copy
        // of the renderer. Its published Section declarations are incomplete.
        const Section = item.constructor as new (item: unknown) => {
          load(request: Function): Promise<unknown>;
          find(query: string): Array<{ cfi: string; excerpt: string }>;
          destroy(): void;
        };
        const section = new Section(item);
        try {
          await section.load(book.load.bind(book));
          for (const match of section.find(query.trim())) {
            results.push({ ...match, href: item.href });
          }
        } finally {
          section.destroy();
        }
      }
      return this.book === book ? results : [];
    });
  }

  /** Replace reader overrides, including removal of previously applied props. */
  setStyles(styles: Record<string, string | number>): void {
    const themes = this.rendition?.themes;
    if (!themes) return;
    const css: Record<string, string> = {};
    for (const [key, property] of Object.entries({
      fontSize: "font-size",
      fontFamily: "font-family",
      lineHeight: "line-height",
      color: "color",
      background: "background",
    })) {
      const value = styles[key];
      if (value != null)
        css[property] =
          key === "fontSize" && typeof value === "number"
            ? `${value}px`
            : String(value);
    }
    // removeOverride exists in epub.js but is missing from its declarations.
    const removable = themes as typeof themes & {
      removeOverride(name: string): void;
    };
    for (const property of this.appliedStyles) {
      if (!(property in css)) removable.removeOverride(property);
    }
    for (const [property, value] of Object.entries(css))
      themes.override(property, value, true);
    this.appliedStyles = new Set(Object.keys(css));
  }

  /** Replace custom CSS in both current and future section documents. */
  injectCss(css: string): void {
    this.css = css;
    // getContents() returns Contents[] at runtime (the published typings say
    // Contents). views() is a Views collection, not an iterable array.
    const contents = (this.rendition?.getContents() ??
      []) as unknown as Contents[];
    for (const content of contents) this.applyCss(content);
  }

  private applyCss = ({ document: doc }: { document: Document }): void => {
    let style = doc.querySelector<HTMLStyleElement>(
      "style[data-epub-reader-css]",
    );
    if (!this.css) {
      style?.remove();
      return;
    }
    if (!style) {
      style = doc.createElement("style");
      style.dataset.epubReaderCss = "";
      doc.head.appendChild(style);
    }
    style.textContent = this.css;
  };

  private decorateMarks = ({ element }: { element: HTMLElement }): void => {
    // epub.js creates empty anchors outside the iframe; they need visible
    // content and sizing in the host document to be usable.
    for (const mark of Array.from(
      element.querySelectorAll<HTMLAnchorElement>('[ref="epubjs-mk"]'),
    )) {
      if (mark.hasAttribute("aria-label")) continue;
      mark.textContent = "●";
      mark.setAttribute("aria-label", mark.dataset.note || "EPUB annotation");
      mark.title = mark.getAttribute("aria-label")!;
      mark.tabIndex = 0;
      mark.setAttribute("role", "button");
      Object.assign(mark.style, {
        display: "inline-flex",
        width: "18px",
        height: "18px",
        color: "#2563eb",
        fontSize: "18px",
        lineHeight: "18px",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        zIndex: "2",
      });
      mark.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          mark.click();
        }
      });
    }
  };
}
