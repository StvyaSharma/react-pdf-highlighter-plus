import { ReaderController } from "../src/reader/ReaderController";
import {
  WebViewBridgeClient,
  WebViewReaderEngine,
} from "../src/reader/WebViewReaderEngine";
import { readyBootId } from "../src/reader/protocol";
import type { ReaderSelection } from "../src/reader/types";
import fixtureUrl from "./fixtures/reader.epub?url";
import hostHtml from "../dist/webview/reader.html?raw";

const output = document.getElementById("results")!;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
async function until(check: () => unknown) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await wait(20);
  }
  throw new Error("Timed out waiting for EPUB content");
}
export async function runWebViewValidation() {
  const results: Array<{ feature: string; passed: boolean; error?: string }> =
    [];
  const test = async (feature: string, run: () => Promise<void> | void) => {
    try {
      await run();
      results.push({ feature, passed: true });
    } catch (error) {
      results.push({ feature, passed: false, error: String(error) });
    }
    output.textContent = results
      .map(
        (r) =>
          `${r.passed ? "PASS" : "FAIL"} ${r.feature}${r.error ? ": " + r.error : ""}`,
      )
      .join("\n");
  };
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "width:900px;height:550px;border:0";
  document.getElementById("test-host")!.appendChild(iframe);
  let bridge: WebViewBridgeClient | null = null,
    boot: string | null = null;
  const off = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow || typeof event.data !== "string")
      return;
    const ready = readyBootId(event.data);
    if (ready) boot = ready;
    else bridge?.receive(event.data);
  };
  window.addEventListener("message", off);
  const errors: string[] = [];
  const error = (event: ErrorEvent) => errors.push(event.message);
  window.addEventListener("error", error);
  const html = hostHtml;
  // This is the exact production host. Only its platform postMessage transport
  // is supplied by the test, just as react-native-webview supplies it on mobile.
  iframe.srcdoc = html.replace(
    "<script>",
    "<script>window.ReactNativeWebView={postMessage:function(data){parent.postMessage(data,'*')}};</script><script>",
  );
  await until(() => boot);
  bridge = new WebViewBridgeClient(
    (script) =>
      (iframe.contentWindow as Window & { eval(script: string): unknown }).eval(
        script,
      ),
    boot!,
    5000,
  );
  const reader = new ReaderController(() => new WebViewReaderEngine(bridge!));
  const content = () =>
    iframe.contentDocument!.querySelector("iframe")!.contentDocument!;
  const marks = () =>
    iframe.contentDocument!.querySelectorAll("svg .epub-highlight").length;
  const buffer = await (await fetch(fixtureUrl)).arrayBuffer();
  let matches: Array<{ cfi?: string }> = [];
  try {
    await test("Bundled host loads a binary EPUB over the native message protocol", async () => {
      await reader.load(buffer);
      assert(
        reader.getState().status === "ready",
        JSON.stringify(reader.getState()),
      );
      assert(
        content().body.textContent?.includes("chapter 1"),
        "No book rendered",
      );
    });
    await test("Remote outline and full-book search", async () => {
      assert((await reader.getOutline()).length === 3, "Outline mismatch");
      matches = await reader.search("lighthouse");
      assert(matches.length === 6, "Search mismatch");
    });
    await test("Remote navigation and location events", async () => {
      await reader.display(2);
      assert(
        (await reader.getLocation())?.cfi?.includes("/6/6"),
        "Awaited navigation reported stale location",
      );
      assert(
        reader.getState().location?.cfi?.includes("/6/6"),
        "Location event was stale after navigation",
      );
      await reader.prev();
      await reader.next();
      assert(
        content().body.textContent?.includes("chapter 3"),
        "Navigation failed",
      );
      await reader.display(0);
    });
    await test("Typography and custom CSS cross the bridge and clear correctly", async () => {
      await reader.configure({
        styles: {
          fontSize: 24,
          fontFamily: "Georgia",
          color: "purple",
          background: "beige",
        },
        customCss: "p {text-align:right}",
      });
      const d = content();
      assert(
        d.defaultView!.getComputedStyle(d.body).fontSize === "24px" &&
          d.defaultView!.getComputedStyle(d.querySelector("p")!).textAlign ===
            "right",
        "Remote styles missing",
      );
      await reader.configure({});
      assert(
        content().defaultView!.getComputedStyle(content().body).fontSize !==
          "24px",
        "Style not cleared",
      );
    });
    await test("Controlled highlights reconcile across bridge updates", async () => {
      const one = {
        id: "a",
        position: { format: "epub", cfiRange: matches[0].cfi },
      };
      await reader.configure({ highlights: [one] });
      assert(marks() === 1, "Highlight missing");
      await reader.configure({
        highlights: [
          { ...one, position: { ...one.position, cfiRange: matches[1].cfi } },
        ],
      });
      assert(marks() === 1, "Update duplicated mark");
      await reader.configure({});
      assert(marks() === 0, "Removal failed");
    });
    await test("Imperative highlight, underline, mark, and note rendering", async () => {
      for (const type of ["highlight", "underline", "mark", "note"]) {
        await reader.annotate(type, matches[0].cfi!);
        const selector =
          type === "mark" ? '[ref="epubjs-mk"]' : `svg .epub-${type}`;
        assert(
          iframe.contentDocument!.querySelector(selector),
          `Missing ${type}`,
        );
        await reader.removeAnnotation(matches[0].cfi!, type);
        assert(
          !iframe.contentDocument!.querySelector(selector),
          `Removal failed: ${type}`,
        );
      }
    });
    await test("Native selection produces serializable text and clearSelection works", async () => {
      let selection: ReaderSelection | undefined;
      const off = reader.onSelection((value) => {
        selection = value;
      });
      const d = content(),
        range = d.createRange(),
        text = d.getElementById("quote")!.firstChild!;
      range.setStart(text, 10);
      range.setEnd(text, 20);
      d.defaultView!.getSelection()!.addRange(range);
      d.dispatchEvent(new Event("selectionchange"));
      await until(() => selection);
      assert(
        selection?.content?.text === "lighthouse" && !("hide" in selection),
        JSON.stringify(selection),
      );
      await reader.clearSelection();
      assert(
        d.defaultView!.getSelection()!.rangeCount === 0,
        "Selection not cleared",
      );
      off();
    });
    await test("Explicit native selection capture works without a DOM event", async () => {
      let selected: ReaderSelection | undefined;
      const off = reader.onSelection((value) => {
        selected = value;
      });
      const d = content(),
        range = d.createRange(),
        text = d.getElementById("quote")!.firstChild!;
      range.setStart(text, 4);
      range.setEnd(text, 9);
      d.defaultView!.getSelection()!.addRange(range);
      assert(await reader.captureSelection(), "No selection captured");
      await until(() => selected);
      assert(selected?.content?.text === "amber", "Wrong captured text");
      await reader.clearSelection();
      assert(
        !(await reader.captureSelection()),
        "Collapsed selection captured",
      );
      off();
    });
    await test("Feature switches govern the WebView engine", async () => {
      await reader.configure({
        features: {
          navigation: false,
          search: false,
          outline: false,
          highlight: false,
        },
      });
      await reader.display(2);
      assert(
        content().body.textContent?.includes("chapter 1"),
        "Disabled navigation ran",
      );
      assert(
        (await reader.search("lighthouse")).length === 0 &&
          (await reader.getOutline()).length === 0,
        "Disabled search/outline ran",
      );
      assert(
        (await reader.annotate("highlight", matches[0].cfi!)) === "",
        "Disabled annotation ran",
      );
      await reader.configure({});
    });
    await test("Command errors are structured and subsequent commands recover", async () => {
      let rejected = false;
      try {
        await reader.annotate("unsupported", matches[0].cfi!);
      } catch {
        rejected = true;
      }
      assert(
        rejected && reader.getState().error?.code === "COMMAND_FAILED",
        "Remote failure not surfaced",
      );
      await reader.getOutline();
      assert(reader.getState().error === null, "Command recovery failed");
    });
    await test("Load errors stay separate from presentation and retry is available", async () => {
      await reader.load({ base64: "invalid" });
      assert(
        reader.getState().status === "error" &&
          reader.getState().error?.code === "LOAD_FAILED",
        "Error state missing",
      );
      assert(
        !iframe.contentDocument!.querySelector('[role="alert"]'),
        "Engine rendered error UI",
      );
      await reader.retry();
      assert(
        reader.getState().status === "error",
        "Retry lost original source",
      );
      await reader.load(buffer);
      assert(reader.getState().status === "ready", "Recovery failed");
    });
    await test("Queued source replacement leaves exactly one rendition", async () => {
      await Promise.all([reader.load(buffer), reader.load(buffer)]);
      assert(
        reader.getState().status === "ready" &&
          iframe.contentDocument!.querySelectorAll("iframe").length === 1,
        "Stale rendition remains",
      );
    });
    await test("Host rejects unknown command names without poisoning its queue", async () => {
      let rejected = false;
      try {
        await bridge!.request("notACommand" as never);
      } catch {
        rejected = true;
      }
      assert(rejected, "Unknown command accepted");
      assert(
        (await reader.getOutline()).length === 3,
        "Queue stopped after failure",
      );
    });
    await test("Bundled host makes no CDN requests and reports no browser errors", () => {
      const remote = iframe
        .contentWindow!.performance.getEntriesByType("resource")
        .filter((entry) => /^https?:/.test(entry.name));
      assert(remote.length === 0, JSON.stringify(remote));
      assert(errors.length === 0, errors.join("\n"));
    });
  } finally {
    reader.dispose();
    bridge.dispose();
    window.removeEventListener("message", off);
    window.removeEventListener("error", error);
    iframe.remove();
  }
  const report = {
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
  (window as any).webViewValidationReport = report;
  return report;
}
(window as any).runWebViewValidation = runWebViewValidation;
document.getElementById("run")!.addEventListener("click", () => {
  void runWebViewValidation();
});
