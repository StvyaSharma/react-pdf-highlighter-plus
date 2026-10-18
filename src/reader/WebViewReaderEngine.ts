import { ReaderFailure } from "./errors";
import {
  bufferToBase64,
  parseMessage,
  READER_PROTOCOL,
  type BridgeMethod,
  type BridgeRequest,
} from "./protocol";
import type {
  ReaderConfiguration,
  ReaderEngine,
  ReaderError,
  ReaderEvent,
  ReaderLocation,
  ReaderOutlineItem,
  ReaderSearchResult,
  ReaderSource,
} from "./types";

let sequence = 0;
export class WebViewBridgeClient {
  private session = `reader-${Date.now()}-${++sequence}`;
  private nextId = 0;
  private disposed = false;
  private listeners = new Set<(event: ReaderEvent) => void>();
  private pending = new Map<
    string,
    {
      resolve(value: unknown): void;
      reject(error: unknown): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private send: (script: string) => void,
    readonly bootId: string,
    private timeoutMs = 30000,
  ) {}
  request<T>(method: BridgeMethod, args: unknown[] = []): Promise<T> {
    if (this.disposed)
      return Promise.reject(
        new ReaderFailure({
          code: "DISCONNECTED",
          message: "The WebView was disconnected",
          retryable: true,
        }),
      );
    return new Promise<T>((resolve, reject) => {
      const id = String(++this.nextId);
      const request: BridgeRequest = {
        protocol: READER_PROTOCOL,
        type: "request",
        bootId: this.bootId,
        session: this.session,
        id,
        method,
        args,
      };
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new ReaderFailure({
            code: "BRIDGE_TIMEOUT",
            message: `Reader command timed out: ${method}`,
            retryable: true,
            operation: method,
          }),
        );
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      try {
        // Double serialization keeps document text out of executable syntax.
        const payload = JSON.stringify(request);
        this.send(
          `window.__EPUB_READER_RECEIVE__(${JSON.stringify(payload)});true;`,
        );
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  receive(raw: string): void {
    const message = parseMessage(raw);
    if (
      !message ||
      message.bootId !== this.bootId ||
      message.session !== this.session ||
      this.disposed
    )
      return;
    if (message.type === "event") {
      const event = message.event as ReaderEvent | undefined;
      if (
        event?.type === "location" &&
        event.location &&
        typeof event.location === "object"
      )
        this.listeners.forEach((listener) => listener(event));
      else if (
        event?.type === "selection" &&
        event.selection?.format === "epub" &&
        typeof event.selection.position?.cfiRange === "string"
      )
        this.listeners.forEach((listener) => listener(event));
      return;
    }
    if (message.type !== "response" || typeof message.id !== "string") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (
      message.error &&
      typeof message.error === "object" &&
      typeof (message.error as ReaderError).message === "string"
    )
      pending.reject(new ReaderFailure(message.error as ReaderError));
    else pending.resolve(message.result);
  }
  subscribe(listener: (event: ReaderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  dispose(): void {
    this.disposed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(
        new ReaderFailure({
          code: "DISCONNECTED",
          message: "The WebView was disconnected",
          retryable: true,
        }),
      );
    }
    this.pending.clear();
    this.listeners.clear();
  }
}

/** Remote implementation of exactly the same interface as BrowserEpubEngine. */
export class WebViewReaderEngine implements ReaderEngine {
  constructor(
    private bridge: WebViewBridgeClient,
    private options: { flow?: string } = {},
  ) {}
  open(source: ReaderSource): Promise<void> {
    // JSON cannot carry ArrayBuffers. Encode explicitly; native needs no DOM APIs.
    const serializable =
      source instanceof ArrayBuffer
        ? { base64: bufferToBase64(source) }
        : source;
    return this.bridge.request("open", [serializable, this.options]);
  }
  close(): void {
    void this.bridge.request("close").catch(() => undefined);
  }
  configure(configuration: ReaderConfiguration): Promise<void> {
    return this.bridge.request("configure", [configuration]);
  }
  next(): Promise<void> {
    return this.bridge.request("next");
  }
  prev(): Promise<void> {
    return this.bridge.request("prev");
  }
  display(target?: string | number): Promise<void> {
    return this.bridge.request("display", [target]);
  }
  search(query: string): Promise<ReaderSearchResult[]> {
    return this.bridge.request("search", [query]);
  }
  getOutline(): Promise<ReaderOutlineItem[]> {
    return this.bridge.request("getOutline");
  }
  getLocation(): Promise<ReaderLocation | null> {
    return this.bridge.request("getLocation");
  }
  captureSelection(): Promise<boolean> {
    return this.bridge.request("captureSelection");
  }
  clearSelection(): Promise<void> {
    return this.bridge.request("clearSelection");
  }
  annotate(
    type: string,
    cfi: string,
    data?: Record<string, unknown>,
    styles?: Record<string, string | number>,
  ): Promise<string> {
    return this.bridge.request("annotate", [type, cfi, data, styles]);
  }
  removeAnnotation(cfi: string, type: string): Promise<void> {
    return this.bridge.request("removeAnnotation", [cfi, type]);
  }
  subscribe(listener: (event: ReaderEvent) => void): () => void {
    return this.bridge.subscribe(listener);
  }
}
