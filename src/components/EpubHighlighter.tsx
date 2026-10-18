import React, {
  ReactNode,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useRef,
  useState,
} from "react";
import { EpubAdapter } from "../adapters/EpubAdapter";
import type { DocumentAdapter } from "../core/types";
import type {
  DocumentHighlight,
  DocumentHighlighterProps,
  DocumentSelection,
} from "../core/types";
import { DocumentHighlighterContext } from "../core/DocumentContext";

export interface EpubHighlighterStyleOptions {
  fontSize?: number | string;
  fontFamily?: string;
  lineHeight?: number | string;
  color?: string;
  background?: string;
}

export interface EpubHighlighterFeatures {
  highlight?: boolean;
  search?: boolean;
  navigation?: boolean;
  outline?: boolean;
}

export interface EpubHighlighterProps<H extends DocumentHighlight = DocumentHighlight>
  extends DocumentHighlighterProps<H> {
  /** epub.js flow mode. */
  flow?: string;
  /** Width passed to epub.js rendition. */
  width?: number | string;
  /** Height passed to epub.js rendition. */
  height?: number | string;
  /** Typography/theme styling. */
  styles?: EpubHighlighterStyleOptions;
  /** Raw CSS injected into the rendered EPUB document. */
  customCss?: string;
  /** Feature toggles. All enabled by default. */
  features?: EpubHighlighterFeatures;
}

export interface EpubHighlighterHandle {
  adapter: EpubAdapter | null;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  display: (target?: string | number) => Promise<void>;
  search: (query: string) => Promise<Array<{ cfi?: string; excerpt?: string; href?: string }>>;
  getOutline: () => Promise<unknown[]>;
  setStyles: (styles: EpubHighlighterStyleOptions) => void;
  injectCss: (css: string) => void;
  annotate: (type: string, cfiRange: string, data?: Record<string, unknown>, styles?: Record<string, string | number>) => string;
  removeAnnotation: (cfiRange: string, type: string) => void;
}

/**
 * EPUB viewer + highlighter built on top of the format-agnostic
 * {@link DocumentAdapter} contract. Supports typography/CSS customization,
 * search, navigation, and outline via the exposed handle and context.
 */
export const EpubHighlighter = forwardRef<
  EpubHighlighterHandle,
  EpubHighlighterProps<DocumentHighlight>
>(function EpubHighlighter(props, ref) {
  const {
    source,
    highlights,
    onSelection,
    children,
    className,
    style,
    flow,
    width,
    height,
    styles,
    customCss,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<EpubAdapter | null>(null);
  const [adapter, setAdapter] = useState<EpubAdapter | null>(null);
  const [tip, setTip] = useState<ReactNode>(null);
  const handlesRef = useRef<Map<string, string>>(new Map());

  // Load + render on mount / source change.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    const adapter = new EpubAdapter({ flow, width, height });
    adapterRef.current = adapter;
    (async () => {
      try {
        await adapter.load(source);
        if (cancelled) return;
        await adapter.render(el);
        if (cancelled) return;
        setAdapter(adapter);
        if (styles) adapter.setStyles(styles as Record<string, string | number>);
        if (customCss) adapter.injectCss(customCss);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("EpubHighlighter load/render failed", err);
      }
    })();
    return () => {
      cancelled = true;
      handlesRef.current.clear();
      adapter.destroy();
      adapterRef.current = null;
      setAdapter(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, flow, width, height]);

  // Apply style changes.
  useEffect(() => {
    if (!adapter || !styles) return;
    adapter.setStyles(styles as Record<string, string | number>);
  }, [adapter, styles]);

  useEffect(() => {
    if (!adapter || !customCss) return;
    adapter.injectCss(customCss);
  }, [adapter, customCss]);

  // Forward selections.
  useEffect(() => {
    if (!adapter) return;
    const unsub = adapter.onSelection((sel: DocumentSelection) => {
      onSelection?.(sel);
    });
    return unsub;
  }, [adapter, onSelection]);

  // Sync highlights -> rendition annotations.
  useEffect(() => {
    if (!adapter) return;
    const handles = handlesRef.current;
    const nextIds = new Set(highlights.map((h) => h.id));

    for (const [id, handle] of handles) {
      if (!nextIds.has(id)) {
        adapter.removeHighlight(handle);
        handles.delete(id);
      }
    }
    for (const h of highlights) {
      if (handles.has(h.id)) continue;
      const handle = adapter.addHighlight(h.position, {
        fill: "rgba(255, 226, 143, 0.5)",
      });
      handles.set(h.id, handle);
    }
  }, [adapter, highlights]);

  const scrollToHighlight = (highlight: DocumentHighlight) => {
    if (!adapter) return;
    const cfi = highlight.position.cfiRange;
    if (cfi) {
      adapter.display(cfi).catch(() => undefined);
    }
  };

  useImperativeHandle(ref, () => ({
    adapter,
    next: async () => {
      await adapter?.next();
    },
    prev: async () => {
      await adapter?.prev();
    },
    display: async (target) => {
      await adapter?.display(target);
    },
    search: async (query) => (adapter ? adapter.search(query) : []),
    getOutline: async () => (adapter ? adapter.getOutline() ?? [] : []),
    setStyles: (s) => adapter?.setStyles(s as Record<string, string | number>),
    injectCss: (css) => adapter?.injectCss(css),
    annotate: (type, cfi, data, styles) => (adapter ? adapter.annotate(type, cfi, data, styles) : ""),
    removeAnnotation: (cfi, type) => adapter?.removeAnnotation(cfi, type),
  }), [adapter]);

  const ctxValue = {
    adapter: adapter as DocumentAdapter | null,
    highlights,
    scrollToHighlight,
    setTip: (content: ReactNode) => setTip(content),
    clearTip: () => setTip(null),
  };

  return (
    <DocumentHighlighterContext.Provider value={ctxValue}>
      <div
        className={className}
        style={{ position: "relative", width: "100%", height: "100%", ...style }}
      >
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
        {tip ? (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 50,
              background: "white",
              padding: 8,
              borderRadius: 6,
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            {tip}
          </div>
        ) : null}
        {children}
      </div>
    </DocumentHighlighterContext.Provider>
  );
});
