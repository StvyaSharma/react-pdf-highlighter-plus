import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { WebView } from "react-native-webview";
import { ReaderController } from "../reader/ReaderController";
import {
  WebViewBridgeClient,
  WebViewReaderEngine,
} from "../reader/WebViewReaderEngine";
import { readyBootId } from "../reader/protocol";
import type {
  ReaderConfiguration,
  ReaderError,
  ReaderSelection,
  ReaderState,
} from "../reader/types";
import { ReaderFailure } from "../reader/errors";
import { epubReaderHtml } from "./reader-html.generated";
import { ReaderStatus } from "./ReaderStatus";

export type NativeEpubSource =
  | string
  | ArrayBuffer
  | { base64: string }
  | {
      url: string;
      requestHeaders?: Record<string, string>;
      requestCredentials?: boolean;
      openAs?: string;
    };
export interface EpubReaderProps extends ReaderConfiguration {
  source: NativeEpubSource;
  flow?: "paginated" | "scrolled-doc";
  style?: StyleProp<ViewStyle>;
  onReady?: () => void;
  onStateChange?: (state: ReaderState) => void;
  onSelection?: (selection: ReaderSelection) => void;
  onError?: (error: ReaderError) => void;
  renderStatus?: (state: ReaderState, retry: () => void) => React.ReactNode;
  testID?: string;
  /** Limits how long a failed WebView command can keep a caller waiting. */
  commandTimeoutMs?: number;
}
export interface EpubReaderHandle {
  next: ReaderController["next"];
  prev: ReaderController["prev"];
  display: ReaderController["display"];
  search: ReaderController["search"];
  getOutline: ReaderController["getOutline"];
  getLocation: ReaderController["getLocation"];
  captureSelection: ReaderController["captureSelection"];
  clearSelection: ReaderController["clearSelection"];
  annotate: ReaderController["annotate"];
  removeAnnotation: ReaderController["removeAnnotation"];
  configure: ReaderController["configure"];
  retry(): void;
  getState(): ReaderState;
}
interface Session {
  bridge: WebViewBridgeClient;
  reader: ReaderController;
  off(): void;
}
const initialState: ReaderState = {
  status: "loading",
  error: null,
  location: null,
};

/** Native chrome with a bundled, offline EPUB.js renderer inside a WebView. */
export const EpubReader = forwardRef<EpubReaderHandle, EpubReaderProps>(
  function EpubReader(props, ref) {
    const webView = useRef<WebView<{}>>(null);
    const session = useRef<Session | null>(null);
    const latest = useRef(props);
    latest.current = props;
    const [state, setState] = useState<ReaderState>(initialState);
    const [generation, setGeneration] = useState(0);
    const liveGeneration = useRef(0);
    const hostStarted = useRef(false);
    const alive = useRef(true);
    const source = useMemo(
      () => ({ html: epubReaderHtml, baseUrl: "https://epub-reader.invalid/" }),
      [],
    );
    const configuration = useMemo(
      () => ({
        highlights: props.highlights,
        styles: props.styles,
        customCss: props.customCss,
        features: props.features,
      }),
      [props.highlights, props.styles, props.customCss, props.features],
    );
    const disconnect = () => {
      const current = session.current;
      session.current = null;
      if (current) {
        current.off();
        current.reader.dispose();
        current.bridge.dispose();
      }
    };
    const publish = (next: ReaderState) => {
      if (!alive.current) return;
      setState(next);
      latest.current.onStateChange?.(next);
      if (next.error) latest.current.onError?.(next.error);
    };
    const retry = () => {
      disconnect();
      publish(initialState);
      hostStarted.current = false;
      liveGeneration.current += 1;
      setGeneration(liveGeneration.current);
    };
    const currentReader = () => {
      if (!session.current)
        throw new ReaderFailure({
          code: "NOT_READY",
          message: "The reader is not ready",
          retryable: false,
        });
      return session.current.reader;
    };
    useImperativeHandle(
      ref,
      () => ({
        next: async () => currentReader().next(),
        prev: async () => currentReader().prev(),
        display: async (target) => currentReader().display(target),
        search: async (query) => currentReader().search(query),
        getOutline: async () => currentReader().getOutline(),
        getLocation: async () => currentReader().getLocation(),
        captureSelection: async () => currentReader().captureSelection(),
        clearSelection: async () => currentReader().clearSelection(),
        annotate: async (...args) => currentReader().annotate(...args),
        removeAnnotation: async (...args) =>
          currentReader().removeAnnotation(...args),
        configure: async (config) => currentReader().configure(config),
        retry,
        getState: () => session.current?.reader.getState() ?? state,
      }),
      [state],
    );
    useEffect(() => {
      alive.current = true;
      // Reconnect an already-loaded host after StrictMode/Fast Refresh cleanup.
      // A host that is still loading announces itself when its script starts.
      webView.current?.injectJavaScript(
        "window.__EPUB_READER_BOOT__?.();true;",
      );
      return () => {
        alive.current = false;
        disconnect();
      };
    }, []);
    useEffect(() => {
      const timeout = setTimeout(() => {
        if (!hostStarted.current)
          publish({
            status: "error",
            location: null,
            error: {
              code: "BRIDGE_TIMEOUT",
              message: "The EPUB renderer did not start. Retry to reopen it.",
              retryable: true,
            },
          });
      }, props.commandTimeoutMs ?? 30000);
      return () => clearTimeout(timeout);
    }, [generation, props.commandTimeoutMs]);
    useEffect(() => {
      const current = session.current;
      if (current)
        void current.reader.configure(configuration).catch(() => undefined);
    }, [configuration]);
    useEffect(() => {
      const current = session.current;
      if (current) void current.reader.load(props.source);
    }, [props.source, props.flow]);
    const onMessage = (raw: string) => {
      if (generation !== liveGeneration.current || !alive.current) return;
      const boot = readyBootId(raw);
      if (!boot) {
        session.current?.bridge.receive(raw);
        return;
      }
      if (session.current?.bridge.bootId === boot) return;
      hostStarted.current = true;
      disconnect();
      const bridge = new WebViewBridgeClient(
        (script) => {
          if (!webView.current) throw new Error("WebView is unavailable");
          webView.current.injectJavaScript(script);
        },
        boot,
        latest.current.commandTimeoutMs,
      );
      const reader = new ReaderController(
        () => new WebViewReaderEngine(bridge, { flow: latest.current.flow }),
      );
      let wasReady = false;
      const offState = reader.subscribe(() => {
        const next = reader.getState();
        publish(next);
        if (next.status === "loading") wasReady = false;
        if (next.status === "ready" && !wasReady) {
          wasReady = true;
          latest.current.onReady?.();
        }
      });
      const offSelection = reader.onSelection((selection) =>
        latest.current.onSelection?.(selection),
      );
      session.current = {
        bridge,
        reader,
        off: () => {
          offState();
          offSelection();
        },
      };
      void reader.configure({
        highlights: latest.current.highlights,
        styles: latest.current.styles,
        customCss: latest.current.customCss,
        features: latest.current.features,
      });
      void reader.load(latest.current.source);
    };
    const transportError = (message: string) => {
      if (generation !== liveGeneration.current || !alive.current) return;
      disconnect();
      publish({
        status: "error",
        location: null,
        error: { code: "DISCONNECTED", message, retryable: true },
      });
    };
    return (
      <View style={[styles.container, props.style]} testID={props.testID}>
        <WebView<{}>
          key={generation}
          ref={webView}
          source={source}
          style={styles.webview}
          originWhitelist={["*"]}
          javaScriptEnabled
          scrollEnabled={false}
          setSupportMultipleWindows={false}
          allowFileAccess={false}
          mixedContentMode="never"
          onShouldStartLoadWithRequest={(request) =>
            request.isTopFrame === false ||
            request.url === "about:blank" ||
            request.url === "https://epub-reader.invalid/"
          }
          onMessage={(event) => onMessage(event.nativeEvent.data)}
          onError={(event) => transportError(event.nativeEvent.description)}
          onContentProcessDidTerminate={() =>
            transportError(
              "The EPUB renderer stopped. Retry to reopen the document.",
            )
          }
          onRenderProcessGone={() =>
            transportError(
              "The EPUB renderer stopped. Retry to reopen the document.",
            )
          }
          renderError={() => <View />}
        />
        {props.renderStatus ? (
          props.renderStatus(state, retry)
        ) : (
          <ReaderStatus state={state} retry={retry} />
        )}
      </View>
    );
  },
);
const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  webview: { flex: 1, backgroundColor: "transparent" },
});
