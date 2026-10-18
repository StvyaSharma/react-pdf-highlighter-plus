import { test } from "node:test";
import assert from "node:assert/strict";
import { ReaderController } from "../src/reader/ReaderController";
import { ReaderFailure } from "../src/reader/errors";
import { WebViewBridgeClient } from "../src/reader/WebViewReaderEngine";
import {
  bufferToBase64,
  READER_PROTOCOL,
  type BridgeRequest,
} from "../src/reader/protocol";
import { desiredAnnotations } from "../src/reader/annotations";
import type {
  ReaderEngine,
  ReaderEvent,
  ReaderConfiguration,
} from "../src/reader/types";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
class Engine implements ReaderEngine {
  events = new Set<(event: ReaderEvent) => void>();
  configuration: ReaderConfiguration = {};
  closed = false;
  calls: string[] = [];
  opening = Promise.resolve();
  async open() {
    await this.opening;
  }
  close() {
    this.closed = true;
  }
  configure(value: ReaderConfiguration) {
    this.configuration = value;
  }
  async next() {
    this.calls.push("next");
  }
  async prev() {
    this.calls.push("prev");
  }
  async display() {
    this.calls.push("display");
  }
  async search() {
    return [{ cfi: "epubcfi(test)", excerpt: "test" }];
  }
  async getOutline() {
    return [{ id: "one", href: "chapter.xhtml", label: "Chapter" }];
  }
  async getLocation() {
    return { cfi: "epubcfi(test)", page: 1 };
  }
  captureSelection() {
    return true;
  }
  clearSelection() {
    this.calls.push("clear");
  }
  annotate() {
    return "annotation";
  }
  removeAnnotation() {
    this.calls.push("remove");
  }
  subscribe(listener: (event: ReaderEvent) => void) {
    this.events.add(listener);
    return () => {
      this.events.delete(listener);
    };
  }
}
test("controller exposes structured loading/ready state without a DOM", async () => {
  const engine = new Engine(),
    reader = new ReaderController(() => engine),
    states: string[] = [];
  reader.subscribe(() => states.push(reader.getState().status));
  await reader.load("book.epub");
  assert.deepEqual(states, ["loading", "ready"]);
  assert.equal(reader.getState().location?.page, 1);
  assert.equal(typeof globalThis.document, "undefined");
  reader.dispose();
  assert.ok(engine.closed);
});
test("load failure, structured errors, and retry share the same source", async () => {
  let fail = true;
  const reader = new ReaderController(() => {
    if (fail) throw new Error("Unavailable");
    return new Engine();
  });
  await reader.load("book.epub");
  assert.equal(reader.getState().error?.code, "LOAD_FAILED");
  assert.equal(reader.getState().error?.retryable, true);
  fail = false;
  await reader.retry();
  assert.equal(reader.getState().status, "ready");
  reader.dispose();
});
test("stale open and location results cannot overwrite a replacement or disposal", async () => {
  const old = new Engine(),
    gate = deferred();
  old.opening = gate.promise;
  const next = new Engine();
  let count = 0;
  const reader = new ReaderController(() => (count++ ? next : old));
  const loading = reader.load("old");
  await reader.load("new");
  gate.resolve();
  await loading;
  assert.ok(old.closed);
  assert.equal(reader.getState().status, "ready");
  const locationGate = deferred();
  next.getLocation = async () => {
    await locationGate.promise;
    return { cfi: "old" };
  };
  const retry = reader.retry();
  await Promise.resolve();
  await Promise.resolve();
  reader.dispose();
  locationGate.resolve();
  await retry;
  assert.equal(reader.getState().status, "disposed");
});
test("configuration changed while opening is applied before ready", async () => {
  const engine = new Engine(),
    gate = deferred();
  engine.opening = gate.promise;
  const reader = new ReaderController(() => engine);
  const loading = reader.load("book");
  await reader.configure({ styles: { fontSize: 24 } });
  gate.resolve();
  await loading;
  assert.equal(engine.configuration.styles?.fontSize, 24);
  reader.dispose();
});
test("feature switches govern commands and selection forwarding", async () => {
  const engine = new Engine(),
    reader = new ReaderController(() => engine);
  let selections = 0;
  reader.onSelection(() => selections++);
  await reader.configure({
    features: {
      navigation: false,
      search: false,
      outline: false,
      highlight: false,
    },
  });
  await reader.load("book");
  await reader.next();
  await reader.prev();
  await reader.display();
  assert.deepEqual(await reader.search("a"), []);
  assert.deepEqual(await reader.getOutline(), []);
  assert.equal(await reader.annotate("highlight", "cfi"), "");
  const event: ReaderEvent = {
    type: "selection",
    selection: {
      format: "epub",
      position: { format: "epub", cfiRange: "cfi" },
    },
  };
  engine.events.forEach((listener) => listener(event));
  assert.equal(selections, 0);
  assert.deepEqual(engine.calls, []);
  await reader.configure({});
  engine.events.forEach((listener) => listener(event));
  assert.equal(selections, 1);
  await reader.next();
  assert.deepEqual(engine.calls, ["next"]);
  reader.dispose();
});
test("commands reject when not ready and expose recoverable engine errors", async () => {
  const engine = new Engine(),
    reader = new ReaderController(() => engine);
  await assert.rejects(
    reader.next(),
    (error: ReaderFailure) => error.detail.code === "NOT_READY",
  );
  await reader.load("book");
  engine.next = async () => {
    throw new Error("Failed navigation");
  };
  await assert.rejects(reader.next());
  assert.equal(reader.getState().error?.code, "COMMAND_FAILED");
  await reader.prev();
  assert.equal(reader.getState().error, null);
  reader.dispose();
});
test("annotation reconciliation uses native type and ignores foreign formats", () => {
  const base = { id: "a", position: { format: "epub", cfiRange: "cfi" } };
  assert.equal(
    desiredAnnotations([
      base,
      { ...base, id: "note", type: "note" },
      { id: "pdf", position: { format: "pdf" } },
    ]).size,
    1,
  );
  assert.equal(desiredAnnotations([base], false).size, 0);
});
test("base64 encoding matches binary data including padding", () => {
  for (const size of [0, 1, 2, 3, 4, 255, 1024]) {
    const bytes = Uint8Array.from({ length: size }, (_, i) => i % 256);
    assert.equal(
      bufferToBase64(bytes.buffer),
      Buffer.from(bytes).toString("base64"),
    );
  }
});
function bridge(timeout = 100) {
  const sent: BridgeRequest[] = [];
  let client: WebViewBridgeClient;
  client = new WebViewBridgeClient(
    (script) => {
      // Evaluate only the generated command against an isolated transport object.
      Function(
        "window",
        script,
      )({
        __EPUB_READER_RECEIVE__: (raw: string) => sent.push(JSON.parse(raw)),
      });
    },
    "boot",
    timeout,
  );
  return { client, sent };
}
function response(request: BridgeRequest, result: unknown) {
  return JSON.stringify({ ...request, type: "response", result });
}
test("bridge correlates out-of-order replies and safely transports arbitrary text", async () => {
  const { client, sent } = bridge();
  const hostile = '</script>";globalThis.injected=true;//\u2028';
  const first = client.request("search", [hostile]),
    second = client.request("getOutline");
  assert.equal(sent[0].args[0], hostile);
  client.receive(response(sent[1], ["second"]));
  client.receive(response(sent[0], ["first"]));
  assert.deepEqual(await first, ["first"]);
  assert.deepEqual(await second, ["second"]);
  assert.equal((globalThis as any).injected, undefined);
  client.dispose();
});
test("bridge ignores malformed, foreign-session, old-boot, and unknown replies", async () => {
  const { client, sent } = bridge();
  const pending = client.request("getLocation");
  for (const raw of [
    "{",
    JSON.stringify({ protocol: READER_PROTOCOL }),
    response({ ...sent[0], session: "foreign" }, "wrong"),
    response({ ...sent[0], bootId: "old" }, "wrong"),
    response({ ...sent[0], id: "unknown" }, "wrong"),
  ])
    client.receive(raw);
  client.receive(response(sent[0], { page: 2 }));
  assert.deepEqual(await pending, { page: 2 });
  client.dispose();
});
test("bridge propagates structured remote errors", async () => {
  const { client, sent } = bridge();
  const request = client.request("open");
  client.receive(
    JSON.stringify({
      ...sent[0],
      type: "response",
      error: { code: "LOAD_FAILED", message: "Missing book", retryable: true },
    }),
  );
  await assert.rejects(
    request,
    (error: ReaderFailure) => error.detail.code === "LOAD_FAILED",
  );
  client.dispose();
});
test("bridge timeouts and disposal reject all pending callers", async () => {
  const { client } = bridge(10);
  await assert.rejects(
    client.request("next"),
    (error: ReaderFailure) => error.detail.code === "BRIDGE_TIMEOUT",
  );
  const pending = client.request("search", ["text"]);
  client.dispose();
  await assert.rejects(
    pending,
    (error: ReaderFailure) => error.detail.code === "DISCONNECTED",
  );
  await assert.rejects(client.request("next"));
});
