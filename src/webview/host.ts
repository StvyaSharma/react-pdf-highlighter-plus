import { BrowserEpubEngine } from "../adapters/BrowserEpubEngine";
import {
  parseMessage,
  READER_PROTOCOL,
  type BridgeRequest,
} from "../reader/protocol";
import { ReaderFailure, readerError } from "../reader/errors";
import type { ReaderConfiguration, ReaderSource } from "../reader/types";

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(data: string): void };
    __EPUB_READER_RECEIVE__?: (raw: string) => void;
    __EPUB_READER_BOOT__?: () => void;
  }
}
const bootId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let engine: BrowserEpubEngine | null = null;
let session = "";
let queue = Promise.resolve();
const post = (message: object) =>
  window.ReactNativeWebView?.postMessage(
    JSON.stringify({ protocol: READER_PROTOCOL, bootId, ...message }),
  );
const container = document.getElementById("reader")!;

function decodeSource(source: unknown): ReaderSource {
  if (
    source &&
    typeof source === "object" &&
    "base64" in source &&
    typeof source.base64 === "string"
  ) {
    const bytes = atob(source.base64);
    return Uint8Array.from(bytes, (character) => character.charCodeAt(0))
      .buffer;
  }
  if (
    typeof source === "string" ||
    (source &&
      typeof source === "object" &&
      "url" in source &&
      typeof source.url === "string")
  )
    return source as ReaderSource;
  throw new Error("Expected an EPUB URL, { url, ...options }, or { base64 }");
}
async function execute(request: BridgeRequest): Promise<unknown> {
  const args = request.args;
  if (request.method === "open") {
    engine?.close();
    engine = null;
    session = request.session;
    const options = args[1] as { flow?: string } | undefined;
    const next = new BrowserEpubEngine(container, { flow: options?.flow });
    engine = next;
    next.subscribe((event) => {
      if (engine === next) post({ type: "event", session, event });
    });
    try {
      await next.open(decodeSource(args[0]));
    } catch (error) {
      next.close();
      engine = null;
      throw new ReaderFailure(readerError(error, "LOAD_FAILED", "load"));
    }
    return null;
  }
  if (request.session !== session) throw new Error("Stale reader session");
  if (request.method === "close") {
    engine?.close();
    engine = null;
    return null;
  }
  if (!engine) throw new Error("The EPUB document is not open");
  switch (request.method) {
    case "configure":
      return engine.configure((args[0] ?? {}) as ReaderConfiguration);
    case "next":
      return engine.next();
    case "prev":
      return engine.prev();
    case "display":
      return engine.display(
        args[0] == null ? undefined : (args[0] as string | number),
      );
    case "search":
      if (typeof args[0] !== "string")
        throw new Error("Expected a search string");
      return engine.search(args[0]);
    case "getOutline":
      return engine.getOutline();
    case "getLocation":
      return engine.getLocation();
    case "captureSelection":
      return engine.captureSelection();
    case "clearSelection":
      return engine.clearSelection();
    case "annotate":
      if (typeof args[0] !== "string" || typeof args[1] !== "string")
        throw new Error("Expected annotation type and CFI");
      return engine.annotate(
        args[0],
        args[1],
        args[2] as Record<string, unknown> | undefined,
        args[3] as Record<string, string | number> | undefined,
      );
    case "removeAnnotation":
      if (typeof args[0] !== "string" || typeof args[1] !== "string")
        throw new Error("Expected CFI and annotation type");
      return engine.removeAnnotation(args[0], args[1]);
    default:
      throw new Error("Unknown reader command");
  }
}
window.__EPUB_READER_RECEIVE__ = (raw) => {
  const value = parseMessage(raw);
  if (
    !value ||
    value.type !== "request" ||
    value.bootId !== bootId ||
    typeof value.id !== "string" ||
    typeof value.session !== "string" ||
    typeof value.method !== "string" ||
    !Array.isArray(value.args)
  )
    return;
  const request = value as unknown as BridgeRequest;
  // One queue preserves mutation ordering across asynchronous WebView messages.
  queue = queue.then(async () => {
    try {
      const result = await execute(request);
      post({
        type: "response",
        session: request.session,
        id: request.id,
        result: result ?? null,
      });
    } catch (error) {
      post({
        type: "response",
        session: request.session,
        id: request.id,
        error: readerError(error, "COMMAND_FAILED", request.method),
      });
    }
  });
};
window.__EPUB_READER_BOOT__ = () => post({ type: "ready" });
window.__EPUB_READER_BOOT__();
