import React, {
  ReactNode,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { EpubAdapter } from "../adapters/EpubAdapter";
import { BrowserEpubEngine } from "../adapters/BrowserEpubEngine";
import { ReaderController } from "../reader/ReaderController";
import { ReaderFailure } from "../reader/errors";
import type { ReaderState, ReaderConfiguration } from "../reader/types";
import { EpubReaderStatus } from "./EpubReaderStatus";
import type { DocumentAdapter } from "../core/types";
import type {
  DocumentHighlight,
  DocumentHighlighterProps,
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
  onStateChange?: (state: ReaderState) => void;
  /** Replace the default error presentation, or return null to render none. */
  renderStatus?: (state: ReaderState, retry: () => void) => ReactNode;
}

export interface EpubHighlighterHandle {
  adapter: EpubAdapter | null;
  /** Portable, asynchronous reader commands and structured state. */
  reader: ReaderController | null;
  retry: () => Promise<void>;
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
    onStateChange,
    renderStatus,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [adapter, setAdapter] = useState<EpubAdapter | null>(null);
  const [reader, setReader] = useState<ReaderController | null>(null);
  const [readerState, setReaderState] = useState<ReaderState>({
    status: "idle",
    error: null,
    location: null,
  });
  const [tip, setTip] = useState<ReactNode>(null);
  const callbacks = useRef({ onReady, onError, onSelection, onStateChange });
  callbacks.current = { onReady, onError, onSelection, onStateChange };
  const configuration: ReaderConfiguration = useMemo(
    () => ({ highlights, styles, customCss, features }),
    [highlights, styles, customCss, features],
  );
  const latestConfiguration = useRef(configuration);
  latestConfiguration.current = configuration;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let engine: BrowserEpubEngine;
    const controller = new ReaderController(() => {
      engine = new BrowserEpubEngine(container, { flow, width, height });
      return engine;
    });
    const off = controller.subscribe(() => {
      const state = controller.getState();
      setReaderState(state);
      callbacks.current.onStateChange?.(state);
      if (state.status === "ready") setAdapter(engine.adapter);
      else if (state.status === "loading" || state.status === "error")
        setAdapter(null);
      if (state.error)
        callbacks.current.onError?.(new ReaderFailure(state.error));
    });
    const offSelection = controller.onSelection((selection) =>
      callbacks.current.onSelection?.({
        ...selection,
        hide: () => engine.adapter.clearSelection(),
      }),
    );
    setReader(controller);
    setTip(null);
    void controller.configure(latestConfiguration.current);
    void controller.load(source);
    return () => {
      off();
      offSelection();
      controller.dispose();
      setReader(null);
      setAdapter(null);
    };
  }, [source, flow, width, height]);

  useEffect(() => {
    if (reader) void reader.configure(configuration).catch(() => undefined);
  }, [reader, configuration]);
  const scrollToHighlight = (highlight: DocumentHighlight) => {
    if (highlight.position.format === "epub" && highlight.position.cfiRange)
      void reader?.display(highlight.position.cfiRange).catch(() => undefined);
  };
  useImperativeHandle(
    ref,
    () => ({
      adapter,
      reader,
      retry: async () => reader?.retry(),
      next: async () => {
        await reader?.next();
      },
      prev: async () => {
        await reader?.prev();
      },
      display: async (target) => {
        await reader?.display(target);
      },
      search: async (query) => (reader ? reader.search(query) : []),
      getOutline: async () => (reader ? reader.getOutline() : []),
      // Preserve the legacy synchronous browser methods. Portable consumers use reader.
      setStyles: (value) =>
        adapter?.setStyles(value as Record<string, string | number>),
      injectCss: (css) => adapter?.injectCss(css),
      annotate: (type, cfi, data, annotationStyles) =>
        adapter && features?.highlight !== false
          ? adapter.annotate(type, cfi, data, annotationStyles)
          : "",
      removeAnnotation: (cfi, type) => adapter?.removeAnnotation(cfi, type),
    }),
    [adapter, reader, features?.highlight],
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
        {renderStatus ? (
          renderStatus(readerState, () => {
            void reader?.retry();
          })
        ) : (
          <EpubReaderStatus
            state={readerState}
            retry={() => {
              void reader?.retry();
            }}
          />
        )}
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
