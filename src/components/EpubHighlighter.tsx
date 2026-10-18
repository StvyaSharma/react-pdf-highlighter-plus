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

export interface EpubHighlighterProps<
  H extends DocumentHighlight = DocumentHighlight,
> extends DocumentHighlighterProps<H> {
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
  /** Called once the document is displayed and the adapter is ready. */
  onReady?: (adapter: EpubAdapter) => void;
  /** Loading and rendering errors are also shown in an accessible alert. */
  onError?: (error: Error) => void;
}

export interface EpubHighlighterHandle {
  adapter: EpubAdapter | null;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  display: (target?: string | number) => Promise<void>;
  search: (
    query: string,
  ) => Promise<Array<{ cfi?: string; excerpt?: string; href?: string }>>;
  getOutline: () => Promise<unknown[]>;
  setStyles: (styles: EpubHighlighterStyleOptions) => void;
  injectCss: (css: string) => void;
  annotate: (
    type: string,
    cfiRange: string,
    data?: Record<string, unknown>,
    styles?: Record<string, string | number>,
  ) => string;
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
    features,
    onReady,
    onError,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [adapter, setAdapter] = useState<EpubAdapter | null>(null);
  const [tip, setTip] = useState<ReactNode>(null);
  const [error, setError] = useState<Error | null>(null);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  const handlesRef = useRef<
    Map<string, { cfi: string; type: string; signature: string }>
  >(new Map());
  const highlightEnabled = features?.highlight !== false;
  const navigationEnabled = features?.navigation !== false;
  const searchEnabled = features?.search !== false;
  const outlineEnabled = features?.outline !== false;

  // Load + render on mount / source change.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    // Give each async render its own host so a superseded render cannot
    // append stale iframes into the next document (including in StrictMode).
    const host = document.createElement("div");
    host.style.cssText = "width:100%;height:100%";
    el.appendChild(host);
    const adapter = new EpubAdapter({ flow, width, height });
    setError(null);
    setTip(null);
    (async () => {
      try {
        await adapter.load(source);
        if (cancelled) return;
        await adapter.render(host);
        if (cancelled) return;
        setAdapter(adapter);
      } catch (err) {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error(String(err));
        adapter.destroy();
        host.replaceChildren();
        setError(error);
        callbacks.current.onError?.(error);
      }
    })();
    return () => {
      cancelled = true;
      handlesRef.current.clear();
      adapter.destroy();
      host.remove();
      setAdapter(null);
    };
  }, [source, flow, width, height]);

  // Apply style changes.
  useEffect(() => {
    if (!adapter) return;
    adapter.setStyles((styles ?? {}) as Record<string, string | number>);
  }, [adapter, styles]);

  useEffect(() => {
    if (!adapter) return;
    adapter.injectCss(customCss ?? "");
  }, [adapter, customCss]);

  // Forward selections.
  useEffect(() => {
    if (!adapter || !highlightEnabled) return;
    const unsub = adapter.onSelection((sel: DocumentSelection) => {
      onSelection?.(sel);
    });
    return unsub;
  }, [adapter, onSelection, highlightEnabled]);

  // Sync highlights -> rendition annotations.
  useEffect(() => {
    if (!adapter) return;
    const handles = handlesRef.current;
    const desired = new Map<
      string,
      { highlight: DocumentHighlight; type: string; signature: string }
    >();
    for (const highlight of highlightEnabled ? highlights : []) {
      if (highlight.position.format !== "epub" || !highlight.position.cfiRange)
        continue;
      const type =
        highlight.type === "text" || !highlight.type
          ? "highlight"
          : highlight.type;
      // Notes use epub.js's highlight primitive and share its CFI/type key.
      const key = `${type === "note" ? "highlight" : type}:${highlight.position.cfiRange}`;
      desired.set(key, {
        highlight,
        type,
        signature: JSON.stringify(highlight),
      });
    }
    for (const [key, handle] of handles) {
      if (desired.get(key)?.signature !== handle.signature) {
        adapter.removeAnnotation(handle.cfi, handle.type);
        handles.delete(key);
      }
    }
    for (const [key, { highlight, type, signature }] of desired) {
      if (handles.has(key)) continue;
      const cfi = adapter.annotate(
        type,
        highlight.position.cfiRange!,
        highlight.content,
      );
      if (cfi) handles.set(key, { cfi, type, signature });
    }
  }, [adapter, highlights, highlightEnabled]);

  const scrollToHighlight = (highlight: DocumentHighlight) => {
    if (!adapter || !navigationEnabled) return;
    const cfi = highlight.position.cfiRange;
    if (cfi) {
      adapter.display(cfi).catch(() => undefined);
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      adapter,
      next: async () => {
        if (navigationEnabled) await adapter?.next();
      },
      prev: async () => {
        if (navigationEnabled) await adapter?.prev();
      },
      display: async (target) => {
        if (navigationEnabled) await adapter?.display(target);
      },
      search: async (query) =>
        adapter && searchEnabled ? adapter.search(query) : [],
      getOutline: async () =>
        adapter && outlineEnabled ? adapter.getOutline() : [],
      setStyles: (s) =>
        adapter?.setStyles(s as Record<string, string | number>),
      injectCss: (css) => adapter?.injectCss(css),
      annotate: (type, cfi, data, styles) =>
        adapter && highlightEnabled
          ? adapter.annotate(type, cfi, data, styles)
          : "",
      removeAnnotation: (cfi, type) => adapter?.removeAnnotation(cfi, type),
    }),
    [
      adapter,
      navigationEnabled,
      searchEnabled,
      outlineEnabled,
      highlightEnabled,
    ],
  );

  // Run after the handle and controlled styles/annotations have been synced.
  useEffect(() => {
    if (adapter) callbacks.current.onReady?.(adapter);
  }, [adapter]);

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
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          ...style,
        }}
      >
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
        {error ? (
          <div
            role="alert"
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              right: 8,
              padding: 12,
              background: "white",
              color: "#b91c1c",
            }}
          >
            Unable to open EPUB: {error.message}
          </div>
        ) : null}
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
